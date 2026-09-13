<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Security;

/**
 * Why an edit-session JSON endpoint refused a request, together with the HTTP
 * status and the message it answers with. Kept separate from the middleware so
 * every endpoint refuses in exactly the same shape.
 */
enum AccessDenial: string
{
    case NotAuthenticated = 'Backend login required';
    case InvalidToken = 'Invalid or missing request token';
    case InsufficientPermissions = 'Insufficient permissions for this table';

    public function statusCode(): int
    {
        return $this === self::NotAuthenticated ? 401 : 403;
    }

    public function message(): string
    {
        return $this->value;
    }
}
