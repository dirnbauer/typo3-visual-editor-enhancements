<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Routing\UriBuilder;
use TYPO3\CMS\Core\Crypto\HashService;
use TYPO3\CMS\Core\Schema\Field\LinkFieldType;

use function implode;
use function is_array;

/**
 * Builds the backend link browser (wizard_link) URL for a TCA type=link
 * field of a concrete record, signed the way FormEngine expects it. Shared
 * by the ve:render.link ViewHelper and the field chooser endpoint so both
 * open the link browser with identical parameters.
 */
final readonly class LinkBrowserUrlService
{
    public function __construct(
        private UriBuilder $uriBuilder,
        private HashService $hashService,
    ) {
    }

    public function buildUrl(string $table, int $uid, int $pid, LinkFieldType $fieldSchema): string
    {
        $field = $fieldSchema->getName();
        $itemName = 'data[' . $table . '][' . $uid . '][' . $field . ']';

        $linkBrowserArguments = [];
        $configuration = $fieldSchema->getConfiguration();
        if (is_array($configuration['allowedTypes'] ?? null) && $configuration['allowedTypes'] !== []) {
            $allowedTypes = implode(',', $configuration['allowedTypes']);
            if ($allowedTypes !== '*') {
                $linkBrowserArguments['allowedTypes'] = $allowedTypes;
            }
        }

        return (string)$this->uriBuilder->buildUriFromRoute('wizard_link', ['P' => [
            'params' => $linkBrowserArguments,
            'table' => $table,
            'uid' => $uid,
            'pid' => $pid,
            'field' => $field,
            'formName' => 'editform',
            'itemName' => $itemName,
            'hmac' => $this->hashService->hmac('editform' . $itemName, 'wizard_js'),
        ]]);
    }
}
