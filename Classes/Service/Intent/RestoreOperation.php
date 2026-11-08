<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

use TYPO3\CMS\Backend\Utility\BackendUtility;

/**
 * restore: undo a removal staged in this workspace. The intent names the live uid
 * a listed delete placeholder shows; the version uids come from the server's own
 * lookup (InlineRecordService::placeholder): Core's discard of the entry's delete
 * placeholder and of the placeholders the delete cascade left on its
 * translations; below an owner with a draft, Core's version command then drafts
 * the (leaf) entry again, as every member of a drafted collection is, and the
 * parent draft's list takes it back at the place the placeholder was listed
 * (the removal renumbered the later entries' drafts; without this the entry
 * would tie with its old successor). Nothing is written to live rows, and the
 * parent's list only where the parent already has a draft, so Core's
 * first-version bookkeeping is never masked. Live removals are final.
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
        $childTable = (string)$field['_config']['foreign_table'];
        $followUp = null;
        if (in_array((int)$child['uid'], array_map('intval', $child['_restore']['redraft']), true)) {
            // Members listed before the placeholder = its index in the parent's list.
            $at = 0;
            foreach ($field['children'] as $candidate) {
                if ($candidate === $child) {
                    break;
                }
                $at += $candidate['state'] === 'deleted' ? 0 : 1;
            }
            /** @var list<int> $uids */
            $uids = $field['uids'];
            $parent = [(string)$field['parentTable'], (int)$form['compileUid'], (string)$field['name']];
            $workspace = (int)$form['workspaceId'];
            $liveUid = (int)$child['uid'];
            $followUp = static function () use ($childTable, $liveUid, $workspace, $uids, $at, $parent): ?array {
                $draft = BackendUtility::getWorkspaceVersionOfRecord($workspace, $childTable, $liveUid, 'uid');
                if (!is_array($draft)) {
                    return null;
                }
                array_splice($uids, $at, 0, [(int)$draft['uid']]);
                [$parentTable, $parentUid, $name] = $parent;
                return [[$parentTable => [$parentUid => [$name => implode(',', $uids)]]], []];
            };
        }
        return new OperationPlan(
            [],
            [$childTable => $commands],
            cmdFirst: true,
            followUp: $followUp,
            result: ['restored' => ['uid' => (int)$child['uid'], 'translations' => count($versions) - 1]],
            mayVersion: false,
        );
    }
}
