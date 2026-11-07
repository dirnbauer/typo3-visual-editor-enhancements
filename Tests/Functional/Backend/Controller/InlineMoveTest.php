<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Utility\BackendUtility;

/**
 * WP-B: move = the parent's inline list in the new order, as FormEngine posts it;
 * Core's writeForeignField renumbers the members.
 */
final class InlineMoveTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $items = $this->getConnectionPool()->getConnectionForTable('tx_vee_item');
        foreach ([2 => 30, 3 => 50] as $uid => $sorting) {
            $items->insert('tx_vee_item', ['uid' => $uid, 'pid' => 666, 'title' => 'Entry ' . $uid, 'owner' => 1, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => $sorting]);
        }
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 3], ['uid' => 1]);
    }

    #[Test]
    public function reorderRewritesChildSortingInSubmittedOrderAndLeavesParentContentUntouched(): void
    {
        $field = $this->field();
        self::assertSame([1, 2, 3], $field['uids']);
        self::assertTrue($field['canSort']);
        self::assertSame([[false, true], [true, true], [true, false]], array_map(static fn(array $c): array => [$c['canMoveUp'], $c['canMoveDown']], $field['children']));
        $parent = BackendUtility::getRecord('tt_content', 1);

        $moved = $this->intent($field, 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 3, 'position' => 1], $moved[1]['moved']);
        self::assertSame([3, 1, 2], $this->sortedUids());
        // Core's own bookkeeping, exactly as on a FormEngine sort save: tstamp and the
        // translation diff source of the parent. Every content column stays as it was.
        $bookkeeping = ['tstamp' => true, 'l18n_diffsource' => true];
        $after = BackendUtility::getRecord('tt_content', 1) ?? [];
        self::assertSame(array_diff_key($parent ?? [], $bookkeeping), array_diff_key($after, $bookkeeping), 'Parent content untouched');
        self::assertSame([3, 1, 2], $moved[1]['collections'][0]['uids']);
        self::assertNotSame($field['revision'], $moved[1]['collections'][0]['revision'], 'A move changes the revision');
        self::assertSame(409, $this->intent($field, 'move', ['childUid' => 1, 'afterUid' => 2])[0], 'The old revision is stale');

        $moved = $this->intent($this->field(), 'move', ['childUid' => 3, 'afterUid' => 2]);
        self::assertSame(['uid' => 3, 'position' => 3], $moved[1]['moved']);
        self::assertSame([1, 2, 3], $this->sortedUids());

        $before = $this->rows();
        $noop = $this->intent($this->field(), 'move', ['childUid' => 2, 'afterUid' => 1]);
        self::assertSame(200, $noop[0], 'An unchanged order is a successful no-op');
        self::assertSame($before, $this->rows(), 'A no-op writes nothing, not even tstamp');
    }

    #[Test]
    public function reorderWithForeignSetOrDuplicateUidsIsStaleWithoutWrites(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', ['uid' => 9, 'pid' => 666, 'owner' => 1, 'owner_table' => 'tt_content', 'slot' => 'shared', 'title' => 'Other relation', 'sorting' => 1]);
        $before = $this->rows();
        $field = $this->field();
        foreach ([['childUid' => 9, 'afterUid' => null], ['childUid' => 1, 'afterUid' => 9], ['childUid' => 404, 'afterUid' => 1]] as $options) {
            $result = $this->intent($field, 'move', $options);
            self::assertSame([409, 'stale'], [$result[0], $result[1]['reason']], json_encode($options, JSON_THROW_ON_ERROR));
        }
        self::assertSame(400, $this->intent($field, 'move', ['childUid' => 2, 'afterUid' => 2])[0], 'After itself is malformed');
        self::assertSame(400, $this->intent($field, 'move', ['childUid' => 2, 'afterUid' => 1, 'uids' => [2, 1, 3]])[0], 'No client-sent order');
        self::assertSame(400, $this->intent($field, 'move', ['childUid' => 2])[0], 'afterUid must be explicit');
        self::assertSame($before, $this->rows());
    }

    #[Test]
    public function reorderInWorkspaceTouchesOnlyDraftRows(): void
    {
        $this->useWorkspace();
        $refused = $this->intent($this->field(), 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame([409, 'workspace'], [$refused[0], $refused[1]['reason']], 'Without drafts a move would renumber live rows');
        // FormEngine-style drafts of the parent and every child.
        $this->draftParentAndChild();
        foreach ([2 => 11, 3 => 12] as $live => $draftUid) {
            $draft = $this->row($live);
            $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', [...$draft, 'uid' => $draftUid, 't3ver_oid' => $live, 't3ver_wsid' => 1]);
        }
        $live = array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0));
        $liveParent = BackendUtility::getRecord('tt_content', 1);
        $field = $this->field();
        self::assertSame([10, 11, 12], $field['uids']);
        $moved = $this->intent($field, 'move', ['childUid' => 12, 'afterUid' => null]);
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        self::assertSame($live, array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0)), 'Live rows byte-identical');
        self::assertSame($liveParent, BackendUtility::getRecord('tt_content', 1));
        $drafts = array_column(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 1), 'sorting', 'uid');
        self::assertSame([10 => 2, 11 => 3, 12 => 1], array_map('intval', $drafts));
        self::assertSame([12, 10, 11], $this->field()['uids']);
    }

    #[Test]
    public function reorderRespectsDisabledSortControlAndUnsortedChildTables(): void
    {
        $before = $this->rows();
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['appearance']['enabledControls'] = ['sort' => false];
        self::assertTrue($this->field()['canSort'], 'Drag and drop alone keeps FormEngine reordering');
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['appearance']['enabledControls'] = ['sort' => false, 'dragdrop' => false];
        $field = $this->field();
        self::assertSame([false, 'controls'], [$field['canSort'], $field['sortReason']]);
        self::assertSame([false, false], [$field['children'][1]['canMoveUp'], $field['children'][1]['canMoveDown']]);
        $result = $this->intent($field, 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame([409, 'controls'], [$result[0], $result[1]['reason']]);
        unset($GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['appearance']);

        unset($GLOBALS['TCA']['tx_vee_item']['ctrl']['sortby']);
        $field = $this->field();
        self::assertSame([false, 'unsorted'], [$field['canSort'], $field['sortReason']]);
        $result = $this->intent($field, 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame([409, 'unsorted'], [$result[0], $result[1]['reason']]);
        self::assertSame($before, $this->rows());
    }

    /** @return list<int> */
    private function sortedUids(): array
    {
        $rows = $this->getConnectionPool()->getConnectionForTable('tx_vee_item')
            ->executeQuery("SELECT uid FROM tx_vee_item WHERE slot = 'items' AND deleted = 0 AND t3ver_wsid = 0 ORDER BY sorting, uid")->fetchFirstColumn();
        return array_map('intval', $rows);
    }
}
