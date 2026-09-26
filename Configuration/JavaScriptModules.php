<?php

declare(strict_types=1);

return [
    'dependencies' => ['backend', 'rte_ckeditor', 'visual_editor'],
    'imports' => [
        // Every module of this extension is imported with its .js suffix, so
        // one prefix entry covers the whole directory.
        '@webconsulting/visual-editor-enhancements/' => 'EXT:visual_editor_enhancements/Resources/Public/JavaScript/',
    ],
];
