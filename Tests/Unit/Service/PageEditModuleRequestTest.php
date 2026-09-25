<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Module\ModuleInterface;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Core\Http\ServerRequest;
use Webconsulting\VisualEditorEnhancements\Service\PageEditModuleRequest;

/**
 * The Visual Editor module is recognized before the module validator has
 * run (route only) and after it (module attribute), and the edited page is
 * read from wherever the request carries it.
 */
final class PageEditModuleRequestTest extends TestCase
{
    #[Test]
    public function theRouteAloneIsEnough(): void
    {
        $request = new ServerRequest('https://example.com/typo3/module/web/edit')
            ->withAttribute('route', new Route('/module/web/edit', ['_identifier' => 'web_edit']));

        self::assertTrue(new PageEditModuleRequest()->isPageEditModule($request));
    }

    #[Test]
    public function theValidatedModuleIsEnough(): void
    {
        $module = self::createStub(ModuleInterface::class);
        $module->method('getIdentifier')->willReturn('web_edit');
        $request = new ServerRequest('https://example.com/typo3/module/web/edit')->withAttribute('module', $module);

        self::assertTrue(new PageEditModuleRequest()->isPageEditModule($request));
    }

    #[Test]
    public function otherModulesAndPlainRequestsAreNot(): void
    {
        $service = new PageEditModuleRequest();

        self::assertFalse($service->isPageEditModule(new ServerRequest('https://example.com/')));
        self::assertFalse($service->isPageEditModule(
            new ServerRequest('https://example.com/typo3/module/web/layout')
                ->withAttribute('route', new Route('/module/web/layout', ['_identifier' => 'web_layout'])),
        ));
    }

    #[Test]
    public function thePageComesFromTheQueryOrTheBody(): void
    {
        $service = new PageEditModuleRequest();

        self::assertSame(666, $service->getPageId(new ServerRequest('https://example.com/')->withQueryParams(['id' => '666'])));
        self::assertSame(667, $service->getPageId(new ServerRequest('https://example.com/')->withParsedBody(['id' => 667])));
        self::assertSame(0, $service->getPageId(new ServerRequest('https://example.com/')));
        self::assertSame(0, $service->getPageId(new ServerRequest('https://example.com/')->withQueryParams(['id' => ['nested']])));
    }
}
