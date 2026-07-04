<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Throwable;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Database\Query\Restriction\WorkspaceRestriction;
use TYPO3\CMS\Core\Database\RelationHandler;
use TYPO3\CMS\Core\DataHandling\ItemProcessingService;
use TYPO3\CMS\Core\DataHandling\ItemsProcessorContext;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Schema\Field\CategoryFieldType;
use TYPO3\CMS\Core\Schema\Field\CheckboxFieldType;
use TYPO3\CMS\Core\Schema\Field\ColorFieldType;
use TYPO3\CMS\Core\Schema\Field\LinkFieldType;
use TYPO3\CMS\Core\Schema\Field\StaticSelectFieldType;
use TYPO3\CMS\Core\Schema\Struct\SelectItem;
use TYPO3\CMS\Core\Schema\Struct\SelectItemCollection;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Utility\ArrayUtility;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Core\Utility\MathUtility;
use TYPO3\CMS\VisualEditor\Service\EditModeService;
use TYPO3\CMS\VisualEditor\Service\LocalizationService;

use function array_filter;
use function array_flip;
use function array_map;
use function array_values;
use function count;
use function is_array;
use function is_string;
use function str_ends_with;
use function strval;
use function trim;
use function usort;

final readonly class FieldOptionsService
{
    // Guard against pathological installs only — like the backend category
    // tree, the chooser is expected to deliver the complete category tree.
    private const CATEGORY_ITEM_LIMIT = 10000;

    public function __construct(
        private TcaSchemaFactory $tcaSchema,
        private RecordFactory $recordFactory,
        private EditModeService $editModeService,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
        private ItemProcessingService $itemProcessingService,
        private ConnectionPool $connectionPool,
        private LanguageServiceFactory $languageServiceFactory,
        private LocalizationService $localizationService,
        private LinkBrowserUrlService $linkBrowserUrl,
    ) {
    }

    /**
     * @return array{table: string, uid: int, recordType: string, fieldGroups: array<string, string>, fieldPalettes: array<string, string>, fields: list<array<string, mixed>>}|null
     */
    public function buildFieldOptions(string $table, int $uid, ServerRequestInterface $request): ?array
    {
        if (!$this->tcaSchema->has($table)) {
            return null;
        }

        $row = BackendUtility::getRecordWSOL($table, $uid);
        if ($row === null) {
            return null;
        }

        $schema = $this->tcaSchema->get($table);
        $recordType = '';
        $fieldSchema = $schema;
        if ($schema->supportsSubSchema() && !$schema->getSubSchemaTypeInformation()->isPointerToForeignFieldInForeignSchema()) {
            $recordType = (string)($row[$schema->getSubSchemaTypeInformation()->getFieldName()] ?? '');
            if (!$schema->hasSubSchema($recordType)) {
                return ['table' => $table, 'uid' => $uid, 'recordType' => $recordType, 'fieldGroups' => [], 'fieldPalettes' => [], 'fields' => []];
            }
            $fieldSchema = $schema->getSubSchema($recordType);
        }

        // TSconfig scope is the page the record lives on; pages records are their own scope.
        $pageId = $table === 'pages' ? (int)($row['uid'] ?? 0) : (int)($row['pid'] ?? 0);
        $record = $this->recordFactory->createResolvedRecordFromDatabaseRow($table, $row);
        $languageService = $this->languageServiceFactory->create($this->localizationService->getBackendUserLanguage() ?? 'en');

        $fieldGroups = $this->getFieldGroups($table, $recordType, $languageService);
        // Every showitem field mapped to its localized group label and its
        // labeled-palette identity, so the client can resolve the form section
        // of any editable output — not just the fields the chooser renders —
        // and scope the per-output button to a field's own attributes.
        $fieldGroupLabels = [];
        $fieldPalettes = [];
        foreach ($fieldGroups as $groupFieldName => $group) {
            if ($group['label'] !== '') {
                $fieldGroupLabels[$groupFieldName] = $group['label'];
            }
            $fieldPalettes[$groupFieldName] = $group['palette'];
        }
        $fields = [];
        foreach ($this->fieldChooserConfiguration->resolveFields($table, $recordType, $pageId) as $fieldName) {
            if (!$fieldSchema->hasField($fieldName) || !$this->editModeService->canEditField($record, $fieldName, $request)) {
                continue;
            }

            $field = $fieldSchema->getField($fieldName);
            $label = $languageService->sL(trim($field->getLabel()));
            if ($field instanceof StaticSelectFieldType) {
                $payload = $this->buildSelectField($table, $recordType, $field, $label, $row, $pageId, $languageService);
            } elseif ($field instanceof CategoryFieldType) {
                $payload = $this->buildCategoryField($table, $field, $label, $row, $languageService);
            } elseif ($field instanceof LinkFieldType) {
                $payload = $this->buildLinkField($table, $uid, $field, $label, $row);
            } elseif ($field instanceof CheckboxFieldType && count($field->getConfiguration()['items'] ?? []) <= 1) {
                $payload = $this->buildCheckField($field, $label, $row);
            } elseif ($field instanceof ColorFieldType) {
                $payload = $this->buildColorField($field, $label, $row);
            } else {
                continue;
            }
            $payload['group'] = $fieldGroups[$fieldName]['label'] ?? '';
            $payload['tab'] = $fieldGroups[$fieldName]['tab'] ?? '';
            $payload['position'] = $fieldGroups[$fieldName]['position'] ?? PHP_INT_MAX;
            $fields[] = $payload;
        }

        // Mirror the backend form: fields in showitem order, so group headings
        // come out in the same sequence as the FormEngine tabs and palettes.
        usort($fields, static fn(array $a, array $b): int => $a['position'] <=> $b['position']);
        $fields = array_map(static function (array $field): array {
            unset($field['position']);
            return $field;
        }, $fields);

        return ['table' => $table, 'uid' => $uid, 'recordType' => $recordType, 'fieldGroups' => $fieldGroupLabels, 'fieldPalettes' => $fieldPalettes, 'fields' => $fields];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildSelectField(
        string $table,
        string $recordType,
        StaticSelectFieldType $field,
        string $label,
        array $row,
        int $pageId,
        LanguageService $languageService,
    ): array {
        $fieldTsConfig = $this->getFieldTsConfig($table, $field->getName(), $recordType, $pageId);
        $items = $this->processSelectItems($table, $field, $row, $pageId, $fieldTsConfig);
        $items = $this->applySelectItemsTsConfig($items, $fieldTsConfig);

        $altLabels = is_array($fieldTsConfig['altLabels.'] ?? null) ? $fieldTsConfig['altLabels.'] : [];
        $options = [];
        foreach ($items as $item) {
            $value = $item->getValue();
            if ($value === null || (string)$value === '--div--') {
                continue;
            }
            $altLabel = $altLabels[$value] ?? null;
            $options[] = [
                'value' => (string)$value,
                'label' => $languageService->sL(trim(is_string($altLabel) && $altLabel !== '' ? $altLabel : $item->getLabel())),
            ];
        }

        return [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'select',
            'value' => (string)($row[$field->getName()] ?? ''),
            'items' => $options,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $fieldTsConfig
     *
     * @return list<SelectItem>
     */
    private function processSelectItems(
        string $table,
        StaticSelectFieldType $field,
        array $row,
        int $pageId,
        array $fieldTsConfig,
    ): array {
        $items = $field->getItems();
        $configuration = $field->getConfiguration();
        if (empty($configuration['itemsProcFunc']) && empty($configuration['itemsProcessors'])) {
            return $items;
        }

        try {
            return $this->itemProcessingService->processItems(
                SelectItemCollection::createFromArray($items, 'select'),
                new ItemsProcessorContext(
                    table: $table,
                    field: $field->getName(),
                    row: $row,
                    fieldConfiguration: $configuration,
                    processorParameters: [],
                    realPid: (int)($row['pid'] ?? $pageId),
                    site: $this->itemProcessingService->resolveSite($pageId),
                    fieldTSconfig: $fieldTsConfig,
                ),
            )->toArray();
        } catch (Throwable) {
            return $items;
        }
    }

    /**
     * @param list<SelectItem> $items
     * @param array<string, mixed> $fieldTsConfig
     *
     * @return list<SelectItem>
     */
    private function applySelectItemsTsConfig(array $items, array $fieldTsConfig): array
    {
        $keepItems = $fieldTsConfig['keepItems'] ?? null;
        if (is_string($keepItems)) {
            if ($keepItems === '') {
                $items = [];
            } else {
                $keep = array_flip(GeneralUtility::trimExplode(',', $keepItems, true));
                $items = array_filter($items, static fn(SelectItem $item): bool => isset($keep[(string)$item->getValue()]));
            }
        }

        $addItems = is_array($fieldTsConfig['addItems.'] ?? null) ? $fieldTsConfig['addItems.'] : [];
        foreach ($addItems as $value => $itemLabel) {
            $value = (string)$value;
            if (str_ends_with($value, '.') || !is_string($itemLabel)) {
                continue;
            }
            $items[] = SelectItem::fromTcaItemArray(['label' => $itemLabel, 'value' => $value]);
        }

        $removeItems = $fieldTsConfig['removeItems'] ?? null;
        if (is_string($removeItems) && $removeItems !== '') {
            $remove = array_flip(GeneralUtility::trimExplode(',', $removeItems, true));
            $items = array_filter($items, static fn(SelectItem $item): bool => !isset($remove[(string)$item->getValue()]));
        }

        return array_values($items);
    }

    /**
     * @return array<string, mixed>
     */
    private function getFieldTsConfig(string $table, string $fieldName, string $recordType, int $pageId): array
    {
        $fieldTsConfig = BackendUtility::getPagesTSconfig($pageId)['TCEFORM.'][$table . '.'][$fieldName . '.'] ?? [];
        if (!is_array($fieldTsConfig)) {
            return [];
        }

        $typeSpecific = $recordType !== '' ? ($fieldTsConfig['types.'][$recordType . '.'] ?? null) : null;
        unset($fieldTsConfig['types.']);
        if (is_array($typeSpecific)) {
            ArrayUtility::mergeRecursiveWithOverrule($fieldTsConfig, $typeSpecific);
        }

        return $fieldTsConfig;
    }

    /**
     * Maps each field of the record type to the heading it sits under in the
     * backend edit form, parsed from the TCA showitem/palette structure the
     * same way FormEngine builds the form: a labeled palette wins, otherwise
     * the surrounding tab (fields before the first --div-- belong to the
     * implicit "General" tab). The surrounding tab is additionally kept
     * separately so the client can group fields into backend-like tabs.
     * Position preserves the showitem order.
     *
     * @return array<string, array{label: string, tab: string, palette: string, position: int}>
     */
    private function getFieldGroups(string $table, string $recordType, LanguageService $languageService): array
    {
        $typeConfiguration = $GLOBALS['TCA'][$table]['types'][$recordType]
            ?? $GLOBALS['TCA'][$table]['types']['0']
            ?? [];
        $palettes = $GLOBALS['TCA'][$table]['palettes'] ?? [];
        $tabLabel = $languageService->sL('core.form.tabs:general');
        $position = 0;
        $groups = [];
        foreach (GeneralUtility::trimExplode(',', (string)($typeConfiguration['showitem'] ?? ''), true) as $item) {
            $parts = GeneralUtility::trimExplode(';', $item);
            $name = $parts[0] ?? '';
            if ($name === '--div--') {
                $tabLabel = $languageService->sL(trim($parts[1] ?? ''));
                continue;
            }
            if ($name === '--palette--') {
                $paletteName = $parts[2] ?? '';
                $label = trim($parts[1] ?? '') !== ''
                    ? trim($parts[1])
                    : trim((string)($palettes[$paletteName]['label'] ?? ''));
                $isLabeled = $label !== '';
                $groupLabel = $isLabeled ? $languageService->sL($label) : $tabLabel;
                // Only LABELED palettes get a palette identity; the per-output
                // context button scopes to palette-mates for those and falls
                // back to naming companions for top-level / unlabeled fields.
                $palette = $isLabeled ? $paletteName : '';
                foreach (GeneralUtility::trimExplode(',', (string)($palettes[$paletteName]['showitem'] ?? ''), true) as $paletteItem) {
                    $fieldName = GeneralUtility::trimExplode(';', $paletteItem)[0] ?? '';
                    if ($fieldName !== '' && $fieldName !== '--linebreak--' && !isset($groups[$fieldName])) {
                        $groups[$fieldName] = ['label' => $groupLabel, 'tab' => $tabLabel, 'palette' => $palette, 'position' => $position++];
                    }
                }
                continue;
            }
            if ($name !== '' && !isset($groups[$name])) {
                $groups[$name] = ['label' => $tabLabel, 'tab' => $tabLabel, 'palette' => '', 'position' => $position++];
            }
        }

        return $groups;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildLinkField(string $table, int $uid, LinkFieldType $field, string $label, array $row): array
    {
        return [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'link',
            'value' => (string)($row[$field->getName()] ?? ''),
            // Same uid as the payload so the signed itemName matches the
            // record the client stages the chosen typolink for.
            'linkBrowserUrl' => $this->linkBrowserUrl->buildUrl($table, $uid, (int)($row['pid'] ?? 0), $field),
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildCheckField(CheckboxFieldType $field, string $label, array $row): array
    {
        $items = $field->getConfiguration()['items'] ?? [];

        return [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'check',
            'value' => ($row[$field->getName()] ?? null) ? '1' : '0',
            'invertStateDisplay' => (bool)($items[0]['invertStateDisplay'] ?? false),
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildColorField(ColorFieldType $field, string $label, array $row): array
    {
        return [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'color',
            'value' => (string)($row[$field->getName()] ?? ''),
            'opacity' => $field->supportsOpacity(),
        ];
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildCategoryField(
        string $table,
        CategoryFieldType $field,
        string $label,
        array $row,
        LanguageService $languageService,
    ): array {
        [$items, $hiddenCount] = $this->getCategoryItems($field);

        $result = [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'category',
            'value' => $this->getOrderedCategoryUids($table, $field, $row),
            'items' => $items,
        ];
        if ($hiddenCount > 0) {
            $result['truncated'] = true;
            // ICU plural message, resolved server-side so the client receives
            // the already-formatted text in the backend user's language.
            $result['truncatedNote'] = (string)($languageService->translate(
                'frontend.fieldChooser.truncated',
                'EXT:visual_editor_enhancements/Resources/Private/Language/locallang_library.xlf',
                ['count' => $hiddenCount],
            ) ?? '');
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return list<string>
     */
    private function getOrderedCategoryUids(string $table, CategoryFieldType $field, array $row): array
    {
        $relationHandler = GeneralUtility::makeInstance(RelationHandler::class);
        $relationHandler->initializeForField($table, $field, $row, $row[$field->getName()] ?? null);

        return array_map(strval(...), $relationHandler->getValueArray());
    }

    /**
     * @return array{0: list<array{value: string, label: string, depth: int}>, 1: int}
     */
    private function getCategoryItems(CategoryFieldType $field): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('sys_category');
        $queryBuilder->getRestrictions()
            ->removeAll()
            ->add(GeneralUtility::makeInstance(DeletedRestriction::class))
            ->add(GeneralUtility::makeInstance(WorkspaceRestriction::class, (int)$this->getBackendUser()->workspace));
        $categoryRows = $queryBuilder
            ->select('uid', 'parent', 'title')
            ->from('sys_category')
            ->orderBy('parent')
            ->addOrderBy('sorting')
            ->executeQuery()
            ->fetchAllAssociative();

        $titlesByUid = [];
        $childrenByParent = [];
        foreach ($categoryRows as $categoryRow) {
            $categoryUid = (int)$categoryRow['uid'];
            $titlesByUid[$categoryUid] = (string)$categoryRow['title'];
            $childrenByParent[(int)$categoryRow['parent']][] = $categoryUid;
        }

        $items = [];
        $visited = [];
        $hiddenCount = 0;
        foreach ($this->getCategoryRootUids($field, $childrenByParent) as $rootUid) {
            $this->appendCategorySubtree($rootUid, 0, $titlesByUid, $childrenByParent, $items, $visited, $hiddenCount);
        }

        return [$items, $hiddenCount];
    }

    /**
     * @param array<int, list<int>> $childrenByParent
     *
     * @return list<int>
     */
    private function getCategoryRootUids(CategoryFieldType $field, array $childrenByParent): array
    {
        $mountPoints = [];
        foreach ($this->getBackendUser()->getCategoryMountPoints() as $mountPoint) {
            if ((int)$mountPoint > 0) {
                $mountPoints[] = (int)$mountPoint;
            }
        }
        if ($mountPoints !== []) {
            return $mountPoints;
        }

        $startingPoints = [];
        $configuredStartingPoints = (string)($field->getTreeConfiguration()['startingPoints'] ?? '');
        foreach (GeneralUtility::trimExplode(',', $configuredStartingPoints, true) as $startingPoint) {
            if (MathUtility::canBeInterpretedAsInteger($startingPoint) && (int)$startingPoint > 0) {
                $startingPoints[] = (int)$startingPoint;
            }
        }
        if ($startingPoints !== []) {
            return $startingPoints;
        }

        return $childrenByParent[0] ?? [];
    }

    /**
     * Past the item limit the traversal keeps running without appending, so
     * the exact number of hidden categories is known for the truncation note.
     *
     * @param array<int, string> $titlesByUid
     * @param array<int, list<int>> $childrenByParent
     * @param list<array{value: string, label: string, depth: int}> $items
     * @param array<int, bool> $visited
     */
    private function appendCategorySubtree(
        int $categoryUid,
        int $depth,
        array $titlesByUid,
        array $childrenByParent,
        array &$items,
        array &$visited,
        int &$hiddenCount,
    ): void {
        if (!isset($titlesByUid[$categoryUid]) || isset($visited[$categoryUid])) {
            return;
        }
        $visited[$categoryUid] = true;
        if (count($items) >= self::CATEGORY_ITEM_LIMIT) {
            $hiddenCount++;
        } else {
            $items[] = [
                'value' => (string)$categoryUid,
                'label' => $titlesByUid[$categoryUid],
                'depth' => $depth,
            ];
        }
        foreach ($childrenByParent[$categoryUid] ?? [] as $childUid) {
            $this->appendCategorySubtree($childUid, $depth + 1, $titlesByUid, $childrenByParent, $items, $visited, $hiddenCount);
        }
    }

    private function getBackendUser(): BackendUserAuthentication
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;
        if (!$backendUser instanceof BackendUserAuthentication) {
            throw new RuntimeException('Could not determine backend user authentication', 7943118262);
        }

        return $backendUser;
    }
}
