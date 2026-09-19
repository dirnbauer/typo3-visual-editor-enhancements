:navigation-title: Developer

..  include:: /Includes.rst.txt
..  _developer:

=========
Developer
=========

..  contents::
    :local:

..  _developer-endpoints:

Endpoints
=========

Two, both owned by this extension.

..  _developer-field-options:

``?veFieldOptions=1`` (frontend middleware)
-------------------------------------------

Returns one record's editable choice fields as JSON.

..  code-block:: none

    GET /<page>?veFieldOptions=1&editMode=1&table=tt_content&uid=42
    X-Request-Token: <window.veInfo.token>

Every request passes ``EditSessionGuard`` first:

#.  a backend user is logged in - the Context aspect *and* the real user
    object,
#.  ``X-Request-Token`` validates against the backend form protection in the
    Visual Editor's own ``visual_editor`` / ``save`` scope, so a plain
    authenticated tab or a cross-site request riding the session cookie is not
    enough,
#.  that user has ``tables_modify`` on the requested table.

``401`` for the first, ``403`` for the others, always
``Cache-Control: private, no-store``, and nothing is read from the database
before the guard passed - an unknown table is refused exactly like a known one
so the endpoint cannot be used to probe the TCA.

After the guard the page's ``fieldChooser`` TSconfig and the Visual Editor's
own per-field permission checks decide what is in the payload:

..  code-block:: json

    {
      "table": "tt_content",
      "uid": 42,
      "recordType": "textmedia",
      "fieldGroups": {"header": "Header", "layout": "Appearance"},
      "fieldPalettes": {"header": "header", "layout": ""},
      "fields": [
        {"name": "header_layout", "label": "Type", "type": "select",
         "value": "0", "items": [{"value": "0", "label": "Default"}],
         "group": "Header", "tab": "General"}
      ]
    }

``type`` is one of ``select``, ``category``, ``link``, ``check`` or ``color``.
``fieldGroups`` and ``fieldPalettes`` cover every field of the record type's
``showitem``, not only the ones in ``fields``, so a client can resolve the form
section of any editable output.

..  _developer-save:

``/visual-editor/save`` (backend AJAX route)
--------------------------------------------

Re-registers the Visual Editor's own route onto an overriding controller and
``DataHandlerService`` that accept ``NEW…`` record placeholders in addition to
integer uids - see :ref:`compatibility-audit`. Access is inherited from the
``web_edit`` module. Payload validation is otherwise identical to upstream:
only ``data`` and ``cmdArray``, only TCA columns (plus ``pid`` on new
records), only ``move`` / ``copy`` / ``delete`` commands.

..  _developer-catalog:

The element library catalog contract
====================================

The panel is a client. A *catalog provider* extension answers three requests
on the site's own frontend, all of them for an authenticated editor carrying
``X-Request-Token``:

..  confval-menu::
    :display: table
    :type:

    ..  confval:: ?elementLibrary=1
        :type: JSON

        The catalog: ``{"elements": [...], "categories": [...]}``. Each
        element carries ``cType``, ``title``, ``description``, ``group``,
        ``keywords[]``, ``synonyms[]``, ``iconUrl``, ``previewUrl`` and
        ``demoUid`` - the uid of a seeded demo record, or 0.

    ..  confval:: ?elementLibrarySearch=<term>
        :type: JSON

        A ranked result: ``{"matches": [{"cType": "..."}], "suggestions":
        [...], "didYouMean": "..."}``. ``matches`` is already ordered; the
        panel reproduces that order. Any failure degrades to the panel's own
        substring filter, so this endpoint is optional.

    ..  confval:: previewUrl
        :type: URL

        A frontend URL rendering that one element standalone, signed with a
        ``cHash`` and cacheable in an edit session - see
        :ref:`configuration-previews`.

Dropping a card stages a DataHandler operation directly: ``copy`` of
``demoUid`` when the catalog offers one (so the element lands pre-filled like
its preview), otherwise a ``NEW…`` record of that ``cType``. Both go through
the Visual Editor's ``useDataHandler`` and the save endpoint above.

..  _developer-events:

Events
======

