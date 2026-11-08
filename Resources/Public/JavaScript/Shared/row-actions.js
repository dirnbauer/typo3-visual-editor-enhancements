// Relative, like the other node-tested modules: no import map in node.
import {collectionLimit, collectionReason, deleteRefusal, inlineLabel} from './inline-record-actions.js';

/**
 * The per-entry actions of a collection, shared by the entries inspector
 * (Frontend/components/ve-field-chooser/collections.js) and the on-page row
 * toolbar (Frontend/components/ve-row-actions.js): the same intents, the same
 * refusal reasons, decided from the same server payload. Pure - no DOM.
 */

/** The rows that still exist as entries (placeholders of a workspace deletion are listed read-only). */
export const activeChildren = (field) => (field.children ?? []).filter((child) => child.state !== 'deleted');

/**
 * Ordered uids the server compiled (field.uids) - the identities of a move.
 * @return {number[]}
 */
function orderedUids(field) {
  const active = activeChildren(field).map((child) => child.uid);
  const uids = Array.isArray(field.uids) ? field.uids.filter((uid) => active.includes(uid)) : [];
  return uids.length === active.length ? uids : active;
}

/**
 * The `afterUid` of moving one step: up = after the row two above (null =
 * first position), down = after the next row.
 * @return {{afterUid: number|null}|null} null when the row cannot move that way
 */
export function moveTarget(field, child, direction) {
  const uids = orderedUids(field);
  const index = uids.indexOf(child.uid);
  if (index < 0) { return null; }
  if (direction === 'up') {
    return index === 0 ? null : {afterUid: index >= 2 ? uids[index - 2] : null};
  }
  return index >= uids.length - 1 ? null : {afterUid: uids[index + 1]};
}

/**
 * Why a new entry cannot be created in this collection right now ('' = it can).
 * @param {object} field
 * @param {string} blocked the reason blocking every structural action ('' = none)
 */
export function createRefusal(field, blocked = '') {
  return blocked || (field.createReason ? collectionReason(field.createReason) : (field.canCreate === false ? inlineLabel('controls') : ''));
}

/**
 * Whether the server offers Duplicate at all: an older server publishes no
 * `canDuplicate`, and then there is no Duplicate control (not a refused one).
 * @param {object} child
 */
export const duplicateOffered = (child) => typeof child.canDuplicate === 'boolean';

/**
 * Undo removal of a workspace delete placeholder: offered when the server
 * publishes `canRestore` for it; refused with `restoreReason`.
 * @param {object} child
 * @param {string} blocked
 * @return {{offered: boolean, reason: string}}
 */
export function restoreControl(child, blocked = '') {
  if (child.state !== 'deleted' || typeof child.canRestore !== 'boolean') {
    return {offered: false, reason: ''};
  }
  return {offered: true, reason: blocked || (child.canRestore ? '' : collectionReason(child.restoreReason) || inlineLabel('controls'))};
}

/**
 * The reason each control of one entry is refused, '' when it is allowed.
 * @param {object} field the collection payload
 * @param {object} child the entry
 * @param {string} blocked reason blocking every structural action ('' = none)
 * @param {string} rowBlocked reason holding this entry's Remove (its staged text)
 * @return {{up: string, down: string, eye: string, after: string, remove: string, duplicate: string, title: string}}
 */
export function rowReasons(field, child, blocked = '', rowBlocked = '') {
  const sort = field.sortReason ? collectionReason(field.sortReason) : '';
  const create = createRefusal(field, blocked);
  return {
    up: blocked || sort,
    down: blocked || sort,
    eye: child.canHide === false ? collectionReason(child.hideReason) || inlineLabel('controls') : '',
    after: create,
    remove: blocked || deleteRefusal(child) || rowBlocked,
    duplicate: duplicateOffered(child)
      ? blocked || (child.canDuplicate ? '' : collectionReason(child.duplicateReason) || inlineLabel('controls'))
      : '',
    title: child.canEditLabel === false ? collectionReason(child.labelReason) : '',
  };
}

/**
 * Where Core's FormEngine puts the "create new" link of this collection
 * (TCA appearance.levelLinksPosition): top, bottom, both or none. The on-page
 * add button follows it. A payload without the key (an older server) gets
 * the button after the last entry, where new entries are appended.
 * @param {object} field
 * @return {'top'|'bottom'|'both'|'none'}
 */
export function levelLinksPosition(field) {
  const position = field.levelLinksPosition;
  return ['top', 'bottom', 'both', 'none'].includes(position) ? position : 'bottom';
}

