import {translate} from './dom-utils.js';

/** Pure server-intent builders. Relation and DataHandler identities never come from the client. */
export function collectionIntent(field, action, childUid = null) {
  const intent = {action, parentTable: field.parentTable, parentUid: field.parentUid,
    field: field.name, revision: field.revision};
  if (childUid !== null) {
    intent[action === 'delete' ? 'childUid' : 'afterUid'] = childUid;
  }
  return {inlineRecord: intent};
}

export function structuralBlockReason(store, backend, uncertain = false) {
  if (uncertain || !backend || backend.saving || backend.count > 0 || backend.invalidCount > 0
    || store.changesCount > 0 || store.invalidCount > 0) {
    return inlineLabel('pending');
  }
  return '';
}

export async function postCollectionIntent(url, token, payload) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json',
    'X-Request-Token': token}, body: JSON.stringify(payload)});
  const data = await response.json();
  if (!response.ok || !data.success) {
    const error = new Error(collectionReason(data.reason) || inlineLabel('failed'));
    error.definitive = [403, 404, 409].includes(response.status) && data.success === false;
    throw error;
  }
  return data;
}

export function inlineLabel(key) {
  return translate(`frontend.inlineRecords.${key}`, inlineFallbacks[key] || inlineFallbacks.failed);
}

export function collectionReason(reason) {
  return reason ? inlineLabel(reason) : '';
}

const inlineFallbacks = {
  "back": "Back",
  "settings": "Item settings",
  "backend": "Open backend form",
  "addAfter": "Add after",
  "remove": "Remove",
  "add": "Add entry",
  "edit": "Edit entry",
  "actions": "Entry actions",
  "hiddenLabel": "Hidden",
  "empty": "No entries yet.",
  "newHidden": "New entries start hidden.",
  "structureHint": "Adding or removing entries saves immediately.",

  "pending": "Save or reset your changes first. If the editor state is uncertain, refresh the page.",
  "busy": "An entry operation is in progress.",
  "workspace": "Open a fully versioned parent and its entries in the backend workspace first.",
  "workspaceLiveChange": "Core attempted to change live data. The operation was rolled back. Use the backend form.",
  "hidden": "Creation requires a writable visibility field. Ask for access or use the backend workspace.",
  "required": "Required media or complex fields need the backend form.",
  "min": "The collection requires these remaining entries.",
  "max": "The collection has reached its entry limit.",
  "rights": "Access to this relation or one of its entries is restricted.",
  "language": "This language cannot be edited here. Use the backend form.",
  "translation": "Connected translations inherit structure. Edit the source language in the backend form.",
  "translations": "Connected translations require the backend form for removal.",
  "cascade": "Nested entries or media require the backend form for removal.",
  "controls": "This action is disabled in the backend field configuration.",
  "unsupported": "This relation configuration requires the backend form.",
  "disabled": "Collection actions are disabled for this table.",
  "connection": "This relation spans database connections. Use the backend form.",
  "stale": "The collection changed. Review its current entries and try again.",
  "membership": "This entry no longer belongs to the collection.",
  "record": "The record is no longer available here.",
  "token": "The editor session expired. Save pending edits before refreshing.",
  "failed": "The entry operation failed. Use the backend form for details.",
  "savedWorkspace": "Entry change saved in this workspace. Reset does not undo it.",
  "savedHidden": "Entry added. Hidden until you enable it in the backend form.",
  "savedLive": "Entry change saved immediately. Reset does not undo it.",
  "refreshPending": "Refresh the page after saving any new edits to see the change.",
  "refreshRequired": "Refresh the page before another entry operation.",
  "immediate": "Changes to entries are saved immediately. Reset does not undo them.",
  "workspaceLabel": "Workspace draft",
  "liveLabel": "Live site",
  "entries": "Entries",
  "minimum": "Minimum",
  "maximum": "Maximum",
  "backendRequired": "Backend form required:",
  "loadError": "Could not load entries. Open the backend form.",
  "confirmTitle": "Remove collection entry",
  "confirmEntry": "Remove “{label}”?",
  "confirmDiscard": "The new workspace entry will be discarded.",
  "confirmStage": "Deletion is staged in this workspace; the live entry remains until publication.",
  "confirmLive": "It disappears from the live site immediately.",
  "confirmReset": "Reset does not undo this operation.",
  "cancel": "Cancel",
  "newEntry": "New entry",
  "unavailable": "Unavailable: {value}",
  "deleted": "Marked for deletion in this workspace. Publish or discard it in the Workspaces module.",
  "label": "This entry's title is not a plain text field. Edit it in the form."
};
