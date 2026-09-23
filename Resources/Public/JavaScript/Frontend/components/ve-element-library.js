import {html, LitElement} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import {lll} from '@typo3/core/lit-helper.js';
import {dragInProgressStore} from '@typo3/visual-editor/Frontend/stores/drag-store';
import {initVelocityScroll} from '@typo3/visual-editor/Frontend/components/ve-drag-handle/velocity-scroll';
import {elementLibraryColumns} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {elementLibraryCategories, elementLibraryOpen, elementLibraryRecent, elementLibrarySearch} from '@webconsulting/visual-editor-enhancements/Shared/local-stores.js';
import {LIST_WIDTH, MAX_CONCURRENT_PREVIEWS, PREVIEW_BOX_HEIGHT, PREVIEW_DISPLAY_WIDTH, PREVIEW_FLYOUT_CLOSE_DELAY, PREVIEW_MIN_RENDER_WIDTH, PREVIEW_RENDER_WIDTH, RECENT_LIMIT, SEARCH_DEBOUNCE} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/constants.js';
import {beginGrabCursor, endGrabCursor, ghostState, moveGhost, renderDragGhost, setCustomDragImage} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/drag-ghost.js';
import {dropOnZone, findDropZone, libraryDragData} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/drop-target.js';
import {compactPreview, contentHeight, fitThumbnail, hideAdminPanel} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/preview-frame.js';
import {PreviewLoader} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/preview-loader.js';
import {fallbackSearchResult, fetchServerSearch, visibleItems} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/search.js';
import {styles} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/styles.js';

/**
 * Element library side panel: a browsable, filterable catalog of all content
 * element types with rendered previews. Cards are dragged onto the Visual
 * Editor's own <ve-drop-zone> targets; dropping copies the seeded demo record
 * so the new element appears pre-filled like its preview.
 *
 * The panel is a client: the catalog (?elementLibrary=1), the ranked search
 * (?elementLibrarySearch=) and the preview URLs come from a catalog provider
 * extension. Cards show ranked keyword chips; the enlarged flyout shows the
 * description. Previews load lazily and throttled (see PreviewLoader), so
 * opening the panel never saturates the backend. Accent colour and column
 * count come from the backend user's settings (Shared/config).
 *
 * @extends {HTMLElement}
 */
export class VeElementLibrary extends LitElement {
  static properties = {
    open: {type: Boolean, state: true, attribute: false},
    collapsed: {type: Boolean, state: true, attribute: false},
    loading: {type: Boolean, state: true, attribute: false},
    error: {type: String, state: true, attribute: false},
    items: {type: Array, state: true, attribute: false},
    categories: {type: Array, state: true, attribute: false},
    selectedGroups: {type: Object, state: true, attribute: false},
    searchTerm: {type: String, state: true, attribute: false},
    searchResult: {type: Object, state: true, attribute: false},
    previewItem: {type: Object, state: true, attribute: false},
    previewDragGhost: {type: Object, state: true, attribute: false},
    draggingCType: {type: String, state: true, attribute: false},
    dragging: {type: Boolean, state: true, attribute: false},
    recent: {type: Array, state: true, attribute: false},
  };

  static styles = styles;

