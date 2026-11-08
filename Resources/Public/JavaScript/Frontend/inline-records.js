import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {collectionIntent, postCollectionIntent, recordTree, rowPendingReason, structuralBlockReason, treeHasStagedData, inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {confirmCollectionDelete, confirmSynchronize} from '@webconsulting/visual-editor-enhancements/Shared/confirm-delete.js';
import {clearFieldOptionsCache} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';
import {effectiveHidden} from '@webconsulting/visual-editor-enhancements/Frontend/entry-page-marks.js';

let inFlight = false;
let uncertain = false;

/**
 * What blocks every structural action right now: an operation in flight, an
 * active save, invalid fields or an uncertain earlier write. Staged text or
 * visibility does not block (plan 2.5): it only holds that row's Remove.
 */
export function collectionBlockReason() {
  let backend;
  try {
    backend = window.parent.document.querySelector('ve-backend-save-button');
  } catch { /* Cross-origin editor state is unknown; fail closed. */ }
  return inFlight ? inlineLabel('busy') : structuralBlockReason(dataHandlerStore, backend, uncertain);
}

/**
 * The record tree of one content element on the page: the element itself,
 * every editable inside its wrapper and the entries the inspector lists.
 * @param {{table: string, uid: number}} root
 * @param {Array<{table: string, uid: number}>} children
 */
export function elementRecordTree(root, children = []) {
  const wrapper = document.querySelector(`ve-content-element[id="${CSS.escape(`${root.table}:${root.uid}`)}"]`);
  const editables = wrapper ? [...wrapper.querySelectorAll('[table][uid]')]
    .filter((node) => node.localName.startsWith('ve-editable-'))
    .map((node) => ({table: node.getAttribute('table'), uid: node.getAttribute('uid')})) : [];
  return recordTree(root, editables, children);
}

/** Whether this element (wrapper tree plus listed entries) has staged or invalid data. */
export function elementHasStagedData(root, children = []) {
  return treeHasStagedData(dataHandlerStore, elementRecordTree(root, children));
}

/** The reason one row's Remove waits ('' when it may proceed). */
export function rowBlockReason(child) {
  return rowPendingReason(dataHandlerStore, child);
}

/**
 * @param {object} field
 * @param {string} action  create | delete | move | sync
 * @param {object|null} child the row acted on (create: insert after it; delete/move: the row)
 * @param {object} options extra intent options, e.g. move {afterUid}, sync {language, mode, ids}
 */
export async function changeCollection(field, action, child = null, options = {}) {
  if (collectionBlockReason()) {
    throw new Error(collectionBlockReason());
  }
  if (action === 'delete' && child && rowBlockReason(child)) {
    throw Object.assign(new Error(rowBlockReason(child)), {definitive: true});
  }
  if (action === 'delete' && !await confirmCollectionDelete(child, field)) {
    return null;
  }
  if (action === 'sync' && options.mode === 'synchronize' && !await confirmSynchronize(field, options.language)) {
    return null;
  }
  // Modal waits can overlap another frame's save or a second click.
  if (collectionBlockReason()) {
    throw new Error(collectionBlockReason());
  }
  inFlight = true;
  try {
    const result = await postCollectionIntent(window.TYPO3.settings.ajaxUrls.visual_editor_save,
      window.veInfo.token, collectionIntent(field, action, {...rowOptions(action, child), ...options}));
    clearFieldOptionsCache();
    return result;
  } catch (error) {
    // A lost response may have committed. Never retry automatically or replace pending text.
    uncertain = !error.definitive;
    throw error;
  } finally {
    inFlight = false;
  }
}

function rowOptions(action, child) {
  if (!child) {
    return {};
  }
  return action === 'create' ? {afterUid: child.uid} : {childUid: child.uid};
}

/**
 * The staged eye of one entry - the vendor's own element pattern: the
 * baseline first (setInitialData), so a second toggle clears the staged
 * change again; saved with the page. The inspector seeds the baselines of
 * every listed entry when it loads; the on-page row toolbar seeds only the
 * entry it toggles.
 * @param {{table: string, uid: number, hidden?: boolean, hiddenField?: string, canHide?: boolean}} child
 * @return {boolean} the new staged visibility (true = hidden)
 */
export function toggleEntryHidden(child) {
  if (!child.hiddenField || child.canHide === false) {
    return effectiveHidden(child, dataHandlerStore.data, dataHandlerStore.initialData);
  }
  if (dataHandlerStore.initialData?.[child.table]?.[child.uid]?.[child.hiddenField] === undefined) {
    dataHandlerStore.setInitialData(child.table, child.uid, child.hiddenField, !!child.hidden);
  }
  const next = !effectiveHidden(child, dataHandlerStore.data, dataHandlerStore.initialData);
  dataHandlerStore.setData(child.table, child.uid, child.hiddenField, next);
  return next;
}
