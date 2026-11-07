# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Rebuild the entries panel as the **Entries inspector**: every row shows
  its actions (move up/down, visibility switch, add after, remove, a
  `role=menu` overflow menu with item settings, the contextual form and the
  backend form), quiet at rest and full on row hover or focus. Titles are
  edited in the row and staged through the Visual Editor's store like the
  editor's own texts (Escape restores, Enter leaves); visibility is a
  staged `role=switch`, saved with the page. Rows carry state badges, a
  context line names live or the workspace draft and the language, and
  refused actions stay focusable with `aria-disabled` and their reason.
  Alt+Arrow moves an entry, Delete removes it after the counted Core modal.
- The inspector stays open while the editor works on the page; it closes on
  Escape, its close button or its trigger.
- Staged changes no longer block entry actions everywhere: only the row
  with staged text waits before Remove, the element refresh is skipped only
  when the element's own records have staged data, and **Save now** runs the
  editor's own save (`doSave`). Active saves, invalid fields and uncertain
  writes still block every structural action.
- Hidden entries are dimmed and outlined on the page (`data-ve-entry-hidden`)
  and follow the staged visibility at once.

- Give every action-bar button - the Visual Editor's own and ours - a very
  small text label that appears only on hover, keyboard focus or click. One
  shared constructable stylesheet is adopted into each element's shadow root;
  the labels are generated content of the existing buttons, so the vendor
  template is not patched. The visible text is the accessible name or a word
  contained in it ("Edit", "Delete"; German "Bearbeiten", "Löschen").
- Add the user setting *Action bar labels*
  (`tx_visualeditor_actionLabels`): `caption` (default; a reserved 14 px row,
  11 px text, the bar never changes size), `inline`, `stacked` (10 px) or
  `icons` (the previous look). Touch screens show the inline labels.
- Add an **Add entry** button to the action bar: one click adds an entry at
  the end of the element's collection, refreshes the element, opens the
  entries panel and puts the cursor into the new entry on the page; with
  several collections it opens the panel at the first collection's add
  button. Entries and Add entry render from the first paint when the server
  sends the collection index (`collectionTypes`) instead of after a hover
  request; rights are still decided on click, after which a refused button
  stays focusable with `aria-disabled` and its reason.
- Shorten our own button names to "Library", "Settings", "Entries" and
  "Add entry" (the long sentences remain tooltips in `icons` mode); the
  Entries button uses Core's `actions-list-alternative` icon and loses its
  permanent text. Only the two panel openers keep `aria-haspopup`.
