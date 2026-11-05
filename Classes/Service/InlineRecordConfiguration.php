<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;

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
}
