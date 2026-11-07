/**
 * Unit tests for the reader of window.visualEditorEnhancements. This is the
 * client half of Service\FrontendConfiguration; the contract that matters is
 * that a module evaluated outside edit mode (no configuration object at all)
 * degrades to "everything off" instead of throwing.
 */
import assert from 'node:assert/strict';
import {beforeEach, describe, it} from 'node:test';

import {
  actionLabelMode,
  collectionFieldsFor,
  collectionTypes,
  contentAddedFeedback,
  entriesLayout,
  editorColorScheme,
  elementLibraryColumns,
  fieldChooserMode,
  fieldChooserTables,
  isContextButtonsEnabled,
  isEditableLinksEnabled,
  isElementLibraryEnabled,
  isElementRefreshEnabled,
  isFieldChooserEnabled,
} from '../../Resources/Public/JavaScript/Shared/config.js';

beforeEach(() => {
  globalThis.window = {};
});

describe('without a configuration object', () => {
  it('reports every feature as off', () => {
    assert.equal(isElementLibraryEnabled(), false);
    assert.equal(isEditableLinksEnabled(), false);
    assert.equal(isContextButtonsEnabled(), false);
    assert.equal(isFieldChooserEnabled(), false);
    assert.equal(isElementRefreshEnabled(), false);
    assert.equal(fieldChooserMode(), 'disabled');
    assert.deepEqual(fieldChooserTables(), []);
    assert.equal(contentAddedFeedback(), null);
    assert.equal(editorColorScheme(), 'auto');
    assert.equal(actionLabelMode(), 'caption');
    assert.equal(collectionTypes(), null);
    assert.equal(collectionFieldsFor('tt_content', 'text'), null);
  });

  it('still answers the column count with the wide default', () => {
    assert.equal(elementLibraryColumns(), 3);
  });
});

describe('with the configuration the middleware inlines', () => {
  beforeEach(() => {
    globalThis.window = {
      visualEditorEnhancements: {
        elementLibraryEnabled: true,
        elementLibraryColumns: 1,
        contextButtonsEnabled: true,
        editableLinksEnabled: true,
        fieldChooserMode: 'tabs',
        fieldChooserTables: ['tt_content', 'pages'],
        elementRefreshEnabled: true,
      },
    };
  });

  it('reports the enabled features', () => {
    assert.equal(isElementLibraryEnabled(), true);
    assert.equal(isEditableLinksEnabled(), true);
    assert.equal(isContextButtonsEnabled(), true);
    assert.equal(isElementRefreshEnabled(), true);
    assert.equal(fieldChooserMode(), 'tabs');
    assert.equal(isFieldChooserEnabled(), true);
    assert.deepEqual(fieldChooserTables(), ['tt_content', 'pages']);
    assert.equal(elementLibraryColumns(), 1);
  });

  it('treats an unknown field chooser mode as disabled', () => {
    globalThis.window.visualEditorEnhancements.fieldChooserMode = 'flyout';

    assert.equal(fieldChooserMode(), 'disabled');
    assert.equal(isFieldChooserEnabled(), false);
  });

  it('accepts only 1 or 3 columns', () => {
    globalThis.window.visualEditorEnhancements.elementLibraryColumns = 7;
    assert.equal(elementLibraryColumns(), 3);

    globalThis.window.visualEditorEnhancements.elementLibraryColumns = 1;
    assert.equal(elementLibraryColumns(), 1);
  });

  it('passes the backend user\'s colour scheme through, anything else is auto', () => {
    globalThis.window.visualEditorEnhancements.colorScheme = 'dark';
    assert.equal(editorColorScheme(), 'dark');

    globalThis.window.visualEditorEnhancements.colorScheme = 'light';
    assert.equal(editorColorScheme(), 'light');

    globalThis.window.visualEditorEnhancements.colorScheme = 'sepia';
    assert.equal(editorColorScheme(), 'auto');
  });

  it('passes the action label mode through, anything else is caption', () => {
    for (const mode of ['caption', 'inline', 'stacked', 'icons']) {
      globalThis.window.visualEditorEnhancements.actionLabelMode = mode;
      assert.equal(actionLabelMode(), mode);
    }
    for (const mode of ['all', '', null, 3]) {
      globalThis.window.visualEditorEnhancements.actionLabelMode = mode;
      assert.equal(actionLabelMode(), 'caption');
    }
  });

  it('reads the collection index; a missing index means "discover on interaction"', () => {
    assert.equal(collectionTypes(), null);
    assert.equal(collectionFieldsFor('tt_content', 'feature_cards'), null);
    globalThis.window.visualEditorEnhancements.collectionTypes = {tt_content: {feature_cards: ['cards', '', 7]}};
    assert.deepEqual(collectionFieldsFor('tt_content', 'feature_cards'), ['cards']);
    assert.deepEqual(collectionFieldsFor('tt_content', 'text'), []);
    assert.deepEqual(collectionFieldsFor('pages', '1'), []);
    for (const invalid of [[], 'x', null]) {
      globalThis.window.visualEditorEnhancements.collectionTypes = invalid;
      assert.equal(collectionTypes(), null);
    }
  });
});

describe('entriesLayout', () => {
  it('defaults to the inspector without configuration or for unknown values', () => {
    assert.equal(entriesLayout(), 'inspector');
    for (const value of ['drawer', 'Tray', 1, null, ['tray']]) {
      globalThis.window = {visualEditorEnhancements: {entriesLayout: value}};
      assert.equal(entriesLayout(), 'inspector');
    }
  });

  it('passes the three known layouts through', () => {
    for (const value of ['inspector', 'tray', 'anchored']) {
      globalThis.window = {visualEditorEnhancements: {entriesLayout: value}};
      assert.equal(entriesLayout(), value);
    }
  });
});
