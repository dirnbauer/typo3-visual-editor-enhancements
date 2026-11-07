<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Form\Exception\AccessDeniedException;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Database\Query\Restriction\WorkspaceRestriction;
use TYPO3\CMS\Core\DataHandling\Localization\State;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\SiteFinder;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * Translations of collection parents and entries, selected the way Core selects
 * them (deleteL10nOverlayRecords, inlineLocalizeSynchronize): not deleted, live or
 * of the current workspace, overlaid, delete placeholders skipped.
 */
final readonly class InlineTranslations
{
    public function __construct(
        private ConnectionPool $connections,
        private BackendUserProvider $users,
        private EditorRecordContext $contexts,
        private SiteFinder $sites,
    ) {}

    /**
     * @param array<string, mixed> $row
     * @return list<array<string, mixed>>
     */
    public function of(string $table, array $row): array
    {
        $pointer = (string)($GLOBALS['TCA'][$table]['ctrl']['transOrigPointerField'] ?? '');
        if ($pointer === '') {
            return [];
        }
        $workspace = $this->users->getOrThrow()->workspace;
        $live = (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']);
        $query = $this->connections->getQueryBuilderForTable($table);
        $query->getRestrictions()->removeAll()
            ->add(GeneralUtility::makeInstance(DeletedRestriction::class))
            ->add(GeneralUtility::makeInstance(WorkspaceRestriction::class, $workspace));
        $rows = $query->select('*')->from($table)->where(
            $query->expr()->eq($pointer, $query->createNamedParameter($live, Connection::PARAM_INT)),
        )->orderBy('uid')->executeQuery()->fetchAllAssociative();
        $active = [];
        foreach ($rows as $translation) {
            BackendUtility::workspaceOL($table, $translation, $workspace);
            if (is_array($translation) && (int)($translation['t3ver_state'] ?? 0) !== 2) {
                $active[] = $translation;
            }
        }
        return $active;
    }

    /**
     * Whether Core keeps this field of a connected translation in step with another
     * language: allowLanguageSynchronization on the column and the row's l10n_state
     * says 'parent' (also when unset) or 'source' for it. DataMapProcessor then drops
     * every value submitted for the field from the translation's datamap
     * (sanitizeTranslationItem) and synchronizes it from that language instead;
     * FormEngine shows it read-only behind the localization-state selector. Only
     * 'custom' makes it the translation's own value.
     *
     * @param array<string, mixed> $row the stored row (workspace version when there is one)
     */
    public static function followsOtherLanguage(string $table, string $field, array $row): bool
    {
        $ctrl = $GLOBALS['TCA'][$table]['ctrl'] ?? [];
        $pointer = (string)($ctrl['transOrigPointerField'] ?? '');
        $language = (string)($ctrl['languageField'] ?? '');
        if ($pointer === '' || $language === '' || (int)($row[$pointer] ?? 0) <= 0 || (int)($row[$language] ?? 0) <= 0) {
            return false; // default language or free translation: DataMapProcessor leaves it alone
        }
        $state = State::fromJSON($table, is_string($row['l10n_state'] ?? null) ? $row['l10n_state'] : null);
        return $state !== null && ($state->isParentState($field)
            || ($state->isSourceState($field) && !empty($ctrl['translationSource'])));
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<int>
     */
    public function languagesOf(string $table, array $rows): array
    {
        $languageField = (string)($GLOBALS['TCA'][$table]['ctrl']['languageField'] ?? '');
        if ($languageField === '') {
            return [];
        }
        $languages = array_values(array_unique(array_map(static fn(array $row): int => (int)($row[$languageField] ?? 0), $rows)));
        sort($languages);
        return $languages;
    }

    /**
     * Active connected translations of a default-language parent, one per language.
     *
     * @param array<string, mixed> $form compiled parent
     * @return array<int, array<string, mixed>> language id => translated parent row (overlaid)
     */
    public function parentsByLanguage(string $table, array $form): array
    {
        $languages = [];
        $languageField = (string)($form['processedTca']['ctrl']['languageField'] ?? '');
        foreach ($this->of($table, $form['resolvedRow']) as $translation) {
            $languages[(int)($translation[$languageField] ?? 0)] ??= $translation;
        }
        unset($languages[0]);
        ksort($languages);
        return $languages;
    }

    /**
     * The per-language sync preflight of a default-language collection: what Core's
     * inlineLocalizeSynchronize would localize (missing) or remove (orphaned), and
     * whether this editor may run it.
     *
     * @param array<string, mixed> $form     compiled default-language parent
     * @param array<string, mixed> $config   resolved inline config
     * @param list<array<string, mixed>> $children payload children (with liveUid, untranslated)
     * @param array<string, bool> $controls
     * @return array{languages: list<array<string, mixed>>, internal: array<int, array{missing: list<int>, current: int}>}
     */
    public function syncPreflight(string $table, string $field, array $form, array $config, array $children, array $controls, bool $enabled, ServerRequestInterface $request): array
    {
        $childTable = (string)$config['foreign_table'];
        $childPointer = (string)($GLOBALS['TCA'][$childTable]['ctrl']['transOrigPointerField'] ?? '');
        $members = array_values(array_filter($children, static fn(array $child): bool => $child['state'] !== 'deleted'));
        $memberLiveUids = array_map(static fn(array $child): int => (int)$child['liveUid'], $members);
        $max = (int)($config['maxitems'] ?? 0);
        $user = $this->users->getOrThrow();
        $languages = [];
        $internal = [];
        foreach ($this->parentsByLanguage($table, $form) as $language => $translatedParent) {
            $missing = [];
            foreach ($members as $member) {
                if (in_array($language, $member['untranslated'], true)) {
                    $missing[] = (int)$member['liveUid'];
                }
            }
            $translatedUid = (int)(($translatedParent['t3ver_oid'] ?? 0) ?: $translatedParent['uid']);
            $reason = '';
            $current = [];
            try {
                $translatedForm = $this->contexts->compile($table, $translatedUid, $request);
                $current = array_values(array_filter(array_map('intval', GeneralUtility::trimExplode(',', (string)($translatedForm['databaseRow'][$field] ?? ''), true))));
                if (!$this->contexts->mayEditField($table, $field, $translatedForm)
                    || !empty($translatedForm['processedTca']['columns'][$field]['config']['readOnly'])) {
                    $reason = 'rights';
                } elseif (($translatedForm['processedTca']['columns'][$field]['l10n_mode'] ?? '') === 'exclude'
                    || self::followsOtherLanguage($table, $field, $translatedForm['resolvedRow'])) {
                    // Core keeps a synchronized list in step itself; FormEngine offers no localize there.
                    $reason = 'translation';
                }
            } catch (AccessDeniedException|DatabaseRecordException) {
                $reason = 'rights';
            }
            $orphaned = 0;
            if ($childPointer !== '') {
                foreach ($current as $uid) {
                    $row = BackendUtility::getRecordWSOL($childTable, $uid);
                    $origin = (int)($row[$childPointer] ?? 0);
                    if ($origin > 0 && !in_array($origin, $memberLiveUids, true)) {
                        $orphaned++;
                    }
                }
            }
            if ($reason === '') {
                $reason = match (true) {
                    !$enabled => 'syncDisabled',
                    !$controls['localize'] => 'controls',
                    $user->workspace > 0 => 'syncWorkspace',
                    !$user->checkLanguageAccess($language) => 'language',
                    // Even synchronize (which also removes orphans) would exceed the limit.
                    $max > 0 && count($current) - $orphaned + count($missing) > $max => 'max',
                    $missing === [] && $orphaned === 0 => 'syncNone',
                    default => '',
                };
            }
            $languages[] = [
                'id' => $language,
                'title' => $this->languageTitle((int)$form['scopePageId'], $language),
                'parentUid' => $translatedUid,
                'missing' => count($missing),
                'orphaned' => $orphaned,
                'canSync' => $reason === '',
                'syncReason' => $reason,
            ];
            $internal[$language] = ['missing' => $missing, 'current' => count($current)];
        }
        return ['languages' => $languages, 'internal' => $internal];
    }

    private function languageTitle(int $pageId, int $language): string
    {
        try {
            return $this->sites->getSiteByPageId($pageId)->getLanguageById($language)->getTitle();
        } catch (SiteNotFoundException|\InvalidArgumentException) {
            return (string)$language;
        }
    }
}
