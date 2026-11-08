import {translate} from './dom-utils.js';

/**
 * The keys each action may carry besides the common identity (mirrors InlineIntent::KEYS).
 * Anything else is dropped here and rejected by the server.
 */
const intentKeys = {
  create: {afterUid: 'optional'},
  delete: {childUid: 'required'},
  move: {childUid: 'required', afterUid: 'nullable'},
  sync: {language: 'required', mode: 'mode', ids: 'ids'},
  // 1.7: copy one entry right after itself; undo a workspace removal
  // (childUid = the live uid of the listed delete placeholder).
  duplicate: {childUid: 'required'},
  restore: {childUid: 'required'},
};

/**
 * Pure server-intent builder. Relation and DataHandler identities never come from
 * the client: no child table, pid, sorting, language or live uid leaves the browser.
 *
 * @param {object} field   collection payload (parentTable, parentUid, name, revision)
 * @param {string} action  create | delete | move | sync | duplicate | restore
 * @param {object} options create {afterUid?} · delete {childUid} · move {childUid, afterUid: uid|null}
 *                         · sync {language, mode: 'localize'|'synchronize', ids?: [default entry uids], localize only}
 *                         · duplicate {childUid} · restore {childUid: live uid of the delete placeholder}
 */
export function collectionIntent(field, action, options = {}) {
  const keys = intentKeys[action];
  if (!keys) {
    throw new Error(`Unknown collection action ${action}`);
  }
  const intent = {action, parentTable: field.parentTable, parentUid: field.parentUid,
    field: field.name, revision: field.revision};
  for (const [key, rule] of Object.entries(keys)) {
    const value = options?.[key];
    if (rule === 'mode') {
      if (!['localize', 'synchronize'].includes(value)) {
        throw new Error(`Collection action ${action} needs mode localize or synchronize`);
      }
      intent[key] = value;
    } else if (rule === 'ids') {
      if (Array.isArray(value) && value.length > 0 && value.every(Number.isInteger)) {
        if (options.mode !== 'localize') {
          throw new Error('Only localize accepts selected entries');
        }
        intent[key] = [...new Set(value)];
      }
    } else if (rule === 'nullable') {
      intent[key] = Number.isInteger(value) ? value : null;
    } else if (Number.isInteger(value)) {
      intent[key] = value;
    } else if (rule === 'required') {
      throw new Error(`Collection action ${action} needs ${key}`);
    }
  }
  return {inlineRecord: intent};
}

/**
 * What blocks EVERY structural action: an active save in any frame, an
 * invalid field anywhere, an unknown editor state (no save button, lost
 * response). Staged changes alone no longer block - see the scoped rules
 * below (recordTree, rowPendingReason).
 */
export function structuralBlockReason(store, backend, uncertain = false) {
  if (uncertain || !backend || backend.saving || backend.invalidCount > 0 || store.invalidCount > 0) {
    return inlineLabel('pending');
  }
  return '';
}

/** @param {{table: string, uid: number|string}} record */
export const recordKey = (record) => `${record.table}:${record.uid}`;

/**
 * The records one content element owns on the page: its own row, every
 * editable rendered inside its wrapper and the entries the inspector lists.
 * @param {{table: string, uid: number|string}} root
 * @param {Array<{table?: string|null, uid?: string|number|null}>} editables
 * @param {Array<{table?: string, uid?: number}>} children
 * @return {Set<string>} "<table>:<uid>" keys
 */
export function recordTree(root, editables = [], children = []) {
  const keys = new Set([recordKey(root)]);
  for (const record of [...editables, ...children]) {
    if (record?.table && record.uid !== undefined && record.uid !== null && String(record.uid) !== '') {
      keys.add(recordKey(record));
    }
  }
  return keys;
}

/**
 * Whether the store holds a staged value, an invalid field or a pending
 * command for any record of the tree.
 * @param {{data: object, invalidFields?: object, cmdArray?: object[]}} store
 * @param {Set<string>} tree
 */
export function treeHasStagedData(store, tree) {
  const has = (map) => Object.entries(map ?? {}).some(([table, records]) =>
    Object.entries(records ?? {}).some(([uid, fields]) => tree.has(`${table}:${uid}`) && Object.keys(fields ?? {}).length > 0));
  if (has(store.data) || has(store.invalidFields)) {
    return true;
  }
  return (store.cmdArray ?? []).some((cmd) => Object.entries(cmd).some(([table, records]) =>
    Object.keys(records ?? {}).some((uid) => tree.has(`${table}:${uid}`))));
}

/**
 * Removing an entry whose text or visibility is still staged would discard
 * that edit silently: only that row's Remove waits for Save.
 * @param {{data: object}} store
 * @param {{table: string, uid: number}} child
 */
export function rowPendingReason(store, child) {
  const fields = store.data?.[child.table]?.[child.uid];
  return fields && Object.keys(fields).length > 0 ? inlineLabel('pendingRow') : '';
}

