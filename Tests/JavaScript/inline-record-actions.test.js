import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectionIntent, collectionLimit, fromTextControl, postCollectionIntent, recordTree, rowPendingReason, structuralBlockReason, titleKeyAction, treeHasStagedData} from '../../Resources/Public/JavaScript/Shared/inline-record-actions.js';

const field = {parentTable: 'tt_content', parentUid: 5, name: 'cards', revision: 'opaque', childTable: 'ignored', hidden: 0};
const common = {parentTable: 'tt_content', parentUid: 5, field: 'cards', revision: 'opaque'};
test('create and delete send intent only, no client identities or datamaps', () => {
  assert.deepEqual(collectionIntent(field, 'create', {afterUid: 3}), {inlineRecord: {action: 'create', ...common, afterUid: 3}});
  assert.deepEqual(collectionIntent(field, 'delete', {childUid: 3}), {inlineRecord: {action: 'delete', ...common, childUid: 3}});
  assert.equal('afterUid' in collectionIntent(field, 'create').inlineRecord, false);
  assert.throws(() => collectionIntent(field, 'delete'), /needs childUid/);
});
test('move always carries childUid and afterUid, null meaning the first position', () => {
  assert.deepEqual(collectionIntent(field, 'move', {childUid: 4, afterUid: 2}), {inlineRecord: {action: 'move', ...common, childUid: 4, afterUid: 2}});
  assert.deepEqual(collectionIntent(field, 'move', {childUid: 4, afterUid: null}), {inlineRecord: {action: 'move', ...common, childUid: 4, afterUid: null}});
  assert.deepEqual(collectionIntent(field, 'move', {childUid: 4}).inlineRecord.afterUid, null);
  assert.throws(() => collectionIntent(field, 'move', {afterUid: 2}), /needs childUid/);
});
test('sync carries language, mode and optional ids for localize only', () => {
  assert.deepEqual(collectionIntent(field, 'sync', {language: 1, mode: 'localize'}), {inlineRecord: {action: 'sync', ...common, language: 1, mode: 'localize'}});
  assert.deepEqual(collectionIntent(field, 'sync', {language: 2, mode: 'localize', ids: [7, 7, 8]}).inlineRecord.ids, [7, 8]);
  assert.equal('ids' in collectionIntent(field, 'sync', {language: 1, mode: 'synchronize'}).inlineRecord, false);
  assert.throws(() => collectionIntent(field, 'sync', {language: 1, mode: 'synchronize', ids: [7]}), /Only localize/);
  assert.throws(() => collectionIntent(field, 'sync', {language: 1, mode: 'copy'}), /needs mode/);
  assert.throws(() => collectionIntent(field, 'sync', {mode: 'localize'}), /needs language/);
});
test('duplicate and restore carry exactly the listed entry uid', () => {
  assert.deepEqual(collectionIntent(field, 'duplicate', {childUid: 3}), {inlineRecord: {action: 'duplicate', ...common, childUid: 3}});
  assert.deepEqual(collectionIntent(field, 'restore', {childUid: 3}), {inlineRecord: {action: 'restore', ...common, childUid: 3}});
  for (const action of ['duplicate', 'restore']) {
    assert.throws(() => collectionIntent(field, action), /needs childUid/);
    assert.throws(() => collectionIntent(field, action, {childUid: '3'}), /needs childUid/);
    // A delete placeholder's version uid, a paste target or an update never leave the browser.
    const forged = collectionIntent(field, action, {childUid: 3, versionUid: 10, target: -3, update: {hidden: 0}, afterUid: 2, table: 'items'});
    assert.deepEqual(Object.keys(forged.inlineRecord), ['action', 'parentTable', 'parentUid', 'field', 'revision', 'childUid']);
  }
});
test('no child table, pid, sorting, language, live uid or unknown action leaves the browser', () => {
  const forged = {childUid: 4, afterUid: 2, childTable: 'x', pid: 1, sorting: 3, sys_language_uid: 1, liveUid: 9, hidden: 0, uids: [4, 2], data: {}};
  const allowed = {create: ['afterUid'], delete: ['childUid'], move: ['childUid', 'afterUid'], sync: ['language', 'mode'], duplicate: ['childUid'], restore: ['childUid']};
  for (const action of ['create', 'delete', 'move', 'sync', 'duplicate', 'restore']) {
    const keys = Object.keys(collectionIntent({...field, childTable: 'x', pid: 1}, action, {...forged, language: 1, mode: 'synchronize'}).inlineRecord);
    for (const key of keys) {
      assert.ok(['action', 'parentTable', 'parentUid', 'field', 'revision', ...allowed[action]].includes(key), `${action} leaked ${key}`);
    }
  }
  assert.throws(() => collectionIntent(field, 'copy', {}), /Unknown collection action/);
  assert.throws(() => collectionIntent(field, 'discard', {childUid: 4}), /Unknown collection action/);
});
test('saving, invalid and uncertain editor states block every structural action; staged changes do not', () => {
  const clean = {changesCount: 0, invalidCount: 0};
  const idle = {count: 0, invalidCount: 0, saving: false};
  assert.equal(structuralBlockReason(clean, idle), '');
  // Staged text elsewhere (this frame or another language frame) no longer blocks.
  assert.equal(structuralBlockReason({...clean, changesCount: 3}, {...idle, count: 2}), '');
  for (const [store, backend, uncertain] of [[{...clean, invalidCount: 1}, idle], [clean, {...idle, saving: true}], [clean, {...idle, invalidCount: 1}], [clean, null], [clean, idle, true]]) {
    assert.notEqual(structuralBlockReason(store, backend, uncertain), '');
  }
});
test('the record tree of an element: its row, its editables and its listed entries', () => {
  const tree = recordTree({table: 'tt_content', uid: 1}, [{table: 'items', uid: '2'}, {table: null, uid: 3}, {table: 'items', uid: ''}], [{table: 'items', uid: 8}]);
  assert.deepEqual([...tree], ['tt_content:1', 'items:2', 'items:8']);
});
test('only staged data inside the element tree counts; other elements never block it', () => {
  const tree = recordTree({table: 'tt_content', uid: 1}, [{table: 'items', uid: 2}]);
  assert.equal(treeHasStagedData({data: {tt_content: {9: {header: 'x'}}, items: {7: {title: 'y'}}}, invalidFields: {}, cmdArray: []}, tree), false);
  assert.equal(treeHasStagedData({data: {items: {2: {title: 'y'}}}}, tree), true);
  assert.equal(treeHasStagedData({data: {}, invalidFields: {tt_content: {1: {header: true}}}}, tree), true);
  assert.equal(treeHasStagedData({data: {}, cmdArray: [{tt_content: {1: {delete: 1}}}]}, tree), true);
  assert.equal(treeHasStagedData({data: {}, cmdArray: [{tt_content: {5: {delete: 1}}}]}, tree), false);
});
test('a staged change on one entry holds only that entry\'s Remove', () => {
  const store = {data: {items: {2: {title: 'Pending'}}}};
  assert.notEqual(rowPendingReason(store, {table: 'items', uid: 2}), '');
  assert.equal(rowPendingReason(store, {table: 'items', uid: 3}), '');
});
test('HTTP failures are reported once and never retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return {ok: false, status: 409, json: async () => ({success: false, reason: 'stale'})}; };
  await assert.rejects(postCollectionIntent('/save', 'token', collectionIntent(field, 'create')), /collection changed/);
  assert.equal(calls, 1);
});
test('rejected 409 and permission failures are definitive; uncertain server failures are not', async () => {
  for (const status of [403, 409, 500]) {
    globalThis.fetch = async () => ({ok: false, status, json: async () => ({success: false, reason: 'rights'})});
    await assert.rejects(postCollectionIntent('/save', '', {}), error => error.definitive === (status !== 500));
  }
});
test('German operational messages use the exported TYPO3 catalogue', async () => {
  const {collectionReason, inlineLabel} = await import('../../Resources/Public/JavaScript/Shared/inline-record-actions.js');
  globalThis.window = {TYPO3: {lang: {'frontend.inlineRecords.rights': 'Zugriff eingeschränkt.', 'frontend.inlineRecords.unavailable': 'Nicht verfügbar: {value}'}}};
  assert.equal(collectionReason('rights'), 'Zugriff eingeschränkt.');
  assert.equal(inlineLabel('unavailable').replace('{value}', 'legacy'), 'Nicht verfügbar: legacy');
  delete globalThis.window;
});

