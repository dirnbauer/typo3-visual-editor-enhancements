/**
 * Unit tests for the shared ?veFieldOptions=1 cache. The cache is the reason
 * hovering an output does not produce one request per hover, so its contract -
 * one in-flight request per record, no cached rejections - is worth pinning
 * down.
 */
import assert from 'node:assert/strict';
import {beforeEach, describe, it, mock} from 'node:test';

import {clearFieldOptionsCache, fetchFieldOptions} from '../../Resources/Public/JavaScript/Shared/field-options-cache.js';

beforeEach(() => {
  clearFieldOptionsCache();
  globalThis.window = {location: {pathname: '/page/'}, veInfo: {token: 'test-token'}};
});

const respondWith = (payload, {ok = true, status = 200} = {}) =>
  mock.fn(async () => ({ok, status, json: async () => payload}));

describe('fetchFieldOptions', () => {
  it('requests the endpoint with the record coordinates and the request token', async () => {
    globalThis.fetch = respondWith({table: 'tt_content', uid: 42, fields: []});

    await fetchFieldOptions('tt_content', 42);

    const [url, options] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/page/?veFieldOptions=1&editMode=1&table=tt_content&uid=42');
    assert.equal(options.headers['X-Request-Token'], 'test-token');
  });

  it('serves a second call for the same record from the cache', async () => {
    globalThis.fetch = respondWith({uid: 42});

    const first = await fetchFieldOptions('tt_content', 42);
    const second = await fetchFieldOptions('tt_content', 42);

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    assert.equal(first, second);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    globalThis.fetch = respondWith({uid: 42});

    const [first, second] = await Promise.all([
      fetchFieldOptions('tt_content', 42),
      fetchFieldOptions('tt_content', 42),
    ]);

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    assert.equal(first, second);
  });

  it('keys the cache per table and uid', async () => {
    globalThis.fetch = respondWith({uid: 0});

    await fetchFieldOptions('tt_content', 42);
    await fetchFieldOptions('tt_content', 43);
    await fetchFieldOptions('pages', 42);

    assert.equal(globalThis.fetch.mock.calls.length, 3);
  });

  it('rejects and does not cache a payload carrying an error key', async () => {
    globalThis.fetch = respondWith({error: 'Record not found'}, {ok: false, status: 404});

    await assert.rejects(() => fetchFieldOptions('tt_content', 42), /Record not found/);

    globalThis.fetch = respondWith({uid: 42});
    await fetchFieldOptions('tt_content', 42);
    assert.equal(globalThis.fetch.mock.calls.length, 1, 'the failed load must be retried, not replayed');
  });

  it('rejects on a non-OK response even without an error key', async () => {
    globalThis.fetch = respondWith({}, {ok: false, status: 500});

    await assert.rejects(() => fetchFieldOptions('tt_content', 42), /HTTP 500/);
  });

  it('clearFieldOptionsCache forces the next call back to the server', async () => {
    globalThis.fetch = respondWith({uid: 42});

    await fetchFieldOptions('tt_content', 42);
    clearFieldOptionsCache();
    await fetchFieldOptions('tt_content', 42);

    assert.equal(globalThis.fetch.mock.calls.length, 2);
  });
});
