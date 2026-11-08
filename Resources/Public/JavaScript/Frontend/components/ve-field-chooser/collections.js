import {html, nothing} from 'lit';
import {live} from 'lit/directives/live.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {collectionLimit, collectionReason, fromTextControl, inlineLabel, titleKeyAction} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {activeChildren, createRefusal, duplicateOffered, moveTarget, restoreControl, rowReasons} from '@webconsulting/visual-editor-enhancements/Shared/row-actions.js';
import {addEntryIconSvg, caretDownIconSvg, caretUpIconSvg, eyeSlashIconSvg, formInsertAfterIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import '@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser/row-menu.js';

/**
 * The entries inspector: one section per collection field of the element.
 * Every row shows its actions (move, visibility, add after, remove, menu) -
 * quiet at rest, full strength on row hover or focus. Refused actions stay
 * focusable (aria-disabled) and explain themselves through the row's reason
 * line. Titles and visibility are STAGED on the vendor store, exactly like
 * the vendor's own editables and its element hide toggle, and saved with the
 * page; add, add after, move and remove are server intents that save at once.
 *
 * @typedef {object} InspectorContext
 * @property {string} blocked        reason blocking every structural action ('' = none)
 * @property {(child: object) => string} rowBlocked   reason holding this row's Remove
 * @property {(child: object) => boolean} hidden       effective visibility (store first)
 * @property {(child: object) => boolean} pending      title or visibility staged
 * @property {(child: object) => string} title         current title (store first)
 * @property {(child: object, value: string) => void} stageTitle
 * @property {(child: object) => void} restoreTitle
 * @property {(child: object) => void} toggleHidden
 * @property {(child: object) => void} settings
 * @property {(action: string, child?: object|null, options?: object) => void} action
 * @property {(child: object|null) => void} activeRow
 * @property {(child: object, on: boolean) => void} highlight     outline the entry's row on the page
 * @property {(child: object) => boolean} [mirrored]               the page row under the pointer is this entry
 * @property {(field: object, child: object) => Array<object>} menuItems   extra row menu items (translations)
 * @property {(field: object) => unknown} footerExtras                     extra footer controls (translations)
 * @property {(child: object, field: object) => Array<unknown>} extraBadges extra badges (translations)
 */

const plain = (text) => text ?? '';
const fill = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), text);

export {activeChildren, moveTarget};

/** The reason one control is refused, '' when it is allowed. */
function reasons(field, child, ctx) {
  return rowReasons(field, child, ctx.blocked, ctx.rowBlocked(child));
}

function iconButton({control, uid, label, icon, reason, endDisabled = false, onClick, extra = {}}) {
  const refused = !!reason || endDisabled;
  return html`<button type="button" class="iconButton rowAction" data-control=${control} aria-label=${label}
    title=${reason || extra.tooltip || label} aria-disabled=${refused ? 'true' : nothing}
    aria-describedby=${reason ? `reason-${uid}-${control}` : nothing}
    role=${extra.role ?? nothing} aria-checked=${extra.checked ?? nothing}
    @click=${(event) => { if (event.currentTarget.getAttribute('aria-disabled') === 'true') { return; } onClick(); }}>${icon}</button>`;
}

