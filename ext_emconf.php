<?php

$EM_CONF[$_EXTKEY] = [
    'title' => 'Visual Editor Enhancements',
    'description' => 'Visual Editor enhancements: element library, editable links, and a select/category field chooser.',
    'category' => 'be',
    'author' => 'webconsulting GmbH',
    'author_email' => 'office@webconsulting.at',
    'state' => 'beta',
    'version' => '0.8.0',
    'constraints' => [
        'depends' => [
            'typo3' => '14.3.0-14.9.99',
            'visual_editor' => '1.8.0-1.99.99',
        ],
        'suggests' => [
            // The field chooser auto-enables Content Blocks tables when installed.
            'content_blocks' => '',
        ],
    ],
];
