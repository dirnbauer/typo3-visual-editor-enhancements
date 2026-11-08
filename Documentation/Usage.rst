:navigation-title: Usage

..  include:: /Includes.rst.txt
..  _usage:

=====
Usage
=====

Everything below happens inside :guilabel:`Web > Edit`, on the page itself.

..  _usage-library:

Adding an element from the library
==================================

#.  Open the round button in the top right of the editing canvas, or use the
    library button on any element's action bar.
#.  Filter by category chip, or type into the search box. The search is
    typo-tolerant and server-side; a misspelling is answered with a "did you
    mean" suggestion, and the panel falls back to a plain substring match if
    the catalog endpoint is unreachable.
#.  Hover a card to enlarge its preview. In one-column mode the preview is
    docked beside the list instead.
#.  Drag the card - or the enlarged preview - onto one of the drop zones the
    Visual Editor shows. The panel slides out of the way while you drag.

The element is created immediately (the drop is a save), a notification
confirms it, and the frame reloads. Elements you reached for are remembered
under *Recently used*.

..  _usage-field-chooser:

Changing an element's settings
==============================

Two ways in:

*   The :guilabel:`Settings` button on the element's action bar
    opens the full popover: every choice field of that record, grouped like
    the backend form.
*   Hovering an editable text or rich-text output shows a small floating
    button that opens the same popover scoped to that field's own attributes.
    A field with no attributes of its own shows no button, and a
    :guilabel:`Show all field settings` link in the footer always expands to
    the full list.

Changes are staged, not saved: they join the Visual Editor's pending-change
list and are written by its normal save. Setting a field back to its original
value removes the pending change again. After a save the affected elements are
re-fetched and swapped in place, so a changed layout or frame is visible
without losing the scroll position or any other element's editor state.

..  _usage-action-bar-labels:

Action bar labels
=================

Every button of an element's action bar - the Visual Editor's own
(:guilabel:`Edit`, :guilabel:`Show`, :guilabel:`Delete`, :guilabel:`Add`)
and this extension's (:guilabel:`Library`, :guilabel:`Settings`,
:guilabel:`Entries`, :guilabel:`Add entry`) - has a name in very small text.
How it appears is a personal choice,
:confval:`tx_visualeditor_actionLabels` in :guilabel:`User settings >
Visual editor > Action bar labels`:

``caption`` (default)
    The bar keeps its icons. Below them a narrow row is always reserved;
    the name of the button under the pointer, the button that has keyboard
    focus, or the button you clicked appears there in 11 px text. The bar
    never changes size while you move across it, and the name stays while
    the pointer is anywhere inside the bar - also on the name itself.
    Leaving the element clears it.

``inline``
    Every button shows its name beside its icon whenever the bar is shown.
    The bar becomes wider once, when it appears.

``stacked``
    Every button shows its name, 10 px, under its icon whenever the bar is
    shown.

``icons``
    The Visual Editor's look: icons only, with the browser's tooltips.

The visible text is always the button's accessible name or a word contained
in it: the Visual Editor's buttons show "Edit", "Show", "Delete" and "Add"
(German "Bearbeiten", "Anzeigen", "Löschen", "Hinzufügen") only because
those words are part of their names ("Edit content element", ...); in a
language where they are not, the full name shows. Screen readers announce
the same names as before.

On a touch screen there is no hover, so ``caption`` behaves like ``inline``
there. With "reduce motion" the names appear without a fade.

Not offered, on purpose: a mode that shows every name only while the pointer
is over the bar. The bar has no reserved width, so growing it under the
pointer would move the button the pointer is on and start a loop. The
Visual Editor's own buttons still show the browser's native tooltip after a
second next to the caption; that tooltip comes from the Visual Editor's
template and is left alone.

..  _usage-add-entry:

Adding an entry from the action bar
===================================

With :confval:`tx_visualeditor_inlineRecords` on, an element with a
collection (feature cards, FAQ items, table rows, ...) shows two more
buttons from the moment the page is shown: :guilabel:`Entries` opens the
entries panel, :guilabel:`Add entry` adds one entry at the end and puts the
cursor into its first text on the page. A new entry on the live site starts
hidden, exactly like an entry added in the panel.

When the element has several collections, :guilabel:`Add entry` opens the
panel with the first collection's :guilabel:`Add entry` button focused, so
you choose the collection with one more click. When you may not add an entry
(the collection is full, the field is read-only for you, ...), the button
stays visible and focusable but is marked unavailable, and its tooltip says
why.

..  _usage-entries-layout:

Where the entries panel lives
=============================

:confval:`tx_visualeditor_entriesLayout` (User settings > Visual editor >
Entries panel) chooses where the entries inspector opens. All three show the
same rows and actions; only the place differs:

``inspector`` (default)
    Docked at the right edge of the preview, the full height available. The
    page stays visible and clickable beside it.

