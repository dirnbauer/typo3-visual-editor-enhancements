import {css, html, LitElement, nothing} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {viewportSize} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {railPlacement} from '@webconsulting/visual-editor-enhancements/Shared/row-actions.js';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';
import {installOwnLabelBar} from '@webconsulting/visual-editor-enhancements/Frontend/action-bar-labels.js';

/**
 * The on-page row toolbar ("rail") of a collection entry: a body-level
 * singleton, anchored to the hovered or focused entry's primary rendering
 * (the f:mark.item marker - nothing is inserted into the page or into the
 * Visual Editor's wrapper). The pattern of ve-context-chip.js: showFor() /
 * scheduleHide() with a 150 ms grace period, cancelled while the pointer or
 * the focus is inside the toolbar.
 *
 * It renders what Frontend/row-layer.js hands it - the same actions, refusal
 * reasons and intents as the entries inspector - and labels its buttons like
 * the Visual Editor's action bar (User settings > Action bar labels, the same
 * shared stylesheet). The keyboard path stays the inspector: the toolbar never
 * intercepts Tab; Escape inside it returns the focus to the entry.
 *
 * It follows its entry every animation frame while shown (scrolling, sliders
 * and other transformed containers move entries without scroll events) and
 * steps aside while the entry is outside the viewport or clipped away.
 *
 * Below it, a small status card (role=status) reports what an action did -
 * text with an icon, never a button.
 *
 * @typedef {{control: string, label: string, icon: string, reason?: string, checked?: boolean|null, run: () => void}} RailItem
 * @extends {HTMLElement}
 */
export class VeRowActions extends LitElement {
  static properties = {
    visible: {type: Boolean, reflect: true},
    items: {attribute: false, state: true},
    label: {type: String, state: true},
    busy: {type: Boolean, state: true},
    status: {type: String, state: true},
    statusKind: {type: String, state: true},
  };

  constructor() {
    super();
    this.visible = false;
    /** @type {RailItem[]} */
    this.items = [];
    this.label = '';
    this.busy = false;
    this.status = '';
    this.statusKind = 'info';
    /** @type {Element|null} the entry's primary rendering */
    this.target = null;
    /** @type {(() => Array<DOMRect>)|null} clip boxes of the target's clipping ancestors */
    this.clips = null;
    /** @type {(() => void)|null} Escape: back to the entry */
    this.onEscape = null;
    this.hideTimer = 0;
    this.statusTimer = 0;
    this.frame = 0;
    this.engaged = {pointer: false, focus: false};
    this.lastRect = '';
    this.statusAnchor = null;
  }

  disconnectedCallback() {
    this.hideNow();
    super.disconnectedCallback();
  }

  /**
   * Shows the toolbar for one entry (a newer call retargets it).
   * @param {Element} target the entry's primary rendering
   * @param {{items: RailItem[], label: string, clips?: () => Array<DOMRect>, onEscape?: () => void}} options
   */
  showFor(target, {items, label, clips = null, onEscape = null}) {
    this.#cancelHide();
    if (this.target !== target) {
      this.target?.removeAttribute('data-ve-item-current');
    }
    this.target = target;
    this.items = items;
    this.label = label;
    this.clips = clips;
    this.onEscape = onEscape;
    this.lastRect = '';
    this.visible = true;
    target.setAttribute('data-ve-item-current', '');
    this.#track();
  }

  /** True while the pointer or the keyboard focus is inside the toolbar. */
  get isEngaged() {
    return this.engaged.pointer || this.engaged.focus;
  }

  scheduleHide() {
    this.#cancelHide();
    if (this.isEngaged || this.busy) {
      return;
    }
    this.hideTimer = setTimeout(() => this.hideNow(), 150);
  }

  hideNow() {
    this.#cancelHide();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.visible = false;
    this.engaged = {pointer: false, focus: false};
    this.target?.removeAttribute('data-ve-item-current');
    this.target = null;
  }

