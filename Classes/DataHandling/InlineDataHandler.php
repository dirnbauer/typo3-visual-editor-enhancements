<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\DataHandling;

use TYPO3\CMS\Core\Database\RelationHandler;
use TYPO3\CMS\Core\DataHandling\DataHandler;

/**
 * Only the guarded collection endpoint uses this instance. Core's default
 * factory converts submitted draft child IDs back to live IDs in readList().
 * Relation writes must instead resolve the current workspace children while
 * retaining live parent pointers. Generic saves retain Core's original handler.
 */
class InlineDataHandler extends DataHandler
{
    #[\Override]
    protected function createRelationHandlerInstance(): RelationHandler
    {
        $relation = parent::createRelationHandlerInstance();
        if ($this->BE_USER->workspace > 0) {
            $relation->setUseLiveReferenceIds(false);
        }
        return $relation;
    }
}
