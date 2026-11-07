import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {collectionIntent, postCollectionIntent, recordTree, rowPendingReason, structuralBlockReason, treeHasStagedData, inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {confirmCollectionDelete} from '@webconsulting/visual-editor-enhancements/Shared/confirm-delete.js';
import {clearFieldOptionsCache} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';

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
