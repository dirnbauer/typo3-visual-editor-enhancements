<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\RelationHandler;
use TYPO3\CMS\Core\Type\Bitmask\Permission;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * What Core's delete of one collection entry takes with it, and whether this
 * editor may take all of it - the bounded preflight that replaces 1.6's blanket
 * 'cascade' refusal.
 *
 * Mirrors DataHandler::deleteRecord(): deleteRecord_procFields() deletes the
 * members of every inline/file relation (RelationHandler, 'list' and 'field'
 * relations, not MM) unless behaviour.enableCascadingDelete is false, and
 * deleteL10nOverlayRecords() deletes every record's translations as Core selects
 * them (not deleted, live or of this workspace, delete placeholders skipped) -
 * recursively, for nested members and their translations as well. In a
 * workspace Core marks the same records for deletion (delete placeholders).
 *
 * Every dependent must pass what DataHandler checks before it deletes it: the
 * table in tables_modify, record edit access with the full language check, the
 * page's content-edit permission in the editor's mounts, and the same database
 * connection as the entry (one transaction). File references
 * (sys_file_reference) are counted apart; the files themselves stay.
 *
 * Page TSconfig tx_visualeditorenhancements.inlineRecords.cascade:
 *   enabled = 1       0: every entry with dependents is refused 'disabled' (1.6)
 *   maxDepth = 3      nested levels below the entry Core may delete
 *   maxRecords = 50   nested records + file references in one removal
 *
 * @phpstan-type Cascade array{children: int, files: int, truncated: bool, reason: ''|'depth'|'records'|'rights'|'disabled'}
 */
