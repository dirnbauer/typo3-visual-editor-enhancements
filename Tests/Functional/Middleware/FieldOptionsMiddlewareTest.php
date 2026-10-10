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
use TYPO3\CMS\Core\Http\NormalizedParams;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
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
        $this->importCSVDataSet(__DIR__ . '/Fixtures/sys_category.csv');
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
        self::assertContains('layout', array_column($payload['fields'], 'name'));
        self::assertContains('categories', array_column($payload['fields'], 'name'));
    }

    /**
     * The category tree is the backend form's tree: default-language and
     * all-languages categories only - never their translations - nested by
     * parent, without deleted ones and without the tree's virtual root node.
     */
    #[Test]
    public function categoryFieldOffersTheBackendCategoryTree(): void
    {
        $this->loginEditor();

        $categories = $this->field($this->fieldOptions('tt_content', 1), 'categories');

        $depthByUid = array_column($categories['items'], 'depth', 'value');
        self::assertEqualsCanonicalizing(['1', '3', '4'], array_map(\strval(...), array_keys($depthByUid)));
        self::assertSame(0, $depthByUid[1]);
        self::assertSame(1, $depthByUid[4], 'A child category sits one level below its parent.');
        self::assertSame(0, $depthByUid[3]);
        $order = array_column($categories['items'], 'value');
        self::assertSame(array_search('1', $order, true) + 1, array_search('4', $order, true), 'Depth-first: the child follows its parent.');
        self::assertTrue($categories['items'][0]['selectable']);
        self::assertSame([], $categories['value']);
    }

    /**
     * What page TSconfig hides or changes in the backend form is hidden or
     * changed in the chooser as well.
     */
    #[Test]
    public function fieldChooserFollowsTceformPageTsConfig(): void
    {
        $this->setPageTsConfig(666, implode("\n", [
            'TCEFORM.tt_content.layout.disabled = 1',
            'TCEFORM.tt_content.categories.disabled = 1',
            'TCEFORM.tt_content.frame_class.removeItems = ruler-before',
            'TCEFORM.tt_content.header_layout.altLabels.1 = Big title',
            'TCEFORM.tt_content.header_layout.label = Heading level',
        ]));
        $this->loginEditor();

        $payload = $this->fieldOptions('tt_content', 1);

        $names = array_column($payload['fields'], 'name');
        self::assertNotContains('layout', $names);
        self::assertNotContains('categories', $names);
        $frameClassValues = array_column($this->field($payload, 'frame_class')['items'], 'value');
        self::assertContains('default', $frameClassValues);
        self::assertNotContains('ruler-before', $frameClassValues);
        $headerLayout = $this->field($payload, 'header_layout');
        self::assertSame('Heading level', $headerLayout['label']);
        self::assertSame('Big title', array_column($headerLayout['items'], 'label', 'value')['1']);
    }

    /**
     * A stored value that is no longer among the items is shown as the
     * backend form shows it, instead of silently displaying the first item.
     */
    #[Test]
    public function aStoredValueOutsideTheItemsIsMarkedInvalid(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tt_content')
            ->update('tt_content', ['frame_class' => 'no-longer-there'], ['uid' => 1]);
        $this->loginEditor();

        $frameClass = $this->field($this->fieldOptions('tt_content', 1), 'frame_class');

        self::assertSame('no-longer-there', $frameClass['value']);
        self::assertContains('no-longer-there', array_column($frameClass['items'], 'value'));
    }

    /**
     * Fields excluded from translations (l10n_mode=exclude) are edited on the
     * default language record only, exactly like in the backend form.
     */
    #[Test]
    public function translatedRecordsDoNotOfferFieldsExcludedFromTranslation(): void
    {
        $this->loginEditor();

        $defaultLanguage = array_column($this->fieldOptions('pages', 666)['fields'], 'name');
        $translation = array_column($this->fieldOptions('pages', 667)['fields'], 'name');

        self::assertContains('layout', $defaultLanguage);
        self::assertNotContains('layout', $translation);
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
        $handler = new class implements RequestHandlerInterface {
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
                [
                    'languageId' => 1,
                    'title' => 'German',
                    'locale' => 'de_DE.UTF-8',
                    'base' => '/de/',
                    'navigationTitle' => 'Deutsch',
                    'flag' => 'de',
                    'fallbackType' => 'strict',
                ],
            ],
        ]);
    }

    private function setPageTsConfig(int $pageId, string $tsConfig): void
    {
        $this->getConnectionPool()->getConnectionForTable('pages')
            ->update('pages', ['TSconfig' => $tsConfig], ['uid' => $pageId]);
    }

    /**
     * @return array<string, mixed>
     */
    private function fieldOptions(string $table, int $uid): array
    {
        $response = $this->process($this->authorizedRequest($table, $uid));
        self::assertSame(200, $response->getStatusCode(), (string)$response->getBody());
        $payload = json_decode((string)$response->getBody(), true);
        self::assertIsArray($payload);

        return $payload;
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function field(array $payload, string $name): array
    {
        foreach ($payload['fields'] as $field) {
            if ($field['name'] === $name) {
                return $field;
            }
        }
        self::fail(sprintf('The payload has no field "%s"; it has: %s.', $name, implode(', ', array_column($payload['fields'], 'name'))));
    }

    private function loginEditor(int $uid = 1): void
    {
        $backendUser = $this->setUpBackendUser($uid);
        $this->get(Context::class)->setAspect('backend.user', new UserAspect($backendUser));
        // The frontend's BackendUserAuthenticator middleware, which runs
        // before the endpoint, provides the backend user's LanguageService.
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
    }

    private function endpointRequest(string $table, int $uid): ServerRequest
    {
        $request = new ServerRequest('https://vee.test/editing-test-page', 'GET', null, [], [
            'HTTP_HOST' => 'vee.test',
            'HTTPS' => 'on',
            'SCRIPT_NAME' => '/index.php',
        ]);

        // The attributes the frontend middleware stack has set by the time
        // the endpoint runs.
        return $request
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_FE)
            ->withAttribute('normalizedParams', NormalizedParams::createFromRequest($request))
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
        $handler = new class implements RequestHandlerInterface {
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
