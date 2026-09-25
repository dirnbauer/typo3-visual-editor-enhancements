<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\EventListener;

use TYPO3\CMS\Backend\Template\Components\Buttons\ButtonInterface;
use TYPO3\CMS\Backend\Template\Components\Buttons\DropDown\AbstractDropDownItem;
use TYPO3\CMS\Backend\Template\Components\Buttons\DropDownButton;
use TYPO3\CMS\Backend\Template\Components\Buttons\GenericButton;
use TYPO3\CMS\Backend\Template\Components\ModifyButtonBarEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;
use Webconsulting\VisualEditorEnhancements\Service\ToolbarConfigurationService;

/**
 * Removes toolbar controls from the Visual Editor module's doc header that
 * the page TSconfig switches off (Service\ToolbarConfigurationService).
 *
 * Both controls reach Core's button bar, so Core's ModifyButtonBarEvent is
 * the one place to take them out again without touching the Visual Editor:
 *
 * - the autosave toggle is the GenericButton the module tags
 *   `ve-auto-save-toggle`; without the element nothing ever triggers an
 *   automatic save, because the component itself is what calls the save
 *   button,
 * - the "single language / multi language" switch is the module's doc-header
 *   menu, which Core turns into a DropDownButton whose links all carry a
 *   `viewMode` parameter. Middleware\PageEditViewModeMiddleware keeps the
 *   module in the single-language view while the switch is hidden.
 */
final readonly class PageEditToolbarListener
{
    public const string AUTO_SAVE_TOGGLE_TAG = 've-auto-save-toggle';

    public const string VIEW_MODE_PARAMETER = 'viewMode';

    public function __construct(
        private PageEditModuleRequest $moduleRequest,
        private ToolbarConfigurationService $configuration,
    ) {}

    #[AsEventListener]
    public function __invoke(ModifyButtonBarEvent $event): void
    {
        $request = $event->getRequest();
        if (!$this->moduleRequest->isPageEditModule($request)) {
            return;
        }

        $pageId = $this->moduleRequest->getPageId($request);
        $removeViewModeSelector = !$this->configuration->isViewModeSelectorEnabled($pageId);
        $removeAutoSave = !$this->configuration->isAutoSaveEnabled($pageId);
        if (!$removeViewModeSelector && !$removeAutoSave) {
            return;
        }

        $buttons = $event->getButtons();
        foreach ($buttons as $position => $groups) {
            foreach ($groups as $group => $groupButtons) {
                $kept = array_values(array_filter(
                    $groupButtons,
                    static fn(ButtonInterface $button): bool => !($removeAutoSave && self::isAutoSaveToggle($button))
                        && !($removeViewModeSelector && self::isViewModeSelector($button)),
                ));
                if ($kept === []) {
                    // An empty group would still render as an empty button group.
                    unset($buttons[$position][$group]);
                } else {
                    $buttons[$position][$group] = $kept;
                }
            }
        }
        $event->setButtons($buttons);
    }

    private static function isAutoSaveToggle(ButtonInterface $button): bool
    {
        return $button instanceof GenericButton && $button->getTag() === self::AUTO_SAVE_TOGGLE_TAG;
    }

    private static function isViewModeSelector(ButtonInterface $button): bool
    {
        if (!$button instanceof DropDownButton || $button->getItems() === []) {
            return false;
        }

        foreach ($button->getItems() as $item) {
            if (!$item instanceof AbstractDropDownItem
                || !str_contains((string)$item->getHref(), self::VIEW_MODE_PARAMETER . '=')
            ) {
                return false;
            }
        }

        return true;
    }
}
