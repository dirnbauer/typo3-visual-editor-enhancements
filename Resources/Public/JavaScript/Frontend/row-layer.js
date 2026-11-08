import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {collectionRowsMode, isInlineRecordsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';
import {collectionMessage, inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {activeChildren, appenderPlan, duplicateOffered, moveTarget, rowReasons, unionRect} from '@webconsulting/visual-editor-enhancements/Shared/row-actions.js';
import {caretDownIconSvg, caretUpIconSvg, duplicateIconSvg, formInsertAfterIconSvg, slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {collectMarkers, groupKey, groupMarkers, parseItem} from '@webconsulting/visual-editor-enhancements/Frontend/collection-rows.js';
import {effectiveHidden, markEntries} from '@webconsulting/visual-editor-enhancements/Frontend/entry-page-marks.js';
import {changeCollection, collectionBlockReason, elementHasStagedData, rowBlockReason, toggleEntryHidden} from '@webconsulting/visual-editor-enhancements/Frontend/inline-records.js';
import {deferElementRefresh, refreshElement} from '@webconsulting/visual-editor-enhancements/Frontend/element-refresh.js';
import {findEntryEditable, focusEditable} from '@webconsulting/visual-editor-enhancements/Frontend/add-entry.js';
import {getRowActions} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-row-actions.js';
import {getRowAppender} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-row-appender.js';

/**
 * The on-page row layer (User settings > Entries on the page,
 * `collectionRows`): for templates that mark their entries with f:mark.item.
 *  - `rows`: the row toolbar (Frontend/components/ve-row-actions.js) on the
 *    hovered or focused entry - move up/down, the staged eye, add after,
 *    remove, duplicate and item settings - plus the add buttons;
 *  - `appender`: only the add buttons (Frontend/components/ve-row-appender.js)
 *    after the last entry of each collection, while the element is hovered or
 *    holds the focus;
 *  - `panel`: nothing on the page.
 * Every action is the inspector's: the same server intents, the same refusal
 * reasons from the same payload (Shared/row-actions.js), the same confirm.
 * Unmarked templates get nothing (no DOM geometry is ever inferred); the
 * entries inspector stays the keyboard-complete path - this layer listens to
 * pointer and focus events only and never intercepts Tab.
 */

const MARKER = '[data-ve-item][data-ve-collection]';
const EDITABLES = 've-editable-text, ve-editable-rich-text';

/** @type {WeakSet<Element>} content elements whose listeners are wired */
const wired = new WeakSet();
/** @type {{pointer: Element|null, focus: Element|null, returnTo: HTMLElement|null}} */
const current = {pointer: null, focus: null, returnTo: null};
let showSeq = 0;
let busy = false;

/**
 * Injection sweep hook (Frontend/index.js); idempotent. A refreshed wrapper
 * is a new element and is wired again.
 * @param {Element} element a ve-content-element
 */
export function attachRowLayer(element) {
  const mode = collectionRowsMode();
  if (mode === 'panel' || !isInlineRecordsEnabled() || !element.hasAttribute('canModifyRecord') || wired.has(element)) {
    return;
  }
  if (!ownMarkers(element).length) {
    return; // unmarked template (or not rendered yet: the next sweep retries)
  }
  wired.add(element);
  if (mode === 'rows') {
    element.addEventListener('pointerover', (event) => {
      current.pointer = markerFrom(element, event.target);
      sync(element);
    });
    element.addEventListener('pointerleave', () => {
      current.pointer = null;
      sync(element);
    });
    element.addEventListener('focusin', (event) => {
      current.focus = markerFrom(element, event.target);
      current.returnTo = current.focus ? deepActive() : null;
      sync(element);
    });
    element.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && element.contains(next)) { return; }
      current.focus = null;
      sync(element);
    });
  }
  const showAppenders = () => { showAppender(element); };
  element.addEventListener('pointerenter', showAppenders);
  element.addEventListener('focusin', showAppenders);
  element.addEventListener('pointerleave', () => getRowAppender().scheduleHide());
  element.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node && element.contains(next))) { getRowAppender().scheduleHide(); }
  });
  if (element.matches(':hover')) { showAppenders(); }
}

/* --------------------------------------------------------------- markers -- */

