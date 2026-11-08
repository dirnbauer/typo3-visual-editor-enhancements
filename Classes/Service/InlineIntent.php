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
     * (int > 0 or null, key must be present), language (1..65535), mode
     * (localize|synchronize), ids (non-empty list of distinct uids, at most 1000).
     */
    private const KEYS = [
        'create' => ['afterUid' => [false, 'uid']],
        'delete' => ['childUid' => [true, 'uid']],
        'move' => ['childUid' => [true, 'uid'], 'afterUid' => [true, 'uidOrNull']],
        'sync' => ['language' => [true, 'language'], 'mode' => [true, 'mode'], 'ids' => [false, 'ids']],
        // 1.7: copy of a listed leaf entry, placed directly after it.
        'duplicate' => ['childUid' => [true, 'uid']],
        // 1.7: the live uid a listed delete placeholder shows; the server finds the version.
        'restore' => ['childUid' => [true, 'uid']],
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
        // Core ignores ids once an action is given: single entries are localized only.
        if ($value['action'] === 'sync' && isset($value['ids']) && $value['mode'] !== 'localize') {
            throw new \InvalidArgumentException('Only localize accepts selected entries');
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
            'language' => is_int($item) && $item >= 1 && $item <= 65535,
            'mode' => in_array($item, ['localize', 'synchronize'], true),
            'ids' => is_array($item) && array_is_list($item) && $item !== [] && count($item) <= 1000
                && array_filter($item, static fn(mixed $uid): bool => !is_int($uid) || $uid <= 0) === []
                && count(array_unique($item)) === count($item),
            default => false,
        };
        if (!$valid) {
            throw new \InvalidArgumentException('Invalid ' . $key);
        }
    }
}
