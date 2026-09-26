:navigation-title: Known problems

..  include:: /Includes.rst.txt
..  _known-problems:

==============
Known problems
==============

..  _known-problems-library-empty:

The element library opens but reports that it cannot load
=========================================================

No catalog provider answers ``?elementLibrary=1`` on this site. The panel is a
client only; see :ref:`developer-catalog`.

If a provider is installed, check that the request reaches it with
``X-Request-Token`` - a 401 or 403 in the browser's network tab means the
editing session is not what the provider expects.

..  _known-problems-fab-missing:

The element library button does not appear
==========================================

In order:

#.  the install-wide flag is off, and it is set in :file:`settings.php` rather
    than in a sitepackage's :file:`ext_localconf.php` - see
    :ref:`installation-enable`. A flag in a git-ignored settings file
    disappears on the next deployment;
#.  the backend user turned :confval:`tx_visualeditor_showLibrary` off;
#.  caches were not flushed after enabling.

The button on an *element's action bar* additionally requires
``veInfo.allowNewContent``, which the Visual Editor withholds for languages
and pages where the user may not create content.

..  _known-problems-rte-toolbar:

The rich-text toolbar has no icons to click
===========================================

With the Visual Editor alone that is an ancestor with ``overflow: hidden``
or ``overflow: clip`` clipping the simulated toolbar away, or an editable so
close to the top of the viewport that the toolbar renders off-screen. Since
1.3.2 the toolbar is CKEditor's InlineEditor balloon panel in ``<body>``
(:ref:`usage-rte`), which no ancestor can clip and CKEditor keeps in view.
It only appears on a *real* focus event - a synthetic click from an
automated test will not open it.

If it still happens, check the site's stylesheets for rules on
``.ck-balloon-panel`` or ``.ck-toolbar`` that hide or move them.

..  _known-problems-field-chooser-empty:

The field chooser shows no fields
=================================

The record type genuinely has no eligible fields, or all of them were filtered
out. Walk :ref:`configuration-auto-detection` for the record type, then check
``excludeFields`` and any ``types.<recordType>.fields`` list. Relation selects
and ``readOnly`` fields are never offered.

A missing *hover* button on an editable output is different: it means the
hovered field has no attributes of its own (no labeled palette, no
``<stem>_<suffix>`` companions). The action-bar button still opens the full
list.

..  _known-problems-stale-preview:

An element still looks unchanged after saving
=============================================

Changes staged in the field chooser are server-rendered, so the element is
re-fetched and swapped after the save. That is skipped when the save also
carried structural commands (a move, copy or delete), because the Visual
Editor already updated the DOM optimistically - reload the frame in that case.

If an element cannot be swapped at all, the frame reloads by itself. Disable
the whole mechanism install-wide with ``elementRefreshEnabled = false`` if a
site's JavaScript cannot survive an element being replaced; the
``ve:element-refreshed`` event exists to avoid that
(:ref:`developer-javascript`).

..  _known-problems-preview-slow:

Previews are slow every time
============================

They are not being cached. In an edit session that is usually an open admin
panel or a workspace context; both force a re-render and both are the catalog
provider's job to switch off for preview requests - see
:ref:`configuration-previews`. A cold TYPO3 bootstrap after a long idle period
looks the same but only once.
