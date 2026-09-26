/**
 * Unit tests for the floating rich-text toolbar's item list. What matters:
 * the always-visible buttons come first and only if configured, everything
 * else ends up in one "Show more items" group in configuration order, and no
 * separator is left dangling.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {ALWAYS_VISIBLE, floatingToolbarItems} from '../../Resources/Public/JavaScript/Shared/floating-toolbar-items.js';

// The desiderio preset's toolbar, as TYPO3 hands it to CKEditor.
const DESIDERIO = [
  'style', 'heading', '|', 'bold', 'italic', 'code', 'subscript', 'superscript', 'softhyphen', '|',
  'textPartLanguage', 'abbreviation', '|', 'bulletedList', 'numberedList', 'blockQuote', 'alignment', '|',
  'findAndReplace', 'link', '|', 'removeFormat', 'undo', 'redo', '|',
  'insertTable', 'specialCharacters', 'horizontalLine', '|', 'sourceEditing',
];

const groupOf = (items) => items.find((item) => typeof item === 'object');

describe('floatingToolbarItems', () => {
  it('puts bold, italic, link and bulleted list first, in that order', () => {
    const items = floatingToolbarItems(DESIDERIO, 'More');
    assert.deepEqual(items.slice(0, 4), ['bold', 'italic', 'link', 'bulletedList']);
    assert.equal(items.length, 5, 'four buttons and one group');
  });

  it('keeps every other configured item, in configuration order, in one group', () => {
    const group = groupOf(floatingToolbarItems(DESIDERIO, 'Weitere Elemente anzeigen'));
    assert.equal(group.label, 'Weitere Elemente anzeigen');
    assert.equal(group.icon, 'threeVerticalDots');
    const names = group.items.filter((item) => item !== '|');
    assert.deepEqual(names, DESIDERIO.filter((item) => item !== '|' && !ALWAYS_VISIBLE.includes(item)));
  });

  it('leaves no separator at the start, at the end or next to another one', () => {
    const {items} = groupOf(floatingToolbarItems(['|', 'bold', '|', 'link', '|', 'undo', '|', '|', 'redo', '|'], 'More'));
    assert.deepEqual(items, ['undo', '|', 'redo']);
  });

  it('never adds a button the preset does not configure', () => {
    assert.deepEqual(floatingToolbarItems(['bold', 'undo', 'redo'], 'More'), ['bold', {label: 'More', icon: 'threeVerticalDots', items: ['undo', 'redo']}]);
  });

  it('has no group when nothing else is configured', () => {
    assert.deepEqual(floatingToolbarItems(['link', '|', 'bold'], 'More'), ['bold', 'link']);
  });

  it('drops line breaks and keeps nested groups of the preset inside the group', () => {
    const nested = {label: 'Insert', items: ['insertTable']};
    const {items} = groupOf(floatingToolbarItems(['bold', '-', 'undo', nested], 'More'));
    assert.deepEqual(items, ['undo', nested]);
  });
});
