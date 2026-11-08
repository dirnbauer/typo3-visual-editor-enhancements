<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

use TYPO3\CMS\Core\DataHandling\DataHandler;

/** What one operation asks Core to do, plus the response details it reports afterwards. */
final readonly class OperationPlan
{
    /**
     * @param array<string, array<int|string, array<string, mixed>>> $data
     * @param array<string, array<int, array<string, mixed>>>        $cmd
     * @param bool                                                   $cmdFirst run the cmdmap before the datamap (sync)
     * @param string|null                                            $newId    NEW placeholder of a created child
     * @param array<string, mixed>                                   $result   additional public response keys
     * @param bool                                                   $write    false: nothing to change (no-op), no DataHandler run
     * @param (\Closure(DataHandler): ?array{array<string, array<int|string, array<string, mixed>>>, array<string, mixed>})|null $followUp
     *        a datamap that needs the first run's result (a copy's uid), plus response keys; null: Core did nothing
     * @param bool                                                   $mayVersion false: never mask Core's first-version bookkeeping (discard)
     */
    public function __construct(
        public array $data,
        public array $cmd = [],
        public bool $cmdFirst = false,
        public ?string $newId = null,
        public array $result = [],
        public bool $write = true,
        public ?\Closure $followUp = null,
        public bool $mayVersion = true,
    ) {}
}
