<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use Webconsulting\VisualEditorEnhancements\Service\CollectionFieldIndex;
use Webconsulting\VisualEditorEnhancements\Service\FieldOptionsService;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

/**
 * WP-A: the capability payload the Entries inspector renders from, and the two
 * generic-save paths (hidden, label) the inspector stages through the vendor store.
 */
final class InlineCapabilityPayloadTest extends InlineRecordTestCase
{
    #[Test]
    public function controlsMapChildTitleAndStatesArePublished(): void
    {
        $field = $this->field();
        self::assertSame(['new' => true, 'delete' => true, 'hide' => true, 'sort' => true, 'dragdrop' => true, 'localize' => true, 'info' => true], $field['controls']);
        self::assertSame('Entry', $field['childTitle']);
        self::assertSame('title', $field['labelField']);
        self::assertSame('hidden', $field['hiddenField']);
        self::assertSame('', $field['typeField']);
        self::assertSame('default', $field['translationMode']);
        self::assertSame(0, $field['languageId']);
        self::assertSame(['id' => 0, 'title' => '', 'firstVersion' => false], $field['workspace']);
        self::assertSame([], $field['requiredBackend']);
        $child = $field['children'][0];
        self::assertSame(['live', 1, 'tx_vee_item'], [$child['state'], $child['liveUid'], $child['table']]);
        self::assertTrue($child['canHide']);
        self::assertSame('', $child['hideReason']);
        self::assertTrue($child['canEditLabel']);
        self::assertSame('Existing', $child['labelValue']);
        self::assertFalse($child['translationOnly']);
        // tt_content 2 is the parent's connected translation into language 1.
        self::assertSame([1], $child['untranslated']);
        self::assertSame('min', $child['deleteReason']);

        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', ['uid' => 2, 'pid' => 666, 'origin' => 1, 'lang' => 1, 'title' => 'Übersetzt']);
        self::assertSame([], $this->field()['children'][0]['untranslated']);

        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['appearance']['enabledControls'] = ['hide' => false, 'delete' => false, 'new' => false];
        $created = $this->getConnectionPool()->getConnectionForTable('tx_vee_item');
        $created->insert('tx_vee_item', ['uid' => 3, 'pid' => 666, 'title' => 'Second', 'owner' => 1, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $field = $this->field();
        self::assertFalse($field['controls']['hide']);
        self::assertSame('controls', $field['createReason']);
        foreach ($field['children'] as $entry) {
            self::assertSame(['controls', 'controls'], [$entry['hideReason'], $entry['deleteReason']], 'A disabled control always carries the reason controls');
        }
    }

    #[Test]
    public function translatedChildrenCarryTheirParentsLanguageContext(): void
    {
        $content = $this->getConnectionPool()->getConnectionForTable('tt_content');
        $items = $this->getConnectionPool()->getConnectionForTable('tx_vee_item');
        $items->insert('tx_vee_item', ['uid' => 2, 'pid' => 666, 'origin' => 1, 'lang' => 1, 'title' => 'Übersetzt', 'owner' => 2, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => 1]);
        $items->insert('tx_vee_item', ['uid' => 3, 'pid' => 666, 'origin' => 0, 'lang' => 1, 'title' => 'Nur Deutsch', 'owner' => 2, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => 2]);
        $content->update('tt_content', ['vee_items' => 2], ['uid' => 2]);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['connected', 1], [$field['translationMode'], $field['languageId']]);
        self::assertSame([false, true], array_column($field['children'], 'translationOnly'));

        $content->update('tt_content', ['l18n_parent' => 0], ['uid' => 2]);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame('free', $field['translationMode']);
        self::assertSame([false, false], array_column($field['children'], 'translationOnly'), 'Free mode has no structure source to diverge from');
    }

    #[Test]
    public function deletePlaceholdersAreListedReadOnly(): void
    {
        $this->useWorkspace();
        $this->draftParentAndChild();
        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        $field = $this->field();
        self::assertSame(['modified', 'new'], array_column($field['children'], 'state'));
        self::assertSame(['markForDeletion', 'discard'], array_column($field['children'], 'verb'));
        $removed = $this->act($field, 'delete', 10);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 10, 'verb' => 'markForDeletion', 'translations' => 0], $removed[1]['deleted']);

