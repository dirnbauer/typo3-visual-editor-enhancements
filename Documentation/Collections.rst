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
