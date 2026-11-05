<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException;
use TYPO3\CMS\Backend\Form\FormDataCompiler;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaDatabaseRecord;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/** One identity/access boundary for both field discovery and structural writes. */
final readonly class EditorRecordContext
{
    public function __construct(private FormDataCompiler $compiler, private BackendUserProvider $users) {}

    /** @param array<string, mixed> $form */
    public function mayEditField(string $table, string $field, array $form): bool
    {
        $user = $this->users->getOrThrow();
        $column = $form['processedTca']['columns'][$field] ?? [];
        return $column !== [] && empty($form['processedTca']['ctrl']['readOnly'])
            && empty($column['config']['readOnly']) && $user->check('tables_modify', $table)
            && (empty($column['exclude']) || $user->check('non_exclude_fields', $table . ':' . $field));
    }

    /** @return array<string, mixed>
     * @param list<string> $ancestors
     */
    public function compile(string $table, int $requestedUid, ServerRequestInterface $request, array $ancestors = []): array
    {
        $user = $this->users->getOrThrow();
        $raw = BackendUtility::getRecord($table, $requestedUid);
        if (!$raw || ((int)($raw['t3ver_wsid'] ?? 0) !== 0 && (int)$raw['t3ver_wsid'] !== $user->workspace)) {
            throw new DatabaseRecordException('Record unavailable in this workspace', 1783261101, null, $table, $requestedUid);
        }
        $row = BackendUtility::getRecordWSOL($table, $requestedUid);
        if (!$row || (int)($row['t3ver_state'] ?? 0) === 2) {
            throw new DatabaseRecordException('Record unavailable in this workspace', 1783261102, null, $table, $requestedUid);
        }
        $compileUid = (int)($row['_ORIG_uid'] ?? $row['uid']);
        $pageId = $table === 'pages' ? (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']) : (int)$row['pid'];
        $page = $table === 'pages' ? $row : BackendUtility::getRecordWSOL('pages', $pageId);
        if (!$user->isAdmin() && (
            !$user->isInWebMount($pageId)
            || !$user->checkRecordEditAccess($table, $row)->isAllowed
            || !$user->workspaceCheckStageForCurrent(0)
            || !empty($page['editlock'])
        )) {
            throw new \TYPO3\CMS\Backend\Form\Exception\AccessDeniedEditInternalsException('Record, page, language or workspace access denied', 1783261103);
        }
        // Keep all dependency columns for displayCond and resolved type/columnsOverrides.
        // Returning a column still requires the independent field-level checks.
        $form = $this->compiler->compile([
            'request' => $request, 'tableName' => $table, 'vanillaUid' => $compileUid,
            'command' => 'edit', 'inlineResolveExistingChildren' => true,
            'inlineCompileExistingChildren' => false,
        ], GeneralUtility::makeInstance(TcaDatabaseRecord::class));
        // DataHandler::workspaceCannotEditRecord checks editing-stage access (0),
        // rather than rejecting a row merely because its stored stage is nonzero.
        $form['resolvedRow'] = BackendUtility::getRecord($table, $compileUid);
        $form['requestedUid'] = $requestedUid;
        $form['compileUid'] = $compileUid;
        $form['scopePageId'] = $pageId;
        $form['workspaceId'] = $user->workspace;
        $key = $table . ':' . $compileUid;
        if (in_array($key, $ancestors, true) || count($ancestors) >= 16) {
            $this->denyOwner();
        }
        $this->authorizeOwners($table, $form, $request, [...$ancestors, $key]);
        return $form;
    }
    /** @param array<string, mixed> $form
     * @param list<string> $ancestors
     */
    private function authorizeOwners(string $table, array $form, ServerRequestInterface $request, array $ancestors): void
    {
        $row = $form['resolvedRow'];
        $hasOwner = false;
        $edges = [];
        foreach (InlineOwnership::relations() as $candidate) {
            $config = $candidate['config'];
            if ($config['foreign_table'] !== $table || (int)($row[$config['foreign_field']] ?? 0) <= 0) {
                continue;
            }
            $hasOwner = true;
            if (!InlineOwnership::matches($row, $candidate['table'], $config)) {
                continue;
            }
            $edges[$candidate['table'] . ':' . $row[$config['foreign_field']] . ':' . $candidate['field']] = $candidate;
        }
        if (!$hasOwner) {
            return; // Independently owned records retain ordinary FormEngine access.
        }
        if (count($edges) !== 1) {
            $this->denyOwner();
        }
        $edge = reset($edges);
        $parent = $this->compile($edge['table'], (int)$row[$edge['config']['foreign_field']], $request, $ancestors);
        $field = $edge['field'];
        $config = $parent['processedTca']['columns'][$field]['config'] ?? [];
        if (!$this->mayEditField($edge['table'], $field, $parent) || ($config['type'] ?? '') !== 'inline'
            || ($config['foreign_table'] ?? '') !== $table || empty($config['foreign_field'])
            || !InlineOwnership::matches($row, $edge['table'], $config) || !empty($config['overrideChildTca'])) {
            $this->denyOwner();
        }
        $liveUid = (int)(($row['t3ver_oid'] ?? 0) ?: $row['uid']);
        $members = array_map('intval', GeneralUtility::trimExplode(',', (string)($parent['databaseRow'][$field] ?? ''), true));
        if (!in_array($liveUid, $members, true) && !in_array((int)$row['uid'], $members, true)) {
            $this->denyOwner();
        }
        $settings = BackendUtility::getPagesTSconfig((int)$parent['scopePageId'])['tx_visualeditorenhancements.']['inlineRecords.'] ?? [];
        if (!($settings['enabled'] ?? true) || !($settings['tables.'][$table . '.']['enabled'] ?? true)) {
            $this->denyOwner();
        }
    }

    private function denyOwner(): never
    {
        throw new \TYPO3\CMS\Backend\Form\Exception\AccessDeniedEditInternalsException('Collection owner requires backend form access', 1783261104);
    }

}
