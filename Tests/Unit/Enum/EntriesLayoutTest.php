<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Enum;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Webconsulting\VisualEditorEnhancements\Enum\EntriesLayout;

final class EntriesLayoutTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, EntriesLayout}>
     */
    public static function storedValueProvider(): iterable
    {
        yield 'inspector' => ['inspector', EntriesLayout::Inspector];
        yield 'tray' => ['tray', EntriesLayout::Tray];
        yield 'anchored' => ['anchored', EntriesLayout::Anchored];
        yield 'missing' => [null, EntriesLayout::Inspector];
        yield 'unknown' => ['drawer', EntriesLayout::Inspector];
        yield 'wrong case' => ['Tray', EntriesLayout::Inspector];
        yield 'integer' => [1, EntriesLayout::Inspector];
        yield 'array' => [['tray'], EntriesLayout::Inspector];
    }

    #[Test]
    #[DataProvider('storedValueProvider')]
    public function fromUserSettingFallsBackToInspector(mixed $stored, EntriesLayout $expected): void
    {
        self::assertSame($expected, EntriesLayout::fromUserSetting($stored));
    }

    #[Test]
    public function theValuesMatchTheClientLayouts(): void
    {
        // Shared/config.js entriesLayout(), same order (User settings item order).
        self::assertSame(['inspector', 'tray', 'anchored'], array_map(static fn(EntriesLayout $layout): string => $layout->value, EntriesLayout::cases()));
    }
}
