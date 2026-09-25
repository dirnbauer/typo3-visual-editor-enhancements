:navigation-title: Compatibility

..  include:: /Includes.rst.txt
..  _compatibility:

=============
Compatibility
=============

This package sits close to the Visual Editor's own runtime, so every release
of it is audited against a concrete upstream version. 1.2.0, 1.3.0 and
1.3.1 are audited against **friendsoftypo3/visual-editor 1.10.3** (21 September 2026), the newest
published version at release time; the test suites run against it.

1.10.3 changes one file, :file:`Classes/Middleware/EditModeMiddleware.php`:
edit mode keeps the preview simulator's decision about hidden pages and
scheduled records instead of resetting it, so hidden pages - and content
sliding below them - render correctly in the editor. No JavaScript,
stylesheet or save path changed, so every verdict below still holds. The
constraint stays ``^1.10.2``; a project should require ``^1.10.3`` for the
fix itself.

..  _compatibility-audit:

Feature audit against 1.10.3
============================

..  list-table::
    :header-rows: 1
    :widths: 26 12 62

    *   -   Feature
        -   Verdict
        -   Reasoning

    *   -   RTE toolbar placement
        -   Keep
        -   1.10.0 ("Prevent editable text style collisions", PR #122) only
            scoped :file:`editable.css` selectors. At 1.10.3
            :file:`ve-editable-rich-text.js` still has no toolbar placement
            logic at all, and :file:`editable.css` still pins the toolbar to
            ``bottom: 100%; left: 0`` with no viewport handling and no
            clipping escape. Since 1.3.1 the patch keeps the toolbar inside
            the viewport on all four sides - above, below or over the
            editable, shifted sideways as needed; the geometry is
            :file:`Shared/toolbar-placement.js`. It self-detects (it looks
            for ``ve-toolbar-below`` in upstream's ``firstUpdated``) and
            turns itself off the day upstream ships this.

    *   -   CKEditor style overrides
        -   Rewrite
        -   Rescoped under ``ve-editable-rich-text`` to follow PR #122's
            intent, so the rules no longer reach a CKEditor the Visual Editor
            did not mount. Balloon and dropdown panels stay unscoped on
            purpose - CKEditor appends those to ``<body>``.

    *   -   Drop-zone ``tx_container_parent``
        -   Dropped
        -   1.10.3 :file:`ve-drop-zone.js` still writes
            ``tx_container_parent`` for any integer value, including 0. Rather
            than keep patching upstream's drop zone for that, the library's own
            drop handler
            (:file:`components/ve-element-library/drop-target.js`) builds the
            payload itself and sets the field only for a real container column.
            Upstream's own drag and drop is left exactly as it is.

    *   -   ``/visual-editor/save`` override
        -   Keep
        -   1.10.3 ``DataHandlerService::validateData()`` still requires
            ``is_int($uid)``, so a ``NEW…`` placeholder is rejected - and a
            library drop is exactly that. A functional test covers the
            placeholder path, so the day upstream accepts it the override can
            be deleted with evidence.

    *   -   ``f:render.link`` ViewHelper
        -   Rewrite
        -   Up to 0.8.0 the class was autoloaded into
            ``TYPO3\CMS\VisualEditor\ViewHelpers\Render\`` through a second
            PSR-4 entry. It now lives in this extension's own namespace, which
            :file:`ext_localconf.php` appends to the ``f`` Fluid namespace.
            Fluid resolves namespace entries in reverse registration order, so
            ``f:render.link`` keeps working and a future upstream
            ``LinkViewHelper`` no longer collides silently.

    *   -   Plain-text editable workaround
        -   Delete
        -   There is none left to carry. Rendering a ``Textarea`` field as
            inline-editable plain text is a template pattern built on Core and
            Visual Editor ViewHelpers, and 1.10.2 (PR #130) additionally makes
            ``f:render.text`` render rich text in backend requests through
            ``f:sanitize.html`` plus ``f:transform.html``. Nothing in this
            package works around either.

    *   -   Element library FAB and action-bar buttons
        -   Keep
        -   Additive DOM only: the button is a custom element appended to
            ``<body>``, the action-bar entries are appended into the Visual
            Editor's shadow root and re-applied by one wrapped
            ``VeContentElement.updated``. The 1.10.0 extension point governs
            the *URL of the core wizard*; it cannot host a floating button, so
            it does not replace this.

    *   -   New content wizard URL
        -   Rewrite
        -   Adopted onto the 1.10.0 extension point
            (``ModifyNewContentElementWizardUrlParameterEvent``): page TSconfig
            under ``tx_visualeditorenhancements.newContentWizard.parameters``
            is merged into the wizard parameters, so no JavaScript ever has to
            rewrite ``veInfo.newContentUrl``. See
            :ref:`configuration-wizard`.

    *   -   ``?veFieldOptions=1`` endpoint
        -   Rewrite
        -   One explicit gate (``EditSessionGuard``): backend login, the
            Visual Editor request token in ``X-Request-Token``, and
            ``tables_modify`` on the requested table - 401 for the first, 403
            for the rest, and no database read before it passes. Previously an
            unknown table was reported before authentication ran, which made
            the endpoint a TCA probe.

    *   -   Preview iframes and cHash (1.9.1)
        -   Keep, verified
        -   PR #118 changed how the *backend module* builds the iframe URL for
            a translated page (``PageEditController``); this package does not
            build that URL. Library preview URLs are signed by the catalog
            provider with their own ``cHash``, which is unaffected.

    *   -   CKEditor and CSP (1.9.1)
        -   Keep, verified
        -   PR #117 forces ``useNonce = true`` in edit mode, because CKEditor
            does not work under hash-based policies. The inline configuration
            this extension emits already uses ``['useNonce' => true]``, so it
            is nonce-covered under the policy the Visual Editor installs.

    *   -   Page visibility in language headers (1.9.0)
        -   No impact
        -   Backend module chrome this package does not touch.

    *   -   Hidden pages in edit mode (1.10.3)
        -   No impact
        -   Changes which records the page renders in edit mode, not the
            scripts or the save path this package builds on. The element
            refresh re-fetches the page in edit mode and simply receives the
            same, now correct, rendering.

    *   -   Editor chrome theme
        -   New in 1.2.0
        -   The Visual Editor paints its own action bar in fixed colours and
            has no theming hook for extensions. This package's chrome takes
            the backend's resolved design tokens over its own message pair
            (``requestTheme``/``veTheme``, see :ref:`developer-theme`), so
            nothing upstream is patched for it.

    *   -   Toolbar switches
        -   New in 1.3.0
        -   1.10.3 ``PageEditController`` adds the autosave toggle whenever
            EXT:workspaces is installed and the view-mode menu whenever the
            page has translations, with no setting for either. Both end up in
            Core's button bar - the toggle as the ``GenericButton`` tagged
            ``ve-auto-save-toggle``, the menu as the ``DropDownButton`` Core
            builds from the doc-header menu registry - so Core's
            ``ModifyButtonBarEvent`` removes them without a patch. The
            single-language pin relies on the module reading ``viewMode``
            from its ``ModuleData`` (``1`` = single language since the view
            was introduced). Should upstream grow a setting of its own, this
            listener becomes redundant and can go.

..  _compatibility-not-here:

What lives elsewhere
====================

The element library's server side - the catalog at ``?elementLibrary=1``, the
ranked search at ``?elementLibrarySearch=``, the cached catalog metadata and
the cacheable preview rendering at ``?elPreview=`` - is **not** part of this
extension. It belongs to a catalog provider, because the element inventory,
the demo records and the preview page type are site-specific.
:ref:`developer-catalog` documents the contract a provider has to answer.

..  _compatibility-versions:

Version support
===============

..  list-table::
    :header-rows: 1

    *   -   This extension
        -   TYPO3
        -   PHP
        -   Visual Editor

    *   -   1.2.x, 1.3.x
        -   14.3.7+
        -   8.4, 8.5
        -   1.10.2+ (audited: 1.10.3)

    *   -   1.0.x, 1.1.x
        -   14.3.7+
        -   8.4+
        -   1.10.2+

    *   -   0.6 - 0.8
        -   14.3+
        -   8.3+
        -   1.8+

Upgrading from 0.8 requires no configuration change. The only externally
visible move is the ``f:render.link`` ViewHelper's PHP namespace, which
templates never reference by class name.

Upgrading from 1.2 requires no configuration change: the two toolbar keys
(:ref:`configuration-toolbar`) default to on, so the toolbar looks as before
until a page TSconfig switches something off.

Upgrading from 1.1 requires no configuration change. The chrome now draws
its colours from the backend (see :ref:`developer-theme`); a site stylesheet
or script that set ``--ve-accent-color`` on the edit frame has no effect any
more, and the ``requestAccent``/``veAccent`` messages were replaced by
``requestTheme``/``veTheme``.

Upgrading from 1.0 requires no configuration change either. Site JavaScript
that read the legacy keys ``elementLibraryLinks`` or ``fieldChooserEnabled``
from ``window.visualEditorEnhancements`` has to read ``editableLinksEnabled``
and ``fieldChooserMode`` instead; both legacy aliases were removed in 1.1.0.
