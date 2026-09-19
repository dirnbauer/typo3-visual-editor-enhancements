# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-19

Behaviour-preserving restructuring, re-verified against
`friendsoftypo3/visual-editor` **1.10.2** — still the newest release on
Packagist, and the version the constraint already names. Nothing upstream
changed between 1.0.0 and this release, so no further patch could be dropped;
the one remaining runtime patch (rich-text toolbar placement) was re-audited
and still has no upstream equivalent.

### Added

- **JavaScript unit tests** (`Tests/JavaScript/`, `composer test:js`): 29 cases
  on the Lit-free modules — the search client and its fallback rules, the
  category/term filter, the `?veFieldOptions` promise cache and the reader of
  `window.visualEditorEnhancements`. They run on the Node test runner with no
  dependencies and no browser, and are a CI job of their own.
- **Playwright end-to-end suite** (`Tests/E2E/`) driving a running TYPO3
  through the whole editor surface: the library FAB, the server-ranked search
  with suggestions and did-you-mean, the cached previews, the field chooser
  with `select` *and* `category` fields, the rich-text toolbar at the top of
  the viewport, and the plain-text editables. Not part of CI; the four
  environment variables it needs are documented in `Tests/E2E/README.md`.

### Changed

- **One place decides whether a feature is on.** `Service\FeatureFlags` reads
  the install-wide flags and `Service\FrontendConfiguration` combines them with
  the backend user's settings and the page TSconfig into the object the edit
  frame receives. `EditModeEnhancementsMiddleware` shrank from 215 to 88 lines
  and is now only an asset loader.
- **The two oversized components were decomposed.**
  `ve-element-library.js` 2045 → 941 lines (constants, filter, search,
  drag-ghost, drop-target, preview-frame, preview-loader and styles now live in
  `ve-element-library/`) and `ve-field-chooser.js` 1237 → 758 lines
  (`ve-field-chooser/`). The extracted modules import no Lit, which is what
  makes them unit-testable.
- **The import map is one prefix entry instead of a directory scan on every
  request** (`Configuration/JavaScriptModules.php`, 21 → 12 lines). Module
  specifiers must therefore carry their `.js` suffix; every specifier in this
  extension does.
- `Configuration/TCA/Overrides/be_users.php`: four near-identical
  `addUserSetting()` blocks became one data-driven loop (84 → 59 lines).
- `FieldChooserConfigurationService::scopePageId()` replaces the "a page is its
  own TSconfig scope" branch that was duplicated in the middleware and the
  service.
- `FieldOptionsService::buildFieldOptions()` takes the already resolved record
  row and no longer returns `null`: the endpoint resolves and refuses, the
  service only builds. `FieldOptionsMiddleware` collapsed three separate
  "Record not found" exits into one.
- Backend-user labels come from `LanguageServiceFactory::createFromUserPreferences()`,
  so the extension no longer depends on the Visual Editor's
  `LocalizationService`.

### Removed

- The legacy aliases `elementLibraryLinks` and `fieldChooserEnabled` from
  `window.visualEditorEnhancements`; `editableLinksEnabled` and
  `fieldChooserMode` are the contract. Site JavaScript reading the old keys
  must be updated.
- The 0.2.x `be_users.uc` migration fallbacks (`tx_visualeditor_showLinks`,
  `tx_visualeditor_showFieldChooser`). The current settings have shipped since
  0.3.0.
- The four `??=` flag defaults in `ext_localconf.php`; `FeatureFlags` defaults
  each flag to on where it is read.

## [1.0.0] — 2026-09-13

First stable release. Audited feature by feature against
`friendsoftypo3/visual-editor` **1.10.2**; the full table with the reasoning
per feature is in [`Documentation/Compatibility.rst`](Documentation/Compatibility.rst).

### Changed

- **Requirements**: TYPO3 14.3.7+, PHP 8.4+, `friendsoftypo3/visual-editor`
  1.10.2+. The 1.10.x line is the first that carries the extension point for
  new-content wizard URLs, the scoped editable-text styles, and the
  backend-safe `f:render.text` rich-text pipeline.
