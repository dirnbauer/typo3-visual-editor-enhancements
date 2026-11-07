import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {collectionIntent, postCollectionIntent, structuralBlockReason, inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {confirmCollectionDelete} from '@webconsulting/visual-editor-enhancements/Shared/confirm-delete.js';
import {clearFieldOptionsCache} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';

let inFlight = false;
let uncertain = false;
export function collectionBlockReason() {
  let backend;
  try {
    backend = window.parent.document.querySelector('ve-backend-save-button');
  } catch { /* Cross-origin editor state is unknown; fail closed. */ }
  return inFlight ? inlineLabel('busy') : structuralBlockReason(dataHandlerStore, backend, uncertain);
}

/**
 * @param {object} field
 * @param {string} action  create | delete | move
 * @param {object|null} child the row acted on (create: insert after it; delete/move: the row)
 * @param {object} options extra intent options, e.g. move {afterUid}
 */
export async function changeCollection(field, action, child = null, options = {}) {
  if (collectionBlockReason()) {
    throw new Error(collectionBlockReason());
  }
  if (action === 'delete' && !await confirmCollectionDelete(child)) {
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
