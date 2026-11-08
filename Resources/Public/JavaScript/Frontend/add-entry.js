import {inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {changeCollection, collectionBlockReason, elementHasStagedData} from '@webconsulting/visual-editor-enhancements/Frontend/inline-records.js';
import {deferElementRefresh, refreshElement} from '@webconsulting/visual-editor-enhancements/Frontend/element-refresh.js';
import {refreshCollectionCapability} from '@webconsulting/visual-editor-enhancements/Frontend/element-field-actions.js';

/**
 * The action-bar "Add entry" button:
 *  - exactly one collection of the element can create: create one entry at
 *    the end (the server's ordinary `create` intent; live creations start
 *    hidden), refresh the element, open the entries inspector without taking
 *    focus and put the focus into the new entry's first editable on the page
 *    (or, when it renders none, onto its row in the inspector);
 *  - none or several can create: open the inspector with the first
 *    collection's own Add button focused (one more click, by design).
 * Rights come from the capability fetch on click; a refusal leaves the button
 * aria-disabled with its reason.
 * The inspector always opens with the element's Entries button as its
 * trigger (the dialog it controls): the anchored layout follows that button
 * when the page scrolls, it reads aria-expanded="true" while the inspector is
 * open, and Escape hands the focus back to it.
 */

let busy = false;

/**
 * @param {object} options openFieldChooser() options
 * @return {Promise<HTMLElement>} the field chooser, after its entries loaded
 */
async function openInspector(options) {
  const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
  openFieldChooser({view: 'entries', toggle: false, focus: false, ...options});
  const chooser = document.querySelector('ve-field-chooser');
  // #load() is asynchronous; wait (bounded) until the entries are rendered.
  for (let attempt = 0; attempt < 100 && chooser?.loading; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await chooser?.updateComplete;
  return chooser;
}

/**
 * The element's Entries button in the CURRENT wrapper: refreshElement()
 * replaces the <ve-content-element> (and its action bar) the click came from,
 * and the shared injection pass (Frontend/index.js) adds the button to the
 * fresh bar only after the vendor's first render - so wait for it, bounded.
 * @param {string|null} wrapperId
 * @param {Element} element the wrapper the click came from
 * @return {Promise<HTMLElement|null>}
 */
async function entriesButton(wrapperId, element) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const wrapper = (wrapperId ? document.querySelector(`ve-content-element[id="${CSS.escape(wrapperId)}"]`) : null)
      ?? (element.isConnected ? element : null);
    const button = wrapper?.shadowRoot?.querySelector('[data-ve-enhancement="inline-records"]');
    if (button instanceof HTMLElement && !button.hidden) { return button; }
    await wrapper?.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

/**
 * @param {ParentNode} root
 * @param {string|null} table the child table, when known
 * @param {number} uid
 * @return {HTMLElement|null}
 */
export function findEntryEditable(root, table, uid) {
  const tags = ['ve-editable-text', 've-editable-rich-text'];
  const uidSelector = `[uid="${CSS.escape(String(uid))}"]`;
  const selector = tags.map((tag) => table ? `${tag}[table="${CSS.escape(table)}"]${uidSelector}` : `${tag}${uidSelector}`).join(',');
  return root.querySelector(selector);
}

/**
 * Focus without the vendor's block:center scroll: nearest keeps the bar and
 * the inspector where they are.
 * @param {HTMLElement} editable
 */
export function focusEditable(editable) {
  editable.scrollIntoView({block: 'nearest'});
  const target = editable.shadowRoot?.querySelector('[contenteditable]') ?? editable.querySelector('[contenteditable]');
  if (target instanceof HTMLElement) {
    target.focus({preventScroll: true});
  } else {
    editable.focusEditable?.();
  }
}

/**
 * @param {Element} element the ve-content-element whose bar holds the button
 * @param {HTMLElement} button the Add entry button
 */
export async function addEntryFromBar(element, button) {
  if (busy) { return; }
  busy = true;
  const table = element.getAttribute('table');
  const uid = Number(element.getAttribute('uid'));
  const wrapperId = element.getAttribute('id');
  const base = {table, uid, elementName: element.getAttribute('elementName') ?? '', anchorRect: button.getBoundingClientRect()};
  const open = async (extra = {}) => {
    const trigger = await entriesButton(wrapperId, element);
    return openInspector({...base, ...extra, ...(trigger ? {trigger, anchorRect: trigger.getBoundingClientRect()} : {})});
  };
  try {
    const capability = await refreshCollectionCapability(element);
    if (capability === null) {
      await open({message: inlineLabel('loadError')});
      return;
    }
    if (capability.addReason) { return; }
    if (capability.creatable.length !== 1) {
      const chooser = await open();
      chooser?.renderRoot.querySelector('.addEntry:not([disabled]):not([aria-disabled="true"])')?.focus({preventScroll: false});
      return;
    }
    const field = capability.creatable[0];
    const blocked = collectionBlockReason();
    if (blocked) {
      // Pending text, an active save or an uncertain earlier write: the
      // inspector explains it next to its own (disabled) Add button.
      await open({message: blocked});
      return;
    }
    let result;
    try {
      result = await changeCollection(field, 'create');
    } catch (error) {
      await open({message: error.definitive ? error.message : `${error.message} ${inlineLabel('refreshRequired')}`});
      return;
    }
    if (!result) { return; }
    let message = field.workspaceId ? inlineLabel('savedWorkspace')
      : field.createHidden ? inlineLabel('savedHidden') : inlineLabel('savedLive');
    if (result.workspace?.firstVersion) { message += ` ${inlineLabel('draftCreated')}`; }
    // Never replace a wrapper whose own entries have staged text (refreshElement
    // checks again after fetching); the inspector then offers Save now.
    const records = field.children ?? [];
    // While a save runs (or fields are invalid) the swap waits for the next Save too.
    const deferred = Boolean(collectionBlockReason());
    if (deferred) { deferElementRefresh(table, uid, records); }
    const refreshed = deferred ? false : await refreshElement(table, uid, {records});
    if (!refreshed) { message += ` ${inlineLabel(elementHasStagedData({table, uid}, records) ? 'savedPageLater' : 'refreshPending')}`; }
    const chooser = await open({message});
    const createdUid = Number(result.created?.uid ?? result.uid ?? 0);
    if (!createdUid) { return; }
    const childTable = result.created?.table ?? field.children?.[0]?.table ?? null;
    const wrapper = (wrapperId ? document.querySelector(`ve-content-element[id="${CSS.escape(wrapperId)}"]`) : null) ?? document;
    const editable = findEntryEditable(wrapper, childTable, createdUid);
    if (editable !== null) {
      focusEditable(editable);
      return;
    }
    // No editable on the page: the entry's title input in the inspector.
    const row = chooser?.renderRoot.querySelector(`[data-ve-row="${CSS.escape(String(createdUid))}"]`);
    const target = row?.querySelector('.entryTitle, [data-child-edit]') ?? chooser?.renderRoot.querySelector(`[data-child-edit="${CSS.escape(String(createdUid))}"]`);
    target?.focus({preventScroll: true});
    row?.scrollIntoView({block: 'nearest'});
  } finally {
    busy = false;
  }
}
