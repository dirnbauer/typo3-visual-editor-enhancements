/**
 * Hidden entries never look live on the page (Frontend/entry-page-marks.js):
 * the marks follow the vendor store - staged value first, then its baseline,
 * then the server payload.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {applyEntryMark, effectiveHidden, entryMarkPlan} from '../../Resources/Public/JavaScript/Frontend/entry-page-marks.js';

/** Minimal element: the attribute API the module uses. */
function node(attributes = {}) {
  const map = new Map(Object.entries(attributes));
  return {
    hasAttribute: (name) => map.has(name),
    getAttribute: (name) => map.get(name) ?? null,
    setAttribute: (name, value) => { map.set(name, String(value)); },
    removeAttribute: (name) => { map.delete(name); },
    toggleAttribute: (name, force) => { force ? map.set(name, '') : map.delete(name); return force; },
    attributes: map,
  };
}

const child = {table: 'items', uid: 3, liveUid: 3, hidden: true, hiddenField: 'hidden'};

describe('entry page marks', () => {
  it('marks every editable of a hidden child', () => {
    const [plan] = entryMarkPlan([child], {data: {}, initialData: {}});
    assert.deepEqual(plan, {table: 'items', uid: 3, liveUid: 3, hidden: true});
    const title = node();
    const text = node();
    const marker = node({'data-ve-item': 'items:3'});
    applyEntryMark([title, text], [marker], plan.hidden, 'Hidden on the live site');
    for (const editable of [title, text]) {
      assert.equal(editable.hasAttribute('data-ve-entry-hidden'), true);
      assert.equal(editable.getAttribute('title'), 'Hidden on the live site');
    }
    assert.equal(marker.hasAttribute('data-ve-item-hidden'), true);
  });

  it('clears on staged un-hide and keeps a template title', () => {
    const own = node({title: 'Template title'});
    const editable = node();
    applyEntryMark([own, editable], [], true, 'Hidden');
    const unhidden = {data: {items: {3: {hidden: false}}}, initialData: {items: {3: {hidden: true}}}};
    assert.equal(effectiveHidden(child, unhidden.data, unhidden.initialData), false);
    applyEntryMark([own, editable], [], entryMarkPlan([child], unhidden)[0].hidden, 'Hidden');
    assert.equal(editable.hasAttribute('data-ve-entry-hidden'), false);
    assert.equal(editable.hasAttribute('title'), false);
    assert.equal(own.getAttribute('title'), 'Template title');
  });

  it('re-derives on saved: the merged baseline wins over the stale payload', () => {
    // After Save the store's markSaved() moved the staged false into initialData and cleared data.
    assert.equal(effectiveHidden(child, {}, {items: {3: {hidden: false}}}), false);
    // Reset (data cleared, baseline untouched) shows the entry hidden again.
    assert.equal(effectiveHidden(child, {}, {items: {3: {hidden: true}}}), true);
    // Stored check values arrive as booleans, 0/1 or '0'/'1'.
    assert.equal(effectiveHidden(child, {items: {3: {hidden: '1'}}}, {}), true);
    assert.equal(effectiveHidden({...child, hiddenField: ''}, {}, {}), true);
  });

  it('never marks workspace deletion placeholders', () => {
    assert.deepEqual(entryMarkPlan([{...child, state: 'deleted'}], {data: {}, initialData: {}}), []);
  });
});
