:navigation-title: Installation

..  include:: /Includes.rst.txt
..  _installation:

============
Installation
============

..  _installation-requirements:

Requirements
============

..  confval-menu::
    :display: table
    :type:

    ..  confval:: TYPO3
        :type: version

        14.3.7 or newer.

    ..  confval:: PHP
        :type: version

        8.4 or newer.

    ..  confval:: friendsoftypo3/visual-editor
        :type: version

        1.10.2 or newer. Earlier 1.x releases are not supported - see
        :ref:`compatibility`.

    ..  confval:: friendsoftypo3/content-blocks
        :type: optional

        When installed, Content Blocks tables are auto-enabled for the field
        chooser.

..  _installation-composer:

Install
=======

The extension is distributed through Composer and Git only; there is no TER
release and no :file:`ext_emconf.php`.

..  code-block:: bash

    composer require webconsulting/visual-editor-enhancements
    vendor/bin/typo3 cache:flush

With DDEV:

..  code-block:: bash

    ddev composer require webconsulting/visual-editor-enhancements
    ddev typo3 cache:flush

..  _installation-enable:

Switch the features on
======================

All five features default to on. They are toggled install-wide from a
sitepackage's :file:`ext_localconf.php`:

..  code-block:: php
    :caption: EXT:my_sitepackage/ext_localconf.php

    $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementLibraryEnabled'] = true;
    $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['fieldChooserEnabled'] = true;
    $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['editableLinksEnabled'] = true;
    $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['elementRefreshEnabled'] = true;
    $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['inlineRecordsEnabled'] = true;

..  important::

    Put these in a sitepackage, not in :file:`config/system/settings.php`.
    That file is git-ignored in most setups, so a flag set there is lost on
    the next deployment and the feature silently disappears for everyone but
    the developer who set it.

``inlineRecordsEnabled`` is the install-wide switch for collection editing
(:ref:`collections`). With it on, an editor still needs the user setting
:confval:`tx_visualeditor_inlineRecords`, which is off by default; switch it
on for a whole group with ``setup.override``
(:ref:`configuration-user-install-wide`). ``inlineRecordsEnabled = false``
removes the feature for everyone, whatever the user setting says.

The element library additionally needs a catalog provider to answer
``?elementLibrary=1``; without one the panel opens and reports that it could
not load the catalog. See :ref:`developer-catalog`.

..  _installation-templates:

Template readiness
==================

The field chooser and the hover buttons attach to the Visual Editor's own
editable outputs, so the sitepackage must already render through
``f:render.text`` and ``f:render.contentArea`` (or ``f:mark.contentArea``).
``f:render.link`` from this extension is only useful next to a link that a
template renders itself:

..  code-block:: html

    <a href="{f:uri.typolink(parameter: data.cta_link.url)}">
        {data -> f:render.text(field: 'cta_text')}
    </a>{data -> f:render.link(field: 'cta_link')}
