<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Webconsulting\VisualEditorEnhancements\Service\InlineIntent;

final class InlineIntentTest extends TestCase
{
    private const COMMON = ['parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'entries', 'revision' => 'revision'];

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function validActions(): iterable
    {
        yield 'create at the end' => [['action' => 'create', ...self::COMMON]];
        yield 'create after' => [['action' => 'create', ...self::COMMON, 'afterUid' => 3]];
        yield 'delete' => [['action' => 'delete', ...self::COMMON, 'childUid' => 2]];
        yield 'move to the top' => [['action' => 'move', ...self::COMMON, 'childUid' => 2, 'afterUid' => null]];
        yield 'move after' => [['action' => 'move', ...self::COMMON, 'childUid' => 2, 'afterUid' => 5]];
        yield 'sync localize' => [['action' => 'sync', ...self::COMMON, 'language' => 1, 'mode' => 'localize']];
        yield 'sync synchronize' => [['action' => 'sync', ...self::COMMON, 'language' => 65535, 'mode' => 'synchronize']];
        yield 'sync localize selected' => [['action' => 'sync', ...self::COMMON, 'language' => 2, 'mode' => 'localize', 'ids' => [4, 7]]];
    }

    /** @return iterable<string, array{mixed}> */
    public static function forgedPayloads(): iterable
    {
        $valid = ['action' => 'create', ...self::COMMON];
        yield 'scalar' => ['create'];
        foreach (['parentUid' => '1', 'revision' => [], 'field' => '', 'action' => 'copy', 'afterUid' => -1, 'childTable' => 'forged', 'hidden' => 0, 'data' => [], 'childUid' => 2] as $key => $value) {
            yield 'create ' . $key => [[...$valid, $key => $value]];
        }
        yield 'missing delete target' => [[...$valid, 'action' => 'delete']];
        yield 'delete with afterUid' => [[...$valid, 'action' => 'delete', 'childUid' => 2, 'afterUid' => 3]];
        $move = ['action' => 'move', ...self::COMMON, 'childUid' => 2, 'afterUid' => 3];
        yield 'move without afterUid key' => [array_diff_key($move, ['afterUid' => true])];
        yield 'move without childUid' => [array_diff_key($move, ['childUid' => true])];
        yield 'move after itself' => [[...$move, 'afterUid' => 2]];
        yield 'move afterUid as string' => [[...$move, 'afterUid' => '3']];
        yield 'move afterUid zero' => [[...$move, 'afterUid' => 0]];
        yield 'move with sorting' => [[...$move, 'sorting' => 1]];
        yield 'move with uids' => [[...$move, 'uids' => [3, 2]]];
        $sync = ['action' => 'sync', ...self::COMMON, 'language' => 1, 'mode' => 'localize'];
        yield 'sync language as string' => [[...$sync, 'language' => '1']];
        yield 'sync language zero' => [[...$sync, 'language' => 0]];
        yield 'sync language too large' => [[...$sync, 'language' => 65536]];
        yield 'sync mode copy' => [[...$sync, 'mode' => 'copy']];
        yield 'sync without mode' => [array_diff_key($sync, ['mode' => true])];
        yield 'sync without language' => [array_diff_key($sync, ['language' => true])];
        yield 'sync ids with synchronize' => [[...$sync, 'mode' => 'synchronize', 'ids' => [1]]];
        yield 'sync empty ids' => [[...$sync, 'ids' => []]];
        yield 'sync ids not a list' => [[...$sync, 'ids' => ['a' => 1]]];
        yield 'sync ids with strings' => [[...$sync, 'ids' => ['1']]];
        yield 'sync duplicate ids' => [[...$sync, 'ids' => [1, 1]]];
        yield 'sync too many ids' => [[...$sync, 'ids' => range(1, 1001)]];
        yield 'sync with childUid' => [[...$sync, 'childUid' => 1]];
        yield 'sync with parent language uid' => [[...$sync, 'translatedParentUid' => 2]];
        foreach (['create' => [], 'delete' => ['childUid' => 2], 'move' => ['childUid' => 2, 'afterUid' => null], 'sync' => ['language' => 1, 'mode' => 'localize']] as $action => $keys) {
            yield $action . ' with hidden' => [['action' => $action, ...self::COMMON, ...$keys, 'hidden' => 0]];
            yield $action . ' with liveUid' => [['action' => $action, ...self::COMMON, ...$keys, 'liveUid' => 1]];
            if ($action !== 'sync') {
                yield $action . ' with language' => [['action' => $action, ...self::COMMON, ...$keys, 'language' => 1]];
            }
            yield $action . ' with workspace' => [['action' => $action, ...self::COMMON, ...$keys, 'workspace' => 1]];
        }
    }

    #[DataProvider('forgedPayloads')]
    public function testForgedPayloadsFailBeforeRecordResolution(mixed $payload): void
    {
        $this->expectException(\InvalidArgumentException::class);
        InlineIntent::parse($payload);
    }

    /** @param array<string, mixed> $intent */
    #[DataProvider('validActions')]
    public function testValidProtocolRetainsOnlyTheServerIntent(array $intent): void
    {
        self::assertSame($intent, InlineIntent::parse($intent));
    }
}
