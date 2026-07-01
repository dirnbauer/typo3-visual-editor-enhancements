<?php

declare(strict_types=1);

$importMap = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__ . '/../Resources/Public/JavaScript/'));
$allFiles = array_filter(iterator_to_array($iterator), static fn($file) => $file->isFile());
foreach ($allFiles as $file) {
    assert($file instanceof SplFileInfo);
    $importPath = str_replace(__DIR__ . '/../Resources/Public/JavaScript/', '', $file->getPathname());
    $importPath = str_replace('.js', '', $importPath);
    $importMap['@webconsulting/visual-editor-enhancements/' . $importPath] = 'EXT:visual_editor_enhancements/Resources/Public/JavaScript/' . $importPath . '.js';
}

return [
    'dependencies' => ['backend', 'visual_editor'],
    'imports' => [
        ...$importMap,
        '@webconsulting/visual-editor-enhancements/' => 'EXT:visual_editor_enhancements/Resources/Public/JavaScript/',
    ],
];
