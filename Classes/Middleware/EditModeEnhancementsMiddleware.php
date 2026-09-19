<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Page\AssetCollector;
use TYPO3\CMS\Core\Page\PageRenderer;
use TYPO3\CMS\Core\Routing\PageArguments;
use Webconsulting\VisualEditorEnhancements\Service\BackendUserProvider;
use Webconsulting\VisualEditorEnhancements\Service\FrontendConfiguration;

/**
 * Adds this extension's edit-frame assets to a Visual Editor edit-mode request
 * (?editMode=1 with a backend user): the CKEditor overrides, the frontend entry
 * module, the labels and window.visualEditorEnhancements.
 */
final readonly class EditModeEnhancementsMiddleware implements MiddlewareInterface
{
    private const LANGUAGE_FILE = 'EXT:visual_editor_enhancements/Resources/Private/Language/locallang_library.xlf';

    public function __construct(
        private AssetCollector $assetCollector,
        private PageRenderer $pageRenderer,
        private LanguageServiceFactory $languageServiceFactory,
        private FrontendConfiguration $frontendConfiguration,
        private BackendUserProvider $backendUserProvider,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $backendUser = $this->backendUserProvider->get();
        if ($backendUser === null || !isset($request->getQueryParams()['editMode'])) {
            return $handler->handle($request);
        }

        $languageService = $this->languageServiceFactory->createFromUserPreferences($backendUser);

        $this->assetCollector->addStyleSheet(
            'visual-editor-enhancements-editable-overrides',
            'EXT:visual_editor_enhancements/Resources/Public/Css/editable-overrides.css',
        );
        $this->assetCollector->addJavaScriptModule('@webconsulting/visual-editor-enhancements/Frontend/index.js');
        foreach ($languageService->getLabelsFromResource(self::LANGUAGE_FILE) as $key => $value) {
            $this->pageRenderer->addInlineLanguageLabel($key, $value);
        }

        $configuration = [
            ...$this->frontendConfiguration->build($this->getPageId($request)),
            'contentAddedFeedback' => $this->getContentAddedFeedback($languageService, $backendUser),
        ];
        $this->assetCollector->addInlineJavaScript(
            'visualEditorEnhancementsInfo',
            'window.visualEditorEnhancements = ' . json_encode($configuration, JSON_THROW_ON_ERROR) . ';',
            ['type' => 'text/javascript'],
            ['useNonce' => true],
        );

        return $handler->handle($request);
    }

    private function getPageId(ServerRequestInterface $request): ?int
    {
        $routing = $request->getAttribute('routing');

        return $routing instanceof PageArguments ? $routing->getPageId() : null;
    }

    /**
     * @return array{title: string, message: string}
     */
    private function getContentAddedFeedback(LanguageService $languageService, BackendUserAuthentication $backendUser): array
    {
        $workspace = (int)$backendUser->workspace === 0 ? 'live' : 'workspace';

        return [
            'title' => (string)($languageService->translate('frontend.library.contentAdded.title', self::LANGUAGE_FILE) ?? 'Content added'),
            'message' => (string)($languageService->translate('frontend.library.contentAdded.message', self::LANGUAGE_FILE, ['workspace' => $workspace]) ?? ''),
        ];
    }
}
