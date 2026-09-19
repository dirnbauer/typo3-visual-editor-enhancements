<?php

declare(strict_types=1);

use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

defined('TYPO3') or die();

/*
 * Per-user preferences of this extension, shown as a dedicated "Visual editor"
 * tab in User settings. Values are stored in be_users.uc and passed to the
 * edit frame by Service\FrontendConfiguration.
 */
(static function (): void {
    $labels = 'LLL:EXT:visual_editor_enhancements/Resources/Private/Language/locallang_setup.xlf:';
    $toggle = ['type' => 'check', 'renderType' => 'checkboxToggle', 'default' => 1];
    $settings = [
        'tx_visualeditor_showLibrary' => $toggle,
        'tx_visualeditor_showContextButtons' => $toggle,
        'tx_visualeditor_fieldChooserMode' => [
            'type' => 'select',
            'renderType' => 'selectSingle',
            'default' => 'tabs',
            'items' => [
                ['label' => $labels . 'fieldChooserMode.tabs', 'value' => 'tabs'],
                ['label' => $labels . 'fieldChooserMode.sections', 'value' => 'sections'],
                ['label' => $labels . 'fieldChooserMode.disabled', 'value' => 'disabled'],
            ],
        ],
        'tx_visualeditor_panelColumns' => [
            'type' => 'select',
            'renderType' => 'selectSingle',
            'default' => 3,
            'items' => [
                ['label' => $labels . 'panelColumns.small', 'value' => 1],
                ['label' => $labels . 'panelColumns.wide', 'value' => 3],
            ],
        ],
    ];

    $GLOBALS['TCA']['be_users']['columns']['user_settings']['showitem'] =
        ($GLOBALS['TCA']['be_users']['columns']['user_settings']['showitem'] ?? '')
        . ', --div--;' . $labels . 'tab';

    $position = 'after:--div--;' . $labels . 'tab';
    foreach ($settings as $name => $config) {
        $labelKey = substr($name, strlen('tx_visualeditor_'));
        ExtensionManagementUtility::addUserSetting(
            $name,
            [
                'label' => $labels . $labelKey,
                'description' => $labels . $labelKey . '.description',
                'config' => $config,
            ],
            $position,
        );
        $position = 'after:' . $name;
    }
})();
