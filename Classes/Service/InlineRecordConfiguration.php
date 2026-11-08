<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;

/**
 * Page TSconfig tx_visualeditorenhancements.inlineRecords. Every behaviour that
 * changed from 1.5 has its own key, so the 1.5 behaviour is one line away:
 *
 *   enabled = 1               createHidden = 1          requireWorkspace = 0
 *   firstVersion = 1          (0: refuse the first workspace draft, reason firstVersion)
 *   translatedParents = parity        (default-only restores 1.5)
 *   deleteTranslations = confirm      (refuse restores 1.5)
 *   syncTranslations = 1      syncDefaultMode = localize
 *   tables.<child>.enabled = 1
 */
final readonly class InlineRecordConfiguration
{
    public function __construct(private BackendUserProvider $users, private FeatureFlags $flags) {}

    /** @return array<string, mixed> */
    public function forPage(int $pid): array
    {
        $config = BackendUtility::getPagesTSconfig($pid)['tx_visualeditorenhancements.']['inlineRecords.'] ?? [];
        return is_array($config) ? $config : [];
    }

    public function enabled(int $pid): bool
    {
        return $pid > 0 && $this->flags->isInlineRecordsEnabled()
            && (bool)($this->users->getOrThrow()->uc['tx_visualeditor_inlineRecords'] ?? false)
            && (bool)($this->forPage($pid)['enabled'] ?? true);
    }

    /**
     * parity: connected translated parents behave like FormEngine (translation-only
     * rows, remove/hide/move of translated rows); default-only: structure only in
     * the default language (1.5).
     *
     * @return 'parity'|'default-only'
     */
    public function translatedParents(int $pid): string
    {
        return ($this->forPage($pid)['translatedParents'] ?? '') === 'default-only' ? 'default-only' : 'parity';
    }

    /**
     * confirm: removing a default-language entry cascades to its translations after
     * a counted confirmation (Core deleteL10nOverlayRecords); refuse: backend form (1.5).
     *
     * @return 'confirm'|'refuse'
     */
    public function deleteTranslations(int $pid): string
    {
        return ($this->forPage($pid)['deleteTranslations'] ?? '') === 'refuse' ? 'refuse' : 'confirm';
    }

    public function syncTranslations(int $pid): bool
    {
        return (bool)($this->forPage($pid)['syncTranslations'] ?? true);
    }

    /** @return 'localize'|'synchronize' */
    public function syncDefaultMode(int $pid): string
    {
        return ($this->forPage($pid)['syncDefaultMode'] ?? '') === 'synchronize' ? 'synchronize' : 'localize';
    }

    /**
     * Allow the first workspace draft of a collection through Core's stock
     * auto-versioning under the narrowed live-row invariant (default since 1.7.0).
     * firstVersion = 0 restores the refusal with the reason 'firstVersion'.
     */
    public function firstVersion(int $pid): bool
    {
        return (bool)($this->forPage($pid)['firstVersion'] ?? true);
    }
}
