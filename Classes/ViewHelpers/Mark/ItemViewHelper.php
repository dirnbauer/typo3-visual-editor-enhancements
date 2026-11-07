<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\ViewHelpers\Mark;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Domain\Record\SystemProperties;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Domain\RecordInterface;
use TYPO3\CMS\Core\Schema\Capability\TcaSchemaCapability;
use TYPO3\CMS\Core\Schema\Field\InlineFieldType;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Extbase\DomainObject\DomainObjectInterface;
use TYPO3\CMS\Frontend\Page\PageInformation;
use TYPO3\CMS\VisualEditor\Service\EditModeService;
use TYPO3\CMS\VisualEditor\Service\ModelToRawRecordService;
use TYPO3Fluid\Fluid\Core\ViewHelper\AbstractViewHelper;
use TYPO3Fluid\Fluid\Core\ViewHelper\InvalidArgumentValueException;

/**
 * Marks the root element of one collection entry (a repeatable row, an inline
 * child record) so the Visual Editor enhancements can find the row on the
 * page: the entries panel highlights it, hidden entries are dimmed from the
 * first render. Content Blocks has no hook for this and the child records
 * have no wrapper element of their own, so the template announces the row.
 *
 * In edit mode it renders the attributes
 *   data-ve-item="<table>:<uid>"     the uid the editables of that row stage
 *                                     against (localized ?: versioned ?: uid,
 *                                     as f:render.text writes it)
 *   data-ve-item-live="<uid>"        the record's live, default-language uid
 *   data-ve-collection="<field>"     the parent's collection field
 *   data-ve-item-hidden=""           only for a disabled (hidden) entry
 * and nothing at all outside edit mode, so the published page is unchanged.
 *
 * Reachable as `f:mark.item` (the Visual Editor's own `Mark` naming) because
 * ext_localconf.php appends this extension's ViewHelper namespace to `f`.
 *
 * ````html
 *   <f:for each="{data.cards}" as="card">
 *     <div class="card"{card -> f:mark.item(collection: 'cards')}>…</div>
 *   </f:for>
 *   <d:molecule.card attributes="{card -> f:mark.item(collection: 'cards', format: 'array')}">…</d:molecule.card>
 * ````
 */
final class ItemViewHelper extends AbstractViewHelper
{
    private const string RECORD_TYPE = RecordInterface::class . '|' . PageInformation::class . '|' . DomainObjectInterface::class;

    protected $escapeChildren = false;

    protected $escapeOutput = false;

    /**
     * collection field -> child table -> whether some table's inline field of
     * that name relates to the child table (memoized per request; TCA is fixed)
     *
     * @var array<string, array<string, bool>>
     */
    private array $collectionCheck = [];

    public function __construct(
        private readonly EditModeService $editModeService,
        private readonly RecordFactory $recordFactory,
        private readonly TcaSchemaFactory $tcaSchemaFactory,
        private readonly ModelToRawRecordService $modelToRawRecordService,
    ) {}

    #[\Override]
    public function initializeArguments(): void
    {
        parent::initializeArguments();
        $this->registerArgument('record', self::RECORD_TYPE, 'The collection entry (child record), usually the f:for item');
        $this->registerArgument('collection', 'string', 'The parent\'s collection (inline) field that holds this entry', true);
        $this->registerArgument('format', 'string', '"attributes" (an attribute string for an HTML tag) or "array" (for a component\'s attributes argument)', false, 'attributes');
    }

    #[\Override]
    public function getContentArgumentName(): string
    {
        return 'record';
    }

