<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;

/**
 * WP-P bounded cascade preflight: removing an entry with nested entries or media
 * is offered when every record Core's delete takes along (nested members, their
 * translations, file references) passes the editor's checks within the TSconfig
 * bounds. Fixture: entries 1 and 3 of tt_content 1; entry 1 owns the nested
 * entries 20 and 21, entry 20 owns 22; entry 1 has one image reference.
 * Run on SQLite and MariaDB.
 */
final class InlineCascadeTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->addItem(3, ['sorting' => 30]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 1, 'nested' => 1]);
        $this->addItem(21, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 2]);
        $this->addItem(22, ['owner' => 20, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 2, 'media' => 1], ['uid' => 1]);
        $this->getConnectionPool()->getConnectionForTable('sys_file')->insert('sys_file', ['uid' => 1, 'pid' => 0, 'storage' => 0, 'identifier' => '/fixture.jpg', 'name' => 'fixture.jpg']);
        $this->getConnectionPool()->getConnectionForTable('sys_file_reference')->insert('sys_file_reference', [
            'uid' => 1, 'pid' => 666, 'uid_local' => 1, 'uid_foreign' => 1, 'tablenames' => 'tx_vee_item', 'fieldname' => 'media',
        ]);
    }

    #[Test]
    public function deleteCascadeCountsNestedMembersAndRemovesThemWithTheEntry(): void
    {
        $field = $this->field();
        $entry = $field['children'][0];
        self::assertSame([true, '', ''], [$entry['canDelete'], $entry['deleteReason'], $entry['cascadeReason']]);
        self::assertSame(['translations' => 0, 'languages' => [], 'children' => 3, 'files' => 1, 'truncated' => false], $entry['cascade']);
        self::assertSame(['children' => 0, 'files' => 0, 'truncated' => false], array_intersect_key($field['children'][1]['cascade'], ['children' => 1, 'files' => 1, 'truncated' => 1]));

        $removed = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 1, 'verb' => 'delete', 'translations' => 0, 'children' => 3, 'files' => 1], $removed[1]['deleted']);
        self::assertSame([1, 1, 1, 1, 0], array_map(fn(int $uid): int => (int)$this->row($uid)['deleted'], [1, 20, 21, 22, 3]));
        self::assertSame([3], $this->field()['uids']);
    }

    #[Test]
    public function deleteCascadeRemovesFileReferencesOnlyAndKeepsTheFiles(): void
    {
        $file = $this->row(1, 'sys_file');
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(1, (int)$this->row(1, 'sys_file_reference')['deleted'], 'The reference goes with the entry');
        self::assertSame($file, $this->row(1, 'sys_file'), 'The file stays');
    }

    #[Test]
    public function deleteCascadeBeyondTheBoundsIsRefusedWithItsReasonAndWithoutWrites(): void
    {
        $before = [$this->rows(), $this->rows('sys_file_reference')];
        foreach ([
            'cascade.maxRecords = 3' => ['records', true],
            'cascade.maxDepth = 1' => ['depth', true],
            'cascade.enabled = 0' => ['disabled', false],
        ] as $tsConfig => [$reason, $truncated]) {
            $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.' . $tsConfig);
            $field = $this->field();
            $entry = $field['children'][0];
            self::assertSame([false, 'cascade', $reason, $truncated], [$entry['canDelete'], $entry['deleteReason'], $entry['cascadeReason'], $entry['cascade']['truncated']], $tsConfig);
            self::assertSame(['', ''], [$field['children'][1]['deleteReason'], $field['children'][1]['cascadeReason']], 'A leaf entry is not affected');
            $refused = $this->intent($field, 'delete', ['childUid' => 1]);
            self::assertSame([409, 'cascade'], [$refused[0], $refused[1]['reason'] ?? null], $tsConfig);
            self::assertSame($reason, $refused[1]['collection']['children'][0]['cascadeReason']);
            self::assertSame($before, [$this->rows(), $this->rows('sys_file_reference')]);
        }
        $this->setPageTsConfig("tx_visualeditorenhancements.inlineRecords.cascade.maxRecords = 4\ntx_visualeditorenhancements.inlineRecords.cascade.maxDepth = 2");
        self::assertSame('', $this->field()['children'][0]['deleteReason'], 'Exactly at the bounds');
    }

    #[Test]
    public function deleteCascadeIsRefusedWhenOneDependentFailsTheEditorsRights(): void
    {
        // Every nested entry is editable, the image reference is not (no sys_file_reference right).
        // Language 1 too: Core synchronizes tt_content 1's change into its translation tt_content 2.
        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0,1');
        $before = [$this->rows(), $this->rows('sys_file_reference')];
        $field = $this->field();
        self::assertSame(['cascade', 'rights'], [$field['children'][0]['deleteReason'], $field['children'][0]['cascadeReason']]);
        self::assertSame('', $field['children'][1]['deleteReason']);
        $refused = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame([409, 'cascade'], [$refused[0], $refused[1]['reason'] ?? null]);
        self::assertSame($before, [$this->rows(), $this->rows('sys_file_reference')]);

        // A nested entry on a page outside the editor's content-edit permission.
        $this->restrictedOwnerUser('tt_content,tx_vee_item,sys_file_reference', 'tx_vee_item:hidden', '0,1');
        self::assertSame(['', ''], [$this->field()['children'][0]['deleteReason'], $this->field()['children'][0]['cascadeReason']]);
        $this->getConnectionPool()->getConnectionForTable('pages')->insert('pages', ['uid' => 900, 'pid' => 1, 'title' => 'Locked', 'perms_everybody' => 1, 'perms_userid' => 99, 'perms_groupid' => 99]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['pid' => 900], ['uid' => 22]);
        self::assertSame(['cascade', 'rights'], [$this->field()['children'][0]['deleteReason'], $this->field()['children'][0]['cascadeReason']]);

        $this->restrictedOwnerUser('tt_content,tx_vee_item,sys_file_reference', 'tx_vee_item:hidden', '0,1');
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['pid' => 666], ['uid' => 22]);
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame([1, 1, 1, 1], [(int)$this->row(1)['deleted'], (int)$this->row(20)['deleted'], (int)$this->row(22)['deleted'], (int)$this->row(1, 'sys_file_reference')['deleted']]);
    }

    #[Test]
    public function deleteCascadeInAWorkspaceMarksEveryDependentForDeletionWithoutLiveChange(): void
    {
        $this->useWorkspace();
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 1');
        $live = $this->liveRows();
        $field = $this->field();
        self::assertSame([3, 1], [$field['children'][0]['cascade']['children'], $field['children'][0]['cascade']['files']]);
        $removed = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame('markForDeletion', $removed[1]['deleted']['verb']);
        $after = $this->liveRows();
        foreach ($live as $key => $row) {
            // The relations' sortby (sorting, sorting_foreign) and tstamp: first-version bookkeeping.
            unset($row['sorting'], $row['sorting_foreign'], $row['tstamp'], $after[$key]['sorting'], $after[$key]['sorting_foreign'], $after[$key]['tstamp']);
            self::assertSame($row, $after[$key], 'Live ' . $key . ': only first-version bookkeeping');
        }
        foreach (['tx_vee_item' => [1, 20, 21, 22], 'sys_file_reference' => [1]] as $table => $uids) {
            foreach ($uids as $uid) {
                self::assertSame(1, $this->countRows($table, ['t3ver_oid' => $uid, 't3ver_wsid' => 1, 't3ver_state' => 2]), 'Delete placeholder of ' . $table . ':' . $uid);
            }
        }
        $field = $this->field();
        $states = array_column($field['children'], 'state', 'liveUid');
        ksort($states);
        self::assertSame([1 => 'deleted', 3 => 'modified'], $states);
        $placeholder = array_values(array_filter($field['children'], static fn(array $child): bool => $child['state'] === 'deleted'))[0];
        self::assertSame([1, true, ''], [$placeholder['uid'], $placeholder['canRestore'], $placeholder['restoreReason']]);
    }

    #[Test]
    public function deleteRespectsEnableCascadingDeleteFalse(): void
    {
        $GLOBALS['TCA']['tx_vee_item']['columns']['nested']['config']['behaviour']['enableCascadingDelete'] = false;
        $GLOBALS['TCA']['tx_vee_item']['columns']['media']['config']['behaviour']['enableCascadingDelete'] = false;
        $this->get(TcaSchemaFactory::class)->rebuild($GLOBALS['TCA']);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.cascade.maxRecords = 0');
        $entry = $this->field()['children'][0];
        self::assertSame(['', 0, 0], [$entry['deleteReason'], $entry['cascade']['children'], $entry['cascade']['files']], 'Core keeps these members: nothing to prove');
        self::assertSame([false, 'copyUnsupported'], [$entry['canDuplicate'], $entry['duplicateReason']], 'Core would still copy them');
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame([1, 0, 0, 0, 0], [(int)$this->row(1)['deleted'], (int)$this->row(20)['deleted'], (int)$this->row(21)['deleted'], (int)$this->row(22)['deleted'], (int)$this->row(1, 'sys_file_reference')['deleted']]);
    }

    /** @return array<string, array<string, mixed>> live rows of every table the cascade reaches */
    private function liveRows(): array
    {
        $rows = [];
        foreach (['tx_vee_item', 'sys_file_reference', 'tt_content'] as $table) {
            foreach ($this->rows($table) as $row) {
                if ((int)$row['t3ver_wsid'] === 0) {
                    $rows[$table . ':' . $row['uid']] = $row;
                }
            }
        }
        return $rows;
    }
}
