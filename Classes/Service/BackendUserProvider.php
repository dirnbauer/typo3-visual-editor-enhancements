<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

/**
 * Single read site for the backend user object.
 *
 * In a frontend request the backend user is only reachable through
 * $GLOBALS['BE_USER'] - neither the Context aspect (which carries the id and
 * group ids, not `uc`, workspace or category mounts) nor a request attribute
 * exposes the object. TYPO3 Core and EXT:visual_editor read the global the
 * same way. Concentrating it here keeps exactly one such read in the code base
 * and makes every consumer unit-testable with a stub.
 */
class BackendUserProvider
{
    public function get(): ?BackendUserAuthentication
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;

        return $backendUser instanceof BackendUserAuthentication ? $backendUser : null;
    }

    public function getOrThrow(): BackendUserAuthentication
    {
        return $this->get() ?? throw new \RuntimeException('Could not determine backend user authentication', 3305745964);
    }

    /**
     * Whether the current backend user may write records of a table at all -
     * the coarse "is this an editor for this table" check every JSON endpoint
     * of this extension runs before it answers with record data.
     */
    public function mayModifyTable(string $table): bool
    {
        $backendUser = $this->get();

        return $backendUser !== null && $backendUser->check('tables_modify', $table);
    }
}
