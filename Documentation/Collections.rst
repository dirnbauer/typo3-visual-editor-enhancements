.. _collections:

==================
Collection entries
==================

Enable **Edit collection entries** in User settings > Visual editor. This
preference is initially off and is independent of the field chooser's tabs,
sections and disabled modes. The labelled **Entries** action sits beside field
settings in the element toolbar and appears only for elements with collections.
It opens a compact panel at the right of the preview. Field settings keep their
own anchored panel, with a shortcut to each collection instead of a long list
of entry actions.

Click an entry's title to edit its text, media and other fields in TYPO3's
contextual editing form. The pencil marks this action; hidden entries have a
badge. Use **Add entry** below the list, or an entry's overflow menu for
**Item settings**, **Add after**, **Remove** and the full backend form. A
restriction is explained beside the relevant action. **Back** stays in the
same panel when navigating nested collections.

**Add entry**, **Add after** and **Remove** save immediately. Reset does not
undo these operations. Removal first asks for confirmation; Cancel, Escape
and dismissing the confirmation perform no writes. Core's modal delegates to
the backend window on the same origin. A native browser confirmation is the
fallback when that modal cannot be rendered.

Save or reset pending changes before structural actions or opening an entry's
contextual form. Invalid fields,
an active save in any language frame, an unknown editor state or an ongoing
collection request block the controls. The extension never triggers Save
itself, retries a failed creation automatically, or treats ``saveEnded`` as
proof that persistence succeeded. After a lost response, refresh before
trying again. A wrapper refresh never replaces pending local text.

.. _collections-visibility:

Visibility and backend forms
============================

Live creation requires a writable visibility field by default. Entries stay
hidden until an editor enables them explicitly in the backend form. Autosave
does not enable them. Tables without such a field use the backend fallback.
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
rows it could reach — the parent and its connected translations, every
inline and file relation of them and of their entries up to three levels,
and the entries' translations — and rolls back with ``workspaceLiveChange``
if a single byte differs.

**The first draft.** When the element has no draft in the workspace yet, the
first structural action makes Core create it: ``process_datamap`` versions the
parent together with all its relations (stock auto-versioning, the same path a
FormEngine save or a text edit in the visual editor takes). Core's versioning
renumbers the live entries' sorting values (``10, 30`` becomes ``1, 2`` — the
visible order stays) and stamps their ``tstamp``. Core's ``DataMapProcessor``
also pushes the change into connected translations, so a translated parent
without a draft gets its first draft — with the same bookkeeping on its live
entries — even when the default-language element already has one.

``firstVersion = 0`` (default) refuses these actions before any write with the
reason ``firstVersion``; open the element in the backend workspace first.
``firstVersion = 1`` allows them under a narrowed invariant, verified inside
the transaction: for each record that gets its first draft in this request,
only the sorting column of its relation members (renumbered consecutively, in
the same order) and their ``tstamp`` may change; records that already had a
draft, translations outside these relations, every content, owner, language,
visibility, deletion and PID column, the member sets and the order stay
byte-identical. Anything else rolls back with ``workspaceLiveChange``.
Relations deeper than three levels are refused (``workspace``).

These live ``tstamp`` changes are real writes. Caches, the reference index or
integrations that watch child tables (for example a Solr index queue or
webhooks) may react to them, as they do to the same bookkeeping of a backend
save. Stored sorting values are renumbered. Enable ``firstVersion`` where that
is acceptable.

Visibility and title changes are not structural: Core versions the entry alone
and needs no parent draft, whatever ``firstVersion`` says. Sync is refused in
workspaces (:ref:`collections-translations`). In the field payload,
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
        # 1: allow the first workspace draft (narrowed live-row invariant)
        firstVersion = 0
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
    *   -   ``labelField``, ``hiddenField``, ``typeField``
        -   The child's plain-text label column (empty for rich text or other
            types), its visibility column and, when present, the record type
            column that sends creation to the backend form.
    *   -   ``controls``
        -   ``appearance.enabledControls`` resolved with FormEngine's defaults:
            ``new``, ``delete``, ``hide``, ``sort``, ``dragdrop``, ``localize``,
            ``info``. A disabled control always reports the reason ``controls``.
    *   -   ``uids``, ``minItems``, ``maxItems``
        -   Current members (FormEngine identities) and limits; ``0`` = unlimited.
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
            exclude fields silently, so the eye is never offered where the write
            would vanish.
    *   -   ``canEditLabel``, ``labelReason``, ``labelValue``
        -   The same rule for ``labelField``; ``labelValue`` is the raw stored value.
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
the child's owner chain first. In a workspace Core versions the child alone, so
these edits need no parent draft.

The edit frame configuration (``window.visualEditorEnhancements``) adds
``collectionTypes`` — ``{tt_content: {<CType>: [field names]}}``, built from
TCA for the CTypes and child tables the editor may use and the relations this
API supports — so the toolbar can show *Entries* before any request, and
``workspaceTitle``. The index lists field names only; rights per record are
decided by the payload above.

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

A Core nonblocking relation lock is shared across workspace identities. The
server rereads ownership, access, limits and revision under that lock.
Conflicting or stale requests return HTTP 409. A successful response includes
the new UID, refreshed revisions and capabilities. Internal defaults and
command identities are removed from public payloads.

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
