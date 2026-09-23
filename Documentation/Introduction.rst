:navigation-title: Introduction

..  include:: /Includes.rst.txt
..  _introduction:

============
Introduction
============

..  _introduction-what:

What it adds
============

The Visual Editor puts TYPO3 editing on the rendered page. This extension adds
the parts a content-heavy site tends to miss once editors actually work there.

Element library
    A side panel listing every content element type with a rendered preview,
    keyword chips and a typo-tolerant search. Cards are dragged onto the same
    drop zones the Visual Editor already shows; dropping copies the element's
    seeded demo record when the catalog provides one, so the new element lands
    pre-filled and looks like its preview.

    The panel is the client. The catalog, the previews and the search are
    served by a *catalog provider* extension - see :ref:`developer-catalog`.

Field chooser
    A popover with the record's choice fields: static single-value selects,
    category trees, ``type=link`` fields (with the TYPO3 link browser), single
    checkboxes and colors. Fields are grouped under the same headings as the
    backend edit form, either as tabs or as one scrolling list. Changes are
    staged on the Visual Editor's pending-change list and written by its own
    save - no second write path.

    It opens from the element's action bar, or from a small hover button on an
    editable output, scoped to that field's own attributes: hovering a heading
    offers the heading palette, hovering ``primary_button_text`` offers
    ``primary_button_link`` and ``primary_button_variant``.

Editor UI bridges
    A floating link button for TCA ``type=link`` fields (``f:render.link``),
    a CKEditor toolbar that lifts ``overflow: hidden`` off its ancestors and
    flips below the editable near the top of the viewport, the backend's
    theme (colours, light or dark scheme, font) carried into the edit frame,
    and a partial element refresh that swaps only the changed elements after
    a save instead of reloading the frame.

..  _introduction-scope:

What it is not
==============

It does not fork or replace the Visual Editor. Inline text and rich-text
editing, drag and drop, workspaces, permissions and the save pipeline all stay
with `friendsoftypo3/visual-editor <https://github.com/FriendsOfTYPO3/visual_editor>`__.
Where this package does reach into the Visual Editor's own runtime it does so
through a self-detecting patch that disables itself once upstream ships the
fix - :ref:`compatibility` lists every one of them and says what would make it
removable.

It is also not a replacement for the backend form. Complex fields, media,
validation, localization and everything the Context Panel covers stay in the
backend.
