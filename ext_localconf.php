<?php

declare(strict_types=1);

defined('TYPO3') or die();

/*
 * Adds this extension's ViewHelpers to the `f` Fluid namespace, the same way
 * EXT:visual_editor adds its own. Fluid resolves the entries of a namespace in
 * reverse registration order, so `f:render.link` finds the ViewHelper below
 * while every core and Visual Editor tag keeps resolving as before.
 *
 * The feature flags ($GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements'])
 * default to on and are read by Service\FeatureFlags; a sitepackage switches a
 * feature off by setting its key to false in its own ext_localconf.php.
 */
$GLOBALS['TYPO3_CONF_VARS']['SYS']['fluid']['namespaces']['f'][] = 'Webconsulting\\VisualEditorEnhancements\\ViewHelpers';
