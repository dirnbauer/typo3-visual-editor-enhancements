import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {collectionIntent, postCollectionIntent, structuralBlockReason} from '../Shared/inline-record-actions.js';
import {confirmCollectionDelete} from '../Shared/confirm-delete.js';
import {clearFieldOptionsCache} from '../Shared/field-options-cache.js';

let inFlight = false;
let uncertain = false;
export function collectionBlockReason() {
  let backend;
  try {
    backend = window.parent.document.querySelector('ve-backend-save-button');
  } catch { /* Cross-origin editor state is unknown; fail closed. */ }
  return inFlight ? 'An entry operation is in progress.' : structuralBlockReason(dataHandlerStore, backend, uncertain);
}

export async function changeCollection(field, action, child = null) {
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
      window.veInfo.token, collectionIntent(field, action, child?.uid ?? null));
    clearFieldOptionsCache();
    return result;
  } catch (error) {
    // A lost response may have committed. Never retry automatically or replace pending text.
    uncertain = true;
    throw error;
  } finally {
    inFlight = false;
  }
}
