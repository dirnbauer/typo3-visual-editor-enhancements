.. _collections:

==================
Collection entries
==================

Enable **Edit collection entries** in User settings > Visual editor. This
preference is initially off and is independent of the field chooser's tabs,
sections and disabled modes. Two buttons sit in the element's action bar of
every element with collections: **Entries** opens the entries inspector,
**Add entry** adds an entry at the end and puts the cursor into it on the
page.

.. _collections-inspector:

Entries inspector
=================

The inspector lists every collection of the element. At the top a context
line always says where you work: **Live site** or **Workspace draft «name»**,
and the language of this frame. Each collection shows its count: ``3 / 6``
when it has a maximum, ``3`` alone when it has none (a column without
``maxitems`` gets Core's internal 99999, which counts as no maximum), and a
``min`` hint when it is at its minimum.

Every entry is one row: its number, its **title** as a text field, state
badges and its actions. The actions are quiet until you point at or focus the
row (always visible on touch screens):

*   **Move up / Move down** - also :kbd:`Alt+↑` / :kbd:`Alt+↓` on the row's
    controls (not inside the title field, where these keys move the caret).
    The status line announces the new position.
*   **Visible on the live site** (the switch) - shows or hides the entry.
*   **Add after** - adds a new entry right after this one.
*   **Remove** - also :kbd:`Delete` on a focused row button (not inside the
    title field). Asks first; the
    question counts what goes with the entry ("Also removes 3 translations
    (Deutsch, 中文, Magyar)").
*   **More actions** - *Item settings* (the entry's own choice fields and
    nested collections), *Edit in form* (TYPO3's contextual form for media
    and rich text) and *Open backend form*.

Badges say what the page cannot: *Hidden*, *New in draft*, *Changed in
draft*, *Marked for deletion* (listed read-only) and *Unsaved* when the
title or visibility waits for Save. A refused action stays focusable; with
the keyboard on it the row shows why.

The inspector stays open while you work on the page - type into the new
entry, click another text. It closes with :kbd:`Escape`, its close button,
its button in the action bar or when you open another element's panel;
the focus returns to the button that opened it. That holds in every layout
after add, move and remove too, when the element is re-rendered and its
action bar replaced: the new **Entries** button reads as expanded and takes
the focus back. **Add entry** in the action bar opens the panel with the
element's **Entries** button as its opener, so the anchored layout scrolls
with the element. When the panel cannot load the element's entries (an
expired session, a removed record) **Entries** opens it with "Could not
load entries. Open the backend form." instead of doing nothing.

What saves when
---------------

*   **Add entry, Add after, Move and Remove save immediately.** Reset does
    not undo them. Cancel, Escape and dismissing the removal question write
    nothing.
*   **Titles and visibility save with the page**, exactly like text you type
    on the page: they are staged, show the *Unsaved* badge and are written
    by the next Save (or autosave). Typing in the title field changes the
    page text at once; :kbd:`Escape` in the field restores the stored title,
    :kbd:`Enter` leaves it. Switching visibility twice leaves nothing to
    save.
*   **Multi-line titles.** When the title column is a plain text area (TCA
    ``type=text``), or a stored title already contains a line break, the
    title field is a one-row text area that grows with its content:
    :kbd:`Shift+Enter` inserts a line break, :kbd:`Enter` leaves the field,
    :kbd:`Escape` restores. A stored ``<br>`` arrives as a line break, the
    way the page editable shows it, so opening the inspector never stages a
    change by itself.

On the page a hidden entry never looks live: its texts are dimmed, outlined
and titled "Hidden on the live site", following the switch at once (and
Reset and Save). The entry whose row has focus is outlined.

The pending rule
----------------

Staged text in *other* elements never blocks anything. An entry with staged
title or visibility holds only **its own Remove** ("Save this entry's text
first.") - adding, moving and removing other entries proceed. While the
element has staged changes the inspector shows **Save now**, which runs the
editor's own Save. A change made meanwhile is written and listed at once;
the page shows it after the next Save ("Saved. The page shows it after you
save your text."), also when everything that Save writes is text covered by
the page's own editables. An active save, invalid fields or a lost response block
every structural action until the state is clear; after a lost response,
refresh before trying again. A wrapper refresh never replaces pending local
text.

.. _collections-visibility:

Visibility and backend forms
============================

Live creation requires a writable visibility field by default. New entries
start hidden: show one with the visibility switch, then Save. Autosave does
not show them. Tables without such a field use the backend fallback.
An explicit site setting ``createHidden = 0`` permits immediate visibility.

**Item settings** opens the actual child's choice fields, including nested
collections. **Back** returns to its owning record. The surrounding content
element remains the refresh target. **Open backend form** handles rich text,
required media, complex required fields and optional fields absent from the
frontend template. Opening a form does not automatically save pending text.

.. _collections-support:

Supported relations and workspace boundary
=========================================

Supported relations use TCA ``type=inline`` with ``foreign_field``. The
server derives ``foreign_table_field``, ``foreign_match_fields``, sorting,
language and visibility from TCA. Shared child tables are isolated by their
owner, table discriminator and match fields. Min/max and disabled controls
are checked again before writing.

FAL, MM, selector/unique relations, child type selectors and special relation
configurations use backend forms. Deleting entries with media or nested
children also uses the backend fallback until those cascade permissions are
proven. Translations are described in :ref:`collections-translations`.

.. _collections-workspace:

Workspace boundary
------------------

Below an existing draft, every structural action (add, remove, reorder)
writes drafts only. Inside the transaction the endpoint compares the live
rows it could reach — the parent and every connected translation Core's
``DataMapProcessor`` reaches from it (via ``l10n_parent`` or
``l10n_source``, transitively: a Hungarian translation made from the German
one counts for the German one and for the default language), every inline and
file relation of them and of their entries up to three levels, and the
entries' translations — and rolls back with ``workspaceLiveChange`` if a
single byte differs. These translations are compared whether or not Core
synchronizes their table.

**The first draft.** When the element has no draft in the workspace yet, the
first structural action makes Core create it: ``process_datamap`` versions the
parent together with all its relations (stock auto-versioning, the same path a
FormEngine save or a text edit in the visual editor takes). Core's versioning
renumbers the live entries' sorting values (``10, 30`` becomes ``1, 2`` — the
visible order stays) and stamps their ``tstamp``. Core's ``DataMapProcessor``
also pushes the change into the translations Core synchronizes — connected
translations pointing at the record via ``l10n_parent`` or ``l10n_source``,
transitively, of a table that has an ``l10n_mode = exclude`` or an
``allowLanguageSynchronization`` column — so such a translation without a
draft gets its first draft, with the same bookkeeping on its live entries,
even when the element you act on already has one. That applies to the
default-language element and to a connected translation that is itself the
source of another translation. Translations of a table Core does not
synchronize (for example the child tables of Content Blocks collections) get
no draft this way, so an undrafted translation there neither refuses the
action nor is announced as a first draft.

``firstVersion = 1`` (default since 1.7.0) allows them under a narrowed
invariant, verified inside
the transaction: for each record that gets its first draft in this request,
only the sorting column of its relation members (renumbered consecutively, in
the same order) and their ``tstamp`` may change; records that already had a
draft, translations outside these relations, every content, owner, language,
visibility, deletion and PID column, the member sets and the order stay
byte-identical. Anything else rolls back with ``workspaceLiveChange``.
Relations deeper than three levels are refused (``workspace``).
``firstVersion = 0`` restores the refusal of 1.6: these actions are refused
before any write with the reason ``firstVersion``; open the element in the
backend workspace first.

These live ``tstamp`` changes are real writes. Caches, the reference index or
integrations that watch child tables (for example a Solr index queue or
webhooks) may react to them, as they do to the same bookkeeping of a backend
save. Stored sorting values are renumbered. Set ``firstVersion = 0`` where
that is not acceptable.

Visibility and title changes are not structural and need no parent draft.
For an entry without nested entries or media of its own Core versions the
entry alone, whatever ``firstVersion`` says. For a live entry that has live
nested inline or file members, Core versions the entry together with them,
renumbers their live ``sorting`` and stamps their ``tstamp`` — a first
version with live bookkeeping. So the visibility switch, the extension's own
control, follows ``firstVersion``: under ``0`` the payload refuses it
(``hideReason`` ``firstVersion``) and a staged save of the visibility column
is answered ``409 firstVersion``; under ``1`` Core versions the entry with
its nested members. The title stays editable either way: a title write is
the same write as a text edit on the page, an ordinary Visual Editor save
that Core versions as it always does (with the same renumbering of the
nested live members - Core behaviour that ``firstVersion`` does not govern).
Sync is refused in workspaces (:ref:`collections-translations`). In the field payload,
``workspace.firstVersion`` is true when the next structural action would
create a first draft; in an action's response, it is true when this action did.

The existing vendor content-element delete path remains a separate issue:
this implementation adds confirmation and correct identities for collection
entries only.

.. _collections-translations:

Translations
============

Collections follow FormEngine in every language. Each part has a page TSconfig
key that restores the 1.5 behaviour.

Connected translations (``translatedParents = parity``, default)
    A translated element whose structure also lives in the source language
    (``transOrigPointerField > 0``) can add entries that exist only in this
    language (``l10n_parent = 0``, the parent's language — what FormEngine's
    *+* creates) and remove, hide or reorder its translated entries. They carry
    ``translationOnly``. Core's synchronization keeps such entries anchored
    after the entry they follow, so after a sync the order follows the default
    language. ``translatedParents = default-only`` refuses structure changes
    on connected translations again (reason ``translation``). Free-mode
    translations (no pointer) always manage their own entries. Fields with
    ``l10n_mode = exclude`` stay refused.

    A collection column with ``behaviour.allowLanguageSynchronization``
    follows another language as long as the translation's ``l10n_state``
    for it is unset, ``parent`` or ``source``. Core then drops every list
    written on the translation and copies it from that language instead, so
    add, move and remove on the translation are refused with
    ``synchronized`` (409 for an intent): "This list follows the default or
    source language. Set the field to “Custom value” in the backend form to
    change it here." With ``custom`` the list is the translation's own and
    the parity rules above apply. For such a translated parent the sync
    preflight answers ``translation``; on translations the field chooser does
    not offer fields whose state follows another language; and the
    visibility or title column of a translated entry that follows another
    language this way answers ``translation``.

Removing default-language entries (``deleteTranslations = confirm``, default)
    Core removes an entry's translations with it (``deleteL10nOverlayRecords``;
    in a workspace it marks them for deletion). The endpoint allows this only
    when every active translation — not deleted, live or of this workspace,
    delete placeholders skipped — compiles for the editor (owner chain,
    language, page) and passes the delete access check, and none of them has
    nested inline or file children. ``cascade {translations, languages}``
    gives the counts for the confirmation. Otherwise the reason is
    ``translations``. ``deleteTranslations = refuse`` restores the 1.5 refusal,
    including the rule that one inaccessible translated parent makes the whole
    collection read-only.

Synchronizing (``syncTranslations = 1``, ``syncDefaultMode = localize``)
    On a default-language element, ``translationLanguages`` lists every
    connected translation of the parent: ``{id, title, parentUid, missing,
    orphaned, canSync, syncReason}``. The ``sync`` intent runs Core's
    ``inlineLocalizeSynchronize`` on the parent, the command FormEngine's
    *Localize* / *Synchronize* buttons issue:

    *   ``mode: localize`` adds the missing translations in default order; with
        ``ids`` (default entry uids) only those entries, as FormEngine's
        per-entry *Localize*.
    *   ``mode: synchronize`` also removes translations whose original no longer
        exists (``orphaned``). It is the destructive mode; the inspector asks
        before running it.

    Per language the editor must be able to edit the translated parent and its
    field and have the language; the result must stay within ``maxitems``
    (``max``, counted per mode — Core enforces no limit for these relations).
    A complete language reports ``syncNone``. Sync is refused in workspaces
    (``syncWorkspace``): Core writes the translated parent's live relation
    count and the live entries' sorting there. ``syncTranslations = 0``
    switches it off (``syncDisabled``); a disabled ``localize`` control reports
    ``controls``. Content Blocks never sets ``showSynchronizationLink``, so for
    such elements this goes beyond what the backend form offers.

Visibility stays per record: the eye on one language leaves the others as
they are (``hiddenPerLanguage``). Titles are per language by construction.

.. _collections-translations-inspector:

Translations in the inspector
-----------------------------

The context line names the frame's mode: *Default language · translated into
Deutsch, 中文, Magyar*, *Connected translation* or *Free translation*, with
*Visibility is per language* when translations exist - the switch on one
language leaves the others as they are.

*   On the default language a row missing in some translations says so
    (*Not translated here: Deutsch, Magyar*); its **More actions** menu offers
    *Localize to Deutsch* for exactly that entry.
*   **Sync translations ▾** in the collection's footer appears only when a
    language misses entries or has orphans. Its first items add the missing
    entries per language (``localize``, nothing is removed); below the
    separator **Synchronize** also removes entries that exist only in the
    translation and asks first, counted ("Adds 1 missing entries and removes 2
    entries that exist only in Magyar"). Both save immediately. In a workspace
    the button stays visible but unavailable, with its reason.
*   On a connected translation, entries added there carry *Only in this
    language*; after a sync the order follows the default language.
*   Removing a default-language entry names the translations that go with it
    ("Also removes 3 translations (Deutsch, 中文, Magyar)"); removing an entry
    of a connected translation says that only this language's entry goes.

.. _collections-workspaces-inspector:

Workspaces in the inspector
---------------------------

In a workspace the context line reads *Workspace draft «name»*, so a parked
workspace is never a surprise. Rows show *New in draft* and *Changed in
draft*; entries marked for deletion stay listed read-only with *Marked for
deletion* (undoing it is the Workspaces module's job for now). Removal says
that the deletion is staged until publication.

When the element has no draft yet, the next add, move or remove creates its
first draft. With ``firstVersion = 0`` these actions are refused up front:
the controls are unavailable and explain it ("Your first change to this
element would create a workspace draft; ..."), and the context line does not
promise a first draft. With ``firstVersion = 1`` (the default) the context line says that
the next add, move or remove creates the first draft; the action succeeds
and the status adds *Draft created. Core renumbered the stored order values;
the visible order is unchanged.* Titles are always editable. The visibility
switch is too, except on a live entry with nested entries or media of its
own under ``firstVersion = 0`` (see :ref:`collections-workspace`).

.. _collections-row-markers:

Row markers in templates
========================

The entries of a collection have no element of their own on the page - only
their texts do. A template can announce the root element of each entry with
``f:mark.item``, so the editor finds the whole row: a hidden entry is dimmed
and outlined from the first render (not only after the entries panel loaded
it), and the panel can highlight the row it is working on. One line per
loop - the item variable, and the collection field it came from:

..  code-block:: html
    :caption: Content Blocks template, HTML root element

    <f:for each="{data.cards}" as="card">
        <div class="card"{card -> f:mark.item(collection: 'cards')}>
            <f:render.text record="{card}" field="title" />
        </div>
    </f:for>

For a Fluid component that accepts an ``attributes`` array, use the array
format:

..  code-block:: html
    :caption: Component root element

    <f:for each="{data.cards}" as="card">
        <d:molecule.card attributes="{card -> f:mark.item(collection: 'cards', format: 'array')}">
            ...
        </d:molecule.card>
    </f:for>

In edit mode the ViewHelper writes ``data-ve-item="<table>:<uid>"`` (the uid
the entry's editables save to - its translation's or draft's uid when there
is one), ``data-ve-item-live="<uid>"``, ``data-ve-collection="<field>"`` and,
for a hidden entry, ``data-ve-item-hidden``. **Outside edit mode it renders
nothing**, so the published page is byte-identical with or without markers.
A field name that is not a collection (TCA ``type=inline``) holding the
entry's table throws a developer exception in edit mode.

When one entry is rendered by several loops (tab buttons and tab panels,
navigation and slides), mark each rendering: they are treated as one row,
and the rendering that contains editable text is the one the editor uses.
Nested collections work the same way; an entry belongs to the nearest
enclosing marked entry, or to the content element.

Without markers everything keeps working: hidden entries are dimmed through
their editable texts once the panel has loaded them, and there is no row
highlight. Markers add attributes only - the editor never inserts elements
into the page or guesses row boundaries from the layout.

.. _collections-limits:

What it does not do
===================

Honest limits of 1.6.1. Items marked 1.7 are planned; the rest follow from
how TYPO3 or the Visual Editor work.

..  list-table::
    :header-rows: 1
    :widths: 38 18 44

    *   -   Item
        -   Status
        -   Why
    *   -   Unsaved placeholder entries on the page (staged creation)
        -   not possible
        -   An entry's markup is the server-rendered template and an editable
            needs a stored uid. Adding is an immediate write; in live the new
            entry starts hidden.
    *   -   Row buttons directly on the page without template markers
        -   not possible
        -   Entries have no wrapper of their own and Content Blocks has no hook
            to add one; guessing rows from the layout is not done.
    *   -   On-page row toolbar and "add" ghost row, marker codemod for desiderio
        -   1.7
        -   ``f:mark.item`` ships now (:ref:`collections-row-markers`); the
            on-page layer will be a per-user option.
    *   -   Duplicate an entry
        -   1.7
        -   Core ``copy`` plus the parent's inline list, leaf entries only.
    *   -   Removing entries with nested entries or media
        -   1.7
        -   Refused (``cascade``) until a bounded preflight checks rights on
            every dependent record; use the backend form.
    *   -   Undo removal of a workspace delete placeholder
        -   1.7
        -   Listed read-only in the inspector; the Workspaces module discards it.
    *   -   Undo after a removal in live
        -   not offered
        -   Core's undelete is live-only and does not restore relations
            reliably; every removal asks first.
    *   -   Sync translations inside a workspace
        -   refused (``syncWorkspace``)
        -   Core writes the translated parent's live relation count and the
            live entries' sorting there.
    *   -   Hiding a default-language entry together with its translations
        -   not done
        -   Core hides per record; the inspector says "Visibility is per
            language".
    *   -   Required media or a child type selector when adding (gallery,
            logo cloud)
        -   backend form
        -   Named in the panel (``required``, ``requiredBackend``) with a link.
    *   -   First workspace draft by default
        -   ``firstVersion = 1`` since 1.7.0
        -   The owner's written decision (2026-11-08); ``firstVersion = 0``
            restores the refusal. Under ``0`` the visibility switch of a live
            entry with nested members is refused as well.
    *   -   Live ``tstamp`` writes under ``firstVersion = 1`` are harmless for
            every consumer
        -   cannot be proven
        -   They are real writes (Solr queue, reference index, webhooks may
            react), the same bookkeeping as a backend save of the element.
    *   -   Refusal ``stage`` (element in review)
        -   Core behaviour
        -   Core 14.3 lets every workspace member edit at any stage:
            DataHandler checks only ``workspaceCheckStageForCurrent(0)`` and
            resets an edited version to stage 0. The reason is not emitted.
    *   -   Drag-and-drop reordering
        -   deferred
        -   Move up/down and Alt+Arrow cover it; the ``move`` intent already
            takes any ``afterUid``.
    *   -   One-click Add entry for elements with several collections
        -   one extra click
        -   The bar opens the inspector at the first collection's Add button.
    *   -   Entries without any editable text on the page
        -   panel only
        -   No page dimming or focus target; the badge is the indicator.
    *   -   Core's form sheet reloads the whole module when closed
        -   Core behaviour
        -   Now needed only for media and complex fields.

.. _collections-configuration:

Configuration
=============

The install flag ``inlineRecordsEnabled`` defaults to true; the user's
``tx_visualeditor_inlineRecords`` preference defaults to false. Page
configuration can restrict it further:

.. code-block:: typoscript
    :caption: Page TSconfig for collection controls

    tx_visualeditorenhancements.inlineRecords {
        enabled = 1
        createHidden = 1
        requireWorkspace = 0
        # parity | default-only (1.5)
        translatedParents = parity
        # confirm | refuse (1.5)
        deleteTranslations = confirm
        syncTranslations = 1
        # localize | synchronize: the inspector's default sync mode
        syncDefaultMode = localize
        # 1 (default since 1.7.0): allow the first workspace draft under the
        # narrowed live-row invariant; 0 refuses it (reason firstVersion)
        firstVersion = 1
        tables.feature_cards_items.enabled = 1
    }

Core TCAdefaults and safe scalar defaults supply new records. An empty text
label receives ``New entry``. Required files or unsupported defaults defer
to FormEngine; the API accepts no arbitrary initial field values.

.. _collections-payload:

Capability payload
==================

The field options response (``?veFieldOptions=1``) lists each collection as a
field of ``type: inline``. The server computes every capability; the browser
renders it and never derives rights itself. A refused control carries a
reason key (``frontend.inlineRecords.<reason>``).

.. list-table:: Collection (field) keys
    :header-rows: 1
    :widths: 25 75

    *   -   Key
        -   Meaning
    *   -   ``name``, ``label``, ``parentTable``, ``parentUid``, ``revision``
        -   Identity of the relation and the opaque revision every intent echoes.
    *   -   ``childTitle``
        -   Translated title of the child table, for "Add …" labels.
    *   -   ``labelField``, ``labelMultiline``, ``hiddenField``, ``typeField``
        -   The child's plain-text label column (empty for rich text or other
            types), whether that column is a plain text area (TCA
            ``type=text``; the inspector then edits titles in a multi-line
            field), its visibility column and, when present, the record type
            column that sends creation to the backend form.
    *   -   ``controls``
        -   ``appearance.enabledControls`` resolved with FormEngine's defaults:
            ``new``, ``delete``, ``hide``, ``sort``, ``dragdrop``, ``localize``,
            ``info``. A disabled control always reports the reason ``controls``.
    *   -   ``uids``, ``minItems``, ``maxItems``
        -   Current members (FormEngine identities) and limits; ``0`` = unlimited.
            A column without ``maxitems`` resolves to Core's 99999, and any
            value of 99999 or more is published as ``0``; create's ``max``
            refusal and the sync preflight's ``max`` use the same rule.
    *   -   ``canSort``, ``sortReason``
        -   Whether entries can be reordered: ``unsorted`` when the child table
            has no sorting column, ``controls`` when the field disables both
            sort controls and drag and drop.
    *   -   ``canCreate``, ``createReason``, ``createHidden``, ``requiredBackend``
        -   Whether *Add entry* works here, why not, whether live creations start
            hidden and which required fields need the backend form.
    *   -   ``workspace``
        -   ``{id, title, firstVersion}``. ``firstVersion`` is true when the next
            structural action would create the first draft of the parent or of a
            listed child in this workspace.
    *   -   ``languageId``, ``translationMode``
        -   Language of the parent and ``default``, ``connected`` (a translation
            whose structure also lives in the source language) or ``free``.
    *   -   ``translationLanguages``, ``canSync``, ``syncReason``, ``syncDefaultMode``
        -   Per connected translation of a default-language parent: what a sync
            would add or remove and whether it is allowed; see
            :ref:`collections-translations`.
    *   -   ``hiddenPerLanguage``
        -   Translations exist, so the eye affects one language only.
    *   -   ``children``
        -   One entry per child, see below.

.. list-table:: Entry (child) keys
    :header-rows: 1
    :widths: 25 75

    *   -   Key
        -   Meaning
    *   -   ``uid``, ``table``, ``liveUid``
        -   The identity editables carry (translated or draft uid) and the live
            uid for display and joins. ``liveUid`` is never accepted by an intent.
    *   -   ``state``
        -   ``live``, ``new`` (created in this workspace), ``modified`` (has a
            draft here) or ``deleted`` (a delete placeholder of this workspace,
            listed read-only under its live uid; not a member of ``uids``).
    *   -   ``label``, ``hidden``
        -   Record title and current visibility.
    *   -   ``canHide``, ``hideReason``
        -   The visibility column exists, the editor may write it (not an
            exclude field, or the ``non_exclude_fields`` right), the ``hide``
            control is enabled and the owner chain compiled. DataHandler drops
            exclude fields - and, for non-admins, columns with ``displayCond =
            HIDE_FOR_NON_ADMINS`` - silently, so the eye is never offered where
            the write would vanish (``rights``; such a visibility column makes
            creation report ``hidden``). In a workspace the eye of a live entry
            with live nested members reports ``firstVersion`` under
            ``firstVersion = 0`` (:ref:`collections-workspace`).
    *   -   ``canEditLabel``, ``labelReason``, ``labelValue``
        -   The same rule for ``labelField`` (no ``firstVersion`` rule: a title
            is an ordinary text save). ``labelValue`` is the stored value seeded
            the way the page editable seeds it: a stored ``<br>`` becomes a line
            break, so the inspector and the editable share one baseline.
    *   -   ``translationOnly``, ``untranslated``
        -   In a connected translation: the row exists only in this language. In
            the default language: languages with a translated parent but no
            translation of this row.
    *   -   ``canMoveUp``, ``canMoveDown``
        -   Reordering is possible and the entry is not already first or last.
    *   -   ``canDelete``, ``deleteReason``, ``verb``, ``cascade``
        -   Removal capability, the Core verb — ``delete`` (live),
            ``markForDeletion`` (workspace) or ``discard`` (new in this
            workspace) — and ``{translations, languages}`` removed with it.

Visibility and title are no intents. The inspector stages them in the vendor
store and the ordinary Save persists them; the generic save guard authorizes
the child's owner chain first. In a workspace these edits need no parent
draft. Core versions a leaf child alone; a live child with live nested members
is versioned with them (their live sorting renumbered, their ``tstamp``
stamped), so with collection editing on and ``firstVersion = 0`` the guard
answers a staged write of the visibility column ``409 firstVersion``, the
same refusal the payload shows. Text columns, the title included, are saved
as always.

The default-language delete check in the payload is the record-level part:
refuse mode, nested children, and the delete access check of the entry and
of every active translation. The full compile of each translation (owner
chain, page) runs when the delete executes, under the lock, for the removed
entry only. A Remove the payload offered can therefore be answered ``409
translations``; the returned collection marks that entry.

The edit frame configuration (``window.visualEditorEnhancements``) adds
``collectionTypes`` — ``{tt_content: {<CType>: [field names]}}``, built from
TCA for the CTypes and child tables the editor may use and the relations this
API supports — so the toolbar can show *Entries* before any request, and
``workspaceTitle``. The index lists field names only; rights per record are
decided by the payload above. An empty index is sent as ``{}``, also when the
feature is off for this user or page, so nothing is discovered on hover; a
missing key (``null``) means an older server, for which the client falls back
to discovering collections on hover.

.. _collections-reasons:

Refusal reasons
---------------

Every reason key has a sentence ``frontend.inlineRecords.<reason>`` in
English and German. A refused intent is answered with the same key, HTTP 409
unless noted.

.. list-table:: Reason keys
    :header-rows: 1
    :widths: 25 75

    *   -   Key
        -   When
    *   -   ``rights``
        -   The editor may not write the relation, the entry or the column
            (exclude field, ``HIDE_FOR_NON_ADMINS``, ``readOnly``). HTTP 403
            when the parent itself cannot be opened.
    *   -   ``language``
        -   The editor lacks the language.
    *   -   ``controls``
        -   The action is disabled in ``appearance.enabledControls``.
    *   -   ``unsorted``
        -   The child table has no sorting column.
    *   -   ``min``, ``max``
        -   The collection is at its minimum or maximum (``0`` = no maximum).
    *   -   ``hidden``, ``required``
        -   Creation needs a writable visibility field; required media or
            complex fields need the backend form (``requiredBackend``).
    *   -   ``label``
        -   The title column is not plain text.
    *   -   ``cascade``
        -   The entry has nested entries or media; removal uses the backend form.
    *   -   ``translations``
        -   A translation that goes with the entry cannot be removed by this
            editor, or ``deleteTranslations = refuse``. Also returned at click
            time when the cascade proof fails.
    *   -   ``translation``
        -   Structure of a connected translation under ``translatedParents =
            default-only``, a field with ``l10n_mode = exclude``, a translated
            entry column that follows another language, or a sync of a
            translated parent whose list Core synchronizes.
    *   -   ``synchronized``
        -   Add, move or remove on a connected translation whose collection
            column has ``allowLanguageSynchronization`` and whose
            ``l10n_state`` for it is unset, ``parent`` or ``source``
            (:ref:`collections-translations`). New in 1.6.1.
    *   -   ``firstVersion``
        -   The action would create the first workspace draft of the element
            or of a translation Core synchronizes, or the eye of a live entry
            with nested members would version them, and ``firstVersion = 0``.
    *   -   ``workspace``, ``workspaceLiveChange``
        -   The relation cannot be versioned safely here (for example deeper
            than three levels); Core attempted to change live data and the
            transaction was rolled back.
    *   -   ``syncNone``, ``syncWorkspace``, ``syncDisabled``
        -   Nothing to sync; sync is not available in a workspace; sync is
            switched off for the site.
    *   -   ``unsupported``, ``connection``, ``disabled``
        -   A relation configuration this endpoint does not reproduce; a
            relation across database connections; collection actions are
            disabled for the table by page TSconfig.
    *   -   ``deleted``
        -   The entry is a delete placeholder of this workspace (read-only).
    *   -   ``busy``, ``stale``, ``membership``, ``record``, ``token``
        -   Another entry operation holds the lock; the collection changed
            since it was loaded; the entry no longer belongs to it; the record
            is gone; the editor session expired.

``stage`` is not emitted. Core 14.3 has no closed editing stage for workspace
members (DataHandler checks only ``workspaceCheckStageForCurrent(0)`` and
resets an edited version to stage 0), so an element in review stays
editable, as it is in the backend form. The sentence for it remains in the
catalogue unused.

.. _collections-api:

Server intent and concurrency
=============================

The authenticated ``visual_editor_save`` route accepts either a normal save
or one ``inlineRecord`` intent. Mixing intents with ``data`` or ``cmdArray``
is rejected. Every intent carries ``action``, ``parentTable``, ``parentUid``,
``field`` and ``revision``; each action allows exactly these further keys
(anything else is HTTP 400 before a record is read):

.. list-table:: Intent keys per action
    :header-rows: 1
    :widths: 15 40 45

    *   -   Action
        -   Keys
        -   Core mechanism
    *   -   ``create``
        -   ``afterUid`` (optional, a member)
        -   Parent inline list with one NEW child; Core writes owner, match
            fields and sorting.
    *   -   ``delete``
        -   ``childUid``
        -   Parent list without the child plus Core ``delete`` (live), delete
            placeholder (workspace) or discard (new draft).
    *   -   ``sync``
        -   ``language`` (1–65535), ``mode`` (``localize`` or ``synchronize``),
            ``ids`` (optional, localize only: default entry uids)
        -   Core ``inlineLocalizeSynchronize`` on the default-language parent;
            see :ref:`collections-translations`.
    *   -   ``move``
        -   ``childUid``, ``afterUid`` (a member, or ``null`` for the first
            position; the key is required)
        -   The parent list in the new order, as FormEngine posts after sorting;
            ``RelationHandler::writeForeignField`` renumbers the members' sorting.
            An unchanged order is a successful no-op without writes.

The browser never sends a child table, PID, sorting, language, workspace
fields, live uids or a DataHandler map. A ``childUid``, ``afterUid`` or ``ids``
entry that is not a current member (or not missing in that language) returns HTTP 409 ``stale``. Like a FormEngine save, a
reorder updates the parent's ``tstamp`` and translation diff source (Core
bookkeeping) and the renumbered entries' ``sorting`` and ``tstamp``; in a
workspace only drafts are renumbered.

A Core nonblocking relation lock, ``vee-inline:<table>:<live uid>:<field>``,
is shared across workspace identities. The server rereads ownership, access,
limits and revision under that lock. A sync, a removal that cascades to
translations, and every action on a column with
``allowLanguageSynchronization`` also write translated parents' lists; they
additionally take the lock of each translated parent they write
(``vee-inline:<table>:<translated live uid>:<field>``, sorted, released in
``finally``) - the key a parity action on that translation takes, so the two
exclude each other. Conflicting or stale requests return HTTP 409 (``busy``,
``stale``). A successful response includes the new UID, refreshed revisions
and capabilities. Internal defaults and command identities are removed from
public payloads.

Outside the locks remain the writes Core makes on other columns: a
default-language write stamps the translated element row itself (``tstamp``,
``l18n_diffsource``).

One scoped DataHandler instance executes the operation using stock Core
relation handling and compiled draft child identities. Datamap errors stop
command processing. Supported parent/child writes use one connection
and a transaction, with rollback on failure. This does not make arbitrary
third-party hooks, cache invalidation or external side effects transactional.
Backend extensions do not necessarily share this endpoint's relation lock.

Generic saves cannot reassign inline relationships, ownership or workspace
fields, create custom collection children or issue direct child commands.
Ordinary editable child values and root element-library creation/copy remain
available. No synchronization command is added.

Nested parents are authorized through their stored owning relations, up to a
bounded depth. Ambiguous, cyclic, inaccessible or overridden child contexts
require the backend form. ``overrideChildTca`` is deliberately unsupported
until all defaults and existing-child discovery share that inline context.
Nested paste command updates receive the same ownership checks as ordinary
field updates before any mutation. Stale/permission refusals refresh choices
without retrying a write; uncertain failures require a page refresh.
