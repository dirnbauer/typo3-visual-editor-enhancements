/**
 * Pure client-side filter for the element library panel - the FALLBACK used
 * while the first server search request is in flight and whenever the
 * server-side (typo-tolerant) search endpoint is unreachable.
 *
 * Category chips combine as OR within the selection, AND with the search
 * term. The search matches the (already localized) element title, description,
 * keywords and synonyms - never the content of the seeded demo records.
 *
 * @typedef {Object} LibraryItem
 * @property {string} cType
 * @property {string} title
 * @property {string} description
 * @property {string} group
 * @property {string[]} [keywords]
 * @property {string[]} [synonyms]
 *
 * @param {LibraryItem[]} items
 * @param {Set<string>} selectedGroups
 * @param {string} searchTerm
 * @return {LibraryItem[]}
 */
export function filterItems(items, selectedGroups, searchTerm) {
  const term = (searchTerm || '').trim().toLowerCase();

  return items.filter((item) => {
    if (selectedGroups.size > 0 && !selectedGroups.has(item.group)) {
      return false;
    }
    if (term === '') {
      return true;
    }
    const haystack = [
      item.title,
      item.description,
      (item.keywords || []).join(' '),
      (item.synonyms || []).join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(term);
  });
}
