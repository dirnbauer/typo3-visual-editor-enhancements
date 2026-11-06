<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Form\FormDataCompiler;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaDatabaseRecord;
use TYPO3\CMS\Backend\Routing\UriBuilder;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Locking\LockFactory;
use TYPO3\CMS\Core\Locking\LockingStrategyInterface;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
     * Generic foreign_field relations, with FormEngine identities and server-owned commands.
     */
final readonly class InlineRecordService
{
    public function __construct(
        private EditorRecordContext $contexts,
        private InlineRecordConfiguration $configuration,
        private BackendUserProvider $users,
        private ConnectionPool $connections,
        private LockFactory $locks,
        private UriBuilder $uris,
        private FormDataCompiler $compiler,
    ) {}

    public function backendUrl(string $table, int $uid, bool $contextual = false): string
    {
        return (string)$this->uris->buildUriFromRoute($contextual ? 'record_edit_contextual' : 'record_edit', ['edit' => [$table => [$uid => 'edit']]], UriBuilder::ABSOLUTE_URL);
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
        $pid = (int)$form['scopePageId'];
        $reason = $this->unsupported($table, $field, $config, $form);
        if ($reason === '' && !$this->relatedParentsEditable($table, $form, $request)) {
            $reason = 'rights';
        }
        $uids = $reason === 'unsupported' ? [] : array_values(array_filter(array_map('intval', GeneralUtility::trimExplode(',', (string)($form['databaseRow'][$field] ?? ''), true))));
        $children = [];
        $formUids = [];
        foreach ($uids as $uid) {
            try {
                $overlaid = BackendUtility::getRecordWSOL($childTable, $uid);
                if ($overlaid && (int)($overlaid['t3ver_state'] ?? 0) === 2) {
                    continue;
                }
                $child = $this->contexts->compile($childTable, $uid, $request);
                $row = BackendUtility::getRecord($childTable, (int)$child['compileUid']);
                if (!$row || !$this->belongs($table, $form, $config, $row)) {
                    return $this->unavailable($field, $column, $table, $form);
                }
                if ($form['workspaceId'] && (int)($row['t3ver_wsid'] ?? 0) !== (int)$form['workspaceId']) {
                    return $this->unavailable($field, $column, $table, $form, 'workspace');
                }
                $deleteReason = $reason ?: $this->deleteReason($childTable, $row);
                $uid = (int)$child['compileUid'];
                $formUids[] = $uid;
                $new = (int)($row['t3ver_state'] ?? 0) === 1;
                $children[] = [
                    'uid' => $uid, 'table' => $childTable,
                    'label' => BackendUtility::getRecordTitle($childTable, $row),
                    'backendUrl' => $this->backendUrl($childTable, $uid),
                    'contextualUrl' => $this->backendUrl($childTable, $uid, true),
                    'hidden' => !empty($row[$GLOBALS['TCA'][$childTable]['ctrl']['enablecolumns']['disabled'] ?? '']),
                    'canDelete' => $deleteReason === '' && count($uids) > (int)($config['minitems'] ?? 0)
                        && (bool)($config['appearance']['enabledControls']['delete'] ?? true),
                    'deleteReason' => $deleteReason ?: (count($uids) <= (int)($config['minitems'] ?? 0) ? 'min' : ''),
                    'verb' => $new ? 'discard' : ($form['workspaceId'] ? 'markForDeletion' : 'delete'),
                    'deleteUid' => $new ? (int)$row['uid'] : (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']),
                ];
            } catch (\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException|\TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException) {
                // One inaccessible child makes the entire list private, including its count.
                return $this->unavailable($field, $column, $table, $form);
            }
        }
        $uids = $formUids;
        foreach ($children as &$entry) {
            if (count($uids) <= (int)($config['minitems'] ?? 0)) {
                $entry['canDelete'] = false;
                $entry['deleteReason'] = $entry['deleteReason'] ?: 'min';
            }
        }
        unset($entry);
        $createReason = $reason;
        $defaults = [];
        if ($createReason === '') {
            try {
                [$defaults, $createReason] = $this->defaults($childTable, $form, $request);
            } catch (\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException) {
                $createReason = 'rights';
            }
        }
        $max = (int)($config['maxitems'] ?? 0);
        if ($createReason === '' && $max > 0 && count($uids) >= $max) {
            $createReason = 'max';
        }
        if (!($config['appearance']['enabledControls']['new'] ?? true)) {
            $createReason = 'controls';
        }
        return [
            'name' => $field, 'label' => $column['label'] ?? $field, 'type' => 'inline',
            'parentTable' => $table, 'parentUid' => (int)$form['requestedUid'],
            'backendUrl' => $this->backendUrl($table, (int)$form['compileUid']),
            'revision' => hash('sha256', json_encode([$table, $form['compileUid'], $form['workspaceId'], $form['resolvedRow'], $field, $uids], JSON_THROW_ON_ERROR)),
            'workspaceId' => $form['workspaceId'], 'uids' => $uids, 'children' => $children,
            'minItems' => (int)($config['minitems'] ?? 0), 'maxItems' => $max,
            'canCreate' => $createReason === '', 'createReason' => $createReason,
            'createHidden' => $form['workspaceId'] === 0 && (bool)($this->configuration->forPage($pid)['createHidden'] ?? true),
            // Internal only; stripped at the public field boundary.
            '_defaults' => $defaults, '_config' => $config,
        ];
    }

    /**
     * @return array<string, mixed>
     * @param array<string, mixed> $column
     * @param array<string, mixed> $form
     */
    private function unavailable(string $field, array $column, string $table, array $form, string $reason = 'rights'): array
    {
        return ['name' => $field, 'label' => $column['label'] ?? $field, 'type' => 'inline',
            'canCreate' => false, 'createReason' => $reason, 'children' => [],
            'backendUrl' => $this->backendUrl($table, (int)$form['compileUid'])];
    }

    /**
     * @param array<string, mixed> $config
     * @param array<string, mixed> $form
     */
    private function unsupported(string $table, string $field, array $config, array $form): string
    {
        $childTable = (string)($config['foreign_table'] ?? '');
        if (in_array($childTable, ['tt_content', 'pages'], true) || str_starts_with($childTable, 'sys_') || str_starts_with($childTable, 'be_') || str_starts_with($childTable, 'fe_')
            || empty($config['foreign_field']) || $childTable === 'sys_file_reference'
            || !isset($GLOBALS['TCA'][$childTable])
            || array_intersect(array_keys($config), ['MM', 'foreign_selector', 'foreign_unique', 'foreign_types', 'foreign_default_sortby', 'symmetric_field', 'symmetric_label', 'symmetric_sortby', 'foreign_record_defaults', 'overrideChildTca']) !== []
            || !empty($GLOBALS['TCA'][$childTable]['ctrl']['type'])
        ) {
            return 'unsupported';
        }
        $settings = $this->configuration->forPage((int)$form['scopePageId']);
        if (!($settings['tables.'][$childTable . '.']['enabled'] ?? true)) {
            return 'disabled';
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
        if (($columnMode = $form['processedTca']['columns'][$field]['l10n_mode'] ?? '') === 'exclude'
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
     * @param array<string, mixed> $row
     */
    private function deleteReason(string $table, array $row): string
    {
        // Cascade deletion can touch other languages and nested records. Until those
        // dependencies have their own permission proof, leave it to the backend form.
        $pointer = $GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '';
        $live = (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']);
        if ($pointer !== '') {
            $query = $this->connections->getQueryBuilderForTable($table);
            $query->getRestrictions()->removeAll()
                ->add(GeneralUtility::makeInstance(\TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction::class))
                ->add(GeneralUtility::makeInstance(\TYPO3\CMS\Core\Database\Query\Restriction\WorkspaceRestriction::class, $this->users->getOrThrow()->workspace));
            $translations = $query->select('*')->from($table)->where(
                $query->expr()->eq($pointer, $query->createNamedParameter($live)),
            )->executeQuery()->fetchAllAssociative();
            foreach ($translations as $translation) {
                BackendUtility::workspaceOL($table, $translation, $this->users->getOrThrow()->workspace);
                if ($translation && (int)($translation['t3ver_state'] ?? 0) !== 2) {
                    return 'translations';
                }
            }
        }
        foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $name => $column) {
            if (in_array($column['config']['type'] ?? '', ['inline', 'file'], true) && !empty($row[$name])) {
                return 'cascade';
            }
        }
        return $this->users->getOrThrow()->checkRecordEditAccess($table, $row, false, true)->isAllowed ? '' : 'rights';
    }

    /**
     * @return array{array<string, mixed>, string}
     * @param array<string, mixed> $parent
     */
    private function defaults(string $table, array $parent, ServerRequestInterface $request): array
    {
        $pid = (int)$parent['scopePageId'];
        $new = $this->compiler->compile([
            'request' => $request, 'tableName' => $table, 'vanillaUid' => $pid, 'command' => 'new',
            'inlineResolveExistingChildren' => false, 'inlineCompileExistingChildren' => false,
        ], GeneralUtility::makeInstance(TcaDatabaseRecord::class));
        $defaults = ['pid' => $pid];
        $label = $new['processedTca']['ctrl']['label'] ?? '';
        foreach ($new['processedTca']['columns'] as $name => $column) {
            $config = $column['config'];
            if (!in_array($config['type'], ['input', 'text', 'number', 'check', 'select', 'color', 'link', 'datetime', 'language'], true)) {
                if (!empty($config['required']) || (int)($config['minitems'] ?? 0) > 0) {
                    return [[], 'required'];
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
                return [[], 'required'];
            }
            if ($value !== '' && $this->mayWrite($table, $name)) {
                $defaults[$name] = $value;
            } elseif (!empty($config['required'])) {
                return [[], 'rights'];
            }
        }
        $language = $GLOBALS['TCA'][$table]['ctrl']['languageField'] ?? '';
        if ($language !== '') {
            $defaults[$language] = (int)($parent['resolvedRow'][$parent['processedTca']['ctrl']['languageField'] ?? ''] ?? 0);
            if (!$this->users->getOrThrow()->checkLanguageAccess($defaults[$language])) {
                return [[], 'language'];
            }
        }
        $visibility = $GLOBALS['TCA'][$table]['ctrl']['enablecolumns']['disabled'] ?? '';
        if (!$parent['workspaceId'] && ($this->configuration->forPage($pid)['createHidden'] ?? true)) {
            if ($visibility === '' || !$this->mayWrite($table, $visibility)) {
                return [[], 'hidden'];
            }
            $defaults[$visibility] = 1;
        }
        return [$defaults, ''];
    }

    /** @param array<string, mixed> $form */
    private function relatedParentsEditable(string $table, array $form, ServerRequestInterface $request): bool
    {
        $pointer = $form['processedTca']['ctrl']['transOrigPointerField'] ?? '';
        if ($pointer === '' || $this->users->getOrThrow()->isAdmin()) {
            return true;
        }
        $connection = $this->connections->getConnectionForTable($table);
        $live = (int)(($form['resolvedRow']['t3ver_oid'] ?? 0) ?: $form['resolvedRow']['uid']);
        $rows = $connection->fetchAllAssociative('SELECT * FROM ' . $connection->quoteIdentifier($table)
            . ' WHERE ' . $connection->quoteIdentifier($pointer) . ' = ?', [$live]);
        foreach ($rows as $row) {
            if ((int)($row['t3ver_wsid'] ?? 0) !== 0 && (int)$row['t3ver_wsid'] !== (int)$form['workspaceId']) {
                continue;
            }
            if (!empty($row[$form['processedTca']['ctrl']['delete'] ?? ''])) {
                continue;
            }
            try {
                $this->contexts->compile($table, (int)$row['uid'], $request);
            } catch (\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException|\TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException) {
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
        $request = $request->withQueryParams([...$request->getQueryParams(), 'editMode' => 1]);
        $form = $this->contexts->compile($table, $intent['parentUid'], $request);
        $live = (int)(($form['databaseRow']['t3ver_oid'] ?? 0) ?: $form['databaseRow']['uid']);
        // All workspaces share the lock: never serialize by a client-supplied version uid.
        $lock = $this->locks->createLocker('vee-inline:' . $table . ':' . $live . ':' . $intent['field'], LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        try {
            $acquired = $lock->acquire(LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK);
        } catch (\TYPO3\CMS\Core\Locking\Exception\LockAcquireWouldBlockException) {
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
            $uids = $field['uids'];
            $childTable = $field['_config']['foreign_table'];
            $data = [];
            $cmd = [];
            $newId = 'NEW' . bin2hex(random_bytes(12));
            if ($intent['action'] === 'create') {
                if (!$field['canCreate']) {
                    return [409, ['success' => false, 'reason' => $field['createReason'], 'collection' => self::publicField($field)]];
                }
                $after = $intent['afterUid'] ?? null;
                if ($after !== null && !in_array($after, $uids, true)) {
                    return [409, ['success' => false, 'reason' => 'stale', 'collection' => self::publicField($field)]];
                }
                array_splice($uids, $after === null ? count($uids) : (int)array_search($after, $uids, true) + 1, 0, [$newId]);
                $data[$childTable][$newId] = $field['_defaults'];
            } else {
                $child = current(array_filter($field['children'], static fn(array $child): bool => $child['uid'] === $intent['childUid']));
                if (!$child || !$child['canDelete']) {
                    return [409, ['success' => false, 'reason' => $child['deleteReason'] ?? 'membership', 'collection' => self::publicField($field)]];
                }
                $uids = array_values(array_diff($uids, [$intent['childUid']]));
                $cmd[$childTable][$child['deleteUid']]['delete'] = 1;
            }
            $data = [$table => [(int)$form['compileUid'] => [$intent['field'] => implode(',', $uids)]] + ($data[$table] ?? [])] + $data;
            $connection = $this->connections->getConnectionForTable($table);
            if ($connection !== $this->connections->getConnectionForTable($childTable)) {
                return [409, ['success' => false, 'reason' => 'connection']];
            }
            $liveSnapshot = $form['workspaceId'] ? $this->liveSnapshot($table, $form, $field) : [];
            $connection->beginTransaction();
            try {
                $handler = GeneralUtility::makeInstance(\Webconsulting\VisualEditorEnhancements\DataHandling\InlineDataHandler::class);
                $handler->start($data, $cmd);
                $handler->process_datamap();
                if (!$handler->errorLog) {
                    $handler->process_cmdmap();
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
            $freshFields = array_map(self::publicField(...), $this->fields($table, $fresh, $request));
            return [200, ['success' => true, 'uid' => $handler->substNEWwithIDs[$newId] ?? null, 'collections' => $freshFields]];
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
