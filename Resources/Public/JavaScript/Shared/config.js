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