/** Markers that belong to this element, not to a content element nested in it. */
function ownMarkers(element) {
  return [...element.querySelectorAll(MARKER)].filter((node) => node.closest('ve-content-element') === element);
}

/**
 * The entry rendering an event happened in: the innermost marker, when it is
 * the entry's primary rendering (a second rendering - a tab's nav item, a
 * slider's dot - gets no toolbar of its own).
 * @param {Element} element
 * @param {EventTarget|null} target
 * @return {Element|null}
 */
function markerFrom(element, target) {
  const marker = target instanceof Element ? target.closest(MARKER) : null;
  if (!marker || marker.closest('ve-content-element') !== element) {
    return null;
  }
  return primaryOf(element, marker) === marker ? marker : null;
}

/** The collection (parent + field) a marker belongs to. */
function groupOf(element, marker) {
  const own = collectMarkers(element).find((entry) => entry.node === marker);
  return own ? {parent: own.parent, collection: own.collection} : null;
}

/** The primary rendering of the entry a marker renders. */
function primaryOf(element, marker) {
  const markers = collectMarkers(element).filter((entry) => entry.node.closest('ve-content-element') === element);
  const groups = groupMarkers(markers);
  const own = markers.find((entry) => entry.node === marker);
  if (!own) { return null; }
  return groups.get(groupKey(own.parent, own.collection))?.rows.get(own.item)?.primary.node ?? null;
}

/** The enclosing entry markers of a marker, outermost first (nested collections). */
function ancestorsOf(element, marker) {
  const chain = [];
  for (let node = marker.parentElement?.closest(MARKER); node && element.contains(node); node = node.parentElement?.closest(MARKER)) {
    chain.unshift(node);
  }
  return chain;
}

/** The entry of a payload a marker renders: by uid, then by live uid. */
function childOf(field, marker) {
  const item = parseItem(marker.getAttribute('data-ve-item'));
  if (!field || !item) { return null; }
  const live = marker.getAttribute('data-ve-item-live') ?? '';
  const children = activeChildren(field);
  return children.find((child) => child.table === item.table && Number(child.uid) === item.uid)
    ?? children.find((child) => child.table === item.table && live !== '' && String(child.liveUid ?? '') === live) ?? null;
}

/**
 * Resolves the collection a marker belongs to through the payload chain:
 * the element's payload, then - for nested collections - the payload of each
 * enclosing entry (the inspector's nested-settings context).
 * @param {Element} element
 * @param {Element} marker
 * @return {Promise<{field: object, child: object|null, record: {table: string, uid: number}, context: Array<object>}|null>}
 */
async function resolve(element, marker) {
  let record = {table: element.getAttribute('table') ?? '', uid: Number(element.getAttribute('uid'))};
  let context = [];
  const levels = [...ancestorsOf(element, marker), marker];
  for (const [index, node] of levels.entries()) {
    const payload = await fetchFieldOptions(record.table, record.uid, context);
    const field = (payload.fields ?? []).find((entry) => entry.type === 'inline' && entry.name === node.getAttribute('data-ve-collection'));
    if (!field) { return null; }
    const child = childOf(field, node);
    if (index === levels.length - 1) {
      return {field, child, record, context};
    }
    if (!child) { return null; }
    context = [...context, {table: record.table, uid: record.uid, field: field.name}];
    record = {table: child.table, uid: Number(child.uid)};
  }
  return null;
}

/** Boxes of the marker's clipping ancestors (sliders, scroll areas). */
function clipBoxes(node) {
  const boxes = [];
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/(hidden|clip|auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) {
      boxes.push(parent.getBoundingClientRect());
    }
  }
  return boxes;
}

function deepActive() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) { active = active.shadowRoot.activeElement; }
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/** The current wrapper of an element (a refresh replaces it). */
function wrapperOf(root) {
  return document.querySelector(`ve-content-element[id="${CSS.escape(`${root.table}:${root.uid}`)}"]`);
}

/**
 * Escape in the toolbar: back to where the focus was in the entry, else to
 * the entry's first editable text, else to the entry itself when focusable.
 * @param {Element} marker
 */
