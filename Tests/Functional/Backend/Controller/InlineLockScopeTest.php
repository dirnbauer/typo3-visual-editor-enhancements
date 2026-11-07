<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\DataHandling\DataHandler;
use TYPO3\CMS\Core\Locking\LockFactory;
use TYPO3\CMS\Core\Locking\LockingStrategyInterface;

/**
 * Lock scope: every intent locks vee-inline:<table>:<live uid>:<field> of the
 * record it acts on. A sync or a removal that cascades to translations also
 * writes the translated parents' relations, so it additionally takes the lock of
 * every translated parent it touches - the very key a parity action on that
 * translation takes - and the two exclude each other.
 *
 * Fixture: tt_content 2 (German, connected) owns tx_vee_item 2 (translation of 1).
 */
final class InlineLockScopeTest extends InlineRecordTestCase
{
    private const int CAPABILITIES = LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK;

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->writeSite();
        $this->addItem(2, ['origin' => 1, 'lang' => 1, 'owner' => 2, 'sorting' => 1, 'title' => 'Übersetzt']);
        $this->addItem(3, ['sorting' => 20]);
        $this->addItem(4, ['origin' => 0, 'lang' => 1, 'owner' => 2, 'sorting' => 2, 'title' => 'Nur Deutsch']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 2]);
    }

    #[\Override]
    protected function tearDown(): void
    {
        SyncInterleavingHook::$attempt = null;
        SyncInterleavingHook::$result = null;
        parent::tearDown();
    }

    #[Test]
    public function syncAndCascadingRemovalWaitForAHeldTranslatedParentLock(): void
    {
        $field = $this->field();
        self::assertSame([1, 1], [$field['translationLanguages'][0]['missing'], $field['children'][0]['cascade']['translations']]);
        $before = [$this->rows(), $this->rows('tt_content')];
        $lock = $this->get(LockFactory::class)->createLocker('vee-inline:tt_content:2:vee_items', self::CAPABILITIES);
        self::assertTrue($lock->acquire(self::CAPABILITIES));
        try {
            $sync = $this->intent($field, 'sync', ['language' => 1, 'mode' => 'localize']);
            self::assertSame([409, 'busy'], [$sync[0], $sync[1]['reason'] ?? null], json_encode($sync, JSON_THROW_ON_ERROR));
            $removal = $this->intent($field, 'delete', ['childUid' => 1]);
            self::assertSame([409, 'busy'], [$removal[0], $removal[1]['reason'] ?? null], json_encode($removal, JSON_THROW_ON_ERROR));
            self::assertSame($before, [$this->rows(), $this->rows('tt_content')], 'Refused before any write');
            // An entry without translations touches no translated parent's relation.
            $leaf = $this->intent($field, 'delete', ['childUid' => 3]);
            self::assertSame(200, $leaf[0], json_encode($leaf, JSON_THROW_ON_ERROR));
        } finally {
            $lock->release();
        }
        self::assertSame(['0', '1'], [(string)$this->row(2)['deleted'], (string)$this->row(3)['deleted']], 'Only the leaf was removed');
    }

    #[Test]
    public function parityMoveOnTheTranslationIsBusyWhileASyncHoldsTheLocks(): void
    {
        $translated = $this->field('vee_items', 'tt_content', 2);
        SyncInterleavingHook::$attempt = fn(): array => $this->intent($translated, 'move', ['childUid' => 4, 'afterUid' => null]);
        $GLOBALS['TYPO3_CONF_VARS']['SC_OPTIONS']['t3lib/class.t3lib_tcemain.php']['processCmdmapClass'][] = SyncInterleavingHook::class;

        $synced = $this->intent($this->field(), 'sync', ['language' => 1, 'mode' => 'localize']);
        self::assertSame(200, $synced[0], json_encode($synced, JSON_THROW_ON_ERROR));
        $during = SyncInterleavingHook::$result ?? self::fail('The sync never ran its command');
        self::assertSame([409, 'busy'], [$during[0], $during[1]['reason'] ?? null], json_encode($during, JSON_THROW_ON_ERROR));

        // Released afterwards: the same move on the fresh list goes through.
        $after = $this->intent($this->field('vee_items', 'tt_content', 2), 'move', ['childUid' => 4, 'afterUid' => null]);
        self::assertSame(200, $after[0], json_encode($after, JSON_THROW_ON_ERROR));
    }

    /** The default-language lock is the acting parent's own; nothing else is taken for a plain create. */
    #[Test]
    public function plainDefaultCreateIgnoresTranslatedParentLocks(): void
    {
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems'] = 4;
        $lock = $this->get(LockFactory::class)->createLocker('vee-inline:tt_content:2:vee_items', self::CAPABILITIES);
        self::assertTrue($lock->acquire(self::CAPABILITIES));
        try {
            $created = $this->act($this->field(), 'create');
            self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        } finally {
            $lock->release();
        }
    }
}

/** Runs a second intent while the sync's DataHandler command is executing (locks held). */
final class SyncInterleavingHook
{
    /** @var (\Closure(): array{int, array<string, mixed>})|null */
    public static ?\Closure $attempt = null;

    /** @var array{int, array<string, mixed>}|null */
    public static ?array $result = null;

    public function processCmdmap_preProcess(string $command, string $table, int|string $id, mixed $value, DataHandler $handler, mixed $pasteUpdate): void
    {
        if ($command === 'inlineLocalizeSynchronize' && self::$attempt !== null && self::$result === null) {
            $attempt = self::$attempt;
            self::$attempt = null;
            self::$result = $attempt();
        }
    }
}
