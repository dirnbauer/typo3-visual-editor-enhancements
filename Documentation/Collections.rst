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
and the language of this frame. Each collection shows its count (``3 / 6``
when it has a maximum, a ``min`` hint when it is at its minimum).

Every entry is one row: its number, its **title** as a text field, state
badges and its actions. The actions are quiet until you point at or focus the
row (always visible on touch screens):

*   **Move up / Move down** - also :kbd:`Alt+↑` / :kbd:`Alt+↓` anywhere in
    the row. The status line announces the new position.
*   **Visible on the live site** (the switch) - shows or hides the entry.
*   **Add after** - adds a new entry right after this one.
*   **Remove** - also :kbd:`Delete` on a focused row button. Asks first; the
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
the focus returns to the button that opened it.

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
save your text."). An active save, invalid fields or a lost response block
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
configurations use backend forms. Deleting entries with media, nested
children or connected translations also uses the backend fallback until
cascade permissions are proven. Connected translated parents inherit their
structure; independent translations may manage their own entries.

Workspace writes currently require an existing parent draft and versioned
existing children. In Core 14.3.10 the initial automatic versioning path can
change live child sorting and timestamps. The extension refuses
that path before mutation. It does not fix Core's backend versioning itself.
Existing drafts support repeated add, discard of new entries and marking
existing entries for deletion. The endpoint additionally compares live rows
inside the transaction and rolls back if they change.

The existing vendor content-element delete path remains a separate issue:
this implementation adds confirmation and correct identities for collection
entries only.

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
        tables.feature_cards_items.enabled = 1
    }

Core TCAdefaults and safe scalar defaults supply new records. An empty text
label receives ``New entry``. Required files or unsupported defaults defer
to FormEngine; the API accepts no arbitrary initial field values.

.. _collections-api:

Server intent and concurrency
=============================

The authenticated ``visual_editor_save`` route accepts either a normal save
or one ``inlineRecord`` intent. Mixing intents with ``data`` or ``cmdArray``
is rejected. Create accepts parent table/UID, field, revision and an optional
``afterUid``. Delete accepts a ``childUid`` instead. The browser never sends
a child table, PID, language, workspace fields or a DataHandler map.

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
