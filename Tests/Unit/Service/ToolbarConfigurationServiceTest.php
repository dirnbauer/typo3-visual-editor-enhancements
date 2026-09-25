<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\Service\ToolbarConfigurationService;
use Webconsulting\VisualEditorEnhancements\Tests\Unit\PageTsConfigPriming;

/**
 * Both toolbar controls stay unless the page TSconfig of the edited page
 * switches them off, and a request without a page keeps the defaults.
 */
final class ToolbarConfigurationServiceTest extends TestCase
{
    use PageTsConfigPriming;

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->registerRuntimeCache();
    }

    #[\Override]
    protected function tearDown(): void
    {
        GeneralUtility::purgeInstances();
        parent::tearDown();
    }

    #[Test]
    public function everythingIsOnWithoutTsConfig(): void
    {
        $this->primePageTsConfig(666, '');
        $service = new ToolbarConfigurationService();

        self::assertTrue($service->isViewModeSelectorEnabled(666));
        self::assertTrue($service->isAutoSaveEnabled(666));
    }

    #[Test]
    public function eachControlIsSwitchedOffOnItsOwn(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.viewModeSelector = 0');
        $this->primePageTsConfig(667, 'tx_visualeditorenhancements.toolbar.autoSave = 0');
        $service = new ToolbarConfigurationService();

        self::assertFalse($service->isViewModeSelectorEnabled(666));
        self::assertTrue($service->isAutoSaveEnabled(666));
        self::assertTrue($service->isViewModeSelectorEnabled(667));
        self::assertFalse($service->isAutoSaveEnabled(667));
    }

    #[Test]
    public function anExplicitOneKeepsAControl(): void
    {
        $this->primePageTsConfig(666, <<<'TYPOSCRIPT'
            tx_visualeditorenhancements.toolbar {
              viewModeSelector = 1
              autoSave = 1
            }
            TYPOSCRIPT);
        $service = new ToolbarConfigurationService();

        self::assertTrue($service->isViewModeSelectorEnabled(666));
        self::assertTrue($service->isAutoSaveEnabled(666));
    }

    /**
     * No page, no TSconfig scope: the service must not guess one.
     */
    #[Test]
    public function withoutAPageTheDefaultsApply(): void
    {
        $service = new ToolbarConfigurationService();

        self::assertTrue($service->isViewModeSelectorEnabled(0));
        self::assertTrue($service->isAutoSaveEnabled(0));
    }
}
