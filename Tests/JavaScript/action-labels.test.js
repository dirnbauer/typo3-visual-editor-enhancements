/**
 * Short words on the vendor's four action-bar buttons (Shared/action-labels.js):
 * used only when contained in the button's accessible name (WCAG 2.5.3).
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {isContainedIn, shortVendorLabel} from '../../Resources/Public/JavaScript/Shared/action-labels.js';

const en = {
  'frontend.editContentElement': 'Edit content element',
  'frontend.showContentElement': 'Show content element',
  'frontend.deleteContentElement': 'Delete content element',
  'frontend.addContentElementButton': 'Add content element',
  'frontend.actionBar.short.edit': 'Edit',
  'frontend.actionBar.short.show': 'Show',
  'frontend.actionBar.short.delete': 'Delete',
  'frontend.actionBar.short.add': 'Add',
};
const de = {
  'frontend.editContentElement': 'Inhaltselement bearbeiten',
  'frontend.showContentElement': 'Inhaltselement anzeigen',
  'frontend.deleteContentElement': 'Inhaltselement löschen',
  'frontend.addContentElementButton': 'Inhaltselement hinzufügen',
  'frontend.actionBar.short.edit': 'Bearbeiten',
  'frontend.actionBar.short.show': 'Anzeigen',
  'frontend.actionBar.short.delete': 'Löschen',
  'frontend.actionBar.short.add': 'Hinzufügen',
};

describe('shortVendorLabel', () => {
  it('short label applied only when contained in the accessible name, per language', () => {
    assert.equal(shortVendorLabel('Edit content element', en), 'Edit');
    assert.equal(shortVendorLabel('Delete content element', en), 'Delete');
    assert.equal(shortVendorLabel('Inhaltselement bearbeiten', de), 'Bearbeiten');
    assert.equal(shortVendorLabel('Inhaltselement hinzufügen', de), 'Hinzufügen');
    // A language whose vendor name does not contain our short word keeps the verbatim name.
    const hu = {...en, 'frontend.deleteContentElement': 'Tartalmi elem törlése', 'frontend.actionBar.short.delete': 'Delete'};
    assert.equal(shortVendorLabel('Tartalmi elem törlése', hu), null);
    const zh = {...en, 'frontend.editContentElement': '编辑内容元素', 'frontend.actionBar.short.edit': '编辑'};
    assert.equal(shortVendorLabel('编辑内容元素', zh), '编辑');
  });

  it('needs the short key in TYPO3.lang', () => {
    const withoutShort = {...en};
    delete withoutShort['frontend.actionBar.short.show'];
    assert.equal(shortVendorLabel('Show content element', withoutShort), null);
    assert.equal(shortVendorLabel('Show content element', {...en, 'frontend.actionBar.short.show': '  '}), null);
  });

  it('identifies the button only by the vendor label it rendered', () => {
    assert.equal(shortVendorLabel('Edit field settings', en), null);
    assert.equal(shortVendorLabel('Edit content element', {}), null);
    assert.equal(shortVendorLabel('', en), null);
    assert.equal(shortVendorLabel('Edit content element', null), null);
  });

  it('compares case-insensitively', () => {
    assert.equal(isContainedIn('Löschen', 'Inhaltselement löschen'), true);
    assert.equal(isContainedIn('Delete', 'Remove content element'), false);
  });
});
