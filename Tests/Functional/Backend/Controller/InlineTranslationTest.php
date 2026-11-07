<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;

/**
 * WP-C: translations follow FormEngine (parity on connected translated parents),
 * removal cascades to editable translations after a counted confirmation, and
 * sync runs Core's inlineLocalizeSynchronize. Each part has its 1.5 restore key.
 *
 * Fixture: tt_content 2 is the connected German translation of tt_content 1.
 */
final class InlineTranslationTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->writeSite();
    }

    #[Test]
    public function translatedParentAddsTranslationOnlyRowInParentLanguage(): void
    {
        $this->translateChild(2, 1);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['connected', 1, '', true], [$field['translationMode'], $field['languageId'], $field['createReason'], $field['hiddenPerLanguage']]);
        $created = $this->intent($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        $row = $this->row((int)$created[1]['uid']);
        self::assertSame([1, 0, 2, 'tt_content', 'items', 1], [(int)$row['lang'], (int)$row['origin'], (int)$row['owner'], $row['owner_table'], $row['slot'], (int)$row['hidden']]);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame([false, true], array_column($field['children'], 'translationOnly'));
        $default = $this->field();
        self::assertSame([], $default['children'][0]['untranslated']);
        self::assertSame([[1, 0, 0]], array_map(static fn(array $l): array => [$l['id'], $l['missing'], $l['orphaned']], $default['translationLanguages']), 'A translation-only row is no orphan');

        // Reorder and removal act on the translated rows only.
        $moved = $this->intent($field, 'move', ['childUid' => (int)$created[1]['uid'], 'afterUid' => null]);
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        $removed = $this->intent($this->field('vee_items', 'tt_content', 2), 'delete', ['childUid' => 2]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['1', '0'], [(string)$this->row(2)['deleted'], (string)$this->row(1)['deleted']], 'Only the German row is removed');
        self::assertSame([1], $this->field()['children'][0]['untranslated']);
    }

    #[Test]
    public function defaultOnlyTsconfigRestoresTranslationRefusal(): void
    {
        $this->translateChild(2, 1);
        $this->addItem(3, ['origin' => 0, 'lang' => 1, 'owner' => 2, 'sorting' => 2]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 2]);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.translatedParents = default-only');
        $before = $this->rows();
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['translation', 'translation'], [$field['createReason'], $field['sortReason']]);
        self::assertSame(['translation', 'translation'], array_column($field['children'], 'deleteReason'));
        foreach ([['create', []], ['delete', ['childUid' => 3]], ['move', ['childUid' => 3, 'afterUid' => null]]] as [$action, $options]) {
            $refused = $this->intent($field, $action, $options);
            self::assertSame([409, 'translation'], [$refused[0], $refused[1]['reason']], $action);
        }
        self::assertSame($before, $this->rows());
    }

    #[Test]
    public function defaultDeleteCascadesToEditableTranslationsAndIsRefusedForInaccessibleOnes(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->translateChild(2, 1);
        $children = $this->field()['children'];
        self::assertSame(['', ['translations' => 1, 'languages' => [1]], []], [$children[0]['deleteReason'], $children[0]['cascade'], $children[0]['untranslated']]);
        self::assertSame([1], $children[1]['untranslated']);

        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0');
        $field = $this->field();
        self::assertSame('translations', $field['children'][0]['deleteReason'], 'A translation this editor cannot edit blocks the cascade');
        self::assertSame('', $field['createReason'], 'Default-language structure stays available');
        $refused = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame([409, 'translations'], [$refused[0], $refused[1]['reason']]);
        self::assertSame(['0', '0'], [(string)$this->row(1)['deleted'], (string)$this->row(2)['deleted']]);

        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0,1');
        $field = $this->field();
        self::assertSame('', $field['children'][0]['deleteReason']);
        $removed = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 1, 'verb' => 'delete', 'translations' => 1], $removed[1]['deleted']);
        self::assertSame(['1', '1', '0'], [(string)$this->row(1)['deleted'], (string)$this->row(2)['deleted'], (string)$this->row(3)['deleted']], 'Core cascades to the translation');
    }

    #[Test]
    public function deleteTranslationsRefuseTsconfigRestoresBlanketRefusal(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->translateChild(2, 1);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.deleteTranslations = refuse');
        $field = $this->field();
        self::assertSame('translations', $field['children'][0]['deleteReason']);
        self::assertSame('', $field['children'][1]['deleteReason'], 'Untranslated leaves stay removable');
        $refused = $this->intent($field, 'delete', ['childUid' => 1]);
        self::assertSame([409, 'translations'], [$refused[0], $refused[1]['reason']]);
        self::assertSame(['0', '0'], [(string)$this->row(1)['deleted'], (string)$this->row(2)['deleted']]);
    }

    #[Test]
    public function syncLocalizesMissingChildrenInDefaultOrderAndKeepsTranslationOnlyRows(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->addItem(4, ['sorting' => 30]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 3], ['uid' => 1]);
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems'] = 4;
        $this->translateChild(2, 1);
        $this->addItem(5, ['origin' => 0, 'lang' => 1, 'owner' => 2, 'sorting' => 2, 'title' => 'Nur Deutsch']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 2]);

        $field = $this->field();
        self::assertSame([['id' => 1, 'title' => 'German', 'parentUid' => 2, 'missing' => 2, 'orphaned' => 0, 'canSync' => true, 'syncReason' => '']], $field['translationLanguages']);
        self::assertSame([true, '', 'localize'], [$field['canSync'], $field['syncReason'], $field['syncDefaultMode']]);
        self::assertSame(400, $this->intent($field, 'sync', ['language' => 1, 'mode' => 'synchronize', 'ids' => [4]])[0]);
        self::assertSame(409, $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize', 'ids' => [1]])[0], 'Already translated');

        $single = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize', 'ids' => [4]]);
        self::assertSame(200, $single[0], json_encode($single, JSON_THROW_ON_ERROR));
        self::assertSame(['language' => 1, 'mode' => 'localize', 'localized' => 1, 'removed' => 0], $single[1]['synced']);
        self::assertSame([1, 0, 4], $this->translatedOrigins());

        $all = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame(200, $all[0], json_encode($all, JSON_THROW_ON_ERROR));
        self::assertSame(1, $all[1]['synced']['localized']);
        self::assertSame([1, 0, 3, 4], $this->translatedOrigins(), 'Default order, translation-only row kept after its anchor');
        $field = $this->field();
        self::assertSame([false, 'syncNone'], [$field['canSync'], $field['syncReason']]);
        $done = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame([409, 'syncNone'], [$done[0], $done[1]['reason']]);
    }

    #[Test]
    public function syncSynchronizeRemovesOrphansOnlyInThatMode(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->addItem(99, ['sorting' => 40, 'deleted' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->translateChild(2, 1);
        $this->addItem(5, ['origin' => 0, 'lang' => 1, 'owner' => 2, 'sorting' => 2]);
        $this->addItem(6, ['origin' => 99, 'lang' => 1, 'owner' => 2, 'sorting' => 3]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 3], ['uid' => 2]);

        self::assertSame([1, 1, true], [$this->field()['translationLanguages'][0]['missing'], $this->field()['translationLanguages'][0]['orphaned'], $this->field()['canSync']]);
        $tooMany = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame([409, 'max'], [$tooMany[0], $tooMany[1]['reason']], 'localize keeps the orphan: 4 entries exceed max 3');
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems'] = 4;
        $localized = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame(200, $localized[0], json_encode($localized, JSON_THROW_ON_ERROR));
        self::assertSame([1, 0], [$localized[1]['synced']['localized'], $localized[1]['synced']['removed']]);
        self::assertSame('0', (string)$this->row(6)['deleted'], 'localize never removes');

        $synchronized = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'synchronize']);
        self::assertSame(200, $synchronized[0], json_encode($synchronized, JSON_THROW_ON_ERROR));
        self::assertSame([0, 1], [$synchronized[1]['synced']['localized'], $synchronized[1]['synced']['removed']]);
        self::assertSame(['1', '0'], [(string)$this->row(6)['deleted'], (string)$this->row(5)['deleted']], 'Orphan removed, translation-only row kept');
    }

    #[Test]
    public function syncRequiresEditAccessOnEveryTranslatedParentAndLanguage(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $before = $this->rows();

        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0');
        $field = $this->field();
        self::assertSame([false, 'rights'], [$field['translationLanguages'][0]['canSync'], $field['translationLanguages'][0]['syncReason']]);
        $refused = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame([409, 'rights'], [$refused[0], $refused[1]['reason']]);
        self::assertSame($before, $this->rows());

        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0,1');
        self::assertTrue($this->field()['canSync']);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.syncTranslations = 0');
        self::assertSame('syncDisabled', $this->field()['translationLanguages'][0]['syncReason']);
        $this->setPageTsConfig('');
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems'] = 1;
        self::assertSame('max', $this->field()['translationLanguages'][0]['syncReason']);
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems'] = 3;
        $synced = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame(200, $synced[0], json_encode($synced, JSON_THROW_ON_ERROR));
        self::assertSame(2, $synced[1]['synced']['localized']);
    }

    #[Test]
    public function syncInWorkspaceIsRefused(): void
    {
        $this->useWorkspace();
        $this->draftParentAndChild();
        $before = $this->rows();
        $field = $this->field();
        self::assertSame([false, 'syncWorkspace'], [$field['canSync'], $field['syncReason']]);
        self::assertSame('syncWorkspace', $field['translationLanguages'][0]['syncReason']);
        $refused = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame([409, 'syncWorkspace'], [$refused[0], $refused[1]['reason']]);
        self::assertSame($before, $this->rows());

        $GLOBALS['BE_USER']->workspace = 0;
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['appearance']['enabledControls'] = ['localize' => false];
        self::assertSame('controls', $this->field()['translationLanguages'][0]['syncReason']);
    }

    #[Test]
    public function defaultDeleteInWorkspaceMarksTranslationsForDeletionWithoutLiveChange(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $this->translateChild(2, 1);
        $this->useWorkspace();
        $this->draftParentAndChild();
        // Core's DataMapProcessor pushes default changes into the translation, which in a
        // workspace creates the translated parent's first draft (with live bookkeeping).
        $field = $this->field();
        self::assertSame([true, 'firstVersion'], [$field['workspace']['firstVersion'], $field['createReason']]);
        // FormEngine-style drafts of the translated parent and its entry: everything stays strict.
        foreach (['tt_content' => [2, 11], 'tx_vee_item' => [2, 11]] as $table => [$live, $draftUid]) {
            $draft = $this->row($live, $table);
            $this->getConnectionPool()->getConnectionForTable($table)->insert($table, [...$draft, 'uid' => $draftUid, 't3ver_oid' => $live, 't3ver_wsid' => 1]);
        }
        $field = $this->field();
        self::assertSame([false, ''], [$field['workspace']['firstVersion'], $field['createReason']]);
        self::assertSame(200, $this->act($field, 'create')[0], 'min 1: add one first');
        $live = array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0));
        $liveContent = $this->rows('tt_content');
        $field = $this->field();
        self::assertSame(['translations' => 1, 'languages' => [1]], $field['children'][0]['cascade']);
        $removed = $this->act($field, 'delete', 10);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 10, 'verb' => 'markForDeletion', 'translations' => 1], $removed[1]['deleted']);
        self::assertSame($live, array_values(array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0)), 'Live rows, translations included, byte-identical');
        self::assertSame(array_filter($liveContent, static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0), array_filter($this->rows('tt_content'), static fn(array $row): bool => (int)$row['t3ver_wsid'] === 0));
        $marked = array_map(static fn(array $row): int => (int)$row['t3ver_oid'], array_filter($this->rows(), static fn(array $row): bool => (int)$row['t3ver_state'] === 2));
        sort($marked);
        self::assertSame([1, 2], $marked, 'Core marks the entry and its translation for deletion');
    }

    #[Test]
    public function freeModeTranslatedParentCreatesOwnChildRows(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l18n_parent' => 0], ['uid' => 2]);
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.translatedParents = default-only');
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['free', ''], [$field['translationMode'], $field['createReason']], 'Free translations own their structure in every mode');
        $created = $this->intent($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        $row = $this->row((int)$created[1]['uid']);
        self::assertSame([1, 0, 2], [(int)$row['lang'], (int)$row['origin'], (int)$row['owner']]);
        self::assertFalse($this->field('vee_items', 'tt_content', 2)['children'][0]['translationOnly']);
        self::assertSame([[], false, 'syncNone'], [$this->field()['translationLanguages'], $this->field()['canSync'], $this->field()['syncReason']], 'A free translation is nothing to sync');
    }

    /** A connected translation of default entry $origin below the German parent tt_content 2. */
    private function translateChild(int $uid, int $origin): void
    {
        $this->addItem($uid, ['origin' => $origin, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt ' . $origin]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 2]);
    }

    /** @return list<int> origins of the German entries in their stored order */
    private function translatedOrigins(): array
    {
        $rows = $this->getConnectionPool()->getConnectionForTable('tx_vee_item')
            ->executeQuery("SELECT origin FROM tx_vee_item WHERE owner = 2 AND slot = 'items' AND deleted = 0 ORDER BY sorting, uid")->fetchFirstColumn();
        return array_map('intval', $rows);
    }
}
