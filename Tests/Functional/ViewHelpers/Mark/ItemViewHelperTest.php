<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\ViewHelpers\Mark;

use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Domain\RecordInterface;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use TYPO3Fluid\Fluid\Core\Rendering\RenderingContextInterface;
use TYPO3Fluid\Fluid\Core\ViewHelper\InvalidArgumentValueException;
use Webconsulting\VisualEditorEnhancements\ViewHelpers\Mark\ItemViewHelper;

/**
 * f:mark.item marks the root element of a collection entry in edit mode and
 * renders nothing anywhere else (the published page stays byte-identical).
 * The fixture collection is tt_content.vee_items -> tx_vee_item.
 */
final class ItemViewHelperTest extends FunctionalTestCase
{
    protected array $coreExtensionsToLoad = ['rte_ckeditor'];

    protected array $testExtensionsToLoad = [
        'friendsoftypo3/visual-editor',
        'webconsulting/visual-editor-enhancements',
        __DIR__ . '/../../Fixtures/Extensions/inline_fixture',
    ];

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/be_users.csv');
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
    }

    #[Test]
    public function rendersNothingOutsideEditMode(): void
    {
        $record = $this->entry();

        self::assertSame('', $this->render($record, editMode: false));
        self::assertSame([], $this->render($record, format: 'array', editMode: false));
        // Not even a wrong collection name is reported on the published page.
        self::assertSame('', $this->render($record, collection: 'header', editMode: false));
    }

    #[Test]
    public function rendersDataAttributesWithLocalizedUidInEditMode(): void
    {
        self::assertSame(' data-ve-item="tx_vee_item:11" data-ve-item-live="11" data-ve-collection="vee_items"', $this->render($this->entry()));
        // A translated entry: the editables stage against the translation's uid.
        $translated = $this->entry(['_LOCALIZED_UID' => 21, '_REQUESTED_OVERLAY_LANGUAGE' => 1, 'lang' => 1]);
        self::assertSame(' data-ve-item="tx_vee_item:21" data-ve-item-live="11" data-ve-collection="vee_items"', $this->render($translated));
    }

    #[Test]
    public function rendersVersionedUidInWorkspace(): void
    {
        $versioned = $this->entry(['_ORIG_uid' => 31, 't3ver_wsid' => 1]);

        self::assertSame(' data-ve-item="tx_vee_item:31" data-ve-item-live="11" data-ve-collection="vee_items"', $this->render($versioned));
    }

    #[Test]
    public function rendersHiddenFlagForDisabledRecords(): void
    {
        $markup = $this->render($this->entry(['hidden' => 1]));

        self::assertIsString($markup);
        self::assertStringEndsWith(' data-ve-item-hidden=""', $markup);
        $document = new \DOMDocument();
        self::assertTrue($document->loadHTML('<div' . $markup . '></div>', LIBXML_NOERROR));
        $element = $document->getElementsByTagName('div')->item(0);
        self::assertInstanceOf(\DOMElement::class, $element);
        self::assertTrue($element->hasAttribute('data-ve-item-hidden'));
        self::assertSame('vee_items', $element->getAttribute('data-ve-collection'));
    }

    #[Test]
    public function rendersArrayFormatForComponents(): void
    {
        self::assertSame(
            ['data-ve-item' => 'tx_vee_item:11', 'data-ve-item-live' => '11', 'data-ve-collection' => 'vee_shared', 'data-ve-item-hidden' => ''],
            $this->render($this->entry(['hidden' => 1]), collection: 'vee_shared', format: 'array'),
        );
    }

    #[Test]
    public function throwsForUnknownCollectionColumn(): void
    {
        foreach (['vee_unknown', 'header', 'nested_typo'] as $collection) {
            try {
                $this->render($this->entry(), collection: $collection);
                self::fail('Expected an exception for "' . $collection . '"');
            } catch (InvalidArgumentValueException $exception) {
                self::assertSame(1778160003, $exception->getCode());
            }
        }
        // An inline field of another table holding the same child table is a collection of it, too.
        self::assertIsString($this->render($this->entry(), collection: 'nested'));

        $this->expectException(InvalidArgumentValueException::class);
        $this->expectExceptionCode(1778160001);
        $this->render($this->entry(), format: 'json');
    }

    /**
     * @param array<string, int|string> $overrides
     */
    private function entry(array $overrides = []): RecordInterface
    {
        return $this->get(RecordFactory::class)->createResolvedRecordFromDatabaseRow('tx_vee_item', [
            'uid' => 11,
            'pid' => 666,
            'title' => 'Add a card',
            'owner' => 7,
            'owner_table' => 'tt_content',
            'slot' => 'items',
            'sorting' => 256,
            'hidden' => 0,
            'deleted' => 0,
            'tstamp' => 1700000000,
            'crdate' => 1700000000,
            'lang' => 0,
            'origin' => 0,
            'nested' => 0,
            'choice' => '',
            'dependent' => '',
            't3ver_oid' => 0,
            't3ver_wsid' => 0,
            't3ver_state' => 0,
            't3ver_stage' => 0,
            ...$overrides,
        ]);
    }

    /**
     * @return string|array<string, string>
     */
    private function render(RecordInterface $record, string $collection = 'vee_items', string $format = 'attributes', bool $editMode = true): string|array
    {
        $request = new ServerRequest('https://vee.test/editing-test-page');
        if ($editMode) {
            $request = $request->withQueryParams(['editMode' => 1]);
        }
        $renderingContext = self::createStub(RenderingContextInterface::class);
        $renderingContext->method('getAttribute')->willReturnMap([[ServerRequestInterface::class, $request]]);
        $viewHelper = $this->get(ItemViewHelper::class);
        $viewHelper->setRenderingContext($renderingContext);
        $viewHelper->setArguments(['record' => $record, 'collection' => $collection, 'format' => $format]);

        return $viewHelper->render();
    }
}
