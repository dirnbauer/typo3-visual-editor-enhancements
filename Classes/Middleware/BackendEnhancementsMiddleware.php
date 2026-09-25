<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Page\JavaScriptModuleInstruction;
use TYPO3\CMS\Core\Page\PageRenderer;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;

/**
 * Loads the backend-frame bridge (link browser modal, notifications, accent
 * color) on the Visual Editor module page.
 */
final readonly class BackendEnhancementsMiddleware implements MiddlewareInterface
{
    public function __construct(
        private PageRenderer $pageRenderer,
        private PageEditModuleRequest $moduleRequest,
    ) {}

    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($this->moduleRequest->isPageEditModule($request)) {
            $this->pageRenderer->getJavaScriptRenderer()->addJavaScriptModuleInstruction(
                JavaScriptModuleInstruction::create('@webconsulting/visual-editor-enhancements/Backend/index.js'),
            );
        }

        return $handler->handle($request);
    }
}
