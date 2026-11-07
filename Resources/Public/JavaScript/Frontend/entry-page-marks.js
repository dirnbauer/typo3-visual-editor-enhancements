// Relative, like the other node-tested modules: no import map in node.
import {translate} from '../Shared/dom-utils.js';

/**
 * Hidden entries never look live on the page (plan 2.3). The inspector knows
 * every listed entry's identity and visibility field; this module marks the
 * entry's renderings on the page:
 *   - every `ve-editable-text|ve-editable-rich-text[table][uid]` of a hidden
 *     entry gets `data-ve-entry-hidden` (+ the "Hidden on the live site"
 *     tooltip), styled by Resources/Public/Css/editable-overrides.css;
 *   - a row marker of that entry (f:mark.item, `data-ve-item`) follows the
 *     same state through `data-ve-item-hidden`;
 *   - the entry whose inspector row has focus gets `data-ve-entry-active`.
 * The marks follow the vendor store, not only the server: a staged un-hide
 * removes them at once, Reset and Save (store 'saved') re-derive them.
 * Attributes only - nothing is inserted into the page.
 */

const EDITABLE_TAGS = ['ve-editable-text', 've-editable-rich-text'];

/** @param {unknown} value a stored or staged check value (bool, 0/1, '0'/'1') */
const truthy = (value) => value === true || value === 1 || value === '1';

/**
 * The visibility an entry has right now: the staged value, else the store's
 * baseline (seeded by the inspector, follows Save), else the server payload.
 * @param {{table: string, uid: number, hidden?: boolean, hiddenField?: string}} child
 * @param {object} data dataHandlerStore.data
 * @param {object} initialData dataHandlerStore.initialData
 * @return {boolean}
 */
export function effectiveHidden(child, data, initialData) {
  const field = child.hiddenField;
  if (!field) {
    return !!child.hidden;
  }
  const staged = data?.[child.table]?.[child.uid]?.[field];
  if (staged !== undefined) {
    return truthy(staged);
  }
  const initial = initialData?.[child.table]?.[child.uid]?.[field];
  return initial !== undefined ? truthy(initial) : !!child.hidden;
}

/**
 * @param {Array<{table: string, uid: number, liveUid?: number, state?: string, hidden?: boolean, hiddenField?: string}>} children
 * @param {{data: object, initialData: object}} store
 * @return {Array<{table: string, uid: number, liveUid: number|null, hidden: boolean}>}
 */
export function entryMarkPlan(children, store) {
  const data = store.data;
  const initialData = store.initialData;
  return (children ?? [])
    .filter((child) => child?.table && Number.isInteger(Number(child.uid)) && child.state !== 'deleted')
    .map((child) => ({table: child.table, uid: Number(child.uid), liveUid: child.liveUid ?? null,
      hidden: effectiveHidden(child, data, initialData)}));
}

/**
 * Applies one plan entry to its nodes. Our own tooltip is tracked with
 * `data-ve-entry-title` so a template's own title is never removed.
 * @param {Array<Element>} editables the entry's editables
 * @param {Array<Element>} markers the entry's f:mark.item renderings
 * @param {boolean} hidden
 * @param {string} title
 */
export function applyEntryMark(editables, markers, hidden, title) {
  for (const node of editables) {
    node.toggleAttribute('data-ve-entry-hidden', hidden);
    if (hidden && !node.hasAttribute('title')) {
      node.setAttribute('title', title);
      node.setAttribute('data-ve-entry-title', '');
    } else if (!hidden && node.hasAttribute('data-ve-entry-title')) {
      node.removeAttribute('title');
      node.removeAttribute('data-ve-entry-title');
    }
  }
  for (const node of markers) {
    node.toggleAttribute('data-ve-item-hidden', hidden);
    if (hidden && !node.hasAttribute('title')) {
      node.setAttribute('title', title);
      node.setAttribute('data-ve-item-title', '');
    } else if (!hidden && node.hasAttribute('data-ve-item-title')) {
      node.removeAttribute('title');
      node.removeAttribute('data-ve-item-title');
    }
  }
}

/* ------------------------------------------------------------------ DOM -- */

/**
 * @param {ParentNode} root
 * @param {{table: string, uid: number}} entry
 */
export function entryEditables(root, entry) {
  const uid = CSS.escape(String(entry.uid));
  const table = CSS.escape(entry.table);
  return [...root.querySelectorAll(EDITABLE_TAGS.map((tag) => `${tag}[table="${table}"][uid="${uid}"]`).join(','))];
}

/**
 * @param {ParentNode} root
 * @param {{table: string, uid: number, liveUid: number|null}} entry
 */
function entryMarkers(root, entry) {
  const own = `[data-ve-item="${CSS.escape(`${entry.table}:${entry.uid}`)}"]`;
  const live = entry.liveUid ? `,[data-ve-item^="${CSS.escape(`${entry.table}:`)}"][data-ve-item-live="${CSS.escape(String(entry.liveUid))}"]` : '';
  return [...root.querySelectorAll(own + live)];
}

/**
 * Marks every listed entry of one element on the page.
 * @param {ParentNode|null} root the element's ve-content-element
 * @param {Array<object>} children the inspector's entries (all collections)
 * @param {{data: object, initialData: object}} store
 */
export function markEntries(root, children, store) {
  if (!root) {
    return;
  }
  const title = translate('frontend.inlineRecords.hiddenOnPage', 'Hidden on the live site');
  for (const entry of entryMarkPlan(children, store)) {
    applyEntryMark(entryEditables(root, entry), entryMarkers(root, entry), entry.hidden, title);
  }
}

/**
 * Highlights the renderings of the entry whose inspector row has focus
 * (null clears it).
 * @param {ParentNode|null} root
 * @param {{table: string, uid: number}|null} entry
 */
export function setActiveEntry(root, entry) {
  for (const node of document.querySelectorAll('[data-ve-entry-active]')) {
    node.removeAttribute('data-ve-entry-active');
  }
  if (root && entry) {
    for (const node of entryEditables(root, entry)) {
      node.setAttribute('data-ve-entry-active', '');
    }
  }
}

/**
 * Keeps the marks in sync with the store until the returned function is
 * called. getRoot is asked on every change: an element refresh replaces the
 * wrapper.
 * @param {EventTarget & {data: object, initialData: object}} store the vendor dataHandlerStore
 * @param {() => ParentNode|null} getRoot
 * @param {() => Array<object>} getChildren
 * @return {() => void}
 */
export function trackEntryMarks(store, getRoot, getChildren) {
  const update = () => markEntries(getRoot(), getChildren(), store);
  store.addEventListener('change', update);
  update();
  return () => store.removeEventListener('change', update);
}
