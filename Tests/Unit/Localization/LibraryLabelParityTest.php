<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Localization;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * Every English unit of the edit-frame catalogue has a German unit with a target,
 * and German has no unit English lacks (orphans after merges or renames).
 */
final class LibraryLabelParityTest extends TestCase
{
    #[Test]
    public function everyEnglishUnitHasAGermanUnitAndNoOrphans(): void
    {
        $english = $this->units('locallang_library.xlf', false);
        $german = $this->units('de.locallang_library.xlf', true);
        self::assertSame([], array_values(array_diff(array_keys($english), array_keys($german))), 'English units without German');
        self::assertSame([], array_values(array_diff(array_keys($german), array_keys($english))), 'German orphans');
        foreach ($german as $id => $target) {
            self::assertNotSame('', $target, 'German unit without target: ' . $id);
        }
        self::assertCount(count(array_unique(array_keys($english))), $english);
    }

    /** @return array<string, string> unit id => target (German) or source (English) */
    private function units(string $file, bool $target): array
    {
        $xml = simplexml_load_file(__DIR__ . '/../../../Resources/Private/Language/' . $file);
        self::assertNotFalse($xml, $file);
        $xml->registerXPathNamespace('x', 'urn:oasis:names:tc:xliff:document:2.0');
        $units = [];
        foreach ($xml->xpath('//x:unit') ?: [] as $unit) {
            $id = (string)$unit['id'];
            self::assertArrayNotHasKey($id, $units, 'Duplicate unit ' . $id . ' in ' . $file);
            $segment = $unit->children('urn:oasis:names:tc:xliff:document:2.0')->segment;
            $units[$id] = trim((string)($target ? $segment->target : $segment->source));
        }
        return $units;
    }
}
