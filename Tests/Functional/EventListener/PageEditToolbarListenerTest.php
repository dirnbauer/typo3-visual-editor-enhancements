<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\EventListener;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Backend\Template\Components\ButtonBar;
use TYPO3\CMS\Backend\Template\Components\Buttons\ButtonInterface;
use TYPO3\CMS\Backend\Template\Components\Buttons\DropDownButton;
use TYPO3\CMS\Backend\Template\Components\Buttons\GenericButton;
use TYPO3\CMS\Backend\Template\Components\ComponentFactory;
use TYPO3\CMS\Backend\Template\ModuleTemplateFactory;
use TYPO3\CMS\Core\Configuration\SiteWriter;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\Http\NormalizedParams;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Imaging\IconFactory;
use TYPO3\CMS\Core\Imaging\IconSize;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\EventListener\PageEditToolbarListener;

/**
 * The toolbar switches wired up for real: the listener registered through
 * the DI container, fired by Core's event dispatcher from Core's own
 * ButtonBar, on Core's own button classes, with page TSconfig read from the
 * database - for the Visual Editor module's route and nobody else's.
 */
final class PageEditToolbarListenerTest extends FunctionalTestCase
{
    protected array $coreExtensionsToLoad = [
        'rte_ckeditor',
    ];

    protected array $testExtensionsToLoad = [
        'friendsoftypo3/visual-editor',
        'webconsulting/visual-editor-enhancements',
    ];

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../Middleware/Fixtures/be_users.csv');
        $this->importCSVDataSet(__DIR__ . '/Fixtures/pages.csv');
        $this->get(SiteWriter::class)->write('test', [
            'rootPageId' => 1,
            'base' => 'https://vee.test/',
            'languages' => [
                [
                    'languageId' => 0,
                    'title' => 'English',
                    'locale' => 'en_US.UTF-8',
                    'base' => '/',
                    'navigationTitle' => 'English',
                    'flag' => 'us',
                ],
            ],
        ]);
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
    }

    #[Test]
    public function bothControlsAreGoneWhereThePageTsConfigSwitchesThemOff(): void
    {
        $buttons = $this->renderedButtons($this->moduleRequest('web_edit', 666));

        self::assertSame([2, 3], array_keys($buttons[ButtonBar::BUTTON_POSITION_LEFT]));
        self::assertSame(['ve-backend-save-button'], $this->tags($buttons[ButtonBar::BUTTON_POSITION_LEFT][2]));
        self::assertSame(['ve-spotlight-toggle'], $this->tags($buttons[ButtonBar::BUTTON_POSITION_LEFT][3]));
    }

    #[Test]
    public function thePageWithoutTsConfigKeepsTheToolbarAsDelivered(): void
    {
        $buttons = $this->renderedButtons($this->moduleRequest('web_edit', 667));

        self::assertSame([0, 2, 3], array_keys($buttons[ButtonBar::BUTTON_POSITION_LEFT]));
        self::assertInstanceOf(DropDownButton::class, $buttons[ButtonBar::BUTTON_POSITION_LEFT][0][0]);
        self::assertSame(
            [PageEditToolbarListener::AUTO_SAVE_TOGGLE_TAG, 've-backend-save-button'],
            $this->tags($buttons[ButtonBar::BUTTON_POSITION_LEFT][2]),
        );
    }

    #[Test]
    public function thePageModuleIsNotTouchedEvenOnTheSwitchedOffPage(): void
    {
        $buttons = $this->renderedButtons($this->moduleRequest('web_layout', 666));

        self::assertSame([0, 2, 3], array_keys($buttons[ButtonBar::BUTTON_POSITION_LEFT]));
    }

    /**
     * Fills a ButtonBar the way the Visual Editor's PageEditController and
     * Core's DocHeaderComponent do - the view-mode menu as a dropdown in
     * group 0, autosave and save in group 2, spotlight in group 3 - and
     * returns what Core hands to the template after the event ran.
     *
     * @return array<string, array<int, list<ButtonInterface>>>
     */
    private function renderedButtons(ServerRequest $request): array
    {
        $buttonBar = $this->get(ModuleTemplateFactory::class)->create($request)->getDocHeaderComponent()->getButtonBar();
        $componentFactory = GeneralUtility::makeInstance(ComponentFactory::class);

        $viewMode = $componentFactory->createDropDownButton()->setLabel('Single language')->setShowLabelText(true);
        foreach ([1 => 'Single language', 2 => 'Multi language'] as $mode => $label) {
            $viewMode->addItem(
                $componentFactory->createDropDownRadio()
                    ->setLabel($label)
                    ->setHref('/typo3/module/web/edit?token=t&id=666&viewMode=' . $mode)
                    ->setActive($mode === 1),
            );
        }
        $buttonBar->addButton($viewMode, ButtonBar::BUTTON_POSITION_LEFT, 0);
        $buttonBar->addButton($this->genericButton($buttonBar, PageEditToolbarListener::AUTO_SAVE_TOGGLE_TAG, 'Autosave'), ButtonBar::BUTTON_POSITION_LEFT, 2);
        $buttonBar->addButton($this->genericButton($buttonBar, 've-backend-save-button', 'Save'), ButtonBar::BUTTON_POSITION_LEFT, 2);
        $buttonBar->addButton($this->genericButton($buttonBar, 've-spotlight-toggle', 'Spotlight'), ButtonBar::BUTTON_POSITION_LEFT, 3);

        return $buttonBar->getButtons($request);
    }

    private function genericButton(ButtonBar $buttonBar, string $tag, string $label): GenericButton
    {
        $button = $buttonBar->makeButton(GenericButton::class);
        self::assertInstanceOf(GenericButton::class, $button);

        return $button
            ->setTag($tag)
            ->setLabel($label)
            ->setShowLabelText(true)
            ->setIcon($this->get(IconFactory::class)->getIcon('actions-toggle-off', IconSize::SMALL));
    }

    private function moduleRequest(string $routeIdentifier, int $pageId): ServerRequest
    {
        $request = new ServerRequest('https://vee.test/typo3/module/web/' . ($routeIdentifier === 'web_edit' ? 'edit' : 'layout'))
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE)
            ->withQueryParams(['id' => (string)$pageId])
            ->withAttribute('route', new Route('/module/web/' . $routeIdentifier, ['_identifier' => $routeIdentifier]));

        return $request->withAttribute('normalizedParams', NormalizedParams::createFromRequest($request));
    }

    /**
     * @param list<ButtonInterface> $buttons
     * @return list<string>
     */
    private function tags(array $buttons): array
    {
        return array_map(
            static fn(ButtonInterface $button): string => $button instanceof GenericButton ? $button->getTag() : $button::class,
            $buttons,
        );
    }
}