function titleControl(field, child, ctx, position, reason) {
  const label = plain(child.label);
  if (child.state === 'deleted') {
    return html`<span class="entryTitleText">${label}</span>`;
  }
  if (child.canEditLabel && field.labelField) {
    // A plain input label stored with a literal <br> arrives as a line break
    // (seeded like the page editable): an <input> would drop it, so it gets the
    // multi-line control too.
    const multiline = !!field.labelMultiline || String(child.labelValue ?? '').includes('\n');
    const keydown = (event) => {
      const action = titleKeyAction(event, multiline);
      if (action === 'commit') { event.preventDefault(); event.target.blur(); }
      if (action === 'restore') { event.preventDefault(); event.stopPropagation(); ctx.restoreTitle(child); event.target.value = ctx.title(child); }
    };
    // A text-area label column (TCA type=text) keeps its line breaks: a
    // one-row textarea growing with its content (field-sizing), never an
    // <input>, whose value sanitising would strip them.
    return multiline
      ? html`<textarea class="entryTitle isMultiline" rows="1" data-child-edit=${child.uid}
        aria-label=${fill(inlineLabel('titleOf'), {position})} .value=${live(ctx.title(child))}
        placeholder=${inlineLabel('newEntry')} autocomplete="off" spellcheck="true"
        @input=${(event) => ctx.stageTitle(child, event.target.value)} @keydown=${keydown}></textarea>`
      : html`<input type="text" class="entryTitle" data-child-edit=${child.uid}
        aria-label=${fill(inlineLabel('titleOf'), {position})} .value=${live(ctx.title(child))}
        placeholder=${inlineLabel('newEntry')} autocomplete="off" spellcheck="true"
        @input=${(event) => ctx.stageTitle(child, event.target.value)} @keydown=${keydown}>`;
  }
  // Not a plain text field (or no right): Core's contextual sheet edits it.
  const editLabel = `${inlineLabel('edit')}: ${label}`;
  if (child.contextualUrl && customElements.get('typo3-backend-contextual-record-edit-trigger')) {
    return html`<typo3-backend-contextual-record-edit-trigger class="entryTitleLink" data-child-edit=${child.uid}
      url=${child.contextualUrl} edit-url=${child.backendUrl} title=${reason || editLabel} aria-label=${editLabel}>${label}</typo3-backend-contextual-record-edit-trigger>`;
  }
  return html`<a class="entryTitleLink" data-child-edit=${child.uid} href=${child.backendUrl} target="_blank" rel="noopener"
    title=${reason || editLabel} aria-label=${editLabel}>${label}</a>`;
}

function badges(field, child, ctx) {
  const list = [];
  if (child.state === 'deleted') {
    list.push(html`<span class="entryBadge isDeleted">${inlineLabel('badgeDeleted')}</span>`);
  } else {
    if (ctx.hidden(child)) {
      list.push(html`<span class="entryBadge isHidden">${unsafeHTML(eyeSlashIconSvg(11))}${inlineLabel('hiddenLabel')}</span>`);
    }
    if (child.state === 'new') { list.push(html`<span class="entryBadge">${inlineLabel('badgeNew')}</span>`); }
    if (child.state === 'modified') { list.push(html`<span class="entryBadge">${inlineLabel('badgeModified')}</span>`); }
  }
  list.push(...(ctx.extraBadges?.(child, field) ?? []));
  if (ctx.pending(child)) {
    list.push(html`<span class="entryBadge isPending"><span class="pendingDot" aria-hidden="true"></span>${inlineLabel('badgePending')}</span>`);
  }
  return list;
}

function rowMenuItems(field, child, ctx, reason) {
  const items = [];
  if (duplicateOffered(child)) {
    items.push({label: inlineLabel('duplicate'), reason: reason.duplicate, run: () => ctx.action('duplicate', child)});
  }
  items.push({label: inlineLabel('settings'), run: () => ctx.settings(child)});
  if (child.contextualUrl && customElements.get('typo3-backend-contextual-record-edit-trigger')) {
    items.push({element: (index) => html`<typo3-backend-contextual-record-edit-trigger role="menuitem" tabindex="-1" class="item" data-index=${index}
      url=${child.contextualUrl} edit-url=${child.backendUrl}>${inlineLabel('editInForm')}</typo3-backend-contextual-record-edit-trigger>`});
  }
  items.push(...(ctx.menuItems?.(field, child) ?? []));
  if (child.backendUrl) {
    items.push({label: `${inlineLabel('backend')} ↗`, href: child.backendUrl});
  }
  return items;
}

/**
 * Row shortcuts on the row's controls (not inside its title, where
 * Alt/Option+Arrow moves the caret and Delete deletes text).
 */
function rowKeydown(event, field, child, ctx, reason) {
  const inField = fromTextControl(event);
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !inField) {
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const target = moveTarget(field, child, direction);
    if (target && !reason[direction]) { ctx.action('move', child, {...target, direction}); }
    return;
  }
  if (event.key === 'Delete' && !inField && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    if (!reason.remove) { ctx.action('delete', child); }
  }
}

/**
 * Roving focus inside a row's toolbar: one tab stop, arrows move.
 * @param {KeyboardEvent} event
 */
function toolbarKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { return; }
  const toolbar = event.currentTarget;
  const items = rovingItems(toolbar);
  const active = items.findIndex((item) => event.composedPath().includes(item));
  if (active < 0) { return; }
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (active + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
  setRoving(toolbar, next);
  items[next].focus({preventScroll: true});
}

/** @param {Element} toolbar */
export function rovingItems(toolbar) {
  return [...toolbar.children].filter((node) => node.matches('button, ve-row-menu'));
}

/**
 * @param {Element} toolbar
 * @param {number} index the item that keeps the tab stop
 */
export function setRoving(toolbar, index) {
  rovingItems(toolbar).forEach((item, position) => {
    if (item.localName === 've-row-menu') { item.rovingTabIndex = position === index ? 0 : -1; }
    else { item.tabIndex = position === index ? 0 : -1; }
  });
  toolbar.dataset.roving = String(index);
}

/**
 * A workspace delete placeholder: read-only, with "Undo removal" when the
 * server offers it (Core discards the staged deletion; the live entry was
 * never touched).
 */
function renderPlaceholder(child, ctx) {
  const restore = restoreControl(child, ctx.blocked);
  if (!restore.offered) {
    return html`<p class="entryReadOnly">${collectionReason('deleted')}</p>`;
  }
  return html`<div class="entryActions isPlaceholder">
    <button type="button" class="undoRemoval" data-control="restore" aria-disabled=${restore.reason ? 'true' : nothing}
      title=${restore.reason || nothing} aria-describedby=${restore.reason ? `reason-${child.uid}-restore` : nothing}
      @click=${(event) => { if (event.currentTarget.getAttribute('aria-disabled') !== 'true') { ctx.action('restore', child); } }}>
      <ve-icon name="actions-undo" width="14px"></ve-icon><span>${inlineLabel('undoRemoval')}</span>
    </button>
  </div>
  ${restore.reason ? html`<p class="actionReason"><span id="reason-${child.uid}-restore">${restore.reason}</span></p>` : ''}`;
}

function renderRow(field, child, index, ctx) {
  const position = index + 1;
  const label = plain(child.label);
  const reason = reasons(field, child, ctx);
  const deleted = child.state === 'deleted';
  const hidden = ctx.hidden(child);
  const refusals = deleted ? [] : Object.entries(reason).filter(([control, text]) => text && control !== 'title' && control !== 'duplicate'
    && !(control === 'remove' && !child.canDelete && child.deleteReason === 'deleted'));
  const up = moveTarget(field, child, 'up');
  const down = moveTarget(field, child, 'down');
  const showHint = !deleted && hidden && child.uid === ctx.createdUid && field.createHidden;
  return html`<li class="entryItem ${deleted ? 'isDeleted' : ''} ${hidden ? 'isHiddenEntry' : ''} ${ctx.mirrored?.(child) ? 'isMirrored' : ''}" data-ve-row=${child.uid} data-state=${child.state ?? 'live'}
    @keydown=${(event) => !deleted && rowKeydown(event, field, child, ctx, reason)}
    @focusin=${() => ctx.activeRow(child)}
    @pointerenter=${() => ctx.highlight(child, true)} @pointerleave=${() => ctx.highlight(child, false)}>
    <span class="entryNumber" aria-hidden="true">${deleted ? '–' : position}</span>
    <div class="entryMain">
      ${titleControl(field, child, ctx, position, reason.title)}
      <div class="entryMeta">${badges(field, child, ctx)}</div>
    </div>
    ${deleted ? renderPlaceholder(child, ctx) : html`
      <div class="entryActions" role="toolbar" aria-label=${fill(inlineLabel('rowActions'), {label: label || position})}
        @keydown=${toolbarKeydown}>
        ${iconButton({control: 'up', uid: child.uid, label: inlineLabel('moveUp'), icon: unsafeHTML(caretUpIconSvg(14)),
          reason: reason.up, endDisabled: !up || child.canMoveUp === false, onClick: () => ctx.action('move', child, {...up, direction: 'up'})})}
        ${iconButton({control: 'down', uid: child.uid, label: inlineLabel('moveDown'), icon: unsafeHTML(caretDownIconSvg(14)),
          reason: reason.down, endDisabled: !down || child.canMoveDown === false, onClick: () => ctx.action('move', child, {...down, direction: 'down'})})}
        ${iconButton({control: 'eye', uid: child.uid, label: inlineLabel('visible'), reason: reason.eye,
          icon: html`<ve-icon name=${hidden ? 'actions-toggle-off' : 'actions-toggle-on'} width="16px"></ve-icon>`,
          extra: {role: 'switch', checked: hidden ? 'false' : 'true', tooltip: inlineLabel(hidden ? 'unhide' : 'hide')}, onClick: () => ctx.toggleHidden(child)})}
        ${iconButton({control: 'after', uid: child.uid, label: inlineLabel('addAfter'), icon: unsafeHTML(formInsertAfterIconSvg(14)),
          reason: reason.after, onClick: () => ctx.action('create', child)})}
        ${iconButton({control: 'remove', uid: child.uid, label: inlineLabel('remove'), reason: reason.remove,
          icon: html`<ve-icon name="actions-delete" width="16px"></ve-icon>`, onClick: () => ctx.action('delete', child)})}
        <ve-row-menu class="rowAction" .label=${`${inlineLabel('moreActions')}: ${label || position}`}
          .icon=${'<ve-icon name="actions-menu-alternative" width="16px"></ve-icon>'} .items=${rowMenuItems(field, child, ctx, reason)}></ve-row-menu>
      </div>`}
    ${showHint ? html`<p class="entryHint">${inlineLabel('hiddenHint')}</p>` : ''}
    ${refusals.length ? html`<p class="actionReason">${refusals.map(([control, text]) => html`<span id="reason-${child.uid}-${control}">${text}</span>`)}</p>` : ''}
  </li>`;
}