function focusEntry(marker) {
  const before = current.returnTo;
  if (before?.isConnected && (marker.contains(before) || marker.contains(before.getRootNode()?.host ?? null))) {
    before.focus({preventScroll: true});
    return;
  }
  const editable = marker.matches(EDITABLES) ? marker : marker.querySelector(EDITABLES);
  if (editable) {
    focusEditable(editable);
  } else if (marker instanceof HTMLElement) {
    marker.focus({preventScroll: true});
  }
}

/* ------------------------------------------------------------- the rail -- */

/** Shows the toolbar for the hovered (else focused) entry, or lets it go. */
function sync(element) {
  const rail = getRowActions();
  const marker = current.pointer ?? current.focus;
  if (!marker) {
    if (rail.target && element.contains(rail.target)) { rail.scheduleHide(); }
    return;
  }
  if (rail.visible && rail.target === marker) {
    rail.showFor(marker, {items: rail.items, label: rail.label, clips: rail.clips, onEscape: rail.onEscape});
    return;
  }
  showRail(element, marker);
}

/**
 * @param {Element} element
 * @param {Element} marker
 * @param {{focus?: string}} options focus: the control to focus once shown
 */
async function showRail(element, marker, {focus = ''} = {}) {
  const seq = ++showSeq;
  let resolved;
  try {
    resolved = await resolve(element, marker);
  } catch {
    resolved = null;
  }
  if (seq !== showSeq || !marker.isConnected || (!focus && current.pointer !== marker && current.focus !== marker)) {
    return;
  }
  const rail = getRowActions();
  if (!resolved?.child) {
    rail.scheduleHide();
    return;
  }
  const root = {table: element.getAttribute('table') ?? '', uid: Number(element.getAttribute('uid'))};
  rail.showFor(marker, {items: railItems(element, root, marker, resolved), label: railLabel(resolved),
    clips: () => clipBoxes(marker), onEscape: () => focusEntry(marker)});
  if (focus) {
    await rail.updateComplete;
    rail.button(focus)?.focus({preventScroll: true});
  }
}

function railLabel({field, child}) {
  const position = activeChildren(field).indexOf(child) + 1;
  return inlineLabel('rowToolbar').replace('{position}', String(position)).replace('{label}', child.label || inlineLabel('newEntry'));
}

/**
 * The toolbar's buttons: the inspector row's actions in the inspector's order.
 * @return {Array<import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-row-actions.js').RailItem>}
 */
function railItems(element, root, marker, resolved) {
  const {field, child} = resolved;
  const blocked = busy ? inlineLabel('busy') : collectionBlockReason();
  const reason = rowReasons(field, child, blocked, rowBlockReason(child));
  const up = moveTarget(field, child, 'up');
  const down = moveTarget(field, child, 'down');
  const hidden = effectiveHidden(child, dataHandlerStore.data, dataHandlerStore.initialData);
  const items = [
    {control: 'up', label: inlineLabel('moveUp'), icon: caretUpIconSvg(15), reason: up ? reason.up || (child.canMoveUp === false ? inlineLabel('controls') : '') : edgeReason('up'),
      run: () => act(element, root, marker, resolved, 'move', {...up, direction: 'up'})},
    {control: 'down', label: inlineLabel('moveDown'), icon: caretDownIconSvg(15), reason: down ? reason.down || (child.canMoveDown === false ? inlineLabel('controls') : '') : edgeReason('down'),
      run: () => act(element, root, marker, resolved, 'move', {...down, direction: 'down'})},
  ];
  if (child.hiddenField) {
    items.push({control: 'eye', label: inlineLabel('visible'), checked: !hidden, reason: reason.eye,
      icon: `<ve-icon name="${hidden ? 'actions-toggle-off' : 'actions-toggle-on'}" width="16px"></ve-icon>`,
      run: () => toggleEye(element, root, marker, resolved)});
  }
  items.push(
    {control: 'after', label: inlineLabel('addAfter'), icon: formInsertAfterIconSvg(15), reason: reason.after,
      run: () => act(element, root, marker, resolved, 'create')},
    {control: 'remove', label: inlineLabel('remove'), icon: '<ve-icon name="actions-delete" width="16px"></ve-icon>', reason: reason.remove,
      run: () => act(element, root, marker, resolved, 'delete')},
  );
  if (duplicateOffered(child)) {
    items.push({control: 'duplicate', label: inlineLabel('duplicate'), icon: duplicateIconSvg(15), reason: reason.duplicate,
      run: () => act(element, root, marker, resolved, 'duplicate')});
  }
  items.push({control: 'settings', label: inlineLabel('settings'), icon: slidersIconSvg(15), reason: '',
    run: () => openSettings(root, resolved)});
  return items;
}

