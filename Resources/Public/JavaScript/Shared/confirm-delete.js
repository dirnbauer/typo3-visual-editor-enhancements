import {translate} from './dom-utils.js';
import {inlineLabel} from './inline-record-actions.js';

/**
 * The confirmation sentence, counted: Core cascades a default-language
 * entry's connected translations (deleteL10nOverlayRecords), so the editor
 * is told how many go with it and in which languages.
 * @param {{label: string, verb?: string, cascade?: {translations?: number, languages?: number[]}, translationOnly?: boolean}} child
 * @param {{translationMode?: string, translationLanguages?: Array<{id: number, title: string}>}} field
 * @return {string}
 */
export function deleteConfirmText(child, field = {}) {
  const consequence = child.verb === 'discard' ? inlineLabel('confirmDiscard')
    : child.verb === 'markForDeletion' ? inlineLabel('confirmStage')
      : inlineLabel('confirmLive');
  const parts = [inlineLabel('confirmEntry').replace('{label}', child.label ?? '')];
  const count = Number(child.cascade?.translations ?? 0);
  if (count > 0) {
    const titles = new Map((field.translationLanguages ?? []).map((language) => [Number(language.id), language.title]));
    const languages = (child.cascade?.languages ?? []).map((id) => titles.get(Number(id)) ?? String(id)).join(', ');
    const staged = child.verb === 'markForDeletion' || child.verb === 'discard';
    const key = staged ? 'confirmTranslationsStage' : 'confirmTranslations';
    parts.push(inlineLabel(key).replace('{count}', String(count)).replace('{languages}', languages || '–'));
  } else if (field.translationMode === 'connected' && !child.translationOnly) {
    parts.push(inlineLabel('confirmLanguageOnly'));
  }
  parts.push(consequence, inlineLabel('confirmReset'));
  return parts.join(' ');
}

/** Core delegates to the same-origin backend window. Plain confirm is the cross-origin fallback. */
export async function confirmCollectionDelete(child, field = {}) {
  let focus = document.activeElement;
  while (focus?.shadowRoot?.activeElement) { focus = focus.shadowRoot.activeElement; }
  const content = deleteConfirmText(child, field);
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
export function confirmWithCoreModal(Modal, severity, escapedContent, {title = inlineLabel('confirmTitle'), confirm = translate('frontend.inlineRecords.remove', 'Remove')} = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = Modal.confirm(title, escapedContent, severity, [
      {text: inlineLabel('cancel'), active: true, btnClass: 'btn-default', trigger: (_event, dialog) => { confirmed = false; dialog.hideModal(); }},
      {text: confirm, btnClass: 'btn-danger', trigger: (_event, dialog) => { confirmed = true; dialog.hideModal(); }},
    ]);
    modal.addEventListener('typo3-modal-hidden', () => resolve(confirmed), {once: true});
  });
}

/**
 * Synchronize is the destructive sync mode: Core also removes translations
 * whose original no longer exists. Counted, Cancel by default.
 * @param {{translationLanguages?: Array<{id: number, title: string, missing?: number, orphaned?: number}>}} field
 * @param {number} language
 * @return {Promise<boolean>}
 */
export async function confirmSynchronize(field, language) {
  let focus = document.activeElement;
  while (focus?.shadowRoot?.activeElement) { focus = focus.shadowRoot.activeElement; }
  const entry = (field.translationLanguages ?? []).find((candidate) => Number(candidate.id) === Number(language)) ?? {};
  const content = inlineLabel('confirmSynchronize')
    .replaceAll('{language}', entry.title ?? String(language))
    .replace('{missing}', String(entry.missing ?? 0))
    .replace('{orphaned}', String(entry.orphaned ?? 0));
  try {
    if (window.top === window || window.top.location.origin !== window.location.origin) {
      return window.confirm(content);
    }
    let Modal = window.top.TYPO3?.Modal;
    let Severity = window.top.TYPO3?.Severity;
    if (!Modal || !Severity) {
      [{default: Modal}, {default: Severity}] = await Promise.all([
        import('@typo3/backend/modal.js'), import('@typo3/backend/severity.js'),
      ]);
    }
    const safe = document.createElement('span');
    safe.textContent = content;
    return await confirmWithCoreModal(Modal, Severity.warning, safe.innerHTML,
      {title: inlineLabel('confirmSyncTitle'), confirm: inlineLabel('syncConfirmButton')});
  } catch {
    return window.confirm(content);
  } finally {
    focus?.focus?.({preventScroll: true});
  }
}
