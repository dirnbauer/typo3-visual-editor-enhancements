<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\DataHandling\TableColumnType;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;

/**
 * Which record types carry collections the edit frame may offer, from TCA alone:
 * {tt_content: {<CType>: [inlineFieldNames]}}. The action bar uses it to render
 * Entries / Add entry from the first paint instead of a hover round trip.
 *
 * Field names only - no counts, labels or child records. A listed field still has
 * its rights decided per record by the capability payload when the editor opens it.
 * Columns the user may not edit (exclude without the right, readOnly, TCEFORM
 * disabled), child tables the user may not modify and relations the collection API
 * does not support are left out.
 */
readonly class CollectionFieldIndex
{
    /** The vendor wraps content elements only (ve-content-element carries CType). */
    private const TABLE = 'tt_content';

    public function __construct(
        private TcaSchemaFactory $schemas,
        private InlineRecordConfiguration $configuration,
        private BackendUserProvider $users,
    ) {}

    /** @return array<string, array<string, list<string>>> */
    public function build(int $pageId): array
    {
        if (!$this->configuration->enabled($pageId) || !$this->schemas->has(self::TABLE) || !$this->users->mayModifyTable(self::TABLE)) {
            return [];
        }
        $user = $this->users->getOrThrow();
        $settings = $this->configuration->forPage($pageId);
        $tceForm = BackendUtility::getPagesTSconfig($pageId)['TCEFORM.'][self::TABLE . '.'] ?? [];
        $schema = $this->schemas->get(self::TABLE);
        $types = [];
        foreach ($schema->getSubSchemata() as $type => $subSchema) {
            // The vendor wrapper offers no editing for CTypes the editor may not use.
            if (!$user->isAdmin() && !$user->check('explicit_allowdeny', self::TABLE . ':CType:' . $type)) {
                continue;
            }
            $fields = [];
            foreach ($subSchema->getFieldsOfType(TableColumnType::INLINE) as $field) {
                $name = $field->getName();
                $config = $field->getConfiguration();
                $column = $GLOBALS['TCA'][self::TABLE]['columns'][$name] ?? [];
                $fieldTceForm = is_array($tceForm[$name . '.'] ?? null) ? $tceForm[$name . '.'] : [];
                if (InlineRecordService::relationReason($config, $settings) !== ''
                    || !empty($config['readOnly'])
                    || !empty($fieldTceForm['disabled'])
                    || !empty($fieldTceForm['types.'][$type . '.']['disabled'])
                    || (!empty($column['exclude']) && !$user->check('non_exclude_fields', self::TABLE . ':' . $name))
                    || !$this->users->mayModifyTable((string)$config['foreign_table'])
                ) {
                    continue;
                }
                $fields[] = $name;
            }
            if ($fields !== []) {
                $types[(string)$type] = $fields;
            }
        }
        return $types === [] ? [] : [self::TABLE => $types];
    }
}
