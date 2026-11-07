<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Backend\Form\Exception\AccessDeniedException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordWorkspaceDeletePlaceholderException;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use Webconsulting\VisualEditorEnhancements\Security\AccessDenial;
use Webconsulting\VisualEditorEnhancements\Security\EditSessionGuard;
use Webconsulting\VisualEditorEnhancements\Service\FieldChooserConfigurationService;
use Webconsulting\VisualEditorEnhancements\Service\FieldOptionsService;

/**
 * Frontend JSON endpoint for the visual editor field chooser: ?veFieldOptions=1
 * returns the editable select and category fields of a single record together
 * with their possible options, labels localized to the backend user's language,
 * resolved by the same FormEngine data providers as the backend edit form.
 *
 * Access requires a logged-in backend user, the visual editor request token
 * (window.veInfo.token, scope visual_editor/save) in X-Request-Token, and
 * tables_modify permission on the requested table - see EditSessionGuard. An
 * unauthenticated request is answered with 401, everything else with 403, and
 * no request ever reaches a database read before the guard passed.
 */
final readonly class FieldOptionsMiddleware implements MiddlewareInterface
{
    public function __construct(
        private EditSessionGuard $guard,
        private TcaSchemaFactory $tcaSchema,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
        private FieldOptionsService $fieldOptionsService,
        private \Webconsulting\VisualEditorEnhancements\Service\EditorRecordContext $contexts,
        private \Webconsulting\VisualEditorEnhancements\Service\InlineRecordService $inlineRecords,
        private \Webconsulting\VisualEditorEnhancements\Service\InlineRecordConfiguration $collections,
        private \Webconsulting\VisualEditorEnhancements\Service\BackendUserProvider $users,
        private \Webconsulting\VisualEditorEnhancements\Service\FeatureFlags $features,
    ) {}

    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $queryParams = $request->getQueryParams();
        if (!isset($queryParams['veFieldOptions'])) {
            return $handler->handle($request);
        }

        $table = $queryParams['table'] ?? '';
        if (!is_string($table) || $table === '' || !$this->tcaSchema->has($table)) {
            // Answering "unknown table" before the guard would turn the
            // endpoint into a TCA probe for anonymous callers.
            $denial = $this->guard->check($request) ?? AccessDenial::InsufficientPermissions;

            return $this->guard->denialResponse($denial);
        }

        $denial = $this->guard->check($request, $table);
        if ($denial !== null) {
            return $this->guard->denialResponse($denial);
        }

        $uidParam = $queryParams['uid'] ?? null;
        $uid = (is_int($uidParam) && $uidParam > 0) || (is_string($uidParam) && preg_match('/^[1-9][0-9]*$/D', $uidParam)) ? (int)$uidParam : 0;
        $row = $uid > 0 ? BackendUtility::getRecordWSOL($table, $uid) : null;
        if ($row === null) {
            return $this->recordNotFoundResponse();
        }

        try {
            $pageId = $this->fieldChooserConfiguration->scopePageId($table, $row);
            $related = false;
            $path = json_decode(is_string($queryParams['context'] ?? null) ? $queryParams['context'] : '[]', true);
            if (!is_array($path) || count($path) > 12) {
                return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
            }
            $previous = null;
            foreach ($path as $step) {
                if (!is_array($step) || !is_string($step['table'] ?? null) || !is_int($step['uid'] ?? null) || !is_string($step['field'] ?? null)
                    || !isset($GLOBALS['TCA'][$step['table']]) || ($previous !== null && !in_array([$step['table'], $step['uid']], $previous, true))) {
                    return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
                }
                $parent = $this->contexts->compile($step['table'], $step['uid'], $request);
                if ($previous === null && !$this->fieldChooserConfiguration->isTableEnabled($step['table'], (int)$parent['scopePageId']) && !$this->collections->enabled((int)$parent['scopePageId'])) {
                    return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
                }
                $previous = [];
                foreach ($this->inlineRecords->fields($step['table'], $parent, $request) as $collection) {
                    if ($collection['name'] === $step['field']) {
                        foreach ($collection['children'] as $child) {
                            if (($child['state'] ?? '') === 'deleted') {
                                continue; // listed read-only; not a context for nested settings
                            }
                            $previous[] = [$child['table'], $child['uid']];
                        }
                    }
                }
            }
            if ($previous !== null) {
                $related = in_array([$table, $uid], $previous, true);
                if (!$related) {
                    return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
                }
            }
            $ordinary = $this->features->isFieldChooserEnabled()
                && \Webconsulting\VisualEditorEnhancements\Enum\FieldChooserMode::fromUserSetting($this->users->getOrThrow()->uc['tx_visualeditor_fieldChooserMode'] ?? null) !== \Webconsulting\VisualEditorEnhancements\Enum\FieldChooserMode::Disabled
                && $this->fieldChooserConfiguration->isTableEnabled($table, $pageId);
            if (!$related && !$ordinary && !$this->collections->enabled($pageId)) {
                return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
            }
            $fieldOptions = $this->fieldOptionsService->buildFieldOptions($table, $uid, $row, $request, $related);
            if (!$ordinary && !$related) {
                $fieldOptions['fields'] = array_values(array_filter($fieldOptions['fields'], static fn(array $field): bool => $field['type'] === 'inline'));
                $fieldOptions['fieldGroups'] = [];
                $fieldOptions['fieldPalettes'] = [];
            }
        } catch (AccessDeniedException) {
            // The backend form would refuse this record as well, e.g. no
            // content-edit permission on its page.
            return $this->guard->denialResponse(AccessDenial::InsufficientPermissions);
        } catch (DatabaseRecordException|DatabaseRecordWorkspaceDeletePlaceholderException) {
            return $this->recordNotFoundResponse();
        }

        return new JsonResponse($fieldOptions, 200, ['Cache-Control' => 'private, no-store']);
    }

    private function recordNotFoundResponse(): ResponseInterface
    {
        return new JsonResponse(['error' => 'Record not found'], 404, ['Cache-Control' => 'private, no-store']);
    }
}