/**
 * @param {object} field the collection payload (FieldOptionsService / InlineRecordService)
 * @param {InspectorContext & {createdUid?: number|null}} ctx
 */
export function renderCollection(field, ctx) {
  const children = field.children ?? [];
  const count = activeChildren(field).length;
  const max = collectionLimit(field.maxItems);
  const min = Number(field.minItems ?? 0);
  const createReason = createRefusal(field, ctx.blocked);
  const addText = field.childTitle ? fill(inlineLabel('addEntry'), {title: field.childTitle}) : inlineLabel('add');
  return html`<section class="collection" aria-label=${field.label} data-collection=${field.name}>
    <header class="collectionHeader">
      <h3>${field.label}</h3>
      <span class="count" title=${inlineLabel('entries')}>${max > 0 ? fill(inlineLabel('countMax'), {count, max}) : count}</span>
      ${min > 0 && count <= min ? html`<span class="minHint">${fill(inlineLabel('minHint'), {min})}</span>` : ''}
    </header>
    ${children.length ? html`<div class="entryHead" aria-hidden="true"><span>#</span><span>${inlineLabel('columnTitle')}</span><span>${inlineLabel('columnState')}</span><span>${inlineLabel('columnActions')}</span></div>
      <ol class="entryList">${children.map((child, index) => renderRow(field, child, index, ctx))}</ol>`
      : field.uids ? html`<p class="collectionNotice">${inlineLabel('empty')}</p>` : ''}
    <div class="collectionFooter">
      <button type="button" class="addEntry" aria-disabled=${createReason ? 'true' : nothing} title=${createReason || nothing}
        aria-describedby=${createReason ? `reason-add-${field.name}` : nothing}
        @click=${(event) => { if (event.currentTarget.getAttribute('aria-disabled') !== 'true') { ctx.action('create'); } }}>
        ${unsafeHTML(addEntryIconSvg(14))}<span>${addText}</span>
      </button>
      <span class="footerSpacer"></span>
      ${ctx.footerExtras?.(field) ?? ''}
      ${field.backendUrl ? html`<a class="backendLink" href=${field.backendUrl} target="_blank" rel="noopener">${inlineLabel('backend')} ↗</a>` : ''}
    </div>
    ${createReason ? html`<p class="collectionNotice" id="reason-add-${field.name}">${createReason}</p>`
      : field.createHidden && !field.workspaceId ? html`<p class="collectionHint">${inlineLabel('newHidden')}</p>` : ''}
    ${field.requiredBackend?.length ? html`<p class="collectionHint">${inlineLabel('backendRequired')} ${field.requiredBackend.join(', ')}</p>` : ''}
  </section>`;
}
