<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;

/**
 * behaviour.allowLanguageSynchronization on the collection column: Core's
 * DataMapProcessor drops every submitted value of a field whose l10n_state is
 * 'parent' or 'source' from a connected translation's datamap and re-synchronizes
 * the relation from the source language. FormEngine renders such a field
 * read-only with the localization-state selector; only 'custom' makes it the
 * translation's own list.
 *
 * Fixture: tt_content 2 (German, connected) owns tx_vee_item 2 (translation of 1)
 * and 3 (translation-only).
 */
final class InlineLanguageSynchronizationTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->writeSite();
        $this->addItem(2, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt']);
        $this->addItem(3, ['origin' => 0, 'lang' => 1, 'owner' => 2, 'sorting' => 2, 'title' => 'Nur Deutsch']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 2]);
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['behaviour']['allowLanguageSynchronization'] = true;
        $this->get(TcaSchemaFactory::class)->rebuild($GLOBALS['TCA']);
    }

    #[Test]
    public function synchronizedTranslatedCollectionRefusesStructureWithoutAnyWrite(): void
    {
        $before = [$this->rows(), $this->rows('tt_content')];
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['connected', 'synchronized', 'synchronized'], [$field['translationMode'], $field['createReason'], $field['sortReason']]);
        self::assertSame(['synchronized', 'synchronized'], array_column($field['children'], 'deleteReason'));
        self::assertSame([false, false, false, false], [$field['canCreate'], $field['canSort'], $field['children'][0]['canMoveDown'], $field['children'][1]['canDelete']]);
        self::assertSame([true, true], array_column($field['children'], 'canHide'), 'Visibility of the translated rows is their own (the hidden column is not synchronized)');

        foreach ([['create', []], ['move', ['childUid' => 3, 'afterUid' => null]], ['delete', ['childUid' => 3]]] as [$action, $options]) {
            $refused = $this->intent($field, $action, $options);
            self::assertSame([409, 'synchronized'], [$refused[0], $refused[1]['reason'] ?? null], $action . ': ' . json_encode($refused, JSON_THROW_ON_ERROR));
        }
        self::assertSame($before, [$this->rows(), $this->rows('tt_content')], 'Every row byte-identical');

        // A source-language state follows another translation: also synchronized.
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l10n_state' => '{"vee_items":"source"}'], ['uid' => 2]);
        self::assertSame('synchronized', $this->field('vee_items', 'tt_content', 2)['createReason']);
    }

    #[Test]
    public function customLocalizationStateMakesTheTranslatedListItsOwn(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l10n_state' => '{"vee_items":"custom"}'], ['uid' => 2]);
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['', ''], [$field['createReason'], $field['sortReason']]);

        $moved = $this->intent($field, 'move', ['childUid' => 3, 'afterUid' => null]);
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        self::assertSame([3, 2], $this->field('vee_items', 'tt_content', 2)['uids'], 'The stored order changed');

        $created = $this->intent($this->field('vee_items', 'tt_content', 2), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        $row = $this->row((int)$created[1]['uid']);
        self::assertSame([1, 2, 'tt_content', 'items'], [(int)$row['lang'], (int)$row['owner'], $row['owner_table'], $row['slot']], 'Owned by the translated parent, no orphan');
        self::assertSame([3, 2, (int)$row['uid']], $this->field('vee_items', 'tt_content', 2)['uids']);
    }

    /** The same Core rule on an entry's own column: a staged value would be dropped silently. */
    #[Test]
    public function synchronizedEntryColumnRefusesStagedWritesOnConnectedTranslationsOnly(): void
    {
        $GLOBALS['TCA']['tx_vee_item']['columns']['hidden']['config']['behaviour']['allowLanguageSynchronization'] = true;
        $this->get(TcaSchemaFactory::class)->rebuild($GLOBALS['TCA']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l10n_state' => '{"vee_items":"custom"}'], ['uid' => 2]);
        $children = $this->field('vee_items', 'tt_content', 2)['children'];
        self::assertSame([[false, 'translation'], [true, '']], [[$children[0]['canHide'], $children[0]['hideReason']], [$children[1]['canHide'], $children[1]['hideReason']]], 'Connected translation follows; translation-only row is its own');
        self::assertSame('', $this->field()['children'][0]['hideReason'], 'Default language unaffected');
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['l10n_state' => '{"hidden":"custom"}'], ['uid' => 2]);
        self::assertSame('', $this->field('vee_items', 'tt_content', 2)['children'][0]['hideReason']);
    }

    #[Test]
    public function syncPreflightRefusesASynchronizedTranslatedParent(): void
    {
        $this->addItem(4, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $field = $this->field();
        self::assertSame([false, 'translation'], [$field['translationLanguages'][0]['canSync'], $field['translationLanguages'][0]['syncReason']]);
        $refused = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame([409, 'translation'], [$refused[0], $refused[1]['reason']]);

        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l10n_state' => '{"vee_items":"custom"}'], ['uid' => 2]);
        self::assertSame([true, ''], [$this->field()['translationLanguages'][0]['canSync'], $this->field()['translationLanguages'][0]['syncReason']]);
    }
}
