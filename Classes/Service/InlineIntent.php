<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/**
 * Strict, deliberately small protocol. No DataHandler maps from the browser.
 *
 * Every action has its own key table; any other key, a missing required key or
 * a value of the wrong shape is rejected before a record is resolved. Child
 * tables, pids, languages of records, workspaces and live uids are never part of
 * an intent: the server derives them from the compiled parent.
 */
final class InlineIntent
{
    private const COMMON = ['action', 'parentTable', 'parentUid', 'field', 'revision'];

    /**
     * Per action: key => [required, kind]. Kinds: uid (int > 0), uidOrNull
     * (int > 0 or null, key must be present), language (1..65535), mode, ids.
     */
    private const KEYS = [
        'create' => ['afterUid' => [false, 'uid']],
        'delete' => ['childUid' => [true, 'uid']],
        'move' => ['childUid' => [true, 'uid'], 'afterUid' => [true, 'uidOrNull']],
    ];

    /** @return array<string, mixed> */
    public static function parse(mixed $value): array
    {
        if (!is_array($value) || !is_string($value['action'] ?? null) || !isset(self::KEYS[$value['action']])) {
            throw new \InvalidArgumentException('Invalid collection action');
        }
        $keys = self::KEYS[$value['action']];
        if (array_diff(array_keys($value), [...self::COMMON, ...array_keys($keys)]) !== []) {
            throw new \InvalidArgumentException('Unknown collection action properties');
        }
        foreach (['parentTable', 'field', 'revision'] as $key) {
            if (!is_string($value[$key] ?? null) || $value[$key] === '' || strlen($value[$key]) > 255) {
                throw new \InvalidArgumentException('Invalid ' . $key);
            }
        }
        self::assertKind($value, 'parentUid', 'uid');
        foreach ($keys as $key => [$required, $kind]) {
            if (!array_key_exists($key, $value)) {
                if ($required) {
                    throw new \InvalidArgumentException('Missing ' . $key);
                }
                continue;
            }
            self::assertKind($value, $key, $kind);
        }
        if ($value['action'] === 'move' && $value['afterUid'] === $value['childUid']) {
            throw new \InvalidArgumentException('An entry cannot move after itself');
        }
        return $value;
    }

    /** @param array<string, mixed> $value */
    private static function assertKind(array $value, string $key, string $kind): void
    {
        $item = $value[$key] ?? null;
        $valid = match ($kind) {
            'uid' => is_int($item) && $item > 0,
            'uidOrNull' => $item === null || (is_int($item) && $item > 0),
            default => false,
        };
        if (!$valid) {
            throw new \InvalidArgumentException('Invalid ' . $key);
        }
    }
}
