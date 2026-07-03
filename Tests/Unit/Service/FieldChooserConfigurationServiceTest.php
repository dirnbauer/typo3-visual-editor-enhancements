<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\TestCase;
use TYPO3\CMS\ContentBlocks\Definition\Capability\TableDefinitionCapability;
use TYPO3\CMS\ContentBlocks\Definition\ContentType\ContentType;
use TYPO3\CMS\ContentBlocks\Definition\ContentType\ContentTypeDefinitionCollection;
use TYPO3\CMS\ContentBlocks\Definition\PaletteDefinitionCollection;
use TYPO3\CMS\ContentBlocks\Definition\SqlColumnDefinitionCollection;
use TYPO3\CMS\ContentBlocks\Definition\TableDefinition;
use TYPO3\CMS\ContentBlocks\Definition\TableDefinitionCollection;
use TYPO3\CMS\ContentBlocks\Definition\TcaFieldDefinitionCollection;
use TYPO3\CMS\ContentBlocks\Registry\AutomaticLanguageKeysRegistry;
use TYPO3\CMS\Core\Cache\Backend\TransientMemoryBackend;
use TYPO3\CMS\Core\Cache\CacheManager;
use TYPO3\CMS\Core\Cache\Frontend\VariableFrontend;
use TYPO3\CMS\Core\EventDispatcher\NoopEventDispatcher;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\TypoScript\AST\AstBuilder;
use TYPO3\CMS\Core\TypoScript\AST\Node\RootNode;
use TYPO3\CMS\Core\TypoScript\PageTsConfig;
use TYPO3\CMS\Core\TypoScript\Tokenizer\LosslessTokenizer;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\Service\FieldChooserConfigurationService;

final class FieldChooserConfigurationServiceTest extends TestCase
{
    /**
     * @var array<string, mixed>|null
     */
    private ?array $tcaBackup = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tcaBackup = $GLOBALS['TCA'] ?? null;