  /**
   * Reports an outcome below the toolbar's last position (or the given box),
   * for a few seconds; errors stay until the next action.
   * @param {string} text
   * @param {'info'|'error'} kind
   * @param {DOMRect|null} anchor where to show it when the toolbar is gone
   */
  announce(text, kind = 'info', anchor = null) {
    clearTimeout(this.statusTimer);
    this.status = text;
    this.statusKind = kind;
    if (anchor) { this.statusAnchor = anchor; }
    this.#placeStatus();
    if (text && kind === 'info') {
      this.statusTimer = setTimeout(() => { this.status = ''; }, 8000);
    }
  }

  /** The button of one control, for focus after an action. */
  button(control) {
    return this.renderRoot.querySelector(`.button[data-control="${control}"]`);
  }

  #cancelHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = 0;
    }
  }

  /** Follows the target every frame while shown; cheap when nothing moved. */
  #track() {
    if (this.frame) { return; }
    const step = () => {
      this.frame = 0;
      if (!this.visible) { return; }
      if (!this.target?.isConnected) {
        this.hideNow();
        return;
      }
      this.#position();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
    this.updateComplete.then(() => this.#position());
  }

  #position() {
    const bar = this.renderRoot.querySelector('.bar');
    if (!bar || !this.target) { return; }
    const own = this.target.getBoundingClientRect();
    const clips = this.clips?.() ?? [];
    let rect = own;
    for (const clip of clips) {
      rect = {top: Math.max(rect.top, clip.top), left: Math.max(rect.left, clip.left),
        bottom: Math.min(rect.bottom, clip.bottom), right: Math.min(rect.right, clip.right)};
    }
    const key = `${rect.top}|${rect.left}|${rect.bottom}|${rect.right}|${bar.offsetWidth}|${bar.offsetHeight}`;
    if (key === this.lastRect) { return; }
    this.lastRect = key;
    const viewport = viewportSize(0);
    const place = railPlacement(rect, {width: bar.offsetWidth, height: bar.offsetHeight}, viewport);
    if (place === null) {
      // Out of view (scrolled away, a slide moved out): step aside, keep the target.
      this.toggleAttribute('offscreen', true);
      return;
    }
    this.removeAttribute('offscreen');
    bar.style.left = `${place.left}px`;
    bar.style.top = `${place.top}px`;
    this.statusAnchor = new DOMRect(place.left, place.top, bar.offsetWidth, bar.offsetHeight);
    this.#placeStatus();
  }

  #placeStatus() {
    const card = this.renderRoot.querySelector('.status');
    const anchor = this.statusAnchor;
    if (!card || !anchor) { return; }
    const {width, height} = viewportSize(0);
    const cardWidth = Math.min(320, width - 16);
    const left = Math.min(Math.max(8, anchor.right - cardWidth), width - cardWidth - 8);
    const below = anchor.bottom + 6;
    card.style.width = `${cardWidth}px`;
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(below + 60 > height ? Math.max(8, anchor.top - 6 - card.offsetHeight) : below)}px`;
  }

  #onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const back = this.onEscape;
      this.engaged.focus = false;
      this.hideNow();
      back?.();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { return; }
    const buttons = [...this.renderRoot.querySelectorAll('.bar .button')];
    const index = buttons.indexOf(this.renderRoot.activeElement);
    if (index < 0) { return; }
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  #onFocusOut(event) {
    const next = event.relatedTarget;
    if (next instanceof Node && (this.renderRoot.contains(next) || next === this)) { return; }
    this.engaged.focus = false;
    // Focus went back to the entry itself: the row layer keeps the toolbar.
    if (next instanceof Node && this.target?.contains(next)) { return; }
    this.scheduleHide();
  }

  #onClick(item, event) {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true' || this.busy) {
      return;
    }
    item.run();
  }

  updated(changed) {
    const bar = this.renderRoot.querySelector('.bar');
    if (bar && this.renderRoot instanceof ShadowRoot) {
      installOwnLabelBar(this.renderRoot, bar);
    }
    if (changed.has('items') || changed.has('visible')) {
      this.lastRect = '';
      if (this.visible) { this.#position(); }
    }
    if (changed.has('status')) { this.#placeStatus(); }
  }

  render() {
    const tab = this.visible ? 0 : -1;
    return html`
      <div class="action-bar bar" role="toolbar" aria-label=${this.label || nothing} aria-hidden=${this.visible ? 'false' : 'true'}
        aria-busy=${this.busy ? 'true' : 'false'}
        @pointerenter=${() => { this.engaged.pointer = true; this.#cancelHide(); }}
        @pointerleave=${() => { this.engaged.pointer = false; this.scheduleHide(); }}
        @focusin=${() => { this.engaged.focus = true; this.#cancelHide(); }}
        @focusout=${(event) => this.#onFocusOut(event)}
        @keydown=${(event) => this.#onKeydown(event)}>
        ${this.items.map((item) => html`<button type="button" class="button" data-control=${item.control} tabindex=${tab}
          aria-label=${item.label} title=${item.reason || nothing}
          aria-disabled=${item.reason ? 'true' : nothing}
          role=${item.checked === undefined || item.checked === null ? nothing : 'switch'}
          aria-checked=${item.checked === undefined || item.checked === null ? nothing : String(item.checked)}
          @click=${(event) => this.#onClick(item, event)}>${unsafeHTML(item.icon)}</button>`)}
      </div>
      <p class="status ${this.status ? '' : 'isEmpty'} ${this.statusKind === 'error' ? 'isError' : ''}" role="status">
        ${this.status ? html`<span class="statusIcon" aria-hidden="true">${this.statusKind === 'error' ? '!' : 'i'}</span><span>${this.status}</span>` : ''}
      </p>
    `;
  }

  static styles = [themeTokens, css`
    :host {
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 100001;
      width: 0;
      height: 0;
    }

    /* The Visual Editor's action-bar look (its .action-bar/.button rules):
       the toolbar belongs to the same family of on-page chrome. #d9d9d9 on
       #171717 = 12.7:1, on the #212121 hover = 11.4:1. */
    .bar {
      position: fixed;
      display: flex;
      align-items: center;
      gap: 2px;
      box-sizing: border-box;
      padding: 4px;
      border: 1px solid #d9d9d9;
      border-radius: 6px;
      background: #171717;
      color: #d9d9d9;
      font-family: var(--ve-font-family);
      font-size: 14px;
      line-height: 1;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease;
    }

    :host([visible]:not([offscreen])) .bar {
      opacity: 1;
      pointer-events: auto;
    }

    .button {
      position: static;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-width: 28px;
      height: 26px;
      margin: 0;
      padding: 0.2em 0.45em;
      border: 1px solid transparent;
      border-radius: 0.2em;
      background: transparent;
      color: #d9d9d9;
      font: inherit;
      cursor: pointer;
      transition: border 0.2s;
    }

    .button svg { width: 15px; height: 15px; }

    .button:hover:not([aria-disabled="true"]),
    .button:focus-visible {
      border-color: #d9d9d9;
      background-color: #212121;
    }

    .button:focus-visible {
      outline: 2px solid #5432fe;
      outline-offset: 2px;
    }

    .button[role="switch"][aria-checked="false"] { color: #a3a3a3; }

    .status {
      position: fixed;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      box-sizing: border-box;
      margin: 0;
      padding: 8px 10px;
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      box-shadow: var(--ve-shadow);
      font-family: var(--ve-font-family);
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
    }

    .status.isEmpty {
      width: 0 !important;
      height: 0;
      padding: 0;
      border: 0;
      overflow: hidden;
      box-shadow: none;
    }

    .statusIcon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ve-primary-subtle);
      color: var(--ve-primary-text);
      font-size: 11px;
      font-weight: 700;
      font-style: italic;
    }

    .status.isError .statusIcon { font-style: normal; }

    @media (prefers-reduced-motion: reduce) {
      .bar { transition: none; }
    }
  `];
}

/** @type {VeRowActions|null} */
let rowActions = null;

/**
 * The singleton, created on first use and appended to the document body.
 * @return {VeRowActions}
 */
export function getRowActions() {
  if (rowActions === null || !rowActions.isConnected) {
    rowActions = document.createElement('ve-row-actions');
    document.body.appendChild(rowActions);
  }
  return rowActions;
}

if (!customElements.get('ve-row-actions')) {
  customElements.define('ve-row-actions', VeRowActions);
}
