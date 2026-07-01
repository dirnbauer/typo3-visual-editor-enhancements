<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Backend\Module\ModuleInterface;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Core\Page\JavaScriptModuleInstruction;
use TYPO3\CMS\Core\Page\PageRenderer;

final readonly class BackendEnhancementsMiddleware implements MiddlewareInterface
{
    public function __construct(
        private PageRenderer $pageRenderer,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($this->isVisualEditorModuleRequest($request)) {
            $this->pageRenderer->getJavaScriptRenderer()->addJavaScriptModuleInstruction(
                JavaScriptModuleInstruction::create('@webconsulting/visual-editor-enhancements/Backend/index'),
            );
        }

        return $handler->handle($request);
    }

    private function isVisualEditorModuleRequest(ServerRequestInterface $request): bool
    {
        $module = $request->getAttribute('module');
        if ($module instanceof ModuleInterface && $module->getIdentifier() === 'web_edit') {
            return true;
        }

        $route = $request->getAttribute('route');
        return $route instanceof Route && $route->getOption('_identifier') === 'web_edit';
    }
}
