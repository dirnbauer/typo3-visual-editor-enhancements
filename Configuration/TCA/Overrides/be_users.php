<?php

declare(strict_types=1);

use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

defined('TYPO3') or die();

/*
 * Per-user preferences for the visual editor element library, shown as a
 * dedicated tab in the backend user settings (setup) module. Values are
 * stored in be_users.uc and passed to the frontend edit frame by this
 * extension's edit-mode middleware.
 */
$visualEditorSetupLabels = 'LLL:EXT:visual_editor_enhancements/Resources/Private/Language/locallang_setup.xlf:';

$GLOBALS['TCA']['be_users']['columns']['user_settings']['showitem'] =
    ($GLOBALS['TCA']['be_users']['columns']['user_settings']['showitem'] ?? '')
    . ', --div--;' . $visualEditorSetupLabels . 'tab';

ExtensionManagementUtility::addUserSetting(
    'tx_visualeditor_showLibrary',
    [
        'label' => $visualEditorSetupLabels . 'showLibrary',
        'description' => $visualEditorSetupLabels . 'showLibrary.description',
        'config' => [
            'type' => 'check',
            'renderType' => 'checkboxToggle',
            'default' => 1,
        ],
    ],
    'after:--div--;' . $visualEditorSetupLabels . 'tab'
);

ExtensionManagementUtility::addUserSetting(
    'tx_visualeditor_showContextButtons',
    [
        'label' => $visualEditorSetupLabels . 'showContextButtons',
        'description' => $visualEditorSetupLabels . 'showContextButtons.description',
        'config' => [
            'type' => 'check',
            'renderType' => 'checkboxToggle',
            'default' => 1,
        ],
    ],
    'after:tx_visualeditor_showLibrary'
);

ExtensionManagementUtility::addUserSetting(
    'tx_visualeditor_fieldChooserMode',
    [
        'label' => $visualEditorSetupLabels . 'fieldChooserMode',
        'description' => $visualEditorSetupLabels . 'fieldChooserMode.description',
        'config' => [
            'type' => 'select',
            'renderType' => 'selectSingle',
            'default' => 'tabs',
            'items' => [
                ['label' => $visualEditorSetupLabels . 'fieldChooserMode.tabs', 'value' => 'tabs'],
                ['label' => $visualEditorSetupLabels . 'fieldChooserMode.sections', 'value' => 'sections'],
                ['label' => $visualEditorSetupLabels . 'fieldChooserMode.disabled', 'value' => 'disabled'],
            ],
        ],
    ],
    'after:tx_visualeditor_showContextButtons'
);

ExtensionManagementUtility::addUserSetting(
    'tx_visualeditor_panelColumns',
    [
        'label' => $visualEditorSetupLabels . 'panelColumns',
        'description' => $visualEditorSetupLabels . 'panelColumns.description',
        'config' => [
            'type' => 'select',
            'renderType' => 'selectSingle',
            'default' => 3,
            'items' => [
                ['label' => $visualEditorSetupLabels . 'panelColumns.small', 'value' => 1],
                ['label' => $visualEditorSetupLabels . 'panelColumns.wide', 'value' => 3],
            ],
        ],
    ],
    'after:tx_visualeditor_fieldChooserMode'
);
