/**
 * Shared promise-level cache for the ?veFieldOptions=1 endpoint. Both the
 * field chooser popover and the per-output context affordance need the same
 * payload - the affordance on every hover (to resolve the hovered output's
 * form group), the popover when it opens - so the parsed response is cached
 * per record and fetched at most once. The PROMISE is cached, not the value:
 * concurrent callers (hover while the popover is loading) share one in-flight
 * request. Failed loads are evicted so a later call retries instead of
 * replaying the cached rejection forever. Dependency-free on purpose - it is
 * imported from lazily loaded component modules and from the affordance.
 */

/** @type {Map<string, Promise<object>>} */
const cache = new Map();

/**
 * Fetches and parses one record's field options. Rejects on transport errors,
 * non-OK responses and payloads carrying an "error" key.
 * @param {string} table
 * @param {number} uid
 * @return {Promise<object>}
 */
async function requestFieldOptions(table, uid) {
  const response = await fetch(
    window.location.pathname
      + '?veFieldOptions=1&editMode=1&table=' + encodeURIComponent(table) + '&uid=' + uid,
    {headers: {'X-Request-Token': window.veInfo?.token ?? ''}},
  );
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || ('HTTP ' + response.status));
  }
  return data;
}

/**
 * Resolves the parsed ?veFieldOptions=1 payload for one record, from the
 * cache when it was already requested. The payload carries table, uid,
 * recordType, the ordered fields[] list (with group and tab per field) and
 * the fieldGroups map (every showitem field name to its group label).
 * @param {string} table
 * @param {number} uid
 * @return {Promise<object>}
 */
export function fetchFieldOptions(table, uid) {
  const key = table + ':' + uid;
  let promise = cache.get(key);
  if (promise === undefined) {
    promise = requestFieldOptions(table, uid);
    cache.set(key, promise);
    promise.catch(() => {
      // Evict only our own entry: the cache may have been cleared (and the
      // key refilled by a newer request) before this rejection settled.
      if (cache.get(key) === promise) {
        cache.delete(key);
      }
    });
  }
  return promise;
}

/**
 * Drops every cached payload so the next fetchFieldOptions() call hits the
 * server again - called after saves, when the cached values (and the staging
 * baselines seeded from them) would be stale.
 */
export function clearFieldOptionsCache() {
  cache.clear();
}
