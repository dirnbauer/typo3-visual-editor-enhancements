<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

/**
 * WP-P restore: a removal staged in this workspace is undone by Core's discard
 * of the delete placeholder the server finds itself (and of the placeholders the
 * delete cascade left on the entry's translations). The intent names the live
 * uid the listed placeholder shows; version uids are never accepted.
 * Run on SQLite and MariaDB.
 */
final class InlineRestoreTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->addItem(3, ['sorting' => 30]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
    }

    #[Test]
    public function deletePlaceholdersAreListedAndRestoreDiscardsThem(): void
    {
        $this->useWorkspace();
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 3]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        $placeholderVersion = (int)$this->getConnectionPool()->getConnectionForTable('tx_vee_item')
            ->executeQuery('SELECT uid FROM tx_vee_item WHERE t3ver_oid = 3 AND t3ver_wsid = 1 AND t3ver_state = 2')->fetchOne();
        self::assertGreaterThan(0, $placeholderVersion);
        $live = $this->liveRows();

        $field = $this->field();
        $placeholder = $this->placeholderOf($field, 3);
        self::assertSame([true, '', false, 'deleted', ''], [$placeholder['canRestore'], $placeholder['restoreReason'], $placeholder['canDuplicate'], $placeholder['duplicateReason'], $placeholder['verb']]);
        self::assertArrayHasKey('_restore', $placeholder, 'Internal: the server keeps the version uids');
        self::assertArrayNotHasKey('_restore', $this->placeholderOf(InlineRecordService::publicField($field), 3), 'Version uids stay on the server');
        self::assertNotContains($placeholderVersion, array_column($field['children'], 'uid'));
        foreach ($field['children'] as $child) {
            if ($child['state'] !== 'deleted') {
                self::assertArrayNotHasKey('canRestore', $child, 'Restore belongs to delete placeholders only');
            }
        }

        $restored = $this->intent($field, 'restore', ['childUid' => 3]);
        self::assertSame(200, $restored[0], json_encode($restored, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 3, 'translations' => 0], $restored[1]['restored']);
        self::assertSame(['id' => 1, 'firstVersion' => false], $restored[1]['workspace']);
        self::assertSame(0, $this->countRows('tx_vee_item', ['t3ver_wsid' => 1, 't3ver_state' => 2]), 'No delete placeholder left');
        self::assertSame(1, $this->countRows('tx_vee_item', ['t3ver_oid' => 3, 't3ver_wsid' => 1, 't3ver_state' => 0]), 'Drafted again below the drafted parent');
        self::assertSame($live, $this->liveRows(), 'Live rows byte-identical');

        $field = $this->field();
        self::assertSame(['modified', 'modified'], array_column($field['children'], 'state'));
        self::assertSame([1, 3], array_column($field['children'], 'liveUid'));
        self::assertSame(['', ''], [$field['createReason'], $field['sortReason']], 'The collection stays editable');
        self::assertSame([409, 'stale'], $this->reasonOf($this->intent($field, 'restore', ['childUid' => 3])), 'Nothing left to restore');
    }

    #[Test]
    public function restoreInLiveIsRefusedAndVersionUidsOrListedEntriesAreStale(): void
    {
        $before = $this->rows();
        self::assertSame([409, 'restoreLive'], $this->reasonOf($this->intent($this->field(), 'restore', ['childUid' => 3])));
        self::assertSame($before, $this->rows());

        $this->useWorkspace();
        $this->intent($this->field(), 'delete', ['childUid' => 3]);
        $version = (int)$this->getConnectionPool()->getConnectionForTable('tx_vee_item')
            ->executeQuery('SELECT uid FROM tx_vee_item WHERE t3ver_oid = 3 AND t3ver_state = 2')->fetchOne();
        $field = $this->field();
        $drafts = $this->rows();
        foreach ([$version, $field['uids'][0], 99] as $forged) {
            self::assertSame([409, 'stale'], $this->reasonOf($this->intent($field, 'restore', ['childUid' => $forged])), 'childUid ' . $forged);
        }
        self::assertSame($drafts, $this->rows(), 'Nothing discarded');
    }

    #[Test]
    public function restoreAlsoDiscardsTheTranslationPlaceholdersOfTheEntry(): void
    {
        $this->writeSite();
        $this->addItem(5, ['origin' => 3, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 2]);
        $this->useWorkspace();
        $live = $this->liveRows();
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 3]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(1, $removed[1]['deleted']['translations']);
        self::assertSame(1, $this->countRows('tx_vee_item', ['t3ver_oid' => 5, 't3ver_wsid' => 1, 't3ver_state' => 2]), 'Core marked the translation for deletion');
        $placeholder = $this->placeholderOf($this->field(), 3);
        self::assertSame([1, true], [$placeholder['cascade']['translations'], $placeholder['canRestore']]);
        $live = $this->liveRowsWithoutBookkeeping($live);

        // An editor without the translation's language may not discard its placeholder.
        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0');
        $GLOBALS['BE_USER']->workspace = 1;
        $this->getConnectionPool()->getConnectionForTable('sys_workspace')->update('sys_workspace', ['members' => 'be_users_2', 'adminusers' => 'be_users_2'], ['uid' => 1]);
        $GLOBALS['BE_USER']->setWorkspace(1);
        $field = $this->field();
        $placeholder = $this->placeholderOf($field, 3);
        self::assertSame([false, 'rights'], [$placeholder['canRestore'], $placeholder['restoreReason']]);
        self::assertSame([409, 'rights'], $this->reasonOf($this->intent($field, 'restore', ['childUid' => 3])));

        $this->setUpBackendUser(1)->workspace = 1;
        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 1;
        $restored = $this->intent($this->field(), 'restore', ['childUid' => 3]);
        self::assertSame(200, $restored[0], json_encode($restored, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 3, 'translations' => 1], $restored[1]['restored']);
        self::assertSame(0, $this->countRows('tx_vee_item', ['t3ver_wsid' => 1, 't3ver_state' => 2]), 'Entry and translation placeholders discarded');
        self::assertSame($live, $this->liveRowsWithoutBookkeeping($this->liveRows()));
        self::assertContains(3, array_column($this->field()['children'], 'liveUid'));
        self::assertContains(5, array_column($this->field('vee_items', 'tt_content', 2)['children'], 'liveUid'), 'The translation is back in the German list');
    }

    #[Test]
    public function restoreOfAnEntryWithNestedMembersDiscardsTheirPlaceholdersToo(): void
    {
        $this->addItem(20, ['owner' => 3, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 1], ['uid' => 3]);
        $this->useWorkspace();
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 3]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(1, $removed[1]['deleted']['children']);
        $live = $this->liveRowsWithoutBookkeeping($this->liveRows());
        $restored = $this->intent($this->field(), 'restore', ['childUid' => 3]);
        self::assertSame(200, $restored[0], json_encode($restored, JSON_THROW_ON_ERROR));
        self::assertSame(0, $this->countRows('tx_vee_item', ['t3ver_wsid' => 1, 't3ver_state' => 2]), 'Core discards the nested placeholders with the entry');
        self::assertSame($live, $this->liveRowsWithoutBookkeeping($this->liveRows()));
        // Not drafted again (Core would version its nested members with live bookkeeping):
        // a live entry below a drafted parent keeps structure refused, as after a discard in the Workspaces module.
        self::assertSame('workspace', $this->field()['createReason']);
    }

    /**
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private function placeholderOf(array $field, int $liveUid): array
    {
        foreach ($field['children'] as $child) {
            if ($child['state'] === 'deleted' && $child['uid'] === $liveUid) {
                return $child;
            }
        }
        self::fail('No delete placeholder listed for ' . $liveUid);
    }

    /**
     * @param array{int, array<string, mixed>} $result
     * @return array{int, mixed}
     */
    private function reasonOf(array $result): array
    {
        return [$result[0], $result[1]['reason'] ?? null];
    }

    /** @return array<string, array<string, mixed>> */
    private function liveRows(): array
    {
        $rows = [];
        foreach (['tx_vee_item', 'tt_content'] as $table) {
            foreach ($this->rows($table) as $row) {
                if ((int)$row['t3ver_wsid'] === 0) {
                    $rows[$table . ':' . $row['uid']] = $row;
                }
            }
        }
        return $rows;
    }

    /**
     * @param array<string, array<string, mixed>> $rows
     * @return array<string, array<string, mixed>>
     */
    private function liveRowsWithoutBookkeeping(array $rows): array
    {
        foreach ($rows as &$row) {
            unset($row['sorting'], $row['tstamp']);
        }
        return $rows;
    }
}
