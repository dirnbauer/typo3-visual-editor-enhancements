<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * move: what FormEngine posts after a sort or drag - the parent's inline list in
 * the new order. Core's checkValue_inline_processDBdata hands it to
 * RelationHandler::writeForeignField, which renumbers the members' sorting
 * (and their tstamp) in that order. Only server-compiled member uids are
 * written: drafts in a workspace, translated rows in a translation.
 */
final readonly class MoveOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        /** @var list<int> $uids */
        $uids = $field['uids'];
        $childUid = (int)$intent['childUid'];
        $afterUid = $intent['afterUid'];
        // Set membership first: a uid the server did not compile is stale, whatever the reason.
        if (!in_array($childUid, $uids, true) || ($afterUid !== null && !in_array($afterUid, $uids, true))) {
            throw new IntentRefused('stale');
        }
        if (!$field['canSort']) {
            throw new IntentRefused((string)$field['sortReason']);
        }
        $reordered = array_values(array_diff($uids, [$childUid]));
        $position = $afterUid === null ? 0 : (int)array_search($afterUid, $reordered, true) + 1;
        array_splice($reordered, $position, 0, [$childUid]);
        $moved = ['moved' => ['uid' => $childUid, 'position' => $position + 1]];
        if ($reordered === $uids) {
            return new OperationPlan([], write: false, result: $moved);
        }
        return new OperationPlan(
            [(string)$field['parentTable'] => [(int)$form['compileUid'] => [(string)$field['name'] => implode(',', $reordered)]]],
            result: $moved,
        );
    }
}
