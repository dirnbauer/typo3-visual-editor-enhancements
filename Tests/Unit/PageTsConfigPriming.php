<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit;

use TYPO3\CMS\Core\Cache\Backend\TransientMemoryBackend;
use TYPO3\CMS\Core\Cache\CacheManager;
use TYPO3\CMS\Core\Cache\Frontend\VariableFrontend;
use TYPO3\CMS\Core\EventDispatcher\NoopEventDispatcher;
use TYPO3\CMS\Core\TypoScript\AST\AstBuilder;
use TYPO3\CMS\Core\TypoScript\AST\Node\RootNode;
use TYPO3\CMS\Core\TypoScript\PageTsConfig;
use TYPO3\CMS\Core\TypoScript\Tokenizer\LosslessTokenizer;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * BackendUtility::getPagesTSconfig() consults a runtime cache before it walks
 * the root line, the site configuration and the database. Filling both of its
 * cache entries lets a unit test hand a service real page TSconfig without any
 * of that - which is what makes the TSconfig-driven services (field chooser,
 * new-content wizard parameters) unit testable at all.
 */
trait PageTsConfigPriming
{
    protected function registerRuntimeCache(): void
    {
        $cacheManager = new CacheManager();
        $cacheManager->registerCache(new VariableFrontend('runtime', new TransientMemoryBackend()));
        GeneralUtility::setSingletonInstance(CacheManager::class, $cacheManager);
    }

    protected function primePageTsConfig(int $pageId, string $tsConfig): void
    {
        $rootNode = new AstBuilder(new NoopEventDispatcher())
            ->build(new LosslessTokenizer()->tokenize($tsConfig), new RootNode());
        $runtimeCache = GeneralUtility::makeInstance(CacheManager::class)->getCache('runtime');
        $hash = 'ts-config-test-' . $pageId;
        $runtimeCache->set('pageTsConfig-pid-to-hash-' . $pageId, $hash);
        $runtimeCache->set('pageTsConfig-hash-to-object-' . $hash, new PageTsConfig($rootNode, []));
    }
}
