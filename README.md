# Visual Editor Enhancements

TYPO3 extension that enhances the [friendsoftypo3/visual-editor](https://github.com/FriendsOfTYPO3/visual-editor)
frontend editing experience:

- **Element library** — a searchable, drag-and-drop library of content elements with live previews.
- **Editable links** — inline link icons that open the TYPO3 link browser for pure TCA `type=link` fields.
- **Field chooser** — a per-element "Field settings" popover for select and category fields.
- Editor UI bridges (accent color, RTE toolbar and drop-zone patches).

## Requirements

- TYPO3 14.3+
- PHP 8.3+
- `friendsoftypo3/visual-editor` ^1.8

## Installation

```bash
composer require webconsulting/visual-editor-enhancements
```

## Field chooser

While editing a page in the visual editor, every content element whose table is enabled
gets an extra "Edit field settings" button in its action bar. It opens a small popover
listing the record's *choice* fields — static single-value selects (e.g. `layout`,
`frame_class`) and category trees — as reported by the
`?veFieldOptions=1&editMode=1&table=<table>&uid=<uid>` JSON endpoint. Changes are staged
on the visual editor's pending change list and written only with the next explicit save;
reverting a field to its original value clears the pending change again.

### Enabling / disabling

Three independent switches, all enabled by default:

1. **Extension configuration**: `fieldChooserEnabled` (also `elementLibraryEnabled`,
   `editableLinksEnabled`).
2. **User settings**: the "Show the ‘Field settings’ button" toggle
   (`tx_visualeditor_showFieldChooser`) on the *Visual editor* tab of the backend
   user setup module.
3. **Page TSconfig** (see below).

### Page TSconfig reference

```typoscript
tx_visualeditorenhancements.fieldChooser {
  # Master switch for the current page (default: 1)
  enabled = 1

  tables {
    # tt_content is enabled by default with auto-detected fields
    tt_content {
      enabled = 1

      # "*" (default) auto-detects fields, or use an explicit comma list
      fields = *

      # Always subtracted, from both auto-detected and explicit lists
      excludeFields = layout

      # Per record type (CType) override, wins over the table-level "fields"
      types {
        textmedia {
          fields = frame_class, space_before_class
        }
      }
    }

    # Every other table is disabled unless explicitly enabled
    tx_news_domain_model_news {
      enabled = 1
    }
  }
}
```

### Auto-detection rules (`fields = *`)

Included are TCA fields of the record type's schema that are either

- static single-value selects (`renderType = selectSingle`, no `foreign_table`,
  not `multiple`, `maxitems` ≤ 1), or
- category fields (`type = category`).

Excluded are the record-type field (e.g. `CType`), `colPos`, `sorting` (and the
table's `sortby` field), the language/`transOrigPointerField`/`translationSource`
fields, `readOnly` fields, and relation selects (`foreign_table`). Explicit `fields`
lists win over auto-detection (unknown field names are ignored), `excludeFields`
always subtracts, and a matching `types.<recordType>.fields` list wins over the
table-level `fields`.

Field visibility additionally respects the visual editor's own per-field permission
checks (table/language access, web mounts, readOnly), and select item lists honor
`TCEFORM.` TSconfig (`keepItems`, `addItems`, `removeItems`, `altLabels`) as well as
`itemsProcFunc`/`itemsProcessors`.

## How it works / notes

- **`LinkViewHelper` override.** This package intentionally autoloads
  `TYPO3\CMS\VisualEditor\ViewHelpers\Render\` from
  `Classes/VisualEditor/ViewHelpers/Render/` (see the `autoload.psr-4` map in
  `composer.json`) to override the upstream `LinkViewHelper` and add the editable
  link button. This is load-bearing and tied to `friendsoftypo3/visual-editor` ^1.8;
  a major upstream release may require revisiting it.
- **Field-chooser endpoint security.** The `?veFieldOptions=1` JSON endpoint is a
  frontend middleware that only answers for a logged-in backend user presenting the
  visual editor request token (`window.veInfo.token`, scope `visual_editor/save`) in
  the `X-Request-Token` header, re-validates table/field access server-side through
  the visual editor's own permission checks, and sends `Cache-Control: private,
  no-store`. Changes are staged on the visual editor's pending-change list and written
  through its existing save flow (core `DataHandler`); no separate write path is added.
- **Editor UI patches** (RTE toolbar placement, container drop-zone handling) are
  applied at runtime from `Frontend/visual-editor-patches.js` instead of as Composer
  patches, so no `cweagans/composer-patches` entry is required.

## License

GPL-2.0-or-later, see [LICENSE](LICENSE).
