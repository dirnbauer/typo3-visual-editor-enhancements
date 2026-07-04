<?php

declare(strict_types=1);

use Webconsulting\VisualEditorEnhancements\Backend\Controller\PersistenceController;

return [
    'visual_editor_save' => [
        'path' => '/visual-editor/save',
        'target' => PersistenceController::class . '::saveAction',
        'methods' => ['POST'],
        'inheritAccessFromModule' => 'web_edit',
    ],
];