    /**
     * @return string|array<string, string>
     */
    #[\Override]
    public function render(): string|array
    {
        $format = $this->arguments['format'] ?? 'attributes';
        if (!in_array($format, ['attributes', 'array'], true)) {
            throw new InvalidArgumentValueException('f:mark.item: format must be "attributes" or "array", "' . (is_string($format) ? $format : get_debug_type($format)) . '" given.', 1778160001);
        }
        $renderingContext = $this->renderingContext ?? throw new \InvalidArgumentException('$this->renderingContext is not available', 1778160002);
        $request = $renderingContext->getAttribute(ServerRequestInterface::class);
        if (!$request instanceof ServerRequestInterface || !$this->editModeService->isEditMode($request)) {
            return $format === 'array' ? [] : '';
        }

        $record = $this->record($this->renderChildren());
        $collection = $this->arguments['collection'];
        if (!is_string($collection) || $collection === '' || !$this->isCollectionOf($collection, $record->getMainType())) {
            throw new InvalidArgumentValueException(
                'f:mark.item: "' . (is_string($collection) ? $collection : get_debug_type($collection)) . '" is not a collection (TCA type=inline) field holding "'
                . $record->getMainType() . '" records.',
                1778160003,
            );
        }

        $computed = $record->getComputedProperties();
        $attributes = [
            'data-ve-item' => $record->getMainType() . ':' . ($computed->getLocalizedUid() ?: $computed->getVersionedUid() ?: $record->getUid()),
            'data-ve-item-live' => (string)$record->getUid(),
            'data-ve-collection' => $collection,
        ];
        if ($this->isDisabled($record)) {
            $attributes['data-ve-item-hidden'] = '';
        }
        if ($format === 'array') {
            return $attributes;
        }
        $html = '';
        foreach ($attributes as $name => $value) {
            $html .= ' ' . $name . '="' . htmlspecialchars($value, ENT_QUOTES | ENT_HTML5) . '"';
        }

        return $html;
    }

    private function record(mixed $record): RecordInterface
    {
        if ($record instanceof PageInformation) {
            $record = $this->recordFactory->createResolvedRecordFromDatabaseRow('pages', $record->getPageRecord());
        }
        if ($record instanceof DomainObjectInterface) {
            $record = $this->modelToRawRecordService->modelToRawRecord($record);
        }
        if (!$record instanceof RecordInterface) {
            throw new \InvalidArgumentException('f:mark.item: the record must be an instance of ' . self::RECORD_TYPE . '. Given: ' . get_debug_type($record), 1778160004);
        }

        return $record;
    }

    /**
     * Some table has an inline field of that name whose foreign_table is the
     * entry's table. The entry does not know its parent table, so this is
     * the strictest check the record alone allows.
     */
    private function isCollectionOf(string $collection, string $childTable): bool
    {
        if (isset($this->collectionCheck[$collection][$childTable])) {
            return $this->collectionCheck[$collection][$childTable];
        }
        $found = false;
        foreach ($this->tcaSchemaFactory->all() as $schema) {
            if (!$schema->hasField($collection)) {
                continue;
            }
            $field = $schema->getField($collection);
            if ($field instanceof InlineFieldType && ($field->getConfiguration()['foreign_table'] ?? null) === $childTable) {
                $found = true;
                break;
            }
        }

        return $this->collectionCheck[$collection][$childTable] = $found;
    }

    private function isDisabled(RecordInterface $record): bool
    {
        // Record and Content Blocks' ContentBlockData expose the resolved
        // system properties; RecordInterface itself does not declare them.
        if (method_exists($record, 'getSystemProperties')) {
            $properties = $record->getSystemProperties();
            if ($properties instanceof SystemProperties && $properties->isDisabled() !== null) {
                return $properties->isDisabled();
            }
        }
        if (!$this->tcaSchemaFactory->has($record->getMainType())) {
            return false;
        }
        $schema = $this->tcaSchemaFactory->get($record->getMainType());
        if (!$schema->hasCapability(TcaSchemaCapability::RestrictionDisabledField)) {
            return false;
        }
        $field = (string)$schema->getCapability(TcaSchemaCapability::RestrictionDisabledField);
        $raw = $record->getRawRecord();

        return $raw !== null && $raw->has($field) && (bool)$raw->get($field);
    }
}
