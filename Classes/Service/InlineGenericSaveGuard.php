<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Utility\BackendUtility;

/** Close structural bypasses even when the feature or preference is disabled. */
final class InlineGenericSaveGuard
{
    public function __construct(private readonly EditorRecordContext $contexts) {}

    /** @param array<string, mixed> $data
     * @param list<array<string, mixed>> $commands
     */
    public function check(array $data, array $commands, ?ServerRequestInterface $request = null): void
    {
        $owners = [];
        $relations = [];
        foreach (InlineOwnership::relations() as $relation) {
            ['table' => $table, 'field' => $field, 'config' => $config] = $relation;
            $relations[$table][$field] = true;
            $child = $config['foreign_table'];
            $owners[$child][$config['foreign_field']] = true;
            if (!empty($config['foreign_table_field'])) {
                $owners[$child][$config['foreign_table_field']] = true;
            }
            foreach (array_keys($config['foreign_match_fields'] ?? []) as $name) {
                $owners[$child][$name] = true;
            }
        }
        foreach ($data as $table => $rows) {
            if (!isset($GLOBALS['TCA'][$table]) || !is_array($rows)) {
                throw new \InvalidArgumentException('Invalid records');
            }
            foreach ($rows as $uid => $fields) {
                if (!is_array($fields)) {
                    throw new \InvalidArgumentException('Invalid record fields');
                }
                $new = is_string($uid) && str_starts_with($uid, 'NEW');
                if ($new && isset($owners[$table]) && $table !== 'tt_content') {
                    throw new \InvalidArgumentException('Create collection entries using the collection action');
                }
                $row = $new ? [] : (BackendUtility::getRecordWSOL($table, (int)$uid) ?: []);
                $owned = $this->owned($table, $row);
                if ($owned && $request !== null) {
                    $this->contexts->compile($table, (int)$uid, $request);
                }
                $placement = ['pid', $GLOBALS['TCA'][$table]['ctrl']['sortby'] ?? '', $GLOBALS['TCA'][$table]['ctrl']['languageField'] ?? '', $GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? ''];
                foreach ($fields as $field => $value) {
                    if (isset($relations[$table][$field]) || isset($owners[$table][$field]) || str_starts_with($field, 't3ver_') || ($owned && in_array($field, $placement, true))) {
                        throw new \InvalidArgumentException('Collection ownership is managed by the server');
                    }
                    if (!is_scalar($value) && $value !== null) {
                        throw new \InvalidArgumentException('Invalid field value');
                    }
                }
            }
        }
        // Validate every command before the controller runs even its first datamap.
        foreach ($commands as $command) {
            if (!is_array($command)) {
                throw new \InvalidArgumentException('Invalid command');
            }
            foreach ($command as $table => $rows) {
                if (!isset($GLOBALS['TCA'][$table]) || !is_array($rows)) {
                    throw new \InvalidArgumentException('Invalid command records');
                }
                foreach ($rows as $uid => $actions) {
                    if (!is_int($uid) || $uid <= 0 || !is_array($actions) || count($actions) !== 1) {
                        throw new \InvalidArgumentException('Invalid command identity');
                    }
                    // Ordinary content elements remain Core-managed, including their descendants.
                    if ($table !== 'tt_content' && $this->owned($table, BackendUtility::getRecordWSOL($table, $uid) ?: [])) {
                        throw new \InvalidArgumentException('Collection structure requires a collection action');
                    }
                    foreach ($actions as $name => $value) {
                        if (!in_array($name, ['move', 'copy', 'delete'], true)) {
                            throw new \InvalidArgumentException('Unsupported command');
                        }
                        if (is_int($value)) {
                            if ($name === 'delete' && $value !== 1) {
                                throw new \InvalidArgumentException('Invalid delete command');
                            }
                            continue;
                        }
                        if ($name === 'delete' || !is_array($value) || array_diff(array_keys($value), ['action', 'target', 'update']) !== []
                            || ($value['action'] ?? '') !== 'paste' || !is_int($value['target'] ?? null) || !is_array($value['update'] ?? null)) {
                            throw new \InvalidArgumentException('Unsupported command shape');
                        }
                        $this->check([$table => [$uid => $value['update']]], [], $request);
                    }
                }
            }
        }
    }

    /** @param array<string, mixed> $row */
    private function owned(string $table, array $row): bool
    {
        foreach (InlineOwnership::relations() as $relation) {
            $config = $relation['config'];
            if ($config['foreign_table'] === $table && (int)($row[$config['foreign_field']] ?? 0) > 0) {
                return true;
            }
        }
        return false;
    }
}
