import {translate} from './dom-utils.js';
import {inlineLabel} from './inline-record-actions.js';

/** Core delegates to the same-origin backend window. Plain confirm is the cross-origin fallback. */
export async function confirmCollectionDelete(child) {
  let focus = document.activeElement;
  while (focus?.shadowRoot?.activeElement) { focus = focus.shadowRoot.activeElement; }
  const consequence = child.verb === 'discard' ? inlineLabel('confirmDiscard')
    : child.verb === 'markForDeletion' ? inlineLabel('confirmStage')
      : inlineLabel('confirmLive');
  const content = `${inlineLabel('confirmEntry').replace('{label}', child.label)} ${consequence} ${inlineLabel('confirmReset')}`;
  try {
    if (window.top === window || window.top.location.origin !== window.location.origin) {
      return window.confirm(content);
    }
    // Use the backend's initialized Core API. Importing backend/modal inside
    // the frontend frame also loads backend-only label modules absent there.
    let Modal = window.top.TYPO3?.Modal;
    let Severity = window.top.TYPO3?.Severity;
    if (!Modal || !Severity) {
      [{default: Modal}, {default: Severity}] = await Promise.all([
        import('@typo3/backend/modal.js'), import('@typo3/backend/severity.js'),
      ]);
    }
    // Core's string content is HTML. A DOM node's textContent supplies safe escaping.
    const safe = document.createElement('span');
    safe.textContent = content;
    return await confirmWithCoreModal(Modal, Severity.warning, safe.innerHTML);
  } catch {
    return window.confirm(content);
  } finally {
    focus?.focus?.({preventScroll: true});
  }
}

/** Small Core adapter, exported for isolated modal cancellation tests. */
export function confirmWithCoreModal(Modal, severity, escapedContent) {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = Modal.confirm(inlineLabel('confirmTitle'), escapedContent, severity, [
      {text: inlineLabel('cancel'), active: true, btnClass: 'btn-default', trigger: (_event, dialog) => { confirmed = false; dialog.hideModal(); }},
      {text: translate('frontend.inlineRecords.remove', 'Remove'), btnClass: 'btn-danger', trigger: (_event, dialog) => { confirmed = true; dialog.hideModal(); }},
    ]);
    modal.addEventListener('typo3-modal-hidden', () => resolve(confirmed), {once: true});
  });
}
