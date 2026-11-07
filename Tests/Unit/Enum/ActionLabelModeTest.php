<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Enum;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Webconsulting\VisualEditorEnhancements\Enum\ActionLabelMode;

final class ActionLabelModeTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, ActionLabelMode}>
     */
    public static function storedValueProvider(): iterable
    {
        yield 'caption' => ['caption', ActionLabelMode::Caption];
        yield 'inline' => ['inline', ActionLabelMode::Inline];
        yield 'stacked' => ['stacked', ActionLabelMode::Stacked];
        yield 'icons' => ['icons', ActionLabelMode::Icons];
        yield 'missing' => [null, ActionLabelMode::Caption];
        yield 'unknown' => ['all', ActionLabelMode::Caption];
        yield 'wrong case' => ['Inline', ActionLabelMode::Caption];
        yield 'integer' => [2, ActionLabelMode::Caption];
        yield 'array' => [['inline'], ActionLabelMode::Caption];
    }

    #[Test]
    #[DataProvider('storedValueProvider')]
    public function fromUserSettingFallsBackToCaption(mixed $stored, ActionLabelMode $expected): void
    {
        self::assertSame($expected, ActionLabelMode::fromUserSetting($stored));
    }

    #[Test]
    public function theValuesMatchTheClientModes(): void
    {
        // Shared/action-bar-label-css.js ACTION_LABEL_MODES, same order (User settings item order).
        self::assertSame(['caption', 'inline', 'stacked', 'icons'], array_map(static fn(ActionLabelMode $mode): string => $mode->value, ActionLabelMode::cases()));
    }
}
