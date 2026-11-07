<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;

/**
 * Which live rows a workspace write reaches besides the acting record, the way
 * Core reaches them: DataMapProcessor pushes a change into every connected
 * translation that points at the record through its parent OR its source
 * pointer (transitively), but only for tables it applies to (an l10n_mode =
 * exclude or allowLanguageSynchronization column); auto-versioning a live row
 * also versions its own nested inline/file members and renumbers their live
 * sorting and tstamp.
 */
final class InlineWorkspaceDependentsTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->writeSite();
        $this->useWorkspace();
    }

    /**
     * en (tt_content 1) -> de (2, l18n_parent 1) -> hu (3, l18n_parent 1,
     * l10n_source 2): hu was translated from German. de and its entry have a
     * draft, hu has none.
     */
    private function sourceChain(): void
    {
        $content = $this->getConnectionPool()->getConnectionForTable('tt_content');
        $content->update('tt_content', ['l10n_source' => 1, 'vee_items' => 1], ['uid' => 2]);
        $content->insert('tt_content', ['uid' => 3, 'pid' => 666, 'sorting' => 256, 'CType' => 'text', 'header' => 'Egy címsor',
            'sys_language_uid' => 2, 'l18n_parent' => 1, 'l10n_source' => 2, 'vee_items' => 2]);
        $this->addItem(2, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt']);
        $this->addItem(5, ['origin' => 1, 'lang' => 2, 'owner' => 3, 'sorting' => 5, 'title' => 'Lefordítva']);
        $this->addItem(6, ['origin' => 0, 'lang' => 2, 'owner' => 3, 'sorting' => 9, 'title' => 'Csak magyar']);
        foreach (['tt_content' => [2, 12], 'tx_vee_item' => [2, 12]] as $table => [$live, $draftUid]) {
            $this->getConnectionPool()->getConnectionForTable($table)->insert($table, [...$this->row($live, $table), 'uid' => $draftUid, 't3ver_oid' => $live, 't3ver_wsid' => 1]);
        }
    }

    /** @return list<array<string, mixed>> live rows of the Hungarian element */
    private function hungarian(): array
    {
        return [$this->row(3, 'tt_content'), $this->row(5), $this->row(6)];
    }

    #[Test]
    public function translationReachedThroughL10nSourceIsRefusedUnderFirstVersionZero(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $this->sourceChain();
        $hungarian = $this->hungarian();
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame(['connected', true], [$field['translationMode'], $field['workspace']['firstVersion']]);
        self::assertSame(['firstVersion', 'firstVersion', ['firstVersion']], [$field['createReason'], $field['sortReason'], array_column($field['children'], 'deleteReason')]);
        foreach ([['create', []], ['move', ['childUid' => 12, 'afterUid' => null]], ['delete', ['childUid' => 12]]] as [$action, $options]) {
            $refused = $this->intent($field, $action, $options);
            self::assertSame([409, 'firstVersion'], [$refused[0], $refused[1]['reason'] ?? null], $action . ': ' . json_encode($refused, JSON_THROW_ON_ERROR));
        }
        self::assertSame($hungarian, $this->hungarian(), 'Hungarian rows byte-identical');
        self::assertSame(0, $this->countRows('tt_content', ['t3ver_oid' => 3]));
    }

    #[Test]
    public function translationReachedThroughL10nSourceGetsOnlyFirstVersionBookkeepingUnderFirstVersionOne(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 1');
        $this->sourceChain();
        $hungarian = $this->hungarian();
        $field = $this->field('vee_items', 'tt_content', 2);
        self::assertSame([true, ''], [$field['workspace']['firstVersion'], $field['createReason']]);

        $created = $this->intent($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame(['id' => 1, 'firstVersion' => true], $created[1]['workspace']);
        [$parent, $entry, $translationOnly] = $this->hungarian();
        self::assertSame($hungarian[0], $parent, 'Live Hungarian parent byte-identical');
        foreach ([[$hungarian[1], $entry], [$hungarian[2], $translationOnly]] as [$before, $after]) {
            self::assertSame(self::withoutBookkeeping($before), self::withoutBookkeeping($after), 'Only sorting and tstamp of the Hungarian entries may change');
        }
        self::assertSame([1, 2], [(int)$entry['sorting'], (int)$translationOnly['sorting']], 'Core renumbered them in their order');
        self::assertSame(1, $this->countRows('tt_content', ['t3ver_oid' => 3, 't3ver_wsid' => 1]), 'Core versioned the Hungarian element');
    }

    /**
     * tx_vee_item has no l10n_mode = exclude and no allowLanguageSynchronization
     * column: DataMapProcessor leaves its translations alone.
     */
    private function nestedWithUndraftedTranslation(): void
    {
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 5]);
        $this->addItem(21, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 7]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 2], ['uid' => 1]);
        $this->addItem(2, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt', 'nested' => 1]);
        $this->addItem(22, ['origin' => 20, 'lang' => 1, 'owner' => 2, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 3]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 2]);
        foreach ([1 => 50, 20 => 51, 21 => 52] as $live => $draftUid) {
            $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', [...$this->row($live), 'uid' => $draftUid, 't3ver_oid' => $live, 't3ver_wsid' => 1]);
        }
    }

    /** @return array<string, mixed> */
    private function nestedField(): array
    {
        return $this->field('nested', 'tx_vee_item', 1);
    }

    #[Test]
    public function nestedParentWithoutCoreSynchronizationIgnoresItsUndraftedTranslation(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 0');
        $this->nestedWithUndraftedTranslation();
        $field = $this->nestedField();
        self::assertSame(['', '', false], [$field['createReason'], $field['sortReason'], $field['workspace']['firstVersion']]);
        self::assertSame([51, 52], $field['uids']);
    }

    #[Test]
    public function nestedCreateUnderFirstVersionOneReportsNoDraftCoreNeverMakes(): void
    {
        $this->setPageTsConfig('tx_visualeditorenhancements.inlineRecords.firstVersion = 1');
        $this->nestedWithUndraftedTranslation();
        $translation = [$this->row(2), $this->row(22)];
        $field = $this->nestedField();
        self::assertFalse($field['workspace']['firstVersion']);
        $created = $this->intent($field, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame(['id' => 1, 'firstVersion' => false], $created[1]['workspace']);
        self::assertSame($translation, [$this->row(2), $this->row(22)], 'Translation rows byte-identical');
        self::assertSame(0, $this->countRows('tx_vee_item', ['t3ver_oid' => 2]), 'No draft of the translated nested parent');
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