test('title keys: Enter commits, Shift+Enter is a line break only in a multi-line title, Escape restores', () => {
  assert.equal(titleKeyAction({key: 'Enter'}), 'commit');
  assert.equal(titleKeyAction({key: 'Enter', shiftKey: true}), 'commit');
  assert.equal(titleKeyAction({key: 'Enter'}, true), 'commit');
  assert.equal(titleKeyAction({key: 'Enter', shiftKey: true}, true), null);
  assert.equal(titleKeyAction({key: 'Escape'}, true), 'restore');
  assert.equal(titleKeyAction({key: 'Escape'}), 'restore');
  assert.equal(titleKeyAction({key: 'a'}, true), null);
  // An open IME composition owns Enter and Escape.
  assert.equal(titleKeyAction({key: 'Enter', isComposing: true}, true), null);
  assert.equal(titleKeyAction({key: 'Escape', isComposing: true}), null);
});

test('collection limit: 0, missing, invalid and Core\'s 99999 default are unlimited', () => {
  assert.equal(collectionLimit(3), 3);
  assert.equal(collectionLimit('6'), 6);
  for (const unlimited of [0, undefined, null, '', 'x', -1, 99999, 100000]) {
    assert.equal(collectionLimit(unlimited), 0, String(unlimited));
  }
});

test('row shortcuts stay out of text controls', () => {
  const event = (...nodes) => ({composedPath: () => nodes});
  assert.equal(fromTextControl(event({localName: 'input'}, {localName: 'li'})), true);
  assert.equal(fromTextControl(event({localName: 'textarea'}, {localName: 'li'})), true);
  assert.equal(fromTextControl(event({localName: 'span', isContentEditable: true})), true);
  assert.equal(fromTextControl(event({localName: 'button'}, {localName: 'li'})), false);
  assert.equal(fromTextControl({target: {localName: 'textarea'}}), true);
});
