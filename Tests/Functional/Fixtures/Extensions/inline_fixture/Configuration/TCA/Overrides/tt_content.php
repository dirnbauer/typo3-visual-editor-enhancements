<?php

$config = ['type' => 'inline', 'foreign_table' => 'tx_vee_item', 'foreign_field' => 'owner', 'foreign_table_field' => 'owner_table', 'foreign_match_fields' => ['slot' => 'items'], 'minitems' => 1, 'maxitems' => 3];
$GLOBALS['TCA']['tt_content']['columns']['vee_items'] = ['label' => 'Items', 'config' => $config];
$config['foreign_match_fields'] = ['slot' => 'shared'];
$GLOBALS['TCA']['tt_content']['columns']['vee_shared'] = ['label' => 'Shared', 'config' => $config];
$GLOBALS['TCA']['tt_content']['types']['text']['showitem'] .= ',vee_items,vee_shared';
