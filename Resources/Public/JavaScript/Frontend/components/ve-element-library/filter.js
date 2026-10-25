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

/**
 * The remembered category selection narrowed to the categories the catalog
 * offers. The selection persists across pages and sites, so it can name a
 * group this catalog does not have (another site's group, or one a catalog
 * provider has since renamed); kept, it would empty the list with no chip
 * left to unselect.
 *
 * @param {Set<string>} selectedGroups
 * @param {string[]} categories
 * @return {Set<string>}
 */
export function offeredGroups(selectedGroups, categories) {
  const offered = new Set(categories);

  return new Set([...selectedGroups].filter((group) => offered.has(group)));
}
