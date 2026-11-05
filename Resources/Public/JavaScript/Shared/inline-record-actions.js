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
    return 'Save or reset your changes first. If the editor state is uncertain, refresh the page.';
  }
  return '';
}

export async function postCollectionIntent(url, token, payload) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json',
    'X-Request-Token': token}, body: JSON.stringify(payload)});
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || data.errorLog?.join('\n') || `Collection action refused: ${data.reason || response.status}`);
  }
  return data;
}

export function collectionReason(reason) {
  return ({workspace: 'Open a fully versioned parent and its entries in the backend workspace first.',
    workspaceLiveChange: 'Core attempted to change live data. The operation was rolled back. Use the backend form.',
    hidden: 'Creation requires a writable visibility field. Ask for access or use the backend workspace.',
    required: 'Required media or complex fields need the backend form.',
    min: 'The collection requires these remaining entries.', max: 'The collection has reached its entry limit.',
    rights: 'Access to this relation or one of its entries is restricted.',
    translation: 'Connected translations inherit structure. Edit the source language in the backend form.',
    translations: 'Connected translations require the backend form for removal.',
    cascade: 'Nested entries or media require the backend form for removal.',
    controls: 'This action is disabled in the backend field configuration.',
    unsupported: 'This relation configuration requires the backend form.',
    disabled: 'Collection actions are disabled for this table.',
    connection: 'This relation spans database connections. Use the backend form.',
  })[reason] || reason || '';
}