  constructor() {
    super();
    this.open = false;
    this.collapsed = false;
    this.loading = false;
    this.error = '';
    this.items = [];
    this.categories = [];
    // Search term and selected categories persist across page loads (same
    // local store as the open state), so the filter survives navigating away.
    this.selectedGroups = new Set(Array.isArray(elementLibraryCategories.get()) ? elementLibraryCategories.get() : []);
    this.searchTerm = elementLibrarySearch.get() || '';
    /** @type {import('./ve-element-library/search.js').SearchResult|null} null = no active search */
    this.searchResult = null;
    this.searchSeq = 0;
    this.searchDebounce = null;
    this.previewItem = null;
    this.previewCloseTimer = null;
    this.draggingCType = '';
    this.dragging = false;
    this.activeDragData = null;
    this.hoveredDropZone = null;
    this.previewPointerId = null;
    this.previewDragGhost = null;
    // 1 = compact list beside one docked preview pane, 3 = thumbnail grid with
    // an overlay preview. The panel width follows from the column count.
    this.columns = elementLibraryColumns();
    this.recent = Array.isArray(elementLibraryRecent.get()) ? elementLibraryRecent.get() : [];
    this.previewLoader = new PreviewLoader(MAX_CONCURRENT_PREVIEWS, () => this.requestUpdate());
    this.observer = null;
    this.gridElement = null;

    this.onDragInProgressChange = this.#onDragInProgressChange.bind(this);
    this.onLibraryDragOver = this.#onLibraryDragOver.bind(this);
    this.onLibraryDrop = this.#onLibraryDrop.bind(this);
    this.onPreviewPointerMove = this.#onPreviewPointerMove.bind(this);
    this.onPreviewPointerUp = this.#onPreviewPointerUp.bind(this);
    this.onPreviewPointerCancel = this.#onPreviewPointerCancel.bind(this);
    this.onRecentChange = () => {
      this.recent = Array.isArray(elementLibraryRecent.get()) ? elementLibraryRecent.get() : [];
    };
    this.previewReturnFocus = null;
    this.onKeyDown = (event) => {
      if (!this.previewItem || this.columns === 1) {
        return;
      }
      if (event.key === 'Escape') {
        this.#closePreview();
      } else if (event.key === 'Tab') {
        // The preview dialog is modal and its only control is the close button.
        event.preventDefault();
        this.shadowRoot?.querySelector('.previewClose')?.focus();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    dragInProgressStore.addEventListener('change', this.onDragInProgressChange);
    elementLibraryRecent.addEventListener('change', this.onRecentChange);
    window.addEventListener('keydown', this.onKeyDown);
    if (elementLibraryOpen.get()) {
      this.openPanel();
    }
  }

  disconnectedCallback() {
    dragInProgressStore.removeEventListener('change', this.onDragInProgressChange);
    elementLibraryRecent.removeEventListener('change', this.onRecentChange);
    window.removeEventListener('keydown', this.onKeyDown);
    this.#cancelClosePreview();
    this.#stopLibraryDropCapture();
    clearTimeout(this.searchDebounce);
    this.observer?.disconnect();
    super.disconnectedCallback();
  }

  toggle() {
    this.open ? this.closePanel() : this.openPanel();
  }

  openPanel() {
    this.open = true;
    elementLibraryOpen.set(true);
    this.dispatchEvent(new CustomEvent('ve-library-toggle', {detail: {open: true}, bubbles: true, composed: true}));
    if (this.items.length === 0 && !this.loading) {
      this.#load();
    } else if (this.searchTerm.trim() !== '') {
      this.#scheduleSearch();
    }
  }

  closePanel() {
    this.#closePreview();
    this.open = false;
    elementLibraryOpen.set(false);
    this.dispatchEvent(new CustomEvent('ve-library-toggle', {detail: {open: false}, bubbles: true, composed: true}));
  }

  async #load() {
    this.loading = true;
    this.error = '';
    try {
      const response = await fetch(window.location.pathname + '?elementLibrary=1', {
        headers: {'X-Request-Token': window.veInfo.token},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || ('HTTP ' + response.status));
      }
      const data = await response.json();
      this.items = data.elements || [];
      this.categories = data.categories || [];
      if (this.searchTerm.trim() !== '') {
        this.#scheduleSearch();
      }
    } catch (error) {
      this.error = String(error.message || error);
    } finally {
      this.loading = false;
    }
  }

  #onDragInProgressChange() {
    // Slide the panel out of the way while a drag runs so the drop zones are
    // reachable. The preview is itself a drag source, so it must not be
    // removed on dragstart (that would abort its own drag); the overlay is
    // hidden via the `dragging` flag (CSS) and closed once the drag ended.
    const active = !!dragInProgressStore.value;
    this.collapsed = active;
    this.dragging = active;
    if (!active) {
      this.#closePreview();
    }
  }

  // --- filters and search -----------------------------------------------------

