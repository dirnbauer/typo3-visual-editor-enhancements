<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Backend\Controller;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Attribute\AsController;
use TYPO3\CMS\Core\Http\JsonResponse;
use Webconsulting\VisualEditorEnhancements\Service\DataHandlerService;
use Webconsulting\VisualEditorEnhancements\Service\InlineGenericSaveGuard;
use Webconsulting\VisualEditorEnhancements\Service\InlineIntent;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

#[AsController]
final readonly class PersistenceController
{
    public function __construct(
        private DataHandlerService $dataHandlerService,
        private InlineRecordService $inlineRecords,
        private InlineGenericSaveGuard $inlineGuard,
        private \Webconsulting\VisualEditorEnhancements\Security\RequestTokenValidator $tokens,
    ) {}

    public function saveAction(ServerRequestInterface $request): ResponseInterface
    {
        $input = $this->getJsonPayload($request);

        $GLOBALS['TYPO3_REQUEST'] = $request;
        if (array_key_exists('inlineRecord', $input)) {
            try {
                if (array_keys($input) !== ['inlineRecord']) {
                    throw new \InvalidArgumentException('Collection intents cannot contain data or commands');
                }
                if (!$this->tokens->isValid($request->getHeaderLine('X-Request-Token'))) {
                    return new JsonResponse(['success' => false, 'reason' => 'token'], 403);
                }
                $intent = InlineIntent::parse($input['inlineRecord']);
                [$status, $result] = $this->inlineRecords->execute($intent, $request);
                return new JsonResponse($result, $status, ['Cache-Control' => 'private, no-store']);
            } catch (\InvalidArgumentException $error) {
                return new JsonResponse(['success' => false, 'error' => $error->getMessage()], 400);
            } catch (\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException) {
                return new JsonResponse(['success' => false, 'reason' => 'rights'], 403);
            } catch (\TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException) {
                return new JsonResponse(['success' => false, 'reason' => 'record'], 404);
            }
        }
        $data = $input['data'] ?? [];
        unset($input['data']);
        $cmdArray = $input['cmdArray'] ?? [];
        unset($input['cmdArray']);
        if (!is_array($data)) {
            throw new \RuntimeException('Data must be an array of table names to rows', 5781185589);
        }

        if (!is_array($cmdArray) || !array_is_list($cmdArray)) {
            throw new \RuntimeException('Command array must be a list of DataHandler commands', 4576273831);
        }

        if ($input !== []) {
            throw new \RuntimeException('Unknown data operations: ' . implode(', ', array_keys($input)) . ' only data and cmdArray are allowed', 8110225095);
        }

        try {
            $this->inlineGuard->check($data, $cmdArray, $request);
        } catch (\InvalidArgumentException $error) {
            return new JsonResponse(['success' => false, 'error' => $error->getMessage()], 400);
        } catch (\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException|\TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException) {
            return new JsonResponse(['success' => false, 'reason' => 'rights'], 403);
        }
        $errorLog = $this->dataHandlerService->run($data, []);

        foreach ($errorLog ? [] : $cmdArray as $cmd) {
            $errorLog = [...$errorLog, ...$this->dataHandlerService->run([], $cmd)];
        }

        if ($errorLog) {
            return new JsonResponse(['success' => false, 'errorLog' => $errorLog], 500);
        }

        return new JsonResponse(['success' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    private function getJsonPayload(ServerRequestInterface $request): array
    {
        // A JSON request has no form-encoded body, so TYPO3 leaves the parsed
        // body null (or, behind some proxies, an empty array).
        $payload = $request->getParsedBody();
        if (!is_array($payload) || $payload === []) {
            $payload = json_decode((string)$request->getBody(), true, 512, JSON_THROW_ON_ERROR);
        }

        if (!is_array($payload)) {
            throw new \RuntimeException('Save payload must be a JSON object', 2634277014);
        }

        return $payload;
    }
}
