<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use Webconsulting\VisualEditorEnhancements\Security\AccessDenial;
use Webconsulting\VisualEditorEnhancements\Security\EditSessionGuard;
use Webconsulting\VisualEditorEnhancements\Service\FieldChooserConfigurationService;
use Webconsulting\VisualEditorEnhancements\Service\FieldOptionsService;

/**
 * Frontend JSON endpoint for the visual editor field chooser: ?veFieldOptions=1
 * returns the editable select and category fields of a single record together
 * with their possible options, labels localized to the backend user's language.
 *
 * Access requires a logged-in backend user, the visual editor request token
 * (window.veInfo.token, scope visual_editor/save) in X-Request-Token, and
 * tables_modify permission on the requested table - see EditSessionGuard. An
 * unauthenticated request is answered with 401, everything else with 403, and
 * no request ever reaches a database read before the guard passed.
 */
final readonly class FieldOptionsMiddleware implements MiddlewareInterface
{
    public function __construct(
        private EditSessionGuard $guard,
        private TcaSchemaFactory $tcaSchema,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
        private FieldOptionsService $fieldOptionsService,
    ) {}

    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        if (!isset($queryParams['veFieldOptions'])) {
            return $handler->handle($request);
        }

        $table = $queryParams['table'] ?? '';
        if (!\is_string($table) || $table === '' || !$this->tcaSchema->has($table)) {
            // Answering "unknown table" before the guard would turn the
            // endpoint into a TCA probe for anonymous callers.
            $denial = $this->guard->check($request) ?? AccessDenial::InsufficientPermissions;

            return $this->guard->denialResponse($denial);
        }

        $denial = $this->guard->check($request, $table);
        if ($denial !== null) {
            return $this->guard->denialResponse($denial);
        }

        $uidParam = $queryParams['uid'] ?? null;
        $uid = \is_numeric($uidParam) ? (int)$uidParam : 0;
        $row = $uid > 0 ? BackendUtility::getRecordWSOL($table, $uid) : null;
        if ($row === null) {
            return new JsonResponse(['error' => 'Record not found'], 404, ['Cache-Control' => 'private, no-store']);
        }

        $pageId = $this->fieldChooserConfiguration->scopePageId($table, $row);
        if (!$this->fieldChooserConfiguration->isTableEnabled($table, $pageId)) {
            return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
        }

        return new JsonResponse(
            $this->fieldOptionsService->buildFieldOptions($table, $uid, $row, $request),
            200,
            ['Cache-Control' => 'private, no-store'],
        );
    }
}
