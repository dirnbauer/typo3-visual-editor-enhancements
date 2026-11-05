import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {elementLibraryOpen} from '@webconsulting/visual-editor-enhancements/Shared/local-stores.js';
import {editorColorScheme, fieldChooserTables, isElementLibraryEnabled, isFieldChooserEnabled, isInlineRecordsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {translate} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
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
 * action-bar buttons and the per-output context buttons on the editable
 * outputs inside an element. The repeated sweeps pick up late-rendered
 * outputs; each injector is idempotent.
 */
async function initializeContentElementActions() {
  const libraryModule = await initializeElementLibrary();
  if (libraryModule === null && !isFieldChooserEnabled() && !isInlineRecordsEnabled()) {
    return;
  }
  const injectActions = (contentElement) => {
    if (libraryModule !== null) {
      injectLibraryAction(contentElement, libraryModule);
    }
    injectFieldChooserAction(contentElement);
    injectInlineRecordsAction(contentElement);
    attachElementContextAffordance(contentElement);
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
  const button = document.createElement('button');
  button.className = 'button';
  button.type = 'button';
  button.dataset.veEnhancement = 'element-library';
  const label = translate('frontend.library.fromLibrary', 'Add from library');
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = '<ve-icon name="actions-menu-alternative"></ve-icon>';
  button.addEventListener('click', () => libraryModule.getElementLibrary().openPanel());
  actionBar.appendChild(button);
}

/**
 * Adds the "Edit field settings" button for records whose table is enabled for
 * the field chooser. Deliberately NOT gated by veInfo.allowNewContent: editing
 * choice fields of an existing record does not require the right to create
 * content, only canModifyRecord on the element itself.
 */
function injectFieldChooserAction(contentElement) {
  if (!isFieldChooserEnabled()
    || !fieldChooserTables().includes(contentElement.getAttribute('table'))
    || !contentElement.hasAttribute('canModifyRecord')
  ) {
    return;
  }
  const actionBar = contentElement.shadowRoot?.querySelector('.action-bar');
  if (!actionBar || actionBar.querySelector('[data-ve-enhancement="field-chooser"]')) {
    return;
  }
  const button = document.createElement('button');
  button.className = 'button';
  button.type = 'button';
  button.dataset.veEnhancement = 'field-chooser';
  const label = translate('frontend.fieldChooser.open', 'Edit field settings');
  button.title = label;
  button.setAttribute('aria-label', label);
  // Sliders/options glyph: the vendor <ve-icon> set has no fitting name, so an
  // inline line-art SVG sized like <ve-icon> (16x16) is used instead.
  button.innerHTML = slidersIconSvg(16);
  button.addEventListener('click', async () => {
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    openFieldChooser({
      table: contentElement.getAttribute('table'),
      uid: Number(contentElement.getAttribute('uid')),
      elementName: contentElement.getAttribute('elementName') ?? '',
      anchorRect: button.getBoundingClientRect(),
    });
  });
  actionBar.appendChild(button);
}

initializeThemeBridge();
initializeContentElementActions();
initializeElementRefresh();

function injectInlineRecordsAction(element) {
  if (!isInlineRecordsEnabled() || !element.hasAttribute('canModifyRecord')) { return; }
  const bar = element.shadowRoot?.querySelector('.action-bar');
  if (!bar || bar.querySelector('[data-ve-enhancement="inline-records"]')) { return; }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.dataset.veEnhancement = 'inline-records';
  button.textContent = '+';
  button.title = translate('frontend.inlineRecords.open', 'Edit collection entries');
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', async () => {
    const {fetchFieldOptions} = await import('../Shared/field-options-cache.js');
    const {openFieldChooser} = await import('./components/ve-field-chooser.js');
    const table = element.getAttribute('table');
    const uid = Number(element.getAttribute('uid'));
    try {
      const data = await fetchFieldOptions(table, uid);
      openFieldChooser({table, uid, anchorRect: button.getBoundingClientRect(),
        scopeFields: data.fields.filter((field) => field.type === 'inline').map((field) => field.name), scopeLabel: translate('frontend.inlineRecords.entries', 'Entries')});
    } catch { button.title = translate('frontend.inlineRecords.loadError', 'Could not load entries. Open the backend form.'); }
  });
  bar.appendChild(button);
}
