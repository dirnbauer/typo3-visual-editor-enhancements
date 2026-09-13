:navigation-title: Visual Editor Enhancements

..  include:: /Includes.rst.txt
..  _start:

===========================
Visual Editor Enhancements
===========================

:Extension key:
    visual_editor_enhancements

:Package name:
    webconsulting/visual-editor-enhancements

:Version:
    1.0.0

:Language:
    en

:Author:
    webconsulting GmbH

:License:
    This document is published under the
    `Creative Commons BY 4.0 <https://creativecommons.org/licenses/by/4.0/>`__
    license.

Three things editors keep asking for while working inside
`friendsoftypo3/visual-editor <https://github.com/FriendsOfTYPO3/visual_editor>`__,
added without forking it.

A **element library** they can browse and drag onto the page instead of
picking a name out of a wizard list. A **field chooser** that opens the
"settings" fields of the element they are looking at - layout, frame, link,
category - in a popover, grouped like the backend form, staged on the same
pending-change list as an inline text edit. And a set of small **editor UI
bridges** that keep the editing chrome usable: a link button for TCA
``type=link`` fields, a CKEditor toolbar that does not disappear behind an
``overflow: hidden`` ancestor, and a partial element refresh after saving.

----

..  card-grid::
    :columns: 1
    :columns-md: 2
    :gap: 4
    :class: pb-4
    :card-height: 100

    ..  card:: Introduction

        What the extension adds, and what it deliberately leaves to the
        Visual Editor itself.

        ..  card-footer:: :ref:`Read the introduction <introduction>`
            :button-style: btn btn-secondary stretched-link

    ..  card:: Installation

        Install it, and switch the features on.

        ..  card-footer:: :ref:`Install it <installation>`
            :button-style: btn btn-secondary stretched-link

    ..  card:: Configuration

        Extension settings, per-user settings and the page TSconfig
        reference for the field chooser, the element library and previews.

        ..  card-footer:: :ref:`Configure it <configuration>`
            :button-style: btn btn-secondary stretched-link

    ..  card:: Usage

        What an editor sees and does on the page.

        ..  card-footer:: :ref:`Use it <usage>`
            :button-style: btn btn-secondary stretched-link

    ..  card:: Compatibility

        What this package does against Visual Editor 1.10.2, feature by
        feature, and why each part still exists.

        ..  card-footer:: :ref:`Check compatibility <compatibility>`
            :button-style: btn btn-secondary stretched-link

    ..  card:: Developer

        Endpoints, the element library catalog contract, events and tests.

        ..  card-footer:: :ref:`Extend it <developer>`
            :button-style: btn btn-secondary stretched-link

..  toctree::
    :hidden:
    :titlesonly:

    Introduction
    Installation
    Configuration
    Usage
    Compatibility
    Developer
    KnownProblems

..  toctree::
    :hidden:

    Sitemap
