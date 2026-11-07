import {html, nothing} from 'lit';
import {live} from 'lit/directives/live.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {inlineLabel, collectionReason} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
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

/** The rows that still exist as entries (placeholders of a workspace deletion are listed read-only). */
export const activeChildren = (field) => (field.children ?? []).filter((child) => child.state !== 'deleted');

/**
 * Ordered uids the server compiled (field.uids) - the identities of a move.
 * @return {number[]}
 */
function orderedUids(field) {
  const active = activeChildren(field).map((child) => child.uid);
  const uids = Array.isArray(field.uids) ? field.uids.filter((uid) => active.includes(uid)) : [];
  return uids.length === active.length ? uids : active;
}

/**
 * The `afterUid` of moving one step: up = after the row two above (null =
 * first position), down = after the next row.
 * @return {{afterUid: number|null}|null} null when the row cannot move that way
 */
export function moveTarget(field, child, direction) {
  const uids = orderedUids(field);
  const index = uids.indexOf(child.uid);
  if (index < 0) { return null; }
  if (direction === 'up') {
    return index === 0 ? null : {afterUid: index >= 2 ? uids[index - 2] : null};
  }
  return index >= uids.length - 1 ? null : {afterUid: uids[index + 1]};
}

/** The reason one control is refused, '' when it is allowed. */
function reasons(field, child, ctx) {
  const structural = ctx.blocked;
  const sort = field.sortReason ? collectionReason(field.sortReason) : '';
  const createReason = field.createReason ? collectionReason(field.createReason) : (field.canCreate === false ? inlineLabel('controls') : '');
  return {
    up: structural || sort,
    down: structural || sort,
    eye: child.canHide === false ? collectionReason(child.hideReason) || inlineLabel('controls') : '',
    after: structural || createReason,
    remove: structural || (child.canDelete ? '' : collectionReason(child.deleteReason) || inlineLabel('controls')) || ctx.rowBlocked(child),
    title: child.canEditLabel === false ? collectionReason(child.labelReason) : '',
  };
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
    return html`<input type="text" class="entryTitle" data-child-edit=${child.uid}
      aria-label=${fill(inlineLabel('titleOf'), {position})} .value=${live(ctx.title(child))}
      placeholder=${inlineLabel('newEntry')} autocomplete="off" spellcheck="true"
      @input=${(event) => ctx.stageTitle(child, event.target.value)}
      @keydown=${(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); ctx.restoreTitle(child); event.target.value = ctx.title(child); }
      }}>`;
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

function rowMenuItems(field, child, ctx) {
  const items = [{label: inlineLabel('settings'), run: () => ctx.settings(child)}];
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

function rowKeydown(event, field, child, ctx, reason) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const target = moveTarget(field, child, direction);
    if (target && !reason[direction]) { ctx.action('move', child, {...target, direction}); }
    return;
  }
  const inField = event.composedPath().some((node) => node instanceof HTMLInputElement);
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

function renderRow(field, child, index, ctx) {
  const position = index + 1;
  const label = plain(child.label);
  const reason = reasons(field, child, ctx);
  const deleted = child.state === 'deleted';
  const hidden = ctx.hidden(child);
  const refusals = deleted ? [] : Object.entries(reason).filter(([control, text]) => text && control !== 'title'
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
    ${deleted ? html`<p class="entryReadOnly">${collectionReason('deleted')}</p>` : html`
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
          .icon=${'<ve-icon name="actions-menu-alternative" width="16px"></ve-icon>'} .items=${rowMenuItems(field, child, ctx)}></ve-row-menu>
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
  const max = Number(field.maxItems ?? 0);
  const min = Number(field.minItems ?? 0);
  const createReason = ctx.blocked || (field.createReason ? collectionReason(field.createReason) : (field.canCreate === false ? inlineLabel('controls') : ''));
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
