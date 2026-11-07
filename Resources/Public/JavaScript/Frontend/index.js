import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {elementLibraryOpen} from '@webconsulting/visual-editor-enhancements/Shared/local-stores.js';
import {editorColorScheme, isElementLibraryEnabled, isFieldChooserEnabled, isInlineRecordsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {translate} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {injectFieldChooserAction, injectInlineRecordsAction, makeButton} from '@webconsulting/visual-editor-enhancements/Frontend/element-field-actions.js';
import {installActionBarLabels} from '@webconsulting/visual-editor-enhancements/Frontend/action-bar-labels.js';
import {annotateCollectionRows} from '@webconsulting/visual-editor-enhancements/Frontend/collection-rows.js';
import {applyTheme} from '@webconsulting/visual-editor-enhancements/Shared/theme-bridge.js';
import {attachElementContextAffordance} from '@webconsulting/visual-editor-enhancements/Frontend/element-context-affordance.js';
import {initializeElementRefresh} from '@webconsulting/visual-editor-enhancements/Frontend/element-refresh.js';
import '@webconsulting/visual-editor-enhancements/Frontend/visual-editor-patches.js';
import '@webconsulting/visual-editor-enhancements/Frontend/components/ve-editable-link.js';

/**
 * The editor chrome wears the backend's theme (Shared/theme.js): the backend
 * frame answers requestTheme with its resolved design tokens and sends them
 * again whenever the backend's theme or colour scheme changes. Until then the
 * backend user's colour scheme setting picks light or dark for the fallback.
 */
function initializeThemeBridge() {
  const scheme = editorColorScheme();
  if (scheme !== 'auto') {
    applyTheme({scheme});
  }
  onMessage('veTheme', (theme) => applyTheme(theme));
  sendMessage('requestTheme', null, 'parent');
}

async function initializeElementLibrary() {
  if (!isElementLibraryEnabled()) {
    return null;
  }
  const libraryModule = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library.js');
  await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library-button.js');
  document.body.appendChild(document.createElement('ve-element-library-button'));
  if (elementLibraryOpen.get()) {
    libraryModule.getElementLibrary().openPanel();
  }
  return libraryModule;
}

/**
 * One shared injection pass (initial sweep + MutationObserver + wrapped
 * VeContentElement.updated) feeds every per-element enhancement: the
 * action-bar buttons, the action-bar labels (vendor buttons included, so
 * this pass always runs) and the per-output context buttons on the editable
 * outputs inside an element. The repeated sweeps pick up late-rendered
 * outputs; each injector is idempotent.
 */
async function initializeContentElementActions() {
  const libraryModule = await initializeElementLibrary();
  const injectActions = (contentElement) => {
    if (libraryModule !== null) {
      injectLibraryAction(contentElement, libraryModule);
    }
    if (isFieldChooserEnabled()) {
      injectFieldChooserAction(contentElement);
    }
    if (isInlineRecordsEnabled()) {
      injectInlineRecordsAction(contentElement);
    }
    attachElementContextAffordance(contentElement);
    installActionBarLabels(contentElement);
    annotateCollectionRows(contentElement);
  };
  const injectAll = () => document.querySelectorAll('ve-content-element').forEach(injectActions);
  injectAll();
  new MutationObserver(injectAll).observe(document.documentElement, {childList: true, subtree: true});
  customElements.whenDefined('ve-content-element').then(async () => {
    const {VeContentElement} = await import('@typo3/visual-editor/Frontend/components/ve-content-element');
    const originalUpdated = VeContentElement.prototype.updated;
    if (originalUpdated?.visualEditorEnhancementsWrapped) {
      return;
    }
    const wrappedUpdated = function (changedProperties) {
      originalUpdated?.call(this, changedProperties);
      queueMicrotask(() => injectActions(this));
    };
    wrappedUpdated.visualEditorEnhancementsWrapped = true;
    VeContentElement.prototype.updated = wrappedUpdated;
    injectAll();
  });
}

function injectLibraryAction(contentElement, libraryModule) {
  if (!window.veInfo?.allowNewContent) {
    return;
  }
  const actionBar = contentElement.shadowRoot?.querySelector('.action-bar');
  if (!actionBar || actionBar.querySelector('[data-ve-enhancement="element-library"]')) {
    return;
  }
  const button = makeButton('element-library', {label: translate('frontend.actionBar.library', 'Library'),
    description: translate('frontend.library.fromLibrary', 'Add from library'), icon: '<ve-icon name="actions-menu-alternative"></ve-icon>'});
  button.addEventListener('click', () => libraryModule.getElementLibrary().openPanel());
  actionBar.appendChild(button);
}

initializeThemeBridge();
initializeContentElementActions();
initializeElementRefresh();
