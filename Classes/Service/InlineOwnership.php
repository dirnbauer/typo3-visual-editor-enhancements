<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

/** TCA candidates only; callers must verify the resolved owner's actual field. */
final class InlineOwnership
{
    /**
     * The TCA the memo was built from, held by value. PHP shares an unchanged
     * array instead of copying it, and === on two references to the same array
     * compares one pointer (zend_is_identical); after a write to $GLOBALS['TCA']
     * only the separated path is compared. So the check costs nothing while the
     * TCA is unchanged and still notices any change.
     *
     * @var array<string, mixed>|null
     */
    private static ?array $source = null;

    /** @var list<array{table: string, field: string, config: array<string, mixed>}> */
    private static array $relations = [];

    /**
     * Every inline column with foreign_field (base columns and columnsOverrides),
     * built once per TCA: every compile's owner check reads it.
     *
     * @return list<array{table: string, field: string, config: array<string, mixed>}>
     */
    public static function relations(): array
    {
        $tca = is_array($GLOBALS['TCA'] ?? null) ? $GLOBALS['TCA'] : [];
        if (self::$source === null || $tca !== self::$source) {
            self::$relations = self::scan($tca);
            self::$source = $tca;
        }
        return self::$relations;
    }

    /**
     * @param array<string, mixed> $tables
     * @return list<array{table: string, field: string, config: array<string, mixed>}>
     */
    private static function scan(array $tables): array
    {
        $relations = [];
        foreach ($tables as $table => $tca) {
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
