<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * delete: the parent's inline list without the child plus Core's delete command on
 * the server-resolved target (live uid: delete or delete placeholder; a NEW draft's
 * own uid: discard). FormEngine's memorizeRemoveRecord + cmd recipe.
 */
final readonly class DeleteOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        $child = null;
        foreach ($field['children'] as $candidate) {
            if ($candidate['uid'] === $intent['childUid'] && ($candidate['state'] ?? '') !== 'deleted') {
                $child = $candidate;
                break;
            }
        }
        if ($child === null || !$child['canDelete']) {
            throw new IntentRefused($child === null ? 'membership' : (string)($child['deleteReason'] ?: 'membership'));
        }
        $uids = array_values(array_diff($field['uids'], [$intent['childUid']]));
        $childTable = (string)$field['_config']['foreign_table'];
        return new OperationPlan(
            [(string)$field['parentTable'] => [(int)$form['compileUid'] => [(string)$field['name'] => implode(',', $uids)]]],
            [$childTable => [(int)$child['deleteUid'] => ['delete' => 1]]],
            result: ['deleted' => ['uid' => (int)$child['uid'], 'verb' => (string)$child['verb'],
                'translations' => (int)($child['cascade']['translations'] ?? 0)]],
        );
    }
}
