<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\DataHandling\Localization\State;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;

/**
 * The live rows a structural workspace action could reach, captured before and
 * after the write inside the transaction.
 *
 * Roots: the live parent and every live record Core's DataMapProcessor can
 * reach from it (dependents()): connected translations pointing at it through
 * their parent OR their source pointer, transitively. DataMapProcessor pushes
 * changes into them, which in a workspace versions them as well. They are roots
 * whether or not Core synchronizes the table (strict roots Core never touches
 * stay byte-identical anyway).
 * Per root: the root row; every inline/file relation of the root and,
 * recursively, of its live members up to a depth of three (Core versions all of
 * them together with their owner); the live translations of every member that no
 * captured relation already covers. Members are selected by owner, table
 * discriminator and match fields, so shared tables never mix relations.
 *
 * Strict comparison: everything byte-identical (existing drafts; later writes).
 * Narrowed comparison (TSconfig firstVersion = 1), per root that had no draft
 * in this workspace before the request: Core's first-version bookkeeping may
 * renumber the schema sorting column of that root's relation members -
 * consecutively, in the same order - and stamp their tstamp column. Nothing else
 * may change: no root row, no other translation, not the member set, not the
 * order, not a single other column. Roots that already had a draft stay strict.
 *
 * @phpstan-type Relation array{root: string, sortby: string, tstamp: string, rows: array<int, array<string, mixed>>}
 * @phpstan-type Snapshot array{roots: array<string, array{row: array<string, mixed>|false, drafted: bool}>, relations: array<string, Relation>, translations: array<string, array<int, array<string, mixed>>>, truncated: bool}
 */
