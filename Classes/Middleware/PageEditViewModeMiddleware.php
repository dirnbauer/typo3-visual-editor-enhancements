<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Backend\Module\ModuleData;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;
use Webconsulting\VisualEditorEnhancements\Service\ToolbarConfigurationService;

/**
 * Keeps the Visual Editor module in its single-language view while the page
 * TSconfig hides the view switch (tx_visualeditorenhancements.toolbar
 * .viewModeSelector = 0).
 *
 * Without this, a user who had switched to the multi-language view before the
 * switch was hidden would stay there with no control to leave it. The module
 * reads its view mode from the ModuleData the module validator attaches to
 * the request, and it persists that data itself on every request, so
 * correcting the attribute here is enough.
 */
final readonly class PageEditViewModeMiddleware implements MiddlewareInterface
{
    /**
     * The Visual Editor's PageEditViewMode::SingleLanguage, the module's
     * default (Configuration/Backend/Modules.php, moduleData.viewMode).
     */
    public const int SINGLE_LANGUAGE_VIEW_MODE = 1;

    public function __construct(
        private PageEditModuleRequest $moduleRequest,
        private ToolbarConfigurationService $configuration,
    ) {}

    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $moduleData = $request->getAttribute('moduleData');
        if ($moduleData instanceof ModuleData
            && $this->moduleRequest->isPageEditModule($request)
            && (int)$moduleData->get('viewMode', self::SINGLE_LANGUAGE_VIEW_MODE) !== self::SINGLE_LANGUAGE_VIEW_MODE
            && !$this->configuration->isViewModeSelectorEnabled($this->moduleRequest->getPageId($request))
        ) {
            $moduleData->set('viewMode', self::SINGLE_LANGUAGE_VIEW_MODE);
            $request = $request->withAttribute('moduleData', $moduleData);
        }

        return $handler->handle($request);
    }
}
