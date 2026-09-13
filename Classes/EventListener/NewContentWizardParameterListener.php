<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\EventListener;

use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\TypoScript\TypoScriptService;
use TYPO3\CMS\Core\Utility\ArrayUtility;
use TYPO3\CMS\VisualEditor\Events\ModifyNewContentElementWizardUrlParameterEvent;

/**
 * Steers the "new content element" wizard the Visual Editor opens from a
 * content area's or element's "+" button, through the official extension
 * point EXT:visual_editor 1.10.0 added for it
 * (ModifyNewContentElementWizardUrlParameterEvent) - never by rewriting the
 * URL in JavaScript.
 *
 * Integrators add parameters per page tree with page TSconfig, e.g. to
 * preselect field values for elements created from the Visual Editor:
 *
 * ````typoscript
 *   tx_visualeditorenhancements.newContentWizard.parameters {
 *     defVals.tt_content.header_layout = 2
 *   }
 * ````
 *
 * The Visual Editor's own placeholders (__COL_POS__, __UID_PID__,
 * __TX_CONTAINER_PARENT__) and its returnUrl stay untouched unless the
 * TSconfig explicitly overrides a key of the same name, so the wizard keeps
 * inserting into the clicked target.
 *
 * Without that TSconfig the listener is a no-op; it exists so a project never
 * needs a DOM patch to influence the wizard URL.
 */
final readonly class NewContentWizardParameterListener
{
    public function __construct(
        private TypoScriptService $typoScriptService,
    ) {}

    #[AsEventListener]
    public function __invoke(ModifyNewContentElementWizardUrlParameterEvent $event): void
    {
        $parameters = $event->getParameters();
        $pageId = (int)($parameters['id'] ?? 0);
        if ($pageId <= 0) {
            return;
        }

        $additionalParameters = $this->getConfiguredParameters($pageId);
        if ($additionalParameters === []) {
            return;
        }

        ArrayUtility::mergeRecursiveWithOverrule($parameters, $additionalParameters);
        $event->setParameters($parameters);
    }

    /**
     * @return array<string, mixed>
     */
    private function getConfiguredParameters(int $pageId): array
    {
        $configuration = BackendUtility::getPagesTSconfig($pageId)['tx_visualeditorenhancements.']['newContentWizard.']['parameters.'] ?? null;
        if (!\is_array($configuration) || $configuration === []) {
            return [];
        }

        $parameters = [];
        foreach ($this->typoScriptService->convertTypoScriptArrayToPlainArray($configuration) as $key => $value) {
            // A numeric TSconfig key would end up as an int here; wizard URL
            // parameter names are always strings.
            $parameters[(string)$key] = $value;
        }

        return $parameters;
    }
}
