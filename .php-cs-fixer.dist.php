<?php

declare(strict_types=1);

use TYPO3\CodingStandards\CsFixerConfig;

$config = CsFixerConfig::create();
$config->getFinder()
    ->in(__DIR__)
    ->exclude(['.Build', 'Resources', 'var', 'vendor']);

return $config;
