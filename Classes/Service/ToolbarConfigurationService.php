<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;

/**
 * Which of the Visual Editor module's toolbar controls a page tree offers,
 * from the page TSconfig of the edited page:
 *
 * ````typoscript
 *   tx_visualeditorenhancements.toolbar {
 *     # The "single language / multi language" view switch (default: 1)
 *     viewModeSelector = 0
 *     # The autosave toggle (default: 1)
 *     autoSave = 0
 *   }
 * ````
 *
 * The Visual Editor itself has no setting for either control: the autosave
 * toggle is shown whenever EXT:workspaces is installed, the view switch
 * whenever the page has translations. Everything is on unless configured off,
 * and a request without a page has nothing to configure it, so it keeps the
 * defaults.
 */
final readonly class ToolbarConfigurationService
{
    public function isViewModeSelectorEnabled(int $pageId): bool
    {
        return $this->flag($pageId, 'viewModeSelector');
    }

    public function isAutoSaveEnabled(int $pageId): bool
    {
        return $this->flag($pageId, 'autoSave');
    }

    private function flag(int $pageId, string $key): bool
    {
        if ($pageId <= 0) {
            return true;
        }

        $configuration = BackendUtility::getPagesTSconfig($pageId)['tx_visualeditorenhancements.']['toolbar.'] ?? [];
        if (!is_array($configuration) || !isset($configuration[$key])) {
            return true;
        }

        return (bool)$configuration[$key];
    }
}
