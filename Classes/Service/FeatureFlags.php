<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/**
 * The install-wide switches of this extension, read from
 * $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements'].
 *
 * Every feature is on unless a sitepackage's ext_localconf.php sets its key
 * to false. There is deliberately no ext_conf_template: a flag stored through
 * the Settings module lands in the git-ignored settings.php and is lost on the
 * next deployment.
 */
final readonly class FeatureFlags
{
    public function isElementLibraryEnabled(): bool
    {
        return $this->flag('elementLibraryEnabled');
    }

    public function isEditableLinksEnabled(): bool
    {
        return $this->flag('editableLinksEnabled');
    }

    public function isFieldChooserEnabled(): bool
    {
        return $this->flag('fieldChooserEnabled');
    }

    public function isElementRefreshEnabled(): bool
    {
        return $this->flag('elementRefreshEnabled');
    }

    private function flag(string $key): bool
    {
        return (bool)($GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements'][$key] ?? true);
    }
}
