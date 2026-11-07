import {css, html, LitElement, nothing} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';

/**
 * A small action menu for one inspector row (and the footer's "Sync
 * translations ▾"): a trigger button with aria-haspopup="menu" and a
 * role="menu" list in the browser's top layer (the native Popover API, so
 * the inspector's scrolling body never clips it). Keyboard: Enter, Space or
 * ArrowDown open on the first item, ArrowUp on the last; ArrowUp/ArrowDown,
 * Home and End move between items; Escape and Tab close it and Escape
 * returns the focus to the trigger. It closes on a pointerdown outside and
 * when another menu opens (popover="auto" light dismiss).
 *
 * Items: {label, run?(), href?, reason?, hint?, element?(index), separator?} -
 * a refused item is aria-disabled with its reason as description (never
 * `disabled`); `element` returns a ready template (the Core contextual edit
 * trigger) that carries role="menuitem", class "item" and data-index.
 *
 * @extends {HTMLElement}
 */
export class VeRowMenu extends LitElement {
  static properties = {
    label: {type: String},
    text: {type: String},
    icon: {type: String},
    items: {attribute: false},
    rovingTabIndex: {attribute: false},
    open: {type: Boolean, state: true},
  };

  constructor() {
    super();
    this.label = '';
    this.text = '';
    this.icon = '';
    this.items = [];
    this.rovingTabIndex = 0;
    this.open = false;
  }

  /** The host stands for its trigger (roving focus in the row toolbar). */
  focus(options) {
    this.#trigger()?.focus(options);
  }

  #trigger() { return this.renderRoot.querySelector('.trigger'); }
  #menu() { return this.renderRoot.querySelector('[role="menu"]'); }
  #menuItems() { return [...(this.#menu()?.querySelectorAll('[role="menuitem"]') ?? [])]; }

  /** @param {'first'|'last'} focus */
  async show(focus = 'first') {
    const menu = this.#menu();
    if (!menu || this.items.length === 0) { return; }
    if (!menu.matches(':popover-open')) { menu.showPopover(); }
    this.#place();
    await this.updateComplete;
    const items = this.#menuItems();
    (focus === 'last' ? items.at(-1) : items[0])?.focus({preventScroll: true});
  }

