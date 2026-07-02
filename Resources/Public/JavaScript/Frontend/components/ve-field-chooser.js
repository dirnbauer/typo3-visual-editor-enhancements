import {css, html, LitElement} from 'lit';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';

const translate = (key, fallback) => window.TYPO3?.lang?.[key] || fallback;

/**
 * Singleton popover listing the "choice" fields of one content record - static
 * single-value selects and category trees - as reported by the
 * ?veFieldOptions=1 endpoint. Every change is staged on the shared
 * dataHandlerStore and written to the database only with the next explicit
 * save, exactly like an inline text edit; reverting a field to the value it
 * had when the options loaded clears the pending change again. Opened via
 * openFieldChooser() from the per-element action-bar button injected in
 * Frontend/index.js.
 *
 * @extends {HTMLElement}
 */
export class VeFieldChooser extends LitElement {
  static properties = {
    open: {type: Boolean, state: true, attribute: false},
    loading: {type: Boolean, state: true, attribute: false},
    error: {type: Boolean, state: true, attribute: false},
    fields: {type: Array, state: true, attribute: false},
    elementName: {type: String, state: true, attribute: false},
    popoverStyle: {type: String, state: true, attribute: false},
  };

  constructor() {
    super();
    this.open = false;
    this.loading = false;
    this.error = false;
    this.fields = [];
    this.elementName = '';
    this.popoverStyle = '';
    this.table = '';
    this.uid = 0;
    this.listening = false;
    // Collapsed category nodes (uids); collapsing is purely visual - checked
    // categories inside a collapsed subtree stay part of the staged value.
    this.collapsedCategories = new Set();
    // Out-of-order guard: bumping it invalidates the response of any fetch
    // still in flight (another element was opened or the popover was closed).
    this.loadSeq = 0;
    // Re-render on store changes so the dirty dots (and checkbox/select state
    // derived from staged values) stay in sync with reverts and saves.
    this.onStoreChange = () => this.requestUpdate();
    this.onDocumentKeydown = (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    };
    this.onDocumentPointerDown = (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (path.includes(this)) {
        return;
      }
      // Chooser buttons toggle/re-anchor via their own click handler; closing
      // here already on pointerdown would make that click re-open the popover.
      if (path.some((node) => node instanceof Element && node.dataset?.veEnhancement === 'field-chooser')) {
        return;
      }
      this.close();
    };
  }

  disconnectedCallback() {
    this.#stopListening();
    super.disconnectedCallback();
  }

  /**
   * Opens the popover for one content element and loads its field options, or
   * toggles it closed when it is already showing exactly that element.
   * @param {{table: string, uid: number, cType?: string, elementName?: string, anchorRect: DOMRect}} options
   */
  openFor({table, uid, elementName, anchorRect}) {
    if (this.open && this.table === table && this.uid === uid) {
      this.close();
      return;
    }
    this.table = table;
    this.uid = uid;
    this.elementName = elementName ?? '';
    this.open = true;
    this.#position(anchorRect);
    this.#startListening();
    this.#load();
  }

  close() {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.loadSeq++;
    this.#stopListening();
  }

