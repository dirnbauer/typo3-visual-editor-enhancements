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
use Webconsulting\VisualEditorEnhancements\Service\Intent\SyncOperation;

/**
 * Generic foreign_field relations, with FormEngine identities and server-owned commands.
 */
final readonly class InlineRecordService
{
    /** Relation options this endpoint does not reproduce; FormEngine stays the editor for them. */
    private const UNSUPPORTED_OPTIONS = ['MM', 'foreign_selector', 'foreign_unique', 'foreign_types', 'foreign_default_sortby', 'symmetric_field', 'symmetric_label', 'symmetric_sortby', 'foreign_record_defaults', 'overrideChildTca'];

    /** Core's maxitems when TCA sets none (TcaInlineConfiguration, DataHandler): no limit. */
    private const UNLIMITED_ITEMS = 99999;

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
        private InlineTranslations $translations,
        private LiveSnapshot $snapshots,
        CreateOperation $create,
        DeleteOperation $delete,
        MoveOperation $move,
        SyncOperation $sync,
    ) {
        $this->operations = ['create' => $create, 'delete' => $delete, 'move' => $move, 'sync' => $sync];
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
        $pid = (int)$form['scopePageId'];
        $deleteTranslations = $this->configuration->deleteTranslations($pid);
        $reason = $this->unsupported($table, $field, $config, $form);
        // 1.5 (deleteTranslations = refuse): any inaccessible translated parent keeps
        // the whole collection read-only. Otherwise every action that reaches a
        // translation checks that translation itself (delete cascade, sync).
        if ($reason === '' && $deleteTranslations === 'refuse' && !$this->relatedParentsEditable($table, $form, $request)) {
            $reason = 'rights';
        }
        $hiddenField = (string)($GLOBALS['TCA'][$childTable]['ctrl']['enablecolumns']['disabled'] ?? '');
        $labelField = self::labelField($childTable);
        $parentLanguages = $context['translationMode'] === 'default' ? array_keys($this->translations->parentsByLanguage($table, $form)) : [];
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
                    // child with its own nested members, see stagedWriteNeedsFirstVersion).
                    // Below an existing parent draft a structural write would renumber
                    // this live row directly; below a live parent Core versions it
                    // together with the parent (first version).
                    $liveChildInWorkspace = $liveChildInWorkspace || (int)($form['resolvedRow']['t3ver_wsid'] ?? 0) !== 0;
                }
                $translations = $this->translations->of($childTable, $row);
                // A control disabled in TCA always reports 'controls', whatever else applies.
                $deleteReason = $controls['delete'] ? ($reason ?: $this->deleteReason($childTable, $row, $translations, $deleteTranslations)) : 'controls';
                $uid = (int)$child['compileUid'];
                $formUids[] = $uid;
                $new = (int)($row['t3ver_state'] ?? 0) === 1;
                $hideReason = $this->writeReason($childTable, $hiddenField, 'hidden', $row, $controls['hide'], $reason);
                $labelReason = $this->writeReason($childTable, $labelField, 'label', $row, true, $reason);
                if (($hideReason === '' || $labelReason === '') && $this->stagedWriteNeedsFirstVersion($childTable, $row, $form)) {
                    $hideReason = $hideReason ?: 'firstVersion';
                    $labelReason = $labelReason ?: 'firstVersion';
                }
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
                    'canEditLabel' => $labelReason === '', 'labelReason' => $labelReason, 'labelValue' => $labelField !== '' ? self::labelValue((string)($row[$labelField] ?? '')) : '',
                    'translationOnly' => $context['translationMode'] === 'connected' && $this->isTranslationOnly($childTable, $row),
                    'untranslated' => array_values(array_diff($parentLanguages, $this->translations->languagesOf($childTable, $translations))),
                    'cascade' => ['translations' => count($translations), 'languages' => $this->translations->languagesOf($childTable, $translations)],
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
        $sortReason = $reason ?: self::sortReason($childTable, $config, $controls);
        foreach ($children as &$entry) {
            // Members only: a listed delete placeholder is not part of $uids.
            $index = $entry['state'] === 'deleted' ? false : array_search($entry['uid'], $uids, true);
            $entry['canMoveUp'] = $sortReason === '' && $index !== false && $index > 0;
            $entry['canMoveDown'] = $sortReason === '' && $index !== false && $index < count($uids) - 1;
        }
        unset($entry);
        $sync = ['languages' => [], 'internal' => []];
        if ($context['translationMode'] === 'default' && !in_array($reason, ['unsupported', 'disabled'], true)) {
            $sync = $this->translations->syncPreflight($table, $field, $form, $config, $children, $controls, $this->configuration->syncTranslations($pid), $request);
        }
        $syncReason = '';
        if (!in_array(true, array_column($sync['languages'], 'canSync'), true)) {
            $syncReason = match (true) {
                $context['translationMode'] !== 'default' || $sync['languages'] === [] => 'syncNone',
                (int)$form['workspaceId'] > 0 => 'syncWorkspace',
                default => (string)$sync['languages'][0]['syncReason'],
            };
        }
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
        $max = self::maxItems($config);
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
            'labelField' => $labelField, 'labelMultiline' => self::labelMultiline($childTable), 'hiddenField' => $hiddenField,
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
            'translationLanguages' => $sync['languages'],
            'canSync' => $syncReason === '', 'syncReason' => $syncReason,
            'syncDefaultMode' => $this->configuration->syncDefaultMode($pid),
            // Core hides per record: the eye on one language leaves the others as they are.
            'hiddenPerLanguage' => $context['translationMode'] === 'connected' || $parentLanguages !== [],
            'createHidden' => $form['workspaceId'] === 0 && (bool)($this->configuration->forPage((int)$form['scopePageId'])['createHidden'] ?? true),
            // Internal only; stripped at the public field boundary.
            '_defaults' => $defaults, '_config' => $config, '_sync' => $sync['internal'],
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
            'translationOnly' => false, 'untranslated' => [], 'cascade' => ['translations' => 0, 'languages' => []],
            'canMoveUp' => false, 'canMoveDown' => false,
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

    /** The label column is a plain textarea: its value may hold line breaks. */
    public static function labelMultiline(string $childTable): bool
    {
        $label = self::labelField($childTable);
        return $label !== '' && ($GLOBALS['TCA'][$childTable]['columns'][$label]['config']['type'] ?? '') === 'text';
    }

    /**
     * The label as the vendor's page editable seeds it (TextViewHelper::renderInput,
     * input and plain text alike): a stored <br> is a line break. The inspector's
     * baseline is then byte-identical to the editable's, and a title edit stages
     * exactly what the page editable would stage.
     */
    private static function labelValue(string $stored): string
    {
        return str_replace('<br>', "\n", $stored);
    }

    /**
     * The resolved entry limit, 0 for none. FormEngine resolves a missing maxitems
     * to Core's 99999; that is no limit, so the payload, create and sync agree.
     *
     * @param array<string, mixed> $config resolved inline column config
     */
    public static function maxItems(array $config): int
    {
        $max = (int)($config['maxitems'] ?? 0);
        return $max >= self::UNLIMITED_ITEMS ? 0 : max(0, $max);
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
        if ((($GLOBALS['TCA'][$childTable]['columns'][$fieldName]['l10n_mode'] ?? '') === 'exclude'
            && $languageField !== '' && (int)($row[$languageField] ?? 0) > 0)
            || InlineTranslations::followsOtherLanguage($childTable, $fieldName, $row)) {
            return 'translation';
        }
        return $this->mayWrite($childTable, $fieldName) ? '' : 'rights';
    }

    /**
     * A staged (generic save) write on this live entry in a workspace makes Core
     * version it - and with it its own nested inline/file members, whose live
     * sorting and tstamp RelationHandler::writeForeignField renumbers. That is a
     * first version with live bookkeeping: refused unless the site enabled
     * firstVersion. A leaf entry is versioned alone and stays editable.
     * InlineGenericSaveGuard enforces the same rule on the save itself.
     *
     * @param array<string, mixed> $row  stored child row (live, or its draft)
     * @param array<string, mixed> $form compiled parent
     */
    private function stagedWriteNeedsFirstVersion(string $childTable, array $row, array $form): bool
    {
        $workspace = (int)$form['workspaceId'];
        return $workspace > 0 && (int)($row['t3ver_wsid'] ?? 0) === 0
            && !$this->configuration->firstVersion((int)$form['scopePageId'])
            && $this->snapshots->needsFirstVersion($childTable, (int)$row['uid'], $workspace);
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
        $firstVersion = $workspaceId > 0 && (int)($form['resolvedRow']['t3ver_wsid'] ?? 0) !== $workspaceId;
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
                // The next structural action would create a first draft here: of the
                // parent, or of a translation Core versions along with it (reached via
                // its parent or source pointer, see translatedParentsNeedFirstVersion).
                'firstVersion' => $firstVersion || ($workspaceId > 0 && $this->translatedParentsNeedFirstVersion($table, $form, $workspaceId)),
            ],
            'languageId' => $languageId,
            'translationMode' => $mode,
        ];
    }

    /**
     * Core's DataMapProcessor pushes a change of this record into every connected
     * translation that points at it through its parent or source pointer
     * (transitively: de -> hu translated from de), but only for tables it applies to
     * (an l10n_mode = exclude or allowLanguageSynchronization column). In a
     * workspace that creates such a translation's first draft, whose versioning
     * bookkeeping stamps its live entries. Works for any record: default language
     * or a connected translation that is itself a source.
     *
     * @param array<string, mixed> $form
     */
    private function translatedParentsNeedFirstVersion(string $table, array $form, int $workspaceId): bool
    {
        if (!$this->snapshots->synchronizesTranslations($table)) {
            return false;
        }
        $live = (int)(($form['resolvedRow']['t3ver_oid'] ?? 0) ?: $form['resolvedRow']['uid']);
        $deleted = (string)($GLOBALS['TCA'][$table]['ctrl']['delete'] ?? '');
        foreach ($this->snapshots->dependents($table, $live) as $uid => $row) {
            if (($deleted === '' || empty($row[$deleted])) && $this->snapshots->needsFirstVersion($table, $uid, $workspaceId)) {
                return true;
            }
        }
        return false;
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
        if ($form['workspaceId']) {
            if (empty($GLOBALS['TCA'][$table]['ctrl']['versioningWS']) || empty($GLOBALS['TCA'][$childTable]['ctrl']['versioningWS'])) {
                return 'workspace';
            }
            $parentWorkspace = (int)($form['resolvedRow']['t3ver_wsid'] ?? 0);
            if ($parentWorkspace !== 0 && $parentWorkspace !== (int)$form['workspaceId']) {
                return 'workspace';
            }
            // The first structural action would create the parent's first draft
            // (Core auto-versioning). Allowed only where the site opted in.
            if (!$this->configuration->firstVersion((int)$form['scopePageId']) && ($parentWorkspace === 0
                || $this->translatedParentsNeedFirstVersion($table, $form, (int)$form['workspaceId']))) {
                return 'firstVersion';
            }
        }
        $pointer = $form['processedTca']['ctrl']['transOrigPointerField'] ?? '';
        if ($pointer !== '' && (int)($form['resolvedRow'][$pointer] ?? 0) > 0
            && $this->configuration->translatedParents((int)$form['scopePageId']) === 'default-only') {
            return 'translation';
        }
        if (($form['processedTca']['columns'][$field]['l10n_mode'] ?? '') === 'exclude'
            && (int)($form['resolvedRow'][$form['processedTca']['ctrl']['languageField'] ?? ''] ?? 0) > 0) {
            return 'translation';
        }
        // allowLanguageSynchronization: Core drops the list write of a translation
        // that follows its parent/source language (create would leave an orphan,
        // move would be a silent no-op). 'custom' makes the list the translation's own.
        if (InlineTranslations::followsOtherLanguage($table, $field, $form['resolvedRow'])) {
            return 'synchronized';
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

    /** @param array<string, mixed> $row */
    private function isTranslationOnly(string $table, array $row): bool
    {
        $pointer = (string)($GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '');
        return $pointer !== '' && (int)($row[$pointer] ?? 0) === 0;
    }

    /**
     * Removal refusals. Core cascades a delete to the entry's translations
     * (deleteL10nOverlayRecords) and to nested inline/file children. Translations
     * are removable with the entry when every active one passes the delete access
     * check (here, for the payload) and compiles for this editor - owner chain,
     * page, stage - which cascadeProof() runs where the delete executes, for the
     * removed entry only. Nested children and media stay with the backend form
     * until their dependencies have a permission proof of their own.
     *
     * @param array<string, mixed> $row
     * @param list<array<string, mixed>> $translations
     * @param 'confirm'|'refuse' $mode
     */
    private function deleteReason(string $table, array $row, array $translations, string $mode): string
    {
        if ($translations !== [] && $mode === 'refuse') {
            return 'translations';
        }
        $user = $this->users->getOrThrow();
        foreach ([$row, ...$translations] as $affected) {
            foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $name => $column) {
                if (in_array($column['config']['type'] ?? '', ['inline', 'file'], true) && !empty($affected[$name])) {
                    return 'cascade';
                }
            }
        }
        foreach ($translations as $translation) {
            if (!$user->checkRecordEditAccess($table, $translation, false, true)->isAllowed) {
                return 'translations';
            }
        }
        return $user->checkRecordEditAccess($table, $row, false, true)->isAllowed ? '' : 'rights';
    }

    /**
     * The cascade's full proof, run under the lock before a delete is planned:
     * every active translation of the removed entry compiles for this editor, as
     * the backend form would open it. Otherwise the entry is refused 'translations'.
     *
     * @param array<string, mixed> $field
     * @return array<string, mixed> the field, the entry refused when the proof fails
     */
    private function cascadeProof(array $field, int $childUid, ServerRequestInterface $request): array
    {
        $childTable = (string)$field['_config']['foreign_table'];
        foreach ($field['children'] as &$child) {
            if ($child['uid'] !== $childUid || $child['state'] === 'deleted' || !$child['canDelete'] || $child['cascade']['translations'] === 0) {
                continue;
            }
            $row = BackendUtility::getRecord($childTable, $childUid) ?? [];
            $proven = $row !== [] && $this->contexts->scoped(function () use ($childTable, $row, $request): bool {
                foreach ($this->translations->of($childTable, $row) as $translation) {
                    try {
                        $this->contexts->compile($childTable, (int)$translation['uid'], $request);
                    } catch (AccessDeniedException|DatabaseRecordException) {
                        return false;
                    }
                }
                return true;
            });
            if (!$proven) {
                $child['canDelete'] = false;
                $child['deleteReason'] = 'translations';
            }
        }
        unset($child);
        return $field;
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
        foreach ($this->translations->of($table, $form['resolvedRow']) as $translation) {
            try {
                $this->contexts->compile($table, (int)$translation['uid'], $request);
            } catch (AccessDeniedException|DatabaseRecordException) {
                return false;
            }
        }
        return true;
    }

    /**
     * Whether DataHandler::fillInFieldArray keeps a submitted value of this column:
     * it silently skips readOnly columns, HIDE_FOR_NON_ADMINS columns for non-admins
     * (string form, checked before the exclude right) and exclude columns without
     * the non_exclude_fields right.
     */
    private function mayWrite(string $table, string $field): bool
    {
        $user = $this->users->getOrThrow();
        $column = $GLOBALS['TCA'][$table]['columns'][$field] ?? [];
        return empty($column['config']['readOnly'])
            && ($user->isAdmin() || (($column['displayCond'] ?? '') !== 'HIDE_FOR_NON_ADMINS'
                && (empty($column['exclude']) || $user->check('non_exclude_fields', $table . ':' . $field))));
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
        $lock = $this->locks->createLocker(self::lockKey($table, $live, $intent['field']), LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        if (!self::acquire($lock)) {
            return [409, ['success' => false, 'reason' => 'busy']];
        }
        /** @var list<LockingStrategyInterface> $held */
        $held = [];
        try {
            // One read pass: the parent compiled here is the owner every entry's check
            // reuses, and a delete's cascade proof reuses the translated parents.
            [$form, $fields] = $this->contexts->scoped(function () use ($table, $intent, $request): array {
                [$form, $fields] = $this->readPass($table, $intent['parentUid'], $request);
                foreach ($fields as &$candidate) {
                    if ($intent['action'] === 'delete' && $candidate['name'] === $intent['field']) {
                        $candidate = $this->cascadeProof($candidate, (int)$intent['childUid'], $request);
                    }
                }
                unset($candidate);
                return [$form, $fields];
            });
            $field = current(array_filter($fields, static fn(array $field): bool => $field['name'] === $intent['field']));
            if (!$field || empty($field['revision'])) {
                return [403, ['success' => false, 'reason' => 'rights']];
            }
            // A sync or a cascading removal also writes translated parents' relations:
            // hold their locks too - the key a parity action on that translation takes.
            foreach ($this->translatedParentLockKeys($table, $live, $field, $intent) as $key) {
                $translated = $this->locks->createLocker($key, LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
                if (!self::acquire($translated)) {
                    return [409, ['success' => false, 'reason' => 'busy']];
                }
                $held[] = $translated;
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
            // Core's first-version bookkeeping is masked only for the step that creates
            // the parent's first draft, and only where the site enabled it.
            $firstVersion = (bool)$field['workspace']['firstVersion'] && $this->configuration->firstVersion((int)$form['scopePageId']);
            $liveUid = (int)(($form['resolvedRow']['t3ver_oid'] ?? 0) ?: $form['resolvedRow']['uid']);
            $before = $form['workspaceId'] ? $this->snapshots->capture($table, $liveUid, (int)$form['workspaceId']) : null;
            if ($before !== null && $firstVersion && $before['truncated']) {
                return [409, ['success' => false, 'reason' => 'workspace', 'collection' => self::publicField($field)]];
            }
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
                if ($before !== null && !$this->snapshots->unchanged($before, $this->snapshots->capture($table, $liveUid, (int)$form['workspaceId']), $firstVersion)) {
                    $connection->rollBack();
                    return [409, ['success' => false, 'reason' => 'workspaceLiveChange']];
                }
                $connection->commit();
            } catch (\Throwable $error) {
                $connection->rollBack();
                throw $error;
            }
            [, $freshFields] = $this->readPass($table, $intent['parentUid'], $request);
            $response = ['success' => true, 'uid' => null];
            if ($plan->newId !== null) {
                $uid = (int)($handler->substNEWwithIDs[$plan->newId] ?? 0);
                $response['uid'] = $uid ?: null;
                $response['created'] = ['uid' => $uid ?: null, ...($plan->result['created'] ?? [])];
            }
            $response += array_diff_key($plan->result, ['created' => true]);
            if (isset($response['synced'])) {
                $response['synced'] = $this->syncedCounts($response['synced'], $field, $freshFields);
            }
            $response['workspace'] = ['id' => (int)$form['workspaceId'], 'firstVersion' => $firstVersion];
            $response['collections'] = array_map(self::publicField(...), $freshFields);
            return [200, $response];
        } finally {
            foreach (array_reverse($held) as $translated) {
                $translated->release();
            }
            $lock->release();
        }
    }

    /** One collection of one live record; shared by every workspace. */
    private static function lockKey(string $table, int $liveUid, string $field): string
    {
        return 'vee-inline:' . $table . ':' . $liveUid . ':' . $field;
    }

    private static function acquire(LockingStrategyInterface $lock): bool
    {
        try {
            return $lock->acquire(LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        } catch (LockAcquireWouldBlockException) {
            return false;
        }
    }

    /**
     * Locks of the connected translated parents an action on a default-language
     * collection writes besides its own: a sync writes the synced language's
     * parent list and entries; a removal that cascades (deleteL10nOverlayRecords)
     * deletes entries of the translations' parents; with allowLanguageSynchronization
     * on the column every action makes DataMapProcessor rewrite the translated
     * lists. Sorted, without the acting record's own key.
     *
     * @param array<string, mixed> $field  internal collection payload
     * @param array<string, mixed> $intent validated intent
     * @return list<string>
     */
    private function translatedParentLockKeys(string $table, int $live, array $field, array $intent): array
    {
        if ($field['translationMode'] !== 'default') {
            return [];
        }
        $config = $field['_config'];
        $parents = [];
        foreach ($field['translationLanguages'] as $language) {
            if (!empty($config['behaviour']['allowLanguageSynchronization'])
                || ($intent['action'] === 'sync' && (int)$language['id'] === (int)$intent['language'])) {
                $parents[] = (int)$language['parentUid'];
            }
        }
        if ($intent['action'] === 'delete') {
            $childTable = (string)$config['foreign_table'];
            foreach ($field['children'] as $child) {
                if ($child['uid'] !== $intent['childUid'] || $child['state'] === 'deleted' || (int)$child['cascade']['translations'] === 0) {
                    continue;
                }
                foreach ($this->translations->of($childTable, BackendUtility::getRecord($childTable, (int)$child['liveUid']) ?? []) as $translation) {
                    if (empty($config['foreign_table_field']) || ($translation[$config['foreign_table_field']] ?? '') === $table) {
                        $parents[] = (int)($translation[$config['foreign_field']] ?? 0);
                    }
                }
            }
        }
        $keys = [];
        foreach (array_unique($parents) as $uid) {
            if ($uid > 0 && $uid !== $live) {
                $keys[] = self::lockKey($table, $uid, (string)$field['name']);
            }
        }
        sort($keys);
        return $keys;
    }

    /**
     * The parent and its collections, compiled in one memo scope (nothing is written in it).
     *
     * @return array{array<string, mixed>, list<array<string, mixed>>}
     */
    private function readPass(string $table, int $parentUid, ServerRequestInterface $request): array
    {
        return $this->contexts->scoped(function () use ($table, $parentUid, $request): array {
            $form = $this->contexts->compile($table, $parentUid, $request);
            return [$form, $this->fields($table, $form, $request)];
        });
    }

    /**
     * What a sync actually did, from the preflight before and after the write.
     *
     * @param array<string, mixed> $synced
     * @param array<string, mixed> $before
     * @param list<array<string, mixed>> $freshFields
     * @return array<string, mixed>
     */
    private function syncedCounts(array $synced, array $before, array $freshFields): array
    {
        $language = (int)$synced['language'];
        $find = static function (array $field) use ($language): array {
            foreach ($field['translationLanguages'] ?? [] as $entry) {
                if ((int)$entry['id'] === $language) {
                    return $entry;
                }
            }
            return ['missing' => 0, 'orphaned' => 0];
        };
        $after = $find(current(array_filter($freshFields, static fn(array $field): bool => $field['name'] === $before['name'])) ?: []);
        $previous = $find($before);
        return [...$synced, 'localized' => max(0, (int)$previous['missing'] - (int)$after['missing']),
            'removed' => max(0, (int)$previous['orphaned'] - (int)$after['orphaned'])];
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
        unset($field['_defaults'], $field['_config'], $field['_sync']);
        foreach ($field['children'] as &$child) {
            unset($child['deleteUid']);
        }
        return $field;
    }
}
