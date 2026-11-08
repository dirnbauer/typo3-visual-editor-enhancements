<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use Webconsulting\VisualEditorEnhancements\Service\CollectionFieldIndex;
use Webconsulting\VisualEditorEnhancements\Service\EditorRecordContext;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

/**
 * WP-E: findings 1-4 of the 2026-11-05 review stay fixed with the 1.6 intents
 * (move, sync) and the new generic-save paths (staged visibility and title).
 * Every refusal leaves every row unchanged.
 */
final class InlineSecurityRegressionTest extends InlineRecordTestCase
{
    #[Test]
    public function clientSentLocalizeSynchronizeCopyOrDiscardOnChildTablesIsStillRejected(): void
    {
        $this->writeSite();
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $before = $this->snapshot();
        $sync = ['field' => 'vee_items', 'language' => 1, 'action' => 'localize'];
        foreach ([0, 1] as $preference) {
            $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = $preference;
            foreach ([
                ['tt_content' => [1 => ['inlineLocalizeSynchronize' => $sync]]],
                ['tt_content' => [1 => ['inlineLocalizeSynchronize' => ['field' => 'vee_items', 'language' => 1, 'ids' => [3]]]]],
                ['tx_vee_item' => [1 => ['inlineLocalizeSynchronize' => $sync]]],
                ['tx_vee_item' => [1 => ['copy' => 666]]],
                ['tx_vee_item' => [1 => ['copy' => ['action' => 'paste', 'target' => 666, 'update' => []]]]],
                ['tx_vee_item' => [1 => ['move' => -3]]],
                ['tx_vee_item' => [1 => ['discard' => 1]]],
                // 1.7: the shapes the duplicate and restore intents run server-side.
                ['tx_vee_item' => [1 => ['copy' => ['target' => -1, 'ignoreLocalization' => true]]]],
                ['tx_vee_item' => [1 => ['copy' => ['action' => 'paste', 'target' => -1, 'update' => ['hidden' => 1]]]]],
                ['tx_vee_item' => [1 => ['undelete' => 1]]],
                ['tx_vee_item' => [1 => ['version' => ['action' => 'new', 'label' => 'Restored']]]],
                ['tx_vee_item' => [1 => ['localize' => 1]]],
                ['tx_vee_item' => [1 => ['version' => ['action' => 'new']]]],
                ['tt_content' => [1 => ['localize' => 1]]],
                ['tt_content' => [1 => ['discard' => 1]]],
            ] as $command) {
                $result = $this->save(['cmdArray' => [$command]]);
                self::assertSame(400, $result[0], json_encode($command, JSON_THROW_ON_ERROR));
                self::assertSame($before, $this->snapshot(), json_encode($command, JSON_THROW_ON_ERROR));
            }
        }
    }

    #[Test]
    public function nestedPasteUpdatesAreStillValidated(): void
    {
        $this->addItem(9, ['owner' => 2, 'slot' => 'shared', 'title' => 'Other owner']);
        $before = $this->snapshot();
        foreach ([0, 1] as $preference) {
            $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = $preference;
            foreach (['move', 'copy'] as $action) {
                foreach ([['vee_items' => '9'], ['vee_shared' => '1,9'], ['t3ver_wsid' => 1], ['t3ver_oid' => 1]] as $update) {
                    $result = $this->save(['data' => ['tt_content' => [1 => ['header' => 'Must not save']]],
                        'cmdArray' => [['tt_content' => [1 => [$action => ['action' => 'paste', 'target' => 666, 'update' => $update]]]]]]);
                    self::assertSame(400, $result[0], $action . ' ' . json_encode($update, JSON_THROW_ON_ERROR));
                    self::assertSame($before, $this->snapshot());
                }
            }
        }
        foreach ([['action' => 'paste', 'target' => '666', 'update' => []], ['action' => 'paste', 'target' => 666, 'update' => 'x'], ['action' => 'cut', 'target' => 666, 'update' => []]] as $shape) {
            self::assertSame(400, $this->save(['cmdArray' => [['tt_content' => [1 => ['copy' => $shape]]]]])[0]);
        }
        self::assertSame($before, $this->snapshot());
    }

