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

*   The :guilabel:`Edit field settings` button on the element's action bar
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
CKEditor's own InlineEditor instead: a balloon panel, as wide as the field,
that CKEditor pins to it - above when there is room, at the top of the
viewport while a long text is scrolled past its top, below otherwise. The
panel lives in ``<body>``, so an ``overflow: hidden`` ancestor - which
nearly every card, teaser or slider has - cannot clip it, and it never ends
up off-screen.

If a toolbar still looks empty, see :ref:`known-problems`.
