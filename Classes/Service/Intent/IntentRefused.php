<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/** A capability or freshness refusal decided before any write; carries the public reason. */
final class IntentRefused extends \RuntimeException
{
    public function __construct(public readonly string $reason, public readonly int $status = 409)
    {
        parent::__construct('Collection action refused: ' . $reason, 1783350001);
    }
}