  #startListening() {
    if (this.listening) {
      return;
    }
    this.listening = true;
    dataHandlerStore.addEventListener('change', this.onStoreChange);
    document.addEventListener('keydown', this.onDocumentKeydown);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  #stopListening() {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    dataHandlerStore.removeEventListener('change', this.onStoreChange);
    document.removeEventListener('keydown', this.onDocumentKeydown);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  /**
   * Anchors the fixed popover to the action-bar button: preferred below the
   * button, left-aligned and clamped to the viewport; when the space below is
   * short it flips above (bottom-anchored, so it grows upwards).
   * @param {DOMRect} rect
   */
  #position(rect) {
    const width = 320;
    const gap = 8;
    const edge = 12;
    const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || width);
    const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
    const left = clamp(Math.round(rect.left), edge, viewportWidth - width - edge);
    const capHeight = (space) => Math.round(Math.min(viewportHeight * 0.6, Math.max(space, 160)));
    const spaceBelow = viewportHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    if (spaceBelow >= viewportHeight * 0.3 || spaceBelow >= spaceAbove) {
      this.popoverStyle = `top:${Math.round(rect.bottom + gap)}px;left:${left}px;max-height:${capHeight(spaceBelow)}px;`;
    } else {
      this.popoverStyle = `bottom:${Math.round(viewportHeight - rect.top + gap)}px;left:${left}px;max-height:${capHeight(spaceAbove)}px;`;
    }
  }

  async #load() {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = false;
    this.fields = [];
    this.collapsedCategories = new Set();
    try {
      const response = await fetch(
        window.location.pathname
          + '?veFieldOptions=1&editMode=1&table=' + encodeURIComponent(this.table) + '&uid=' + this.uid,
        {headers: {'X-Request-Token': window.veInfo?.token ?? ''}},
      );
      const data = await response.json();
      if (seq !== this.loadSeq) {
        return; // superseded: another element was opened or the popover closed
      }
      if (!response.ok || data.error) {
        throw new Error(data.error || ('HTTP ' + response.status));
      }
      this.fields = data.fields || [];
      // Baseline for the pending-change diff: reverting a field to this value
      // clears its staged change again (see data-handler-store setInitialData).
      for (const field of this.fields) {
        dataHandlerStore.setInitialData(this.table, this.uid, field.name, this.#initialValue(field));
      }
      this.loading = false;
    } catch {
      if (seq !== this.loadSeq) {
        return;
      }
      this.error = true;
      this.loading = false;
    }
  }

  /**
   * The server value in the store's staging format: selects stage the plain
   * value string, category fields an ordered comma-separated uid list ("2,5").
   * @param {{type: string, value: string|string[]}} field
   * @return {string}
   */
  #initialValue(field) {
    if (field.type === 'category') {
      return Array.isArray(field.value) ? field.value.join(',') : '';
    }
    return String(field.value ?? '');
  }

  #currentValue(field) {
    const staged = dataHandlerStore.data?.[this.table]?.[this.uid]?.[field.name];
    // The store's initialData is the live server baseline (it is seeded by
    // #load and follows markSaved()), so a save while the popover is open
    // keeps the controls on the just-saved state instead of the fetched one.
    return staged
      ?? dataHandlerStore.initialData?.[this.table]?.[this.uid]?.[field.name]
      ?? this.#initialValue(field);
  }

  #currentValues(field) {
    const value = this.#currentValue(field);
    return value === '' ? [] : value.split(',');
  }

  #stageSelect(field, value) {
    dataHandlerStore.setData(this.table, this.uid, field.name, value);
  }

  #stageCategory(field, item, checked) {
    const selected = new Set(this.#currentValues(field));
    checked ? selected.add(String(item.value)) : selected.delete(String(item.value));
    const itemValues = field.items.map((entry) => String(entry.value));
    const ordered = itemValues.filter((value) => selected.has(value));
    // Keep assigned categories that a truncated tree does not show: unchecking
    // a visible category must never silently unassign the hidden ones.
    const hidden = [...selected].filter((value) => !itemValues.includes(value));
    dataHandlerStore.setData(this.table, this.uid, field.name, ordered.concat(hidden).join(','));
  }

  render() {
    if (!this.open) {
      return html``;
    }
    const title = translate('frontend.fieldChooser.title', 'Field settings');
    const closeLabel = translate('frontend.fieldChooser.close', 'Close');
    return html`
      <div class="popover" style="${this.popoverStyle}" role="dialog" aria-label="${title}">
        <header class="header">
          <div class="heading">
            ${this.elementName !== '' ? html`<span class="elementName" title="${this.elementName}">${this.elementName}</span>` : ''}
            <h2 class="title">${title}</h2>
          </div>
          <button type="button" class="closeButton" @click="${this.close}" title="${closeLabel}" aria-label="${closeLabel}">&times;</button>
        </header>
        <div class="body">${this.#renderBody()}</div>
        <footer class="footer">${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}</footer>
      </div>
    `;
  }

  #renderBody() {
    if (this.loading) {
      return html`<p class="status">${translate('frontend.fieldChooser.loading', 'Loading…')}</p>`;
    }
    if (this.error) {
      return html`<p class="status isError">${translate('frontend.fieldChooser.error', 'Could not load field options.')}</p>`;
    }
    if (this.fields.length === 0) {
      return html`<p class="status">${translate('frontend.fieldChooser.empty', 'No editable choice fields for this element.')}</p>`;
    }
    return html`${this.fields.map((field) => this.#renderField(field))}`;
  }

  #renderField(field) {
    const dirty = dataHandlerStore.hasChangedData(this.table, this.uid, field.name);
    return html`
      <div class="field">
        <span class="fieldLabel">
          ${field.label}
          ${dirty ? html`<span class="dirtyDot" title="${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}"></span>` : ''}
        </span>
        ${field.type === 'category' ? this.#renderCategory(field) : this.#renderSelect(field)}
      </div>
    `;
  }

  #renderSelect(field) {
    const current = this.#currentValue(field);
    return html`
      <select class="select" aria-label="${field.label}" @change="${(event) => this.#stageSelect(field, event.target.value)}">
        ${field.items.map((item) => html`
          <option value="${item.value}" ?selected="${String(item.value) === current}">${item.label}</option>
        `)}
      </select>
    `;
  }

  #renderCategory(field) {
    const selected = new Set(this.#currentValues(field));
    return html`
      <div class="categoryList" role="group" aria-label="${field.label}">
        ${this.#buildCategoryTree(field.items).map((node) => this.#renderCategoryNode(field, node, selected))}
        ${field.truncated ? html`<span class="truncatedNote">${field.truncatedNote || '…'}</span>` : ''}
      </div>
    `;
  }

  /**
   * Rebuilds the nested tree from the endpoint's depth-first flat item list:
   * an item is a child of the nearest preceding item with a smaller depth.
   * @param {Array<{value: string, label: string, depth?: number}>} items
   * @return {Array<{item: object, children: Array}>}
   */
  #buildCategoryTree(items) {
    const roots = [];
    const stack = [];
    for (const item of items) {
      const node = {item, children: []};
      const depth = item.depth ?? 0;
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      (stack.length === 0 ? roots : stack[stack.length - 1].node.children).push(node);
      stack.push({node, depth});
    }
    return roots;
  }

  #toggleCategoryNode(value) {
    this.collapsedCategories.has(value) ? this.collapsedCategories.delete(value) : this.collapsedCategories.add(value);
    this.requestUpdate();
  }

  #renderCategoryNode(field, node, selected) {
    const value = String(node.item.value);
    const hasChildren = node.children.length > 0;
    const isOpen = hasChildren && !this.collapsedCategories.has(value);
    return html`
      <div class="treeNode">
        <div class="treeRow">
          ${hasChildren ? html`
            <button
              type="button"
              class="treeToggle ${isOpen ? 'isOpen' : ''}"
              aria-expanded="${isOpen}"
              aria-label="${node.item.label}"
              @click="${() => this.#toggleCategoryNode(value)}"
            ><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3l5 5-5 5"/></svg></button>
          ` : html`<span class="treeSpacer"></span>`}
          <label class="categoryItem">
            <input
              type="checkbox"
              class="checkbox"
              .checked="${selected.has(value)}"
              @change="${(event) => this.#stageCategory(field, node.item, event.target.checked)}"
            >
            <span class="categoryLabel" title="${node.item.label}">${node.item.label}</span>
          </label>
        </div>
        ${isOpen ? html`
          <div class="treeChildren">
            ${node.children.map((child) => this.#renderCategoryNode(field, child, selected))}
          </div>
        ` : ''}
      </div>
    `;
  }

  static styles = css`
    :host {
      --ve-chooser-accent: var(--ve-accent-color, #7c5ac4);
      font-family: var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .popover {
      position: fixed;
      z-index: 100002;
      display: flex;
      flex-direction: column;
      width: min(320px, calc(100vw - 24px));
      max-height: 60vh;
      background: #fff;
      color: #1a1a20;
      border: 1px solid color-mix(in srgb, var(--ve-chooser-accent) 32%, #e3e3e8);
      border-radius: var(--typo3-component-border-radius, 0.75em);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28), 0 0 0 1px color-mix(in srgb, var(--ve-chooser-accent) 12%, transparent);
      font-size: 13px;
      line-height: 1.4;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #ececf1;
    }

    .heading {
      flex: 1;
      min-width: 0;
    }

    .elementName {
      display: block;
      overflow: hidden;
      font-size: 11px;
      font-weight: 600;
      color: color-mix(in srgb, var(--ve-chooser-accent) 70%, #55555f);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }

    .closeButton {
      flex: none;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #55555f;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }

    .closeButton:hover {
      background: #f0f0f4;
      color: #1a1a20;
    }

    .closeButton:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--ve-chooser-accent);
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
      padding: 10px 12px;
    }

    .status {
      margin: 0;
      color: #55555f;
    }

    .status.isError {
      color: #b3261e;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .fieldLabel {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #33333c;
    }

    .dirtyDot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ve-chooser-accent);
    }

    .select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: inherit;
      font: inherit;
    }

    .select:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
    }

    .categoryList {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 280px;
      overflow: auto;
      padding: 4px 6px;
      border: 1px solid #ececf1;
      border-radius: 6px;
    }

    .treeRow {
      display: flex;
      align-items: center;
      gap: 1px;
    }

    .treeToggle {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #55555f;
      cursor: pointer;
    }

    .treeToggle svg {
      transition: transform 0.12s ease;
    }

    .treeToggle.isOpen svg {
      transform: rotate(90deg);
    }

    .treeToggle:hover {
      background: #f0f0f4;
      color: #1a1a20;
    }

    .treeToggle:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 1px;
    }

    .treeSpacer {
      flex: none;
      width: 18px;
    }

    .treeChildren {
      margin-left: 8px;
      padding-left: 8px;
      border-left: 1px solid #e3e3e8;
    }

    .categoryItem {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 7px;
      min-width: 0;
      padding: 3px 6px;
      border-radius: 4px;
      cursor: pointer;
    }

    .categoryItem:hover {
      background: color-mix(in srgb, var(--ve-chooser-accent) 8%, #fff);
    }

    .checkbox {
      flex: none;
      margin: 0;
      accent-color: var(--ve-chooser-accent);
    }

    .checkbox:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 1px;
    }

    .categoryLabel {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truncatedNote {
      padding: 0 6px;
      color: #8a8a94;
    }

    .footer {
      padding: 8px 12px;
      border-top: 1px solid #ececf1;
      color: #6d6d78;
      font-size: 11px;
    }
  `;
}

/** @type {VeFieldChooser|null} */
let fieldChooser = null;

/**
 * Lazily creates the singleton popover, appends it to the document body and
 * opens (or toggles) it for the given content element.
 * @param {{table: string, uid: number, cType?: string, elementName?: string, anchorRect: DOMRect}} options
 */
export function openFieldChooser(options) {
  if (fieldChooser === null) {
    fieldChooser = document.createElement('ve-field-chooser');
    document.body.appendChild(fieldChooser);
  }
  fieldChooser.openFor(options);
}

customElements.define('ve-field-chooser', VeFieldChooser);
