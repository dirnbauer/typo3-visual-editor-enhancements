<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\EventListener;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Backend\Template\Components\ButtonBar;
use TYPO3\CMS\Backend\Template\Components\Buttons\ButtonInterface;
use TYPO3\CMS\Backend\Template\Components\Buttons\DropDown\DropDownRadio;
use TYPO3\CMS\Backend\Template\Components\Buttons\DropDownButton;
use TYPO3\CMS\Backend\Template\Components\Buttons\GenericButton;
use TYPO3\CMS\Backend\Template\Components\ModifyButtonBarEvent;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\EventListener\PageEditToolbarListener;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;
use Webconsulting\VisualEditorEnhancements\Service\ToolbarConfigurationService;
use Webconsulting\VisualEditorEnhancements\Tests\Unit\PageTsConfigPriming;

/**
 * The listener takes exactly the two controls the page TSconfig switches off
 * out of the Visual Editor module's button bar - the autosave toggle and the
 * view-mode switch - and leaves every other button, every other module and an
 * unconfigured page alone.
 */
final class PageEditToolbarListenerTest extends TestCase
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
    public function nothingChangesWithoutTsConfig(): void
    {
        $this->primePageTsConfig(666, '');
        $buttons = $this->buttons();
        $event = $this->createEvent($this->pageEditRequest(666), $buttons);

        ($this->createListener())($event);

        self::assertSame($buttons, $event->getButtons());
    }

    #[Test]
    public function theAutoSaveToggleIsRemovedAndTheSaveButtonStays(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.autoSave = 0');
        $event = $this->createEvent($this->pageEditRequest(666));

        ($this->createListener())($event);

        $left = $event->getButtons()[ButtonBar::BUTTON_POSITION_LEFT];
        self::assertSame(['view-mode'], $this->names($left[0]));
        self::assertSame(['save'], $this->names($left[2]));
        self::assertSame(['spotlight'], $this->names($left[3]));
        self::assertSame(['clear-cache'], $this->names($event->getButtons()[ButtonBar::BUTTON_POSITION_RIGHT][1]));
    }

    #[Test]
    public function theViewModeSwitchIsRemovedWithItsEmptyGroup(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.viewModeSelector = 0');
        $event = $this->createEvent($this->pageEditRequest(666));

        ($this->createListener())($event);

        $left = $event->getButtons()[ButtonBar::BUTTON_POSITION_LEFT];
        self::assertArrayNotHasKey(0, $left);
        self::assertSame(['auto-save', 'save'], $this->names($left[2]));
        self::assertSame(['spotlight'], $this->names($left[3]));
    }

    #[Test]
    public function bothControlsCanGoTogether(): void
    {
        $this->primePageTsConfig(666, <<<'TYPOSCRIPT'
            tx_visualeditorenhancements.toolbar {
              viewModeSelector = 0
              autoSave = 0
            }
            TYPOSCRIPT);
        $event = $this->createEvent($this->pageEditRequest(666));

        ($this->createListener())($event);

        $left = $event->getButtons()[ButtonBar::BUTTON_POSITION_LEFT];
        self::assertSame([2, 3], array_keys($left));
        self::assertSame(['save'], $this->names($left[2]));
    }

    /**
     * A dropdown that is not the view-mode switch - one without viewMode
     * links - is somebody else's and must survive.
     */
    #[Test]
    public function anotherDropdownIsNotMistakenForTheViewModeSwitch(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.viewModeSelector = 0');
        $other = new DropDownButton()
            ->setLabel('other')
            ->addItem(new DropDownRadio()->setLabel('a')->setHref('/typo3/module/web/edit?id=666&function=1'));
        $buttons = $this->buttons();
        $buttons[ButtonBar::BUTTON_POSITION_LEFT][0][] = $other;
        $event = $this->createEvent($this->pageEditRequest(666), $buttons);

        ($this->createListener())($event);

        self::assertSame([$other], $event->getButtons()[ButtonBar::BUTTON_POSITION_LEFT][0]);
    }

    #[Test]
    public function otherModulesAreLeftAlone(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.autoSave = 0');
        $request = new ServerRequest('https://example.com/typo3/module/web/layout')
            ->withQueryParams(['id' => '666'])
            ->withAttribute('route', new Route('/module/web/layout', ['_identifier' => 'web_layout']));
        $buttons = $this->buttons();
        $event = $this->createEvent($request, $buttons);

        ($this->createListener())($event);

        self::assertSame($buttons, $event->getButtons());
    }

    private function createListener(): PageEditToolbarListener
    {
        return new PageEditToolbarListener(new PageEditModuleRequest(), new ToolbarConfigurationService());
    }

    private function pageEditRequest(int $pageId): ServerRequest
    {
        return new ServerRequest('https://example.com/typo3/module/web/edit')
            ->withQueryParams(['id' => (string)$pageId])
            ->withAttribute('route', new Route('/module/web/edit', ['_identifier' => 'web_edit']));
    }

    /**
     * @param array<ButtonBar::BUTTON_POSITION_*, array<int, list<ButtonInterface>>>|null $buttons
     */
    private function createEvent(ServerRequest $request, ?array $buttons = null): ModifyButtonBarEvent
    {
        return new ModifyButtonBarEvent($buttons ?? $this->buttons(), self::createStub(ButtonBar::class), $request);
    }

    /**
     * The button bar as the Visual Editor module and Core's doc header build
     * it: the view-mode menu as a dropdown in group 0, autosave and save in
     * group 2, the toggles in group 3, clear cache on the right.
     *
     * @return array<ButtonBar::BUTTON_POSITION_*, array<int, list<ButtonInterface>>>
     */
    private function buttons(): array
    {
        $viewMode = new DropDownButton()
            ->setLabel('Single language')
            ->setShowActiveLabelText(true)
            ->addItem(new DropDownRadio()->setLabel('Single language')->setHref('/typo3/module/web/edit?token=x&id=666&viewMode=1')->setActive(true))
            ->addItem(new DropDownRadio()->setLabel('Multi language')->setHref('/typo3/module/web/edit?token=x&id=666&viewMode=2&languages%5B0%5D=0'));

        return [
            ButtonBar::BUTTON_POSITION_LEFT => [
                0 => [$viewMode],
                2 => [
                    $this->genericButton('auto-save', PageEditToolbarListener::AUTO_SAVE_TOGGLE_TAG),
                    $this->genericButton('save', 've-backend-save-button'),
                ],
                3 => [$this->genericButton('spotlight', 've-spotlight-toggle')],
            ],
            ButtonBar::BUTTON_POSITION_RIGHT => [
                1 => [$this->genericButton('clear-cache', 'typo3-backend-clear-cache-button')],
            ],
        ];
    }

    private function genericButton(string $label, string $tag): GenericButton
    {
        return new GenericButton()->setLabel($label)->setTag($tag)->setShowLabelText(true);
    }

    /**
     * @param list<ButtonInterface> $buttons
     * @return list<string>
     */
    private function names(array $buttons): array
    {
        return array_map(
            static fn(ButtonInterface $button): string => $button instanceof GenericButton
                ? (string)$button->getLabel()
                : ($button instanceof DropDownButton ? 'view-mode' : $button::class),
            $buttons,
        );
    }
}
