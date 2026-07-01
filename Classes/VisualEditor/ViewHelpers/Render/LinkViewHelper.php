<?php

declare(strict_types=1);

namespace TYPO3\CMS\VisualEditor\ViewHelpers\Render;

use InvalidArgumentException;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Routing\UriBuilder;
use TYPO3\CMS\Core\Crypto\HashService;
use TYPO3\CMS\Core\Domain\Exception\RecordPropertyNotFoundException;
use TYPO3\CMS\Core\Domain\RecordFactory;
use TYPO3\CMS\Core\Domain\RecordInterface;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Schema\Field\LinkFieldType;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\DomainObject\DomainObjectInterface;
use TYPO3\CMS\Frontend\Page\PageInformation;
use TYPO3\CMS\VisualEditor\Service\EditModeService;
use TYPO3\CMS\VisualEditor\Service\LocalizationService;
use TYPO3\CMS\VisualEditor\Service\ModelToRawRecordService;
use TYPO3Fluid\Fluid\Core\ViewHelper\AbstractViewHelper;
use TYPO3Fluid\Fluid\Core\ViewHelper\InvalidArgumentValueException;
use TYPO3Fluid\Fluid\Core\ViewHelper\TagBuilder;

use function get_debug_type;
use function implode;
use function is_array;
use function is_string;

/**
 * ViewHelper for pure TCA type=link fields: renders a small link icon
 * (<ve-editable-link>) in edit mode that opens the TYPO3 link browser and
 * saves the chosen typolink immediately. Outside edit mode it renders
 * nothing - the surrounding template stays responsible for the actual
 * <a> tag (f:link.typolink).
 *
 * The link TEXT stays a regular ve:render.text field when it is editable;
 * when the text is derived (e.g. from a label) only the icon appears.
 *
 * ````html
 *   <a href="{link}"><ve:render.text record="{record}" field="cta_text"/></a>
 *   <ve:render.link record="{record}" field="cta_link"/>
 * ````
 */
final class LinkViewHelper extends AbstractViewHelper
{
    private const RECORD_TYPE = RecordInterface::class . '|' . PageInformation::class . '|' . DomainObjectInterface::class;

    protected $escapeChildren = false;

    protected $escapeOutput = false;

    public function __construct(
        private readonly EditModeService $editModeService,
        private readonly RecordFactory $recordFactory,
        private readonly TcaSchemaFactory $tcaSchema,
        private readonly Typo3Version $typo3Version,
        private readonly LocalizationService $localizationService,
        private readonly ModelToRawRecordService $modelToRawRecordService,
        private readonly UriBuilder $uriBuilder,
        private readonly HashService $hashService,
    ) {
    }

    public function initializeArguments(): void
    {
        parent::initializeArguments();

        $type = 'object';
        $typo3Version = $this->typo3Version ?? GeneralUtility::makeInstance(Typo3Version::class);
        if ($typo3Version->getMajorVersion() >= 14) {
            $type = self::RECORD_TYPE;
        }

        $this->registerArgument('record', $type, 'A Record API Object (field is also needed)');
        $this->registerArgument('field', 'string', 'the link field (TCA type=link) the icon edits', true);
        $this->registerArgument('textField', 'string', 'informational: the field holding the link text, when it is separately editable', false, '');
        $this->registerArgument('optional', 'boolean', 'If the provided field does not exist in the record, an empty string is returned.', false, false);
    }

    public function getContentArgumentName(): string
    {
        return 'record';
    }

    public function render(): string
    {
        $renderingContext = $this->renderingContext ?? throw new InvalidArgumentException('$this->renderingContext is not available', 1777200010);
        $request = $renderingContext->getAttribute(ServerRequestInterface::class);
        $this->editModeService->init($request);

        $record = $this->renderChildren();
        $field = $this->arguments['field'];

        if ($record instanceof PageInformation) {
            $record = $this->recordFactory->createResolvedRecordFromDatabaseRow('pages', $record->getPageRecord());
        }

        if ($record instanceof DomainObjectInterface) {
            $record = $this->modelToRawRecordService->modelToRawRecord($record);
        }

        if (!$record instanceof RecordInterface) {
            throw new InvalidArgumentException(
                'The record argument must be an instance of ' . self::RECORD_TYPE . '. Given: ' . get_debug_type($record),
                1777200011,
            );
        }

        try {
            $value = $record->get($field) ?? '';
        } catch (RecordPropertyNotFoundException $recordPropertyNotFoundException) {
            if ($this->arguments['optional']) {
                return '';
            }

            throw new InvalidArgumentValueException(
                'The field "' . $field . '" does not exist in the given record `' . $record->getFullType() . '`.',
                1777200012,
                $recordPropertyNotFoundException,
            );
        }

        if ($value instanceof \Stringable) {
            $value = (string)$value;
        }
        if (!is_string($value)) {
            $value = '';
        }

        $schema = $this->tcaSchema->get($record->getFullType());
        $fieldSchema = $schema->getField($field);
        if (!$fieldSchema instanceof LinkFieldType) {
            $table = $record->getMainType();
            throw new InvalidArgumentException(
                'The field "' . $table . '.' . $field . '" is not a link field (TCA type=link). Given: ' . get_debug_type($fieldSchema),
                1777200013,
            );
        }

        if (!$this->editModeService->canEditField($record, $field, $request)) {
            return '';
        }

        $table = $record->getMainType();
        $uid = $record->getComputedProperties()->getLocalizedUid() ?: $record->getComputedProperties()->getVersionedUid() ?: $record->getUid();

        $tableLabel = $schema->getTitle($this->localizationService->tryTranslation(...));
        $label = $tableLabel . ': ' . $this->localizationService->tryTranslation($fieldSchema->getLabel());

        $tag = GeneralUtility::makeInstance(TagBuilder::class);
        $tag->setTagName('ve-editable-link');
        $tag->addAttribute('table', $table);
        $tag->addAttribute('uid', (string)$uid);
        $tag->addAttribute('field', $fieldSchema->getName());
        $tag->addAttribute('name', $label);
        $tag->addAttribute('value', $value);
        $tag->addAttribute('linkBrowserUrl', $this->buildLinkBrowserUrl($table, $uid, $record->getPid(), $fieldSchema->getName(), $fieldSchema));
        $tag->forceClosingTag(true);

        return $tag->render();
    }

    private function buildLinkBrowserUrl(string $table, int $uid, int $pid, string $field, LinkFieldType $fieldSchema): string
    {
        $itemName = 'data[' . $table . '][' . $uid . '][' . $field . ']';

        $linkBrowserArguments = [];
        $configuration = $fieldSchema->getConfiguration();
        if (is_array($configuration['allowedTypes'] ?? null) && $configuration['allowedTypes'] !== []) {
            $allowedTypes = implode(',', $configuration['allowedTypes']);
            if ($allowedTypes !== '*') {
                $linkBrowserArguments['allowedTypes'] = $allowedTypes;
            }
        }

        return (string)$this->uriBuilder->buildUriFromRoute('wizard_link', ['P' => [
            'params' => $linkBrowserArguments,
            'table' => $table,
            'uid' => $uid,
            'pid' => $pid,
            'field' => $field,
            'formName' => 'editform',
            'itemName' => $itemName,
            'hmac' => $this->hashService->hmac('editform' . $itemName, 'wizard_js'),
        ]]);
    }
}
