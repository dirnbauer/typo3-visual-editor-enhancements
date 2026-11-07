<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service\Intent;

/**
 * sync: Core's inlineLocalizeSynchronize on the default-language parent, the
 * command FormInlineAjaxController::synchronizeLocalizeAction issues. localize adds
 * the missing translations in default order (all of them, or the selected entries
 * as {field, language, ids}); synchronize additionally removes translations whose
 * original is gone. Translation-only rows stay anchored where they are (Core).
 * The preflight (translated parent compiles, field writable, language access,
 * maxitems, not in a workspace) comes from the payload.
 */
final readonly class SyncOperation implements OperationInterface
{
    #[\Override]
    public function apply(array $field, array $form, array $intent): OperationPlan
    {
        $language = (int)$intent['language'];
        $entry = null;
        foreach ($field['translationLanguages'] ?? [] as $candidate) {
            if ((int)$candidate['id'] === $language) {
                $entry = $candidate;
                break;
            }
        }
        if ($entry === null) {
            throw new IntentRefused((string)($field['syncReason'] ?: 'syncNone'));
        }
        if (!$entry['canSync']) {
            throw new IntentRefused((string)$entry['syncReason']);
        }
        $mode = (string)$intent['mode'];
        if ($mode === 'localize' && (int)$entry['missing'] === 0) {
            throw new IntentRefused('syncNone');
        }
        /** @var list<int> $missing */
        $missing = $field['_sync'][$language]['missing'] ?? [];
        $current = (int)($field['_sync'][$language]['current'] ?? 0);
        $max = (int)$field['maxItems'];
        // Core enforces no maxitems for foreign_field relations; the endpoint does.
        $added = isset($intent['ids']) ? count($intent['ids']) : count($missing);
        $removed = $mode === 'synchronize' ? (int)$entry['orphaned'] : 0;
        if ($max > 0 && $current - $removed + $added > $max) {
            throw new IntentRefused('max');
        }
        $command = ['field' => (string)$field['name'], 'language' => $language];
        if (isset($intent['ids'])) {
            if (array_diff($intent['ids'], $missing) !== []) {
                throw new IntentRefused('stale');
            }
            $command['ids'] = $intent['ids'];
        } else {
            $command['action'] = $mode;
        }
        $live = (int)(($form['resolvedRow']['t3ver_oid'] ?? 0) ?: $form['resolvedRow']['uid']);
        return new OperationPlan(
            [],
            [(string)$field['parentTable'] => [$live => ['inlineLocalizeSynchronize' => $command]]],
            cmdFirst: true,
            result: ['synced' => ['language' => $language, 'mode' => $mode]],
        );
    }
}
