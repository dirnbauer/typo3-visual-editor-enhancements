<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/** What one operation asks Core to do, plus the response details it reports afterwards. */
final readonly class OperationPlan
{
    /**
     * @param array<string, array<int|string, array<string, mixed>>> $data
     * @param array<string, array<int, array<string, mixed>>>        $cmd
     * @param bool                                                   $cmdFirst run the cmdmap before the datamap (sync)
     * @param string|null                                            $newId    NEW placeholder of a created child
     * @param array<string, mixed>                                   $result   additional public response keys
     */
    public function __construct(
        public array $data,
        public array $cmd = [],
        public bool $cmdFirst = false,
        public ?string $newId = null,
        public array $result = [],
    ) {}
}
