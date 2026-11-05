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
