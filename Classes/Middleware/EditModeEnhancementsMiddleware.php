<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Page\AssetCollector;
use TYPO3\CMS\Core\Page\PageRenderer;
use TYPO3\CMS\Core\Routing\PageArguments;
use TYPO3\CMS\VisualEditor\Service\LocalizationService;
use Webconsulting\VisualEditorEnhancements\Service\FieldChooserConfigurationService;

final readonly class EditModeEnhancementsMiddleware implements MiddlewareInterface
{
    public function __construct(
        private AssetCollector $assetCollector,
        private PageRenderer $pageRenderer,
        private LanguageServiceFactory $languageServiceFactory,
        private LocalizationService $localizationService,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($this->isEditModeRequest($request)) {
            $this->assetCollector->addStyleSheet(
                'visual-editor-enhancements-editable-overrides',
                'EXT:visual_editor_enhancements/Resources/Public/Css/editable-overrides.css',
            );
            $this->assetCollector->addJavaScriptModule('@webconsulting/visual-editor-enhancements/Frontend/index');
            $this->loadLanguageLabelsInline();
            $this->addConfigurationInline($request);
        }

        return $handler->handle($request);
    }

    private function isEditModeRequest(ServerRequestInterface $request): bool
    {
        return isset($request->getQueryParams()['editMode'])
            && ($GLOBALS['BE_USER'] ?? null) instanceof BackendUserAuthentication;
    }

    private function loadLanguageLabelsInline(): void
    {
        $languageService = $this->languageServiceFactory->create($this->localizationService->getBackendUserLanguage() ?? 'en');
        $file = 'EXT:visual_editor_enhancements/Resources/Private/Language/locallang_library.xlf';
        foreach ($languageService->getLabelsFromResource($file) as $key => $value) {
            $this->pageRenderer->addInlineLanguageLabel($key, $value);
        }
    }

    private function addConfigurationInline(ServerRequestInterface $request): void
    {
        $this->assetCollector->addInlineJavaScript(
            'visualEditorEnhancementsInfo',
            'window.visualEditorEnhancements = ' . json_encode($this->getConfiguration($request), JSON_THROW_ON_ERROR) . ';',
            ['type' => 'text/javascript'],
            ['useNonce' => true],
        );
    }

    /**
     * @return array{
     *     elementLibraryEnabled: bool,
     *     elementLibraryLinks: bool,
     *     editableLinksEnabled: bool,
     *     elementLibraryColumns: int,
     *     contentAddedFeedback: array{title: string, message: string},
     *     fieldChooserEnabled: bool,
     *     fieldChooserTables: list<string>
     * }
     */
    private function getConfiguration(ServerRequestInterface $request): array
    {
        $editableLinksEnabled = $this->isEditableLinksEnabled() && $this->getUserBoolSetting('tx_visualeditor_showLinks', true);

        // Without a resolved page id there is no TSconfig scope, so the safest
        // fallback is to keep the field chooser disabled for that request.
        $pageId = $this->getPageId($request);
        $fieldChooserEnabled = $pageId !== null
            && $this->isFieldChooserEnabled()
            && $this->getUserBoolSetting('tx_visualeditor_showFieldChooser', true)
            && $this->fieldChooserConfiguration->isEnabled($pageId);

        return [
            'elementLibraryEnabled' => $this->isElementLibraryEnabled() && $this->getUserBoolSetting('tx_visualeditor_showLibrary', true),
            'elementLibraryLinks' => $editableLinksEnabled,
            'editableLinksEnabled' => $editableLinksEnabled,
            'elementLibraryColumns' => $this->getElementLibraryColumns(),
            'contentAddedFeedback' => $this->getContentAddedFeedback(),
            'fieldChooserEnabled' => $fieldChooserEnabled,
            'fieldChooserTables' => $fieldChooserEnabled ? $this->fieldChooserConfiguration->getEnabledTables($pageId) : [],
        ];
    }

    private function getPageId(ServerRequestInterface $request): ?int
    {
        $routing = $request->getAttribute('routing');

        return $routing instanceof PageArguments ? $routing->getPageId() : null;
    }

    private function isElementLibraryEnabled(): bool
    {
        return (bool)($GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementLibraryEnabled'] ?? false);
    }

    private function isEditableLinksEnabled(): bool
    {
        return (bool)($GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['editableLinksEnabled'] ?? true);
    }

    private function isFieldChooserEnabled(): bool
    {
        return (bool)($GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['fieldChooserEnabled'] ?? true);
    }

    private function getUserBoolSetting(string $key, bool $default): bool
    {
        $uc = $this->getBackendUser()->uc;
        if (!is_array($uc) || !array_key_exists($key, $uc)) {
            return $default;
        }

        return (bool)$uc[$key];
    }

    private function getElementLibraryColumns(): int
    {
        $uc = $this->getBackendUser()->uc;
        $value = is_array($uc) ? (int)($uc['tx_visualeditor_panelColumns'] ?? 3) : 3;

        return $value === 1 ? 1 : 3;
    }

    /**
     * @return array{title: string, message: string}
     */
    private function getContentAddedFeedback(): array
    {
        $languageService = $this->languageServiceFactory->create($this->localizationService->getBackendUserLanguage() ?? 'en');
        $domain = 'EXT:visual_editor_enhancements/Resources/Private/Language/locallang_library.xlf';
        $workspace = (int)$this->getBackendUser()->workspace === 0 ? 'live' : 'workspace';

        return [
            'title' => (string)($languageService->translate('frontend.library.contentAdded.title', $domain) ?? 'Content added'),
            'message' => (string)($languageService->translate('frontend.library.contentAdded.message', $domain, ['workspace' => $workspace]) ?? ''),
        ];
    }

    private function getBackendUser(): BackendUserAuthentication
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;
        if (!$backendUser instanceof BackendUserAuthentication) {
            throw new \RuntimeException('Could not determine backend user authentication', 3305745964);
        }

        return $backendUser;
    }
}
