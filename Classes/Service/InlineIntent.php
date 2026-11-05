<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/** Strict, deliberately small protocol. No DataHandler maps from the browser. */
final class InlineIntent
{
    /** @return array<string, mixed> */
    public static function parse(mixed $value): array
    {
        if (!is_array($value) || !in_array($value['action'] ?? null, ['create', 'delete'], true)) {
            throw new \InvalidArgumentException('Invalid collection action');
        }
        $keys = ['action', 'parentTable', 'parentUid', 'field', 'revision', $value['action'] === 'create' ? 'afterUid' : 'childUid'];
        if (array_diff(array_keys($value), $keys) !== []) {
            throw new \InvalidArgumentException('Unknown collection action properties');
        }
        foreach (['parentTable', 'field', 'revision'] as $key) {
            if (!is_string($value[$key] ?? null) || $value[$key] === '' || strlen($value[$key]) > 255) {
                throw new \InvalidArgumentException('Invalid ' . $key);
            }
        }
        foreach (['parentUid', $value['action'] === 'delete' ? 'childUid' : 'afterUid'] as $key) {
            if ($key === 'afterUid' && !isset($value[$key])) {
                continue;
            }
            if (!is_int($value[$key] ?? null) || $value[$key] <= 0) {
                throw new \InvalidArgumentException('Invalid ' . $key);
            }
        }
        return $value;
    }
}
