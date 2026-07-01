<?php

declare(strict_types=1);

use Webconsulting\VisualEditorEnhancements\Middleware\BackendEnhancementsMiddleware;
use Webconsulting\VisualEditorEnhancements\Middleware\EditModeEnhancementsMiddleware;
use Webconsulting\VisualEditorEnhancements\Middleware\FieldOptionsMiddleware;

return [
    'backend' => [
        'webconsulting/visual-editor-enhancements/backend-assets' => [
            'target' => BackendEnhancementsMiddleware::class,
            'after' => [
                'typo3/cms-backend/backend-module-validator',
            ],
            'before' => [
                'typo3/cms-core/response-propagation',
            ],
        ],
    ],
    'frontend' => [
        'webconsulting/visual-editor-enhancements/field-options' => [
            'target' => FieldOptionsMiddleware::class,
            'after' => [
                'typo3/cms-frontend/site',
                'typo3/cms-frontend/backend-user-authentication',
            ],
            'before' => [
                'typo3/cms-frontend/page-resolver',
            ],
        ],
        'webconsulting/visual-editor-enhancements/edit-mode-assets' => [
            'target' => EditModeEnhancementsMiddleware::class,
            'after' => [
                'typo3/cms-visual-editor/persistence-middleware',
                'typo3/cms-frontend/page-resolver',
            ],
        ],
    ],
];
