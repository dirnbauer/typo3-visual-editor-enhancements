#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
suite=unit
while getopts 's:p:' option; do
  case "$option" in
    s) suite="$OPTARG" ;;
    p) php -r 'exit(str_starts_with(PHP_VERSION, $argv[1]) ? 0 : 1);' "$OPTARG" ;;
    *) exit 2 ;;
  esac
done
case "$suite" in
  unit) vendor/bin/phpunit -c Build/phpunit/UnitTests.xml ;;
  functional) vendor/bin/phpunit -c Build/phpunit/FunctionalTests.xml ;;
  js) node --test 'Tests/JavaScript/*.test.js' ;;
  phpstan) vendor/bin/phpstan analyse --memory-limit=512M --no-progress ;;
  cgl) vendor/bin/php-cs-fixer fix --config .php-cs-fixer.dist.php --dry-run --diff ;;
  *) echo 'Suites: unit functional js phpstan cgl' >&2; exit 2 ;;
esac
