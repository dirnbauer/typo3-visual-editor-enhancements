<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;

/**
 * Staged visibility/title writes on a live entry in a workspace (generic
 * /visual-editor/save). Core auto-versions the entry together with its own
 * nested inline/file members and renumbers their live sorting and tstamp
 * (copyRecord_processRelation -> RelationHandler::writeForeignField). That is a
 * first version with live bookkeeping: refused under firstVersion = 0, in the
 * payload and on the server. A leaf entry is versioned alone
 * (childHiddenToggleInWorkspaceCreatesChildDraftOnly).
 */
final class InlineStagedChildWriteTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 5, 'title' => 'Feature A']);
        $this->addItem(21, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 7, 'title' => 'Feature B']);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 2], ['uid' => 1]);
        $this->useWorkspace();
    }

    #[Test]
    public function stagedWriteOnEntryWithNestedMembersIsRefusedUnderFirstVersionZero(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $before = [$this->rows(), $this->rows('tt_content')];
        $child = $this->field()['children'][0];
        // The eye follows firstVersion; the title is an ordinary text edit (the page editable's write).
        self::assertSame([false, 'firstVersion', true, ''], [$child['canHide'], $child['hideReason'], $child['canEditLabel'], $child['labelReason']]);

        foreach ([['hidden' => 1], ['hidden' => 1, 'title' => 'Renamed']] as $values) {
            $refused = $this->save(['data' => ['tx_vee_item' => [1 => $values]]]);
            self::assertSame([409, 'firstVersion'], [$refused[0], $refused[1]['reason'] ?? null], json_encode($refused, JSON_THROW_ON_ERROR));
        }
        self::assertSame($before, [$this->rows(), $this->rows('tt_content')], 'Nothing written: no draft, live features byte-identical');

        // A text edit is what the page editable sends: Core versions it as for any Visual Editor save.
        $saved = $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Renamed']]]]);
        self::assertSame(200, $saved[0], json_encode($saved, JSON_THROW_ON_ERROR));

        // The nested feature itself is a leaf: staged writes on it stay available.
        $feature = $this->field('nested', 'tx_vee_item', 1)['children'][0];
        self::assertSame([true, ''], [$feature['canHide'], $feature['hideReason']]);
    }

    #[Test]
    public function stagedWriteOnEntryWithNestedMembersRenumbersOnlyNestedBookkeepingUnderFirstVersionOne(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 1');
        $entry = $this->row(1);
        $features = [$this->row(20), $this->row(21)];
        $child = $this->field()['children'][0];
        self::assertSame([true, ''], [$child['canHide'], $child['hideReason']]);

        $saved = $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]]);
        self::assertSame(200, $saved[0], json_encode($saved, JSON_THROW_ON_ERROR));
        self::assertSame($entry, $this->row(1), 'Live entry byte-identical');
        foreach ($features as $index => $feature) {
            $after = $this->row((int)$feature['uid']);
            self::assertSame(self::withoutBookkeeping($feature), self::withoutBookkeeping($after), 'Only sorting and tstamp of the nested live rows');
            self::assertSame($index + 1, (int)$after['sorting']);
        }
        self::assertSame(3, $this->countRows('tx_vee_item', ['t3ver_wsid' => 1]), 'Core versioned the entry with both features');
        self::assertSame(0, $this->countRows('tt_content', ['t3ver_wsid' => 1]), 'No parent draft');
    }

    #[Test]
    public function stagedWriteIsNotRestrictedWhenCollectionEditingIsOff(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 0;
        // Without the feature the extension offers no control; the vendor's own save stays Core's.
        $saved = $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Renamed']]]]);
        self::assertSame(200, $saved[0], json_encode($saved, JSON_THROW_ON_ERROR));
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
