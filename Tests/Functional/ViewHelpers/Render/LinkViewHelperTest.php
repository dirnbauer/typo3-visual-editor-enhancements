<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\ViewHelpers\Render;

use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Domain\Record;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Domain\RecordInterface;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\LinkHandling\TypolinkParameter;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Page\AssetCollector;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use TYPO3Fluid\Fluid\Core\Rendering\RenderingContextInterface;
use TYPO3Fluid\Fluid\Core\ViewHelper\InvalidArgumentValueException;
use Webconsulting\VisualEditorEnhancements\ViewHelpers\Render\LinkViewHelper;

final class LinkViewHelperTest extends FunctionalTestCase
{
    private const string LINK = 't3://page?uid=2154 _blank cta-link "Compare themes" &campaign=buttons';

    protected array $coreExtensionsToLoad = ['rte_ckeditor'];

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
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);

        // The page already initializes these before it renders its content.
        $this->get(AssetCollector::class)->addInlineJavaScript('veLangInfo', '');
    }

    #[Test]
    public function resolvedLinkKeepsItsFullStoredValueInTheLinkBrowser(): void
    {
        $record = $this->get(RecordFactory::class)->createResolvedRecordFromDatabaseRow('tt_content', $this->recordRow());
        self::assertInstanceOf(TypolinkParameter::class, $record->get('header_link'));

        $this->assertRenderedLinkValue(self::LINK, $this->render($record));
    }

    #[Test]
    public function rawRecordKeepsItsFullStoredLinkValue(): void
    {
        $record = $this->get(RecordFactory::class)->createRawRecord('tt_content', $this->recordRow());

        $this->assertRenderedLinkValue(self::LINK, $this->render($record));
    }

    #[Test]
    public function absentOptionalFieldRendersNothing(): void
    {
        $record = $this->get(RecordFactory::class)->createResolvedRecordFromDatabaseRow('tt_content', $this->recordRow());

        self::assertSame('', $this->render($record, 'absent_link', true));
    }

    #[Test]
    public function absentRequiredFieldStillThrowsTheViewHelperException(): void
    {
        $record = $this->get(RecordFactory::class)->createResolvedRecordFromDatabaseRow('tt_content', $this->recordRow());

        $this->expectException(InvalidArgumentValueException::class);
        $this->expectExceptionCode(1777200012);
        $this->render($record, 'absent_link');
    }

    #[Test]
    public function fieldMissingFromResolvedRecordIsNotExposedFromItsRawRecord(): void
    {
        $rawRecord = $this->get(RecordFactory::class)->createRawRecord('tt_content', $this->recordRow());
        $record = new Record($rawRecord, ['CType' => 'text']);

        self::assertSame('', $this->render($record, 'header_link', true));
    }

    #[Test]
    public function optionalDoesNotPermitANonLinkField(): void
    {
        $record = $this->get(RecordFactory::class)->createResolvedRecordFromDatabaseRow('tt_content', $this->recordRow());

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionCode(1777200013);
        $this->render($record, 'header', true);
    }

    /** @return array<string, int|string> */
    private function recordRow(): array
    {
        return [
            'uid' => 11,
            'pid' => 666,
            'CType' => 'text',
            'header' => 'Compare themes',
            'header_link' => self::LINK,
            'sys_language_uid' => 0,
            'l18n_parent' => 0,
            'l10n_source' => 0,
            't3ver_oid' => 0,
            't3ver_wsid' => 0,
            't3ver_state' => 0,
            't3ver_stage' => 0,
            'crdate' => 1700000000,
            'tstamp' => 1700000000,
            'starttime' => 0,
            'endtime' => 0,
            'deleted' => 0,
            'editlock' => 0,
            'hidden' => 0,
            'rowDescription' => '',
            'sorting' => 256,
            'fe_group' => '',
        ];
    }

    private function render(RecordInterface $record, string $field = 'header_link', bool $optional = false): string
    {
        $request = new ServerRequest('https://vee.test/editing-test-page')->withQueryParams(['editMode' => 1]);
        $renderingContext = self::createStub(RenderingContextInterface::class);
        $renderingContext->method('getAttribute')->willReturnMap([[ServerRequestInterface::class, $request]]);
        $viewHelper = $this->get(LinkViewHelper::class);
        $viewHelper->setRenderingContext($renderingContext);
        $viewHelper->setArguments(['record' => $record, 'field' => $field, 'optional' => $optional]);

        return $viewHelper->render();
    }

    private function assertRenderedLinkValue(string $expected, string $markup): void
    {
        $document = new \DOMDocument();
        self::assertTrue($document->loadXML($markup));
        $element = $document->documentElement;
        self::assertInstanceOf(\DOMElement::class, $element);
        self::assertSame('ve-editable-link', $element->tagName);
        self::assertSame('tt_content', $element->getAttribute('table'));
        self::assertSame('11', $element->getAttribute('uid'));
        self::assertSame('header_link', $element->getAttribute('field'));
        self::assertSame($expected, $element->getAttribute('value'));
    }
}