- Add the `f:mark.item` ViewHelper: templates mark the root element of a
  collection entry (`{card -> f:mark.item(collection: 'cards')}`, or
  `format: 'array'` for a component's `attributes`). In edit mode it writes
  `data-ve-item`, `data-ve-item-live`, `data-ve-collection` and
  `data-ve-item-hidden`; outside edit mode it renders nothing. Hidden marked
  entries are dimmed and outlined from the first render; the new
  `Frontend/collection-rows.js` groups markers per collection and parent
  (nested collections, entries rendered by several loops), joins them to the
  entries panel by uid, then live uid, and provides the mirror-highlight
  hooks for the panel.
- Publish a capability payload for collection entries: resolved
  `enabledControls`, child title, label/visibility/type fields, per-entry state
  (live, new, modified, deleted), live uid, `canHide` and `canEditLabel` with
  reasons, translation mode and badges (`translationOnly`, `untranslated`),
  workspace `{id, title, firstVersion}` and the fields that need the backend
  form. Delete placeholders are listed read-only instead of being skipped.
- In a workspace, collections whose entries have no drafts yet are listed (so
  visibility and title edits work); structural actions still refuse.
- Add `collectionTypes` and `workspaceTitle` to the edit-frame configuration
  (`CollectionFieldIndex`), memoize record compiles within one read pass and
  split collection writes into per-action operations.
- Add the `move` intent (`childUid`, `afterUid` or `null`): the parent's inline
  list in the new order, renumbered by Core like a FormEngine sort. Members are
  checked against the compiled list (409 `stale`), an unchanged order is a
  no-op, and `canSort`/`sortReason` (`unsorted`, `controls`) plus per-entry
  `canMoveUp`/`canMoveDown` are published. Intents are validated with a
  per-action key table; `collectionIntent(field, action, options)` builds
  only the documented keys.
- **Behaviour change:** connected translated parents follow FormEngine
  (`translatedParents = parity`): translation-only entries, and removal, hiding
  and reordering of translated entries. Restore 1.5 with
  `translatedParents = default-only`.
- **Behaviour change:** removing a default-language entry cascades to its
  translations (Core `deleteL10nOverlayRecords`, placeholders in a workspace)
  when every active translation compiles for the editor and passes the delete
  access check; the payload carries `cascade {translations, languages}` for the
  confirmation. Restore 1.5 with `deleteTranslations = refuse`.
- Add the `sync` intent (`language`, `mode` localize|synchronize, `ids` for
  single entries): Core `inlineLocalizeSynchronize`, with a per-language
  preflight (`translationLanguages` with missing/orphaned counts, rights,
  language access, `maxitems`), refused in workspaces (`syncWorkspace`).
  TSconfig `syncTranslations`, `syncDefaultMode`.
- Add TSconfig `firstVersion` (default `0`): with `1`, the first structural
  action in a workspace creates the element's first draft through Core's
  stock auto-versioning, under a narrowed live-row invariant verified in the
  transaction (only the members' sorting, renumbered in the same order, and
  their `tstamp` may change for records versioned for the first time). With
  `0`, such actions are refused up front with the reason `firstVersion`.
  These live `tstamp` writes are real; caches or integrations watching child
  tables may react to them.
- **Behaviour change (stricter):** the workspace live-row check now covers
  connected translations and nested relations up to three levels. Core's
  DataMapProcessor creates a translated parent's first draft when the
  default-language element changes, and its versioning bookkeeping stamps the
  live translated entries; 1.5 did not detect this. Such actions now report
  `firstVersion` (refused under `firstVersion = 0`) instead of writing live
  timestamps.
- Pin the 2026-11-05 review findings 1–4 for the new intents and staged
  writes: client-sent `inlineLocalizeSynchronize`/`copy`/`discard` and other
  child commands, nested paste updates, NEW owned children, inline-to-
  `tt_content` relations, `overrideChildTca`, unknown intent keys and nested
  ancestors without root rights stay refused without any write.

## [1.5.1] — 2026-11-06

- Fix field settings breaking after opening collection entries. Both toolbar
  actions now use Core's versioned import-map URLs, sharing one component and
  one field-options cache.
- Replace the bare plus with a labelled Entries action beside field settings.
  Show it only on elements with collections and open a compact panel at the
  right of the preview.
- Make entry titles open TYPO3's contextual editing form. Add hidden badges,
  one add button and a compact per-entry menu for settings, insertion and
  removal. Keep collection shortcuts in field settings.
- Keep nested navigation in place, restore trigger focus, fix pointer toggling
  and show accurate save hints. Add regression coverage with versioned imports
  and real toolbar interactions.

## [1.5.0] — 2026-11-05

- Validate nested paste updates before mutation, authorize stored collection
  ancestors for reads/writes and keep normal content-element placement compatible.
- Refuse inline child overrides through a backend fallback; ignore inactive
  translations when determining safe leaf deletion. Retain strict workspace
  live-byte preservation using stock Core relation handling.
- Complete German operational labels and real Core modal delegation; restore
  focus after cancellation and allow recovery from definitive stale refusals.

- Resolve field choices from the actual workspace record, full FormEngine
  dependencies and resolved type, with stable tab identities and unavailable
  stored selections.
- Add independent opt-in collection controls, server-owned create/delete
  intents, ownership/revision/limit guards, locking, rollback and generic-save
  bypass protection. Live creations stay hidden until explicitly enabled.
- Confirm collection removal with the Core modal and block structural actions
  while editor changes or an uncertain request are pending.
- Add functional fixtures and browser component coverage. Initial automatic
  workspace versioning remains unsupported because Core 14.3.10 changes live
  child metadata; use existing drafts.

## [1.4.4] — 2026-10-25

### Fixed

- **Group names in the element library show as written.** The category
  filter title-cased every word (`text-transform: capitalize`), so
  "Büro und Notizen" read "Büro Und Notizen" and "iOS-Apps" read
  "IOS-Apps". The panel now shows each group exactly as the catalog
  provider sends it; Desiderio 4.25.1 sends its groups by their registered
  titles instead of their keys.
- A remembered category filter that the catalog does not offer - a group of
  another site, or one a provider has renamed - is dropped when the panel
  loads. Before, it emptied the list and left no chip to unselect.

## 1.4.3 — 2026-10-23

- Update the E2E browser test runner to Playwright 1.64.1.

## [1.4.2] — 2026-10-11

### Fixed

- Keep button links on the editing page when selected, including translated
  labels without an editable text field and keyboard activation.

- Initialize frontend editing after the page configuration has been parsed.
  Cached asynchronous module entrypoints could start before `window.veInfo`
  existed, leaving button labels and other inline fields unresponsive.
- Preserve the stored typolink value when opening the link picker for a
  transformed TYPO3 record, including the destination, target, class and title.

## [1.4.1] — 2026-10-10

### Fixed

- **Category titles in the language being edited.** On a translated record
  the field chooser listed the default-language titles. It now shows each
  category's translation in the record's language, falls back along the
  site language's fallback chain and then to the default title, and sorts
  siblings by the title shown - the tree is sorted by title. Values stay the
  default-language uids, as in the backend form. Titles are resolved with
  `PageRepository::getLanguageOverlay()` ("mixed" overlay), as the frontend
  resolves them.

## [1.4.0] — 2026-10-10

### Fixed

- **The field chooser offers what the backend form offers - nothing more.**
  Its payload was assembled by hand and ignored most of what shapes the
  backend edit form. It is now built by the FormEngine data providers
  themselves (`FormDataCompiler` with `TcaDatabaseRecord`), so:
  - the **category tree** is the backend's tree (`TcaSelectTreeAjaxFieldData`,
    as `FormSelectTreeAjaxController` loads it): default-language and
    all-languages categories only. Before, every `sys_category` row of every
    language was listed - each category once per translation. It also honours
    `treeConfig.startingPoints` from TCA, `TCEFORM` and site settings, and the
    user's category mounts;
  - fields the form hides are no longer offered: `TCEFORM.<table>.<field>.disabled`
    (the lab disables `tt_content.categories`, `layout`, `space_*` and more
    on every site - the chooser showed them all), failing `displayCond`,
    `config.readOnly` from TSconfig, select/category fields without any
    selectable item, and on translated records `l10n_mode = exclude` and
    `l10n_display = defaultAsReadonly`;
  - labels and items are the form's: `TCEFORM` `label` overrides, `authMode`,
    and the "invalid value" item for a stored value that is no longer among
    the items (the select showed the first item instead).
