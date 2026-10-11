<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Hooks;

use TYPO3\CMS\Core\Html\HtmlParser;

/**
 * Core renders module entrypoints async in the head, while Visual Editor's
 * veInfo and this extension's configuration are inline scripts in the footer.
 * A warm module cache can therefore evaluate LocalStore before veInfo exists.
 * Native deferred modules wait for the complete document and its configuration.
 */
final class FrontendModuleLoading
{
    private const array ENTRYPOINTS = [
        '@typo3/visual-editor/Frontend/index',
        '@webconsulting/visual-editor-enhancements/Frontend/index.js',
    ];

    /** @param array<string, mixed> $parameters */
    public function process(array &$parameters): void
    {
        foreach (['jsLibs', 'jsFooterLibs'] as $position) {
            if (!is_string($parameters[$position] ?? null)) {
                continue;
            }
            $parameters[$position] = $this->deferFrontendModules($parameters[$position]);
        }
    }

    private function deferFrontendModules(string $scripts): string
    {
        preg_match_all('~<script\b[^>]*\btype="importmap"[^>]*>(.*?)</script>~s', $scripts, $maps);
        $sources = [];
        foreach ($maps[1] as $json) {
            $map = json_decode($json, true);
            $imports = is_array($map) ? ($map['imports'] ?? []) : [];
            if (!is_array($imports)) {
                continue;
            }
            foreach (self::ENTRYPOINTS as $specifier) {
                $source = $imports[$specifier] ?? null;
                if (!is_string($source)) {
                    foreach ($imports as $prefix => $address) {
                        if (is_string($prefix) && str_ends_with($prefix, '/') && str_starts_with($specifier, $prefix) && is_string($address)) {
                            $source = $address . substr($specifier, strlen($prefix));
                        }
                    }
                }
                if (is_string($source)) {
                    // Import-map entries carry a cache buster; Core's entry
                    // script URL for the same resource can omit that query.
                    $sources[] = explode('?', $source, 2)[0];
                }
            }
        }
        if ($sources === []) {
            return $scripts;
        }

        $parser = new HtmlParser();
        return preg_replace_callback('~<script\b[^>]*>~', static function (array $match) use ($sources, $parser): string {
            [$attributes] = $parser->get_tag_attributes($match[0], true);
            if (($attributes['type'] ?? null) !== 'module'
                || !is_string($attributes['src'] ?? null)
                || !in_array(explode('?', $attributes['src'], 2)[0], $sources, true)
            ) {
                return $match[0];
            }
            return preg_replace('~\s+async(?:\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+))?(?=\s|>)~i', '', $match[0]) ?? $match[0];
        }, $scripts) ?? $scripts;
    }
}