/**
 * The on-page add buttons of one collection: one per side its levelLinks
 * position names, each refused with the collection's create reason (at the
 * maximum: the `max` reason; the client also counts, so a full collection
 * never offers a working button while the server payload is still in flight).
 * @param {object} field
 * @param {string} blocked
 * @return {Array<{side: 'top'|'bottom', reason: string}>}
 */
export function appenderPlan(field, blocked = '') {
  const position = levelLinksPosition(field);
  if (position === 'none' || field.type !== 'inline') {
    return [];
  }
  const max = collectionLimit(field.maxItems);
  const full = max > 0 && activeChildren(field).length >= max;
  const reason = createRefusal(field, blocked) || (full ? collectionReason('max') : '');
  const sides = position === 'both' ? ['top', 'bottom'] : [position];
  return sides.map((side) => ({side, reason}));
}

/**
 * Places the row toolbar for one entry: above the entry's box, right-aligned
 * (it never covers the entry's own text); inside its top-right corner when
 * there is no room above; clamped to the viewport. Null when the entry is
 * outside the viewport - the toolbar then hides.
 * @param {{top: number, right: number, bottom: number, left: number}} rect the entry's box
 * @param {{width: number, height: number}} size the toolbar's size
 * @param {{width: number, height: number}} viewport
 * @param {{gap?: number, edge?: number}} options
 * @return {{left: number, top: number, inside: boolean}|null}
 */
export function railPlacement(rect, size, viewport, {gap = 4, edge = 8} = {}) {
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewport.height || rect.left >= viewport.width
    || rect.right - rect.left <= 0 || rect.bottom - rect.top <= 0) {
    return null;
  }
  let top = rect.top - size.height - gap;
  let inside = false;
  if (top < edge) {
    top = rect.top + gap;
    inside = true;
  }
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const left = clamp(rect.right - size.width, edge, viewport.width - size.width - edge);
  return {left: Math.round(left), top: Math.round(clamp(top, edge, viewport.height - size.height - edge)), inside};
}

/**
 * Places an add button: full width of the collection's box (at least
 * `minWidth`), directly below its last entry (`bottom`) or above its first
 * (`top`). Null when that edge is outside the viewport.
 * @param {{top: number, right: number, bottom: number, left: number}} rect the box of the collection's entries
 * @param {'top'|'bottom'} side
 * @param {number} height the button's height
 * @param {{width: number, height: number}} viewport
 * @param {{gap?: number, minWidth?: number}} options
 * @return {{left: number, top: number, width: number}|null}
 */
export function appenderPlacement(rect, side, height, viewport, {gap = 6, minWidth = 160} = {}) {
  const top = side === 'top' ? rect.top - gap - height : rect.bottom + gap;
  if (top + height <= 0 || top >= viewport.height || rect.right <= 0 || rect.left >= viewport.width) {
    return null;
  }
  const width = Math.max(minWidth, Math.round(rect.right - rect.left));
  const left = Math.min(Math.max(Math.round(rect.left), 0), Math.max(0, viewport.width - width));
  return {left, top: Math.round(top), width: Math.min(width, viewport.width)};
}

/**
 * The union box of several boxes (the primary renderings of a collection's entries).
 * @param {Array<{top: number, right: number, bottom: number, left: number}>} rects
 * @return {{top: number, right: number, bottom: number, left: number}|null}
 */
export function unionRect(rects) {
  const boxes = rects.filter((rect) => rect && rect.right - rect.left > 0 && rect.bottom - rect.top > 0);
  if (boxes.length === 0) {
    return null;
  }
  return {
    top: Math.min(...boxes.map((rect) => rect.top)),
    left: Math.min(...boxes.map((rect) => rect.left)),
    bottom: Math.max(...boxes.map((rect) => rect.bottom)),
    right: Math.max(...boxes.map((rect) => rect.right)),
  };
}

/**
 * The part of a box its clipping ancestors leave visible (a carousel's
 * viewport, a scrolling list): the intersection of the box with each clip
 * box. Null when nothing is left.
 * @param {{top: number, right: number, bottom: number, left: number}} rect
 * @param {Array<{top: number, right: number, bottom: number, left: number}>} clips
 * @return {{top: number, right: number, bottom: number, left: number}|null}
 */
export function clipRect(rect, clips = []) {
  let box = {top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left};
  for (const clip of clips) {
    box = {top: Math.max(box.top, clip.top), left: Math.max(box.left, clip.left),
      bottom: Math.min(box.bottom, clip.bottom), right: Math.min(box.right, clip.right)};
  }
  return box.right - box.left > 0 && box.bottom - box.top > 0 ? box : null;
}