final readonly class InlineCascadePreflight
{
    public const DEFAULT_MAX_DEPTH = 3;
    public const DEFAULT_MAX_RECORDS = 50;

    public function __construct(
        private ConnectionPool $connections,
        private BackendUserProvider $users,
        private InlineRecordConfiguration $configuration,
        private InlineTranslations $translations,
    ) {}

    /**
     * @param array<string, mixed>       $row          the entry (workspace-overlaid)
     * @param list<array<string, mixed>> $translations its active translations (Core removes them with it)
     * @return Cascade
     */
    public function inspect(string $table, array $row, array $translations, int $pid): array
    {
        $settings = $this->configuration->forPage($pid)['cascade.'] ?? [];
        $settings = is_array($settings) ? $settings : [];
        $state = [
            'children' => 0, 'files' => 0, 'truncated' => false, 'reason' => '',
            'maxDepth' => max(0, (int)($settings['maxDepth'] ?? self::DEFAULT_MAX_DEPTH)),
            'maxRecords' => max(0, (int)($settings['maxRecords'] ?? self::DEFAULT_MAX_RECORDS)),
            'connection' => $this->connections->getConnectionForTable($table),
            'seen' => [],
        ];
        foreach ([$row, ...$translations] as $record) {
            $this->walk($table, $record, 1, $state);
            if ($state['reason'] !== '') {
                break;
            }
        }
        $reason = $state['reason'];
        // Switched off: every entry with dependents is refused, whatever bound the walk met first.
        if (($reason !== '' || ($state['children'] + $state['files']) > 0) && !($settings['enabled'] ?? true)) {
            $reason = 'disabled';
        }
        return ['children' => $state['children'], 'files' => $state['files'], 'truncated' => $state['truncated'], 'reason' => $reason];
    }

    /**
     * Whether the record has any member in an inline/file relation, cascading or
     * not: Core's copy would copy them along (copyRecord_procBasedOnFieldType),
     * and Core's versioning of it would version them along.
     *
     * @param array<string, mixed> $row workspace-overlaid (or live, with $live)
     * @param bool $live members in live, whatever this workspace did to them
     */
    public function hasMembers(string $table, array $row, bool $live = false): bool
    {
        $workspace = $live ? 0 : $this->users->getOrThrow()->workspace;
        foreach (self::relations($table, $row) as $field => $config) {
            if ($this->members($table, $row, $field, $config, $workspace) !== []) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array<string, mixed> $row
     * @param array{children: int, files: int, truncated: bool, reason: ''|'depth'|'records'|'rights', maxDepth: int, maxRecords: int, connection: object, seen: array<string, true>} $state
     */
    private function walk(string $table, array $row, int $depth, array &$state): void
    {
        foreach (self::relations($table, $row) as $field => $config) {
            if (isset($config['behaviour']['enableCascadingDelete']) && !$config['behaviour']['enableCascadingDelete']) {
                continue; // Core leaves these members where they are.
            }
            foreach ($this->members($table, $row, $field, $config, $this->users->getOrThrow()->workspace) as [$memberTable, $member]) {
                foreach ([$member, ...$this->translations->of($memberTable, $member)] as $dependent) {
                    $key = $memberTable . ':' . (int)$dependent['uid'];
                    if (isset($state['seen'][$key])) {
                        continue;
                    }
                    $state['seen'][$key] = true;
                    if ($depth > $state['maxDepth']) {
                        $state['reason'] = 'depth';
                        $state['truncated'] = true;
                        return;
                    }
                    $state[$memberTable === 'sys_file_reference' ? 'files' : 'children']++;
                    if ($state['maxRecords'] < $state['children'] + $state['files']) {
                        $state['reason'] = 'records';
                        $state['truncated'] = true;
                        return;
                    }
                    if (!$this->mayDelete($memberTable, $dependent, $state['connection'])) {
                        $state['reason'] = 'rights';
                        $state['truncated'] = true;
                        return;
                    }
                    $this->walk($memberTable, $dependent, $depth + 1, $state);
                    if ($state['reason'] !== '') {
                        return;
                    }
                }
            }
        }
    }

    /**
     * What DataHandler::deleteAction()/doesRecordExist() require for this record.
     *
     * @param array<string, mixed> $row
     */
    private function mayDelete(string $table, array $row, object $connection): bool
    {
        if ($this->connections->getConnectionForTable($table) !== $connection) {
            return false;
        }
        $user = $this->users->getOrThrow();
        if ($user->isAdmin()) {
            return true;
        }
        $pid = (int)$row['pid'];
        $page = $pid > 0 ? BackendUtility::getRecordWSOL('pages', $pid) : null;
        return $user->check('tables_modify', $table)
            && $user->checkRecordEditAccess($table, $row, false, true)->isAllowed
            && is_array($page) && $user->isInWebMount($pid) !== null
            && $user->doesUserHaveAccess($page, Permission::CONTENT_EDIT);
    }

    /**
     * Inline and file columns of a record as Core resolves them for deletion
     * (columnsOverrides of the record type applied), relation types Core cascades.
     *
     * @param array<string, mixed> $row
     * @return array<string, array<string, mixed>>
     */
    private static function relations(string $table, array $row): array
    {
        $relations = [];
        $type = isset($GLOBALS['TCA'][$table]['ctrl']['type']) ? (string)BackendUtility::getTCAtypeValue($table, $row) : '';
        foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $field => $column) {
            $config = array_replace_recursive($column['config'] ?? [], $GLOBALS['TCA'][$table]['types'][$type]['columnsOverrides'][$field]['config'] ?? []);
            if (in_array($config['type'] ?? '', ['inline', 'file'], true) && !empty($config['foreign_table'])
                && empty($config['MM']) && isset($GLOBALS['TCA'][$config['foreign_table']])) {
                $relations[(string)$field] = $config;
            }
        }
        return $relations;
    }

    /**
     * The members Core's RelationHandler hands deleteAction(), workspace-overlaid,
     * without delete placeholders (already marked for deletion).
     *
     * @param array<string, mixed> $row
     * @param array<string, mixed> $config
     * @param int $workspace 0: live members only
     * @return list<array{string, array<string, mixed>}>
     */
    private function members(string $table, array $row, string $field, array $config, int $workspace): array
    {
        $handler = GeneralUtility::makeInstance(RelationHandler::class);
        $handler->setWorkspaceId($workspace);
        // The live identity: RelationHandler resolves workspace members from it (useLiveParentIds).
        $uid = (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']);
        $handler->start((string)($row[$field] ?? ''), (string)$config['foreign_table'], '', $uid, $table, $config);
        $members = [];
        foreach ($handler->itemArray as $item) {
            $member = $workspace > 0 ? BackendUtility::getRecordWSOL((string)$item['table'], (int)$item['id']) : BackendUtility::getRecord((string)$item['table'], (int)$item['id']);
            if (is_array($member) && (int)($member['t3ver_state'] ?? 0) !== 2) {
                $members[] = [(string)$item['table'], $member];
            }
        }
        return $members;
    }
}