/**
 * What a key does in an entry's title control. Enter commits (leaves the
 * field, the staged value stays for Save) - in a multi-line title too, where
 * Shift+Enter inserts the line break (the textarea's own default); Escape
 * restores the stored value. Never while an IME composition is open.
 * @param {{key: string, shiftKey?: boolean, isComposing?: boolean}} event
 * @param {boolean} multiline the label column is a text area (labelMultiline)
 * @return {'commit'|'restore'|null} null: leave the key to the control
 */
export function titleKeyAction(event, multiline = false) {
  if (event.isComposing) { return null; }
  if (event.key === 'Escape') { return 'restore'; }
  if (event.key === 'Enter' && !(multiline && event.shiftKey)) { return 'commit'; }
  return null;
}

/**
 * The limit the inspector header shows ("n / max"); 0 = unlimited. Core's
 * TCA default maxitems (99999) means "no limit" as well.
 * @param {unknown} maxItems
 * @return {number}
 */
export function collectionLimit(maxItems) {
  const max = Number(maxItems ?? 0);
  return Number.isFinite(max) && max > 0 && max < 99999 ? max : 0;
}

/**
 * Whether a keyboard event started inside a text control (input, textarea,
 * contenteditable): row shortcuts (Alt+Arrow move, Delete remove) stay out
 * of text editing, where Option+Arrow and Delete edit the text.
 * @param {Event} event
 * @return {boolean}
 */
export function fromTextControl(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some((node) => node?.localName === 'input' || node?.localName === 'textarea' || node?.isContentEditable === true);
}

/**
 * The sentence for a successful collection change, shown in the panel's or
 * the row toolbar's status line (plain text, never a button).
 * @param {string} action create | delete | move | sync | duplicate | restore
 * @param {{workspaceId?: number, createHidden?: boolean}} field
 * @param {object} result the server response
 * @param {{position?: number, languageTitle?: string}} options move: the new 1-based position; sync: the language name
 * @return {string}
 */
export function collectionMessage(action, field, result = {}, {position = 0, languageTitle = ''} = {}) {
  const messages = [];
  if (action === 'sync') {
    messages.push(inlineLabel('synced').replace('{language}', languageTitle)
      .replace('{localized}', String(result.synced?.localized ?? 0)).replace('{removed}', String(result.synced?.removed ?? 0)));
  } else if (action === 'move') {
    messages.push(inlineLabel('movedTo').replace('{position}', String(Number(result.moved?.position ?? position))));
  } else if (action === 'restore') {
    messages.push(inlineLabel('restored'));
  } else if (action === 'duplicate') {
    messages.push(inlineLabel(field.workspaceId ? 'duplicatedWorkspace'
      : (result.created?.hidden ?? field.createHidden) ? 'duplicatedHidden' : 'duplicated'));
  } else if (field.workspaceId) {
    messages.push(inlineLabel('savedWorkspace'));
  } else if (field.createHidden && action === 'create') {
    messages.push(inlineLabel('savedHidden'));
  } else {
    messages.push(inlineLabel('savedLive'));
  }
  if (result.workspace?.firstVersion) {
    messages.push(inlineLabel('draftCreated'));
  }
  return messages.join(' ');
}

/**
 * Why an entry's Remove is refused, '' when it is allowed. A removal the
 * server's cascade preflight refused (deleteReason `cascade`) names its
 * bound: depth, records, rights or a site that switched cascading off.
 * @param {{canDelete?: boolean, deleteReason?: string, cascadeReason?: string}} child
 * @return {string}
 */
