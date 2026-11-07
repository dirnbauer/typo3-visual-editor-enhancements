/**
 * Read access to window.visualEditorEnhancements, the configuration
 * EditModeEnhancementsMiddleware inlines into the edit frame (built by
 * Service\FrontendConfiguration). Every reader tolerates a missing object so a
 * module evaluated outside edit mode degrades to "everything off".
 */
export function enhancementConfig() {
  return window.visualEditorEnhancements || {};
}

export function isElementLibraryEnabled() {
  return !!enhancementConfig().elementLibraryEnabled;
}

export function isEditableLinksEnabled() {
  return !!enhancementConfig().editableLinksEnabled;
}

export function isContextButtonsEnabled() {
  return !!enhancementConfig().contextButtonsEnabled;
}

/** @return {'disabled'|'sections'|'tabs'} */
export function fieldChooserMode() {
  const mode = enhancementConfig().fieldChooserMode;
  return ['sections', 'tabs'].includes(mode) ? mode : 'disabled';
}

export function isFieldChooserEnabled() {
  return fieldChooserMode() !== 'disabled';
}

export function isElementRefreshEnabled() {
  return !!enhancementConfig().elementRefreshEnabled;
}

/** @return {string[]} */
export function fieldChooserTables() {
  return enhancementConfig().fieldChooserTables || [];
}

/** @return {1|3} */
export function elementLibraryColumns() {
  return enhancementConfig().elementLibraryColumns === 1 ? 1 : 3;
}

/** @return {{title: string, message: string}|null} */
export function contentAddedFeedback() {
  return enhancementConfig().contentAddedFeedback || null;
}

/**
 * The backend user's colour scheme setting; the theme bridge replaces it with
 * the scheme the backend actually renders in as soon as it answers.
 * @return {'auto'|'light'|'dark'}
 */
export function editorColorScheme() {
  const scheme = enhancementConfig().colorScheme;
  return scheme === 'light' || scheme === 'dark' ? scheme : 'auto';
}

export function isInlineRecordsEnabled() {
  return !!enhancementConfig().inlineRecordsEnabled;
}

/**
 * How the action-bar buttons show their names (User settings > Visual editor
 * > Action bar labels, be_users.uc tx_visualeditor_actionLabels).
 * @return {'caption'|'inline'|'stacked'|'icons'}
 */
export function actionLabelMode() {
  const mode = enhancementConfig().actionLabelMode;
  return ['caption', 'inline', 'stacked', 'icons'].includes(mode) ? mode : 'caption';
}

/**
 * The record-free index of collection (inline) fields per table and record
 * type, `{<table>: {<recordType>: [inlineFieldNames]}}`, built server-side
 * from the TCA schema. It lists field names only - whether the user may
 * modify them is decided by the capability fetch on click.
 * @return {Record<string, Record<string, string[]>>|null} null when the
 *   server did not send the index (older server, or the key is missing):
 *   callers then fall back to discovering collections on interaction
 */
export function collectionTypes() {
  const types = enhancementConfig().collectionTypes;
  return types !== null && typeof types === 'object' && !Array.isArray(types) ? types : null;
}

/**
 * @param {string} table
 * @param {string} recordType the element's record type (tt_content: CType)
 * @return {string[]|null} the collection field names of that type (possibly
 *   empty), or null when no index is available
 */
export function collectionFieldsFor(table, recordType) {
  const types = collectionTypes();
  if (types === null) {
    return null;
  }
  const fields = types[table]?.[recordType];
  return Array.isArray(fields) ? fields.filter((name) => typeof name === 'string' && name !== '') : [];
}