``tray``
    At the bottom, full width, at most 42 % of the height. The rows become a
    compact table (number, title, state, actions). Best when the language
    frames are shown side by side and the right edge is taken.

``anchored``
    A 480 px panel directly under the element's action bar. It scrolls with
    the element, so the entries stay next to what they change.

On a narrow screen every layout uses the full width. The panel never closes
by itself while you work on the page; see :ref:`collections-inspector`.

..  _usage-entries-rows:

Working with the rows
---------------------

*   Each collection's heading shows how many entries it has: ``3 / 6`` when
    it has a maximum, ``3`` alone when it has none.
*   Type a title in its row; :kbd:`Enter` leaves the field, :kbd:`Escape`
    restores the stored title. A title that may span several lines (a text
    area in the backend form) gets a field that grows with its text:
    :kbd:`Shift+Enter` starts a new line there.
*   :kbd:`Alt+↑` / :kbd:`Alt+↓` move an entry and :kbd:`Delete` removes it
    while the focus is on one of the row's buttons. Inside the title field
    these keys edit the text as usual.
*   After adding, moving or removing an entry the panel stays open and
    :kbd:`Escape` returns the focus to the element's :guilabel:`Entries`
    button.
*   If the entries cannot be loaded - usually because the editing session
    expired - :guilabel:`Entries` opens the panel with "Could not load
    entries. Open the backend form."; reload the page.
*   :guilabel:`More actions` > :guilabel:`Duplicate` copies an entry right
    below itself (since 1.7.0). On the live site the copy starts hidden like
    a new entry. Entries with nested entries or media, and entries of a
    connected translation, keep the item unavailable with the reason.
*   In a workspace, an entry you removed stays listed as *Marked for
    deletion* with :guilabel:`Undo removal` (since 1.7.0). Undoing drops the
    entry's draft in this workspace: it returns as it is on the live site.
*   :guilabel:`Remove` asks first and counts what goes with the entry:
    translations, nested entries and image references ("Also removes 2
    nested entries, 1 image reference. The files stay in the file list.").
    When the site's limits refuse it, the button stays unavailable and says
    which limit (too deep, too many records, no right to remove a nested
    entry, or switched off).

..  _usage-entries-on-page:

Entries on the page
===================

:confval:`tx_visualeditor_collectionRows` (User settings > Visual editor >
Entries on the page, since 1.7.0) adds controls right on the page, for
templates that mark their entries (:ref:`collections-row-markers`):

``panel`` (default)
    Nothing on the page; entries are changed in the entries panel.

``appender``
    While you point at an element or work in it, a dashed
    :guilabel:`Add feature card` button sits after the last entry of each
    collection (before the first, :guilabel:`Add feature card at the start`,
    when the collection's backend form puts its "Create new" link at the
    top). It adds an entry and puts the cursor into it. At the maximum it
    stays visible, marked unavailable with the reason.

``rows``
    The add button, plus a small toolbar above the entry you point at or
    type in: :guilabel:`Move up`, :guilabel:`Move down`, :guilabel:`Visible
    on the live site`, :guilabel:`Add after`, :guilabel:`Remove`,
    :guilabel:`Duplicate` and :guilabel:`Item settings` - the same actions,
    reasons and confirmations as in the panel. Its buttons show their names
    the way the action bar does (:ref:`usage-action-bar-labels`). A short
    note under it says what an action did.

The toolbar is for the pointer. The keyboard never lands in it by
:kbd:`Tab` - :kbd:`Tab` moves on through the page as before - and
:kbd:`Escape` inside it returns the cursor to the entry. Every action stays
available in the entries panel, which is the way for the keyboard and for
screen readers.

Entries of templates without markers get neither the toolbar nor the add
button. The toolbar follows its entry when the page scrolls or a slider
moves, and steps aside while the entry is outside the window or hidden by
the slider.

..  _usage-links:

Editing a link
==============

A ``type=link`` field rendered with ``f:render.link`` shows a floating chain
icon next to its link or button as soon as that area has focus or the pointer
is over it. The icon opens the TYPO3 link browser in a modal; the chosen
typolink is staged like any other change.

The link text itself stays a normal inline edit when the template renders it
with ``f:render.text``.

..  _usage-rte:

Rich text
=========

The Visual Editor edits rich text with CKEditor's ClassicEditor and shows
its toolbar floating above the field. This extension gives it the toolbar of
CKEditor's own InlineEditor instead: one short row - bold, italic, link and
bulleted list, always, and "Show more items" (⋮) with every other button of
the RTE preset - in a balloon panel that CKEditor pins to the field - above when there is room, at the top of
the viewport while a long text is scrolled past its top, below otherwise. The
panel lives in ``<body>``, so an ``overflow: hidden`` ancestor - which
nearly every card, teaser or slider has - cannot clip it, and it never ends
up off-screen.

If a toolbar still looks empty, see :ref:`known-problems`.
