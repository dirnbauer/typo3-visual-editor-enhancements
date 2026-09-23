<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Security;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Context\Context;
use TYPO3\CMS\Core\Context\UserAspect;
use TYPO3\CMS\Core\Http\ServerRequest;
use Webconsulting\VisualEditorEnhancements\Security\AccessDenial;
use Webconsulting\VisualEditorEnhancements\Security\EditSessionGuard;
use Webconsulting\VisualEditorEnhancements\Security\RequestTokenValidator;
use Webconsulting\VisualEditorEnhancements\Service\BackendUserProvider;

/**
 * The gate in front of every JSON endpoint of this extension. The order of the
 * checks is part of the contract: an anonymous caller must never be able to
 * tell "table unknown" from "table not allowed for you".
 */
final class EditSessionGuardTest extends TestCase
{
    #[Test]
    public function anonymousRequestIsNotAuthenticated(): void
    {
        $guard = $this->createGuard(loggedIn: false, tokenValid: true, mayModify: true);

        self::assertSame(AccessDenial::NotAuthenticated, $guard->check($this->request('valid'), 'tt_content'));
    }

    #[Test]
    public function loggedInUserWithoutTokenHeaderIsRejected(): void
    {
        $guard = $this->createGuard(loggedIn: true, tokenValid: false, mayModify: true);

        self::assertSame(AccessDenial::InvalidToken, $guard->check($this->request(null), 'tt_content'));
    }

    #[Test]
    public function loggedInUserWithForeignTokenIsRejected(): void
    {
        $guard = $this->createGuard(loggedIn: true, tokenValid: false, mayModify: true);

        self::assertSame(AccessDenial::InvalidToken, $guard->check($this->request('a-token-from-elsewhere'), 'tt_content'));
    }

    #[Test]
    public function editorWithoutWriteAccessToTheTableIsRejected(): void
    {
        $guard = $this->createGuard(loggedIn: true, tokenValid: true, mayModify: false);

        self::assertSame(AccessDenial::InsufficientPermissions, $guard->check($this->request('valid'), 'tt_content'));
    }

    #[Test]
    public function editorWithTokenAndWriteAccessPasses(): void
    {
        $guard = $this->createGuard(loggedIn: true, tokenValid: true, mayModify: true);

        self::assertNull($guard->check($this->request('valid'), 'tt_content'));
    }

    #[Test]
    public function tableCheckIsSkippedWhenNoTableIsGiven(): void
    {
        $guard = $this->createGuard(loggedIn: true, tokenValid: true, mayModify: false);

        self::assertNull($guard->check($this->request('valid')));
    }

    /**
     * A Context that reports a logged-in backend user while the real user
     * object is gone would let a request through on a half-torn-down session.
     */
    #[Test]
    public function contextWithoutTheActualUserObjectIsNotAuthenticated(): void
    {
        $context = new Context();
        $context->setAspect('backend.user', $this->userAspect(true));
        $backendUserProvider = self::createStub(BackendUserProvider::class);
        $backendUserProvider->method('get')->willReturn(null);
        $backendUserProvider->method('mayModifyTable')->willReturn(true);

        $guard = new EditSessionGuard($context, $this->tokenValidator(true), $backendUserProvider);

        self::assertSame(AccessDenial::NotAuthenticated, $guard->check($this->request('valid'), 'tt_content'));
    }

    #[Test]
    public function notAuthenticatedAnswersWith401AndEverythingElseWith403(): void
    {
        $guard = $this->createGuard(loggedIn: false, tokenValid: false, mayModify: false);

        self::assertSame(401, $guard->denialResponse(AccessDenial::NotAuthenticated)->getStatusCode());
        self::assertSame(403, $guard->denialResponse(AccessDenial::InvalidToken)->getStatusCode());
        self::assertSame(403, $guard->denialResponse(AccessDenial::InsufficientPermissions)->getStatusCode());
    }

    #[Test]
    public function denialResponseIsNeverCached(): void
    {
        $guard = $this->createGuard(loggedIn: false, tokenValid: false, mayModify: false);
        $response = $guard->denialResponse(AccessDenial::InvalidToken);

        self::assertSame('private, no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame(
            ['error' => AccessDenial::InvalidToken->message()],
            json_decode((string)$response->getBody(), true),
        );
    }

    private function createGuard(bool $loggedIn, bool $tokenValid, bool $mayModify): EditSessionGuard
    {
        $context = new Context();
        $context->setAspect('backend.user', $this->userAspect($loggedIn));

        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUserProvider = self::createStub(BackendUserProvider::class);
        $backendUserProvider->method('get')->willReturn($loggedIn ? $backendUser : null);
        $backendUserProvider->method('mayModifyTable')->willReturn($mayModify);

        return new EditSessionGuard($context, $this->tokenValidator($tokenValid), $backendUserProvider);
    }

    private function tokenValidator(bool $valid): RequestTokenValidator
    {
        return new readonly class ($valid) implements RequestTokenValidator {
            public function __construct(private bool $valid) {}

            #[\Override]
            public function isValid(string $token): bool
            {
                return $this->valid && $token !== '';
            }
        };
    }

    private function userAspect(bool $loggedIn): UserAspect
    {
        $user = self::createStub(BackendUserAuthentication::class);
        $user->user = $loggedIn ? ['uid' => 42, 'username' => 'editor'] : null;

        return new UserAspect($user);
    }

    private function request(?string $token): ServerRequest
    {
        $request = new ServerRequest('https://example.com/?veFieldOptions=1');

        return $token === null ? $request : $request->withHeader(EditSessionGuard::TOKEN_HEADER, $token);
    }
}
