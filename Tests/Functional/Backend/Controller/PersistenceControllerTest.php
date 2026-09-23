<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\Backend\Controller\PersistenceController;

/**
 * The overriding /visual-editor/save endpoint, end to end against a real
 * DataHandler and database.
 *
 * The one reason this package overrides the upstream controller and service is
 * the NEW… record placeholder: dropping an element out of the library creates
 * a record that has no uid yet, and upstream's payload validation only accepts
 * integer uids. If a future Visual Editor release accepts placeholders itself,
 * this test is what tells us the override can be deleted.
 */
final class PersistenceControllerTest extends FunctionalTestCase
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
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/be_users.csv');
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/pages.csv');
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/tt_content.csv');
        $this->setUpBackendUser(1);
    }

    #[Test]
    public function anExistingRecordIsUpdated(): void
    {
        $response = $this->save(['data' => ['tt_content' => [1 => ['header' => 'Changed by the editor']]]]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['success' => true], json_decode((string)$response->getBody(), true));
        self::assertSame('Changed by the editor', $this->fetchHeader(1));
    }

    #[Test]
    public function aNewRecordPlaceholderIsPersisted(): void
    {
        $response = $this->save([
            'data' => [
                'tt_content' => [
                    'NEW1234567890abcdef' => [
                        'pid' => 666,
                        'CType' => 'text',
                        'colPos' => 0,
                        'header' => 'Dropped from the library',
                    ],
                ],
            ],
        ]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['success' => true], json_decode((string)$response->getBody(), true));
        self::assertSame(
            1,
            $this->getConnectionPool()->getConnectionForTable('tt_content')->count(
                'uid',
                'tt_content',
                ['header' => 'Dropped from the library', 'pid' => 666],
            ),
        );
    }

    #[Test]
    public function anUnknownOperationIsRejected(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionCode(8110225095);

        $this->save(['data' => [], 'somethingElse' => ['x']]);
    }

    #[Test]
    public function anUnknownFieldIsRejected(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionCode(6627872218);

        $this->save(['data' => ['tt_content' => [1 => ['no_such_field' => 'x']]]]);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function save(array $payload): ResponseInterface
    {
        $request = new ServerRequest('https://vee.test/typo3/ajax/visual-editor/save', 'POST')
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE)
            ->withParsedBody($payload);
        $GLOBALS['TYPO3_REQUEST'] = $request;

        return GeneralUtility::makeInstance(PersistenceController::class)->saveAction($request);
    }

    private function fetchHeader(int $uid): string
    {
        return (string)$this->getConnectionPool()
            ->getConnectionForTable('tt_content')
            ->fetchOne('SELECT header FROM tt_content WHERE uid = ?', [$uid]);
    }
}
