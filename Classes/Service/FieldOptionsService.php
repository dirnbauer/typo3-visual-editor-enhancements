<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Form\Exception\AccessDeniedException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordWorkspaceDeletePlaceholderException;
use TYPO3\CMS\Backend\Form\FormDataCompiler;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaDatabaseRecord;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaSelectTreeAjaxFieldData;
use TYPO3\CMS\Core\Context\LanguageAspect;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Domain\Repository\PageRepository;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Schema\Capability\TcaSchemaCapability;
use TYPO3\CMS\Core\Schema\Field\CategoryFieldType;
use TYPO3\CMS\Core\Schema\Field\CheckboxFieldType;
use TYPO3\CMS\Core\Schema\Field\ColorFieldType;
use TYPO3\CMS\Core\Schema\Field\LinkFieldType;
use TYPO3\CMS\Core\Schema\Field\StaticSelectFieldType;
use TYPO3\CMS\Core\Schema\TcaSchema;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Site\SiteFinder;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\VisualEditor\Service\EditModeService;

/**
 * Builds the field chooser payload from the FormEngine data providers - the
 * pipeline behind the backend edit form and its category tree - so the
 * chooser offers what the backend form offers for the same record: TCEFORM
 * page TSconfig (disabled, label, keepItems, removeItems, addItems,
 * altLabels, treeConfig), displayCond, itemsProcFunc, authMode, the rules for
 * translated records, and the category tree with its language filter,
 * starting points and category mounts. Category titles are shown in the
 * language of the record being edited.
 */
