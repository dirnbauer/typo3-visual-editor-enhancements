// Relative, like the other node-tested modules: no import map in node.
import {translate} from '../Shared/dom-utils.js';

/**
 * Collection entries ("rows") on the page, found through the markers the
 * f:mark.item ViewHelper writes in edit mode:
 *   data-ve-item="<table>:<uid>"  data-ve-item-live="<uid>"
 *   data-ve-collection="<field>"  data-ve-item-hidden (hidden entries)
 * No DOM geometry is ever inferred and nothing is inserted into the page:
 * the injection sweep only reads these attributes and sets a title on hidden
 * rows. Templates without markers fall back to the editables of an entry
 * (`ve-editable-text|ve-editable-rich-text[table][uid]`).
 *
 * The functions on plain descriptors are pure (Tests/JavaScript/collection-rows.test.js);
 * the DOM adapters below them feed them.
 */

/**
 * @typedef {{item: string, live: string, collection: string, parent: string, hasEditable: boolean, hidden: boolean, node?: Element}} Marker
 * @typedef {{item: string, live: string, table: string, uid: number, hidden: boolean, primary: Marker, markers: Marker[]}} Row
 * @typedef {{parent: string, collection: string, rows: Map<string, Row>}} RowGroup
 */

/**
 * @param {string|null|undefined} value "<table>:<uid>"
 * @return {{table: string, uid: number}|null}
 */
export function parseItem(value) {
  const match = /^([A-Za-z0-9_]+):(\d+)$/.exec(value ?? '');
  return match ? {table: match[1], uid: Number(match[2])} : null;
}

/** @param {string} parent @param {string} collection */
export const groupKey = (parent, collection) => `${parent}|${collection}`;

/**
 * Groups markers by parent (the enclosing entry or the content element) and
 * collection field. One entry rendered by several loops (10 desiderio
 * collections render their children in 2-4 loops - tabs and panels, nav and
 * slides) is one row; its primary marker is the first one containing an
 * editable, else the first one.
 * @param {Marker[]} markers in document order
 * @return {Map<string, RowGroup>}
 */
export function groupMarkers(markers) {
  /** @type {Map<string, RowGroup>} */
  const groups = new Map();
  for (const marker of markers) {
    const parsed = parseItem(marker.item);
    if (parsed === null || !marker.collection || !marker.parent) {
      continue;
    }
    const key = groupKey(marker.parent, marker.collection);
    let group = groups.get(key);
    if (group === undefined) {
      group = {parent: marker.parent, collection: marker.collection, rows: new Map()};
      groups.set(key, group);
    }
    const row = group.rows.get(marker.item);
    if (row === undefined) {
      group.rows.set(marker.item, {item: marker.item, live: marker.live, ...parsed, hidden: marker.hidden, primary: marker, markers: [marker]});
      continue;
    }
    row.markers.push(marker);
    row.hidden ||= marker.hidden;
    if (!row.primary.hasEditable && marker.hasEditable) {
      row.primary = marker;
    }
  }
  return groups;
}

/**
 * Joins the entries panel's children (server payload) to the rows on the
 * page: by the uid the editables stage against first, then by the live uid
 * - a translated and versioned child is rendered under its overlay uid while
 * the panel may list another one. `liveUid` is display/join data only.
 * @param {RowGroup|undefined} group
 * @param {Array<{uid: number, table: string, liveUid?: number}>} children
 * @return {Map<number, Row>} child uid -> row
 */
export function joinChildren(group, children) {
  /** @type {Map<number, Row>} */
  const joined = new Map();
  if (!group) {
    return joined;
  }
  const rows = [...group.rows.values()];
  for (const child of children ?? []) {
    const byUid = group.rows.get(`${child.table}:${child.uid}`);
    const byLive = byUid ?? (child.liveUid !== undefined && child.liveUid !== null
      ? rows.find((row) => row.table === child.table && row.live === String(child.liveUid))
      : undefined);
    if (byLive) {
      joined.set(child.uid, byLive);
    }
  }
  return joined;
}

/**
 * Without markers there are no row bounds - only the entry's editables can
 * be found (dimming and focus still work, the highlight does not).
 * @param {Array<{table: string, uid: string|number, node?: Element}>} editables
 * @param {Array<{uid: number, table: string}>} children
 * @return {Map<number, Array<{table: string, uid: string|number, node?: Element}>>}
 */