final readonly class LiveSnapshot
{
    public const MAX_DEPTH = 3;

    public function __construct(private ConnectionPool $connections, private TcaSchemaFactory $schemas) {}

    /**
     * @return Snapshot
     */
    public function capture(string $table, int $liveUid, int $workspace): array
    {
        $snapshot = ['roots' => [], 'relations' => [], 'translations' => [], 'truncated' => false];
        $roots = [$liveUid => $this->connections->getConnectionForTable($table)->select(['*'], $table, ['uid' => $liveUid])->fetchAssociative()];
        foreach ($this->dependents($table, $liveUid) as $uid => $row) {
            $roots[$uid] = $row;
        }
        $covered = [];
        foreach ($roots as $uid => $row) {
            $key = $table . ':' . $uid;
            $snapshot['roots'][$key] = ['row' => $row, 'drafted' => $this->drafted($table, $uid, $workspace)];
            $this->walk($table, $uid, 1, $key, $snapshot, $covered);
        }
        // A translated member below a translated root is compared as that root's member.
        foreach ($snapshot['translations'] as $key => $rows) {
            $rows = array_diff_key($rows, $covered[explode(':', $key)[0]] ?? []);
            if ($rows === []) {
                unset($snapshot['translations'][$key]);
            } else {
                $snapshot['translations'][$key] = $rows;
            }
        }
        ksort($snapshot['roots']);
        ksort($snapshot['relations']);
        ksort($snapshot['translations']);
        return $snapshot;
    }

    /**
     * The live records Core's DataMapProcessor reaches from this one, found the way
     * DataMapProcessor::fetchDependentElements() finds them: connected translations
     * (language > 0, transOrigPointerField > 0) whose transOrigPointerField OR
     * translationSource points at the record or at a record already reached,
     * repeated until nothing new turns up (Core repeats it for every dependent it
     * writes). Deleted rows are included; callers deciding what Core writes skip
     * them (Core's query has the deleted restriction).
     *
     * @return array<int, array<string, mixed>> live uid => row, by uid
     */
    public function dependents(string $table, int $liveUid): array
    {
        $ctrl = $GLOBALS['TCA'][$table]['ctrl'] ?? [];
        $pointer = (string)($ctrl['transOrigPointerField'] ?? '');
        $language = (string)($ctrl['languageField'] ?? '');
        if ($pointer === '' || $language === '') {
            return [];
        }
        $source = (string)($ctrl['translationSource'] ?? '');
        $found = [];
        $seen = [$liveUid => true];
        $targets = [$liveUid];
        while ($targets !== []) {
            $query = $this->connections->getQueryBuilderForTable($table);
            $query->getRestrictions()->removeAll();
            $ancestors = [$query->expr()->in($pointer, $query->createNamedParameter($targets, Connection::PARAM_INT_ARRAY))];
            if ($source !== '') {
                $ancestors[] = $query->expr()->in($source, $query->createNamedParameter($targets, Connection::PARAM_INT_ARRAY));
            }
            $query->select('*')->from($table)->where(
                $query->expr()->gt($language, $query->createNamedParameter(0, Connection::PARAM_INT)),
                $query->expr()->gt($pointer, $query->createNamedParameter(0, Connection::PARAM_INT)),
                $query->expr()->or(...$ancestors),
            )->orderBy('uid');
            if (!empty($ctrl['versioningWS'])) {
                $query->andWhere($query->expr()->eq('t3ver_wsid', $query->createNamedParameter(0, Connection::PARAM_INT)));
            }
            $targets = [];
            foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
                $uid = (int)$row['uid'];
                if (!isset($seen[$uid])) {
                    $seen[$uid] = true;
                    $found[$uid] = $row;
                    $targets[] = $uid;
                }
            }
        }
        ksort($found);
        return $found;
    }

    /**
     * Whether Core's DataMapProcessor pushes changes of a record of this table into
     * its translations at all. Mirrors DataMapProcessor::isApplicable(), which is
     * protected: a language-aware table with an allowLanguageSynchronization column
     * (State::isApplicable()) or with an l10n_mode = exclude column that is not of
     * type none.
     */
    public function synchronizesTranslations(string $table): bool
    {
        if (State::isApplicable($table)) {
            return true;
        }
        if (!$this->schemas->has($table) || !$this->schemas->get($table)->isLanguageAware()) {
            return false;
        }
        foreach ($this->schemas->get($table)->getFields() as $field) {
            if (($field->getConfiguration()['l10n_mode'] ?? null) === 'exclude' && $field->getType() !== 'none') {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether a structural write below this record would make Core create its first
     * draft with live member bookkeeping: no draft in the workspace yet and at
     * least one live member in an inline/file relation.
     */
    public function needsFirstVersion(string $table, int $liveUid, int $workspace): bool
    {
        if ($workspace <= 0 || $this->drafted($table, $liveUid, $workspace)) {
            return false;
        }
        foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $column) {
            $config = $column['config'] ?? [];
            if (self::isRelation($config) && $this->members($table, $liveUid, $config) !== []) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param Snapshot $before
     * @param Snapshot $after
     */
    public function unchanged(array $before, array $after, bool $firstVersion): bool
    {
        if (!$firstVersion) {
            // 'drafted' is derived state (Core may create drafts); only live rows count.
            $rows = static fn(array $snapshot): array => [array_column($snapshot['roots'], 'row'), $snapshot['relations'], $snapshot['translations'], $snapshot['truncated']];
            return $rows($before) === $rows($after);
        }
        if (array_keys($before['roots']) !== array_keys($after['roots']) || $before['translations'] !== $after['translations']
            || $before['truncated'] !== $after['truncated'] || array_keys($before['relations']) !== array_keys($after['relations'])) {
            return false;
        }
        foreach ($before['roots'] as $key => $root) {
            if ($root['row'] !== $after['roots'][$key]['row']) {
                return false;
            }
        }
        foreach ($before['relations'] as $key => $relation) {
            $strict = $before['roots'][$relation['root']]['drafted'];
            if ($strict ? $relation !== $after['relations'][$key] : !$this->bookkeepingOnly($relation, $after['relations'][$key])) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param Relation $before
     * @param Relation $after
     */
    private function bookkeepingOnly(array $before, array $after): bool
    {
        $sortby = $before['sortby'];
        $tstamp = $before['tstamp'];
        if (array_keys($before['rows']) !== array_keys($after['rows'])) {
            return false; // the member set changed
        }
        $order = self::order($before['rows'], $sortby);
        if ($order !== self::order($after['rows'], $sortby)) {
            return false; // the visible order changed
        }
        $masked = array_fill_keys(array_filter([$sortby, $tstamp]), true);
        $renumbered = false;
        foreach ($before['rows'] as $uid => $row) {
            $new = $after['rows'][$uid];
            if (array_diff_key($row, $masked) !== array_diff_key($new, $masked)) {
                return false; // a content, owner, language, visibility, deletion or pid column changed
            }
            if ($tstamp !== '' && $row[$tstamp] !== $new[$tstamp] && (int)$new[$tstamp] !== (int)$GLOBALS['EXEC_TIME']) {
                return false;
            }
            $renumbered = $renumbered || ($sortby !== '' && $row[$sortby] !== $new[$sortby]);
        }
        if (!$renumbered) {
            return true;
        }
        // Renumbered values follow the previous order, consecutively (writeForeignField: 1..n).
        $previous = null;
        foreach ($order as $uid) {
            $value = (int)$after['rows'][$uid][$sortby];
            if ($previous !== null && $value !== $previous + 1) {
                return false;
            }
            $previous = $value;
        }
        return true;
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return list<int> uids ordered by (sortby, uid)
     */
    private static function order(array $rows, string $sortby): array
    {
        $uids = array_keys($rows);
        if ($sortby !== '') {
            usort($uids, static fn(int $a, int $b): int => [(int)$rows[$a][$sortby], $a] <=> [(int)$rows[$b][$sortby], $b]);
        }
        return $uids;
    }

    /**
     * @param Snapshot $snapshot
     * @param array<string, array<int, true>> $covered relation members per table
     */
    private function walk(string $table, int $uid, int $depth, string $root, array &$snapshot, array &$covered): void
    {
        if ($depth > 1) {
            $rows = $this->liveTranslations($table, $uid);
            if ($rows !== []) {
                $snapshot['translations'][$table . ':' . $uid] = $rows;
            }
        }
        foreach ($GLOBALS['TCA'][$table]['columns'] ?? [] as $field => $column) {
            $config = $column['config'] ?? [];
            if (!self::isRelation($config)) {
                continue;
            }
            $child = (string)$config['foreign_table'];
            $rows = $this->members($table, $uid, $config);
            if ($depth > self::MAX_DEPTH) {
                $snapshot['truncated'] = $snapshot['truncated'] || $rows !== [];
                continue;
            }
            $snapshot['relations'][$table . ':' . $uid . ':' . $field] = [
                'root' => $root,
                'sortby' => (string)(($config['foreign_sortby'] ?? '') ?: ($GLOBALS['TCA'][$child]['ctrl']['sortby'] ?? '')),
                'tstamp' => (string)($GLOBALS['TCA'][$child]['ctrl']['tstamp'] ?? ''),
                'rows' => $rows,
            ];
            foreach (array_keys($rows) as $member) {
                $covered[$child][$member] = true;
                $this->walk($child, $member, $depth + 1, $root, $snapshot, $covered);
            }
        }
    }

    /**
     * Live members of one relation, by owner, table discriminator and match fields.
     *
     * @param array<string, mixed> $config
     * @return array<int, array<string, mixed>>
     */
    private function members(string $table, int $uid, array $config): array
    {
        $child = (string)$config['foreign_table'];
        $query = $this->connections->getQueryBuilderForTable($child);
        $query->getRestrictions()->removeAll();
        $query->select('*')->from($child)->where($query->expr()->eq((string)$config['foreign_field'], $query->createNamedParameter($uid, Connection::PARAM_INT)))->orderBy('uid');
        if (!empty($GLOBALS['TCA'][$child]['ctrl']['versioningWS'])) {
            $query->andWhere($query->expr()->eq('t3ver_wsid', $query->createNamedParameter(0, Connection::PARAM_INT)));
        }
        if (!empty($config['foreign_table_field'])) {
            $query->andWhere($query->expr()->eq((string)$config['foreign_table_field'], $query->createNamedParameter($table)));
        }
        foreach ($config['foreign_match_fields'] ?? [] as $name => $value) {
            $query->andWhere($query->expr()->eq((string)$name, $query->createNamedParameter((string)$value)));
        }
        $rows = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $rows[(int)$row['uid']] = $row;
        }
        return $rows;
    }

    /** @return array<int, array<string, mixed>> live connected translations of one record */
    private function liveTranslations(string $table, int $uid): array
    {
        $pointer = (string)($GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '');
        if ($pointer === '') {
            return [];
        }
        $query = $this->connections->getQueryBuilderForTable($table);
        $query->getRestrictions()->removeAll();
        $query->select('*')->from($table)->where($query->expr()->eq($pointer, $query->createNamedParameter($uid, Connection::PARAM_INT)))->orderBy('uid');
        if (!empty($GLOBALS['TCA'][$table]['ctrl']['versioningWS'])) {
            $query->andWhere($query->expr()->eq('t3ver_wsid', $query->createNamedParameter(0, Connection::PARAM_INT)));
        }
        $rows = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $rows[(int)$row['uid']] = $row;
        }
        return $rows;
    }

    private function drafted(string $table, int $liveUid, int $workspace): bool
    {
        if ($workspace <= 0 || empty($GLOBALS['TCA'][$table]['ctrl']['versioningWS'])) {
            return false;
        }
        return $this->connections->getConnectionForTable($table)->count('uid', $table, ['t3ver_oid' => $liveUid, 't3ver_wsid' => $workspace]) > 0;
    }

    /** @param array<string, mixed> $config */
    private static function isRelation(array $config): bool
    {
        return in_array($config['type'] ?? '', ['inline', 'file'], true) && !empty($config['foreign_table']) && !empty($config['foreign_field'])
            && empty($config['MM']) && isset($GLOBALS['TCA'][$config['foreign_table']]);
    }
}
