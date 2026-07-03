<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\ContentBlocks\Definition\TableDefinitionCollection;
use TYPO3\CMS\Core\Schema\Capability\TcaSchemaCapability;
use TYPO3\CMS\Core\Schema\Field\CategoryFieldType;
use TYPO3\CMS\Core\Schema\Field\CheckboxFieldType;
use TYPO3\CMS\Core\Schema\Field\ColorFieldType;
use TYPO3\CMS\Core\Schema\Field\LinkFieldType;
use TYPO3\CMS\Core\Schema\Field\StaticSelectFieldType;
use TYPO3\CMS\Core\Schema\TcaSchema;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;

use function array_diff;
use function array_filter;
use function array_replace;
use function array_values;
use function count;
use function in_array;
use function is_array;
use function is_string;
use function str_ends_with;
use function str_starts_with;
use function substr;
use function trim;

final class FieldChooserConfigurationService
{
    private const AUTO_DETECT_FIELDS = '*';

    /**
     * Memoized per request; the set of Content Blocks tables cannot change
     * within one request.
     *
     * @var list<string>|null
     */
    private ?array $autoEnabledTables = null;

    /**
     * The Content Blocks table registry is an optional cross-extension
     * dependency: friendsoftypo3/content-blocks is not required by this
     * package, so the parameter stays nullable and simply remains null when
     * the extension is not installed.
     */
    public function __construct(
        private readonly TcaSchemaFactory $tcaSchema,
        private readonly ?TableDefinitionCollection $contentBlockTables = null,
    ) {
    }

    public function isEnabled(int $pageId): bool
    {
        return (bool)($this->getFieldChooserTsConfig($pageId)['enabled'] ?? true);
    }

    /**
     * @return list<string>
     */
    public function getEnabledTables(int $pageId): array
    {
        if (!$this->isEnabled($pageId)) {
            return [];
        }

        $tables = [];
        foreach ($this->getTableConfigurations($pageId) as $table => $configuration) {
            if ((bool)($configuration['enabled'] ?? false) && $this->tcaSchema->has($table)) {
                $tables[] = $table;
            }
        }

        return $tables;
    }

    public function isTableEnabled(string $table, int $pageId): bool
    {
        return in_array($table, $this->getEnabledTables($pageId), true);
    }

