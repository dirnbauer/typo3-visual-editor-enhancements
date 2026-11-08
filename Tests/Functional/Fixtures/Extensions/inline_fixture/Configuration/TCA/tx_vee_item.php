<?php

return [
    'ctrl' => ['title' => 'Entry', 'label' => 'title', 'sortby' => 'sorting', 'delete' => 'deleted',
        'tstamp' => 'tstamp', 'crdate' => 'crdate', 'versioningWS' => true, 'security' => ['ignorePageTypeRestriction' => true],
        'languageField' => 'lang', 'transOrigPointerField' => 'origin', 'enablecolumns' => ['disabled' => 'hidden']],
    'columns' => [
        'title' => ['label' => 'Title', 'config' => ['type' => 'input', 'required' => true]],
        'owner' => ['config' => ['type' => 'passthrough']],
        'owner_table' => ['config' => ['type' => 'passthrough']],
        'slot' => ['config' => ['type' => 'passthrough']],
        'hidden' => ['label' => 'Hidden', 'exclude' => true, 'config' => ['type' => 'check']],
        'lang' => ['config' => ['type' => 'language']],
        'origin' => ['config' => ['type' => 'passthrough']],
        'choice' => ['label' => 'Choice', 'config' => ['type' => 'select', 'renderType' => 'selectSingle', 'items' => [['label' => 'A', 'value' => 'a'], ['label' => 'B', 'value' => 'b']]]],
        'dependent' => ['label' => 'Dependent', 'displayCond' => 'FIELD:choice:=:b', 'config' => ['type' => 'check']],
        // Not in showitem: only the delete cascade and copy checks read it.
        'media' => ['label' => 'Media', 'config' => ['type' => 'file', 'allowed' => 'common-image-types']],
        'nested' => ['label' => 'Nested', 'config' => ['type' => 'inline', 'foreign_table' => 'tx_vee_item', 'foreign_field' => 'owner', 'foreign_table_field' => 'owner_table', 'foreign_match_fields' => ['slot' => 'nested']]],
    ],
    'types' => ['1' => ['showitem' => 'title,choice,--div--;Duplicate,dependent,--div--;Duplicate,nested,hidden']],
];
