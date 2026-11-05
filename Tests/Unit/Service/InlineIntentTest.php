<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Webconsulting\VisualEditorEnhancements\Service\InlineIntent;

final class InlineIntentTest extends TestCase
{
    /** @return iterable<string, array{mixed}> */
    public static function forgedPayloads(): iterable
    {
        $valid = ['action' => 'create', 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'entries', 'revision' => 'revision'];
        yield 'scalar' => ['create'];
        foreach (['parentUid' => '1', 'revision' => [], 'field' => '', 'action' => 'sync', 'afterUid' => -1, 'childTable' => 'forged', 'hidden' => 0, 'data' => []] as $key => $value) {
            yield $key => [[...$valid, $key => $value]];
        }
        yield 'missing delete target' => [[...$valid, 'action' => 'delete']];
    }

    #[DataProvider('forgedPayloads')]
    public function testForgedPayloadsFailBeforeRecordResolution(mixed $payload): void
    {
        $this->expectException(\InvalidArgumentException::class);
        InlineIntent::parse($payload);
    }

    public function testValidProtocolRetainsOnlyTheServerIntent(): void
    {
        $valid = ['action' => 'delete', 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'entries', 'revision' => 'revision', 'childUid' => 2];
        self::assertSame($valid, InlineIntent::parse($valid));
    }
}
