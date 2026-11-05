<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/** TCA candidates only; callers must verify the resolved owner's actual field. */
final class InlineOwnership
{
    /** @return list<array{table: string, field: string, config: array<string, mixed>}> */
    public static function relations(): array
    {
        $relations = [];
        foreach ($GLOBALS['TCA'] as $table => $tca) {
            $sets = [$tca['columns'] ?? []];
            foreach ($tca['types'] ?? [] as $type) {
                $sets[] = $type['columnsOverrides'] ?? [];
            }
            foreach ($sets as $set) {
                foreach ($set as $field => $column) {
                    $config = array_replace_recursive($tca['columns'][$field]['config'] ?? [], $column['config'] ?? []);
                    if (($config['type'] ?? '') === 'inline' && !empty($config['foreign_field']) && !empty($config['foreign_table'])) {
                        $relations[$table . ':' . $field . ':' . md5(serialize($config))] = ['table' => $table, 'field' => $field, 'config' => $config];
                    }
                }
            }
        }
        return array_values($relations);
    }

    /** @param array<string, mixed> $row
     * @param array<string, mixed> $config
     */
    public static function matches(array $row, string $parentTable, array $config): bool
    {
        if (!empty($config['foreign_table_field']) && ($row[$config['foreign_table_field']] ?? '') !== $parentTable) {
            return false;
        }
        foreach ($config['foreign_match_fields'] ?? [] as $name => $value) {
            if ((string)($row[$name] ?? '') !== (string)$value) {
                return false;
            }
        }
        return true;
    }
}