final readonly class FieldOptionsService
{
    // Guard against pathological installs only — like the backend category
    // tree, the chooser is expected to deliver the complete category tree.
    private const int CATEGORY_ITEM_LIMIT = 10000;

    public function __construct(
        private TcaSchemaFactory $tcaSchema,
        private RecordFactory $recordFactory,
        private EditModeService $editModeService,
        private FieldChooserConfigurationService $fieldChooserConfiguration,
        private FormDataCompiler $formDataCompiler,
        private LanguageServiceFactory $languageServiceFactory,
        private LinkBrowserUrlService $linkBrowserUrl,
        private BackendUserProvider $backendUserProvider,
        private ConnectionPool $connectionPool,
        private SiteFinder $siteFinder,
    ) {}

    /**
     * @param array<string, mixed> $row the record, workspace-overlaid, as the endpoint resolved it
     *
     * @return array{table: string, uid: int, recordType: string, fieldGroups: array<string, string>, fieldPalettes: array<string, string>, fields: list<array<string, mixed>>}
     *
     * @throws AccessDeniedException when the backend form would refuse to open the record
     * @throws DatabaseRecordException when the record is gone
     * @throws DatabaseRecordWorkspaceDeletePlaceholderException when the record is deleted in the current workspace
     */
    public function buildFieldOptions(string $table, int $uid, array $row, ServerRequestInterface $request): array
    {
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

        $pageId = $this->fieldChooserConfiguration->scopePageId($table, $row);
        $record = $this->recordFactory->createResolvedRecordFromDatabaseRow($table, $row);
        $languageService = $this->languageServiceFactory->createFromUserPreferences($this->backendUserProvider->getOrThrow());

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

        $candidates = [];
        foreach ($this->fieldChooserConfiguration->resolveFields($table, $recordType, $pageId) as $fieldName) {
            if ($fieldSchema->hasField($fieldName) && $this->editModeService->canEditField($record, $fieldName, $request)) {
                $candidates[] = $fieldName;
            }
        }

        $fields = [];
        $formData = $candidates !== [] ? $this->compileFormData($table, $uid, $candidates, $request) : [];
        $isTranslation = $this->isTranslation($schema, $row);
        foreach ($candidates as $fieldName) {
            // A column the providers removed (displayCond, not in showitem,
            // no selectable items) is not in the backend form either.
            $column = $formData['processedTca']['columns'][$fieldName] ?? null;
            if (!is_array($column) || !$this->isEditableInBackendForm($formData, $table, $fieldName, $column, $isTranslation)) {
                continue;
            }

            $field = $fieldSchema->getField($fieldName);
            $label = $languageService->sL(trim((string)($column['label'] ?? $field->getLabel())));
            if ($field instanceof StaticSelectFieldType) {
                $payload = $this->buildSelectField($field, $label, $column, $row);
            } elseif ($field instanceof CategoryFieldType) {
                $payload = $this->buildCategoryField($table, $uid, $field, $label, (string)($formData['recordTypeValue'] ?? ''), $request, $languageService);
                $payload['items'] = $this->localizeCategoryItems($payload['items'], $this->getLanguageId($schema, $row), $pageId);
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
     * The record as the backend edit form compiles it, restricted to the
     * given columns.
     *
     * @param list<string> $fieldNames
     *
     * @return array<string, mixed>
     */
    private function compileFormData(string $table, int $uid, array $fieldNames, ServerRequestInterface $request): array
    {
        return $this->formDataCompiler->compile([
            'request' => $request,
            'tableName' => $table,
            'vanillaUid' => $uid,
            'command' => 'edit',
            'processedTca' => $this->getReducedTca($table, $fieldNames),
        ], GeneralUtility::makeInstance(TcaDatabaseRecord::class));
    }

    /**
     * The category tree exactly as the backend form's tree loads it - this is
     * what FormSelectTreeAjaxController compiles for the field.
     *
     * @return array{items: list<array<string, mixed>>, value: list<string>}
     */
    private function compileCategoryTree(string $table, int $uid, string $fieldName, string $recordTypeValue, ServerRequestInterface $request): array
    {
        $processedTca = $this->getReducedTca($table, [$fieldName]);
        $processedTca['types'][$recordTypeValue]['showitem'] = $fieldName;
        $formData = $this->formDataCompiler->compile([
            'request' => $request,
            'tableName' => $table,
            'vanillaUid' => $uid,
            'command' => 'edit',
            'processedTca' => $processedTca,
            'recordTypeValue' => $recordTypeValue,
            'selectTreeCompileItems' => true,
        ], GeneralUtility::makeInstance(TcaSelectTreeAjaxFieldData::class));

        $items = $formData['processedTca']['columns'][$fieldName]['config']['items'] ?? [];
        $value = $formData['databaseRow'][$fieldName] ?? [];

        return [
            'items' => is_array($items) ? array_values(array_filter($items, is_array(...))) : [],
            'value' => is_array($value) ? array_values(array_map(\strval(...), $value)) : [],
        ];
    }

    /**
     * The table's TCA with only the given columns, as FormSelectTreeAjaxController
     * prepares it: the providers then resolve items and trees for those alone.
     * Type-specific columnsOverrides of other columns would otherwise come
     * back as half-configured columns.
     *
     * @param list<string> $fieldNames
     *
     * @return array<string, mixed>
     */
    private function getReducedTca(string $table, array $fieldNames): array
    {
        $tca = $GLOBALS['TCA'][$table] ?? [];
        if (!is_array($tca)) {
            return [];
        }
        $keep = array_flip($fieldNames);
        $tca['columns'] = array_intersect_key(is_array($tca['columns'] ?? null) ? $tca['columns'] : [], $keep);
        foreach (is_array($tca['types'] ?? null) ? $tca['types'] : [] as $type => $typeConfiguration) {
            if (is_array($typeConfiguration) && is_array($typeConfiguration['columnsOverrides'] ?? null)) {
                $tca['types'][$type]['columnsOverrides'] = array_intersect_key($typeConfiguration['columnsOverrides'], $keep);
            }
        }

        return $tca;
    }

    /**
     * The early returns of FormEngine's SingleFieldContainer: a field the
     * backend form hides, or shows read-only, is not offered for editing.
     *
     * @param array<string, mixed> $formData
     * @param array<string, mixed> $column
     */
    private function isEditableInBackendForm(array $formData, string $table, string $fieldName, array $column, bool $isTranslation): bool
    {
        $fieldTsConfig = $formData['pageTsConfig']['TCEFORM.'][$table . '.'][$fieldName . '.'] ?? [];
        $fieldTsConfig = is_array($fieldTsConfig) ? $fieldTsConfig : [];
        if ($fieldTsConfig['disabled'] ?? false) {
            return false;
        }
        if (($column['config']['readOnly'] ?? false) || ($fieldTsConfig['config.']['readOnly'] ?? false)) {
            return false;
        }
        if ($isTranslation) {
            // defaultAsReadonly shows the default language value read-only;
            // l10n_mode=exclude hides the field on translations altogether.
            if (GeneralUtility::inList((string)($column['l10n_display'] ?? ''), 'defaultAsReadonly')
                || ($column['l10n_mode'] ?? '') === 'exclude'
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed> $row
     */
    private function getLanguageId(TcaSchema $schema, array $row): int
    {
        if (!$schema->hasCapability(TcaSchemaCapability::Language)) {
            return 0;
        }
        $languageField = $schema->getCapability(TcaSchemaCapability::Language)->getLanguageField()->getName();

        return (int)($row[$languageField] ?? 0);
    }

    /**
     * @param array<string, mixed> $row
     */
    private function isTranslation(TcaSchema $schema, array $row): bool
    {
        if (!$schema->hasCapability(TcaSchemaCapability::Language)) {
            return false;
        }
        $pointerField = $schema->getCapability(TcaSchemaCapability::Language)->getTranslationOriginPointerField()->getName();

        return (int)($row[$pointerField] ?? 0) > 0;
    }

    /**
     * The items as TcaSelectItems resolved them: static, foreign-table and
     * itemsProcFunc items, TSconfig keepItems/removeItems/addItems/altLabels,
     * authMode, translated labels, and the "invalid value" item for a stored
     * value that is no longer among them.
     *
     * @param array<string, mixed> $column
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function buildSelectField(StaticSelectFieldType $field, string $label, array $column, array $row): array
    {
        $options = [];
        $items = $column['config']['items'] ?? [];
        foreach (is_array($items) ? $items : [] as $item) {
            $value = is_array($item) ? ($item['value'] ?? null) : null;
            if (!is_scalar($value) || (string)$value === '--div--') {
                continue;
            }
            $options[] = [
                'value' => (string)$value,
                'label' => (string)($item['label'] ?? ''),
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
     * @return array{name: string, label: string, type: string, value: list<string>, items: list<array{value: string, label: string, depth: int, selectable: bool}>, truncated?: bool, truncatedNote?: string}
     */
    private function buildCategoryField(
        string $table,
        int $uid,
        CategoryFieldType $field,
        string $label,
        string $recordTypeValue,
        ServerRequestInterface $request,
        LanguageService $languageService,
    ): array {
        $tree = $this->compileCategoryTree($table, $uid, $field->getName(), $recordTypeValue, $request);
        [$items, $hiddenCount] = $this->flattenCategoryTree($tree['items']);

        $result = [
            'name' => $field->getName(),
            'label' => $label,
            'type' => 'category',
            'value' => $tree['value'],
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
     * The core tree's depth-first node list without its virtual root node
     * (identifier 0, the table title, never selectable): the popover shows
     * the field label as the heading instead. Nodes the tree configuration
     * makes unselectable (nonSelectableLevels) stay in as structure.
     *
     * @param list<array<string, mixed>> $treeItems
     *
     * @return array{0: list<array{value: string, label: string, depth: int, selectable: bool}>, 1: int}
     */
    private function flattenCategoryTree(array $treeItems): array
    {
        $items = [];
        $hiddenCount = 0;
        foreach ($treeItems as $treeItem) {
            $identifier = (string)($treeItem['identifier'] ?? '');
            if ($identifier === '' || $identifier === '0') {
                continue;
            }
            if (count($items) >= self::CATEGORY_ITEM_LIMIT) {
                $hiddenCount++;
                continue;
            }
            $items[] = [
                'value' => $identifier,
                'label' => (string)($treeItem['name'] ?? ''),
                'depth' => max(0, (int)($treeItem['depth'] ?? 1) - 1),
                'selectable' => (bool)($treeItem['selectable'] ?? false),
            ];
        }

        return [$items, $hiddenCount];
    }

    /**
     * Category titles in the language of the record being edited, resolved
     * the way the frontend resolves them: PageRepository's "mixed" overlay
     * takes the translation, else the site language's fallback chain, else
     * keeps the default-language title of the tree. As the backend tree is
     * sorted by title, siblings are re-sorted by the title now shown.
     *
     * @param list<array{value: string, label: string, depth: int, selectable: bool}> $items
     *
     * @return list<array{value: string, label: string, depth: int, selectable: bool}>
     */
    private function localizeCategoryItems(array $items, int $languageId, int $pageId): array
    {
        $languageAspect = $languageId > 0 && $items !== [] ? $this->getLanguageAspect($languageId, $pageId) : null;
        if ($languageAspect === null) {
            return $items;
        }

        $pageRepository = GeneralUtility::makeInstance(PageRepository::class);
        $titles = [];
        foreach ($this->getCategoryRows(array_map(intval(...), array_column($items, 'value'))) as $categoryRow) {
            $overlay = $pageRepository->getLanguageOverlay('sys_category', $categoryRow, $languageAspect);
            if (isset($overlay['_LOCALIZED_UID']) && is_string($overlay['title'] ?? null) && $overlay['title'] !== '') {
                $titles[(string)$categoryRow['uid']] = $overlay['title'];
            }
        }
        if ($titles === []) {
            return $items;
        }

        $items = array_map(static function (array $item) use ($titles): array {
            $item['label'] = $titles[$item['value']] ?? $item['label'];
            return $item;
        }, $items);

        return $this->sortCategorySiblings($items);
    }

    private function getLanguageAspect(int $languageId, int $pageId): ?LanguageAspect
    {
        try {
            $siteLanguage = $this->siteFinder->getSiteByPageId($pageId)->getLanguageById($languageId);
        } catch (SiteNotFoundException|\InvalidArgumentException) {
            return null;
        }

        return new LanguageAspect($languageId, $languageId, LanguageAspect::OVERLAYS_MIXED, $siteLanguage->getFallbackLanguageIds());
    }

    /**
     * The default-language rows behind the tree items, hidden ones included
     * like in the tree.
     *
     * @param list<int> $uids
     *
     * @return list<array<string, mixed>>
     */
    private function getCategoryRows(array $uids): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('sys_category');
        $queryBuilder->getRestrictions()->removeAll()->add(GeneralUtility::makeInstance(DeletedRestriction::class));

        return array_values($queryBuilder
            ->select('*')
            ->from('sys_category')
            ->where($queryBuilder->expr()->in('uid', $queryBuilder->createNamedParameter($uids, Connection::PARAM_INT_ARRAY)))
            ->executeQuery()
            ->fetchAllAssociative());
    }

    /**
     * Re-sorts the depth-first item list so that siblings follow each other by
     * title while every node keeps its subtree directly below it.
     *
     * @param list<array{value: string, label: string, depth: int, selectable: bool}> $items
     *
     * @return list<array{value: string, label: string, depth: int, selectable: bool}>
     */
    private function sortCategorySiblings(array $items): array
    {
        // Each item's sort key is the path of (title, original position) from
        // its root down to itself; comparing paths orders siblings by title
        // and keeps children right after their parent.
        $paths = [];
        $ancestors = [];
        foreach ($items as $index => $item) {
            $ancestors = array_slice($ancestors, 0, $item['depth']);
            $ancestors[] = [$item['label'], $index];
            $paths[$index] = $ancestors;
        }
        $order = array_keys($items);
        usort($order, static function (int $a, int $b) use ($paths): int {
            foreach ($paths[$a] as $level => [$label, $position]) {
                if (!isset($paths[$b][$level])) {
                    return 1;
                }
                $comparison = strnatcasecmp($label, $paths[$b][$level][0]) ?: $position <=> $paths[$b][$level][1];
                if ($comparison !== 0) {
                    return $comparison;
                }
            }

            return count($paths[$a]) <=> count($paths[$b]);
        });

        return array_map(static fn(int $index): array => $items[$index], $order);
    }
}
