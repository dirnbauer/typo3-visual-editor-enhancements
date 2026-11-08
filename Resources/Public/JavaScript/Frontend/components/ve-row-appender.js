import {css, html, LitElement, nothing} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {viewportSize} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {addEntryIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {appenderPlacement} from '@webconsulting/visual-editor-enhancements/Shared/row-actions.js';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';

/**
 * The on-page "Add <entry>" buttons of a content element's collections: one
 * dashed ghost button after the collection's last marked entry (or before its
 * first, as TCA levelLinksPosition says). A body-level singleton like the row
 * toolbar - nothing is inserted into the page or the Visual Editor's wrapper:
 * the buttons float over the gap below (above) the entries while the element
 * is hovered or holds the focus, at 60 % strength, full strength on their own
 * hover or focus. At the collection's maximum a button stays, refused
 * (aria-disabled) with the reason.
 *
 * @typedef {{key: string, side: 'top'|'bottom', label: string, reason: string, rect: () => DOMRect|null, run: () => void}} AppenderItem
 * @extends {HTMLElement}
 */
export class VeRowAppender extends LitElement {
  static properties = {
    visible: {type: Boolean, reflect: true},
    items: {attribute: false, state: true},
    busy: {type: Boolean, state: true},
  };

  constructor() {
    super();
    this.visible = false;
    /** @type {AppenderItem[]} */
    this.items = [];
    this.busy = false;
    /** @type {Element|null} the content element the buttons belong to */
    this.owner = null;
    this.hideTimer = 0;
    this.frame = 0;
    this.engaged = {pointer: false, focus: false};
    this.lastLayout = '';
    /** @type {(() => boolean)|null} keeps the buttons while it says so (the row toolbar of the same element is in use) */
    this.keepAlive = null;
  }

  disconnectedCallback() {
    this.hideNow();
    super.disconnectedCallback();
  }

  /**
   * @param {Element} owner the ve-content-element
   * @param {AppenderItem[]} items
   */
  showFor(owner, items) {
    this.#cancelHide();
    this.owner = owner;
    this.items = items;
    this.visible = items.length > 0;
    this.lastLayout = '';
    if (this.visible) { this.#track(); }
  }

  get isEngaged() {
    return this.engaged.pointer || this.engaged.focus;
  }

  scheduleHide() {
    this.#cancelHide();
    if (this.isEngaged || this.busy) { return; }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = 0;
      if (this.keepAlive?.()) {
        this.scheduleHide();
        return;
      }
      this.hideNow();
    }, 150);
  }

  hideNow() {
    this.#cancelHide();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.visible = false;
    this.engaged = {pointer: false, focus: false};
    this.owner = null;
  }

  /** @param {string} key */
  button(key) {
    return this.renderRoot.querySelector(`.appender[data-key="${CSS.escape(key)}"]`);
  }

  #cancelHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = 0;
    }
  }

  #track() {
    if (this.frame) { return; }
    const step = () => {
      this.frame = 0;
      if (!this.visible) { return; }
      if (!this.owner?.isConnected) {
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
    const viewport = viewportSize(0);
    const buttons = [...this.renderRoot.querySelectorAll('.appender')];
    const layout = this.items.map((item) => item.rect());
    const key = JSON.stringify(layout.map((rect) => rect && [rect.top, rect.left, rect.bottom, rect.right])) + viewport.width + viewport.height;
    if (key === this.lastLayout) { return; }
    this.lastLayout = key;
    this.items.forEach((item, index) => {
      const button = buttons[index];
      const rect = layout[index];
      if (!button) { return; }
      const place = rect ? appenderPlacement(rect, item.side, button.offsetHeight || 32, viewport) : null;
      button.toggleAttribute('data-offscreen', place === null);
      if (place) {
        button.style.left = `${place.left}px`;
        button.style.top = `${place.top}px`;
        button.style.width = `${place.width}px`;
      }
    });
  }

  #onFocusOut(event) {
    const next = event.relatedTarget;
    if (next instanceof Node && this.renderRoot.contains(next)) { return; }
    this.engaged.focus = false;
    if (next instanceof Node && this.owner?.contains(next)) { return; }
    this.scheduleHide();
  }

  updated(changed) {
    if (changed.has('items') || changed.has('visible')) {
      this.lastLayout = '';
      if (this.visible) { this.#position(); }
    }
  }

  render() {
    const tab = this.visible ? 0 : -1;
    return html`<div class="layer" aria-hidden=${this.visible ? 'false' : 'true'}
        @pointerenter=${() => { this.engaged.pointer = true; this.#cancelHide(); }}
        @pointerleave=${() => { this.engaged.pointer = false; this.scheduleHide(); }}
        @focusin=${() => { this.engaged.focus = true; this.#cancelHide(); }}
        @focusout=${(event) => this.#onFocusOut(event)}>
      ${this.items.map((item) => html`<button type="button" class="appender" data-key=${item.key} data-side=${item.side} tabindex=${tab}
        aria-disabled=${item.reason || this.busy ? 'true' : nothing} title=${item.reason || nothing}
        aria-describedby=${item.reason ? `reason-${item.key}` : nothing}
        @click=${(event) => { if (event.currentTarget.getAttribute('aria-disabled') !== 'true') { item.run(); } }}>
        ${unsafeHTML(addEntryIconSvg(14))}<span>${item.label}</span>
        ${item.reason ? html`<span class="reason" id="reason-${item.key}">${item.reason}</span>` : ''}
      </button>`)}
    </div>`;
  }

  static styles = [themeTokens, css`
    :host {
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 100000;
      width: 0;
      height: 0;
    }

    .layer { display: contents; }

    /* A dashed ghost in the editor's theme: at rest its surface is 60 %
       strong (a slight blur keeps the page behind it from showing through
       the words), the text always full strength; on its own hover or focus
       the surface is solid and the border takes the primary colour. */
    .appender {
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-sizing: border-box;
      min-height: 32px;
      margin: 0;
      padding: 4px 12px;
      border: 1px dashed var(--ve-input-border);
      border-radius: var(--ve-radius);
      background: color-mix(in srgb, var(--ve-surface-raised) 60%, transparent);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
      color: var(--ve-text);
      font-family: var(--ve-font-family);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease, background-color 0.12s ease, border-color 0.12s ease;
    }

    :host([visible]) .appender:not([data-offscreen]) {
      opacity: 1;
      pointer-events: auto;
    }

    .appender:hover:not([aria-disabled="true"]),
    .appender:focus-visible {
      border-color: var(--ve-primary-text);
      background: var(--ve-surface-raised);
      color: var(--ve-primary-text);
    }

    .appender:focus-visible {
      outline: 2px solid var(--ve-focus);
      outline-offset: 2px;
    }

    .appender[aria-disabled="true"] {
      cursor: not-allowed;
    }

    .reason {
      flex-basis: 100%;
      font-size: 11px;
      font-weight: 400;
    }

    .appender:has(.reason) { flex-wrap: wrap; }

    @media (prefers-reduced-motion: reduce) {
      .appender { transition: none; }
    }
  `];
}

/** @type {VeRowAppender|null} */
let appender = null;

/** @return {VeRowAppender} */
export function getRowAppender() {
  if (appender === null || !appender.isConnected) {
    appender = document.createElement('ve-row-appender');
    document.body.appendChild(appender);
  }
  return appender;
}

if (!customElements.get('ve-row-appender')) {
  customElements.define('ve-row-appender', VeRowAppender);
}
