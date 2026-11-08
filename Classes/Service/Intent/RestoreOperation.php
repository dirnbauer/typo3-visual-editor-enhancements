<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * restore: undo a removal staged in this workspace. The intent names the live uid
 * a listed delete placeholder shows; the version uids come from the server's own
 * lookup (InlineRecordService::placeholder): Core's discard of the entry's delete
 * placeholder and of the placeholders the delete cascade left on its
 * translations; below an owner with a draft, Core's version command then drafts
 * the (leaf) entry again, as every member of a drafted collection is. Nothing is
 * written to live rows or to the parent's list, so Core's first-version
 * bookkeeping is never masked. Live removals are final.
 */
final readonly class RestoreOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        if ((int)$form['workspaceId'] === 0) {
            throw new IntentRefused('restoreLive');
        }
        $child = null;
        foreach ($field['children'] as $candidate) {
            if ($candidate['uid'] === $intent['childUid'] && $candidate['state'] === 'deleted') {
                $child = $candidate;
                break;
            }
        }
        if ($child === null) {
            throw new IntentRefused('stale');
        }
        if (!$child['canRestore']) {
            throw new IntentRefused((string)$child['restoreReason']);
        }
        /** @var list<int> $versions */
        $versions = $child['_restore']['versions'];
        $commands = array_fill_keys($versions, ['discard' => 1]);
        // After the discards (array order is Core's processing order).
        foreach ($child['_restore']['redraft'] as $liveUid) {
            $commands[(int)$liveUid] = ['version' => ['action' => 'new', 'label' => 'Restored']];
        }
        return new OperationPlan(
            [],
            [(string)$field['_config']['foreign_table'] => $commands],
            cmdFirst: true,
            result: ['restored' => ['uid' => (int)$child['uid'], 'translations' => count($versions) - 1]],
            mayVersion: false,
        );
    }
}
