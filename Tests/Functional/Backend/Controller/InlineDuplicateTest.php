<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;

/**
 * WP-P duplicate: Core's copy of a leaf entry, directly after its source, in its
 * own language only; the parent list re-registered like create; hidden in live
 * under createHidden. Refused below connected translations and for entries with
 * nested members or media. Run on SQLite and MariaDB.
 */
final class InlineDuplicateTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->addItem(3, ['sorting' => 30, 'title' => 'Third']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
    }

    #[Test]
    public function duplicateOfALeafInLiveIsHiddenAndPlacedDirectlyAfterItsSource(): void
    {
        $source = $this->row(1);
        $field = $this->field();
        self::assertSame([[true, ''], [true, '']], array_map(static fn(array $child): array => [$child['canDuplicate'], $child['duplicateReason']], $field['children']));
        $result = $this->intent($field, 'duplicate', ['childUid' => 1]);
        self::assertSame(200, $result[0], json_encode($result, JSON_THROW_ON_ERROR));
        $copy = (int)$result[1]['uid'];
        self::assertGreaterThan(3, $copy);
        self::assertSame(['uid' => $copy, 'table' => 'tx_vee_item', 'hidden' => true, 'hiddenField' => 'hidden'], $result[1]['created']);
        self::assertSame(['uid' => 1], $result[1]['duplicated']);

        $row = $this->row($copy);
        self::assertSame(['Existing', 1, 'tt_content', 'items', 1, 0, 0], [$row['title'], (int)$row['owner'], $row['owner_table'], $row['slot'], (int)$row['hidden'], (int)$row['lang'], (int)$row['deleted']]);
        self::assertSame(self::withoutBookkeeping($source), self::withoutBookkeeping($this->row(1)), 'The source keeps its content (the list renumbers sorting)');
        self::assertSame([1, 2, 3], [(int)$this->row(1)['sorting'], (int)$row['sorting'], (int)$this->row(3)['sorting']]);
        $field = $this->field();
        self::assertSame([1, $copy, 3], $field['uids'], 'Directly after its source');
        self::assertSame(3, (int)$this->row(1, 'tt_content')['vee_items'], 'Registered in the parent list');

        // The collection is now full (maxitems 3).
        self::assertSame(['max', 'max', 'max'], array_column($field['children'], 'duplicateReason'));
        $before = $this->rows();
        self::assertSame([409, 'max'], $this->reasonOf($this->intent($field, 'duplicate', ['childUid' => 3])));
        self::assertSame($before, $this->rows());
    }

    #[Test]
    public function duplicateWithCreateHiddenOffKeepsTheSourceVisibilityAndTsconfigCanSwitchItOff(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.createHidden = 0');
        $result = $this->intent($this->field(), 'duplicate', ['childUid' => 3]);
        self::assertSame(200, $result[0], json_encode($result, JSON_THROW_ON_ERROR));
        self::assertFalse($result[1]['created']['hidden']);
        self::assertSame([1, 3, (int)$result[1]['uid']], $this->field()['uids']);

        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['deleted' => 1], ['uid' => (int)$result[1]['uid']]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->setPageTsConfig("tx_visualeditorenhancements.inlineRecords.createHidden = 0\ntx_visualeditorenhancements.inlineRecords.duplicate = 0");
        $field = $this->field();
        self::assertSame(['controls', 'controls'], array_column($field['children'], 'duplicateReason'));
        self::assertSame('', $field['createReason'], 'Only duplicate is switched off');
        $before = $this->rows();
        self::assertSame([409, 'controls'], $this->reasonOf($this->intent($field, 'duplicate', ['childUid' => 1])));
        self::assertSame([409, 'stale'], $this->reasonOf($this->intent($this->field(), 'duplicate', ['childUid' => 99])));
        self::assertSame($before, $this->rows());
    }

    #[Test]
    public function duplicateInAWorkspaceCreatesANewDraftAndLeavesLiveRowsUntouched(): void
    {
        $this->useWorkspace();
        $live = [$this->rows(), $this->rows('tt_content')];
        $field = $this->field();
        self::assertTrue($field['workspace']['firstVersion'], 'No draft yet: the duplicate creates the first one (firstVersion = 1)');
        $result = $this->intent($field, 'duplicate', ['childUid' => 3]);
        self::assertSame(200, $result[0], json_encode($result, JSON_THROW_ON_ERROR));
        self::assertSame(['id' => 1, 'firstVersion' => true], $result[1]['workspace']);
        self::assertFalse($result[1]['created']['hidden'], 'Workspaces create visible entries');
        $copy = $this->row((int)$result[1]['uid']);
        self::assertSame([1, 1, 0, 'Third'], [(int)$copy['t3ver_wsid'], (int)$copy['t3ver_state'], (int)$copy['t3ver_oid'], $copy['title']]);
        $field = $this->field();
        self::assertSame(['modified', 'modified', 'new'], array_column($field['children'], 'state'));
        self::assertSame((int)$copy['uid'], $field['children'][2]['uid']);
        foreach ($live[0] as $row) {
            $after = $this->row((int)$row['uid']);
            self::assertSame(self::withoutBookkeeping($row), self::withoutBookkeeping($after), 'Live entry ' . $row['uid'] . ': only sorting/tstamp bookkeeping');
        }
        self::assertSame($live[1][0], $this->rows('tt_content')[0], 'Live parent byte-identical');

        // Later duplicates on drafts leave live rows byte-identical.
        $snapshot = array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0));
        $again = $this->intent($field, 'duplicate', ['childUid' => (int)$copy['uid']]);
        self::assertSame(409, $again[0], 'The collection is full (maxitems 3)');
        self::assertSame('max', $again[1]['reason']);
        self::assertSame($snapshot, array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0)));
    }

    #[Test]
    public function duplicateBelowAConnectedTranslatedParentIsRefused(): void
    {
        $this->addItem(5, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 2]);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame('connected', $field['translationMode']);
        self::assertSame([[false, 'copyUnsupported']], array_map(static fn(array $child): array => [$child['canDuplicate'], $child['duplicateReason']], $field['children']));
        $before = [$this->rows(), $this->rows('tt_content')];
        self::assertSame([409, 'copyUnsupported'], $this->reasonOf($this->intent($field, 'duplicate', ['childUid' => 5])));
        self::assertSame($before, [$this->rows(), $this->rows('tt_content')]);
        self::assertSame(['', ''], array_column($this->field()['children'], 'duplicateReason'), 'The default language stays duplicable');
    }

    #[Test]
    public function duplicateOfAnEntryWithNestedMembersOrMediaIsRefused(): void
    {
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 1], ['uid' => 1]);
        $this->getConnectionPool()->getConnectionForTable('sys_file_reference')->insert('sys_file_reference', [
            'uid' => 1, 'pid' => 666, 'uid_local' => 1, 'uid_foreign' => 3, 'tablenames' => 'tx_vee_item', 'fieldname' => 'media',
        ]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['media' => 1], ['uid' => 3]);
        $field = $this->field();
        self::assertSame(['copyUnsupported', 'copyUnsupported'], array_column($field['children'], 'duplicateReason'));
        $before = [$this->rows(), $this->rows('tt_content'), $this->rows('sys_file_reference')];
        foreach ([1, 3] as $uid) {
            self::assertSame([409, 'copyUnsupported'], $this->reasonOf($this->intent($field, 'duplicate', ['childUid' => $uid])));
        }
        self::assertSame($before, [$this->rows(), $this->rows('tt_content'), $this->rows('sys_file_reference')]);
    }

    /**
     * @param array{int, array<string, mixed>} $result
     * @return array{int, mixed}
     */
    private function reasonOf(array $result): array
    {
        return [$result[0], $result[1]['reason'] ?? null];
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
