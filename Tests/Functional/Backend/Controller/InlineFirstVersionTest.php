<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\DataHandling\DataHandler;

/**
 * WP-D: the first workspace draft of a collection through Core's stock
 * auto-versioning, under the narrowed live-row invariant (TSconfig
 * firstVersion = 1): live content byte-identical; only the members' sorting
 * (renumbered consecutively, same order) and tstamp of records versioned for
 * the first time may change. Run on SQLite and MariaDB.
 */
final class InlineFirstVersionTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->addItem(3, ['sorting' => 30]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 1');
        $this->useWorkspace();
    }

    #[Test]
    public function firstWorkspaceCreateVersionsParentAndChildrenAndOnlyRenumbersLiveSortingAndTstamp(): void
    {
        $parent = $this->row(1, 'tt_content');
        $live = $this->liveItems();
        $field = $this->field();
        self::assertSame([true, ''], [$field['workspace']['firstVersion'], $field['createReason']]);
        $created = $this->act($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame(['id' => 1, 'firstVersion' => true], $created[1]['workspace']);

        self::assertSame($parent, $this->row(1, 'tt_content'), 'Live parent byte-identical');
        $after = $this->liveItems();
        self::assertSame(['1' => 1, '3' => 2], array_map(static fn(array $row): int => (int)$row['sorting'], $after), 'Sorting 10, 30 renumbered to 1, 2 in the same order');
        foreach ($live as $uid => $row) {
            self::assertSame(self::withoutBookkeeping($row), self::withoutBookkeeping($after[$uid]), 'Live content of ' . $uid);
            self::assertSame((int)$GLOBALS['EXEC_TIME'], (int)$after[$uid]['tstamp']);
        }
        self::assertSame(1, $this->countRows('tt_content', ['t3ver_oid' => 1, 't3ver_wsid' => 1]), 'Parent draft');
        $field = $this->field();
        self::assertSame(['modified', 'modified', 'new'], array_column($field['children'], 'state'));
        self::assertSame([1, 3], array_slice(array_column($field['children'], 'liveUid'), 0, 2));
        self::assertFalse($field['workspace']['firstVersion']);

        // Later writes on drafts stay fully byte-identical (the collection is at max 3: reorder).
        $live = $this->liveItems();
        $again = $this->intent($field, 'move', ['childUid' => (int)$created[1]['uid'], 'afterUid' => null]);
        self::assertSame(200, $again[0], json_encode($again, JSON_THROW_ON_ERROR));
        self::assertFalse($again[1]['workspace']['firstVersion']);
        self::assertSame($live, $this->liveItems());
    }

    #[Test]
    public function firstWorkspaceCreateWithNestedChildrenRenumbersOnlyAffectedNestedRelations(): void
    {
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 5]);
        $this->addItem(21, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 7]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 2], ['uid' => 1]);
        // Core versions every relation of the parent: the shared slot is affected too.
        $this->addItem(31, ['slot' => 'shared', 'sorting' => 70]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_shared' => 1], ['uid' => 1]);
        // Unrelated: another element and its entry.
        $this->getConnectionPool()->getConnectionForTable('tt_content')->insert('tt_content', ['uid' => 3, 'pid' => 666, 'CType' => 'text', 'header' => 'Other', 'vee_items' => 1]);
        $this->addItem(30, ['owner' => 3, 'sorting' => 50]);
        $unrelated = [$this->row(30), $this->row(3, 'tt_content')];
        $affected = [$this->row(20), $this->row(21), $this->row(31)];

        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame($unrelated, [$this->row(30), $this->row(3, 'tt_content')], 'Unrelated rows byte-identical');
        foreach ($affected as $row) {
            self::assertSame(self::withoutBookkeeping($row), self::withoutBookkeeping($this->row((int)$row['uid'])));
        }
        self::assertSame([1, 2, 1], array_map(fn(array $row): int => (int)$this->row((int)$row['uid'])['sorting'], $affected), 'Each relation renumbered on its own, in order');
        self::assertSame(2, $this->countRows('tx_vee_item', ['slot' => 'nested', 't3ver_wsid' => 1]), 'Core versioned the nested entries');
    }

    #[Test]
    public function firstWorkspaceCreateWithConnectedChildTranslationsLeavesTranslationContentUntouched(): void
    {
        $this->writeSite();
        $this->addItem(2, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 4, 'title' => 'Übersetzt']);
        $this->addItem(4, ['origin' => 3, 'lang' => 2, 'owner' => 0, 'owner_table' => '', 'slot' => '', 'sorting' => 9, 'title' => 'Detached']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 2]);
        $translatedParent = $this->row(2, 'tt_content');
        $translation = $this->row(2);
        $detached = $this->row(4);

        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame($translatedParent, $this->row(2, 'tt_content'), 'Live translated parent byte-identical');
        self::assertSame($detached, $this->row(4), 'A translation outside every versioned relation is byte-identical');
        // Core's DataMapProcessor versions the translated parent too; its entry gets
        // the same first-version bookkeeping and nothing else.
        $after = $this->row(2);
        self::assertSame(self::withoutBookkeeping($translation), self::withoutBookkeeping($after), 'Translation content untouched');
        self::assertSame(1, (int)$after['sorting']);
        self::assertSame(1, $this->countRows('tt_content', ['t3ver_oid' => 2, 't3ver_wsid' => 1]));
    }

    #[Test]
    public function firstWorkspaceCreateOnPartiallyVersionedChildrenReusesExistingDrafts(): void
    {
        // A staged visibility change versions child 1 alone (no parent draft).
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]])[0]);
        $draft = $this->draftOf(1);
        self::assertNotNull($draft);
        $field = $this->field();
        self::assertSame([[(int)$draft['uid'], 3], ['modified', 'live'], true], [$field['uids'], array_column($field['children'], 'state'), $field['workspace']['firstVersion']]);

        $created = $this->act($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame(1, $this->countRows('tx_vee_item', ['t3ver_oid' => 1, 't3ver_wsid' => 1]), 'The existing draft is reused');
        self::assertSame((int)$draft['uid'], (int)($this->draftOf(1)['uid'] ?? 0));
        self::assertSame(1, (int)($this->draftOf(1)['hidden'] ?? 0), 'Its staged change survives');
        self::assertNotNull($this->draftOf(3), 'The live sibling is versioned with the parent');
        self::assertSame([(int)$draft['uid'], (int)$this->draftOf(3)['uid'], $created[1]['uid']], $this->field()['uids']);
    }

    #[Test]
    public function firstWorkspaceMoveFollowsTheSameInvariant(): void
    {
        $live = $this->liveItems();
        $moved = $this->intent($this->field(), 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        self::assertTrue($moved[1]['workspace']['firstVersion']);
        $after = $this->liveItems();
        self::assertSame([1, 2], array_values(array_map(static fn(array $row): int => (int)$row['sorting'], $after)), 'Live order unchanged');
        foreach ($live as $uid => $row) {
            self::assertSame(self::withoutBookkeeping($row), self::withoutBookkeeping($after[$uid]));
        }
        self::assertSame([3, 1], array_column($this->field()['children'], 'liveUid'), 'The draft order changed');
    }

    #[Test]
    public function firstWorkspaceDeleteCreatesDeletePlaceholderWithoutLiveContentChange(): void
    {
        $live = $this->liveItems();
        $field = $this->field();
        self::assertSame('markForDeletion', $field['children'][1]['verb']);
        $removed = $this->act($field, 'delete', 3);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        $after = $this->liveItems();
        self::assertSame(array_keys($live), array_keys($after), 'Nothing deleted live');
        foreach ($live as $uid => $row) {
            self::assertSame(self::withoutBookkeeping($row), self::withoutBookkeeping($after[$uid]));
        }
        self::assertSame(2, (int)($this->draftOf(3)['t3ver_state'] ?? 0), 'Delete placeholder');
        self::assertSame(['modified', 'deleted'], array_column($this->field()['children'], 'state'));
    }

    #[Test]
    public function liveSnapshotMaskRejectsAnyOtherLiveChange(): void
    {
        $before = [$this->rows(), $this->rows('tt_content')];
        $GLOBALS['TYPO3_CONF_VARS']['SC_OPTIONS']['t3lib/class.t3lib_tcemain.php']['processDatamapClass'][] = TamperingLiveHook::class;
        foreach ([['title' => 'Tampered'], ['hidden' => 1], ['sorting' => 9], ['owner' => 2]] as $change) {
            TamperingLiveHook::$change = $change;
            $result = $this->act($this->field(), 'create');
            self::assertSame([409, 'workspaceLiveChange'], [$result[0], $result[1]['reason'] ?? null], json_encode($change, JSON_THROW_ON_ERROR));
            self::assertSame($before, [$this->rows(), $this->rows('tt_content')], 'Rolled back, drafts included');
        }
        TamperingLiveHook::$change = [];
    }

    #[Test]
    public function firstVersionRefusedWhenTsconfigDisablesIt(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $before = [$this->rows(), $this->rows('tt_content')];
        $field = $this->field();
        self::assertSame(['firstVersion', 'firstVersion', true], [$field['createReason'], $field['sortReason'], $field['workspace']['firstVersion']]);
        self::assertSame(['firstVersion', 'firstVersion'], array_column($field['children'], 'deleteReason'));
        self::assertSame([true, true], array_column($field['children'], 'canHide'), 'Staged visibility needs no parent draft');
        foreach ([['create', []], ['delete', ['childUid' => 3]], ['move', ['childUid' => 3, 'afterUid' => null]]] as [$action, $options]) {
            $refused = $this->intent($field, $action, $options);
            self::assertSame([409, 'firstVersion'], [$refused[0], $refused[1]['reason']], $action);
        }
        self::assertSame($before, [$this->rows(), $this->rows('tt_content')]);
    }

    /** @return array<int, array<string, mixed>> live rows of the element's entries by uid */
    private function liveItems(): array
    {
        $rows = [];
        foreach ($this->rows() as $row) {
            if ((int)$row['t3ver_wsid'] === 0 && $row['slot'] === 'items' && (int)$row['owner'] === 1) {
                $rows[(int)$row['uid']] = $row;
            }
        }
        return $rows;
    }

    /** @return array<string, mixed>|null */
    private function draftOf(int $live): ?array
    {
        return $this->getConnectionPool()->getConnectionForTable('tx_vee_item')
            ->executeQuery('SELECT * FROM tx_vee_item WHERE t3ver_oid = ? AND t3ver_wsid = 1', [$live])->fetchAssociative() ?: null;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function withoutBookkeeping(array $row): array
    {
        unset($row['sorting'], $row['tstamp']);
        return $row;
    }
}

/** Writes a live column during the request: the narrowed mask must still reject it. */
final class TamperingLiveHook
{
    /** @var array<string, mixed> */
    public static array $change = [];

    /** @param array<string, mixed> $fields */
    public function processDatamap_afterDatabaseOperations(string $status, string $table, int|string $id, array $fields, DataHandler $handler): void
    {
        if ($table === 'tx_vee_item' && $status === 'new' && self::$change !== []) {
            \TYPO3\CMS\Core\Utility\GeneralUtility::makeInstance(\TYPO3\CMS\Core\Database\ConnectionPool::class)
                ->getConnectionForTable('tx_vee_item')->update('tx_vee_item', self::$change, ['uid' => 3]);
        }
    }
}
