/**
 * Unit tests for the client-side fallback filter of the element library.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {filterItems} from '../../Resources/Public/JavaScript/Frontend/components/ve-element-library/filter.js';

const items = [
  {cType: 'text', title: 'Text', description: 'Rich text block', group: 'common', keywords: ['copy'], synonyms: ['paragraph']},
  {cType: 'image', title: 'Image', description: 'A picture', group: 'media', keywords: ['photo']},
  {cType: 'pricing', title: 'Price list', description: 'Tiers', group: 'commerce'},
];

const cTypes = (result) => result.map((item) => item.cType);

describe('filterItems', () => {
  it('returns everything for an empty selection and an empty term', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(), '')), ['text', 'image', 'pricing']);
  });

  it('combines the selected categories as OR', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(['media', 'commerce']), '')), ['image', 'pricing']);
  });

  it('combines the categories with the term as AND', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(['media']), 'picture')), ['image']);
    assert.deepEqual(cTypes(filterItems(items, new Set(['commerce']), 'picture')), []);
  });

  it('matches the title, description, keywords and synonyms', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(), 'Price list')), ['pricing']);
    assert.deepEqual(cTypes(filterItems(items, new Set(), 'rich text')), ['text']);
    assert.deepEqual(cTypes(filterItems(items, new Set(), 'photo')), ['image']);
    assert.deepEqual(cTypes(filterItems(items, new Set(), 'paragraph')), ['text']);
  });

  it('ignores case and surrounding whitespace', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(), '  PHOTO ')), ['image']);
  });

  it('tolerates items without keywords or synonyms', () => {
    assert.deepEqual(cTypes(filterItems(items, new Set(), 'tiers')), ['pricing']);
  });
});
