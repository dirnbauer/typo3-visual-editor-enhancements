import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {isElementRefreshEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {clearFieldOptionsCache} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';
import {recordTree, treeHasStagedData} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';

/**
 * Partial element refresh after a successful save.
 *
 * The visual editor reloads NOTHING on a successful save (the backend save
 * button's reloadAllChildFrames() runs only when the save FAILED). Inline
 * text/rich-text/link edits are already correct in the DOM, but the fields
 * staged through the field chooser popover (select, check, color, link,
 * category) are rendered SERVER-side, so their element keeps its stale
 * rendering after the save. This module re-fetches the current page in the
 * background and swaps only the affected <ve-content-element> wrappers, so
 * the scroll position and every other element's editor state stay untouched
 * - a full frame reload (which restores only an APPROXIMATE scroll position
 * via the vendor's sessionStorage scroll sync) is the fallback, not the
 * happy path. The extension's MutationObserver sweep in Frontend/index.js
 * re-injects the action-bar buttons and per-output affordances into the
 * swapped element automatically, so no manual re-injection happens here.
 *
 * Independent of any re-render, the shared ?veFieldOptions=1 cache is
 * dropped on EVERY save: the frame no longer reloads, so a reopened popover
 * would otherwise re-seed stale setInitialData baselines from the cached
 * payload (values from before the save), corrupting the pending-change diff.
 *
 * The store's markSaved() deep-merges the staged data into initialData and
 * then reset() clears it BEFORE dispatching the 'saved' change event - when
 * 'saved' arrives, store.data is already empty. The listener therefore keeps
 * a running snapshot of store.data/store.cmdArray on every 'data'/'cmd'/
 * 'initial' change and consumes the last snapshot when 'saved' fires.
 *
 * Swapped-in elements come from a DOMParser document, whose scripts are
 * inert ("already started"); reExecuteScripts() re-creates them in place so
 * per-element inline scripts run again. After the swap (and the scripts) a
 * bubbling 've:element-refreshed' CustomEvent is dispatched on the new
 * element as a hook for site JS that needs to re-initialize behavior.
 *
 * Structural entry changes (refreshElement) that had to wait because the
 * element held staged text are remembered as deferred roots: the next
 * successful save refreshes them even when every staged field of the save
 * was inline-covered - the server-side change (a new, moved or removed
 * entry) is not in the DOM yet, whatever the staged text says.
 *
 * Fallback semantics: structural changes (cmdArray entries from drag/drop,
 * copy, delete) are left alone - the vendor already updated the DOM
 * optimistically. A record whose wrapper cannot be found (before or after
 * the fetch), a non-OK response or any fetch/parse error triggers
 * window.location.reload() on the frame instead - a stale rendering would
 * be worse than the approximate scroll restore.
 */

/**
 * Last known staged state, continuously captured from the store's 'change'
 * events because the 'saved' event fires only after the store was cleared.
 * @type {{data: Object, cmdArray: Object[]}|null}
 */
let lastSnapshot = null;

/** Concurrency guard: one handleSaved run at a time, overlapping runs drop. */
let refreshing = false;

/**
 * Elements whose structural change is on the server but not yet on the page
 * (refreshElement skipped them for staged text): wrapper selector -> the
 * entries they own. Consumed by the next successful save.
 * @type {Map<string, Array<{table: string, uid: number}>>}
 */
const deferredRefreshes = new Map();

/**
 * Remembers an element whose re-render waits for the next Save.
 * @param {string} table
 * @param {number|string} uid
 * @param {Array<{table: string, uid: number}>} records the entries it owns
 */
export function deferElementRefresh(table, uid, records = []) {
  deferredRefreshes.set(wrapperSelector(table, String(uid)), records);
}

export function initializeElementRefresh() {
  if (!isElementRefreshEnabled()) {
    return;
  }
  dataHandlerStore.addEventListener('change', (event) => {
    const kind = event.detail?.kind;
    if (kind === 'data' || kind === 'cmd' || kind === 'initial') {
      // The getters return structuredClone snapshots, so this state cannot
      // be mutated away by later store changes or the reset() on save.
      lastSnapshot = {data: dataHandlerStore.data, cmdArray: dataHandlerStore.cmdArray};
      return;
    }
    if (kind === 'saved') {
      const snapshot = lastSnapshot;
      lastSnapshot = null;
      handleSaved(snapshot);
    }
  });
}

/**
 * @param {{data: Object, cmdArray: Object[]}|null} snapshot the staged state
 *   as it was just before the save cleared the store
 */
async function handleSaved(snapshot) {
  // Always first, even when nothing needs a re-render (or an overlapping run
  // drops below): the cached payloads carry pre-save values and would seed
  // stale setInitialData baselines when a popover is (re)opened.
  clearFieldOptionsCache();
  if (refreshing || (!snapshot && deferredRefreshes.size === 0)) {
    return;
  }
  refreshing = true;
  try {
    /** @type {Map<string, Element>} wrapper selector -> live wrapper */
    const staleWrappers = new Map();
    let fullReload = false;
    // Deferred structural changes first: regardless of what the save held.
    const deferred = [...deferredRefreshes.keys()];
    for (const selector of deferred) {
      const wrapper = document.querySelector(selector);
      if (wrapper === null) {
        deferredRefreshes.delete(selector); // the element is gone: nothing left to show
      } else {
        staleWrappers.set(selector, wrapper);
      }
    }
    // Structural changes (move/copy/delete) of the vendor's drag/drop: it
    // already updated the DOM optimistically - do not interfere.
    const data = snapshot && snapshot.cmdArray.length === 0 ? snapshot.data : {};
    for (const [table, records] of Object.entries(data)) {
      for (const [uid, fields] of Object.entries(records)) {
        if (Object.keys(fields).every((field) => isInlineCovered(table, uid, field))) {
          continue; // every changed field is inline-edited: DOM already correct
        }
        const selector = wrapperSelector(table, uid);
        const wrapper = document.querySelector(selector) ?? [...document.querySelectorAll('ve-editable-text, ve-editable-rich-text')]
          .find((output) => output.getAttribute('table') === table && output.getAttribute('uid') === String(uid))?.closest('ve-content-element');
        if (wrapper === null) {
          fullReload = true;
        } else {
          staleWrappers.set(wrapperSelector(wrapper.getAttribute('table'), wrapper.getAttribute('uid')), wrapper);
        }
      }
    }
    if (staleWrappers.size === 0 && !fullReload) {
      return; // nothing server-rendered changed: no fetch needed
    }
    if (!fullReload) {
      const records = deferred.flatMap((selector) => deferredRefreshes.get(selector) ?? []);
      fullReload = !(await refreshWrappers(staleWrappers, records));
      if (!fullReload) { deferred.forEach((selector) => deferredRefreshes.delete(selector)); }
    }
    if (dataHandlerStore.changesCount > 0 || dataHandlerStore.invalidCount > 0) { return; }
    if (fullReload) {
      // Vendor scroll sync restores the approximate position on reload;
      // keeping a stale rendering would be worse.
      window.location.reload();
    }
  } catch {
    if (dataHandlerStore.changesCount === 0 && dataHandlerStore.invalidCount === 0) { window.location.reload(); }
  } finally {
    refreshing = false;
  }
}

/**
 * Whether a changed field is covered by an inline editor whose DOM the
 * vendor already updated while typing - such a field needs no re-render.
 * Deliberately NOT counted as covered: <ve-editable-link> - it only stages
 * the typolink and never rewrites the surrounding server-rendered anchor,
 * so link-field changes must swap the element to show the fresh href.
 * The attribute values are structurally safe (table names, numeric uids,
 * TCA field names); CSS.escape stays as defense in depth.
 * @param {string} table
 * @param {string} uid
 * @param {string} field
 * @return {boolean}
 */
function isInlineCovered(table, uid, field) {
  const attributes = `[table="${CSS.escape(table)}"][uid="${CSS.escape(uid)}"][field="${CSS.escape(field)}"]`;
  return document.querySelector(
    `ve-editable-text${attributes}, ve-editable-rich-text${attributes}`,
  ) !== null;
}

/**
 * The wrapper's id attribute is "<table>:<uid>" with the localized/versioned
 * uid - the same uid the store stages against (see the vendor's
 * ContentElementWrapperService). The colon rules out an #id selector, hence
 * the attribute selector with CSS.escape.
 * @param {string} table
 * @param {string} uid
 * @return {string}
 */
function wrapperSelector(table, uid) {
  return `ve-content-element[id="${CSS.escape(table + ':' + uid)}"]`;
}

/**
 * Fetches the current page once and swaps every stale wrapper for its fresh
 * counterpart. Custom elements upgrade automatically on insertion.
 * @param {Map<string, Element>} staleWrappers wrapper selector -> live wrapper
 * @param {Array<{table: string, uid: number}>} records further records owned
 *   by the wrappers (the entries the inspector lists)
 * @return {Promise<boolean>} false when a full reload is needed instead
 */
async function refreshWrappers(staleWrappers, records = []) {
  const response = await fetch(window.location.href, {cache: 'no-store', credentials: 'same-origin'});
  if (!response.ok) {
    return false;
  }
  // Typing while the request ran: never replace a wrapper holding staged text.
  if ([...staleWrappers.values()].some((wrapper) => wrapperHasStagedData(wrapper, records))) { return false; }
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  for (const [selector, wrapper] of staleWrappers) {
    const fresh = parsed.querySelector(selector);
    if (fresh === null) {
      return false;
    }
    const imported = document.importNode(fresh, true);
    wrapper.replaceWith(imported);
    reExecuteScripts(imported);
    imported.dispatchEvent(new CustomEvent('ve:element-refreshed', {bubbles: true}));
  }
  return true;
}

/**
 * Scripts parsed by DOMParser never execute, not even when adopted into the
 * live document ("already started" flag) - replacing each with an equivalent
 * fresh script element makes the browser run it.
 * @param {Element} root
 */
function reExecuteScripts(root) {
  for (const oldScript of root.querySelectorAll('script')) {
    const newScript = document.createElement('script');
    for (const attribute of oldScript.attributes) {
      newScript.setAttribute(attribute.name, attribute.value);
    }
    newScript.textContent = oldScript.textContent;
    oldScript.replaceWith(newScript);
  }
}

/**
 * The records a wrapper owns: its own row, the editables rendered inside it
 * and the given entries. Only staged data in THIS tree keeps the wrapper -
 * staged text in another element never blocks its refresh (plan 2.5).
 * @param {Element} wrapper
 * @param {Array<{table: string, uid: number}>} records
 * @return {boolean}
 */
function wrapperHasStagedData(wrapper, records = []) {
  const editables = [...wrapper.querySelectorAll('[table][uid]')]
    .filter((node) => node.localName.startsWith('ve-editable-'))
    .map((node) => ({table: node.getAttribute('table'), uid: node.getAttribute('uid')}));
  const tree = recordTree({table: wrapper.getAttribute('table'), uid: wrapper.getAttribute('uid')}, editables, records);
  return treeHasStagedData(dataHandlerStore, tree);
}

/**
 * Re-renders one content element after a structural entry change. Skipped
 * (false) when the element's own record tree has staged or invalid data -
 * the change is then on the server, the element is remembered as deferred
 * and the next successful Save re-renders it (the 'saved' refresh above),
 * even when everything that save held was inline-covered text.
 * @param {string} table
 * @param {number} uid
 * @param {{records?: Array<{table: string, uid: number}>}} options
 * @return {Promise<boolean>}
 */
export async function refreshElement(table, uid, {records = []} = {}) {
  const selector = wrapperSelector(table, String(uid));
  const wrapper = document.querySelector(selector);
  if (!wrapper) { return false; }
  if (wrapperHasStagedData(wrapper, records)) {
    deferElementRefresh(table, uid, records);
    return false;
  }
  const refreshed = await refreshWrappers(new Map([[selector, wrapper]]), records);
  // Text was staged while the request ran: the swap waits for Save as well.
  if (!refreshed && wrapper.isConnected && wrapperHasStagedData(wrapper, records)) { deferElementRefresh(table, uid, records); }
  if (refreshed) { deferredRefreshes.delete(selector); }
  return refreshed;
}
