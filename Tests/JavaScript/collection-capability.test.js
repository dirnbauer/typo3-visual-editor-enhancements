/**
 * What the action bar's Entries and Add entry buttons may do, decided from
 * the capability payload fetched on click (Shared/collection-capability.js).
 */
import assert from 'node:assert/strict';
import {beforeEach, describe, it} from 'node:test';

import {collectionCapability} from '../../Resources/Public/JavaScript/Shared/collection-capability.js';

beforeEach(() => {
  globalThis.window = {};
});

const collection = (overrides = {}) => ({type: 'inline', name: 'cards', canCreate: true, ...overrides});

describe('collectionCapability', () => {
  it('allows both buttons for one creatable collection', () => {
    const capability = collectionCapability({fields: [{type: 'select'}, collection()]});
    assert.equal(capability.entriesReason, '');
    assert.equal(capability.addReason, '');
    assert.equal(capability.creatable.length, 1);
  });

  it('refuses both when the payload lists no collection the user can see', () => {
    for (const data of [{fields: []}, {}, null, {fields: [{type: 'select'}]}]) {
      const capability = collectionCapability(data);
      assert.equal(capability.entriesReason, 'This element has no entries you can edit here.');
      assert.equal(capability.addReason, capability.entriesReason);
    }
  });

  it('keeps Entries and names the server reason when no collection can create', () => {
    const capability = collectionCapability({fields: [collection({canCreate: false, createReason: 'max'})]});
    assert.equal(capability.entriesReason, '');
    assert.equal(capability.addReason, 'The collection has reached its entry limit.');
    assert.equal(collectionCapability({fields: [collection({canCreate: false})]}).addReason,
      'This action is disabled in the backend field configuration.');
  });

  it('reports several creatable collections so the inspector decides', () => {
    const capability = collectionCapability({fields: [collection(), collection({name: 'rows'})]});
    assert.equal(capability.creatable.length, 2);
    assert.equal(capability.addReason, '');
  });

  it('uses the translated reason from TYPO3.lang', () => {
    globalThis.window = {TYPO3: {lang: {'frontend.actionBar.noCollections': 'Keine Einträge'}}};
    assert.equal(collectionCapability({fields: []}).entriesReason, 'Keine Einträge');
  });
});
