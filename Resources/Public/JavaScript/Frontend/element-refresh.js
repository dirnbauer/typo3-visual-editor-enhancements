import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {isElementRefreshEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config';
import {clearFieldOptionsCache} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache';

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
  if (refreshing || !snapshot) {
    return;
  }
  if (snapshot.cmdArray.length > 0) {
    // Structural changes (move/copy/delete): the vendor's drag/drop already
    // updated the DOM optimistically - do not interfere.
    return;
  }
  refreshing = true;
  try {
    /** @type {Map<string, Element>} wrapper selector -> live wrapper */
    const staleWrappers = new Map();
    let fullReload = false;
    for (const [table, records] of Object.entries(snapshot.data)) {
      for (const [uid, fields] of Object.entries(records)) {
        if (Object.keys(fields).every((field) => isInlineCovered(table, uid, field))) {
          continue; // every changed field is inline-edited: DOM already correct
        }
        const selector = wrapperSelector(table, uid);
        const wrapper = document.querySelector(selector);
        if (wrapper === null) {
          fullReload = true;
        } else {
          staleWrappers.set(selector, wrapper);
        }
      }
    }
    if (staleWrappers.size === 0 && !fullReload) {
      return; // nothing server-rendered changed: no fetch needed
    }
    if (!fullReload) {
      fullReload = !(await refreshWrappers(staleWrappers));
    }
    if (fullReload) {
      // Vendor scroll sync restores the approximate position on reload;
      // keeping a stale rendering would be worse.
      window.location.reload();
    }
  } catch {
    window.location.reload();
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
 * @return {Promise<boolean>} false when a full reload is needed instead
 */
async function refreshWrappers(staleWrappers) {
  const response = await fetch(window.location.href, {cache: 'no-store', credentials: 'same-origin'});
  if (!response.ok) {
    return false;
  }
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
