<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/**
 * The configuration the edit frame receives as window.visualEditorEnhancements:
 * the install-wide feature flags combined with the backend user's own settings
 * (User settings > Visual editor) and the page TSconfig of the edited page.
 * A feature is active only when all three allow it.
 */
final readonly class FrontendConfiguration
{
    public function __construct(
        private FeatureFlags $features,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
        private BackendUserProvider $backendUserProvider,
    ) {}

    /**
     * @param int|null $pageId the resolved page, or null when routing did not
     *                         resolve one - then there is no TSconfig scope and
     *                         the field chooser stays off for that request
     *
     * @return array{
     *     elementLibraryEnabled: bool,
     *     elementLibraryColumns: 1|3,
     *     contextButtonsEnabled: bool,
     *     editableLinksEnabled: bool,
     *     fieldChooserMode: 'disabled'|'sections'|'tabs',
     *     fieldChooserTables: list<string>,
     *     elementRefreshEnabled: bool
     * }
     */
    public function build(?int $pageId): array
    {
        $userSettings = $this->backendUserProvider->getOrThrow()->uc;
        $contextButtonsEnabled = (bool)($userSettings['tx_visualeditor_showContextButtons'] ?? true);

        $fieldChooserMode = 'disabled';
        $fieldChooserTables = [];
        if ($pageId !== null && $this->features->isFieldChooserEnabled()) {
            $fieldChooserMode = $this->fieldChooserMode($userSettings);
            $fieldChooserTables = $fieldChooserMode === 'disabled' ? [] : $this->fieldChooserConfiguration->getEnabledTables($pageId);
            if ($fieldChooserTables === []) {
                $fieldChooserMode = 'disabled';
            }
        }

        return [
            'elementLibraryEnabled' => $this->features->isElementLibraryEnabled()
                && (bool)($userSettings['tx_visualeditor_showLibrary'] ?? true),
            'elementLibraryColumns' => (int)($userSettings['tx_visualeditor_panelColumns'] ?? 3) === 1 ? 1 : 3,
            'contextButtonsEnabled' => $contextButtonsEnabled,
            'editableLinksEnabled' => $contextButtonsEnabled && $this->features->isEditableLinksEnabled(),
            'fieldChooserMode' => $fieldChooserMode,
            'fieldChooserTables' => $fieldChooserTables,
            'elementRefreshEnabled' => $this->features->isElementRefreshEnabled(),
        ];
    }

    /**
     * @param array<string, mixed> $userSettings
     *
     * @return 'disabled'|'sections'|'tabs'
     */
    private function fieldChooserMode(array $userSettings): string
    {
        $mode = $userSettings['tx_visualeditor_fieldChooserMode'] ?? 'tabs';

        return \in_array($mode, ['disabled', 'sections', 'tabs'], true) ? $mode : 'tabs';
    }
}
