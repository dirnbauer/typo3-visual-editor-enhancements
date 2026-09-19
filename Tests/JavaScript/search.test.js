/**
 * Unit tests for the element library's search client. The ranking itself is
 * computed by the catalog provider extension behind `?elementLibrarySearch=`;
 * what is tested here is everything this extension decides: how a server
 * answer is turned into a ranking, when the client falls back to the plain
 * substring filter, and that a stale answer never reorders a newer term.
 */
import assert from 'node:assert/strict';
import {beforeEach, describe, it, mock} from 'node:test';

import {fallbackSearchResult, fetchServerSearch, visibleItems} from '../../Resources/Public/JavaScript/Frontend/components/ve-element-library/search.js';

const items = [
  {cType: 'text', title: 'Text', description: 'Rich text', group: 'common', keywords: ['copy']},
  {cType: 'image', title: 'Image', description: 'A picture', group: 'media', keywords: ['photo']},
  {cType: 'pricing', title: 'Price list', description: 'Tiers', group: 'commerce', keywords: ['tariff']},
];

beforeEach(() => {
  globalThis.window = {location: {pathname: '/page/'}, veInfo: {token: 'test-token'}};
});

describe('fetchServerSearch', () => {
  it('turns the match order into a rank map and carries suggestions through', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        matches: [{cType: 'pricing'}, {cType: 'text'}],
        suggestions: ['price list', 'pricing table'],
        didYouMean: 'price list',
      }),
    }));

    const result = await fetchServerSearch('pricelist');

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, options] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/page/?elementLibrarySearch=pricelist');
    assert.equal(options.headers['X-Request-Token'], 'test-token');
    assert.equal(result.term, 'pricelist');
    assert.equal(result.fallback, false);
    assert.equal(result.order.get('pricing'), 0);
    assert.equal(result.order.get('text'), 1);
    assert.deepEqual(result.suggestions, ['price list', 'pricing table']);
    assert.equal(result.didYouMean, 'price list');
  });

  it('encodes the term so a term with spaces or & stays one parameter', async () => {
    globalThis.fetch = mock.fn(async () => ({ok: true, status: 200, json: async () => ({matches: []})}));

    await fetchServerSearch('price & list');

    assert.equal(globalThis.fetch.mock.calls[0].arguments[0], '/page/?elementLibrarySearch=price%20%26%20list');
  });

  it('defaults suggestions and didYouMean when the endpoint omits them', async () => {
    globalThis.fetch = mock.fn(async () => ({ok: true, status: 200, json: async () => ({matches: [{cType: 'text'}]})}));

    const result = await fetchServerSearch('text');

    assert.deepEqual(result.suggestions, []);
    assert.equal(result.didYouMean, null);
  });

  it('rejects on a non-OK response so the panel can fall back', async () => {
    globalThis.fetch = mock.fn(async () => ({ok: false, status: 503, json: async () => ({})}));

    await assert.rejects(() => fetchServerSearch('text'), /HTTP 503/);
  });
});

describe('fallbackSearchResult', () => {
  it('describes a result the panel must not use as a ranking', () => {
    const result = fallbackSearchResult('text');

    assert.equal(result.fallback, true);
    assert.equal(result.order, null);
    assert.deepEqual(result.suggestions, []);
  });
});

describe('visibleItems', () => {
  it('returns every item for an empty term without a search result', () => {
    assert.deepEqual(visibleItems(items, new Set(), '', null).map((i) => i.cType), ['text', 'image', 'pricing']);
  });

  it('applies the server ranking, dropping items the endpoint did not match', () => {
    const result = {term: 'price', order: new Map([['pricing', 0], ['text', 1]]), fallback: false, suggestions: [], didYouMean: null};

    assert.deepEqual(visibleItems(items, new Set(), 'price', result).map((i) => i.cType), ['pricing', 'text']);
  });

  it('keeps the category chips as an AND filter on top of the ranking', () => {
    const result = {term: 'price', order: new Map([['pricing', 0], ['text', 1]]), fallback: false, suggestions: [], didYouMean: null};

    assert.deepEqual(visibleItems(items, new Set(['commerce']), 'price', result).map((i) => i.cType), ['pricing']);
  });

  it('falls back to the substring filter while a result answers an older term', () => {
    const stale = {term: 'price', order: new Map([['pricing', 0]]), fallback: false, suggestions: [], didYouMean: null};

    // The user has typed on; "photo" must match the keyword, not the stale rank.
    assert.deepEqual(visibleItems(items, new Set(), 'photo', stale).map((i) => i.cType), ['image']);
  });

  it('falls back to the substring filter when the endpoint was unreachable', () => {
    assert.deepEqual(
      visibleItems(items, new Set(), 'photo', fallbackSearchResult('photo')).map((i) => i.cType),
      ['image'],
    );
  });

  it('shows nothing when the server matched nothing, rather than everything', () => {
    const empty = {term: 'zzz', order: new Map(), fallback: false, suggestions: [], didYouMean: null};

    assert.deepEqual(visibleItems(items, new Set(), 'zzz', empty), []);
  });
});
