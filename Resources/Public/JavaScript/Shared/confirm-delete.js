/** Core delegates to the same-origin backend window. Plain confirm is the cross-origin fallback. */
export async function confirmCollectionDelete(child) {
  let focus = document.activeElement;
  while (focus?.shadowRoot?.activeElement) { focus = focus.shadowRoot.activeElement; }
  const consequence = child.verb === 'discard' ? 'The new workspace entry will be discarded.'
    : child.verb === 'markForDeletion' ? 'Deletion is staged in this workspace; the live entry remains until publication.'
      : 'It disappears from the live site immediately.';
  const content = `Remove “${child.label}”? ${consequence} Reset does not undo this operation.`;
  try {
    if (window.top === window || window.top.location.origin !== window.location.origin) {
      return window.confirm(content);
    }
    const [{default: Modal}, {Severity}] = await Promise.all([
      import('@typo3/backend/modal.js'), import('@typo3/backend/severity.js'),
    ]);
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
    const modal = Modal.confirm('Remove collection entry', escapedContent, severity, [
      {text: 'Cancel', active: true, btnClass: 'btn-default', trigger: (_event, dialog) => { resolve(false); dialog.hideModal(); }},
      {text: 'Remove', btnClass: 'btn-danger', trigger: (_event, dialog) => { resolve(true); dialog.hideModal(); }},
    ]);
    modal.addEventListener('typo3-modal-hidden', () => resolve(false), {once: true});
  });
}
