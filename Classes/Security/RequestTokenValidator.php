<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Security;

/**
 * Validates the Visual Editor request token a JSON endpoint of this extension
 * received. Kept as an interface so the guard can be unit-tested without a
 * backend session; the shipped implementation delegates to TYPO3's backend
 * form protection.
 */
interface RequestTokenValidator
{
    public function isValid(string $token): bool;
}
