<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/** Close structural bypasses even when the feature or preference is disabled. */
final class InlineGenericSaveGuard
{
    /** @param array<string, mixed> $data
     * @param list<array<string, mixed>> $commands
     */
    public function check(array $data, array $commands): void
    {
        $owners = [];
        $relations = [];
        foreach ($GLOBALS['TCA'] ?? [] as $table => $tca) {
            $columns = [$tca['columns'] ?? []];
            foreach ($tca['types'] ?? [] as $type) {
                $columns[] = $type['columnsOverrides'] ?? [];
            }
            foreach ($columns as $set) {
                foreach ($set as $field => $column) {
                    $config = array_replace_recursive($tca['columns'][$field]['config'] ?? [], $column['config'] ?? []);
                    if (($config['type'] ?? '') !== 'inline') {
                        continue;
                    }
                    $relations[$table][$field] = true;
                    if (empty($config['foreign_field']) || empty($config['foreign_table'])) {
                        continue;
                    }
                    $child = $config['foreign_table'];
                    $owners[$child][$config['foreign_field']] = true;
                    if (!empty($config['foreign_table_field'])) {
                        $owners[$child][$config['foreign_table_field']] = true;
                    }
                    foreach (array_keys($config['foreign_match_fields'] ?? []) as $name) {
                        $owners[$child][$name] = true;
                    }
                    foreach ([$config['foreign_sortby'] ?? '', $GLOBALS['TCA'][$child]['ctrl']['sortby'] ?? '', 'pid',
                        $GLOBALS['TCA'][$child]['ctrl']['languageField'] ?? '',
                        $GLOBALS['TCA'][$child]['ctrl']['transOrigPointerField'] ?? '',
                    ] as $name) {
                        if ($name !== '') {
                            $owners[$child][$name] = true;
                        }
                    }
                }
            }
        }
        foreach ($data as $table => $rows) {
            foreach ($rows as $uid => $fields) {
                if (!is_array($fields)) {
                    throw new \InvalidArgumentException('Invalid record fields');
                }
                if (isset($owners[$table]) && is_string($uid) && str_starts_with($uid, 'NEW') && $table !== 'tt_content') {
                    throw new \InvalidArgumentException('Create collection entries using the collection action');
                }
                foreach (array_keys($fields) as $field) {
                    if (isset($relations[$table][$field]) || isset($owners[$table][$field]) || str_starts_with($field, 't3ver_')) {
                        throw new \InvalidArgumentException('Collection ownership is managed by the server');
                    }
                }
            }
        }
        foreach ($commands as $command) {
            foreach ($command as $table => $rows) {
                if (isset($owners[$table]) && $table !== 'tt_content') {
                    throw new \InvalidArgumentException('Collection structure requires a collection action');
                }
                foreach ($rows as $actions) {
                    if (isset($actions['inlineLocalizeSynchronize'])) {
                        throw new \InvalidArgumentException('Collection synchronization requires the backend form');
                    }
                }
            }
        }
    }
}
