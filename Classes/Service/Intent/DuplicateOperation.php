<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

use TYPO3\CMS\Core\DataHandling\DataHandler;

/**
 * duplicate: Core's copy of a listed leaf entry, placed directly after it
 * (target -uid, the paste position of the page module), in its own language only
 * (ignoreLocalization: translations follow by Sync translations, no translated
 * parent is written). Then, like create, the parent's inline list with the copy
 * after its source - checkValue_inline_processDBdata registers it and renumbers
 * the members' sorting - and, in live with createHidden, the copy hidden.
 * Entries with nested inline/file members, entries below a connected
 * translation, a full collection and disabled controls are refused before.
 */
final readonly class DuplicateOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        $child = null;
        foreach ($field['children'] as $candidate) {
            if ($candidate['uid'] === $intent['childUid'] && $candidate['state'] !== 'deleted') {
                $child = $candidate;
                break;
            }
        }
        if ($child === null) {
            throw new IntentRefused('stale');
        }
        if (!$child['canDuplicate']) {
            throw new IntentRefused((string)$child['duplicateReason']);
        }
        $childTable = (string)$field['_config']['foreign_table'];
        $source = (int)$child['liveUid'];
        $hiddenField = (string)$field['hiddenField'];
        /** @var list<int> $uids */
        $uids = $field['uids'];
        $parent = [(string)$field['parentTable'], (int)$form['compileUid'], (string)$field['name']];
        $hide = $hiddenField !== '' && (bool)$field['createHidden'];
        $after = (int)$child['uid'];
        return new OperationPlan(
            [],
            [$childTable => [$source => ['copy' => ['target' => -$source, 'ignoreLocalization' => true]]]],
            cmdFirst: true,
            followUp: static function (DataHandler $handler) use ($childTable, $source, $uids, $parent, $hide, $hiddenField, $after): ?array {
                $copy = (int)($handler->copyMappingArray_merged[$childTable][$source] ?? 0);
                if ($copy <= 0) {
                    return null;
                }
                array_splice($uids, (int)array_search($after, $uids, true) + 1, 0, [$copy]);
                [$parentTable, $parentUid, $name] = $parent;
                $data = [$parentTable => [$parentUid => [$name => implode(',', $uids)]]];
                if ($hide) {
                    $data[$childTable][$copy] = [$hiddenField => 1];
                }
                return [$data, ['created' => ['uid' => $copy, 'table' => $childTable, 'hidden' => $hide, 'hiddenField' => $hiddenField]]];
            },
            result: ['duplicated' => ['uid' => (int)$child['uid']]],
        );
    }
}
