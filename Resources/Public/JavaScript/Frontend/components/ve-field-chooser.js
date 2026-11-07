import {html, LitElement, nothing} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {fieldChooserMode} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {clamp, translate, viewportSize, ViewportTracker} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {clearFieldOptionsCache, fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache.js';
import {linkIconSvg, listIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {requestLinkEdit} from '@webconsulting/visual-editor-enhancements/Shared/link-edit-request.js';
import {collectionReason, inlineLabel} from '@webconsulting/visual-editor-enhancements/Shared/inline-record-actions.js';
import {changeCollection, collectionBlockReason} from '@webconsulting/visual-editor-enhancements/Frontend/inline-records.js';
import {refreshElement} from '@webconsulting/visual-editor-enhancements/Frontend/element-refresh.js';
import {renderCollection} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser/collections.js';
import {styles} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser/styles.js';

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
 * per-element action-bar button in Frontend/element-field-actions.js (full view) and
 * from the per-output context buttons (scoped to the hovered field's own
 * attributes via the scopeFields option, with a "show all" escape hatch back
 * to the full view).
 *
 * @extends {HTMLElement}
 */
export class VeFieldChooser extends LitElement {
  static properties = {
    view: {type: String, state: true},
    docked: {type: Boolean, state: true},
    busy: {type: Boolean, state: true},
    message: {type: String, state: true},
    context: {type: Array, state: true},
    open: {type: Boolean, state: true, attribute: false},
    loading: {type: Boolean, state: true, attribute: false},
    error: {type: Boolean, state: true, attribute: false},
    fields: {type: Array, state: true, attribute: false},
    elementName: {type: String, state: true, attribute: false},
    popoverStyle: {type: String, state: true, attribute: false},
    activeTab: {type: Number, state: true, attribute: false},
    bodyMinHeight: {type: Number, state: true, attribute: false},
    scopeFields: {type: Array, state: true, attribute: false},
    scopeLabel: {type: String, state: true, attribute: false},
  };

  constructor() {
    super();
    this.view = 'settings';
    this.docked = false;
    this.anchorRect = null;
    this.trigger = null;
    this.viewportTracker = new ViewportTracker(() => this.#position());
    this.busy = false;
    this.message = '';
    this.context = [];
    this.history = [];
    this.rootRecord = null;
    this.open = false;
    this.loading = false;
    this.error = false;
    this.fields = [];
    this.elementName = '';
    this.popoverStyle = '';
    this.activeTab = 0;
    this.bodyMinHeight = 0;
    this.scopeFields = null;
    this.scopeLabel = '';
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
    // post-merge initialData - scopeFields is deliberately kept, so a scoped
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
        this.close({restoreFocus: true});
      }
    };
    /** @type {HTMLElement|null} the control that had focus when the popover opened */
    this.returnFocus = null;
    this.onDocumentPointerDown = (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (path.includes(this)) {
        return;
      }
      // Chooser buttons toggle/re-anchor via their own click handler; closing
      // here already on pointerdown would make that click re-open the popover.
      if (path.some((node) => node instanceof Element && ['field-chooser', 'inline-records', 'inline-add'].includes(node.dataset?.veEnhancement))) {
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
   * exactly that scope. With scopeFields set only those fields are shown (flat,
   * never tabs) under scopeLabel. Re-anchoring the OPEN popover to another scope
   * of the same element only re-filters the already loaded fields - it never
   * refetches.
   * toggle=false (the action-bar Add entry button) keeps an already open
   * popover open; focus=false leaves the focus where it is (Add entry puts it
   * into the new entry on the page); message is shown in the status line.
   * @param {{table: string, uid: number, elementName?: string, anchorRect: DOMRect, scopeFields?: string[]|null, scopeLabel?: string, toggle?: boolean, focus?: boolean, message?: string}} options
   */
  openFor({table, uid, elementName, anchorRect, scopeFields = null, scopeLabel = '', context = [], rootRecord = null, nested = false, view = 'settings', trigger = null, toggle = true, focus = true, message = ''}) {
    const sameRecord = this.table === table && this.uid === uid && JSON.stringify(this.context) === JSON.stringify(context);
    if (toggle && !nested && this.open && sameRecord && this.view === view && scopeKeyOf(this.scopeFields) === scopeKeyOf(scopeFields)) {
      this.close({restoreFocus: true});
      return;
    }
    if (!nested) {
      this.returnFocus = trigger ?? deepActiveElement();
      this.trigger?.setAttribute('aria-expanded', 'false');
      this.trigger = trigger;
      this.trigger?.setAttribute('aria-expanded', 'true');
      this.anchorRect = anchorRect;
      this.docked = view === 'entries';
      this.message = message;
    }
    this.view = view;
    // Re-filtering an already loaded element must not refetch - but after a
    // failed load there is nothing to keep, so an error state always retries
    // (the shared cache evicted the failed promise).
    const reload = !(this.open && sameRecord) || this.error;
    if (!nested) { this.history = []; }
    this.context = context;
    this.rootRecord = rootRecord ?? {table, uid};
    this.table = table;
    this.uid = uid;
    this.elementName = elementName ?? '';
    this.scopeFields = scopeFields;
    this.scopeLabel = scopeLabel;
    this.open = true;
    if (!sameRecord) { this.activeTab = 0; }
    this.bodyMinHeight = 0;
    this.#position();
    this.#startListening();
    if (reload) {
      this.#load();
    }
    // Move focus into the (non-modal) dialog so keyboard and screen-reader
    // users land in it; Escape and the close button hand it back.
    if (focus) {
      this.updateComplete.then(() => this.renderRoot.querySelector('.popover')?.focus({preventScroll: true}));
    }
  }

  /**
   * @param {{restoreFocus?: boolean}} options restoreFocus returns focus to the
   *   control that opened the popover (Escape, close button, toggling the
   *   trigger) - not after a click elsewhere, which already moved it.
   */
  close({restoreFocus = false} = {}) {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.loadSeq++;
    this.#stopListening();
    if (restoreFocus && this.returnFocus?.isConnected) {
      this.returnFocus.focus({preventScroll: true});
    }
    this.returnFocus = null;
  }

  #startListening() {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.viewportTracker.start();
    dataHandlerStore.addEventListener('change', this.onStoreChange);
    try {
      const save = window.parent.document.querySelector('ve-backend-save-button');
      if (save) {
        this.saveObserver = new MutationObserver(() => this.requestUpdate());
        this.saveObserver.observe(save, {attributes: true});
      }
    } catch { /* unknown cross-origin state stays blocked */ }
    document.addEventListener('keydown', this.onDocumentKeydown);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  #stopListening() {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    this.viewportTracker.stop();
    dataHandlerStore.removeEventListener('change', this.onStoreChange);
    this.saveObserver?.disconnect();
    document.removeEventListener('keydown', this.onDocumentKeydown);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  /**
   * Anchors the fixed popover to the action-bar button: preferred below the
   * button, left-aligned and clamped to the viewport; when the space below is
   * short it flips above (bottom-anchored, so it grows upwards).
   */
  #position() {
    if (this.docked) {
      this.popoverStyle = '';
      return;
    }
    const edge = 12;
    const gap = 8;
    const {width: viewportWidth, height: viewportHeight} = viewportSize(480);
    const width = Math.min(480, viewportWidth - edge * 2);
    const rect = this.trigger?.isConnected ? this.trigger.getBoundingClientRect() : this.anchorRect;
    const left = clamp(Math.round(rect?.left ?? edge), edge, viewportWidth - width - edge);
    const top = clamp(rect?.top ?? edge, edge, viewportHeight - edge);
    const bottom = clamp(rect?.bottom ?? edge, edge, viewportHeight - edge);
    const spaceBelow = viewportHeight - bottom - gap - edge;
    const spaceAbove = top - gap - edge;
    const below = spaceBelow >= Math.min(360, viewportHeight * 0.65) || spaceBelow >= spaceAbove;
    const height = Math.floor(Math.min(viewportHeight - edge * 2, Math.max(0, below ? spaceBelow : spaceAbove)));
    this.popoverStyle = `${below ? `top:${Math.round(bottom + gap)}` : `bottom:${Math.round(viewportHeight - top + gap)}`}px;left:${left}px;max-height:${height}px;`;
  }

  /**
   * Size stability for the tab bar: ratchets the body's min-height up to the
   * tallest tab panel shown so far, so switching to a shorter tab never makes
   * the popover jump smaller. Measured only when the active tab or the field
   * list changed - never on the render the ratchet itself causes - and capped
   * so min-height can never push the popover past its positioned max-height
   * (the max-height clamp plus the body's overflow:auto always win). Scoped
   * mode never renders the tab bar, so the ratchet never runs there; leaving
   * scoped mode via "show all" is a scopeFields change and re-measures.
   */
  updated(changedProperties) {
    if (!this.open || !(changedProperties.has('activeTab') || changedProperties.has('fields') || changedProperties.has('scopeFields'))) {
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
    const selectedTabId = this.#tabs()[this.activeTab]?.id;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = false;
    this.fields = [];
    this.collapsedCategories = new Set();
    this.bodyMinHeight = 0;
    try {
      const data = await fetchFieldOptions(this.table, this.uid, this.context);
      if (seq !== this.loadSeq) {
        return; // superseded: another element was opened or the popover closed
      }
      this.fields = data.fields || [];
      const restoredTab = this.#tabs().findIndex((tab) => tab.id === selectedTabId);
      if (restoredTab >= 0) { this.activeTab = restoredTab; }
      this.fields.filter((field) => field.type === 'inline').forEach((field) => { field.children?.forEach((child) => { child.label ||= 'Entry'; }); });
      // Baseline for the pending-change diff: reverting a field to this value
      // clears its staged change again (see data-handler-store setInitialData).
      for (const field of this.fields.filter((field) => field.type !== 'inline')) {
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
    // Scoped mode (per-output context button): only the anchor field's own
    // attributes, flat and titled with the field's form section - never the tab
    // bar, even in tabs mode. The footer's "show all" button leads to the full
    // view.
    const entries = this.view === 'entries';
    const scoped = this.scopeFields !== null;
    const title = entries ? inlineLabel('entries') : scoped
      ? (this.scopeLabel || translate('frontend.fieldChooser.title', 'Field settings'))
      : translate('frontend.fieldChooser.title', 'Field settings');
    const closeLabel = translate('frontend.fieldChooser.close', 'Close');
    // Tabs mode replicates the backend form's tab bar; with a single (or no)
    // tab it falls back to the plain sectioned list, exactly like 'sections'
    // mode. While loading there are no fields, hence no tabs, hence no bar.
    const tabs = !entries && !scoped && fieldChooserMode() === 'tabs' ? this.#tabs() : [];
    const useTabs = tabs.length > 1;
    const activeTab = useTabs ? Math.min(this.activeTab, tabs.length - 1) : 0;
    return html`
      <div class="popover ${this.docked ? 'isDrawer' : ''}" style="${this.popoverStyle}" role="dialog" aria-label="${title}" tabindex="-1">
        <header class="header">
          ${this.history.length ? html`<button type="button" class="closeButton" aria-label=${inlineLabel('back')} title=${inlineLabel('back')} @click=${() => this.#back()}>←</button>` : ''}
          <div class="heading">
            ${this.elementName !== '' ? html`<span class="elementName" title="${this.elementName}">${this.elementName}</span>` : ''}
            <h2 class="title">${title}</h2>
          </div>
          <button type="button" class="closeButton" @click="${() => this.close({restoreFocus: true})}" title="${closeLabel}" aria-label="${closeLabel}">&times;</button>
        </header>
        ${this.message ? html`<p class="notice" role="status">${this.message}</p>` : ''}
        ${useTabs ? this.#renderTabBar(tabs, activeTab) : ''}
        <div
          class="body"
          id="ve-tabpanel"
          role="${useTabs ? 'tabpanel' : nothing}"
          aria-labelledby="${useTabs ? `ve-tab-${activeTab}` : nothing}"
          style="${this.bodyMinHeight > 0 ? `min-height:${this.bodyMinHeight}px;` : nothing}"
        >${useTabs ? this.#renderTabFields(tabs[activeTab]) : this.#renderBody()}</div>
        <footer class="footer">
          <span class="footerHint">${entries ? inlineLabel('structureHint') : translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}</span>
          ${scoped && !entries && fieldChooserMode() !== 'disabled' ? html`
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
    this.scopeFields = null;
    this.scopeLabel = '';
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
      const tabKey = field.tabId ?? label;
      let tab = byLabel.get(tabKey);
      if (tab === undefined) {
        tab = {id: tabKey, label, fields: []};
        byLabel.set(tabKey, tab);
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
      return html`<p class="status" role="status">${translate('frontend.fieldChooser.loading', 'Loading…')}</p>`;
    }
    if (this.error) {
      return html`<p class="status isError" role="alert">${translate('frontend.fieldChooser.error', 'Could not load field options.')}</p>`;
    }
    // Scoped mode: only the anchor field's own attributes, flat - the popover
    // title already names the field's section, so headings would only repeat it.
    const fields = this.view === 'entries'
      ? this.fields.filter((field) => field.type === 'inline' && (!this.scopeFields || this.scopeFields.includes(field.name)))
      : this.scopeFields ? this.fields.filter((field) => this.scopeFields.includes(field.name)) : this.fields;
    if (fields.length === 0) {
      return html`<p class="status">${translate('frontend.fieldChooser.empty', 'No editable choice fields for this element.')}</p>`;
    }
    if (this.scopeFields || this.view === 'entries') {
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
    if (field.type === 'inline') {
      if (this.view === 'entries' || this.scopeFields) { return this.#renderCollection(field); }
      return html`<button type="button" class="collectionShortcut" @click=${() => this.#openCollection(field)}>
        ${unsafeHTML(listIconSvg(16))}<span>${field.label}</span>
        ${field.uids ? html`<span class="count">${field.uids.length}</span>` : ''}<span aria-hidden="true">→</span>
      </button>`;
    }
    const dirty = dataHandlerStore.hasChangedData(this.table, this.uid, field.name);
    return html`
      <div class="field">
        <span class="fieldLabel">
          ${field.label}
          ${dirty ? html`<span class="dirtyDot" title="${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}"></span><span class="visually-hidden">${translate('frontend.fieldChooser.pendingHint', 'Applied with the next save.')}</span>` : ''}
        </span>
        ${this.#renderControl(field)}
      </div>
    `;
  }

  #renderControl(field) {
    switch (field.type) {
      case 'inline':
        return this.#renderCollection(field);
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

  async refresh() {
    clearFieldOptionsCache();
    await this.#load();
  }

  #childSettings(field, child) {
    this.history.push({table: this.table, uid: this.uid, elementName: this.elementName,
      context: this.context, rootRecord: this.rootRecord, scopeFields: this.scopeFields, scopeLabel: this.scopeLabel, view: this.view});
    this.openFor({table: child.table, uid: child.uid, elementName: child.label,
      anchorRect: this.anchorRect, rootRecord: this.rootRecord, nested: true,
      context: [...this.context, {table: this.table, uid: this.uid, field: field.name}]});
  }

  #back() {
    const previous = this.history.pop();
    if (previous) { this.openFor({...previous, anchorRect: this.anchorRect, nested: true}); }
  }

  async #collectionAction(field, action, child = null) {
    if (this.busy) { return; }
    const actionTrigger = deepActiveElement();
    let completed = false;
    let createdUid = null;
    this.busy = true;
    this.message = '';
    try {
      const result = await changeCollection(field, action, child);
      if (!result) { return; }
      completed = true;
      this.message = field.workspaceId ? inlineLabel('savedWorkspace')
        : field.createHidden && action === 'create' ? inlineLabel('savedHidden')
          : inlineLabel('savedLive');
      // Recheck after the POST and inside refreshElement after fetching: typing
      // while a request runs must never be discarded by a wrapper replacement.
      if (!collectionBlockReason()) {
        const refreshed = await refreshElement(this.rootRecord.table, this.rootRecord.uid);
        if (!refreshed) { this.message += ` ${inlineLabel('refreshPending')}`; }
      }
      await this.refresh();
      if (action === 'create' && result.uid) { createdUid = Number(result.uid); }
    } catch (error) {
      this.message = error.definitive ? error.message : `${error.message} ${inlineLabel('refreshRequired')}`;
      if (error.definitive) { await this.refresh(); }
    } finally {
      this.busy = false;
      await this.updateComplete;
      if (createdUid !== null) {
        const button = this.renderRoot.querySelector(`[data-child-edit="${createdUid}"]`);
        button?.focus({preventScroll: true});
        button?.scrollIntoView({block: 'nearest'});
      }
      if (!completed && actionTrigger?.isConnected) { actionTrigger.focus({preventScroll: true}); }
    }
  }

  #openCollection(field) {
    this.history.push({table: this.table, uid: this.uid, elementName: this.elementName,
      context: this.context, rootRecord: this.rootRecord, scopeFields: this.scopeFields, scopeLabel: this.scopeLabel, view: this.view});
    // Keep the position when entering from settings; the toolbar Entries
    // action opens the right-hand inspector directly.
    this.openFor({table: this.table, uid: this.uid, elementName: this.elementName,
      context: this.context, rootRecord: this.rootRecord, nested: true, view: 'entries', scopeFields: [field.name]});
  }

  #renderCollection(field) {
    return renderCollection(field, {
      blocked: this.busy ? inlineLabel('busy') : collectionBlockReason(),
      settings: (child) => this.#childSettings(field, child),
      action: (action, child = null) => this.#collectionAction(field, action, child),
    });
  }

  #renderSelect(field) {
    const current = this.#currentValue(field);
    return html`
      <select class="select" aria-label="${field.label}" @change="${(event) => this.#stageValue(field, event.target.value)}">
        ${!field.items.some((item) => String(item.value) === current)
          ? html`<option value=${current} selected disabled>${inlineLabel('unavailable').replace('{value}', current)}</option>` : ''}
        ${field.items.map((item) => html`
          <option value="${item.value}" ?disabled=${field.unavailableValue === String(item.value)} ?selected="${String(item.value) === current}">${field.unavailableValue === String(item.value) ? inlineLabel('unavailable').replace('{value}', item.value) : item.label}</option>
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
          ${unsafeHTML(linkIconSvg(14))}
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
   * Items with selectable === false (the tree configuration's
   * nonSelectableLevels) are structure only and get no checkbox.
   * @param {Array<{value: string, label: string, depth?: number, selectable?: boolean}>} items
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
          ${node.item.selectable === false ? html`
            <span class="categoryItem isStructure">
              <span class="categoryLabel" title="${node.item.label}">${node.item.label}</span>
            </span>
          ` : html`
            <label class="categoryItem">
              <input
                type="checkbox"
                class="checkbox"
                .checked="${selected.has(value)}"
                @change="${(event) => this.#stageCategory(field, node.item, event.target.checked)}"
              >
              <span class="categoryLabel" title="${node.item.label}">${node.item.label}</span>
            </label>
          `}
        </div>
        ${isOpen ? html`
          <div class="treeChildren">
            ${node.children.map((child) => this.#renderCategoryNode(field, child, selected))}
          </div>
        ` : ''}
      </div>
    `;
  }

  static styles = styles;
}

/** @type {VeFieldChooser|null} */
let fieldChooser = null;

/**
 * The focused element, following open shadow roots down: the trigger buttons
 * live inside the Visual Editor's and this extension's shadow DOM.
 * @return {HTMLElement|null}
 */
function deepActiveElement() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Stable identity of a scope for toggle comparison: null (full view) stays
 * null; a field list is order-independent.
 * @param {string[]|null} scopeFields
 * @return {string|null}
 */
function scopeKeyOf(scopeFields) {
  return scopeFields === null ? null : [...scopeFields].sort().join(',');
}

/**
 * Lazily creates the singleton popover, appends it to the document body and
 * opens (or toggles) it for the given content element. With scopeFields set
 * only those fields are shown under scopeLabel (see openFor()).
 * @param {{table: string, uid: number, elementName?: string, anchorRect: DOMRect, scopeFields?: string[]|null, scopeLabel?: string}} options
 */
export function openFieldChooser(options) {
  if (fieldChooser === null) {
    fieldChooser = document.createElement('ve-field-chooser');
    document.body.appendChild(fieldChooser);
  }
  fieldChooser.openFor(options);
}

customElements.define('ve-field-chooser', VeFieldChooser);
