<?php

declare(strict_types=1);

/*
 * PHPUnit bootstrap: locate a composer autoloader for both supported setups —
 * a standalone checkout with its own vendor/ (CI) and a monorepo that installs
 * the package from a path repository (vendor/ three levels up).
 */

$autoloadFiles = [
    __DIR__ . '/../vendor/autoload.php',
    __DIR__ . '/../../../vendor/autoload.php',
];
$classLoader = null;
foreach ($autoloadFiles as $autoloadFile) {
    if (is_file($autoloadFile)) {
        $classLoader = require $autoloadFile;
        break;
    }
}
if (!$classLoader instanceof \Composer\Autoload\ClassLoader) {
    fwrite(STDERR, 'No composer autoloader found. Run "composer install" first.' . PHP_EOL);
    exit(1);
}

// A monorepo autoloader may resolve the extension namespace to an installed
// copy of the package; prepend the local sources so the code under test is
// always this checkout.
$classLoader->addPsr4('Webconsulting\\VisualEditorEnhancements\\Tests\\', __DIR__ . '/', true);
$classLoader->addPsr4('Webconsulting\\VisualEditorEnhancements\\', __DIR__ . '/../Classes/', true);
