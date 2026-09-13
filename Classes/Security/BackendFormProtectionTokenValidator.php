<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Security;

use TYPO3\CMS\Core\FormProtection\FormProtectionFactory;

/**
 * Validates the token against TYPO3's backend form protection, in the very
 * scope the Visual Editor issues it for its own save endpoint
 * (window.veInfo.token). A token is therefore only accepted while the caller
 * really is inside an authenticated Visual Editor session.
 */
final readonly class BackendFormProtectionTokenValidator implements RequestTokenValidator
{
    public const FORM_NAME = 'visual_editor';

    public const ACTION = 'save';

    public function __construct(
        private FormProtectionFactory $formProtectionFactory,
    ) {
    }

    public function isValid(string $token): bool
    {
        if ($token === '') {
            return false;
        }

        return $this->formProtectionFactory
            ->createForType('backend')
            ->validateToken($token, self::FORM_NAME, self::ACTION);
    }
}