- The endpoint answers 403 when the backend form would refuse the record (for
  example no content-edit permission on its page) and 404 for a record
  deleted in the current workspace.

### Changed

- Category tree nodes the tree configuration makes unselectable
  (`nonSelectableLevels`) are shown as structure, without a checkbox.

## [1.3.5] — 2026-10-10

### Fixed

- **Rich-text fields work again on TYPO3 14.3.8.** 14.3.8 upgrades to
  CKEditor 48, which no longer injects its styles from JavaScript; they ship
  in `EXT:rte_ckeditor/Resources/Public/Css/editor.css`, and only the
  backend form loaded that file. In the edit frame every rich-text field
  showed "Rich Text Editor" above its text and the toolbar fell, unstyled,
  to the end of the page. The edit frame now loads the file, before this
  package's overrides and the Visual Editor's `editable.css`. A field looks
  exactly as it did on 14.3.7; only CKEditor 48's redrawn toolbar icons
  differ. A new `@rte` end-to-end test checks both symptoms.

## [1.3.4] — 2026-09-26

### Changed

- **The rich-text toolbar always shows the same four buttons.** Bold,
  italic, link and bulleted list are always in the row, whatever the
  field's width; every other button of the RTE preset is behind "Show more
  items" (⋮), in configuration order. A button the preset does not configure
  is left out, never added. The group is CKEditor's standard nested toolbar
  group (`{label, icon: 'threeVerticalDots', items}`), so its menu opens on
  the side that fits like every CKEditor dropdown. The row is about 190px
  wide, so it fits even narrow cards; the width cap and the grouped-dropdown
  override of 1.3.3 are gone. The item list lives in
  `Shared/floating-toolbar-items.js`, covered by Node tests.

## [1.3.3] — 2026-09-26

### Changed

- **The rich-text toolbar is one row.** The buttons that do not fit the
  field's width go into CKEditor's "Show more items" (⋮) menu instead of
  wrapping into further rows - CKEditor's default, and how its InlineEditor
  behaves. The floating toolbar is built the way the InlineEditor builds its
  own (a floating `ToolbarView` with grouping on, filled from the editor's
  toolbar configuration and registered with `addToolbar()` for focus and
  Alt+F10): the ClassicEditor's toolbar, which TYPO3 configures to wrap,
  cannot switch to grouping once built. The backend's form editor keeps its
  wrapping toolbar.
- The "Show more items" menu opens on the side that fits the viewport
  (`panelPosition: 'auto'`, CKEditor's default for every other dropdown);
  ToolbarView pins it to open leftwards, which ran off-screen for a field at
  the left edge.

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
