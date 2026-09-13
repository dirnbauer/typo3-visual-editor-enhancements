:navigation-title: Configuration

..  include:: /Includes.rst.txt
..  _configuration:

=============
Configuration
=============

Three layers, in this order: the install-wide extension flags
(:ref:`installation-enable`), the per-user settings in the backend user setup
module, and page TSconfig. A feature is active only when all three allow it.

..  contents::
    :local:

..  _configuration-user:

Per-user settings
=================

On the *Visual editor* tab of :guilabel:`User settings`:

..  confval-menu::
    :display: table
    :type:
    :default:

    ..  confval:: tx_visualeditor_showLibrary
        :type: boolean
        :default: 1

        Show the element library button on the editing canvas.

    ..  confval:: tx_visualeditor_showContextButtons
        :type: boolean
        :default: 1

        Show the floating buttons on hover - the link buttons and the
        per-output field buttons together. Replaces the pre-0.3
        ``tx_visualeditor_showLinks``, whose stored value is still honored
        until the new toggle is saved once.

    ..  confval:: tx_visualeditor_fieldChooserMode
        :type: string
        :default: tabs

        ``tabs`` (backend-like tabs), ``sections`` (one scrolling list with
        group headings) or ``disabled``. Up to 0.2.x this was the checkbox
        ``tx_visualeditor_showFieldChooser``; an explicitly stored "off" is
        read as ``disabled`` until the select is saved once.

    ..  confval:: tx_visualeditor_panelColumns
        :type: int
        :default: 3

        ``1`` gives a compact list beside one large docked preview, higher
        values a preview grid.

..  _configuration-field-chooser:

Field chooser
=============

..  code-block:: typoscript
    :caption: Page TSconfig

    tx_visualeditorenhancements.fieldChooser {
      # Master switch for this page tree (default: 1)
      enabled = 1

      tables {
        # tt_content is enabled by default with auto-detected fields
        tt_content {
          enabled = 1

          # "*" (default) auto-detects, or give an explicit comma list
          fields = *

          # Always subtracted, from auto-detected and explicit lists alike
          excludeFields = layout

          # Per record type (CType), wins over the table-level "fields"
          types {
            textmedia {
              fields = frame_class, space_before_class
            }
          }
        }

        # Every other table is off unless enabled here - except Content
        # Blocks tables, which are auto-enabled like tt_content
        tx_news_domain_model_news {
          enabled = 1
        }
      }
    }

..  _configuration-auto-detection:

What ``fields = *`` picks up
----------------------------

Included, from the record type's own schema:

*   static single-value selects (``renderType = selectSingle``, no
    ``foreign_table``, not ``multiple``, ``maxitems`` at most 1),
*   category fields (``type = category``),
*   link fields (``type = link``),
*   single checkboxes (``type = check`` with at most one item),
*   color fields (``type = color``) without opacity.

Excluded: the record-type field (for example ``CType``), ``colPos``,
``sorting`` and the table's ``sortby`` field, the language,
``transOrigPointerField`` and translation-source fields, the ``hidden`` and
``editlock`` fields, ``readOnly`` fields, and relation selects.

Visibility on top of that still follows the Visual Editor's own per-field
permission checks, and select item lists honor ``TCEFORM`` TSconfig
(``keepItems``, ``addItems``, ``removeItems``, ``altLabels``) as well as
``itemsProcFunc`` and ``itemsProcessors``.

..  _configuration-content-blocks:

Content Blocks tables
---------------------

Collection child tables (``accordion_items``) and custom record types are
auto-enabled with the same defaults as ``tt_content``. Detection uses the
Content Blocks table registry when ``friendsoftypo3/content-blocks`` is
installed, and otherwise falls back to scanning the TCA for the collection
child convention (a ``foreign_table_parent_uid`` column). ``tt_content``,
``pages`` and the core system tables (``sys_*``, ``be_*``, ``fe_*``,
``tx_visualeditor*``) are never auto-enabled this way.

Explicit TSconfig always wins, so a single table can opt out again:

..  code-block:: typoscript

    tx_visualeditorenhancements.fieldChooser.tables.accordion_items.enabled = 0

..  _configuration-element-library:

Element library
===============

The panel itself has no TSconfig. Its column count comes from the per-user
:confval:`tx_visualeditor_panelColumns` setting, and everything it shows -
elements, keywords, preview URLs, the search ranking - comes from the catalog
provider (:ref:`developer-catalog`).

The "add from library" button on an element's action bar appears only when the
Visual Editor reports ``veInfo.allowNewContent`` for the current page and
language, so language and permission rules are the editor's, not this
extension's.

..  _configuration-wizard:

New content element wizard
==========================

Parameters can be added to the URL of the wizard the Visual Editor opens from
a content area's or element's "+" button, through the extension point upstream
added in 1.10.0:

..  code-block:: typoscript
    :caption: Page TSconfig

    tx_visualeditorenhancements.newContentWizard.parameters {
      defVals.tt_content.header_layout = 2
    }

The Visual Editor's own placeholders (``__COL_POS__``, ``__UID_PID__``,
``__TX_CONTAINER_PARENT__``) and its ``returnUrl`` are preserved unless a key
of the same name is set here. Without this TSconfig nothing changes.

..  _configuration-previews:

Previews
========

Element library previews are ordinary frontend requests rendered in an iframe.
Two properties matter and are the catalog provider's responsibility:

*   They must be cacheable, so a preview is rendered once and then served from
    the standard TYPO3 page cache. In an edit session two things otherwise
    force a re-render on every open: an open admin panel (which sets the
    frontend preview aspect) and a workspace context (which never reads the
    live page cache). A provider therefore disables the admin panel and pins
    the rendering to the live workspace for its preview requests.
*   They must be signed, so a preview URL cannot be pointed at an arbitrary
    record. A ``cHash`` over the preview parameters does that.

A normal :guilabel:`Flush caches` clears them, because they carry the usual
``pages_*`` / ``tt_content_*`` cache tags.

The panel additionally hides the admin panel inside the iframe with an
injected stylesheet, as a second line of defence for providers that do not
switch it off server-side.
