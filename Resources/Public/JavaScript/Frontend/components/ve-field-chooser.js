import {css, html, LitElement, nothing} from 'lit';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {fieldChooserMode} from '@webconsulting/visual-editor-enhancements/Shared/config';
import {clearFieldOptionsCache, fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache';
import {requestLinkEdit} from '@webconsulting/visual-editor-enhancements/Shared/link-edit-request';

const translate = (key, fallback) => window.TYPO3?.lang?.[key] || fallback;

/**
 * Singleton popover listing the editable "settings" fields of one content
 * record - static single-value selects, category trees, links, checkboxes and
 * colors - as reported by the ?veFieldOptions=1 endpoint (loaded through the
 * shared field-options cache). Depending on the per-user field chooser mode
 * the fields render as one sectioned list or grouped into the backend form's
 * tabs. Every change is staged on the shared dataHandlerStore and written to
 * the database only with the next explicit save, exactly like an inline text
 * edit; reverting a field to the value it had when the options loaded clears
 * the pending change again. Opened via openFieldChooser() from the
 * per-element action-bar button injected in Frontend/index.js (full view) and
 * from the per-output context buttons (scoped to one form group via the
 * scopeGroup option, with a "show all" escape hatch back to the full view).
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
    activeTab: {type: Number, state: true, attribute: false},
    bodyMinHeight: {type: Number, state: true, attribute: false},
    scopeGroup: {type: String, state: true, attribute: false},
  };

  constructor() {
    super();
    this.open = false;
    this.loading = false;
    this.error = false;
    this.fields = [];
    this.elementName = '';
    this.popoverStyle = '';
    this.activeTab = 0;
    this.bodyMinHeight = 0;
    this.scopeGroup = null;
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
    // derived from staged values) stay in sync with reverts and saves. A save
    // while the popover is OPEN additionally reloads the fields: the shared
    // options cache is dropped (its payload predates the save) and #load
    // re-seeds setInitialData from the fresh payload, matching the store's
    // post-merge initialData - scopeGroup is deliberately kept, so a scoped
    // popover stays scoped.
    this.onStoreChange = (event) => {
      if (event.detail?.kind === 'saved' && this.open) {
        clearFieldOptionsCache();
        this.#load();
        return;
      }
      this.requestUpdate();
    };
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
   * toggles it closed when it is already showing exactly that element with
   * exactly that scope. With scopeGroup set only the fields of that backend
   * form group are shown (flat, never tabs). Re-anchoring the OPEN popover to
   * another scope of the same element only re-filters the already loaded
   * fields - it never refetches.
   * @param {{table: string, uid: number, cType?: string, elementName?: string, anchorRect: DOMRect, scopeGroup?: string|null}} options
   */
  openFor({table, uid, elementName, anchorRect, scopeGroup = null}) {
    const sameRecord = this.table === table && this.uid === uid;
    if (this.open && sameRecord && this.scopeGroup === scopeGroup) {
      this.close();
      return;
    }
    // Re-filtering an already loaded element must not refetch - but after a
    // failed load there is nothing to keep, so an error state always retries
    // (the shared cache evicted the failed promise).
    const reload = !(this.open && sameRecord) || this.error;
    this.table = table;
    this.uid = uid;
    this.elementName = elementName ?? '';
    this.scopeGroup = scopeGroup;
    this.open = true;
    this.activeTab = 0;
    this.bodyMinHeight = 0;
    this.#position(anchorRect);
    this.#startListening();
    if (reload) {
      this.#load();
    }
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
    const width = 480;
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

  /**
   * Size stability for the tab bar: ratchets the body's min-height up to the
   * tallest tab panel shown so far, so switching to a shorter tab never makes
   * the popover jump smaller. Measured only when the active tab or the field
   * list changed - never on the render the ratchet itself causes - and capped
   * so min-height can never push the popover past its positioned max-height
   * (the max-height clamp plus the body's overflow:auto always win). Scoped
   * mode never renders the tab bar, so the ratchet never runs there; leaving
   * scoped mode via "show all" is a scopeGroup change and re-measures.
   */
  updated(changedProperties) {
    if (!this.open || !(changedProperties.has('activeTab') || changedProperties.has('fields') || changedProperties.has('scopeGroup'))) {
      return;
    }
    if (fieldChooserMode() !== 'tabs' || this.renderRoot.querySelector('.tabBar') === null) {
      return;
    }
    const popover = this.renderRoot.querySelector('.popover');
    const body = this.renderRoot.querySelector('.body');
    if (popover === null || body === null) {
      return;
    }
    let minHeight = Math.max(this.bodyMinHeight, body.offsetHeight);
    const maxHeight = /max-height:(\d+)px/.exec(this.popoverStyle);
    if (maxHeight !== null) {
      const chromeHeight = popover.offsetHeight - body.offsetHeight;
      minHeight = Math.min(minHeight, Math.max(0, Number(maxHeight[1]) - chromeHeight));
    }
    if (minHeight > this.bodyMinHeight) {
      this.bodyMinHeight = minHeight;
    }
  }

  async #load() {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = false;
    this.fields = [];
    this.collapsedCategories = new Set();
    this.activeTab = 0;
    this.bodyMinHeight = 0;
    try {
      const data = await fetchFieldOptions(this.table, this.uid);
      if (seq !== this.loadSeq) {
        return; // superseded: another element was opened or the popover closed
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

  /**
   * Stages one plain string value - selects, checkboxes ('1'/'0'), colors
   * (hex or '' for none) and links (the typolink string) all stage strings.
   */
  #stageValue(field, value) {
    dataHandlerStore.setData(this.table, this.uid, field.name, value);
  }

  /**
   * TCA invertStateDisplay flips only how the stored bit is SHOWN, never what
   * is staged: the staged value is always the '1'/'0' database value.
   */
  #stageCheck(field, checked) {
    const invert = !!field.invertStateDisplay;
    const raw = invert ? (checked ? '0' : '1') : (checked ? '1' : '0');
    this.#stageValue(field, raw);
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
    // Scoped mode (per-output context button): only the anchor field's form
    // group, flat and titled with the group's label - never the tab bar, even
    // in tabs mode. The footer's "show all" button leads to the full view.
    const scoped = !!this.scopeGroup;
    const title = scoped ? this.scopeGroup : translate('frontend.fieldChooser.title', 'Field settings');
    const closeLabel = translate('frontend.fieldChooser.close', 'Close');
    // Tabs mode replicates the backend form's tab bar; with a single (or no)
    // tab it falls back to the plain sectioned list, exactly like 'sections'
    // mode. While loading there are no fields, hence no tabs, hence no bar.
    const tabs = !scoped && fieldChooserMode() === 'tabs' ? this.#tabs() : [];
    const useTabs = tabs.length > 1;
    const activeTab = useTabs ? Math.min(this.activeTab, tabs.length - 1) : 0;
    return html`
      <div class="popover" style="${this.popoverStyle}" role="dialog" aria-label="${title}">
        <header class="header">
          <div class="heading">
            ${this.elementName !== '' ? html`<span class="elementName" title="${this.elementName}">${this.elementName}</span>` : ''}
            <h2 class="title">${title}</h2>
          </div>
          <button type="button" class="closeButton" @click="${this.close}" title="${closeLabel}" aria-label="${closeLabel}">&times;</button>
        </header>
        ${useTabs ? this.#renderTabBar(tabs, activeTab) : ''}
        <div
          class="body"
          id="ve-tabpanel"
          role="${useTabs ? 'tabpanel' : nothing}"
          aria-labelledby="${useTabs ? `ve-tab-${activeTab}` : nothing}"
          style="${this.bodyMinHeight > 0 ? `min-height:${this.bodyMinHeight}px;` : nothing}"
        >${useTabs ? this.#renderTabFields(tabs[activeTab]) : this.#renderBody()}</div>
        <footer class="footer">
          <span class="footerHint">${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}</span>
          ${scoped ? html`
            <button type="button" class="showAllButton" @click="${() => this.#showAll()}">
              ${translate('frontend.fieldChooser.showAll', 'Show all field settings')}
            </button>
          ` : ''}
        </footer>
      </div>
    `;
  }

  /**
   * "Show all" in the scoped footer: re-opens the SAME element un-scoped at
   * the same anchor position, without refetching - the full view then renders
   * exactly as an action-bar open would (tabs when configured).
   */
  #showAll() {
    this.scopeGroup = null;
    this.activeTab = 0;
    this.bodyMinHeight = 0;
  }

  /**
   * Groups the endpoint's ordered field list into the backend form's tabs.
   * Fields without a tab (not part of the record's showitem) are appended to
   * the first tab - or form one single unlabeled tab when no field has one,
   * which render() then treats like the plain sections body.
   * @return {Array<{label: string, fields: Array<object>}>}
   */
  #tabs() {
    const tabs = [];
    const byLabel = new Map();
    const untabbed = [];
    for (const field of this.fields) {
      const label = field.tab || '';
      if (label === '') {
        untabbed.push(field);
        continue;
      }
      let tab = byLabel.get(label);
      if (tab === undefined) {
        tab = {label, fields: []};
        byLabel.set(label, tab);
        tabs.push(tab);
      }
      tab.fields.push(field);
    }
    if (untabbed.length > 0) {
      if (tabs.length === 0) {
        tabs.push({label: '', fields: untabbed});
      } else {
        tabs[0].fields.push(...untabbed);
      }
    }
    return tabs;
  }

  #renderTabBar(tabs, activeTab) {
    const pendingHint = translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.');
    return html`
      <div
        class="tabBar"
        role="tablist"
        aria-label="${translate('frontend.fieldChooser.tabs', 'Form sections')}"
        @keydown="${(event) => this.#handleTabBarKeydown(event, tabs.length, activeTab)}"
      >
        ${tabs.map((tab, index) => html`
          <button
            type="button"
            role="tab"
            id="ve-tab-${index}"
            class="tab ${index === activeTab ? 'isActive' : ''}"
            aria-selected="${index === activeTab}"
            aria-controls="ve-tabpanel"
            tabindex="${index === activeTab ? 0 : -1}"
            @click="${() => { this.activeTab = index; }}"
          >
            ${tab.label}
            ${tab.fields.some((field) => dataHandlerStore.hasChangedData(this.table, this.uid, field.name))
              ? html`<span class="tabDirtyDot" title="${pendingHint}"></span>`
              : ''}
          </button>
        `)}
      </div>
    `;
  }

  /**
   * Roving tabindex: only the active tab is tabbable; arrow keys move both the
   * selection and the focus along the tab list (selection follows focus).
   */
  #handleTabBarKeydown(event, count, activeTab) {
    let next;
    switch (event.key) {
      case 'ArrowRight':
        next = (activeTab + 1) % count;
        break;
      case 'ArrowLeft':
        next = (activeTab - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.activeTab = next;
    this.updateComplete.then(() => this.renderRoot.querySelector(`#ve-tab-${next}`)?.focus());
  }

  /**
   * One tab panel: same palette headings as the sections body, except that a
   * group repeating the tab's own name is skipped - the active tab already
   * says it.
   */
  #renderTabFields(tab) {
    const rendered = [];
    let lastGroup = null;
    for (const field of tab.fields) {
      const group = field.group || '';
      if (group !== '' && group !== lastGroup && group !== tab.label) {
        rendered.push(html`<h3 class="groupLabel">${group}</h3>`);
      }
      lastGroup = group;
      rendered.push(this.#renderField(field));
    }
    return html`${rendered}`;
  }

  #renderBody() {
    if (this.loading) {
      return html`<p class="status">${translate('frontend.fieldChooser.loading', 'Loading…')}</p>`;
    }
    if (this.error) {
      return html`<p class="status isError">${translate('frontend.fieldChooser.error', 'Could not load field options.')}</p>`;
    }
    // Scoped mode: only the anchor group's fields, flat - the popover title
    // already names the group, so headings would only repeat it.
    const fields = this.scopeGroup
      ? this.fields.filter((field) => field.group === this.scopeGroup)
      : this.fields;
    if (fields.length === 0) {
      return html`<p class="status">${translate('frontend.fieldChooser.empty', 'No editable choice fields for this element.')}</p>`;
    }
    if (this.scopeGroup) {
      return html`${fields.map((field) => this.#renderField(field))}`;
    }
    // Same headings as the backend edit form: a heading is emitted whenever
    // the group (tab/palette label resolved server-side) changes.
    const rendered = [];
    let lastGroup = null;
    for (const field of fields) {
      const group = field.group || '';
      if (group !== '' && group !== lastGroup) {
        rendered.push(html`<h3 class="groupLabel">${group}</h3>`);
      }
      lastGroup = group;
      rendered.push(this.#renderField(field));
    }
    return html`${rendered}`;
  }

  #renderField(field) {
    const dirty = dataHandlerStore.hasChangedData(this.table, this.uid, field.name);
    return html`
      <div class="field">
        <span class="fieldLabel">
          ${field.label}
          ${dirty ? html`<span class="dirtyDot" title="${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}"></span>` : ''}
        </span>
        ${this.#renderControl(field)}
      </div>
    `;
  }

  #renderControl(field) {
    switch (field.type) {
      case 'category':
        return this.#renderCategory(field);
      case 'link':
        return this.#renderLink(field);
      case 'check':
        return this.#renderCheck(field);
      case 'color':
        return this.#renderColor(field);
      default:
        return this.#renderSelect(field);
    }
  }

  #renderSelect(field) {
    const current = this.#currentValue(field);
    return html`
      <select class="select" aria-label="${field.label}" @change="${(event) => this.#stageValue(field, event.target.value)}">
        ${field.items.map((item) => html`
          <option value="${item.value}" ?selected="${String(item.value) === current}">${item.label}</option>
        `)}
      </select>
    `;
  }

  /**
   * Link fields: the truncated typolink value next to an "edit" icon button
   * opening the backend link browser through the shared link-edit bridge. The
   * modal lives in the PARENT (backend) frame, so no pointerdown ever reaches
   * this document and the popover stays open; once a link is picked, the
   * staged value and the dirty dot appear via the store-change re-render.
   */
  #renderLink(field) {
    const current = this.#currentValue(field);
    const editLabel = translate('frontend.editLink', 'Edit link');
    return html`
      <div class="linkRow">
        ${current === ''
          ? html`<span class="linkValue isEmpty">${translate('frontend.fieldChooser.linkEmpty', 'No link set')}</span>`
          : html`<span class="linkValue" title="${current}">${current}</span>`}
        <button
          type="button"
          class="iconButton"
          title="${editLabel}"
          aria-label="${editLabel}"
          @click="${() => this.#editLink(field)}"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="m13.7 3.8-1.4-1.4c-.8-.8-2-.8-2.8 0L5.9 5.9c-.8.8-.8 2 0 2.8l1.2 1.2.9-.8L6.9 8c-.4-.4-.4-1 0-1.4l3.2-3.2c.4-.4 1-.4 1.4 0l1.1 1.1c.4.4.4 1 0 1.4l-1.3 1.3c.2.4.4.9.4 1.4l2-2c.7-.8.7-2.1 0-2.8z"/>
            <path fill="currentColor" d="m8.9 6.1-.9.8L9.1 8c.4.4.4 1 0 1.4l-3.2 3.2c-.4.4-1 .4-1.4 0l-1.1-1.1c-.4-.4-.4-1 0-1.4l1.3-1.3c-.2-.4-.4-.9-.4-1.4l-2 2c-.8.8-.8 2 0 2.8l1.4 1.4c.8.8 2 .8 2.8 0l3.5-3.5c.8-.8.8-2 0-2.8L8.9 6.1z"/>
          </svg>
        </button>
      </div>
    `;
  }

  #editLink(field) {
    const current = this.#currentValue(field);
    const src = field.linkBrowserUrl + '&P%5BcurrentValue%5D=' + encodeURIComponent(current);
    requestLinkEdit({src, title: translate('frontend.editLink', 'Edit link')}, (value) => {
      if (value != null) {
        this.#stageValue(field, value);
      }
    });
  }

  #renderCheck(field) {
    const invert = !!field.invertStateDisplay;
    const current = this.#currentValue(field);
    return html`
      <label class="checkRow">
        <input
          type="checkbox"
          class="checkbox"
          aria-label="${field.label}"
          .checked="${invert ? current !== '1' : current === '1'}"
          @change="${(event) => this.#stageCheck(field, event.target.checked)}"
        >
      </label>
    `;
  }

  /**
   * Color fields: a native color input doubles as the swatch. Values are
   * staged on 'change' only (not while dragging inside the picker); the clear
   * button stages '' ("no color"). A stored value that is not a 6-digit hex
   * (CSS keyword, rgba, ...) keeps showing as raw text while the picker itself
   * is primed with black.
   */
  #renderColor(field) {
    const current = this.#currentValue(field);
    if (current === '') {
      return html`
        <div class="colorRow">
          <span class="colorSwatch" aria-hidden="true"></span>
          <span class="colorNone">${translate('frontend.fieldChooser.colorNone', 'No color set')}</span>
          <input
            type="color"
            class="colorInput isHidden"
            tabindex="-1"
            aria-hidden="true"
            .value="${'#000000'}"
            @change="${(event) => this.#stageValue(field, event.target.value)}"
          >
          <button
            type="button"
            class="colorChoose"
            @click="${(event) => event.target.closest('.colorRow')?.querySelector('.colorInput')?.click()}"
          >${translate('frontend.fieldChooser.colorChoose', 'Choose color')}</button>
        </div>
      `;
    }
    const clearLabel = translate('frontend.fieldChooser.colorClear', 'Remove color');
    return html`
      <div class="colorRow">
        <input
          type="color"
          class="colorInput"
          aria-label="${field.label}"
          .value="${/^#[0-9a-f]{6}$/i.test(current) ? current : '#000000'}"
          @change="${(event) => this.#stageValue(field, event.target.value)}"
        >
        <code class="colorValue" title="${current}">${current}</code>
        <button
          type="button"
          class="iconButton"
          title="${clearLabel}"
          aria-label="${clearLabel}"
          @click="${() => this.#stageValue(field, '')}"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </div>
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
      width: min(480px, calc(100vw - 24px));
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

    .tabBar {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 2px;
      padding: 0 10px;
      border-bottom: 1px solid #ececf1;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 8px 10px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: #55555f;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }

    .tab.isActive {
      color: var(--ve-chooser-accent);
      border-bottom-color: var(--ve-chooser-accent);
    }

    .tab:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: -2px;
    }

    .tabDirtyDot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ve-chooser-accent);
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

    .groupLabel {
      margin: 6px 0 -6px;
      padding-top: 8px;
      border-top: 1px solid #ececf1;
      color: #8a8a94;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .groupLabel:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
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

    .linkRow,
    .colorRow {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .linkValue {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      padding: 6px 8px;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fafafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .linkValue.isEmpty {
      background: #fff;
      color: #8a8a94;
      font-family: inherit;
    }

    .iconButton {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: #55555f;
      cursor: pointer;
    }

    .iconButton:hover {
      border-color: var(--ve-chooser-accent);
      background: color-mix(in srgb, var(--ve-chooser-accent) 8%, #fff);
      color: var(--ve-chooser-accent);
    }

    .iconButton:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
    }

    .checkRow {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      padding: 4px 0;
      cursor: pointer;
    }

    .colorInput {
      flex: none;
      width: 34px;
      height: 28px;
      padding: 2px;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }

    .colorInput:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
    }

    /* Kept in the DOM (not display:none) so .click() reliably opens the
       native picker, anchored near the row; invisible and skipped by focus
       order and screen readers. */
    .colorInput.isHidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      padding: 0;
      border: 0;
      clip-path: inset(50%);
      opacity: 0;
      pointer-events: none;
    }

    .colorSwatch {
      flex: none;
      width: 34px;
      height: 28px;
      border: 1px dashed #b9b9c4;
      border-radius: 6px;
      background: #fff;
    }

    .colorNone {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: #8a8a94;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .colorValue {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .colorChoose {
      flex: none;
      padding: 5px 10px;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: #33333c;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .colorChoose:hover {
      border-color: var(--ve-chooser-accent);
      color: var(--ve-chooser-accent);
    }

    .colorChoose:focus-visible {
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 12px;
      border-top: 1px solid #ececf1;
      color: #6d6d78;
      font-size: 11px;
    }

    .footerHint {
      min-width: 0;
    }

    .showAllButton {
      flex: none;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: none;
      color: var(--ve-chooser-accent);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .showAllButton:hover {
      text-decoration: underline;
    }

    .showAllButton:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 2px;
    }
  `;
}

/** @type {VeFieldChooser|null} */
let fieldChooser = null;

/**
 * Lazily creates the singleton popover, appends it to the document body and
 * opens (or toggles) it for the given content element. With scopeGroup set
 * only the fields of that backend form group are shown (see openFor()).
 * @param {{table: string, uid: number, cType?: string, elementName?: string, anchorRect: DOMRect, scopeGroup?: string|null}} options
 */
export function openFieldChooser(options) {
  if (fieldChooser === null) {
    fieldChooser = document.createElement('ve-field-chooser');
    document.body.appendChild(fieldChooser);
  }
  fieldChooser.openFor(options);
}

customElements.define('ve-field-chooser', VeFieldChooser);
