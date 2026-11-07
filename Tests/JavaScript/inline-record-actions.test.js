import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectionIntent, postCollectionIntent, recordTree, rowPendingReason, structuralBlockReason, treeHasStagedData} from '../../Resources/Public/JavaScript/Shared/inline-record-actions.js';

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
  assert.throws(() => collectionIntent(field, 'move', {afterUid: 2}), /needs childUid/);
});
test('sync carries language, a known mode and optional ids only', () => {
  assert.deepEqual(collectionIntent(field, 'sync', {language: 2, mode: 'localize', ids: [4]}), {inlineRecord: {action: 'sync', ...common, language: 2, mode: 'localize', ids: [4]}});
  assert.deepEqual(collectionIntent(field, 'sync', {language: 2, mode: 'synchronize'}), {inlineRecord: {action: 'sync', ...common, language: 2, mode: 'synchronize'}});
  assert.equal(collectionIntent(field, 'sync', {language: 2, mode: 'copy'}).inlineRecord.mode, 'localize');
  assert.deepEqual(collectionIntent(field, 'sync', {language: 2, ids: [4, 'x', -1]}).inlineRecord.ids, [4]);
  assert.throws(() => collectionIntent(field, 'sync', {mode: 'localize'}), /needs language/);
});
test('no child table, pid, sorting, language identity, live uid or unknown action leaves the browser', () => {
  const forged = {childUid: 4, afterUid: 2, childTable: 'x', pid: 1, sorting: 3, sys_language_uid: 1, liveUid: 9, hidden: 0, uids: [4, 2], data: {}};
  for (const action of ['create', 'delete', 'move']) {
    for (const key of Object.keys(collectionIntent({...field, childTable: 'x', pid: 1}, action, forged).inlineRecord)) {
      assert.ok(['action', 'parentTable', 'parentUid', 'field', 'revision', 'childUid', 'afterUid'].includes(key), `${action} leaked ${key}`);
    }
  }
  for (const key of Object.keys(collectionIntent(field, 'sync', {...forged, language: 1, mode: 'localize', ids: [4]}).inlineRecord)) {
    assert.ok(['action', 'parentTable', 'parentUid', 'field', 'revision', 'language', 'mode', 'ids'].includes(key), `sync leaked ${key}`);
  }
  assert.throws(() => collectionIntent(field, 'copy', {}), /Unknown collection action/);
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
