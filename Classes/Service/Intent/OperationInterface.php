<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * One structural collection action. An operation turns a validated intent and the
 * freshly compiled, server-side collection into the DataHandler maps that Core
 * executes. It never reads identities from the browser beyond the intent keys the
 * protocol allows (InlineIntent), and refuses with IntentRefused before any write.
 */
interface OperationInterface
{
    /**
     * @param array<string, mixed> $field  internal collection payload (with _config and _defaults)
     * @param array<string, mixed> $form   compiled parent (EditorRecordContext::compile)
     * @param array<string, mixed> $intent validated intent (InlineIntent::parse)
     *
     * @throws IntentRefused
     */
    public function apply(array $field, array $form, array $intent): OperationPlan;
}
