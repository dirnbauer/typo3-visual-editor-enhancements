import {filterItems} from './filter.js';

/**
 * Search for the element library panel: the catalog provider ranks a term
 * server-side (typo-tolerant, with Solr-style suggestions and a "did you
 * mean"); the panel only reorders the items it already has. Everything here
 * is free of Lit so it can be unit tested with plain Node.
 *
 * @typedef {Object} SearchResult
 * @property {string} term the term this result answers
 * @property {Map<string, number>|null} order cType -> server rank, null in fallback mode
 * @property {string[]} suggestions autocomplete suggestions
 * @property {string|null} didYouMean
 * @property {boolean} fallback true when the endpoint was unreachable
 */

/**
 * Asks the catalog provider's ?elementLibrarySearch= endpoint for a ranking.
 * Rejects on transport errors and non-OK responses.
 * @param {string} term
 * @return {Promise<SearchResult>}
 */
export async function fetchServerSearch(term) {
  const response = await fetch(
    window.location.pathname + '?elementLibrarySearch=' + encodeURIComponent(term),
    {headers: {'X-Request-Token': window.veInfo.token}},
  );
  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }
  const data = await response.json();
  return {
    term,
    // The index in the already-sorted matches is the rank, so the panel
    // reproduces the endpoint's exact order including its tiebreak.
    order: new Map((data.matches || []).map((match, index) => [match.cType, index])),
    suggestions: data.suggestions || [],
    didYouMean: data.didYouMean || null,
    fallback: false,
  };
}

/**
 * The result used while the endpoint is unreachable: the panel keeps working
 * with the client-side substring filter.
 * @param {string} term
 * @return {SearchResult}
 */
export const fallbackSearchResult = (term) => ({term, order: null, suggestions: [], didYouMean: null, fallback: true});

/**
 * The items to show: category chips filter first (OR within the selection),
 * then the server ranking for the current term - or the substring fallback
 * while the first request is in flight, when it failed, or when the result
 * still answers an older term.
 * @param {Array<{cType: string, group: string}>} items
 * @param {Set<string>} selectedGroups
 * @param {string} term already trimmed
 * @param {SearchResult|null} searchResult
 * @return {Array<Object>}
 */
export function visibleItems(items, selectedGroups, term, searchResult) {
  const order = searchResult !== null && !searchResult.fallback && searchResult.term === term
    ? searchResult.order
    : null;
  if (term === '' || order === null) {
    return filterItems(items, selectedGroups, term);
  }
  return items
    .filter((item) => (selectedGroups.size === 0 || selectedGroups.has(item.group)) && order.has(item.cType))
    .sort((a, b) => order.get(a.cType) - order.get(b.cType));
}