- **`f:render.link` no longer squats the Visual Editor's PHP namespace.** Up to
  0.8.0 the ViewHelper was autoloaded into
  `TYPO3\CMS\VisualEditor\ViewHelpers\Render\` through a second PSR-4 entry. It
  now lives in this extension's own namespace, appended to the `f` Fluid
  namespace in `ext_localconf.php`. Templates keep calling `f:render.link`
  unchanged; a future upstream `LinkViewHelper` no longer collides silently.
- **New-content wizard URLs go through the official 1.10.0 extension point.**
  Page TSconfig under `tx_visualeditorenhancements.newContentWizard.parameters`
  is merged into the wizard parameters via
  `ModifyNewContentElementWizardUrlParameterEvent`, so nothing has to rewrite
  `veInfo.newContentUrl` in JavaScript.
- **CKEditor overrides are scoped to `<ve-editable-rich-text>`**, following
  upstream's own 1.10.0 rescoping, so they no longer reach a CKEditor instance
  the Visual Editor did not mount. Balloon and dropdown panels stay unscoped
  because CKEditor appends those to `<body>`.
- JavaScript deduplicated: the overflow-clipping lift used by both the RTE
  toolbar patch and the link button is one shared module, and the viewport-box
  calculation three components repeated is one helper.

### Security

- **`?veFieldOptions=1` has one explicit gate.** `EditSessionGuard` checks, in
  this order, a backend login, the Visual Editor request token in
  `X-Request-Token` (scope `visual_editor`/`save`), and `tables_modify` on the
  requested table — 401 for the first, 403 for the rest, and no database read
  before it passes. Previously an unknown table was reported *before*
  authentication ran, which made the endpoint usable to probe the TCA.

### Added

- Documentation set under `Documentation/` (introduction, installation,
  configuration, usage, compatibility, developer reference, known problems),
  including the element library catalog contract a provider extension has to
  answer.
- Quality baseline: PHPStan level 8 without a baseline, `typo3/coding-standards`
  via php-cs-fixer, unit and functional test suites on
  `typo3/testing-framework`, and one CI workflow (lint, CGL, PHPStan, unit on
  PHP 8.4 and 8.5, functional against MariaDB 10.11).
- Test coverage for the endpoint guard, the `?veFieldOptions=1` endpoint
  end to end (anonymous 401, missing/foreign/wrong-scope token 403, editor
  without write access 403, authorized 200), the `/visual-editor/save`
  override including the `NEW…` placeholder, the wizard parameter listener and
  the DataHandler payload validation.

### Removed

- `ext_emconf.php` — TYPO3 14.3 deprecates it for Composer packages, and this
  extension is distributed through Composer and Git only.
- Eleven PHPStan level-8 findings fixed rather than suppressed, among them a
  genuinely nullable `getTranslationSourceField()` and four `list<>` return
  types that were not lists.

### Fixed

- `is_array()` checks on `BackendUserAuthentication::$uc`, which has been a
  typed array since TYPO3 v13.

## 0.x

The 0.x line grew the three features from a first field chooser into what
1.0.0 stabilises.

- **0.2.0** — first public release: the field chooser popover for select and
  category fields, with a `?veFieldOptions=1` endpoint and page TSconfig.
  0.2.1–0.2.3 added an ICU-pluralised truncation note, a collapsible category
  tree delivering the full tree, and grouping of chooser fields under the
  backend form's own headings.
- **0.3.0** — tabs mode for the popover, generic context editing, and the
  hover chip.
- **0.4.0** — per-output scoped field buttons replaced the element chip; 0.4.1
  suppressed a second button inside link-edited buttons and raised the CKEditor
  toolbar's stacking layer.
- **0.5.0** — partial element refresh after a save: only the affected elements
  are re-fetched and swapped, instead of reloading the edit frame.
- **0.6.0** — dropped the code upstreamed in Visual Editor 1.8.0 and shared the
  remaining JS utilities. **0.7.1** restored the bundled Visual Editor fixes
  that move had removed too eagerly (the `NEW…`-capable save endpoint and the
  drop-zone/RTE patches).
- **0.7.0** — Content Blocks tables auto-enabled for the field chooser.
- **0.8.0** — the per-output button scopes to the hovered field's own
  attributes (its labeled palette, or its `<stem>_<suffix>` companions).
- After 0.8.0 — element library fixes: section spacing and scrolling, preview
  loading after filter changes, and a legible enlarged preview.

[1.0.0]: https://github.com/dirnbauer/typo3-visual-editor-enhancements/releases/tag/v1.0.0