export function deleteRefusal(child) {
  if (child.canDelete) {
    return '';
  }
  if (child.deleteReason === 'cascade' && ['depth', 'records', 'rights', 'disabled'].includes(child.cascadeReason)) {
    return inlineLabel(`cascade${child.cascadeReason[0].toUpperCase()}${child.cascadeReason.slice(1)}`);
  }
  return collectionReason(child.deleteReason) || inlineLabel('controls');
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
  "addEntry": "Add {title}",
  "sync": "Sync translations",
  "syncMissing": "{count} missing",
  "syncSynchronizeItem": "Synchronize {language}",
  "syncSynchronizeHint": "also removes {count}",
  "localizeTo": "Localize to {language}",
  "synced": "{language}: {localized} added, {removed} removed.",
  "confirmSyncTitle": "Synchronize translations",
  "confirmSynchronize": "Synchronize {language} with the default language? Adds {missing} missing entries and removes {orphaned} entries that exist only in {language}. This saves immediately; Reset does not undo it.",
  "syncConfirmButton": "Synchronize",
  "firstVersionNext": "Your next add, move or remove creates this element's first draft in this workspace.",
  "visible": "Visible on the live site",
  "hide": "Hide",
  "unhide": "Show",
  "movedTo": "Moved to position {position}.",
  "pendingRow": "Save this entry's text first.",
  "pendingNotice": "This element has unsaved changes. Removing an entry with unsaved text waits for Save.",
  "saveNow": "Save now",
  "savedPageLater": "Saved. The page shows it after you save your text.",
  "contextLive": "Live site",
  "contextWorkspace": "Workspace draft «{title}»",
  "modeDefault": "Default language",
  "modeTranslatedInto": "translated into {languages}",
  "modeConnected": "Connected translation — structure also lives in the source language",
  "modeFree": "Free translation",
  "badgeNew": "New in draft",
  "badgeModified": "Changed in draft",
  "badgeDeleted": "Marked for deletion",
  "badgePending": "Unsaved",
  "hiddenHint": "New entries start hidden. Show it with the eye, then Save.",
  "hiddenOnPage": "Hidden on the live site",
  "rowActions": "Actions for {label}",
  "titleOf": "Title of entry {position}",
  "moreActions": "More actions",
  "columnTitle": "Title",
  "columnState": "State",
  "columnActions": "Actions",
  "editInForm": "Edit in form",
  "countMax": "{count} / {max}",
  "minHint": "min {min}",
  "draftCreated": "Draft created. Core renumbered the stored order values; the visible order is unchanged.",
  "stage": "The element is in review; its editing stage is closed.",
  "settings": "Item settings",
  "backend": "Open backend form",
  "addAfter": "Add after",
  "remove": "Remove",
  "add": "Add entry",
  "edit": "Edit entry",
  "actions": "Entry actions",
  "hiddenLabel": "Hidden",
  "empty": "No entries yet.",
  "newHidden": "New entries start hidden. Show them with the eye, then Save.",
  "structureHint": "Adding, removing and moving save immediately; titles and visibility save with the page.",

  "pending": "Wait for the save to finish or fix invalid fields. If the editor state is uncertain, refresh the page.",
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
  "synchronized": "This list follows the default or source language. Set the field to “Custom value” in the backend form to change it here.",
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
  "savedHidden": "Entry added. New entries start hidden. Show it with the eye, then Save.",
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
  "confirmLanguageOnly": "Only the entry in this language is removed; the default-language entry stays.",
  "cancel": "Cancel",
  "newEntry": "New entry",
  "unavailable": "Unavailable: {value}",
  "deleted": "Marked for deletion in this workspace. Publish or discard it in the Workspaces module.",
  "label": "This entry's title is not a plain text field. Edit it in the form.",
  "moveUp": "Move up",
  "moveDown": "Move down",
  "unsorted": "This collection has no stored order. Use the backend form.",
  "syncNone": "All translations are complete.",
  "syncWorkspace": "Synchronize translations in the live site; it is not available in a workspace.",
  "syncDisabled": "Synchronizing translations is switched off for this site.",
  "orderFollowsDefault": "Order follows the default language after a sync.",
  "confirmTranslations": "Also removes {count} translations ({languages}).",
  "confirmTranslationsStage": "Also marks {count} translations ({languages}) for deletion.",
  "badgeTranslationOnly": "Only in this language",
  "badgeUntranslated": "Not translated here: {languages}",
  "hiddenPerLanguage": "Visibility is per language.",
  "duplicate": "Duplicate",
  "duplicated": "Copy added below the original. It is live immediately; Reset does not undo it.",
  "duplicatedHidden": "Copy added below the original. It starts hidden: show it with the eye, then Save.",
  "duplicatedWorkspace": "Copy added below the original in this workspace. Reset does not undo it.",
  "copyUnsupported": "This entry cannot be duplicated here (nested entries, media or a translation). Use the backend form.",
  "undoRemoval": "Undo removal",
  "restored": "Removal undone. The entry is back in this workspace draft.",
  "restoreLive": "Only a removal staged in this workspace can be undone here. Use the Workspaces module.",
  "cascadeDepth": "Its nested entries go deeper than this site allows here. Use the backend form.",
  "cascadeRecords": "Removing it would also remove more records than this site allows here. Use the backend form.",
  "cascadeRights": "You may not remove some of its nested entries or media. Use the backend form or ask for access.",
  "cascadeDisabled": "Removing entries with nested entries or media is switched off for this site. Use the backend form.",
  "cascadeChildren": "{count} nested entries",
  "cascadeChildrenOne": "1 nested entry",
  "cascadeFiles": "{count} image references",
  "cascadeFilesOne": "1 image reference",
  "confirmNested": "Also removes {items}.",
  "confirmNestedStage": "Also marks {items} for deletion.",
  "confirmFilesStay": "The files stay in the file list.",
  "confirmTruncated": "Counted up to this site's limit; there can be more.",
  "rowToolbar": "Entry {position}: {label}",
  "addEntryFirst": "Add {title} at the start",
  "addedAtEnd": "The entry was added at the end; moving it to the start failed. Move it up with the arrows.",
  "firstVersion": "Your first change to this element would create a workspace draft; this site has not enabled that here. Open the element in the backend workspace first."
};
