<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Enum;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Webconsulting\VisualEditorEnhancements\Enum\CollectionRowsMode;

final class CollectionRowsModeTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, CollectionRowsMode}>
     */
    public static function storedValueProvider(): iterable
    {
        yield 'panel' => ['panel', CollectionRowsMode::Panel];
        yield 'appender' => ['appender', CollectionRowsMode::Appender];
        yield 'rows' => ['rows', CollectionRowsMode::Rows];
        yield 'missing' => [null, CollectionRowsMode::Panel];
        yield 'unknown' => ['rail', CollectionRowsMode::Panel];
        yield 'empty' => ['', CollectionRowsMode::Panel];
        yield 'wrong case' => ['Rows', CollectionRowsMode::Panel];
        yield 'integer' => [1, CollectionRowsMode::Panel];
        yield 'array' => [['rows'], CollectionRowsMode::Panel];
    }

    #[Test]
    #[DataProvider('storedValueProvider')]
    public function fromUserSettingFallsBackToPanel(mixed $stored, CollectionRowsMode $expected): void
    {
        self::assertSame($expected, CollectionRowsMode::fromUserSetting($stored));
    }

    #[Test]
    public function theValuesMatchTheClientModes(): void
    {
        // Shared/config.js collectionRowsMode(), same order (User settings item order).
        self::assertSame(['panel', 'appender', 'rows'], array_map(static fn(CollectionRowsMode $mode): string => $mode->value, CollectionRowsMode::cases()));
    }
}