/** First and last entries cannot move further: the button stays, explained. */
function edgeReason(direction) {
  return inlineLabel(direction === 'up' ? 'firstEntry' : 'lastEntry');
}

function toggleEye(element, root, marker, resolved) {
  const {child} = resolved;
  toggleEntryHidden(child);
  markEntries(wrapperOf(root) ?? element, [child], dataHandlerStore);
  const rail = getRowActions();
  rail.items = railItems(element, root, marker, resolved);
}

async function openSettings(root, {field, child, record, context}) {
  const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
  const button = getRowActions().button('settings');
  openFieldChooser({table: child.table, uid: Number(child.uid), elementName: child.label ?? '', rootRecord: root,
    context: [...context, {table: record.table, uid: record.uid, field: field.name}],
    anchorRect: button?.getBoundingClientRect() ?? new DOMRect(), trigger: button ?? null, view: 'settings'});
}

/** The open entries inspector of this element follows a change made here. */
function refreshInspector(root) {
  const chooser = document.querySelector('ve-field-chooser');
  if (chooser?.open && chooser.rootRecord?.table === root.table && Number(chooser.rootRecord?.uid) === Number(root.uid)) {
    chooser.refresh?.();
  }
}

/**
 * Runs one server intent from the toolbar or an add button, refreshes the
 * element and keeps the editor where it worked: on the moved entry's
 * control, in the new entry's text, on the next entry after a removal.
 * @param {Element} element
 * @param {{table: string, uid: number}} root
 * @param {Element|null} marker the entry acted on (null: an add button)
 * @param {{field: object, child: object|null}} resolved
 * @param {string} action create | delete | move | duplicate
 * @param {object} options move {afterUid, direction}; create {first: true} = add at the start
 */
export async function act(element, root, marker, {field, child}, action, options = {}) {
  if (busy) { return; }
  const rail = getRowActions();
  const appender = getRowAppender();
  const {direction, first, ...intentOptions} = options;
  const anchor = (rail.visible ? rail.renderRoot.querySelector('.bar')?.getBoundingClientRect() : null)
    ?? marker?.getBoundingClientRect() ?? element.getBoundingClientRect();
  const item = marker?.getAttribute('data-ve-item') ?? '';
  const group = marker ? groupOf(element, marker) : null;
  const control = action === 'move' ? direction : '';
  busy = true;
  rail.busy = appender.busy = true;
  try {
    let result = await changeCollection(field, action, child, intentOptions);
    if (!result) { return; }
    const messages = [];
    const from = child ? activeChildren(field).indexOf(child) : -1;
    messages.push(collectionMessage(action, field, result, {position: from + (direction === 'up' ? -1 : 1) + 1}));
    const createdUid = Number(result.created?.uid ?? (action === 'create' ? result.uid : 0) ?? 0) || 0;
    const childTable = result.created?.table ?? child?.table ?? field.children?.[0]?.table ?? null;
    if (first && createdUid) {
      // levelLinksPosition top: Core's create appends; one move puts it first.
      try {
        const fresh = (await fetchFieldOptions(field.parentTable, field.parentUid, [])).fields?.find((entry) => entry.name === field.name);
        const created = activeChildren(fresh ?? {}).find((entry) => Number(entry.uid) === createdUid);
        if (fresh && created && activeChildren(fresh).indexOf(created) > 0) {
          result = await changeCollection(fresh, 'move', created, {afterUid: null});
        }
      } catch {
        messages.push(inlineLabel('addedAtEnd'));
      }
    }
    const records = field.children ?? [];
    if (collectionBlockReason()) {
      deferElementRefresh(root.table, root.uid, records);
    } else if (!await refreshElement(root.table, root.uid, {records})) {
      messages.push(inlineLabel(elementHasStagedData(root, records) ? 'savedPageLater' : 'refreshPending'));
    }
    refreshInspector(root);
    rail.announce(messages.join(' '), 'info', anchor);
    await placeFocus(root, action, {item, group, control, createdUid, childTable, from});
  } catch (error) {
    rail.announce(error.definitive ? error.message : `${error.message} ${inlineLabel('refreshRequired')}`, 'error', anchor);
  } finally {
    busy = false;
    rail.busy = appender.busy = false;
  }
}

