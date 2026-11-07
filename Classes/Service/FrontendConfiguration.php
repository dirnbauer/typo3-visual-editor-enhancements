<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Webconsulting\VisualEditorEnhancements\Enum\ActionLabelMode;
use Webconsulting\VisualEditorEnhancements\Enum\EntriesLayout;
use Webconsulting\VisualEditorEnhancements\Enum\FieldChooserMode;

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
        private ?CollectionFieldIndex $collectionFieldIndex = null,
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
     *     fieldChooserMode: value-of<FieldChooserMode>,
     *     fieldChooserTables: list<string>,
     *     inlineRecordsEnabled: bool,
     *     collectionTypes: array<string, array<string, list<string>>>,
     *     workspaceId: int,
     *     workspaceTitle: string,
     *     elementRefreshEnabled: bool,
     *     colorScheme: 'auto'|'light'|'dark',
     *     actionLabelMode: value-of<ActionLabelMode>,
     *     entriesLayout: value-of<EntriesLayout>
     * }
     */
    public function build(?int $pageId): array
    {
        $userSettings = $this->backendUserProvider->getOrThrow()->uc;
        $contextButtonsEnabled = (bool)($userSettings['tx_visualeditor_showContextButtons'] ?? true);

        $fieldChooserMode = FieldChooserMode::Disabled;
        $fieldChooserTables = [];
        if ($pageId !== null && $this->features->isFieldChooserEnabled()) {
            $fieldChooserMode = FieldChooserMode::fromUserSetting($userSettings['tx_visualeditor_fieldChooserMode'] ?? null);
            $fieldChooserTables = $fieldChooserMode === FieldChooserMode::Disabled ? [] : $this->fieldChooserConfiguration->getEnabledTables($pageId);
            if ($fieldChooserTables === []) {
                $fieldChooserMode = FieldChooserMode::Disabled;
            }
        }

        $inlineRecordsEnabled = $pageId !== null && (new InlineRecordConfiguration($this->backendUserProvider, $this->features))->enabled($pageId);
        $workspaceId = $this->backendUserProvider->getOrThrow()->workspace;

        return [
            'elementLibraryEnabled' => $this->features->isElementLibraryEnabled()
                && (bool)($userSettings['tx_visualeditor_showLibrary'] ?? true),
            'elementLibraryColumns' => (int)($userSettings['tx_visualeditor_panelColumns'] ?? 3) === 1 ? 1 : 3,
            'contextButtonsEnabled' => $contextButtonsEnabled,
            'editableLinksEnabled' => $contextButtonsEnabled && $this->features->isEditableLinksEnabled(),
            'fieldChooserMode' => $fieldChooserMode->value,
            'fieldChooserTables' => $fieldChooserTables,
            'inlineRecordsEnabled' => $inlineRecordsEnabled,
            'collectionTypes' => $inlineRecordsEnabled && $pageId !== null ? ($this->collectionFieldIndex?->build($pageId) ?? []) : [],
            'workspaceId' => $workspaceId,
            'workspaceTitle' => $this->backendUserProvider->workspaceTitle($workspaceId),
            'elementRefreshEnabled' => $this->features->isElementRefreshEnabled(),
            'colorScheme' => $this->colorScheme($userSettings['colorScheme'] ?? null),
            'actionLabelMode' => ActionLabelMode::fromUserSetting($userSettings['tx_visualeditor_actionLabels'] ?? null)->value,
            'entriesLayout' => EntriesLayout::fromUserSetting($userSettings['tx_visualeditor_entriesLayout'] ?? null)->value,
        ];
    }

    /**
     * The backend user's colour scheme (User settings, or the switch in the
     * user menu). The edit frame paints its chrome in it until the backend
     * frame hands over the resolved theme (Shared/theme.js).
     *
     * @return 'auto'|'light'|'dark'
     */
    private function colorScheme(mixed $setting): string
    {
        return match ($setting) {
            'light', 'dark' => $setting,
            default => 'auto',
        };
    }
}
