<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Form\FormDataProvider\TcaRecordTitle;
use Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller\Fixtures\CompileCounter;

/**
 * Budget for the capability payload and one intent at a realistic size: ten
 * entries on a parent with two connected translations (three languages), every
 * entry translated into both. Counts the FormDataCompiler runs (one Core form
 * data provider registered by the test) and records the wall time.
 */
final class InlinePayloadPerformanceTest extends InlineRecordTestCase
{
    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->writeSite();
        $content = $this->getConnectionPool()->getConnectionForTable('tt_content');
        $content->insert('tt_content', ['uid' => 3, 'pid' => 666, 'sorting' => 256, 'CType' => 'text', 'header' => 'Egy címsor', 'sys_language_uid' => 2, 'l18n_parent' => 1]);
        $items = $this->getConnectionPool()->getConnectionForTable('tx_vee_item');
        for ($uid = 1; $uid <= 10; $uid++) {
            if ($uid > 1) {
                $this->addItem($uid, ['sorting' => $uid * 10]);
            }
            foreach ([1 => 2, 2 => 3] as $language => $parent) {
                $items->insert('tx_vee_item', ['uid' => $language * 100 + $uid, 'pid' => 666, 'title' => 'Entry ' . $uid . ' (' . $language . ')',
                    'owner' => $parent, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => $uid * 10, 'lang' => $language, 'origin' => $uid]);
            }
        }
        foreach ([1, 2, 3] as $parent) {
            $content->update('tt_content', ['vee_items' => 10], ['uid' => $parent]);
        }
        unset($GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['maxitems']);
        $GLOBALS['TYPO3_CONF_VARS']['SYS']['formEngine']['formDataGroup']['tcaDatabaseRecord'][CompileCounter::class] = ['depends' => [TcaRecordTitle::class]];
        CompileCounter::take();
    }

    #[Test]
    public function thePayloadAndAMoveStayWithinTheCompileBudget(): void
    {
        $started = hrtime(true);
        $field = $this->field();
        $payloadMs = (hrtime(true) - $started) / 1e6;
        $payload = CompileCounter::take();
        self::assertCount(10, $field['children']);
        self::assertSame([1, 2], array_column($field['translationLanguages'], 'id'));
        foreach ($field['children'] as $child) {
            self::assertSame([true, '', 2], [$child['canDelete'], $child['deleteReason'], $child['cascade']['translations']], 'Every translation compiled and passed');
        }

        $started = hrtime(true);
        $moved = $this->intent($field, 'move', ['childUid' => 10, 'afterUid' => null]);
        $moveMs = (hrtime(true) - $started) / 1e6;
        self::assertSame(200, $moved[0], json_encode($moved, JSON_THROW_ON_ERROR));
        $move = CompileCounter::take();

        $started = hrtime(true);
        $removed = $this->intent(array_column($moved[1]['collections'], null, 'name')['vee_items'], 'delete', ['childUid' => 5]);
        $deleteMs = (hrtime(true) - $started) / 1e6;
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['uid' => 5, 'verb' => 'delete', 'translations' => 2, 'children' => 0, 'files' => 0], $removed[1]['deleted']);
        self::assertSame(['1', '1', '1'], [(string)$this->row(5)['deleted'], (string)$this->row(105)['deleted'], (string)$this->row(205)['deleted']]);
        $delete = CompileCounter::take();

        fwrite(STDERR, sprintf("\n[vee perf] payload: %d compiles, %.1f ms; move: %d compiles, %.1f ms; delete: %d compiles, %.1f ms\n", count($payload), $payloadMs, count($move), $moveMs, count($delete), $deleteMs));
        // payload: parent, entries, translated parents (sync preflight), create defaults per collection
        self::assertLessThanOrEqual(16, count($payload), implode("\n", $payload));
        // move: parent before the lock, one read pass under the lock, one fresh pass after the write
        self::assertLessThanOrEqual(31, count($move), implode("\n", $move));
        // delete: as move, plus the cascade proof of the removed entry's two translations
        self::assertLessThanOrEqual(32, count($delete), implode("\n", $delete));
        self::assertSame(['tx_vee_item:105:edit', 'tx_vee_item:205:edit'], array_values(array_intersect($delete, ['tx_vee_item:105:edit', 'tx_vee_item:205:edit'])), 'Both translations of the removed entry were compiled, once each');
    }

    /**
     * The payload checks every translation of an entry with checkRecordEditAccess
     * (language, editlock, authMode); the full compile (page, stage, owner chain)
     * runs where the cascade executes, for the removed entry only.
     */
    #[Test]
    public function theCascadeProofRunsWhereTheDeleteExecutes(): void
    {
        $this->getConnectionPool()->getConnectionForTable('pages')->insert('pages', ['uid' => 668, 'pid' => 1, 'title' => 'Locked', 'slug' => '/locked', 'doktype' => 1, 'editlock' => 1]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['pid' => 668], ['uid' => 110]);
        $this->restrictedOwnerUser('tt_content,tx_vee_item', 'tx_vee_item:hidden', '0,1,2');
        $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['perms_everybody' => 31], ['uid' => 668]);
        $before = $this->rows();

        $field = $this->field();
        $entry = array_column($field['children'], null, 'uid')[10];
        self::assertSame([true, 2], [$entry['canDelete'], $entry['cascade']['translations']], 'Record-level checks pass; the compile proof is deferred to the delete');
        $refused = $this->intent($field, 'delete', ['childUid' => 10]);
        self::assertSame([409, 'translations'], [$refused[0], $refused[1]['reason']], 'A translation the backend form would refuse blocks the cascade');
        $listed = array_column($refused[1]['collection']['children'], null, 'uid')[10];
        self::assertSame([false, 'translations'], [$listed['canDelete'], $listed['deleteReason']], 'The refusal names the reason on the entry');
        self::assertSame($before, $this->rows(), 'Nothing written');

        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['pid' => 666], ['uid' => 110]);
        $removed = $this->intent($this->field(), 'delete', ['childUid' => 10]);
        self::assertSame(200, $removed[0], json_encode($removed, JSON_THROW_ON_ERROR));
        self::assertSame(['1', '1', '1'], [(string)$this->row(10)['deleted'], (string)$this->row(110)['deleted'], (string)$this->row(210)['deleted']]);
    }
}