        $field = $this->field();
        $placeholder = array_values(array_filter($field['children'], static fn(array $child): bool => $child['state'] === 'deleted'));
        self::assertCount(1, $placeholder, 'The delete placeholder is listed instead of silently skipped');
        self::assertSame(1, $placeholder[0]['uid'], 'Listed under its live identity');
        self::assertSame(1, $placeholder[0]['liveUid']);
        self::assertSame(['', false, 'deleted', false, false], [$placeholder[0]['verb'], $placeholder[0]['canDelete'], $placeholder[0]['deleteReason'], $placeholder[0]['canHide'], $placeholder[0]['canEditLabel']]);
        self::assertNotContains(1, $field['uids'], 'A placeholder is not a member the parent list is rewritten with');
        self::assertNotContains(10, array_column($field['children'], 'uid'), 'No placeholder version uid in the payload');
        self::assertArrayNotHasKey('contextualUrl', $placeholder[0]);
        self::assertSame(409, $this->act($field, 'delete', 1)[0], 'A listed placeholder is not a delete target');
    }

    #[Test]
    public function childHiddenToggleThroughGenericSaveRequiresNonExcludeRight(): void
    {
        $this->restrictedOwnerUser('tt_content,tx_vee_item', '');
        $child = $this->field()['children'][0];
        self::assertSame([false, 'rights'], [$child['canHide'], $child['hideReason']]);
        $before = $this->row(1);
        // DataHandler drops the exclude field silently: success, nothing written.
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]])[0]);
        self::assertSame($before['hidden'], $this->row(1)['hidden']);

        $this->restrictedOwnerUser('tt_content,tx_vee_item');
        $child = $this->field()['children'][0];
        self::assertSame([true, ''], [$child['canHide'], $child['hideReason']]);
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]])[0]);
        self::assertSame(1, (int)$this->row(1)['hidden']);
        self::assertTrue($this->field()['children'][0]['hidden']);
    }

    #[Test]
    public function childLabelEditThroughGenericSaveIsAuthorizedByOwnerChain(): void
    {
        $this->restrictedOwnerUser('tt_content,tx_vee_item');
        $child = $this->field()['children'][0];
        self::assertSame([true, 'Existing'], [$child['canEditLabel'], $child['labelValue']]);
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Renamed']]]])[0]);
        self::assertSame('Renamed', $this->row(1)['title']);

        // Without the owner's table right the same label write is refused before mutation.
        $this->restrictedOwnerUser('tx_vee_item');
        self::assertSame(403, $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Denied']]]])[0]);
        self::assertSame('Renamed', $this->row(1)['title']);

        $this->restrictedOwnerUser('tt_content,tx_vee_item');
        $GLOBALS['TCA']['tx_vee_item']['columns']['title']['exclude'] = true;
        $child = $this->field()['children'][0];
        self::assertSame([false, 'rights'], [$child['canEditLabel'], $child['labelReason']]);
        $GLOBALS['TCA']['tx_vee_item']['columns']['title']['config']['enableRichtext'] = true;
        self::assertSame('', $this->field()['labelField'], 'Rich text labels are edited in the form, not the inspector');
    }

    #[Test]
    public function childHiddenToggleInWorkspaceCreatesChildDraftOnly(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $this->useWorkspace();
        $liveParent = BackendUtility::getRecord('tt_content', 1);
        $liveChild = $this->row(1);
        $field = $this->field();
        self::assertSame('firstVersion', $field['createReason'], 'Structure waits for drafts (TSconfig firstVersion = 0)');
        self::assertTrue($field['workspace']['firstVersion']);
        self::assertSame('Fixture', $field['workspace']['title']);
        $child = $field['children'][0];
        self::assertSame(['live', true, 'firstVersion'], [$child['state'], $child['canHide'], $child['deleteReason']]);

        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]])[0]);
        self::assertSame($liveChild, $this->row(1), 'Live child byte-identical');
        self::assertSame($liveParent, BackendUtility::getRecord('tt_content', 1), 'Live parent byte-identical');
        $drafts = array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 1));
        self::assertCount(1, $drafts);
        self::assertSame([1, 1], [(int)$drafts[0]['t3ver_oid'], (int)$drafts[0]['hidden']]);
        self::assertSame(0, $this->countRows('tt_content', ['t3ver_wsid' => 1]), 'No parent draft');
        self::assertSame('modified', $this->field()['children'][0]['state']);
    }

    #[Test]
    public function collectionFieldIndexListsInlineFieldsPerRecordTypeAndHonoursDisabledTables(): void
    {
        $index = $this->get(CollectionFieldIndex::class);
        self::assertSame(['tt_content' => ['text' => ['vee_items', 'vee_shared']]], $index->build(666));

        $pages = $this->getConnectionPool()->getConnectionForTable('pages');
        $runtime = $this->get(\TYPO3\CMS\Core\Cache\CacheManager::class)->getCache('runtime');
        $pages->update('pages', ['TSconfig' => 'TCEFORM.tt_content.vee_shared.disabled = 1'], ['uid' => 666]);
        $runtime->flush();
        self::assertSame(['tt_content' => ['text' => ['vee_items']]], $index->build(666));
        $pages->update('pages', ['TSconfig' => 'tx_visualeditorenhancements.inlineRecords.tables.tx_vee_item.enabled = 0'], ['uid' => 666]);
        $runtime->flush();
        self::assertSame([], $index->build(666));
        $pages->update('pages', ['TSconfig' => ''], ['uid' => 666]);
        $runtime->flush();

        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 0;
        self::assertSame([], $index->build(666), 'Preference off: nothing to announce');
        $this->restrictedOwnerUser('tt_content');
        self::assertSame([], $index->build(666), 'No child table right: no field names either');
        $this->restrictedOwnerUser('tt_content,tx_vee_item');
        self::assertSame(['tt_content' => ['text' => ['vee_items', 'vee_shared']]], $index->build(666));
        self::assertLessThan(10240, strlen(json_encode($index->build(666), JSON_THROW_ON_ERROR)));
    }

    #[Test]
    public function publicFieldStripsInternalIdentitiesForNewCapabilities(): void
    {
        $internal = ['_defaults', '_config', 'deleteUid'];
        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0]);
        self::assertSame(['uid', 'table', 'hidden', 'hiddenField'], array_keys($created[1]['created']));
        self::assertSame([$created[1]['uid'], 'tx_vee_item', true, 'hidden'], array_values($created[1]['created']));
        self::assertSame(['id' => 0, 'firstVersion' => false], $created[1]['workspace']);
        self::assertNoKeys($created[1], $internal);
        $options = $this->get(FieldOptionsService::class)->buildFieldOptions('tt_content', 1, BackendUtility::getRecord('tt_content', 1) ?? [], $this->request());
        self::assertNoKeys($options, $internal);
        self::assertNoKeys(InlineRecordService::publicField($this->field()), $internal);
        self::assertSame(200, $this->act($this->field(), 'delete', $created[1]['uid'])[0]);

        $this->useWorkspace();
        $this->draftParentAndChild();
        self::assertSame(200, $this->act($this->field(), 'create')[0], 'min 1: add one before removing one');
        self::assertSame(200, $this->act($this->field(), 'delete', 10)[0]);
        $public = InlineRecordService::publicField($this->field());
        self::assertNoKeys($public, $internal);
        self::assertNotContains(10, array_column($public['children'], 'uid'));
    }
}
