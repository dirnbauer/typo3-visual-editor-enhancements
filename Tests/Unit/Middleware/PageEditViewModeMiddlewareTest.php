<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Middleware;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Backend\Module\ModuleData;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Core\Http\Response;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Webconsulting\VisualEditorEnhancements\Middleware\PageEditViewModeMiddleware;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;
use Webconsulting\VisualEditorEnhancements\Service\ToolbarConfigurationService;
use Webconsulting\VisualEditorEnhancements\Tests\Unit\PageTsConfigPriming;

/**
 * With the view switch hidden the module must render its single-language
 * view, whatever the user had selected before; with the switch present, or
 * in any other module, the stored choice is theirs.
 */
final class PageEditViewModeMiddlewareTest extends TestCase
{
    use PageTsConfigPriming;

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->registerRuntimeCache();
    }

    #[\Override]
    protected function tearDown(): void
    {
        GeneralUtility::purgeInstances();
        parent::tearDown();
    }

    #[Test]
    public function aHiddenSwitchPinsTheSingleLanguageView(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.viewModeSelector = 0');
        $moduleData = new ModuleData('web_edit', ['viewMode' => 2, 'languages' => [0, 1]]);

        $seen = $this->processThrough($this->pageEditRequest(666, $moduleData));

        $seenModuleData = $seen->getAttribute('moduleData');
        self::assertInstanceOf(ModuleData::class, $seenModuleData);
        self::assertSame(PageEditViewModeMiddleware::SINGLE_LANGUAGE_VIEW_MODE, $seenModuleData->get('viewMode'));
        self::assertSame([0, 1], $seenModuleData->get('languages'), 'the module itself reduces the languages');
    }

    #[Test]
    public function aVisibleSwitchKeepsTheUsersChoice(): void
    {
        $this->primePageTsConfig(666, '');
        $moduleData = new ModuleData('web_edit', ['viewMode' => 2]);

        $seen = $this->processThrough($this->pageEditRequest(666, $moduleData));

        $seenModuleData = $seen->getAttribute('moduleData');
        self::assertInstanceOf(ModuleData::class, $seenModuleData);
        self::assertSame(2, $seenModuleData->get('viewMode'));
    }

    #[Test]
    public function otherModulesAreLeftAlone(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.toolbar.viewModeSelector = 0');
        $moduleData = new ModuleData('web_layout', ['viewMode' => 2]);
        $request = new ServerRequest('https://example.com/typo3/module/web/layout')
            ->withQueryParams(['id' => '666'])
            ->withAttribute('route', new Route('/module/web/layout', ['_identifier' => 'web_layout']))
            ->withAttribute('moduleData', $moduleData);

        $seen = $this->processThrough($request);

        self::assertSame($request, $seen);
        self::assertSame(2, $moduleData->get('viewMode'));
    }

    private function processThrough(ServerRequestInterface $request): ServerRequestInterface
    {
        $handler = new class implements RequestHandlerInterface {
            public ?ServerRequestInterface $request = null;

            #[\Override]
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->request = $request;

                return new Response();
            }
        };
        $middleware = new PageEditViewModeMiddleware(new PageEditModuleRequest(), new ToolbarConfigurationService());

        $middleware->process($request, $handler);

        self::assertNotNull($handler->request);

        return $handler->request;
    }

    private function pageEditRequest(int $pageId, ModuleData $moduleData): ServerRequest
    {
        return new ServerRequest('https://example.com/typo3/module/web/edit')
            ->withQueryParams(['id' => (string)$pageId])
            ->withAttribute('route', new Route('/module/web/edit', ['_identifier' => 'web_edit']))
            ->withAttribute('moduleData', $moduleData);
    }
}
