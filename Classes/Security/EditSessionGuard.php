<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Security;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Context\Context;
use TYPO3\CMS\Core\Http\JsonResponse;
use Webconsulting\VisualEditorEnhancements\Service\BackendUserProvider;

/**
 * The access gate in front of every JSON endpoint this extension adds to the
 * frontend. A request passes only when all three hold:
 *
 * 1. a backend user is logged in (Context aspect, not a cookie guess),
 * 2. it carries the Visual Editor request token issued for the editor's own
 *    save endpoint in X-Request-Token - so a plain authenticated browser tab
 *    (or a cross-site request riding the session cookie) is not enough,
 * 3. that user may modify the table the request asks about.
 *
 * Endpoints call check() and, on a denial, answer with denialResponse() so
 * every refusal looks the same and never leaks record data.
 */
final readonly class EditSessionGuard
{
    public const TOKEN_HEADER = 'X-Request-Token';

    public function __construct(
        private Context $context,
        private RequestTokenValidator $tokenValidator,
        private BackendUserProvider $backendUserProvider,
    ) {
    }

    public function check(ServerRequestInterface $request, ?string $table = null): ?AccessDenial
    {
        if (!$this->isBackendUserLoggedIn()) {
            return AccessDenial::NotAuthenticated;
        }

        if (!$this->tokenValidator->isValid($request->getHeaderLine(self::TOKEN_HEADER))) {
            return AccessDenial::InvalidToken;
        }

        if ($table !== null && !$this->backendUserProvider->mayModifyTable($table)) {
            return AccessDenial::InsufficientPermissions;
        }

        return null;
    }

    public function denialResponse(AccessDenial $denial): ResponseInterface
    {
        return new JsonResponse(
            ['error' => $denial->message()],
            $denial->statusCode(),
            ['Cache-Control' => 'private, no-store'],
        );
    }

    private function isBackendUserLoggedIn(): bool
    {
        return (bool)$this->context->getPropertyFromAspect('backend.user', 'isLoggedIn', false)
            && $this->backendUserProvider->get() !== null;
    }
}
