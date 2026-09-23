<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Middleware;

use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Configuration\SiteWriter;
use TYPO3\CMS\Core\Context\Context;
use TYPO3\CMS\Core\Context\UserAspect;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\FormProtection\FormProtectionFactory;
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\TestingFramework\Core\Functional\Framework\Frontend\InternalRequest;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\Middleware\FieldOptionsMiddleware;
use Webconsulting\VisualEditorEnhancements\Security\AccessDenial;
use Webconsulting\VisualEditorEnhancements\Security\BackendFormProtectionTokenValidator;
use Webconsulting\VisualEditorEnhancements\Security\EditSessionGuard;

/**
 * The ?veFieldOptions=1 endpoint, wired up for real: real DI container, real
 * TCA, real database, real backend form protection.
 *
 * The anonymous case runs as an actual frontend request, which also proves the
 * middleware is registered in the frontend stack at all. The authorized and
 * half-authorized cases drive the middleware in-process, because a valid
 * Visual Editor token only exists inside the very backend session that issued
 * it - a frontend sub-request would run with a different one.
 */
final class FieldOptionsMiddlewareTest extends FunctionalTestCase
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
        $this->importCSVDataSet(__DIR__ . '/Fixtures/be_users.csv');
        $this->importCSVDataSet(__DIR__ . '/Fixtures/pages.csv');
        $this->importCSVDataSet(__DIR__ . '/Fixtures/tt_content.csv');
        $this->writeTestSiteConfiguration();
    }

    #[Test]
    public function anonymousFrontendRequestIsRefusedWithoutTouchingTheRecord(): void
    {
        $response = $this->executeFrontendSubRequest(
            new InternalRequest('https://vee.test/editing-test-page?veFieldOptions=1&editMode=1&table=tt_content&uid=1'),
        );

        self::assertSame(401, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        self::assertSame(AccessDenial::NotAuthenticated->message(), $body['error']);
        self::assertArrayNotHasKey('fields', $body);
    }

    #[Test]
    public function anonymousRequestForAnUnknownTableLeaksNothing(): void
    {
        $response = $this->executeFrontendSubRequest(
            new InternalRequest('https://vee.test/editing-test-page?veFieldOptions=1&editMode=1&table=no_such_table&uid=1'),
        );

        // The same 401 as for a known table: the endpoint must not double as a
        // TCA probe telling an anonymous caller which tables exist.
        self::assertSame(401, $response->getStatusCode());
        self::assertSame(
            AccessDenial::NotAuthenticated->message(),
            json_decode((string)$response->getBody(), true)['error'],
        );
    }

    #[Test]
    public function loggedInEditorWithoutTokenIsRefused(): void
    {
        $this->loginEditor();

        $response = $this->process($this->endpointRequest('tt_content', 1));

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(
            AccessDenial::InvalidToken->message(),
            json_decode((string)$response->getBody(), true)['error'],
        );
    }

    #[Test]
    public function loggedInEditorWithAForeignTokenIsRefused(): void
    {
        $this->loginEditor();

        $response = $this->process(
            $this->endpointRequest('tt_content', 1)->withHeader(EditSessionGuard::TOKEN_HEADER, 'not-a-real-token'),
        );

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(
            AccessDenial::InvalidToken->message(),
            json_decode((string)$response->getBody(), true)['error'],
        );
    }

    /**
     * A token issued for another purpose must not open this endpoint - the
     * guard validates the Visual Editor save scope, not "any valid token".
     */
    #[Test]
    public function aTokenFromAnotherScopeIsRefused(): void
    {
        $this->loginEditor();
        $foreignToken = $this->get(FormProtectionFactory::class)
            ->createForType('backend')
            ->generateToken('tceforms', 'edit');

        $response = $this->process(
            $this->endpointRequest('tt_content', 1)->withHeader(EditSessionGuard::TOKEN_HEADER, $foreignToken),
        );

        self::assertSame(403, $response->getStatusCode());
    }

    #[Test]
    public function authorizedEditorGetsTheFieldOptions(): void
    {
        $this->loginEditor();

        $response = $this->process($this->authorizedRequest('tt_content', 1));

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('private, no-store', $response->getHeaderLine('Cache-Control'));
        $payload = json_decode((string)$response->getBody(), true);
        self::assertSame('tt_content', $payload['table']);
        self::assertSame(1, $payload['uid']);
        self::assertSame('text', $payload['recordType']);
        self::assertIsArray($payload['fields']);
        self::assertNotSame([], $payload['fields'], 'A text element has choice fields (layout, frame_class, …).');
    }

    /**
     * A backend user without tables_modify on the table is authenticated and
     * holds a valid token, and still must not see the record's fields.
     */
    #[Test]
    public function editorWithoutWriteAccessToTheTableIsRefused(): void
    {
        $this->loginEditor(2);

        $response = $this->process($this->authorizedRequest('tt_content', 1));

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(
            AccessDenial::InsufficientPermissions->message(),
            json_decode((string)$response->getBody(), true)['error'],
        );
    }

    #[Test]
    public function authorizedEditorAskingForAMissingRecordGetsNotFound(): void
    {
        $this->loginEditor();

        $response = $this->process($this->authorizedRequest('tt_content', 99999));

        self::assertSame(404, $response->getStatusCode());
    }

    #[Test]
    public function aRequestWithoutTheQueryParameterIsPassedThrough(): void
    {
        $handler = new class () implements RequestHandlerInterface {
            public bool $handled = false;

            #[\Override]
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->handled = true;

                return new JsonResponse(['passed' => true]);
            }
        };

        $response = $this->get(FieldOptionsMiddleware::class)
            ->process(new ServerRequest('https://vee.test/editing-test-page'), $handler);

        self::assertTrue($handler->handled);
        self::assertSame(200, $response->getStatusCode());
    }

    /**
     * typo3/cms-core ships no test helper trait for this in the Composer
     * package, so the site is written through the public SiteWriter API.
     */
    private function writeTestSiteConfiguration(): void
    {
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
    }

    private function loginEditor(int $uid = 1): void
    {
        $backendUser = $this->setUpBackendUser($uid);
        $this->get(Context::class)->setAspect('backend.user', new UserAspect($backendUser));
    }

    private function endpointRequest(string $table, int $uid): ServerRequest
    {
        return new ServerRequest('https://vee.test/editing-test-page')
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_FE)
            ->withQueryParams([
                'veFieldOptions' => '1',
                'editMode' => '1',
                'table' => $table,
                'uid' => (string)$uid,
            ]);
    }

    private function authorizedRequest(string $table, int $uid): ServerRequest
    {
        $token = $this->get(FormProtectionFactory::class)->createForType('backend')->generateToken(
            BackendFormProtectionTokenValidator::FORM_NAME,
            BackendFormProtectionTokenValidator::ACTION,
        );

        return $this->endpointRequest($table, $uid)->withHeader(EditSessionGuard::TOKEN_HEADER, $token);
    }

    private function process(ServerRequestInterface $request): ResponseInterface
    {
        $handler = new class () implements RequestHandlerInterface {
            #[\Override]
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                throw new \RuntimeException('The middleware must answer the request itself.', 1777200020);
            }
        };
        $GLOBALS['TYPO3_REQUEST'] = $request;

        return GeneralUtility::makeInstance(FieldOptionsMiddleware::class)->process($request, $handler);
    }
}
