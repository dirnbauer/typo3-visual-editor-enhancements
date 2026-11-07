<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller\Fixtures;

use TYPO3\CMS\Backend\Form\FormDataProviderInterface;

/**
 * Counts FormDataCompiler runs of the tcaDatabaseRecord group. Registered by the
 * test only, as one more Core form data provider - production code has no seam.
 */
final class CompileCounter implements FormDataProviderInterface
{
    /** @var list<string> table:uid:command of every compile, in order */
    private static array $compiles = [];

    /** @return list<string> the compiles since the last call, then starts counting anew */
    public static function take(): array
    {
        $compiles = self::$compiles;
        self::$compiles = [];
        return $compiles;
    }

    /**
     * @param array<string, mixed> $result
     * @return array<string, mixed>
     */
    #[\Override]
    public function addData(array $result): array
    {
        self::$compiles[] = $result['tableName'] . ':' . $result['vanillaUid'] . ':' . $result['command'];
        return $result;
    }
}