``ModifyNewContentElementWizardUrlParameterEvent`` (Visual Editor 1.10.0) is
listened to by ``NewContentWizardParameterListener``, which merges page
TSconfig into the wizard parameters (:ref:`configuration-wizard`). Register
your own listener after it if you need to react to the result.

..  _developer-configuration-pipeline:

How a feature is switched on
============================

Three layers decide it, and all three have to agree:

#.  the install-wide flag in
    ``$GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']``,
    read by ``Service\FeatureFlags`` (everything defaults to on),
#.  the backend user's own setting from the *Visual editor* tab of User
    settings, stored in ``be_users.uc``,
#.  for the field chooser, the page TSconfig of the edited page, resolved by
    ``Service\FieldChooserConfigurationService``.

``Service\FrontendConfiguration`` combines them into the object that
``EditModeEnhancementsMiddleware`` inlines as
``window.visualEditorEnhancements``; the JavaScript side reads it through
:file:`Shared/config.js` and never looks at anything else. A module evaluated
outside edit mode finds no object and degrades to "everything off".

..  _developer-javascript:

JavaScript
==========

Dependency-free ES modules under :file:`Resources/Public/JavaScript/`, no
build step, mirroring how the Visual Editor ships its own. They are exposed
through the import map as ``@webconsulting/visual-editor-enhancements/…`` by
:file:`Configuration/JavaScriptModules.php`, which maps the whole directory
with a single trailing-slash prefix entry - a new file needs no registration.

..  important::

    Because the import map carries only the prefix, every specifier must name
    the file **with its** :file:`.js` **suffix**
    (``…/Shared/config.js``, not ``…/Shared/config``). A suffix-less
    specifier resolves to a URL that does not exist and the module silently
    fails to load.

Layout:

..  code-block:: none

    Backend/index.js              backend-frame bridge: link browser modal,
                                  notifications, accent color
    Frontend/index.js             edit-frame entry point and injection sweep
    Frontend/components/          <ve-element-library>, <ve-field-chooser>,
                                  <ve-editable-link>, <ve-context-chip>, …
    Frontend/components/ve-element-library/
                                  panel internals: constants, filter, search,
                                  drag-ghost, drop-target, preview-frame,
                                  preview-loader, styles
    Frontend/components/ve-field-chooser/
                                  popover internals: related-fields, styles
    Frontend/visual-editor-patches.js
                                  the self-detecting upstream patches
    Shared/                       config, DOM helpers, icons, caches,
                                  overflow-clipping

The component files stay browsable on purpose: the panel and the popover both
keep their Lit component in one file and push everything that does not touch
the render tree - ranking, filtering, drag geometry, preview throttling, the
stylesheet - into the sibling directory next to it. Those modules import no
Lit, which is what makes them unit-testable under plain Node.

Anything the extension does to the Visual Editor's own runtime lives in
:file:`Frontend/visual-editor-patches.js` and nowhere else, and each patch
starts by checking whether upstream already has the fix.

A swapped-in element after a save dispatches a bubbling
``ve:element-refreshed`` ``CustomEvent``; site JavaScript that needs to
re-initialize behaviour on a re-rendered element should listen for it.

..  _developer-tests:

Tests and quality
=================

..  code-block:: bash

    composer install
    composer cgl:check       # typo3/coding-standards, dry run
    composer phpstan         # level 8, no baseline
    composer test:unit
    composer test:js         # node --test, no dependencies
    composer test:functional # sqlite by default

Functional tests use ``typo3/testing-framework``; CI additionally runs them
against MariaDB 10.11 by setting the usual ``typo3Database*`` environment
variables.

:file:`Tests/JavaScript/` covers the Lit-free modules - the search client, the
fallback filter, the ``?veFieldOptions`` cache and the reader of
``window.visualEditorEnhancements`` - with the Node test runner, so it needs
neither a browser nor an :file:`npm install`.

:file:`Tests/E2E/` holds a Playwright suite that drives a **running** TYPO3
installation through the whole editor surface: the FAB, the ranked search and
its suggestions, the cached previews, the field chooser with ``select`` and
``category`` fields, the rich-text toolbar near the top of the viewport and
the plain-text editables. It is not part of CI - see
:file:`Tests/E2E/README.md` for the four environment variables it needs.
