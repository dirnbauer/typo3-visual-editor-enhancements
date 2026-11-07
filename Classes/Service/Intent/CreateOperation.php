<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * create: the parent's inline list with one NEW child at the end or after a listed
 * child, and the NEW child with the server-compiled defaults. Core's
 * checkValue_inline_processDBdata writes ownership, match fields and sorting.
 */
final readonly class CreateOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        if (!$field['canCreate']) {
            throw new IntentRefused((string)$field['createReason']);
        }
        $uids = $field['uids'];
        $after = $intent['afterUid'] ?? null;
        if ($after !== null && !in_array($after, $uids, true)) {
            throw new IntentRefused('stale');
        }
        $newId = 'NEW' . bin2hex(random_bytes(12));
        array_splice($uids, $after === null ? count($uids) : (int)array_search($after, $uids, true) + 1, 0, [$newId]);
        $childTable = (string)$field['_config']['foreign_table'];
        $hiddenField = (string)$field['hiddenField'];
        $defaults = $field['_defaults'];
        $data = [(string)$field['parentTable'] => [(int)$form['compileUid'] => [(string)$field['name'] => implode(',', $uids)]]];
        // Nested collections can share one table with their parent: merge, never overwrite.
        $data[$childTable][$newId] = $defaults;
        return new OperationPlan(
            $data,
            newId: $newId,
            result: ['created' => [
                'table' => $childTable,
                'hidden' => $hiddenField !== '' && !empty($defaults[$hiddenField]),
                'hiddenField' => $hiddenField,
            ]],
        );
    }
}
