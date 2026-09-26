# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] — 2026-09-26

### Changed

- **The rich-text toolbar is CKEditor's InlineEditor toolbar.** The Visual
  Editor mounts a ClassicEditor and only simulates an inline toolbar with
  CSS. 1.3.2 gives the ClassicEditor the real thing, built from CKEditor's
  own classes the way CKEditor 47.6's InlineEditor does it: the toolbar
  moves into a `BalloonPanelView` in the editor's body collection, is shown
  while the editor has focus and is pinned to the editable - above it when
  there is room, at the top of the viewport while a long text is scrolled
  past its top, below it otherwise - and is as wide as the editable, 8px
  away from its focus outline. CKEditor follows scrolling and resizing, and
  living in `<body>` the panel is never clipped by an `overflow: hidden`
  ancestor.
- The toolbar is set up when a rich-text field first gets focus, no longer
  by wrapping the component's `firstUpdated`. This module and the Visual
  Editor's load in no fixed order; in about one page load in five theirs
  came first and no field on the page got the patch. Fields that never get
  the balloon keep the Visual Editor's own toolbar.
- The placement code of 1.3.0 and 1.3.1 is gone: `Shared/toolbar-placement.js`
  and its test, the lifted `overflow: hidden` for rich-text fields, the
  toolbar classes and custom properties in `editable-overrides.css`. Its
  content-sized toolbar was what ran past the right edge of a row's last
  card and collapsed to a few pixels on a long text scrolled past its top.
  Checked with the real CKEditor 47.6, with TYPO3's wrapping toolbar and
  with CKEditor's grouping one.
- `composer test:e2e` runs the Playwright suite with its own config, the
  only way the `setup` project signs in. The specs fail at once with a
  clear message when there is no backend session or no password, instead of
  timing out on the login form. The toolbar specs run on their own page
  (`VEE_RTE_PAGE_ID`), check every edge of the viewport, the right-hand
  card of a row and a long text, and require every button to be clickable.

## [1.3.1] — 2026-09-25

### Fixed

- **The rich-text toolbar stays inside the viewport.** The Visual Editor
  pins the CKEditor toolbar above the editable, anchored to its left edge;
  in the right-hand card of a row it ran past the right edge of the edit
  frame, so the last groups of buttons could not be reached, and a toolbar
  flipped below an editable near the bottom vanished below the fold. The
  toolbar now goes above the editable when there is room, below it when
  there is not, and over its first lines when the editable fills the
  viewport; it is shifted sideways so it ends inside the viewport, wraps
  before it can outgrow it, and keeps a 10px gap to the editable's box. It
  is placed again on scroll and resize, and when its own size changes. The
  geometry is `Shared/toolbar-placement.js`, covered by Node tests.

## [1.3.0] — 2026-09-25

### Added

- **Toolbar switches.** Page TSconfig takes two controls out of the
  *Web > Edit* toolbar the Visual Editor has no setting for:
  `tx_visualeditorenhancements.toolbar.viewModeSelector = 0` removes the
  single/multi-language view switch and keeps the module in its
  single-language view (also for a user who had switched to the
  multi-language view before), `tx_visualeditorenhancements.toolbar.autoSave
  = 0` removes the autosave toggle, and with it every automatic save. Both
  default to on. Done through Core's `ModifyButtonBarEvent`
  (`PageEditToolbarListener`) and a small backend middleware
  (`PageEditViewModeMiddleware`), nothing upstream patched.

### Changed

- The "is this the Visual Editor module" check moved from the backend
  assets middleware into `Service\PageEditModuleRequest`, shared by the
  listener and both backend middlewares.

## [1.2.1] — 2026-09-25

### Fixed

- The element library's "+" button no longer moves when the panel opens.
  It slid 6px down and 2px left while turning into the "x"; now only the
  icon moves. It grows a little under the pointer, turns with a spring
  that overshoots and settles, and the button dips in place while
  pressed. With reduced motion the icon still turns, without the rest.

## [1.2.0] — 2026-09-23

Audited against `friendsoftypo3/visual-editor` **1.10.3** (21 September 2026).
1.10.3 only changes how edit mode treats hidden pages; no script, stylesheet
or save path this package builds on changed, and the self-detecting rich-text
toolbar patch is still needed. The constraint stays `^1.10.2`.

### Added

- **Theme bridge.** The backend frame resolves 19 of its design tokens -
  surfaces, text, borders, primary, danger, shadows, radius, font, theme and
  colour scheme included - and hands the computed values to the edit frame
  (`requestTheme` → `veTheme`, `Shared/theme-bridge.js`); it sends them again
  when the backend's theme or colour scheme changes while the editor is open.
  `Shared/theme.js` turns them into the `--ve-*` tokens every component styles
  against, with CSS system colours as the fallback. The frontend
  configuration carries the backend user's colour scheme
  (`window.visualEditorEnhancements.colorScheme`) for the first paint.
- JavaScript tests for the bridge (token resolution, scheme detection, the
  allow-list applied in the edit frame) and the colour scheme setting.

### Changed

- **The editor chrome looks like the TYPO3 backend.** Element library, field
  chooser, library button, context chip, link button and both drag images use
  the backend's surfaces, radius, font, shadows and form controls, the field
  chooser's tabs are drawn like nav-tabs, and the primary colour is reserved
  for the active filter, the selection and the floating buttons. There is no
  hard-coded colour left. Dark mode follows the backend (it followed the
  site's `.dark` class, and only in Chromium); the field chooser had no dark
  mode at all.
- Accessibility: the library panel is a labelled dialog with a labelled search
  field, toggle-button category filters (`aria-pressed`), a live result count
  and status/alert states; the enlarged preview is a modal dialog that takes
  and returns focus; the field chooser takes focus when it opens and returns
  it to its trigger on Escape or close, and announces pending changes; the
  library button reports `aria-expanded`. Focus rings use the primary text
  colour, which keeps its contrast on the dark surfaces.
- PHP 8.4 idioms: typed class constants, `new Foo()->bar()`, a readonly
  anonymous class, `#[\Override]` everywhere it applies (PHPStan enforces it),
  and a `FieldChooserMode` enum for the `tabs`/`sections`/`disabled` setting.
- Development: PHPUnit ^13.3 (configs use `recordTestRunHistory`),
  typo3/coding-standards ^0.9 (applied), testing-framework ^9.7, PHPStan ^2.2,
  Playwright ^1.63. CI runs unit and functional tests on PHP 8.4 **and** 8.5
  (8.5 was informational), adds `composer audit`, and uses
  actions/checkout and setup-node v7 and ramsey/composer-install v4.
  `.gitattributes` keeps development files out of the Composer archive.

### Removed

- The `requestAccent`/`veAccent` messages and the `--ve-accent-color`
  property; the theme bridge replaces them.
- Nine unused labels of the removed demo-content switch and the old layout
  options.

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
