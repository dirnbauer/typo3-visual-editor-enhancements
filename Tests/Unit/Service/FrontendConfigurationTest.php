<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\Service\BackendUserProvider;
use Webconsulting\VisualEditorEnhancements\Service\FeatureFlags;
use Webconsulting\VisualEditorEnhancements\Service\FieldChooserConfigurationService;
use Webconsulting\VisualEditorEnhancements\Service\FrontendConfiguration;
use Webconsulting\VisualEditorEnhancements\Tests\Unit\PageTsConfigPriming;

/**
 * What the edit frame receives as window.visualEditorEnhancements. Three
 * layers decide every switch - the install-wide flag, the user's own setting
 * and the page TSconfig - and a feature is on only when all three allow it.
 */
final class FrontendConfigurationTest extends TestCase
{
    use PageTsConfigPriming;

    /**
     * @var array<string, mixed>|null
     */
    private ?array $confVarsBackup = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->confVarsBackup = $GLOBALS['TYPO3_CONF_VARS'] ?? null;
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements'] = [];
        $GLOBALS['TCA'] = ['tt_content' => ['columns' => []]];
        $this->registerRuntimeCache();
        $this->primePageTsConfig(666, '');
    }

    protected function tearDown(): void
    {
        if ($this->confVarsBackup === null) {
            unset($GLOBALS['TYPO3_CONF_VARS']);
        } else {
            $GLOBALS['TYPO3_CONF_VARS'] = $this->confVarsBackup;
        }
        unset($GLOBALS['TCA']);
        GeneralUtility::purgeInstances();
        parent::tearDown();
    }

    #[Test]
    public function everythingIsOnByDefault(): void
    {
        self::assertSame([
            'elementLibraryEnabled' => true,
            'elementLibraryColumns' => 3,
            'contextButtonsEnabled' => true,
            'editableLinksEnabled' => true,
            'fieldChooserMode' => 'tabs',
            'fieldChooserTables' => ['tt_content'],
            'elementRefreshEnabled' => true,
        ], $this->build([], 666));
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function featureFlagProvider(): iterable
    {
        yield 'element library' => ['elementLibraryEnabled', 'elementLibraryEnabled'];
        yield 'editable links' => ['editableLinksEnabled', 'editableLinksEnabled'];
        yield 'element refresh' => ['elementRefreshEnabled', 'elementRefreshEnabled'];
    }

    #[Test]
    #[DataProvider('featureFlagProvider')]
    public function anInstallWideFlagSwitchesTheFeatureOff(string $flag, string $configurationKey): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements'][$flag] = false;

        self::assertFalse($this->build([], 666)[$configurationKey]);
    }

    #[Test]
    public function theFieldChooserFlagDisablesTheChooserAndItsTables(): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['fieldChooserEnabled'] = false;

        $configuration = $this->build([], 666);

        self::assertSame('disabled', $configuration['fieldChooserMode']);
        self::assertSame([], $configuration['fieldChooserTables']);
    }

    #[Test]
    public function theUserSettingsNarrowWhatTheFlagsAllow(): void
    {
        $configuration = $this->build([
            'tx_visualeditor_showLibrary' => 0,
            'tx_visualeditor_showContextButtons' => 0,
            'tx_visualeditor_fieldChooserMode' => 'sections',
            'tx_visualeditor_panelColumns' => 1,
        ], 666);

        self::assertFalse($configuration['elementLibraryEnabled']);
        self::assertFalse($configuration['contextButtonsEnabled']);
        // The link buttons are context buttons too.
        self::assertFalse($configuration['editableLinksEnabled']);
        self::assertSame('sections', $configuration['fieldChooserMode']);
        self::assertSame(1, $configuration['elementLibraryColumns']);
    }

    #[Test]
    public function anUnknownStoredModeFallsBackToTabsAndAnUnknownColumnCountToWide(): void
    {
        $configuration = $this->build([
            'tx_visualeditor_fieldChooserMode' => 'carousel',
            'tx_visualeditor_panelColumns' => 7,
        ], 666);

        self::assertSame('tabs', $configuration['fieldChooserMode']);
        self::assertSame(3, $configuration['elementLibraryColumns']);
    }

    #[Test]
    public function withoutAResolvedPageThereIsNoTsConfigScopeAndTheChooserStaysOff(): void
    {
        $configuration = $this->build([], null);

        self::assertSame('disabled', $configuration['fieldChooserMode']);
        self::assertSame([], $configuration['fieldChooserTables']);
        self::assertTrue($configuration['elementLibraryEnabled'], 'The page-independent features stay on.');
    }

    #[Test]
    public function pageTsConfigCanSwitchTheChooserOffForAPageTree(): void
    {
        $this->primePageTsConfig(667, 'tx_visualeditorenhancements.fieldChooser.enabled = 0');

        $configuration = $this->build([], 667);

        self::assertSame('disabled', $configuration['fieldChooserMode']);
        self::assertSame([], $configuration['fieldChooserTables']);
    }

    /**
     * @param array<string, mixed> $userSettings
     *
     * @return array<string, mixed>
     */
    private function build(array $userSettings, ?int $pageId): array
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->uc = $userSettings;
        $backendUserProvider = self::createStub(BackendUserProvider::class);
        $backendUserProvider->method('getOrThrow')->willReturn($backendUser);

        $tcaSchemaFactory = self::createStub(TcaSchemaFactory::class);
        $tcaSchemaFactory->method('has')->willReturnCallback(static fn(string $table): bool => isset($GLOBALS['TCA'][$table]));

        return (new FrontendConfiguration(
            new FeatureFlags(),
            new FieldChooserConfigurationService($tcaSchemaFactory),
            $backendUserProvider,
        ))->build($pageId);
    }
}
