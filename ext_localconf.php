<?php

declare(strict_types=1);

defined('TYPO3') or die();

$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementLibraryEnabled'] ??= true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['editableLinksEnabled'] ??= true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['fieldChooserEnabled'] ??= true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementRefreshEnabled'] ??= true;

/*
 * Adds this extension's ViewHelpers to the `f` Fluid namespace, the same way
 * EXT:visual_editor adds its own. Fluid resolves the entries of a namespace in
 * reverse registration order, so `f:render.link` finds the ViewHelper below
 * while every core and Visual Editor tag keeps resolving as before. This
 * replaces the PSR-4 autoload trick of releases up to 0.8.0, which registered
 * the class inside the Visual Editor's own PHP namespace.
 */
$GLOBALS['TYPO3_CONF_VARS']['SYS']['fluid']['namespaces']['f'][] = 'Webconsulting\\VisualEditorEnhancements\\ViewHelpers';
