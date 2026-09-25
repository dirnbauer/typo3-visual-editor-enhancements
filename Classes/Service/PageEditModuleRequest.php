<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Module\ModuleInterface;
use TYPO3\CMS\Backend\Routing\Route;

/**
 * Recognizes a request to the Visual Editor's backend module (Web > Edit,
 * route identifier "web_edit") and reads the page it edits.
 *
 * Before the module validator has run only the route is resolved; afterwards
 * the module attribute is there as well. Both are checked so the answer is the
 * same at every position in the middleware stack and in the doc header.
 */
final readonly class PageEditModuleRequest
{
    public const string MODULE_IDENTIFIER = 'web_edit';

    public function isPageEditModule(ServerRequestInterface $request): bool
    {
        $module = $request->getAttribute('module');
        if ($module instanceof ModuleInterface && $module->getIdentifier() === self::MODULE_IDENTIFIER) {
            return true;
        }

        $route = $request->getAttribute('route');

        return $route instanceof Route && $route->getOption('_identifier') === self::MODULE_IDENTIFIER;
    }

    /**
     * The edited page, 0 when the request names none.
     */
    public function getPageId(ServerRequestInterface $request): int
    {
        $parsedBody = $request->getParsedBody();
        $id = $request->getQueryParams()['id'] ?? (is_array($parsedBody) ? ($parsedBody['id'] ?? null) : null);

        return is_scalar($id) ? (int)$id : 0;
    }
}
