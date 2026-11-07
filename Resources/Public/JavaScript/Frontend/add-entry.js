import {inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {changeCollection, collectionBlockReason, elementHasStagedData} from '@webconsulting/visual-editor-enhancements/Frontend/inline-records.js';
import {refreshElement} from '@webconsulting/visual-editor-enhancements/Frontend/element-refresh.js';
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
function focusEditable(editable) {
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
  try {
    const capability = await refreshCollectionCapability(element);
    if (capability === null) {
      await openInspector({...base, message: inlineLabel('loadError')});
      return;
    }
    if (capability.addReason) { return; }
    if (capability.creatable.length !== 1) {
      const chooser = await openInspector(base);
      chooser?.renderRoot.querySelector('.addEntry:not([disabled]):not([aria-disabled="true"])')?.focus({preventScroll: false});
      return;
    }
    const field = capability.creatable[0];
    const blocked = collectionBlockReason();
    if (blocked) {
      // Pending text, an active save or an uncertain earlier write: the
      // inspector explains it next to its own (disabled) Add button.
      await openInspector({...base, message: blocked});
      return;
    }
    let result;
    try {
      result = await changeCollection(field, 'create');
    } catch (error) {
      await openInspector({...base, message: error.definitive ? error.message : `${error.message} ${inlineLabel('refreshRequired')}`});
      return;
    }
    if (!result) { return; }
    let message = field.workspaceId ? inlineLabel('savedWorkspace')
      : field.createHidden ? inlineLabel('savedHidden') : inlineLabel('savedLive');
    if (result.workspace?.firstVersion) { message += ` ${inlineLabel('draftCreated')}`; }
    // Never replace a wrapper whose own entries have staged text (refreshElement
    // checks again after fetching); the inspector then offers Save now.
    const records = field.children ?? [];
    const refreshed = collectionBlockReason() ? false : await refreshElement(table, uid, {records});
    if (!refreshed) { message += ` ${inlineLabel(elementHasStagedData({table, uid}, records) ? 'savedPageLater' : 'refreshPending')}`; }
    const chooser = await openInspector({...base, message});
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
