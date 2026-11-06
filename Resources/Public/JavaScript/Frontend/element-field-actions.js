import {fieldChooserTables, isFieldChooserEnabled, isInlineRecordsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {translate} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {entriesIconSvg, slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';

function makeButton(kind, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.dataset.veEnhancement = kind;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = icon;
  return button;
}

function insertAfterEdit(bar, button) {
  const edit = bar.querySelector('typo3-backend-contextual-record-edit-trigger, a.button');
  edit ? edit.after(button) : bar.appendChild(button);
}

function options(element, trigger) {
  return {table: element.getAttribute('table'), uid: Number(element.getAttribute('uid')),
    elementName: element.getAttribute('elementName') ?? '', trigger, anchorRect: trigger.getBoundingClientRect()};
}

export function injectFieldChooserAction(element) {
  if (!isFieldChooserEnabled() || !fieldChooserTables().includes(element.getAttribute('table'))
    || !element.hasAttribute('canModifyRecord')) { return; }
  const bar = element.shadowRoot?.querySelector('.action-bar');
  if (!bar || bar.querySelector('[data-ve-enhancement="field-chooser"]')) { return; }
  const button = makeButton('field-chooser', translate('frontend.fieldChooser.open', 'Edit field settings'), slidersIconSvg(16));
  button.addEventListener('click', async () => {
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    openFieldChooser({...options(element, button), view: 'settings'});
  });
  insertAfterEdit(bar, button);
}

export function injectInlineRecordsAction(element) {
  if (!isInlineRecordsEnabled() || !element.hasAttribute('canModifyRecord')) { return; }
  const bar = element.shadowRoot?.querySelector('.action-bar');
  if (!bar || bar.querySelector('[data-ve-enhancement="inline-records"]')) { return; }
  const button = makeButton('inline-records', translate('frontend.inlineRecords.open', 'Edit collection entries'), entriesIconSvg(16));
  const label = document.createElement('span');
  label.textContent = translate('frontend.inlineRecords.entries', 'Entries');
  button.append(label);
  button.style.cssText = 'display:none;gap:5px;font:inherit;font-size:12px;white-space:nowrap';
  const settings = bar.querySelector('[data-ve-enhancement="field-chooser"]');
  settings ? settings.after(button) : insertAfterEdit(bar, button);
  button.addEventListener('click', async () => {
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    openFieldChooser({...options(element, button), view: 'entries'});
  });

  // Discover on interaction, not with one endpoint request per element at page
  // load. The shared cache also serves the field settings and hover affordances.
  let discovering = false;
  const discover = async () => {
    if (discovering) { return; }
    discovering = true;
    try {
      const data = await fetchFieldOptions(element.getAttribute('table'), Number(element.getAttribute('uid')));
      button.style.display = data.fields?.some((field) => field.type === 'inline') ? 'inline-flex' : 'none';
    } catch {
      // A later hover can retry; an empty or inaccessible collection gets no
      // misleading add control. The native edit action remains available.
      button.style.display = 'none';
    } finally { discovering = false; }
  };
  element.addEventListener('pointerenter', discover);
  element.addEventListener('focusin', discover);
  if (element.matches(':hover, :focus-within')) { discover(); }
}