  #toggleGroup(group) {
    const next = new Set(this.selectedGroups);
    next.has(group) ? next.delete(group) : next.add(group);
    this.selectedGroups = next;
    elementLibraryCategories.set([...next]);
  }

  #clearFilters() {
    this.selectedGroups = new Set();
    this.searchTerm = '';
    this.searchResult = null;
    elementLibraryCategories.set([]);
    elementLibrarySearch.set('');
  }

  #onSearchInput(event) {
    this.searchTerm = event.target.value;
    elementLibrarySearch.set(this.searchTerm);
    this.#scheduleSearch();
  }

  #scheduleSearch() {
    clearTimeout(this.searchDebounce);
    if (this.searchTerm.trim() === '') {
      this.searchResult = null;
      return;
    }
    this.searchDebounce = setTimeout(() => this.#runServerSearch(this.searchTerm.trim()), SEARCH_DEBOUNCE);
  }

  /**
   * An out-of-order guard (searchSeq) prevents a slow early response from
   * clobbering a fast later one; an unreachable endpoint degrades to the
   * client-side substring filter.
   * @param {string} term
   */
  async #runServerSearch(term) {
    const seq = ++this.searchSeq;
    let result;
    try {
      result = await fetchServerSearch(term);
    } catch {
      result = fallbackSearchResult(term);
    }
    if (seq === this.searchSeq) {
      this.searchResult = result;
    }
  }

  #applySuggestion(term) {
    this.searchTerm = term;
    elementLibrarySearch.set(term);
    clearTimeout(this.searchDebounce);
    this.#runServerSearch(term.trim());
  }

  // --- drag and drop ----------------------------------------------------------

  /**
   * Begins an element drag from a card or the enlarged preview. HTML5 drag and
   * drop is imperative, so dataTransfer is set directly; the source card is
   * dimmed reactively via `draggingCType` (a classMap binding).
   * @param {DragEvent} event
   * @param {Object} item
   */
  #startDrag(event, item) {
    const data = libraryDragData(item);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/ve-drag', JSON.stringify(data));
    setCustomDragImage(event, item);
    this.draggingCType = item.cType;
    this.activeDragData = data;
    dragInProgressStore.value = data;
    this.#startLibraryDropCapture();
    // Remembered as recently used the moment it is picked up: tracking the
    // actual drop via dragend's dropEffect proved unreliable across the VE drop
    // pipeline, and "you reached for it" is the signal the core wizard's
    // recently-used list captures too.
    this.#recordRecent(item.cType);
    initVelocityScroll(event);
  }

  #endDrag() {
    this.draggingCType = '';
    this.#stopLibraryDropCapture();
    dragInProgressStore.value = false;
  }

  #startLibraryDropCapture() {
    document.addEventListener('dragover', this.onLibraryDragOver, true);
    document.addEventListener('drop', this.onLibraryDrop, true);
  }

  #stopLibraryDropCapture() {
    document.removeEventListener('dragover', this.onLibraryDragOver, true);
    document.removeEventListener('drop', this.onLibraryDrop, true);
    document.removeEventListener('pointermove', this.onPreviewPointerMove, true);
    document.removeEventListener('pointerup', this.onPreviewPointerUp, true);
    document.removeEventListener('pointercancel', this.onPreviewPointerCancel, true);
    if (this.hoveredDropZone) {
      this.hoveredDropZone.isDragHovering = false;
      this.hoveredDropZone = null;
    }
    this.#removePreviewDragGhost();
    this.activeDragData = null;
    this.previewPointerId = null;
  }

  #onLibraryDragOver(event) {
    const data = this.activeDragData || dragInProgressStore.value;
    if (!data?.libraryMode) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.#updateHoveredDropZone(event.clientX, event.clientY, event);
  }

  async #onLibraryDrop(event) {
    const data = this.activeDragData || dragInProgressStore.value;
    if (!data?.libraryMode) {
      return;
    }
    const dropZone = findDropZone(event.clientX, event.clientY) || this.hoveredDropZone;
    if (!dropZone) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      await dropOnZone(dropZone, data);
    } finally {
      this.#endDrag();
    }
  }

  /**
   * The enlarged preview is dragged with pointer events (no HTML5 drag, so the
   * overlay can stay mounted); a chip follows the pointer and the drop zones
   * are hit-tested by geometry.
   */
  #startPreviewPointerDrag(event, item) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    const data = libraryDragData(item);
    this.previewPointerId = event.pointerId;
    this.activeDragData = data;
    this.draggingCType = item.cType;
    dragInProgressStore.value = data;
    this.previewDragGhost = ghostState(item, event.clientX, event.clientY);
    beginGrabCursor();
    this.#startLibraryDropCapture();
    document.addEventListener('pointermove', this.onPreviewPointerMove, true);
    document.addEventListener('pointerup', this.onPreviewPointerUp, true);
    document.addEventListener('pointercancel', this.onPreviewPointerCancel, true);
    this.#recordRecent(item.cType);
  }

  #onPreviewPointerMove(event) {
    if (this.previewPointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const dropZone = this.#updateHoveredDropZone(event.clientX, event.clientY);
    this.#movePreviewDragGhost(event.clientX, event.clientY, !!dropZone);
  }

  async #onPreviewPointerUp(event) {
    if (this.previewPointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const data = this.activeDragData || dragInProgressStore.value;
    const dropZone = findDropZone(event.clientX, event.clientY) || this.hoveredDropZone;
    this.#movePreviewDragGhost(event.clientX, event.clientY, !!dropZone);
    try {
      if (data?.libraryMode && dropZone) {
        await dropOnZone(dropZone, data);
      }
    } finally {
      this.#endDrag();
    }
  }

  #onPreviewPointerCancel(event) {
    if (this.previewPointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.#endDrag();
  }

  #updateHoveredDropZone(x, y, dragEvent = null) {
    const dropZone = findDropZone(x, y);
    if (this.hoveredDropZone && this.hoveredDropZone !== dropZone) {
      this.hoveredDropZone.isDragHovering = false;
    }
    if (!dropZone) {
      this.hoveredDropZone = null;
      return null;
    }
    this.hoveredDropZone = dropZone;
    if (dragEvent) {
      dropZone._dragOver(dragEvent);
    } else {
      dropZone.isDragHovering = true;
    }
    return dropZone;
  }

  #movePreviewDragGhost(x, y, canDrop) {
    if (this.previewDragGhost) {
      this.previewDragGhost = moveGhost(this.previewDragGhost, x, y, canDrop);
    }
  }

  #removePreviewDragGhost() {
    if (!this.previewDragGhost) {
      return;
    }
    this.previewDragGhost = null;
    endGrabCursor();
  }

  /**
   * Remembers a cType as recently used (newest first, de-duplicated, capped)
   * and persists it so the "Recently used" section survives reloads.
   * @param {string} cType
   */
  #recordRecent(cType) {
    if (!cType) {
      return;
    }
    const next = [cType, ...this.recent.filter((entry) => entry !== cType)].slice(0, RECENT_LIMIT);
    this.recent = next;
    elementLibraryRecent.set(next);
  }

  /**
   * Recently-used items in recency order that still exist in the catalog.
   * @return {Array<Object>}
   */
  #recentItems() {
    if (this.recent.length === 0) {
      return [];
    }
    const byCType = new Map(this.items.map((item) => [item.cType, item]));
    return this.recent.map((cType) => byCType.get(cType)).filter(Boolean);
  }

  // --- geometry -----------------------------------------------------------------

  /** Computed panel width in px (before the 94vw cap applied in CSS). */
  #panelWidth() {
    if (this.columns === 1) {
      // A compact list beside a preview pane that fills the rest: use (almost)
      // the whole canvas so the docked preview grows with the screen; the CSS
      // min(.., 94vw) caps it to the viewport, 1900 only limits ultra-wide screens.
      return 1900;
    }
    const gap = 18;
    const padding = 40; // 20px each side of .grid
    return this.columns * PREVIEW_DISPLAY_WIDTH + (this.columns - 1) * gap + padding;
  }

  /** Card height in px: a preview-dominant box plus header + keyword band. */
  #cardHeight() {
    return Math.round(PREVIEW_DISPLAY_WIDTH * 0.62) + 104;
  }

  /** Width of the enlarged preview when its stage cannot be measured. */
  #flyoutFallbackWidth() {
    return Math.max(320, Math.min(window.innerWidth - 24, PREVIEW_RENDER_WIDTH));
  }

  // --- lazy thumbnail loading ----------------------------------------------------

  updated() {
    // Thumbnail iframes exist only in the multi-column grid; one-column mode
    // has a single docked preview iframe rendered directly by #renderPreview().
    const grid = this.columns === 1 ? null : this.shadowRoot.querySelector('.grid');
    if (!grid) {
      this.observer?.disconnect();
      this.observer = null;
      this.gridElement = null;
      this.previewLoader.reset();
      return;
    }
    if (grid !== this.gridElement) {
      this.observer?.disconnect();
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.previewLoader.enqueue(entry.target.dataset.ctype);
          }
        }
      }, {root: grid, rootMargin: '300px 0px'});
      this.gridElement = grid;
    } else {
      this.observer?.disconnect();
    }
    const tiles = Array.from(grid.querySelectorAll('[data-ctype]'));
    this.previewLoader.sync(tiles.map((tile) => tile.dataset.ctype));
    tiles.forEach((tile) => this.observer.observe(tile));
    this.previewLoader.prime(this.#visibleTileTypes(grid, tiles));
  }

  /** The cTypes of the tiles within 300px of the grid's visible area, in visual order. */
  #visibleTileTypes(grid, tiles) {
    const rootRect = grid.getBoundingClientRect();
    const margin = 300;
    return tiles
      .filter((tile) => {
        const rect = tile.getBoundingClientRect();
        return rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin;
      })
      .map((tile) => tile.dataset.ctype);
  }

  #onPreviewLoad(event, cType) {
    const iframe = event.target;
    hideAdminPanel(iframe);
    compactPreview(iframe);
    const box = iframe.closest('.preview');
    fitThumbnail(iframe, box?.clientWidth || PREVIEW_DISPLAY_WIDTH, box?.clientHeight || PREVIEW_BOX_HEIGHT, PREVIEW_RENDER_WIDTH);
    this.previewLoader.settle(cType);
  }

  // --- enlarged preview -----------------------------------------------------------

  /**
   * Selects the item shown in the big preview: the docked pane in one-column
   * mode (hover/focus driven), the centred overlay in grid mode (loupe button).
   */
  #openPreview(item) {
    this.#cancelClosePreview();
    const opensDialog = this.columns > 1 && this.previewItem === null;
    if (opensDialog) {
      // Grid mode opens a modal dialog: remember the trigger to hand focus
      // back when it closes.
      this.previewReturnFocus = this.shadowRoot?.activeElement ?? null;
    }
    this.previewItem = item;
    if (opensDialog) {
      this.updateComplete.then(() => this.shadowRoot?.querySelector('.previewClose')?.focus());
    }
  }

  #scheduleClosePreview() {
    if (dragInProgressStore.value) {
      return;
    }
    this.#cancelClosePreview();
    this.previewCloseTimer = setTimeout(() => {
      this.previewItem = null;
      this.previewCloseTimer = null;
    }, PREVIEW_FLYOUT_CLOSE_DELAY);
  }

  #cancelClosePreview() {
    if (this.previewCloseTimer) {
      clearTimeout(this.previewCloseTimer);
      this.previewCloseTimer = null;
    }
  }

  #closePreview() {
    this.#cancelClosePreview();
    const closedDialog = this.columns > 1 && this.previewItem !== null;
    this.previewItem = null;
    if (closedDialog) {
      this.previewReturnFocus?.focus?.();
      this.previewReturnFocus = null;
    }
  }

  /**
   * Sizes the enlarged preview once its iframe loaded: the element is rendered
   * at (at least) a desktop width and scaled to the stage so the whole element
   * fits its container - the docked pane or the viewport - without a scrollbar.
   * @param {Event} event iframe load event
   */
  #onFlyoutLoad(event) {
    const iframe = event.target;
    hideAdminPanel(iframe);
    const stage = iframe.closest('.previewStage');
    const stageWidth = stage?.clientWidth || this.#flyoutFallbackWidth();

    // Pick the viewport BEFORE measuring: changing the iframe width relays the
    // document out, and a height measured at the old width would be wrong.
    const renderWidth = Math.min(PREVIEW_RENDER_WIDTH, Math.max(Math.round(stageWidth), PREVIEW_MIN_RENDER_WIDTH));
    iframe.style.width = renderWidth + 'px';
    let height = contentHeight(iframe);
    if (height < 20) {
      height = Math.round(renderWidth * 0.5);
    }

    // Cap the stage so the WHOLE preview (header + stage + description) fits
    // its container height; a very tall element is shrunk to fit instead.
    const flyout = iframe.closest('.previewFlyout');
    const dock = iframe.closest('.dock');
    const availableHeight = dock ? dock.clientHeight : window.innerHeight;
    const headerHeight = flyout?.querySelector('.previewHead')?.offsetHeight || 44;
    const captionHeight = flyout?.querySelector('.previewCaption')?.offsetHeight || 0;
    const stageBudget = Math.max(140, availableHeight - 28 - headerHeight - captionHeight);
    const fitWidthScale = stageWidth / renderWidth;
    const fitsAtFullWidth = height * fitWidthScale <= stageBudget;
    const scale = fitsAtFullWidth ? fitWidthScale : stageBudget / height;
    const stageHeight = fitsAtFullWidth ? height * fitWidthScale : stageBudget;

    if (stage) {
      stage.style.height = Math.round(stageHeight) + 'px'; // width stays constant (CSS 100%)
      stage.classList.add('loaded');
    }
    iframe.style.height = height + 'px';
    iframe.style.transform = `translateX(-50%) scale(${scale})`;
    iframe.classList.add('ready');
  }

  // --- rendering ------------------------------------------------------------------

  render() {
    if (!this.open) {
      return html``;
    }

    const filtered = visibleItems(this.items, this.selectedGroups, this.searchTerm.trim(), this.searchResult);
    const onePane = this.columns === 1;
    const panelStyle =
      `width: min(${this.#panelWidth()}px, 94vw);` +
      `--ve-cols: ${this.columns};` +
      `--ve-preview-width: ${PREVIEW_DISPLAY_WIDTH}px;` +
      `--ve-list-width: ${LIST_WIDTH}px;` +
      `--ve-card-height: ${this.#cardHeight()}px;`;
    const panelClasses = {panel: true, collapsed: this.collapsed, 'panel--single': onePane};
    const hasFilters = this.selectedGroups.size > 0 || this.searchTerm.trim() !== '';
    // The docked pane always shows something: the hovered item, else the first.
    const dockItem = onePane ? (this.previewItem || filtered[0] || null) : null;

    return html`
      ${renderDragGhost(this.previewDragGhost)}
      <div class=${classMap(panelClasses)} part="panel" style="${panelStyle}"
           role="dialog" aria-modal="false" aria-labelledby="ve-library-title">
        <div class="header">
          <div class="headerRow">
            <div class="titleWrap">
              <span class="titleBadge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity="0.95"/>
                  <rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity="0.6"/>
                  <rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.6"/>
                  <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.35"/>
                </svg>
              </span>
              <span class="titleText">
                <h2 id="ve-library-title">${lll('frontend.library.title') || 'Add content'}</h2>
                <span class="counter" aria-live="polite" aria-atomic="true">
                  <strong>${filtered.length}</strong> / ${this.items.length}
                  <span class="visually-hidden">${lll('frontend.library.shown') || 'elements shown'}</span>
                </span>
              </span>
            </div>
          </div>

          <div class="searchRow">
            <div class="searchWrap">
              <svg class="searchIcon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <input
                class="search"
                type="search"
                .value="${this.searchTerm}"
                placeholder="${lll('frontend.library.search') || 'Search elements …'}"
                aria-label="${lll('frontend.library.search') || 'Search elements …'}"
                @input="${this.#onSearchInput}"
              />
            </div>
          </div>

          ${this.#renderSuggestions()}

          <div class="chips" role="group" aria-label="${lll('frontend.library.categories') || 'Categories'}">
            ${hasFilters ? html`
              <button type="button" class="chip chip--clear" @click="${this.#clearFilters}">
                ${lll('frontend.library.allCategories') || 'All'}
              </button>` : ''}
            ${this.categories.map((category) => html`
              <button
                type="button"
                class="chip ${this.selectedGroups.has(category) ? 'active' : ''}"
                aria-pressed="${this.selectedGroups.has(category) ? 'true' : 'false'}"
                @click="${() => this.#toggleGroup(category)}"
              >${category}</button>
            `)}
          </div>
        </div>

        ${onePane ? html`
          <div class="workarea">
            <div class="dock">
              ${dockItem ? this.#renderPreview('docked', dockItem) : this.#renderDockEmpty()}
            </div>
            <div class="vlist">${this.#renderList(filtered)}</div>
          </div>
        ` : html`
          <div class="grid">${this.#renderList(filtered)}</div>
        `}
      </div>
      ${!onePane && this.previewItem ? this.#renderPreview('modal', this.previewItem) : ''}
    `;
  }

  /**
   * The scrollable element list: status messages, then (when no search or
   * category filter is active) a "Recently used" section followed by the rest.
   * @param {Array<Object>} filtered
   */
  #renderList(filtered) {
    if (this.loading) {
      return html`<div class="status" role="status"><span class="spinner" aria-hidden="true"></span>${lll('frontend.library.loading') || 'Loading …'}</div>`;
    }
    if (this.error) {
      return html`<p class="status error" role="alert">${this.error}</p>`;
    }
    if (filtered.length === 0) {
      return html`<p class="status" role="status">${lll('frontend.library.empty') || 'No elements match the current filter.'}</p>`;
    }

    const showRecent = this.searchTerm.trim() === '' && this.selectedGroups.size === 0;
    const recentItems = showRecent ? this.#recentItems() : [];
    const recentSet = new Set(recentItems.map((item) => item.cType));
    const rest = recentItems.length ? filtered.filter((item) => !recentSet.has(item.cType)) : filtered;

    return html`
      ${recentItems.length ? html`
        <div class="sectionHead" role="heading" aria-level="3">
          <svg class="sectionIcon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/>
          </svg>
          <span>${lll('frontend.library.recentlyUsed') || 'Recently used'}</span>
          <span class="sectionCount">${recentItems.length}</span>
        </div>
        ${repeat(recentItems, (item) => 'recent-' + item.cType, (item) => this.#renderCard(item))}
      ` : ''}
      ${recentItems.length && rest.length ? html`
        <div class="sectionHead" role="heading" aria-level="3">
          <span>${lll('frontend.library.allElements') || 'All elements'}</span>
          <span class="sectionCount">${rest.length}</span>
        </div>` : ''}
      ${repeat(rest, (item) => item.cType, (item) => this.#renderCard(item))}
    `;
  }

  #renderDockEmpty() {
    return html`<div class="dockEmpty">${lll('frontend.library.previewHint') || 'Hover an element to preview it here.'}</div>`;
  }

  #renderSuggestions() {
    const result = this.searchResult;
    if (!result || result.fallback || result.term !== this.searchTerm.trim()) {
      return '';
    }
    const didYouMean = result.didYouMean;
    const suggestions = result.suggestions || [];
    if (!didYouMean && suggestions.length === 0) {
      return '';
    }
    return html`
      <div class="suggestRow">
        ${didYouMean ? html`
          <span class="didYouMean">${lll('frontend.library.didYouMean') || 'Did you mean'}
            <button type="button" class="suggLink" @click="${() => this.#applySuggestion(didYouMean)}">${didYouMean}</button>?</span>
        ` : ''}
        ${suggestions.map((suggestion) => html`
          <button type="button" class="suggChip" @click="${() => this.#applySuggestion(suggestion)}">${suggestion}</button>
        `)}
      </div>`;
  }

  /**
   * The big rendered preview. mode = 'docked' (one-column: an in-flow pane to
   * the left of the list) or 'modal' (grid: a centred overlay over a backdrop
   * that dismisses on click / ✕ / Escape).
   * @param {('docked'|'modal')} mode
   * @param {Object} item
   */
  #renderPreview(mode, item) {
    const previewLabel = lll('frontend.library.preview') || 'Preview';
    const closeLabel = lll('frontend.library.closePreview') || 'Close preview';
    const isModal = mode === 'modal';
    const dragHint = lll('frontend.library.dragHint') || 'Drag onto the page';
    // The whole preview is a drag source (just like a card): the grip in the
    // footer signals it, and dragging it inserts this element. Starting the
    // drag collapses the panel / hides the overlay via #onDragInProgressChange
    // so the drop zones underneath are reachable.
    const inner = html`
      <div class="previewFlyout previewFlyout--${mode}"
           draggable="true"
           title="${dragHint}"
           @dragstart="${(event) => this.#startDrag(event, item)}"
           @dragend="${this.#endDrag}">
        <div class="previewHead">
          <span class="previewEyebrow">${previewLabel}</span>
          <strong class="previewTitle">${item.title}</strong>
          <span class="pill badge">${item.group}</span>
          ${isModal ? html`
            <button type="button" class="previewClose" draggable="false"
                    @click="${(event) => { event.stopPropagation(); this.#closePreview(); }}"
                    @dragstart="${(event) => { event.preventDefault(); event.stopPropagation(); }}"
                    title="${closeLabel}" aria-label="${closeLabel}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
              </svg>
            </button>` : ''}
        </div>
        <div class="previewStage">
          <span class="spinner previewSpinner" aria-hidden="true"></span>
          ${item.previewUrl
            ? html`<iframe class="previewFrame" src="${item.previewUrl}" scrolling="no" tabindex="-1"
                          @load="${(event) => this.#onFlyoutLoad(event)}"></iframe>`
            : ''}
        </div>
        ${item.description ? html`
          <div class="previewCaption">
            <p class="previewDesc">${item.description}</p>
          </div>` : ''}
        <div class="previewDrag" draggable="false" aria-hidden="true"
             @pointerdown="${(event) => this.#startPreviewPointerDrag(event, item)}"
             @mousedown="${(event) => { event.preventDefault(); event.stopPropagation(); }}"
             @click="${(event) => event.stopPropagation()}"
             @dragstart="${(event) => { event.preventDefault(); event.stopPropagation(); }}">
          <span class="previewDragArrow">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="20" y1="12" x2="7" y2="12"/><polyline points="12 7 6 12 12 17"/>
            </svg>
          </span>
          <span class="previewDragGrip">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <circle cx="6" cy="3.5" r="1.3"/><circle cx="10" cy="3.5" r="1.3"/>
              <circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/>
              <circle cx="6" cy="12.5" r="1.3"/><circle cx="10" cy="12.5" r="1.3"/>
            </svg>
          </span>
          <span class="previewDragLabel">${dragHint}</span>
        </div>
      </div>`;

    if (isModal) {
      // The iframe is pointer-events:none, so a click anywhere in the overlay
      // (backdrop or chrome) falls through to here and closes it; ✕ and Escape
      // close it too.
      return html`
        <div class="previewModal ${this.dragging ? 'dragging' : ''}" part="preview"
             role="dialog" aria-modal="true" aria-label="${previewLabel}: ${item.title}"
             @click="${this.#closePreview}">
          ${inner}
        </div>`;
    }
    return html`<div class="previewDock" part="preview">${inner}</div>`;
  }

  #renderCard(item) {
    // A keyword that merely repeats the title wastes a whole row; a short,
    // useful keyword leads instead.
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const keywords = (item.keywords || [])
      .filter((keyword) => keyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== titleKey)
      .slice(0, 10);

    // One-column mode: a compact list row with the element's top keywords (no
    // per-row preview iframe); the docked pane renders the hovered element.
    if (this.columns === 1) {
      const active = this.previewItem ? this.previewItem.cType === item.cType : false;
      return html`
        <div
          class=${classMap({lrow: true, 'is-active': active, 'is-dragging': this.draggingCType === item.cType})}
          data-ctype="${item.cType}"
          draggable="true"
          tabindex="0"
          @dragstart="${(event) => this.#startDrag(event, item)}"
          @dragend="${this.#endDrag}"
          @mouseenter="${() => { if (item.previewUrl) this.#openPreview(item); }}"
          @focus="${() => { if (item.previewUrl) this.#openPreview(item); }}"
        >
          <span class="lrowBody">
            <span class="pill badge lrowCat">${item.group}</span>
            <span class="lrowTitle">${item.title}</span>
          </span>
          ${keywords.length ? html`
            <div class="lrowKeywords">
              ${keywords.slice(0, 6).map((keyword) => html`<span class="kw">${keyword}</span>`)}
            </div>` : ''}
        </div>
      `;
    }

    // Grid mode: thumbnail card; clicking the thumbnail or the loupe opens the
    // centred overlay preview.
    const previewLoaded = this.previewLoader.isAdmitted(item.cType);
    const zoomLabel = lll('frontend.library.zoom') || 'Enlarge preview';
    const openOverlay = (event) => {
      if (!item.previewUrl || this.draggingCType) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.#openPreview(item);
    };
    return html`
      <div
        class=${classMap({card: true, 'is-dragging': this.draggingCType === item.cType})}
        data-ctype="${item.cType}"
        draggable="true"
        @dragstart="${(event) => this.#startDrag(event, item)}"
        @dragend="${this.#endDrag}"
      >
        <div class="cardHead">
          <span class="pill badge cardCategory">${item.group}</span>
          <strong class="cardTitle">${item.title}</strong>
        </div>
        ${keywords.length ? html`
          <div class="cardKeywords">
            ${keywords.map((keyword) => html`<span class="kw">${keyword}</span>`)}
          </div>` : ''}
        <div class="preview" @click="${openOverlay}">
          ${previewLoaded && item.previewUrl
            ? html`<iframe src="${item.previewUrl}" data-ctype="${item.cType}" loading="eager" scrolling="no" tabindex="-1"
                          @load="${(event) => this.#onPreviewLoad(event, item.cType)}" @error="${() => this.previewLoader.settle(item.cType)}"></iframe>
                   <div class="previewOverlay"></div>`
            : html`<div class="previewPlaceholder">
                     ${item.iconUrl ? html`<img src="${item.iconUrl}" alt="" loading="lazy"/>` : html`<span>${item.title}</span>`}
                     <span class="shimmer"></span>
                   </div>`}
          ${item.previewUrl ? html`
            <button class="previewLoupe" type="button" draggable="false"
                    @click="${openOverlay}"
                    @dragstart="${(event) => { event.preventDefault(); event.stopPropagation(); }}"
                    title="${zoomLabel}" aria-label="${zoomLabel}">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
                   fill="none" stroke="currentColor" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="14 4 20 4 20 10"/>
                <line x1="20" y1="4" x2="13" y2="11"/>
                <polyline points="10 20 4 20 4 14"/>
                <line x1="4" y1="20" x2="11" y2="13"/>
              </svg>
            </button>` : ''}
          <span class="grabHint" aria-hidden="true">
            <svg class="grabGrip" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor">
              <circle cx="6" cy="3.5" r="1.3"/><circle cx="10" cy="3.5" r="1.3"/>
              <circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/>
              <circle cx="6" cy="12.5" r="1.3"/><circle cx="10" cy="12.5" r="1.3"/>
            </svg>
            ${dragHintLabel()}
          </span>
        </div>
      </div>
    `;
  }
}

const dragHintLabel = () => lll('frontend.library.dragHint') || 'Drag onto the page';

customElements.define('ve-element-library', VeElementLibrary);

/**
 * Returns the singleton panel instance, mounting it on first use.
 * @return {VeElementLibrary}
 */
export function getElementLibrary() {
  let panel = document.querySelector('ve-element-library');
  if (!panel) {
    panel = document.createElement('ve-element-library');
    document.body.appendChild(panel);
  }
  return panel;
}
