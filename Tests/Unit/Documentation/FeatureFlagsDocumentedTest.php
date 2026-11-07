<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Documentation;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Every install-wide flag FeatureFlags reads is listed in the flag blocks of
 * Installation.rst and README.md (one `['<flag>'] = true;` line each), and the
 * count word in front of the blocks matches. A flag added in code without its
 * line is a switch nobody can find.
 */
final class FeatureFlagsDocumentedTest extends TestCase
{
    private const ROOT = __DIR__ . '/../../../';

    private const COUNT_WORDS = [1 => 'one', 2 => 'two', 3 => 'three', 4 => 'four', 5 => 'five', 6 => 'six', 7 => 'seven', 8 => 'eight', 9 => 'nine'];

    /** @return array<string, array{string}> */
    public static function documents(): array
    {
        return ['Installation.rst' => ['Documentation/Installation.rst'], 'README.md' => ['README.md']];
    }

    #[Test]
    public function featureFlagsReadsFlags(): void
    {
        self::assertContains('inlineRecordsEnabled', self::flags());
    }

    #[Test]
    #[DataProvider('documents')]
    public function everyFlagIsInTheFlagBlock(string $document): void
    {
        $text = (string)file_get_contents(self::ROOT . $document);
        $flags = self::flags();
        foreach ($flags as $flag) {
            self::assertStringContainsString(
                "['visual_editor_enhancements']['" . $flag . "'] = true;",
                $text,
                $document . ' does not list the install-wide flag ' . $flag,
            );
        }
        $word = self::COUNT_WORDS[count($flags)] ?? (string)count($flags);
        self::assertMatchesRegularExpression('/All ' . $word . ' features default to on/', $text, $document . ' names the wrong number of features');
    }

    /** @return list<string> the keys FeatureFlags reads, in source order */
    private static function flags(): array
    {
        $source = (string)file_get_contents(self::ROOT . 'Classes/Service/FeatureFlags.php');
        preg_match_all("/\\\$this->flag\\('([A-Za-z]+)'\\)/", $source, $matches);
        return array_values(array_unique($matches[1]));
    }
}
