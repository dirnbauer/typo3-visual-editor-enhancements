<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Form\Exception\AccessDeniedException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException;
use TYPO3\CMS\Backend\Form\FormDataCompiler;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaDatabaseRecord;
use TYPO3\CMS\Backend\Routing\UriBuilder;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Database\Query\Restriction\WorkspaceRestriction;
use TYPO3\CMS\Core\Locking\Exception\LockAcquireWouldBlockException;
use TYPO3\CMS\Core\Locking\LockFactory;
use TYPO3\CMS\Core\Locking\LockingStrategyInterface;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\DataHandling\InlineDataHandler;
use Webconsulting\VisualEditorEnhancements\Service\Intent\CreateOperation;
use Webconsulting\VisualEditorEnhancements\Service\Intent\DeleteOperation;
use Webconsulting\VisualEditorEnhancements\Service\Intent\IntentRefused;
use Webconsulting\VisualEditorEnhancements\Service\Intent\MoveOperation;
use Webconsulting\VisualEditorEnhancements\Service\Intent\OperationInterface;

/**
 * Generic foreign_field relations, with FormEngine identities and server-owned commands.
 */
final readonly class InlineRecordService
{
    /** Relation options this endpoint does not reproduce; FormEngine stays the editor for them. */
    private const UNSUPPORTED_OPTIONS = ['MM', 'foreign_selector', 'foreign_unique', 'foreign_types', 'foreign_default_sortby', 'symmetric_field', 'symmetric_label', 'symmetric_sortby', 'foreign_record_defaults', 'overrideChildTca'];

    /** @var array<string, OperationInterface> */
    private array $operations;

    public function __construct(
        private EditorRecordContext $contexts,
        private InlineRecordConfiguration $configuration,
        private BackendUserProvider $users,
        private ConnectionPool $connections,
        private LockFactory $locks,
        private UriBuilder $uris,
        private FormDataCompiler $compiler,
        CreateOperation $create,
        DeleteOperation $delete,
        MoveOperation $move,
    ) {
        $this->operations = ['create' => $create, 'delete' => $delete, 'move' => $move];
    }

    public function backendUrl(string $table, int $uid, bool $contextual = false): string
    {
        return (string)$this->uris->buildUriFromRoute($contextual ? 'record_edit_contextual' : 'record_edit', ['edit' => [$table => [$uid => 'edit']]], UriBuilder::ABSOLUTE_URL);
    }

    /**
     * The record-free part of the relation check, shared with CollectionFieldIndex:
     * 'unsupported' for relations FormEngine must edit, 'disabled' when page TSconfig
     * switches the child table off, '' otherwise.
     *
     * @param array<string, mixed> $config   resolved inline column config
     * @param array<string, mixed> $settings tx_visualeditorenhancements.inlineRecords. of the page
     */
    public static function relationReason(array $config, array $settings): string
    {
        $childTable = (string)($config['foreign_table'] ?? '');
        if (in_array($childTable, ['tt_content', 'pages', 'sys_file_reference'], true) || str_starts_with($childTable, 'sys_') || str_starts_with($childTable, 'be_') || str_starts_with($childTable, 'fe_')
            || empty($config['foreign_field']) || !isset($GLOBALS['TCA'][$childTable])
            || array_intersect(array_keys($config), self::UNSUPPORTED_OPTIONS) !== []
            || !empty($GLOBALS['TCA'][$childTable]['ctrl']['type'])
        ) {
            return 'unsupported';
        }
        if (!($settings['tables.'][$childTable . '.']['enabled'] ?? true)) {
            return 'disabled';
        }
        return '';
    }

    /**
     * @param array<string, mixed> $form
     * @return list<array<string, mixed>>
     */
    public function fields(string $table, array $form, ServerRequestInterface $request): array
    {
        if (!$this->configuration->enabled((int)$form['scopePageId'])) {
            return [];
        }
        return $this->contexts->scoped(function () use ($table, $form, $request): array {
            $fields = [];
            foreach ($form['processedTca']['columns'] as $name => $column) {
                if (($column['config']['type'] ?? '') !== 'inline'
                    || !$this->contexts->mayEditField($table, $name, $form)
                    || ($column['config']['readOnly'] ?? false)
                    || ($form['pageTsConfig']['TCEFORM.'][$table . '.'][$name . '.']['disabled'] ?? false)
                ) {
                    continue;
                }
                $childTable = (string)($column['config']['foreign_table'] ?? '');
                // Do not disclose counts or labels of tables this user cannot edit.
                if (!$this->users->mayModifyTable($childTable)) {
                    continue;
                }
                $fields[] = $this->collection($table, $name, $column, $form, $request);
            }
            return $fields;
        });
    }

    /**
     * @param array<string, mixed> $column
     * @param array<string, mixed> $form
     * @return array<string, mixed>
     */
    private function collection(string $table, string $field, array $column, array $form, ServerRequestInterface $request): array
    {
        $config = $column['config'];
        $childTable = (string)($config['foreign_table'] ?? '');
        $controls = self::controls($config);
        $context = $this->context($table, $form);
        $reason = $this->unsupported($table, $field, $config, $form);
        if ($reason === '' && !$this->relatedParentsEditable($table, $form, $request)) {
            $reason = 'rights';
        }
        $hiddenField = (string)($GLOBALS['TCA'][$childTable]['ctrl']['enablecolumns']['disabled'] ?? '');
        $labelField = self::labelField($childTable);
        $parentLanguages = $context['translationMode'] === 'default' ? array_keys($this->parentTranslationLanguages($table, $form)) : [];
        $uids = $reason === 'unsupported' ? [] : array_values(array_filter(array_map('intval', GeneralUtility::trimExplode(',', (string)($form['databaseRow'][$field] ?? ''), true))));
        $children = [];
        $formUids = [];
        $liveChildInWorkspace = false;
        foreach ($uids as $uid) {
            try {
                $overlaid = BackendUtility::getRecordWSOL($childTable, $uid);
                if ($overlaid && (int)($overlaid['t3ver_state'] ?? 0) === 2) {
                    $placeholder = $this->placeholder($table, $form, $config, $overlaid, $hiddenField);
                    if ($placeholder === null) {
                        return $this->unavailable($field, $column, $table, $form);
                    }
                    $children[] = $placeholder;
                    continue;
                }
                $child = $this->contexts->compile($childTable, $uid, $request);
                $row = BackendUtility::getRecord($childTable, (int)$child['compileUid']);
                if (!$row || !$this->belongs($table, $form, $config, $row)) {
                    return $this->unavailable($field, $column, $table, $form);
                }
                if ($form['workspaceId'] && (int)($row['t3ver_wsid'] ?? 0) !== (int)$form['workspaceId']) {
                    if ((int)($row['t3ver_wsid'] ?? 0) !== 0) {
                        return $this->unavailable($field, $column, $table, $form, 'workspace');
                    }
                    // Listed, so staged visibility/title edits work (Core versions the
                    // child alone); structural writes would touch this live row.
                    $liveChildInWorkspace = true;
                }
                $translations = $this->translationsOf($childTable, $row);
                // A control disabled in TCA always reports 'controls', whatever else applies.
                $deleteReason = $controls['delete'] ? ($reason ?: $this->deleteReason($childTable, $row, $translations)) : 'controls';
                $uid = (int)$child['compileUid'];
                $formUids[] = $uid;
                $new = (int)($row['t3ver_state'] ?? 0) === 1;
                $hideReason = $this->writeReason($childTable, $hiddenField, 'hidden', $row, $controls['hide'], $reason);
                $labelReason = $this->writeReason($childTable, $labelField, 'label', $row, true, $reason);
                $children[] = [
                    'uid' => $uid, 'table' => $childTable,
                    'liveUid' => (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']),
                    'state' => $new ? 'new' : ((int)($row['t3ver_wsid'] ?? 0) > 0 ? 'modified' : 'live'),
                    'label' => BackendUtility::getRecordTitle($childTable, $row),
                    'backendUrl' => $this->backendUrl($childTable, $uid),
                    'contextualUrl' => $this->backendUrl($childTable, $uid, true),
                    'hidden' => $hiddenField !== '' && !empty($row[$hiddenField]),
                    'hiddenField' => $hiddenField,
                    'canHide' => $hideReason === '', 'hideReason' => $hideReason,
                    'canEditLabel' => $labelReason === '', 'labelReason' => $labelReason, 'labelValue' => $labelField !== '' ? (string)($row[$labelField] ?? '') : '',
                    'translationOnly' => $context['translationMode'] === 'connected' && $this->isTranslationOnly($childTable, $row),
                    'untranslated' => array_values(array_diff($parentLanguages, $this->languagesOf($childTable, $translations))),
                    'canDelete' => $deleteReason === '',
                    'deleteReason' => $deleteReason,
                    'verb' => $new ? 'discard' : ($form['workspaceId'] ? 'markForDeletion' : 'delete'),
                    'deleteUid' => $new ? (int)$row['uid'] : (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']),
                ];
            } catch (AccessDeniedException|DatabaseRecordException) {
                // One inaccessible child makes the entire list private, including its count.
                return $this->unavailable($field, $column, $table, $form);
            }
        }
        $uids = $formUids;
        $min = (int)($config['minitems'] ?? 0);
        if ($reason === '' && $liveChildInWorkspace) {
            $reason = 'workspace';
        }
        foreach ($children as &$entry) {
            if ($entry['state'] !== 'deleted' && $entry['canDelete'] && ($reason !== '' || count($uids) <= $min)) {
                $entry['canDelete'] = false;
                $entry['deleteReason'] = $reason ?: 'min';
            }
        }
        unset($entry);
        $context['workspace']['firstVersion'] = $context['workspace']['firstVersion'] || $liveChildInWorkspace;
        $sortReason = $reason ?: self::sortReason($childTable, $config, $controls);
        foreach ($children as &$entry) {
            // Members only: a listed delete placeholder is not part of $uids.
            $index = $entry['state'] === 'deleted' ? false : array_search($entry['uid'], $uids, true);
            $entry['canMoveUp'] = $sortReason === '' && $index !== false && $index > 0;
            $entry['canMoveDown'] = $sortReason === '' && $index !== false && $index < count($uids) - 1;
        }
        unset($entry);
        $createReason = $reason;
        $defaults = [];
        $requiredBackend = [];
        if ($createReason === '') {
            try {
                [$defaults, $createReason, $requiredBackend] = $this->defaults($childTable, $form, $request);
            } catch (AccessDeniedException) {
                $createReason = 'rights';
            }
        }
        $max = (int)($config['maxitems'] ?? 0);
        if ($createReason === '' && $max > 0 && count($uids) >= $max) {
            $createReason = 'max';
        }
        if (!$controls['new'] || ($config['appearance']['showNewRecordLink'] ?? true) === false) {
            $createReason = 'controls';
        }
        return [
            'name' => $field, 'label' => $column['label'] ?? $field, 'type' => 'inline',
            'parentTable' => $table, 'parentUid' => (int)$form['requestedUid'],
            'childTitle' => (string)($GLOBALS['TCA'][$childTable]['ctrl']['title'] ?? $childTable),
            'labelField' => $labelField, 'hiddenField' => $hiddenField,
            'typeField' => (string)($GLOBALS['TCA'][$childTable]['ctrl']['type'] ?? ''),
            'controls' => $controls,
            'backendUrl' => $this->backendUrl($table, (int)$form['compileUid']),
            'revision' => hash('sha256', json_encode([$table, $form['compileUid'], $form['workspaceId'], $form['resolvedRow'], $field, $uids], JSON_THROW_ON_ERROR)),
            'workspaceId' => $form['workspaceId'], 'workspace' => $context['workspace'],
            'languageId' => $context['languageId'], 'translationMode' => $context['translationMode'],
            'uids' => $uids, 'children' => $children,
            'minItems' => $min, 'maxItems' => $max,
            'canCreate' => $createReason === '', 'createReason' => $createReason,
            'requiredBackend' => $requiredBackend,
            'canSort' => $sortReason === '', 'sortReason' => $sortReason,
            'createHidden' => $form['workspaceId'] === 0 && (bool)($this->configuration->forPage((int)$form['scopePageId'])['createHidden'] ?? true),
            // Internal only; stripped at the public field boundary.
            '_defaults' => $defaults, '_config' => $config,
        ];
    }

    /**
     * A delete placeholder of this workspace: listed read-only under its live
     * identity. The placeholder version uid never reaches the browser.
     *
     * @param array<string, mixed> $form
     * @param array<string, mixed> $config
     * @param array<string, mixed> $overlaid
     * @return array<string, mixed>|null null when the entry is not this relation's or not accessible
     */
    private function placeholder(string $table, array $form, array $config, array $overlaid, string $hiddenField): ?array
    {
        $childTable = (string)$config['foreign_table'];
        $liveUid = (int)(($overlaid['t3ver_oid'] ?? 0) ?: $overlaid['uid']);
        $live = BackendUtility::getRecord($childTable, $liveUid);
        if (!$live || !$this->belongs($table, $form, $config, $live)
            || !$this->users->getOrThrow()->checkRecordEditAccess($childTable, $live)->isAllowed) {
            return null;
        }
        return [
            'uid' => $liveUid, 'table' => $childTable, 'liveUid' => $liveUid, 'state' => 'deleted',
            'label' => BackendUtility::getRecordTitle($childTable, $live),
            'hidden' => $hiddenField !== '' && !empty($live[$hiddenField]), 'hiddenField' => $hiddenField,
            'canHide' => false, 'hideReason' => 'deleted', 'canEditLabel' => false, 'labelReason' => 'deleted', 'labelValue' => '',
            'translationOnly' => false, 'untranslated' => [],
            'canDelete' => false, 'deleteReason' => 'deleted', 'verb' => '',
        ];
    }

    /**
     * @param array<string, mixed> $column
     * @param array<string, mixed> $form
     * @return array<string, mixed>
     */
    private function unavailable(string $field, array $column, string $table, array $form, string $reason = 'rights'): array
    {
        $context = $this->context($table, $form);
        return ['name' => $field, 'label' => $column['label'] ?? $field, 'type' => 'inline',
            'canCreate' => false, 'createReason' => $reason, 'children' => [],
            'workspaceId' => $form['workspaceId'], 'workspace' => $context['workspace'],
            'languageId' => $context['languageId'], 'translationMode' => $context['translationMode'],
            'backendUrl' => $this->backendUrl($table, (int)$form['compileUid'])];
    }

    /**
     * Core's appearance.enabledControls with FormEngine's defaults (TcaInlineConfiguration).
     *
     * @param array<string, mixed> $config
     * @return array{new: bool, delete: bool, hide: bool, sort: bool, dragdrop: bool, localize: bool, info: bool}
     */
    public static function controls(array $config): array
    {
        $enabled = is_array($config['appearance']['enabledControls'] ?? null) ? $config['appearance']['enabledControls'] : [];
        $controls = [];
        foreach (['new', 'delete', 'hide', 'sort', 'dragdrop', 'localize', 'info'] as $control) {
            $controls[$control] = (bool)($enabled[$control] ?? true);
        }
        return $controls;
    }

    /**
     * Why the entries cannot be reordered here: 'unsorted' when Core has no
     * sorting column to renumber (no foreign_sortby, no ctrl sortby), 'controls'
     * when the field disables both FormEngine sort controls and drag and drop.
     *
     * @param array<string, mixed> $config
     * @param array<string, bool> $controls
     */
    public static function sortReason(string $childTable, array $config, array $controls): string
    {
        if (empty($config['foreign_sortby']) && empty($GLOBALS['TCA'][$childTable]['ctrl']['sortby'])) {
            return 'unsorted';
        }
        return !$controls['sort'] && !$controls['dragdrop'] ? 'controls' : '';
    }

    /**
     * The child's primary label column when it is a plain input/text column, the
     * field the inspector stages through the vendor store; '' otherwise (RTE, select, ...).
     */
    public static function labelField(string $childTable): string
    {
        $label = (string)($GLOBALS['TCA'][$childTable]['ctrl']['label'] ?? '');
        $config = $GLOBALS['TCA'][$childTable]['columns'][$label]['config'] ?? [];
        if ($label === '' || !in_array($config['type'] ?? '', ['input', 'text'], true) || !empty($config['enableRichtext'])) {
            return '';
        }
        return $label;
    }

    /**
     * Why a generic (vendor store) save of one child field would not persist:
     * DataHandler silently drops exclude fields without the right, so the control is
     * never offered where the write would vanish.
     *
     * @param array<string, mixed> $row
     */
    private function writeReason(string $childTable, string $fieldName, string $missing, array $row, bool $control, string $collectionReason): string
    {
        if (in_array($collectionReason, ['unsupported', 'disabled'], true)) {
            return $collectionReason;
        }
        if ($fieldName === '') {
            return $missing;
        }
        if (!$control) {
            return 'controls';
        }
        $languageField = (string)($GLOBALS['TCA'][$childTable]['ctrl']['languageField'] ?? '');
        if (($GLOBALS['TCA'][$childTable]['columns'][$fieldName]['l10n_mode'] ?? '') === 'exclude'
            && $languageField !== '' && (int)($row[$languageField] ?? 0) > 0) {
            return 'translation';
        }
        return $this->mayWrite($childTable, $fieldName) ? '' : 'rights';
    }

    /**
     * Live/workspace and language context of the parent record.
     *
     * @param array<string, mixed> $form
     * @return array{workspace: array{id: int, title: string, firstVersion: bool}, languageId: int, translationMode: 'default'|'connected'|'free'}
     */
    private function context(string $table, array $form): array
    {
        $workspaceId = (int)$form['workspaceId'];
        $languageField = (string)($form['processedTca']['ctrl']['languageField'] ?? '');
        $pointer = (string)($form['processedTca']['ctrl']['transOrigPointerField'] ?? '');
        $languageId = $languageField !== '' ? (int)($form['resolvedRow'][$languageField] ?? 0) : 0;
        $mode = 'default';
        if ($languageId > 0) {
            $mode = $pointer !== '' && (int)($form['resolvedRow'][$pointer] ?? 0) > 0 ? 'connected' : 'free';
        }
        return [
            'workspace' => [
                'id' => $workspaceId,
                'title' => $this->users->workspaceTitle($workspaceId),
                // The next structural action would create the parent's first draft here.
                'firstVersion' => $workspaceId > 0 && (int)($form['resolvedRow']['t3ver_wsid'] ?? 0) !== $workspaceId,
            ],
            'languageId' => $languageId,
            'translationMode' => $mode,
        ];
    }

    /**
     * @param array<string, mixed> $config
     * @param array<string, mixed> $form
     */
    private function unsupported(string $table, string $field, array $config, array $form): string
    {
        $childTable = (string)($config['foreign_table'] ?? '');
        $settings = $this->configuration->forPage((int)$form['scopePageId']);
        $reason = self::relationReason($config, $settings);
        if ($reason !== '') {
            return $reason;
        }
        if (($settings['requireWorkspace'] ?? false) && !$form['workspaceId']) {
            return 'workspace';
        }
        if ($form['workspaceId'] && (empty($GLOBALS['TCA'][$table]['ctrl']['versioningWS']) || empty($GLOBALS['TCA'][$childTable]['ctrl']['versioningWS']) || (int)($form['resolvedRow']['t3ver_wsid'] ?? 0) !== (int)$form['workspaceId'])) {
            return 'workspace';
        }
        $pointer = $form['processedTca']['ctrl']['transOrigPointerField'] ?? '';
        if ($pointer !== '' && (int)($form['resolvedRow'][$pointer] ?? 0) > 0) {
            return 'translation';
        }
        if (($form['processedTca']['columns'][$field]['l10n_mode'] ?? '') === 'exclude'
            && (int)($form['resolvedRow'][$form['processedTca']['ctrl']['languageField'] ?? ''] ?? 0) > 0) {
            return 'translation';
        }
        return '';
    }

    /**
     * @param array<string, mixed> $form
     * @param array<string, mixed> $config
     * @param array<string, mixed> $row
     */
    private function belongs(string $table, array $form, array $config, array $row): bool
    {
        $parent = $form['resolvedRow'];
        $live = (int)(($parent['t3ver_oid'] ?? 0) ?: $parent['uid']);
        if ((int)($row[$config['foreign_field']] ?? 0) !== $live) {
            return false;
        }
        if (!empty($config['foreign_table_field']) && ($row[$config['foreign_table_field']] ?? '') !== $table) {
            return false;
        }
        foreach ($config['foreign_match_fields'] ?? [] as $key => $value) {
            if ((string)($row[$key] ?? '') !== (string)$value) {
                return false;
            }
        }
        return true;
    }

    /**
     * Active translations of a record as Core's deleteL10nOverlayRecords selects them:
     * not deleted, live or of the current workspace, overlaid, delete placeholders skipped.
     *
     * @param array<string, mixed> $row
     * @return list<array<string, mixed>>
     */
    private function translationsOf(string $table, array $row): array
    {
        $pointer = (string)($GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '');
        if ($pointer === '') {
            return [];
        }
        $workspace = $this->users->getOrThrow()->workspace;
        $live = (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']);
        $query = $this->connections->getQueryBuilderForTable($table);
        $query->getRestrictions()->removeAll()
            ->add(GeneralUtility::makeInstance(DeletedRestriction::class))
            ->add(GeneralUtility::makeInstance(WorkspaceRestriction::class, $workspace));
        $rows = $query->select('*')->from($table)->where(
            $query->expr()->eq($pointer, $query->createNamedParameter($live, \TYPO3\CMS\Core\Database\Connection::PARAM_INT)),
        )->executeQuery()->fetchAllAssociative();
        $active = [];
        foreach ($rows as $translation) {
            BackendUtility::workspaceOL($table, $translation, $workspace);
            if (is_array($translation) && (int)($translation['t3ver_state'] ?? 0) !== 2) {
                $active[] = $translation;
            }
        }
        return $active;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<int>
     */
    private function languagesOf(string $table, array $rows): array
    {
        $languageField = (string)($GLOBALS['TCA'][$table]['ctrl']['languageField'] ?? '');
        if ($languageField === '') {
            return [];
        }
        return array_values(array_unique(array_map(static fn(array $row): int => (int)($row[$languageField] ?? 0), $rows)));
    }

    /**
     * Languages with an active connected translation of the parent.
     *
     * @param array<string, mixed> $form
     * @return array<int, array<string, mixed>> language id => translated parent row (overlaid)
     */
    private function parentTranslationLanguages(string $table, array $form): array
    {
        $languages = [];
        $languageField = (string)($form['processedTca']['ctrl']['languageField'] ?? '');
        foreach ($this->translationsOf($table, $form['resolvedRow']) as $translation) {
            $languages[(int)($translation[$languageField] ?? 0)] ??= $translation;
        }
        unset($languages[0]);
        ksort($languages);
        return $languages;
    }

    /** @param array<string, mixed> $row */
    private function isTranslationOnly(string $table, array $row): bool
    {
        $pointer = (string)($GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '');
        return $pointer !== '' && (int)($row[$pointer] ?? 0) === 0;
    }

    /**
     * @param array<string, mixed> $row
     * @param list<array<string, mixed>> $translations
     */
    private function deleteReason(string $table, array $row, array $translations): string
    {
        // Cascade deletion can touch other languages and nested records. Until those
        // dependencies have their own permission proof, leave it to the backend form.
        if ($translations !== []) {
            return 'translations';
        }
        foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $name => $column) {
            if (in_array($column['config']['type'] ?? '', ['inline', 'file'], true) && !empty($row[$name])) {
                return 'cascade';
            }
        }
        return $this->users->getOrThrow()->checkRecordEditAccess($table, $row, false, true)->isAllowed ? '' : 'rights';
    }

    /**
     * @param array<string, mixed> $parent
     * @return array{array<string, mixed>, string, list<string>}
     */
    private function defaults(string $table, array $parent, ServerRequestInterface $request): array
    {
        $pid = (int)$parent['scopePageId'];
        $new = $this->compiler->compile([
            'request' => $request, 'tableName' => $table, 'vanillaUid' => $pid, 'command' => 'new',
            'inlineResolveExistingChildren' => false, 'inlineCompileExistingChildren' => false,
        ], GeneralUtility::makeInstance(TcaDatabaseRecord::class));
        $defaults = ['pid' => $pid];
        $required = [];
        $label = $new['processedTca']['ctrl']['label'] ?? '';
        foreach ($new['processedTca']['columns'] as $name => $column) {
            $config = $column['config'];
            if (!in_array($config['type'], ['input', 'text', 'number', 'check', 'select', 'color', 'link', 'datetime', 'language'], true)) {
                if (!empty($config['required']) || (int)($config['minitems'] ?? 0) > 0) {
                    $required[] = (string)$name;
                }
                continue;
            }
            $value = $new['databaseRow'][$name] ?? $config['default'] ?? '';
            if (is_array($value)) {
                $value = count($value) <= 1 ? ($value[0] ?? '') : '';
            }
            if ($name === $label && in_array($config['type'], ['input', 'text'], true) && trim((string)$value) === '') {
                $value = (string)($GLOBALS['LANG']->translate('frontend.inlineRecords.newEntry', 'EXT:visual_editor_enhancements/Resources/Private/Language/locallang_library.xlf') ?? 'New entry');
            }
            if (!empty($config['required']) && trim((string)$value) === '') {
                $required[] = (string)$name;
                continue;
            }
            if ($value !== '' && $this->mayWrite($table, $name)) {
                $defaults[$name] = $value;
            } elseif (!empty($config['required'])) {
                return [[], 'rights', []];
            }
        }
        if ($required !== []) {
            return [[], 'required', $required];
        }
        $language = $GLOBALS['TCA'][$table]['ctrl']['languageField'] ?? '';
        if ($language !== '') {
            $defaults[$language] = (int)($parent['resolvedRow'][$parent['processedTca']['ctrl']['languageField'] ?? ''] ?? 0);
            if (!$this->users->getOrThrow()->checkLanguageAccess($defaults[$language])) {
                return [[], 'language', []];
            }
        }
        $visibility = $GLOBALS['TCA'][$table]['ctrl']['enablecolumns']['disabled'] ?? '';
        if (!$parent['workspaceId'] && ($this->configuration->forPage($pid)['createHidden'] ?? true)) {
            if ($visibility === '' || !$this->mayWrite($table, $visibility)) {
                return [[], 'hidden', []];
            }
            $defaults[$visibility] = 1;
        }
        return [$defaults, '', []];
    }

    /** @param array<string, mixed> $form */
    private function relatedParentsEditable(string $table, array $form, ServerRequestInterface $request): bool
    {
        $pointer = $form['processedTca']['ctrl']['transOrigPointerField'] ?? '';
        if ($pointer === '' || $this->users->getOrThrow()->isAdmin()) {
            return true;
        }
        foreach ($this->translationsOf($table, $form['resolvedRow']) as $translation) {
            try {
                $this->contexts->compile($table, (int)$translation['uid'], $request);
            } catch (AccessDeniedException|DatabaseRecordException) {
                return false;
            }
        }
        return true;
    }

    private function mayWrite(string $table, string $field): bool
    {
        $user = $this->users->getOrThrow();
        return empty($GLOBALS['TCA'][$table]['columns'][$field]['config']['readOnly'])
            && ($user->isAdmin() || empty($GLOBALS['TCA'][$table]['columns'][$field]['exclude']) || $user->check('non_exclude_fields', $table . ':' . $field));
    }

    /**
     * @param array<string, mixed> $intent
     * @return array{int, array<string, mixed>}
     */
    public function execute(array $intent, ServerRequestInterface $request): array
    {
        $table = $intent['parentTable'];
        if (!isset($GLOBALS['TCA'][$table])) {
            throw new \InvalidArgumentException('Unknown parent table');
        }
        $operation = $this->operations[$intent['action']] ?? throw new \InvalidArgumentException('Invalid collection action');
        $request = $request->withQueryParams([...$request->getQueryParams(), 'editMode' => 1]);
        $form = $this->contexts->compile($table, $intent['parentUid'], $request);
        $live = (int)(($form['databaseRow']['t3ver_oid'] ?? 0) ?: $form['databaseRow']['uid']);
        // All workspaces share the lock: never serialize by a client-supplied version uid.
        $lock = $this->locks->createLocker('vee-inline:' . $table . ':' . $live . ':' . $intent['field'], LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        try {
            $acquired = $lock->acquire(LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        } catch (LockAcquireWouldBlockException) {
            $acquired = false;
        }
        if (!$acquired) {
            return [409, ['success' => false, 'reason' => 'busy']];
        }
        try {
            $form = $this->contexts->compile($table, $intent['parentUid'], $request);
            $fields = $this->fields($table, $form, $request);
            $field = current(array_filter($fields, static fn(array $field): bool => $field['name'] === $intent['field']));
            if (!$field || empty($field['revision'])) {
                return [403, ['success' => false, 'reason' => 'rights']];
            }
            if (!hash_equals($field['revision'], $intent['revision'])) {
                return [409, ['success' => false, 'reason' => 'stale', 'collection' => self::publicField($field)]];
            }
            try {
                $plan = $operation->apply($field, $form, $intent);
            } catch (IntentRefused $refusal) {
                return [$refusal->status, ['success' => false, 'reason' => $refusal->reason, 'collection' => self::publicField($field)]];
            }
            if (!$plan->write) {
                return [200, ['success' => true, 'uid' => null, ...$plan->result,
                    'workspace' => ['id' => (int)$form['workspaceId'], 'firstVersion' => false],
                    'collections' => array_map(self::publicField(...), $fields)]];
            }
            $childTable = $field['_config']['foreign_table'];
            $connection = $this->connections->getConnectionForTable($table);
            if ($connection !== $this->connections->getConnectionForTable($childTable)) {
                return [409, ['success' => false, 'reason' => 'connection']];
            }
            $firstVersion = $field['workspace']['firstVersion'];
            $liveSnapshot = $form['workspaceId'] ? $this->liveSnapshot($table, $form, $field) : [];
            $connection->beginTransaction();
            try {
                $handler = GeneralUtility::makeInstance(InlineDataHandler::class);
                $handler->start($plan->data, $plan->cmd);
                if ($plan->cmdFirst) {
                    $handler->process_cmdmap();
                    if (!$handler->errorLog) {
                        $handler->process_datamap();
                    }
                } else {
                    $handler->process_datamap();
                    if (!$handler->errorLog) {
                        $handler->process_cmdmap();
                    }
                }
                if ($handler->errorLog) {
                    $connection->rollBack();
                    return [422, ['success' => false, 'errorLog' => $handler->errorLog]];
                }
                if ($form['workspaceId'] && $liveSnapshot !== $this->liveSnapshot($table, $form, $field)) {
                    $connection->rollBack();
                    return [409, ['success' => false, 'reason' => 'workspaceLiveChange']];
                }
                $connection->commit();
            } catch (\Throwable $error) {
                $connection->rollBack();
                throw $error;
            }
            $fresh = $this->contexts->compile($table, $intent['parentUid'], $request);
            $freshFields = $this->fields($table, $fresh, $request);
            $response = ['success' => true, 'uid' => null];
            if ($plan->newId !== null) {
                $uid = (int)($handler->substNEWwithIDs[$plan->newId] ?? 0);
                $response['uid'] = $uid ?: null;
                $response['created'] = ['uid' => $uid ?: null, ...($plan->result['created'] ?? [])];
            }
            $response += array_diff_key($plan->result, ['created' => true]);
            $response['workspace'] = ['id' => (int)$form['workspaceId'], 'firstVersion' => $firstVersion];
            $response['collections'] = array_map(self::publicField(...), $freshFields);
            return [200, $response];
        } finally {
            $lock->release();
        }
    }

    /**
     * @param array<string, mixed> $form
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private function liveSnapshot(string $table, array $form, array $field): array
    {
        $config = $field['_config'];
        $childTable = $config['foreign_table'];
        $parent = $form['resolvedRow'];
        $live = (int)(($parent['t3ver_oid'] ?? 0) ?: $parent['uid']);
        $connection = $this->connections->getConnectionForTable($table);
        $parentRow = $connection->fetchAssociative('SELECT * FROM ' . $connection->quoteIdentifier($table) . ' WHERE uid = ?', [$live]);
        $childConnection = $this->connections->getConnectionForTable($childTable);
        $children = $childConnection->fetchAllAssociative('SELECT * FROM ' . $childConnection->quoteIdentifier($childTable)
            . ' WHERE ' . $childConnection->quoteIdentifier($config['foreign_field']) . ' = ? AND t3ver_wsid = 0 ORDER BY uid', [$live]);
        return ['parent' => $parentRow, 'children' => $children];
    }

    /**
     * The collection as the browser may see it: no internal defaults, relation config
     * or command targets (delete targets can be placeholder version uids).
     *
     * @return array<string, mixed>
     * @param array<string, mixed> $field
     */
    public static function publicField(array $field): array
    {
        unset($field['_defaults'], $field['_config']);
        foreach ($field['children'] as &$child) {
            unset($child['deleteUid']);
        }
        return $field;
    }
}
