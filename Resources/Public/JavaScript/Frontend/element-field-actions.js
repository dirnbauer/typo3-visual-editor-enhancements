import {actionLabelMode, collectionFieldsFor, fieldChooserTables, isFieldChooserEnabled, isInlineRecordsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {translate} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {addEntryIconSvg, listIconSvg, slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';
import {collectionCapability} from '@webconsulting/visual-editor-enhancements/Shared/collection-capability.js';
import {inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';

/** @type {WeakMap<HTMLElement, string>} button -> its long description (icons mode tooltip) */
const descriptions = new WeakMap();

/**
 * One of our action-bar buttons. The accessible name is a short word the
 * label stylesheet shows as visible text (Frontend/action-bar-labels.js), so
 * outside the `icons` label mode there is no `title` - it would only repeat
 * the label as a delayed native tooltip. Only panel openers (`popup`) carry
 * aria-haspopup/aria-expanded; a button that performs an action does not.
 * @param {string} kind data-ve-enhancement value
 * @param {{label: string, description?: string, icon: string, popup?: boolean}} options
 * @return {HTMLButtonElement}
 */
export function makeButton(kind, {label, description = label, icon, popup = false}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.dataset.veEnhancement = kind;
  button.setAttribute('aria-label', label);
  descriptions.set(button, description);
  if (actionLabelMode() === 'icons') {
    button.title = description;
  }
  if (popup) {
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
  }
  button.innerHTML = icon;
  return button;
}

/**
 * A refused action stays in the tab order (aria-disabled, never `disabled`
 * or `hidden`) with its reason as the tooltip and accessible description.
 * @param {HTMLElement} button
 * @param {string} reason empty to allow the action again
 */
export function setRefused(button, reason) {
  if (reason) {
    button.setAttribute('aria-disabled', 'true');
    button.title = reason;
    return;
  }
  button.removeAttribute('aria-disabled');
  if (actionLabelMode() === 'icons') {
    button.title = descriptions.get(button) ?? button.getAttribute('aria-label') ?? '';
  } else {
    button.removeAttribute('title');
  }
}

function insertAfterEdit(bar, button) {
  const edit = bar.querySelector('typo3-backend-contextual-record-edit-trigger, a.button');
  edit ? edit.after(button) : bar.appendChild(button);
}

function options(element, trigger) {
  return {table: element.getAttribute('table'), uid: Number(element.getAttribute('uid')),
    elementName: element.getAttribute('elementName') ?? '', trigger, anchorRect: trigger.getBoundingClientRect()};
}

export function injectFieldChooserAction(element) {
  if (!isFieldChooserEnabled() || !fieldChooserTables().includes(element.getAttribute('table'))
    || !element.hasAttribute('canModifyRecord')) { return; }
  const bar = element.shadowRoot?.querySelector('.action-bar');
  if (!bar || bar.querySelector('[data-ve-enhancement="field-chooser"]')) { return; }
  const button = makeButton('field-chooser', {label: translate('frontend.actionBar.settings', 'Settings'),
    description: translate('frontend.fieldChooser.open', 'Edit field settings'), icon: slidersIconSvg(16), popup: true});
  button.addEventListener('click', async () => {
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    openFieldChooser({...options(element, button), view: 'settings'});
  });
  insertAfterEdit(bar, button);
}

/**
 * Applies the capability payload to both collection buttons.
 * @param {Element} bar
 * @param {{entriesReason: string, addReason: string}} capability
 */
function applyCapability(bar, capability) {
  const entries = bar.querySelector('[data-ve-enhancement="inline-records"]');
  const add = bar.querySelector('[data-ve-enhancement="inline-add"]');
  for (const button of [entries, add]) { button?.removeAttribute('hidden'); }
  if (entries) { setRefused(entries, capability.entriesReason); }
  if (add) { setRefused(add, capability.addReason); }
}

/**
 * Fetches (or reuses) the element's capability payload and applies it.
 * @param {Element} element
 * @return {Promise<ReturnType<typeof collectionCapability>|null>} null when it could not be loaded
 */
export async function refreshCollectionCapability(element) {
  const bar = element.shadowRoot?.querySelector('.action-bar');
  try {
    const capability = collectionCapability(await fetchFieldOptions(element.getAttribute('table'), Number(element.getAttribute('uid'))));
    if (bar) { applyCapability(bar, capability); }
    return capability;
  } catch {
    return null;
  }
}

/**
 * "Entries" (opens the entries inspector) and "Add entry" (adds one entry at
 * the end of the element's collection). Both are visible from the first
 * render when the server's record-free collection index lists a collection
 * field for the element's record type (config `collectionTypes`); whether the
 * user may change it is decided by the capability fetch on click, after
 * which a refused button is aria-disabled with its reason. Without the index
 * (older server) the buttons are discovered on the first hover or focus, as
 * before.
 */
export function injectInlineRecordsAction(element) {
  if (!isInlineRecordsEnabled() || !element.hasAttribute('canModifyRecord')) { return; }
  const bar = element.shadowRoot?.querySelector('.action-bar');
  if (!bar || bar.querySelector('[data-ve-enhancement="inline-records"]')) { return; }
  const entries = makeButton('inline-records', {label: translate('frontend.actionBar.entries', 'Entries'),
    description: translate('frontend.inlineRecords.open', 'Edit collection entries'), icon: listIconSvg(16), popup: true});
  const add = makeButton('inline-add', {label: translate('frontend.actionBar.addEntry', 'Add entry'), icon: addEntryIconSvg(16)});
  const settings = bar.querySelector('[data-ve-enhancement="field-chooser"]');
  settings ? settings.after(entries) : insertAfterEdit(bar, entries);
  entries.after(add);

  entries.addEventListener('click', async () => {
    // Re-check on every click: a refusal may have been lifted (entries
    // removed, rights changed) - the cache is cleared after each change.
    const capability = await refreshCollectionCapability(element);
    if (capability?.entriesReason) { return; }
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    // Not loadable (expired session, 403/404/5xx, network): open the
    // inspector with the reason, as Add entry does - never ignore the click.
    openFieldChooser({...options(element, entries), view: 'entries', ...(capability === null ? {message: inlineLabel('loadError')} : {})});
  });
  add.addEventListener('click', async () => {
    const {addEntryFromBar} = await import('@webconsulting/visual-editor-enhancements/Frontend/add-entry.js');
    await addEntryFromBar(element, add);
  });

  const indexed = collectionFieldsFor(element.getAttribute('table') ?? '', element.getAttribute('CType') ?? '');
  if (indexed !== null) {
    // The index is authoritative for structure: no collection field, no buttons.
    entries.hidden = add.hidden = indexed.length === 0;
    return;
  }

  // Fallback without the index: discover on interaction, not with one
  // endpoint request per element at page load. The shared cache also serves
  // the field settings and hover affordances.
  entries.hidden = add.hidden = true;
  let discovering = false;
  const discover = async () => {
    if (discovering) { return; }
    discovering = true;
    try {
      const data = await fetchFieldOptions(element.getAttribute('table'), Number(element.getAttribute('uid')));
      entries.hidden = add.hidden = !data.fields?.some((field) => field.type === 'inline');
    } catch {
      // A later hover can retry; an empty or inaccessible collection gets no
      // misleading add control. The native edit action remains available.
      entries.hidden = add.hidden = true;
    } finally { discovering = false; }
  };
  element.addEventListener('pointerenter', discover);
  element.addEventListener('focusin', discover);
  if (element.matches(':hover, :focus-within')) { discover(); }
}
