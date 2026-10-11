<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Hooks;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Page\PageRenderer;
use TYPO3\CMS\Core\Utility\GeneralUtility;

final class FrontendModuleLoadingTest extends TestCase
{
    #[Test]
    #[DataProvider('scriptPositions')]
    public function frontendModulesWaitForTheFooterConfiguration(string $position): void
    {
        $params = [$position => $this->scripts()];

        $this->runRegisteredHooks($params);

        self::assertStringContainsString('<script type="module" src="/cms/_assets/upstream/JavaScript/Frontend/index.js" nonce="keep-me"></script>', $params[$position]);
        self::assertStringContainsString('<script type="module" src="/cms/_assets/enhancements/JavaScript/Frontend/index.js"></script>', $params[$position]);
        self::assertStringContainsString('<script type="module" async="async" src="/cms/_assets/upstream/JavaScript/Backend/index.js"></script>', $params[$position]);
        self::assertStringContainsString('<script type="module" async="async" src="/cms/_assets/site/JavaScript/Frontend/index.js"></script>', $params[$position]);
        self::assertStringContainsString('<script type="importmap" nonce="map-nonce">', $params[$position]);
        self::assertStringContainsString('"@typo3/visual-editor/Frontend/index":"/cms/_assets/upstream/JavaScript/Frontend/index.js?bust=123"', $params[$position]);
    }

    /** @return iterable<string, array{string}> */
    public static function scriptPositions(): iterable
    {
        yield 'normal head modules' => ['jsLibs'];
        yield 'moveJsFromHeaderToFooter' => ['jsFooterLibs'];
    }

    #[Test]
    public function unrelatedPagesRemainByteIdentical(): void
    {
        $scripts = '<script type="module" async="async" src="/site/index.js"></script>';
        $params = ['jsLibs' => $scripts];

        $this->runRegisteredHooks($params);

        self::assertSame($scripts, $params['jsLibs']);
    }

    /** @param array<string, string> $params */
    private function runRegisteredHooks(array &$params): void
    {
        require __DIR__ . '/../../../ext_localconf.php';
        $pageRenderer = self::createStub(PageRenderer::class);
        foreach ($GLOBALS['TYPO3_CONF_VARS']['SC_OPTIONS']['t3lib/class.t3lib_pagerenderer.php']['render-postProcess'] ?? [] as $hook) {
            GeneralUtility::callUserFunction($hook, $params, $pageRenderer);
        }
    }

    private function scripts(): string
    {
        return <<<'HTML'
            <script type="importmap" nonce="map-nonce">{"imports":{"@typo3/visual-editor/Frontend/index":"/cms/_assets/upstream/JavaScript/Frontend/index.js?bust=123","@webconsulting/visual-editor-enhancements/":"/cms/_assets/enhancements/JavaScript/"}}</script>
            <script type="module" async="async" src="/cms/_assets/upstream/JavaScript/Frontend/index.js" nonce="keep-me"></script>
            <script type="module" async src="/cms/_assets/enhancements/JavaScript/Frontend/index.js"></script>
            <script type="module" async="async" src="/cms/_assets/upstream/JavaScript/Backend/index.js"></script>
            <script type="module" async="async" src="/cms/_assets/site/JavaScript/Frontend/index.js"></script>
            HTML;
    }
}
