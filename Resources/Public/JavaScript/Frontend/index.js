import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {elementLibraryOpen} from '@webconsulting/visual-editor-enhancements/Shared/local-stores';
import {fieldChooserTables, isEditableLinksEnabled, isElementLibraryEnabled, isFieldChooserEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config';
import {attachElementContextAffordance} from '@webconsulting/visual-editor-enhancements/Frontend/element-context-affordance';
import '@webconsulting/visual-editor-enhancements/Frontend/visual-editor-patches';
import '@webconsulting/visual-editor-enhancements/Frontend/components/ve-editable-link';

function initializeAccentBridge() {
  if (!isElementLibraryEnabled() && !isEditableLinksEnabled() && !isFieldChooserEnabled()) {
    return;
  }
  onMessage('veAccent', ({color}) => {
    if (color) {
      document.documentElement.style.setProperty('--ve-accent-color', color);
    }
  });
  sendMessage('requestAccent', null, 'parent');
}

async function initializeElementLibrary() {
  if (!isElementLibraryEnabled()) {
    return null;
  }
  const libraryModule = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library');
  await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library-button');
  document.body.appendChild(document.createElement('ve-element-library-button'));
  if (elementLibraryOpen.get()) {
    libraryModule.getElementLibrary().openPanel();
  }
  return libraryModule;
}

/**
 * One shared injection pass (initial sweep + MutationObserver + wrapped
 * VeContentElement.updated) feeds every per-element enhancement - the
 * action-bar buttons and the per-output context buttons (hover buttons on the
 * editable outputs inside an element that open the field chooser scoped to
 * the output's form group, while the action-bar button keeps opening the full
 * popover); it is set up only when at least one of them is enabled, and the
 * prototype wrap is installed once no matter which features are on. The
 * per-output affordance needs no extra gate here: it only applies when the
 * field chooser is enabled, which the early return below already covers, and
 * the repeated sweeps let it pick up late-rendered outputs.
 */
async function initializeContentElementActions() {
  const libraryModule = await initializeElementLibrary();
  if (libraryModule === null && !isFieldChooserEnabled()) {
    return;
  }
  const injectActions = (contentElement) => {
    if (libraryModule !== null) {
      injectLibraryAction(contentElement, libraryModule);
    }
    injectFieldChooserAction(contentElement);
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
  const label = window.TYPO3?.lang?.['frontend.library.fromLibrary'] || 'Add from library';
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
  const label = window.TYPO3?.lang?.['frontend.fieldChooser.open'] || 'Edit field settings';
  button.title = label;
  button.setAttribute('aria-label', label);
  // Sliders/options glyph: the vendor <ve-icon> set has no fitting name, so an
  // inline line-art SVG sized like <ve-icon> (16x16) is used instead.
  button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">'
    + '<path d="M2 4.5h4.25M12.25 4.5H14M2 11.5h1.75M9.75 11.5H14"/>'
    + '<circle cx="8.25" cy="4.5" r="2"/>'
    + '<circle cx="5.75" cy="11.5" r="2"/>'
    + '</svg>';
  button.addEventListener('click', async () => {
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser');
    openFieldChooser({
      table: contentElement.getAttribute('table'),
      uid: Number(contentElement.getAttribute('uid')),
      cType: contentElement.getAttribute('cType') ?? '',
      elementName: contentElement.getAttribute('elementName') ?? '',
      anchorRect: button.getBoundingClientRect(),
    });
  });
  actionBar.appendChild(button);
}

initializeAccentBridge();
initializeContentElementActions();