        // BackendUtility::getPagesTSconfig() consults the runtime cache first;
        // tests prime it via primePageTsConfig() so no database is needed.
        $cacheManager = new CacheManager();
        $cacheManager->registerCache(new VariableFrontend('runtime', new TransientMemoryBackend()));
        GeneralUtility::setSingletonInstance(CacheManager::class, $cacheManager);
    }

    protected function tearDown(): void
    {
        if ($this->tcaBackup === null) {
            unset($GLOBALS['TCA']);
        } else {
            $GLOBALS['TCA'] = $this->tcaBackup;
        }
        GeneralUtility::purgeInstances();
        parent::tearDown();
    }

    public function testChildTableWithForeignTableParentUidColumnIsAutoEnabled(): void
    {
        $GLOBALS['TCA'] = [
            'tt_content' => ['columns' => ['header' => ['config' => ['type' => 'input']]]],
            'accordion_items' => ['columns' => ['foreign_table_parent_uid' => ['config' => ['type' => 'passthrough']]]],
            'tx_myext_domain_model_plain' => ['columns' => ['title' => ['config' => ['type' => 'input']]]],
        ];
        $this->primePageTsConfig(1, '');
        $service = $this->createService();

        self::assertTrue($service->isTableEnabled('accordion_items', 1));
        self::assertFalse($service->isTableEnabled('tx_myext_domain_model_plain', 1));
        self::assertEqualsCanonicalizing(['tt_content', 'accordion_items'], $service->getEnabledTables(1));
    }

    public function testExplicitTsConfigDisablingWinsOverAutoEnable(): void
    {
        $GLOBALS['TCA'] = [
            'tt_content' => ['columns' => []],
            'accordion_items' => ['columns' => ['foreign_table_parent_uid' => ['config' => ['type' => 'passthrough']]]],
        ];
        $this->primePageTsConfig(2, '
            tx_visualeditorenhancements.fieldChooser.tables.accordion_items.enabled = 0
        ');
        $service = $this->createService();

        self::assertFalse($service->isTableEnabled('accordion_items', 2));
        self::assertSame(['tt_content'], $service->getEnabledTables(2));
    }

    public function testCoreTablesAreNeverAutoEnabled(): void
    {
        $childColumns = ['columns' => ['foreign_table_parent_uid' => ['config' => ['type' => 'passthrough']]]];
        $GLOBALS['TCA'] = [
            'tt_content' => ['columns' => []],
            'pages' => $childColumns,
            'sys_file_reference' => $childColumns,
            'be_users' => $childColumns,
            'fe_users' => $childColumns,
            'tx_visualeditor_state' => $childColumns,
            'accordion_items' => $childColumns,
        ];
        $this->primePageTsConfig(3, '');
        $service = $this->createService();

        self::assertEqualsCanonicalizing(['tt_content', 'accordion_items'], $service->getEnabledTables(3));
    }

    public function testTtContentDefaultBehaviorIsUnchanged(): void
    {
        $GLOBALS['TCA'] = [
            'tt_content' => ['columns' => []],
            'tx_news_domain_model_news' => ['columns' => ['title' => ['config' => ['type' => 'input']]]],
        ];
        $this->primePageTsConfig(4, '');
        $service = $this->createService();

        self::assertSame(['tt_content'], $service->getEnabledTables(4));
        self::assertTrue($service->isTableEnabled('tt_content', 4));
        self::assertFalse($service->isTableEnabled('tx_news_domain_model_news', 4));

        // Explicit TSconfig still disables the tt_content default entirely.
        $this->primePageTsConfig(5, '
            tx_visualeditorenhancements.fieldChooser.tables.tt_content.enabled = 0
        ');
        self::assertSame([], $this->createService()->getEnabledTables(5));
    }

    public function testContentBlocksRegistryTablesAreAutoEnabledWithCoreTablesExcluded(): void
    {
        $GLOBALS['TCA'] = [
            'tt_content' => ['columns' => []],
            'pages' => ['columns' => []],
            // Deliberately no foreign_table_parent_uid columns: the tables
            // must be detected through the registry, not the TCA fallback.
            'accordion_items' => ['columns' => ['title' => ['config' => ['type' => 'input']]]],
            'my_record_type' => ['columns' => ['title' => ['config' => ['type' => 'input']]]],
        ];
        $registry = new TableDefinitionCollection(new AutomaticLanguageKeysRegistry());
        $registry->addTable($this->createTableDefinition('tt_content', ContentType::CONTENT_ELEMENT));
        $registry->addTable($this->createTableDefinition('pages', ContentType::PAGE_TYPE));
        $registry->addTable($this->createTableDefinition('accordion_items', ContentType::RECORD_TYPE));
        $registry->addTable($this->createTableDefinition('my_record_type', ContentType::RECORD_TYPE));
        $this->primePageTsConfig(6, '');
        $service = $this->createService($registry);

        self::assertEqualsCanonicalizing(
            ['tt_content', 'accordion_items', 'my_record_type'],
            $service->getEnabledTables(6),
        );
        self::assertFalse($service->isTableEnabled('pages', 6));
    }

    private function createService(?TableDefinitionCollection $contentBlockTables = null): FieldChooserConfigurationService
    {
        $tcaSchemaFactory = $this->createStub(TcaSchemaFactory::class);
        $tcaSchemaFactory
            ->method('has')
            ->willReturnCallback(static fn(string $table): bool => isset($GLOBALS['TCA'][$table]));

        return new FieldChooserConfigurationService($tcaSchemaFactory, $contentBlockTables);
    }

    private function createTableDefinition(string $table, ContentType $contentType): TableDefinition
    {
        return new TableDefinition(
            table: $table,
            capability: TableDefinitionCapability::createFromArray([]),
            typeField: null,
            contentType: $contentType,
            contentTypeDefinitionCollection: new ContentTypeDefinitionCollection(),
            sqlColumnDefinitionCollection: new SqlColumnDefinitionCollection(),
            tcaFieldDefinitionCollection: new TcaFieldDefinitionCollection(),
            paletteDefinitionCollection: new PaletteDefinitionCollection(),
            parentReferences: [],
        );
    }

    /**
     * BackendUtility::getPagesTSconfig() returns the runtime-cached
     * PageTsConfig for a page id without touching root line, site or
     * database when both cache entries exist.
     */
    private function primePageTsConfig(int $pageId, string $tsConfig): void
    {
        $rootNode = (new AstBuilder(new NoopEventDispatcher()))
            ->build((new LosslessTokenizer())->tokenize($tsConfig), new RootNode());
        $runtimeCache = GeneralUtility::makeInstance(CacheManager::class)->getCache('runtime');
        $hash = 'field-chooser-test-' . $pageId;
        $runtimeCache->set('pageTsConfig-pid-to-hash-' . $pageId, $hash);
        $runtimeCache->set('pageTsConfig-hash-to-object-' . $hash, new PageTsConfig($rootNode, []));
    }
}