  hide({restoreFocus = false} = {}) {
    const menu = this.#menu();
    if (menu?.matches(':popover-open')) { menu.hidePopover(); }
    if (restoreFocus) { this.#trigger()?.focus({preventScroll: true}); }
  }

  /** Fixed placement below the trigger, end-aligned; flips above when short. */
  #place() {
    const menu = this.#menu();
    const rect = this.#trigger()?.getBoundingClientRect();
    if (!menu || !rect) { return; }
    const gap = 4;
    const edge = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(edge, Math.min(rect.right - width, window.innerWidth - width - edge));
    const below = rect.bottom + gap + height <= window.innerHeight - edge || rect.top - gap - height < edge;
    const top = below ? rect.bottom + gap : rect.top - gap - height;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(Math.max(edge, top))}px`;
  }

  #onToggle(event) {
    this.open = event.newState === 'open';
    this.#trigger()?.setAttribute('aria-expanded', String(this.open));
  }

  #onTriggerKeydown(event) {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      this.show(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  }

  #onTriggerClick(event) {
    event.stopPropagation();
    if (this.#menu()?.matches(':popover-open')) {
      this.hide();
      return;
    }
    // A keyboard activation (Enter/Space) also arrives as a click.
    this.show('first');
  }

  #onMenuKeydown(event) {
    const items = this.#menuItems();
    const index = items.indexOf(this.renderRoot.activeElement);
    let next = null;
    switch (event.key) {
      case 'ArrowDown': next = items[(index + 1) % items.length]; break;
      case 'ArrowUp': next = items[(index - 1 + items.length) % items.length]; break;
      case 'Home': next = items[0]; break;
      case 'End': next = items.at(-1); break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.hide({restoreFocus: true});
        return;
      case 'Tab':
        this.hide();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    next?.focus({preventScroll: true});
  }

  /** One delegated handler: buttons, links and ready-made items (the Core contextual trigger) alike. */
  #onMenuClick(event) {
    const node = event.composedPath().find((entry) => entry instanceof Element && entry.getAttribute('role') === 'menuitem');
    if (!node) { return; }
    const item = this.items[Number(node.dataset.index)];
    if (node.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.hide({restoreFocus: !item?.href && !item?.element});
    item?.run?.();
  }

  render() {
    return html`
      <button type="button" class="trigger ${this.text ? 'hasText' : ''}" aria-haspopup="menu" aria-expanded="false" tabindex=${this.rovingTabIndex}
        aria-label=${this.label || nothing} title=${this.text ? nothing : this.label}
        @click=${(event) => this.#onTriggerClick(event)} @keydown=${(event) => this.#onTriggerKeydown(event)}>
        ${this.icon ? unsafeHTML(this.icon) : ''}${this.text ? html`<span>${this.text}</span><span class="caret" aria-hidden="true">▾</span>` : ''}
      </button>
      <div role="menu" popover="auto" aria-label=${this.label || this.text}
        @toggle=${(event) => this.#onToggle(event)} @keydown=${(event) => this.#onMenuKeydown(event)} @click=${(event) => this.#onMenuClick(event)}>
        ${this.items.map((item, index) => item.separator ? html`<div role="separator" class="separator"></div>`
          : item.element ? item.element(index)
            : item.href ? html`<a role="menuitem" tabindex="-1" class="item" data-index=${index} href=${item.href} target="_blank" rel="noopener">${item.label}</a>`
              : html`<button type="button" role="menuitem" tabindex="-1" class="item" data-index=${index}
                  aria-disabled=${item.reason ? 'true' : nothing} aria-describedby=${item.reason ? `reason-${index}` : nothing}>
                  <span>${item.label}</span>${item.hint ? html`<span class="hint">${item.hint}</span>` : ''}
                  ${item.reason ? html`<span class="reason" id="reason-${index}">${item.reason}</span>` : ''}
                </button>`)}
      </div>
    `;
  }

  static styles = [themeTokens, css`
    :host { display: inline-flex; }
    .trigger {
      display: inline-flex; align-items: center; justify-content: center; gap: 4px;
      min-width: 26px; height: 26px; padding: 0 4px;
      border: 1px solid transparent; border-radius: var(--ve-radius-small);
      background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer;
    }
    .trigger.hasText { padding: 0 6px; color: var(--ve-primary-text); font-weight: 600; }
    .trigger:hover, .trigger[aria-expanded="true"] { background: var(--ve-hover); }
    .trigger:focus-visible, .item:focus-visible { outline: 2px solid var(--ve-focus); outline-offset: 1px; }
    .caret { font-size: 10px; }
    [role="menu"] {
      position: fixed; inset: auto; margin: 0;
      min-width: 200px; max-width: min(320px, calc(100vw - 16px));
      padding: 4px; border: 1px solid var(--ve-border); border-radius: var(--ve-radius);
      background: var(--ve-surface-raised); color: var(--ve-text); box-shadow: var(--ve-shadow);
      font-family: var(--ve-font-family); font-size: 12px; line-height: 1.4;
    }
    .item {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; width: 100%;
      padding: 6px 8px; border: 0; border-radius: var(--ve-radius-small);
      background: transparent; color: inherit; font: inherit; text-align: start; text-decoration: none; cursor: pointer;
    }
    .item:hover:not([aria-disabled="true"]) { background: var(--ve-hover); }
    .item[aria-disabled="true"] { color: var(--ve-text-muted); cursor: not-allowed; }
    .hint { color: var(--ve-text-muted); font-size: 11px; }
    .reason { flex-basis: 100%; color: var(--ve-text-muted); font-size: 11px; }
    .separator { height: 1px; margin: 4px 2px; background: var(--ve-border); }
  `];
}

if (!customElements.get('ve-row-menu')) {
  customElements.define('ve-row-menu', VeRowMenu);
}
