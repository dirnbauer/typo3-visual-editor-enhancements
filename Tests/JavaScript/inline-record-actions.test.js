import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectionIntent, postCollectionIntent, structuralBlockReason} from '../../Resources/Public/JavaScript/Shared/inline-record-actions.js';

const field = {parentTable: 'tt_content', parentUid: 5, name: 'cards', revision: 'opaque', childTable: 'ignored', hidden: 0};
test('create and delete send intent only, no client identities or datamaps', () => {
  assert.deepEqual(collectionIntent(field, 'create', 3), {inlineRecord: {action: 'create', parentTable: 'tt_content', parentUid: 5, field: 'cards', revision: 'opaque', afterUid: 3}});
  assert.equal(collectionIntent(field, 'delete', 3).inlineRecord.childUid, 3);
  assert.equal('afterUid' in collectionIntent(field, 'create').inlineRecord, false);
});
test('dirty, invalid, saving, unknown and uncertain editor states block actions', () => {
  const clean = {changesCount: 0, invalidCount: 0};
  const idle = {count: 0, invalidCount: 0, saving: false};
  assert.equal(structuralBlockReason(clean, idle), '');
  for (const [store, backend, uncertain] of [[{...clean, changesCount: 1}, idle], [{...clean, invalidCount: 1}, idle], [clean, {...idle, saving: true}], [clean, {...idle, count: 1}], [clean, {...idle, invalidCount: 1}], [clean, null], [clean, idle, true]]) {
    assert.notEqual(structuralBlockReason(store, backend, uncertain), '');
  }
});
test('HTTP failures are reported once and never retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return {ok: false, status: 409, json: async () => ({success: false, reason: 'stale'})}; };
  await assert.rejects(postCollectionIntent('/save', 'token', collectionIntent(field, 'create')), /stale/);
  assert.equal(calls, 1);
});