/**
 * After an action the wrapper is new: focus the new entry's text (create,
 * duplicate), the moved entry's own toolbar control (move) or the next
 * remaining entry's text (remove).
 */
async function placeFocus(root, action, {item, group, control, createdUid, childTable, from}) {
  const wrapper = wrapperOf(root);
  if (!wrapper) { return; }
  await wrapper.updateComplete;
  if ((action === 'create' || action === 'duplicate') && createdUid) {
    const editable = findEntryEditable(wrapper, childTable, createdUid);
    if (editable) { focusEditable(editable); }
    return;
  }
  if (action === 'move' && item) {
    const marker = [...wrapper.querySelectorAll(MARKER)].find((node) => node.getAttribute('data-ve-item') === item);
    if (marker && collectionRowsMode() === 'rows') {
      current.focus = marker;
      current.returnTo = null;
      await showRail(wrapper, marker, {focus: control});
    }
    return;
  }
  if (action === 'delete' && group) {
    const rows = [...(groupMarkers(collectMarkers(wrapper)).get(groupKey(group.parent, group.collection))?.rows.values() ?? [])];
    const next = rows[Math.max(0, Math.min(from, rows.length - 1))]?.primary.node;
    const editable = next ? (next.matches(EDITABLES) ? next : next.querySelector(EDITABLES)) : null;
    if (editable) { focusEditable(editable); }
  }
}

/* ------------------------------------------------------------ appenders -- */

/**
 * The add buttons of the element's top-level collections (nested
 * collections are added from their parent entry's toolbar or the panel).
 * @param {Element} element
 */
async function showAppender(element) {
  const appender = getRowAppender();
  if (appender.owner === element && appender.visible) {
    appender.showFor(element, appender.items);
    return;
  }
  const root = {table: element.getAttribute('table') ?? '', uid: Number(element.getAttribute('uid'))};
  const markers = collectMarkers(element).filter((entry) => entry.node.closest('ve-content-element') === element && entry.parent === `${root.table}:${root.uid}`);
  const groups = [...groupMarkers(markers).values()];
  if (!groups.length) { return; }
  let payload;
  try {
    payload = await fetchFieldOptions(root.table, root.uid);
  } catch {
    return;
  }
  if (!element.isConnected || !(element.matches(':hover') || element.matches(':focus-within') || appender.isEngaged)) {
    return;
  }
  const blocked = busy ? inlineLabel('busy') : collectionBlockReason();
  const items = [];
  for (const group of groups) {
    const field = (payload.fields ?? []).find((entry) => entry.type === 'inline' && entry.name === group.collection);
    if (!field) { continue; }
    const primaries = [...group.rows.values()].map((row) => row.primary.node);
    for (const plan of appenderPlan(field, blocked)) {
      const title = field.childTitle || '';
      const label = plan.side === 'top' && activeChildren(field).length > 0
        ? inlineLabel('addEntryFirst').replace('{title}', title || inlineLabel('newEntry'))
        : title ? inlineLabel('addEntry').replace('{title}', title) : inlineLabel('add');
      items.push({key: `${group.collection}-${plan.side}`, side: plan.side, label, reason: plan.reason,
        rect: () => {
          const live = primaries.filter((node) => node.isConnected);
          return live.length ? unionRect(live.map((node) => node.getBoundingClientRect())) : null;
        },
        run: () => act(element, root, null, {field, child: null}, 'create', plan.side === 'top' ? {first: true} : {})});
    }
  }
  // Moving onto the row toolbar of one of these entries leaves the element:
  // the add buttons stay while that toolbar is in use.
  appender.keepAlive = () => {
    const rail = getRowActions();
    return !!appender.owner && rail.visible && rail.isEngaged && !!rail.target && appender.owner.contains(rail.target);
  };
  appender.showFor(element, items);
}