    #[Test]
    public function newOwnedChildrenInOrdinarySavesAreStillRefused(): void
    {
        $before = $this->snapshot();
        foreach ([0, 1] as $preference) {
            $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = $preference;
            foreach ([
                ['tx_vee_item' => ['NEWa' => ['pid' => 666, 'title' => 'Bypass']]],
                ['tx_vee_item' => ['NEWb' => ['pid' => 666, 'title' => 'Bypass', 'hidden' => 0]], 'tt_content' => [1 => ['vee_items' => '1,NEWb']]],
                ['tt_content' => [1 => ['vee_items' => '']]],
                ['tx_vee_item' => [1 => ['owner' => 2]]],
                ['tx_vee_item' => [1 => ['slot' => 'shared']]],
                ['tx_vee_item' => [1 => ['owner_table' => 'pages']]],
                ['tx_vee_item' => [1 => ['sorting' => 1]]],
                ['tx_vee_item' => [1 => ['lang' => 1]]],
                ['tx_vee_item' => [1 => ['origin' => 2]]],
                ['tx_vee_item' => [1 => ['pid' => 1]]],
                ['tx_vee_item' => [1 => ['t3ver_state' => 2]]],
            ] as $data) {
                $result = $this->save(['data' => $data]);
                self::assertSame(400, $result[0], json_encode($data, JSON_THROW_ON_ERROR));
                self::assertSame($before, $this->snapshot());
            }
        }
        // The staged inspector writes remain ordinary, authorized saves.
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1, 'title' => 'Renamed']]]])[0]);
        self::assertSame([1, 'Renamed'], [(int)$this->row(1)['hidden'], $this->row(1)['title']]);
    }

    #[Test]
    public function ttContentAsInlineChildKeepsOrdinaryOperations(): void
    {
        $GLOBALS['TCA']['tt_content']['columns']['vee_container'] = ['config' => ['type' => 'inline', 'foreign_table' => 'tt_content', 'foreign_field' => 'tx_container_parent']];
        $GLOBALS['TCA']['tt_content']['types']['text']['showitem'] .= ',vee_container';
        $this->get(TcaSchemaFactory::class)->rebuild($GLOBALS['TCA']);
        foreach ([0, 1] as $preference) {
            $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = $preference;
            self::assertSame(200, $this->save(['data' => ['tt_content' => ['NEWnormal' . $preference => ['pid' => 666, 'CType' => 'text', 'header' => 'Normal']]]])[0]);
            self::assertSame(200, $this->save(['data' => ['tt_content' => [1 => ['header' => 'Edited ' . $preference]]]])[0]);
            foreach (['copy', 'move'] as $action) {
                self::assertSame(200, $this->save(['cmdArray' => [['tt_content' => [1 => [$action => ['action' => 'paste', 'target' => 666, 'update' => ['colPos' => 0]]]]]]])[0], $action);
            }
            self::assertSame(400, $this->save(['data' => ['tt_content' => ['NEWforged' => ['pid' => 666, 'tx_container_parent' => 1]]]])[0]);
        }
        $field = array_column($this->fields(), null, 'name')['vee_container'] ?? null;
        self::assertSame('unsupported', $field['createReason'] ?? null, 'tt_content children stay with the backend form');
        self::assertSame(409, $this->intent($field ?? [], 'create')[0]);
        self::assertSame(['vee_items', 'vee_shared'], $this->get(CollectionFieldIndex::class)->build(666)['tt_content']['text'] ?? [], 'Not announced');
        self::assertSame(200, $this->save(['cmdArray' => [['tt_content' => [1 => ['delete' => 1]]]]])[0], 'Root content delete stays ordinary');
        self::assertSame(1, (int)$this->row(1, 'tt_content')['deleted']);
    }

    #[Test]
    public function overrideChildTcaStaysUnsupported(): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $before = $this->snapshot();
        $GLOBALS['TCA']['tt_content']['columns']['vee_items']['config']['overrideChildTca'] = ['columns' => ['title' => ['config' => ['default' => 'Parent title']]]];
        $this->get(TcaSchemaFactory::class)->rebuild($GLOBALS['TCA']);
        $field = $this->field();
        self::assertSame(['unsupported', 'unsupported', false], [$field['createReason'], $field['sortReason'], $field['canSync']]);
        self::assertSame([], $field['children'], 'No entries are compiled without the inline parent context');
        foreach ([['create', []], ['delete', ['childUid' => 1]], ['move', ['childUid' => 3, 'afterUid' => null]], ['sync', ['language' => 1, 'mode' => 'localize']]] as [$action, $options]) {
            self::assertSame(409, $this->intent($field, $action, $options)[0], $action);
        }
        // Staged writes on such children are refused through the owner chain, too.
        self::assertSame(403, $this->save(['data' => ['tx_vee_item' => [1 => ['hidden' => 1]]]])[0]);
        self::assertSame(403, $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Overridden']]]])[0]);
        self::assertSame(['tt_content' => ['text' => ['vee_shared']]], $this->get(CollectionFieldIndex::class)->build(666), 'Not announced');
        self::assertSame($before, $this->snapshot());
    }

    /** @return iterable<string, array{string, array<string, mixed>, string, mixed}> */
    public static function unknownKeys(): iterable
    {
        $actions = ['create' => [], 'delete' => ['childUid' => 1], 'move' => ['childUid' => 1, 'afterUid' => null], 'sync' => ['language' => 1, 'mode' => 'localize'],
            'duplicate' => ['childUid' => 1], 'restore' => ['childUid' => 1]];
        foreach ($actions as $action => $options) {
            foreach (['childTable' => 'tx_vee_item', 'pid' => 666, 'hidden' => 0, 'liveUid' => 1, 'sorting' => 1, 'workspace' => 0, 'uids' => [1], 'data' => [], 'translatedParentUid' => 2, 'versionUid' => 10, 'target' => -1] as $key => $value) {
                yield $action . ' ' . $key => [$action, $options, $key, $value];
            }
        }
    }

    /** @param array<string, mixed> $options */
    #[Test]
    #[DataProvider('unknownKeys')]
    public function unknownKeysAreRejectedForEveryActionBeforeAnyRead(string $action, array $options, string $key, mixed $value): void
    {
        $this->addItem(3, ['sorting' => 20]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 2], ['uid' => 1]);
        $field = $this->field();
        $before = $this->snapshot();
        self::assertSame(400, $this->intent($field, $action, [...$options, $key => $value])[0]);
        self::assertSame(400, $this->save(['inlineRecord' => ['action' => $action, 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'vee_items', 'revision' => $field['revision'], ...$options], 'data' => []])[0], 'Mixed envelope');
        self::assertSame($before, $this->snapshot());
    }

    #[Test]
    public function newIntentsOnNestedParentsRequireActualRootPermission(): void
    {
        $this->addItem(20, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 1]);
        $this->addItem(21, ['owner' => 1, 'owner_table' => 'tx_vee_item', 'slot' => 'nested', 'sorting' => 2]);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['nested' => 2], ['uid' => 1]);
        $form = $this->get(EditorRecordContext::class)->compile('tx_vee_item', 1, $this->request());
        $field = array_column($this->get(InlineRecordService::class)->fields('tx_vee_item', $form, $this->request()), null, 'name')['nested'];
        $before = $this->snapshot();
        // Child table right, but no right on the root content element.
        $this->restrictedOwnerUser('tx_vee_item');
        foreach ([['move', ['childUid' => 21, 'afterUid' => null]], ['delete', ['childUid' => 20]], ['sync', ['language' => 1, 'mode' => 'localize']],
            ['duplicate', ['childUid' => 21]], ['restore', ['childUid' => 21]]] as [$action, $options]) {
            self::assertSame(403, $this->intent($field, $action, $options)[0], $action);
        }
        self::assertSame(403, $this->save(['data' => ['tx_vee_item' => [20 => ['hidden' => 1]]]])[0], 'Staged visibility on a nested entry');
        self::assertSame($before, $this->snapshot());
        $this->restrictedOwnerUser('tt_content,tx_vee_item');
        self::assertSame(200, $this->intent($field, 'move', ['childUid' => 21, 'afterUid' => null])[0], 'Permitted with the root right');
    }

    /** @return list<array<string, mixed>> */
    private function fields(): array
    {
        $form = $this->get(EditorRecordContext::class)->compile('tt_content', 1, $this->request());
        return $this->get(InlineRecordService::class)->fields('tt_content', $form, $this->request());
    }

    /** @return array{list<array<string, mixed>>, list<array<string, mixed>>, array<string, mixed>|null} */
    private function snapshot(): array
    {
        return [$this->rows(), $this->rows('tt_content'), BackendUtility::getRecord('tt_content', 1)];
    }
}
