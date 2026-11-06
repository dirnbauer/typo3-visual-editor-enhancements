import {html} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {inlineLabel, collectionReason} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';

function editEntry(child, blocked) {
  const label = `${inlineLabel('edit')}: ${child.label}`;
  const content = html`<span class="entryTitle">${child.label}</span>
    ${child.hidden ? html`<span class="entryBadge">${inlineLabel('hiddenLabel')}</span>` : ''}
    <svg class="entryEditIcon" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="m10 2 4 4-8 8H2v-4zM8 4l4 4"/></svg>`;
  if (blocked) {
    return html`<button type="button" class="entryEdit" disabled title=${blocked} aria-label=${label}>${content}</button>`;
  }
  // Use the same Core sheet as the element's pencil: it edits real text,
  // media and required fields, and retains Core's save/close handling.
  if (child.contextualUrl && customElements.get('typo3-backend-contextual-record-edit-trigger')) {
    return html`<typo3-backend-contextual-record-edit-trigger class="entryEdit" data-child-edit=${child.uid}
      url=${child.contextualUrl} edit-url=${child.backendUrl} title=${label} aria-label=${label}>${content}</typo3-backend-contextual-record-edit-trigger>`;
  }
  return html`<a class="entryEdit" data-child-edit=${child.uid} href=${child.backendUrl}
    target="_blank" rel="noopener" title=${label} aria-label=${label}>${content}</a>`;
}

/** Render a compact list. Restrictions are explained where their action lives. */
export function renderCollection(field, {blocked, settings, action}) {
  const children = field.children || [];
  return html`<section class="collection" aria-label=${field.label}>
    <header class="collectionHeader">
      <h3>${field.label}</h3>
      ${field.uids ? html`<span class="count" aria-label=${inlineLabel('entries')}>${field.uids.length}</span>` : ''}
    </header>
    ${blocked ? html`<p class="collectionNotice" role="status">${blocked}</p>` : ''}
    ${children.length ? html`<ol class="entryList">
      ${children.map((child, index) => html`<li class="entryItem">
        <div class="entryRow">
          <span class="entryNumber" aria-hidden="true">${index + 1}</span>
          ${editEntry(child, blocked)}
          <details class="entryMenu">
            <summary class="iconButton" aria-label=${`${inlineLabel('actions')}: ${child.label}`} title=${inlineLabel('actions')}>⋯</summary>
            <div class="entryActions">
              <button type="button" class="textAction" data-child-settings=${child.uid} @click=${() => settings(child)}>
                ${unsafeHTML(slidersIconSvg(14))}${inlineLabel('settings')}
              </button>
              <button type="button" class="textAction" aria-label=${inlineLabel('addAfter')} ?disabled=${!!blocked || !field.canCreate}
                title=${blocked || collectionReason(field.createReason)} @click=${() => action('create', child)}>＋ ${inlineLabel('addAfter')}</button>
              <button type="button" class="textAction danger" ?disabled=${!!blocked || !child.canDelete}
                title=${blocked || collectionReason(child.deleteReason)} @click=${() => action('delete', child)}>${inlineLabel('remove')}</button>
              ${child.deleteReason ? html`<p class="actionReason">${collectionReason(child.deleteReason)}</p>` : ''}
              <a class="textAction" href=${child.backendUrl} target="_blank" rel="noopener">${inlineLabel('backend')} ↗</a>
            </div>
          </details>
        </div>
      </li>`)}
    </ol>` : field.uids ? html`<p class="collectionNotice">${inlineLabel('empty')}</p>` : ''}
    <button type="button" class="addEntry" aria-label=${inlineLabel('add')} ?disabled=${!!blocked || !field.canCreate}
      title=${blocked || collectionReason(field.createReason)} @click=${() => action('create')}>＋ ${inlineLabel('add')}</button>
    ${field.createReason ? html`<p class="collectionNotice">${collectionReason(field.createReason)}</p>`
      : field.createHidden ? html`<p class="collectionHint">${inlineLabel('newHidden')}</p>` : ''}
    <a class="backendLink" href=${field.backendUrl} target="_blank" rel="noopener">${inlineLabel('backend')} ↗</a>
  </section>`;
}
