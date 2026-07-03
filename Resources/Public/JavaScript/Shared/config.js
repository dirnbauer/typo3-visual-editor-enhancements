export function enhancementConfig() {
  return window.visualEditorEnhancements || {};
}

export function isElementLibraryEnabled() {
  return !!enhancementConfig().elementLibraryEnabled;
}

export function isEditableLinksEnabled() {
  const config = enhancementConfig();
  return !!(config.editableLinksEnabled ?? config.elementLibraryLinks);
}

export function fieldChooserMode() {
  const config = enhancementConfig();
  if (['disabled', 'sections', 'tabs'].includes(config.fieldChooserMode)) {
    return config.fieldChooserMode;
  }
  // Pre-0.3 window config only carried the boolean; it maps to the old
  // single-list presentation.
  return config.fieldChooserEnabled ? 'sections' : 'disabled';
}

export function isFieldChooserEnabled() {
  return fieldChooserMode() !== 'disabled';
}

export function isContextButtonsEnabled() {
  const config = enhancementConfig();
  // Pre-0.3 window config had no dedicated key; the editable-links toggle
  // carried the only per-user "context buttons" preference back then.
  return !!(config.contextButtonsEnabled ?? config.editableLinksEnabled ?? true);
}

export function isElementRefreshEnabled() {
  return !!(enhancementConfig().elementRefreshEnabled ?? true);
}

export function fieldChooserTables() {
  return enhancementConfig().fieldChooserTables || [];
}

export function elementLibraryColumns() {
  return enhancementConfig().elementLibraryColumns || 3;
}

export function contentAddedFeedback() {
  return enhancementConfig().contentAddedFeedback || null;
}