    /**
     * @return list<string>
     */
    public function resolveFields(string $table, string $recordType, int $pageId): array
    {
        if (!$this->isTableEnabled($table, $pageId)) {
            return [];
        }

        $schema = $this->tcaSchema->get($table);
        $fieldSchema = $recordType !== '' && $schema->hasSubSchema($recordType)
            ? $schema->getSubSchema($recordType)
            : $schema;

        $configuration = $this->getTableConfigurations($pageId)[$table] ?? [];
        $fieldsSetting = trim((string)(
            $configuration['types.'][$recordType . '.']['fields']
            ?? $configuration['fields']
            ?? self::AUTO_DETECT_FIELDS
        ));
        if ($fieldsSetting === self::AUTO_DETECT_FIELDS) {
            $fields = $this->autoDetectFields($schema, $fieldSchema);
        } else {
            $fields = array_values(array_filter(
                GeneralUtility::trimExplode(',', $fieldsSetting, true),
                $fieldSchema->hasField(...),
            ));
        }

        $excludeFields = GeneralUtility::trimExplode(',', (string)($configuration['excludeFields'] ?? ''), true);

        return array_values(array_diff($fields, $excludeFields));
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function getTableConfigurations(int $pageId): array
    {
        $tables = [
            'tt_content' => ['enabled' => '1', 'fields' => self::AUTO_DETECT_FIELDS],
        ];
        foreach ($this->getAutoEnabledTables() as $table) {
            $tables[$table] = ['enabled' => '1', 'fields' => self::AUTO_DETECT_FIELDS];
        }
        $configuredTables = $this->getFieldChooserTsConfig($pageId)['tables.'] ?? [];
        foreach (is_array($configuredTables) ? $configuredTables : [] as $key => $configuration) {
            if (!is_string($key) || !str_ends_with($key, '.') || !is_array($configuration)) {
                continue;
            }
            $table = substr($key, 0, -1);
            $tables[$table] = array_replace($tables[$table] ?? [], $configuration);
        }

        return $tables;
    }

    /**
     * Content Blocks tables (collection children and record types) get the
     * same auto-detect default as tt_content, so their records work in the
     * field chooser out of the box. Explicit page TSconfig for a table is
     * merged on top and therefore always wins — `tables.<table>.enabled = 0`
     * opts a table out again.
     *
     * @return list<string>
     */
    private function getAutoEnabledTables(): array
    {
        return $this->autoEnabledTables ??= array_values(array_filter(
            $this->detectContentBlockTables(),
            static fn(string $table): bool => !self::isCoreTable($table),
        ));
    }

    /**
     * @return list<string>
     */
    private function detectContentBlockTables(): array
    {
        $tables = [];
        if ($this->contentBlockTables !== null) {
            foreach ($this->contentBlockTables as $tableDefinition) {
                $tables[] = $tableDefinition->table;
            }

            return $tables;
        }

        // Content Blocks is not installed as a DI service: fall back to the
        // Content Blocks collection child convention of a
        // foreign_table_parent_uid column in the TCA.
        foreach ($GLOBALS['TCA'] ?? [] as $table => $configuration) {
            if (is_string($table) && is_array($configuration) && isset($configuration['columns']['foreign_table_parent_uid'])) {
                $tables[] = $table;
            }
        }

        return $tables;
    }

    /**
     * tt_content stays governed by its hard-wired default, pages and the
     * core / Visual Editor system tables must never become editable merely
     * because a Content Block re-uses them.
     */
    private static function isCoreTable(string $table): bool
    {
        return $table === 'tt_content'
            || $table === 'pages'
            || str_starts_with($table, 'sys_')
            || str_starts_with($table, 'be_')
            || str_starts_with($table, 'fe_')
            || str_starts_with($table, 'tx_visualeditor');
    }

    /**
     * @return array<string, mixed>
     */
    private function getFieldChooserTsConfig(int $pageId): array
    {
        $configuration = BackendUtility::getPagesTSconfig($pageId)['tx_visualeditorenhancements.']['fieldChooser.'] ?? [];

        return is_array($configuration) ? $configuration : [];
    }

    /**
     * @return list<string>
     */
    private function autoDetectFields(TcaSchema $schema, TcaSchema $fieldSchema): array
    {
        $blockedFields = $this->getBlockedFieldNames($schema);
        $fields = [];
        foreach ($fieldSchema->getFields() as $field) {
            if (in_array($field->getName(), $blockedFields, true) || ($field->getConfiguration()['readOnly'] ?? false)) {
                continue;
            }
            if ($field instanceof CategoryFieldType
                || ($field instanceof StaticSelectFieldType && $this->isSingleValueSelect($field))
                || $field instanceof LinkFieldType
                || ($field instanceof CheckboxFieldType && count($field->getConfiguration()['items'] ?? []) <= 1)
                || ($field instanceof ColorFieldType && !$field->supportsOpacity())
            ) {
                $fields[] = $field->getName();
            }
        }

        return $fields;
    }

    /**
     * @return list<string>
     */
    private function getBlockedFieldNames(TcaSchema $schema): array
    {
        $blockedFields = ['colPos', 'sorting'];
        if ($schema->supportsSubSchema()) {
            $blockedFields[] = $schema->getSubSchemaTypeInformation()->getFieldName();
        }
        if ($schema->hasCapability(TcaSchemaCapability::SortByField)) {
            $blockedFields[] = $schema->getCapability(TcaSchemaCapability::SortByField)->getFieldName();
        }
        // Visibility and edit locking stay in the page module / backend form;
        // surfacing them as innocent-looking toggles would be a footgun.
        if ($schema->hasCapability(TcaSchemaCapability::RestrictionDisabledField)) {
            $blockedFields[] = $schema->getCapability(TcaSchemaCapability::RestrictionDisabledField)->getFieldName();
        }
        if ($schema->hasCapability(TcaSchemaCapability::EditLock)) {
            $blockedFields[] = $schema->getCapability(TcaSchemaCapability::EditLock)->getFieldName();
        }
        if ($schema->hasCapability(TcaSchemaCapability::Language)) {
            $languageCapability = $schema->getCapability(TcaSchemaCapability::Language);
            $blockedFields[] = $languageCapability->getLanguageField()->getName();
            $blockedFields[] = $languageCapability->getTranslationOriginPointerField()->getName();
            if ($languageCapability->hasTranslationSourceField()) {
                $blockedFields[] = $languageCapability->getTranslationSourceField()->getName();
            }
        }

        return $blockedFields;
    }

    private function isSingleValueSelect(StaticSelectFieldType $field): bool
    {
        $configuration = $field->getConfiguration();

        return ($configuration['renderType'] ?? '') === 'selectSingle'
            && !($configuration['multiple'] ?? false)
            && (int)($configuration['maxitems'] ?? 1) <= 1;
    }
}