export function editablesByChild(editables, children) {
  const byChild = new Map();
  for (const child of children ?? []) {
    const own = (editables ?? []).filter((editable) => editable.table === child.table && String(editable.uid) === String(child.uid));
    if (own.length > 0) {
      byChild.set(child.uid, own);
    }
  }
  return byChild;
}

/* ------------------------------------------------------------------ DOM -- */

const EDITABLES = 've-editable-text, ve-editable-rich-text';

/**
 * The parent of a marker: the nearest enclosing marker (a nested collection)
 * or the content element (its id is "<table>:<uid>").
 * @param {Element} node
 * @return {string}
 */
function parentOf(node) {
  const enclosing = node.parentElement?.closest('[data-ve-item], ve-content-element');
  if (!enclosing) {
    return '';
  }
  return enclosing.hasAttribute('data-ve-item') ? enclosing.getAttribute('data-ve-item') ?? '' : enclosing.getAttribute('id') ?? '';
}

/**
 * @param {ParentNode} root a ve-content-element (its slotted light DOM) or a document
 * @return {Marker[]}
 */
export function collectMarkers(root) {
  return [...root.querySelectorAll('[data-ve-item][data-ve-collection]')].map((node) => ({
    item: node.getAttribute('data-ve-item') ?? '',
    live: node.getAttribute('data-ve-item-live') ?? '',
    collection: node.getAttribute('data-ve-collection') ?? '',
    parent: parentOf(node),
    hasEditable: node.matches(EDITABLES) || node.querySelector(EDITABLES) !== null,
    hidden: node.hasAttribute('data-ve-item-hidden'),
    node,
  }));
}

/**
 * The rows of one collection of one parent record.
 * @param {Element} element the ve-content-element
 * @param {{table: string, uid: number}} parent the record owning the collection
 * @param {string} collection the collection field
 * @return {RowGroup|undefined}
 */
export function rowsOf(element, parent, collection) {
  return groupMarkers(collectMarkers(element)).get(groupKey(`${parent.table}:${parent.uid}`, collection));
}

/**
 * Mirror highlight, page side: outlines every rendering of a row (CSS
 * `[data-ve-item-highlight]` in editable-overrides.css). The entries panel
 * calls it while one of its rows is hovered or focused.
 * @param {Row|undefined} row
 * @param {boolean} on
 */
export function highlightRow(row, on) {
  for (const marker of row?.markers ?? []) {
    marker.node?.toggleAttribute('data-ve-item-highlight', on);
  }
}

/**
 * Mirror highlight, panel side: reports the row under the pointer or focus
 * on the page ({collection, item, live} of its marker, null when it leaves),
 * so the panel can highlight its own row. Returns the unsubscribe function.
 * @param {Element} element the ve-content-element
 * @param {(row: {collection: string, item: string, live: string}|null) => void} callback
 * @return {() => void}
 */
export function onPageRow(element, callback) {
  let current = null;
  const report = (event) => {
    const marker = event.target instanceof Element ? event.target.closest('[data-ve-item][data-ve-collection]') : null;
    const next = marker && element.contains(marker) ? marker : null;
    if (next === current) {
      return;
    }
    current = next;
    callback(next === null ? null : {collection: next.getAttribute('data-ve-collection') ?? '',
      item: next.getAttribute('data-ve-item') ?? '', live: next.getAttribute('data-ve-item-live') ?? ''});
  };
  const leave = () => { if (current !== null) { current = null; callback(null); } };
  element.addEventListener('pointerover', report);
  element.addEventListener('focusin', report);
  element.addEventListener('pointerleave', leave);
  return () => {
    element.removeEventListener('pointerover', report);
    element.removeEventListener('focusin', report);
    element.removeEventListener('pointerleave', leave);
  };
}

/**
 * Injection sweep hook: hidden entries announced by their marker get a
 * tooltip saying why they look dimmed (the dimming itself is CSS, present
 * from the first render). Attributes only; idempotent.
 * @param {Element} element the ve-content-element
 */
export function annotateCollectionRows(element) {
  const title = translate('frontend.inlineRecords.hiddenOnPage', 'Hidden on the live site');
  for (const node of element.querySelectorAll('[data-ve-item][data-ve-item-hidden]:not([title])')) {
    node.setAttribute('title', title);
    node.setAttribute('data-ve-item-title', '');
  }
  // A row shown again (re-rendered without the flag) loses only our own title.
  for (const node of element.querySelectorAll('[data-ve-item][data-ve-item-title]:not([data-ve-item-hidden])')) {
    node.removeAttribute('title');
    node.removeAttribute('data-ve-item-title');
  }
}
