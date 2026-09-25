# Visual Editor Enhancements

TYPO3 extension that adds an element library, a field chooser and a few editor
UI bridges to [friendsoftypo3/visual-editor](https://github.com/FriendsOfTYPO3/visual_editor),
without forking it.

- **Element library** — a side panel of content element types with rendered
  previews, keyword chips and typo-tolerant search, dragged onto the editor's
  own drop zones. Dropping copies the element's seeded demo record, so it lands
  pre-filled and looks like its preview.
- **Field chooser** — a popover with the record's choice fields (selects,
  category trees, `type=link`, checkboxes, colors), grouped like the backend
  form. Reachable from the element's action bar or from a hover button on an
  editable output. Changes are staged on the editor's pending-change list and
  written by its own save.
- **Editor UI bridges** — a link button for TCA `type=link` fields
  (`f:render.link`), a CKEditor toolbar that survives `overflow: hidden`
  ancestors and stays inside the viewport on every side, the backend's theme
  in the edit frame, and a partial element refresh after saving.
- **Toolbar switches** — page TSconfig takes the single/multi-language view
  switch and the autosave toggle out of the *Web > Edit* toolbar, per page
  tree or per user group.

The panels and buttons look like the TYPO3 backend, not like the site they
float over: the backend frame hands its resolved design tokens (theme, light
or dark scheme, font, radius) to the edit frame, and without them the chrome
falls back to the system colours of the user's scheme. Dialogs, labels, live
regions and focus handling follow WCAG 2.2 AA.

## Requirements

| | |
|---|---|
| TYPO3 | 14.3.7+ |
| PHP | 8.4+ |
| `friendsoftypo3/visual-editor` | 1.10.2+ (audited against 1.10.3) |
| `friendsoftypo3/content-blocks` | optional — auto-enables Content Blocks tables |

Distributed through Composer and Git only; there is no TER release.

## Install

```bash
composer require webconsulting/visual-editor-enhancements
vendor/bin/typo3 cache:flush
```

## Configure

All features default to on. Toggle them install-wide from a **sitepackage's
`ext_localconf.php`** — not from `config/system/settings.php`, which is
git-ignored in most setups, so a flag set there is lost on the next deployment:

```php
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementLibraryEnabled'] = true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['fieldChooserEnabled'] = true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['editableLinksEnabled'] = true;
$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementRefreshEnabled'] = true;
```

Per backend user, on the *Visual editor* tab of User settings:
`tx_visualeditor_showLibrary`, `tx_visualeditor_showContextButtons`,
`tx_visualeditor_fieldChooserMode` (`tabs` | `sections` | `disabled`),
`tx_visualeditor_panelColumns`.

Page TSconfig:

```typoscript
tx_visualeditorenhancements.fieldChooser {
  enabled = 1
  tables {
    tt_content {
      enabled = 1
      fields = *                      # or an explicit comma list
      excludeFields = layout
      types.textmedia.fields = frame_class, space_before_class
    }
    tx_news_domain_model_news.enabled = 1
  }
}

# Wizard parameters, through the Visual Editor 1.10.0 extension point
tx_visualeditorenhancements.newContentWizard.parameters.defVals.tt_content.header_layout = 2

# Web > Edit toolbar: no single/multi-language view switch, no autosave toggle
tx_visualeditorenhancements.toolbar.viewModeSelector = 0
tx_visualeditorenhancements.toolbar.autoSave = 0
```

The element library additionally needs a **catalog provider** extension that
answers `?elementLibrary=1` (and, optionally, `?elementLibrarySearch=`) with
the site's element inventory and signed, cacheable preview URLs. That part is
site-specific and deliberately not shipped here — the contract is in the
[developer documentation](Documentation/Developer.rst).

## Use

In *Web > Edit*: the round button top right opens the library, drag a card onto
a drop zone. Every element's action bar gets an "Edit field settings" button,
and hovering an editable text shows a small button that opens the same popover
scoped to that field. Link fields show a chain icon that opens the TYPO3 link
browser. Everything is staged and written by the editor's normal save.

## Develop

```bash
composer install
composer cgl:check        # typo3/coding-standards, dry run
composer phpstan          # level 8, no baseline
composer test:unit
composer test:js          # node --test, no dependencies
composer test:functional  # sqlite by default; CI also runs MariaDB 10.11
```

The shipped JavaScript is dependency-free ES modules under
`Resources/Public/JavaScript/` with no build step, mirroring how the Visual
Editor ships its own; specifiers carry their `.js` suffix. Everything this
extension does to the Visual Editor's own runtime lives in
`Frontend/visual-editor-patches.js`, and each patch checks first whether
upstream already has the fix. [`Tests/E2E/`](Tests/E2E/README.md) holds a
Playwright suite for a running installation; it is not part of CI.

## Docs

Full manual in [`Documentation/`](Documentation/Index.rst): installation,
configuration, usage, [developer reference](Documentation/Developer.rst),
[known problems](Documentation/KnownProblems.rst), and a feature-by-feature
[compatibility audit](Documentation/Compatibility.rst) against Visual Editor
1.10.3. Changes per release: [CHANGELOG.md](CHANGELOG.md).

## License

GPL-2.0-or-later, see [LICENSE](LICENSE).
