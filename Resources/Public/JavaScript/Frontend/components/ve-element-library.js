import {css, html, LitElement} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import {lll} from '@typo3/core/lit-helper.js';
import {dragInProgressStore} from '@typo3/visual-editor/Frontend/stores/drag-store';
import {initVelocityScroll} from '@typo3/visual-editor/Frontend/components/ve-drag-handle/velocity-scroll';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {useDataHandler} from '@typo3/visual-editor/Backend/use-data-handler';
import {sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {filterItems} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/filter';
import {elementLibraryOpen, elementLibrarySearch, elementLibraryCategories, elementLibraryRecent} from '@webconsulting/visual-editor-enhancements/Shared/local-stores';
import {contentAddedFeedback, elementLibraryColumns} from '@webconsulting/visual-editor-enhancements/Shared/config';

const PREVIEW_RENDER_WIDTH = 1280;

/** How many recently-used elements to remember and show in the top section. */
const RECENT_LIMIT = 8;

/** Preview thumbnail box height in px; mirrors the .preview CSS fallback. */
const PREVIEW_BOX_HEIGHT = 260;

/**
 * Cap for the adaptive preview zoom. Some elements (announcement bars, single
 * buttons, short teasers) render only a fraction of the box tall and would
 * float in empty space; we scale them up to fill the thumbnail, but never by
 * more than this so a tiny element is not blown up into a blurry crop.
 */
const PREVIEW_MAX_ZOOM = 2.4;

/**
 * Max number of preview iframes allowed to load concurrently. Each preview is
 * a real frontend request; with a small PHP-FPM pool a flood of them starves
 * the save request (drops would silently fail). The IntersectionObserver only
 * ever loads previews that scrolled into view, throttled to this many at once.
 */
const MAX_CONCURRENT_PREVIEWS = 4;

/**
 * Base thumbnail display width in px, used only for the CSS default transform
 * and as a fallback. The real per-column width is computed from the user's
 * column count + card-width preset (see #effectiveColWidth()).
 */
const PREVIEW_DISPLAY_WIDTH = 360;

/**
 * The enlarged preview opens at this multiple of the thumbnail scale, then is
 * clamped to the space left of the card so the whole element always fits.
 */
const PREVIEW_ZOOM_FACTOR = 1.875;

/**
 * Grace period (ms) before the enlarged-preview flyout closes after the pointer
 * leaves its trigger. Long enough to travel from the loupe button onto the
 * flyout (which is itself a drag source) without it vanishing underfoot.
 */
const PREVIEW_FLYOUT_CLOSE_DELAY = 320;

/** Debounce (ms) before a keystroke triggers the server-side search request. */
const SEARCH_DEBOUNCE = 150;

/**
 * Element library side panel: a browsable, filterable catalog of all content
 * element types with big rendered previews (shadcn-blocks explorer style).
 * Cards are dragged into the existing <ve-drop-zone> targets; dropping copies
 * the seeded demo record so the new element appears pre-filled like its preview.
 *
 * Cards show ranked keyword chips (not prose); the enlarged flyout shows the
 * full keyword + synonym set and the description. Search is typo-tolerant and
 * runs server-side (pure PHP, Solr-style suggest + "did you mean"), with a
 * client-side substring fallback when the endpoint is unreachable.
 *
 * Previews load lazily (IntersectionObserver) and throttled, so opening the
 * panel never saturates the backend. Accent colour, column count and card width
 * come from window.veInfo / the persisted local store.
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
    loadedPreviews: {type: Object, state: true, attribute: false},
    previewItem: {type: Object, state: true, attribute: false},
    previewDragGhost: {type: Object, state: true, attribute: false},
    draggingCType: {type: String, state: true, attribute: false},
    dragging: {type: Boolean, state: true, attribute: false},
    recent: {type: Array, state: true, attribute: false},
  };

  constructor() {
    super();
    this.open = false;
    this.collapsed = false;
    this.loading = false;
    this.error = '';
    this.items = [];
    this.categories = [];
    // search term + selected categories persist across page loads (same local
    // store as the open state), so the filter survives navigating away.
    this.selectedGroups = new Set(Array.isArray(elementLibraryCategories.get()) ? elementLibraryCategories.get() : []);
    this.searchTerm = elementLibrarySearch.get() || '';
    // server search result for the current term: {term, order:Map<cType,score>,
    // suggestions, didYouMean, fallback}. null = no active search (show all).
    this.searchResult = null;
    this.searchSeq = 0;
    this.searchDebounce = null;
    this.loadedPreviews = new Set();
    this.loadingPreviews = new Set();
    this.previewItem = null;
    this.previewAnchor = null;
    this.previewCloseTimer = null;
    this.draggingCType = '';
    this.dragging = false;
    this.activeDragData = null;
    this.hoveredDropZone = null;
    this.previewPointerId = null;
    this.previewDragGhost = null;
    this.previewDragPreviousCursor = '';
    this.previewDragPreviousBodyCursor = '';
    // Column count comes from the backend user setting (1 = docked preview pane,
    // >1 = grid + overlay preview). The per-column and panel width are derived
    // automatically and adapt to the available width — no card-width setting.
    this.columns = this.#clampColumns(elementLibraryColumns());
    this.recent = Array.isArray(elementLibraryRecent.get()) ? elementLibraryRecent.get() : [];

    this.onDragInProgressChange = this.#onDragInProgressChange.bind(this);
    this.onLibraryDragOver = this.#onLibraryDragOver.bind(this);
    this.onLibraryDrop = this.#onLibraryDrop.bind(this);
    this.onPreviewPointerMove = this.#onPreviewPointerMove.bind(this);
    this.onPreviewPointerUp = this.#onPreviewPointerUp.bind(this);
    this.onPreviewPointerCancel = this.#onPreviewPointerCancel.bind(this);
    this.onRecentChange = () => {
      this.recent = Array.isArray(elementLibraryRecent.get()) ? elementLibraryRecent.get() : [];
    };
    this.onKeyDown = (event) => {
      if (event.key === 'Escape' && this.previewItem && this.columns > 1) {
        this.#closePreview();
      }
    };

    // lazy-preview machinery. `loadedPreviews` means "admitted to render an
    // iframe"; `loadingPreviews` tracks iframe load slots that still need a
    // load/error event or DOM-removal cleanup.
    this.previewQueue = [];
    this.previewInFlight = 0;
    this.observer = null;
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
    // Slide the panel out of the way while a drag is running so the drop zones
    // are reachable. The preview is itself a drag source now, so we must NOT
    // remove it on dragstart (that would abort its own drag); the overlay is
    // hidden via the `dragging` flag (CSS) instead and only closed once the drag
    // actually ends.
    const active = !!dragInProgressStore.value;
    this.collapsed = active;
    this.dragging = active;
    if (!active) {
      this.#closePreview();
    }
  }

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

  // --- search ---------------------------------------------------------------

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
   * Pure-PHP typo-tolerant search: the endpoint returns a ranked cType list plus
   * Solr-style suggestions; this panel reorders the items it already has. An
   * out-of-order guard (searchSeq) prevents a slow early response from clobbering
   * a fast later one. On any failure it degrades to the client-side filter.
   * @param {string} term
   */
  async #runServerSearch(term) {
    const seq = ++this.searchSeq;
    try {
      const response = await fetch(
        window.location.pathname + '?elementLibrarySearch=' + encodeURIComponent(term),
        {headers: {'X-Request-Token': window.veInfo.token}},
      );
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      const data = await response.json();
      if (seq !== this.searchSeq) {
        return; // a newer query already superseded this one
      }
      this.searchResult = {
        term,
        // store the server rank (index in the already-sorted matches) so the
        // panel reproduces the endpoint's exact order, including its tiebreak
        order: new Map((data.matches || []).map((match, index) => [match.cType, index])),
        suggestions: data.suggestions || [],
        didYouMean: data.didYouMean || null,
        fallback: false,
      };
    } catch (error) {
      if (seq !== this.searchSeq) {
        return;
      }
      // endpoint unreachable -> keep working with the client-side substring filter
      this.searchResult = {term, order: null, suggestions: [], didYouMean: null, fallback: true};
    }
  }

  #applySuggestion(term) {
    this.searchTerm = term;
    elementLibrarySearch.set(term);
    clearTimeout(this.searchDebounce);
    this.#runServerSearch(term.trim());
  }

  /**
   * The currently visible items: category chips filter (AND), then either the
   * server ranking for the current term, or the client-side substring fallback
   * (used while the first request is in flight or if the endpoint failed).
   * @return {Array<Object>}
   */
  #visibleItems() {
    const term = this.searchTerm.trim();
    let items = this.items;
    if (this.selectedGroups.size > 0) {
      items = items.filter((item) => this.selectedGroups.has(item.group));
    }
    if (term === '') {
      return items;
    }
    const result = this.searchResult;
    if (result && result.order && result.term === term && !result.fallback) {
      const order = result.order;
      return items
        .filter((item) => order.has(item.cType))
        .sort((a, b) => order.get(a.cType) - order.get(b.cType));
    }
    // in-flight or failed: substring match on title/description/keywords/synonyms
    return filterItems(items, new Set(), term);
  }

  /**
   * The ve-drag payload read by <ve-drop-zone>. `uid: -1` never collides with a
   * drop zone's own uid; libraryMode copies the seeded demo record when one
   * exists (so the element drops in pre-filled, matching its preview), else
   * creates an empty element of that type.
   * @param {Object} item
   */
  #dragData(item) {
    return {
      table: 'tt_content',
      uid: -1,
      CType: item.cType,
      libraryMode: item.demoUid > 0 ? 'copy' : 'new',
      demoUid: item.demoUid,
    };
  }

  /**
   * Begins an element drag from a card or the enlarged preview. HTML5 drag-and-
   * drop is imperative, so dataTransfer is set directly; the source card is
   * dimmed reactively via `draggingCType` (a classMap binding) rather than a
   * manual classList, which a re-render would clobber.
   * @param {DragEvent} event
   * @param {Object} item
   */
  #startDrag(event, item) {
    const data = this.#dragData(item);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/ve-drag', JSON.stringify(data));
    this.#setCustomDragImage(event, item);
    this.draggingCType = item.cType;
    this.activeDragData = data;
    dragInProgressStore.value = data;
    this.#startLibraryDropCapture();
    // Remember it as recently used the moment it is picked up. Tracking the
    // actual drop via dragend's dropEffect proved unreliable across the VE drop
    // pipeline, so "you reached for it" is the signal — same intent the core
    // "new content element" wizard's recently-used list captures.
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
    const dropZone = this.#dropZoneFromPoint(event.clientX, event.clientY) || this.hoveredDropZone;
    if (!dropZone) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.#dropOnZone(dropZone, data);
    } finally {
      this.#endDrag();
    }
  }

  #startPreviewPointerDrag(event, item) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    const data = this.#dragData(item);
    this.previewPointerId = event.pointerId;
    this.activeDragData = data;
    this.draggingCType = item.cType;
    dragInProgressStore.value = data;
    this.#showPreviewDragGhost(item, event.clientX, event.clientY);
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
    const dropZone = this.#dropZoneFromPoint(event.clientX, event.clientY) || this.hoveredDropZone;
    this.#movePreviewDragGhost(event.clientX, event.clientY, !!dropZone);
    try {
      if (data?.libraryMode && dropZone) {
        await this.#dropOnZone(dropZone, data);
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
    const dropZone = this.#dropZoneFromPoint(x, y);
    if (this.hoveredDropZone && this.hoveredDropZone !== dropZone) {
      this.hoveredDropZone.isDragHovering = false;
    }
    if (!dropZone) {
      this.hoveredDropZone = null;
      return;
    }
    this.hoveredDropZone = dropZone;
    if (dragEvent) {
      dropZone._dragOver(dragEvent);
    } else {
      dropZone.isDragHovering = true;
    }
    return dropZone;
  }

  #showPreviewDragGhost(item, x, y) {
    this.#removePreviewDragGhost();
    const position = this.#previewDragGhostPosition(x, y);
    this.previewDragGhost = {
      title: item.title || item.cType,
      cType: item.cType,
      iconUrl: item.iconUrl || '',
      canDrop: false,
      ...position,
    };
    this.previewDragPreviousCursor = document.documentElement.style.cursor;
    this.previewDragPreviousBodyCursor = document.body.style.cursor;
    document.documentElement.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
  }

  #movePreviewDragGhost(x, y, canDrop) {
    if (!this.previewDragGhost) {
      return;
    }
    this.previewDragGhost = {
      ...this.previewDragGhost,
      canDrop,
      ...this.#previewDragGhostPosition(x, y),
    };
  }

  #previewDragGhostPosition(x, y) {
    const width = 336;
    const height = 62;
    return {
      left: Math.round(Math.max(12, Math.min(window.innerWidth - width - 12, x + 18))),
      top: Math.round(Math.max(12, Math.min(window.innerHeight - height - 12, y + 18))),
    };
  }

  #removePreviewDragGhost() {
    if (!this.previewDragGhost) {
      return;
    }
    this.previewDragGhost = null;
    document.documentElement.style.cursor = this.previewDragPreviousCursor;
    document.body.style.cursor = this.previewDragPreviousBodyCursor;
    this.previewDragPreviousCursor = '';
    this.previewDragPreviousBodyCursor = '';
  }

  async #dropOnZone(dropZone, data) {
    const containerParent = Number.isInteger(dropZone.tx_container_parent) && dropZone.tx_container_parent > 0
      ? {tx_container_parent: dropZone.tx_container_parent}
      : {};
    const actionData = {
      action: 'paste',
      target: dropZone.target,
      update: {
        colPos: dropZone.colPos,
        ...containerParent,
      },
    };

    let saveOk = false;
    if (data.libraryMode === 'copy' && data.demoUid > 0) {
      dataHandlerStore.addCmd('tt_content', data.demoUid, 'copy', {
        ...actionData,
        update: {...actionData.update, hidden: 0},
      });
      saveOk = await useDataHandler(dataHandlerStore.data, dataHandlerStore.cmdArray);
    } else {
      const newId = 'NEW' + crypto.randomUUID().replaceAll('-', '');
      const payload = dataHandlerStore.data;
      payload.tt_content = payload.tt_content || {};
      payload.tt_content[newId] = {
        pid: dropZone.target,
        CType: data.CType,
        colPos: dropZone.colPos,
        sys_language_uid: window.veInfo.languageId,
        hidden: 0,
        ...containerParent,
      };
      saveOk = await useDataHandler(payload, dataHandlerStore.cmdArray);
    }

    if (!saveOk) {
      return;
    }
    dataHandlerStore.markSaved();
    sendMessage('contentElementAdded', contentAddedFeedback(), 'parent');
    sendMessage('reloadFrames');
  }

  #dropZoneFromPoint(x, y) {
    const leeway = 24;
    let bestZone = null;
    let bestArea = Number.POSITIVE_INFINITY;
    this.#allDropZones().forEach((dropZone) => {
      if (!dropZone.show) {
        return;
      }
      const dropArea = dropZone.shadowRoot?.querySelector('.dropArea.visible');
      if (!dropArea) {
        return;
      }
      const rect = dropArea.getBoundingClientRect();
      if (
        x < rect.left - leeway
        || x > rect.right + leeway
        || y < rect.top - leeway
        || y > rect.bottom + leeway
      ) {
        return;
      }
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        bestZone = dropZone;
      }
    });
    return bestZone;
  }

  #allDropZones() {
    const dropZones = [];
    const visitRoot = (root) => {
      root.querySelectorAll('ve-drop-zone').forEach((dropZone) => dropZones.push(dropZone));
      root.querySelectorAll('*').forEach((element) => {
        if (element.shadowRoot) {
          visitRoot(element.shadowRoot);
        }
      });
    };
    visitRoot(document);
    return dropZones;
  }

  /**
   * Replace the browser's default drag ghost - a generic globe/iframe icon that
   * is often empty when the preview iframe hasn't finished loading - with a small
   * labelled chip (the element's icon + title). This makes the drag read clearly
   * no matter where it started (card, list row, or the big preview) or whether
   * the preview was ready yet. Falls back to the browser default on any error.
   * @param {DragEvent} event
   * @param {Object} item
   */
  #setCustomDragImage(event, item) {
    if (typeof event.dataTransfer.setDragImage !== 'function') {
      return;
    }
    try {
      const ghost = document.createElement('div');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText = [
        'position:fixed', 'top:-1000px', 'left:-1000px', 'z-index:2147483647',
        'display:inline-flex', 'align-items:center', 'gap:8px',
        'padding:7px 13px', 'border-radius:10px',
        'background:rgba(22,22,26,0.94)', 'color:#fff',
        'font:650 13px/1.2 system-ui,-apple-system,sans-serif',
        'white-space:nowrap', 'box-shadow:0 8px 22px rgba(0,0,0,0.35)',
        'pointer-events:none',
      ].join(';');
      if (item.iconUrl) {
        const img = document.createElement('img');
        img.src = item.iconUrl;
        img.style.cssText = 'width:18px;height:18px;flex:none;';
        ghost.appendChild(img);
      }
      const label = document.createElement('span');
      label.textContent = item.title || item.cType;
      ghost.appendChild(label);
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 16, 18);
      // the node only needs to exist at the moment of setDragImage; drop it next tick
      setTimeout(() => ghost.remove(), 0);
    } catch (error) {
      // setDragImage unsupported or blocked - keep the browser default
    }
  }

  /**
   * Remember a cType as recently used (newest first, de-duplicated, capped) and
   * persist it so the "Recently used" section survives reloads and matches the
   * core "new content element" wizard's behaviour.
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
   * Recently-used items in recency order that still exist in the catalog and pass
   * the active category filter. Used only when no search/category filter is on.
   * @return {Array<Object>}
   */
  #recentItems() {
    if (this.recent.length === 0) {
      return [];
    }
    const byCType = new Map(this.items.map((item) => [item.cType, item]));
    return this.recent.map((cType) => byCType.get(cType)).filter(Boolean);
  }

  /**
   * Hide the TYPO3 frontend admin panel inside a (same-origin) preview iframe. It
   * is editor chrome - irrelevant clutter in the library thumbnails and the
   * enlarged preview, and it sits on top of the rendered element. Injected as a
   * stylesheet so it also covers a panel that JS mounts after load.
   * @param {HTMLIFrameElement} iframe
   */
  #hideAdminPanel(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.getElementById('ve-hide-adminpanel')) {
        return;
      }
      const style = doc.createElement('style');
      style.id = 've-hide-adminpanel';
      style.textContent = '#TSFE_ADMIN_PANEL_FORM,.typo3-adminPanel,#typo3-adminPanel,typo3-adminpanel,.t3-adminPanel,#admPanel{display:none!important}';
      (doc.head || doc.documentElement).appendChild(style);
    } catch (error) {
      // cross-origin or detached document - nothing we can (or need to) hide
    }
  }

  /**
   * Card thumbnails ONLY (never the enlarged flyout): make the rendered element
   * read like a compact thumbnail - shrink the root font so the type is
   * "zusammengestaucht", and cut the leading section's top padding to a minimum
   * (desiderio sections ship a big py-16/py-24 that wastes the top of the box).
   * Same-origin preview, so the document is writable; bail on any access error.
   * @param {HTMLIFrameElement} iframe
   */
  #compactPreview(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.getElementById('ve-compact-preview')) {
        return;
      }
      const style = doc.createElement('style');
      style.id = 've-compact-preview';
      style.textContent =
        '.desiderio-section{padding-block:14px!important}' +
        'body>*:first-child{padding-block-start:14px!important}';
      (doc.head || doc.documentElement).appendChild(style);
    } catch (error) {
      // cross-origin or detached - leave the preview untouched
    }
  }

  // --- column / width geometry ----------------------------------------------

  /** Clamp any incoming column value into the supported 1..4 range. */
  #clampColumns(value) {
    return Math.max(1, Math.min(4, parseInt(value, 10) || 2));
  }

  /** Ideal per-column width in px — chosen automatically, no user setting.
   *  4 columns shrink ~15% so the panel doesn't get too wide. The grid uses
   *  minmax(0, 1fr), so columns still shrink below this on narrower screens. */
  #effectiveColWidth() {
    return this.columns === 4 ? Math.round(PREVIEW_DISPLAY_WIDTH * 0.85) : PREVIEW_DISPLAY_WIDTH;
  }

  /** Reference width (px) used only to size the panel for the compact list; the
   *  list itself is responsive (CSS clamp) and adapts to the screen. */
  #listWidth() {
    return 340;
  }

  /** Target width (px) of the docked preview pane; it then flexes to fill the
   *  whole space left of the list. */
  #dockTarget() {
    return Math.max(560, Math.round(PREVIEW_DISPLAY_WIDTH * 1.9));
  }

  /** Computed panel width in px (before the 94vw cap applied in CSS). */
  #panelWidth() {
    const gap = 18;
    const padding = 40; // 20px each side of .grid
    if (this.columns === 1) {
      // single-column "small" mode: a compact list beside a preview pane that
      // fills the rest. Use (almost) the whole canvas so the docked preview is as
      // large as possible and grows with the screen (the CSS min(..,94vw) caps it
      // to the viewport; 1900 only limits ultra-wide screens).
      return 1900;
    }
    return this.columns * this.#effectiveColWidth() + (this.columns - 1) * gap + padding;
  }

  /** Card height in px: a preview-dominant box plus header + keyword band. */
  #cardHeight() {
    return Math.round(this.#effectiveColWidth() * 0.62) + 104;
  }

  /**
   * Constant geometry for the enlarged preview flyout. It uses (almost) the WHOLE
   * canvas width - a transient overlay that may cover the panel while open -
   * right-aligned to the viewport, capped at the native render width so it stays
   * crisp. Width is the same for every element; only the vertical position tracks
   * the hovered card.
   * @return {{width: number, right: number}}
   */
  #flyoutGeometry() {
    const margin = 12;
    const width = Math.max(320, Math.min(window.innerWidth - margin * 2, PREVIEW_RENDER_WIDTH));
    return {width: Math.round(width), right: margin};
  }

  // --- lazy preview loading -------------------------------------------------

  updated() {
    // Thumbnail iframes exist only in multi-column grid mode. Single-column
    // mode uses one docked preview iframe, loaded directly by #renderPreview().
    if (this.columns === 1) {
      this.observer?.disconnect();
      this.observer = null;
      this.gridElement = null;
      this.previewQueue = [];
      this.loadingPreviews.clear();
      this.previewInFlight = 0;
      return;
    }

    // The scroll container is the grid; it holds [data-ctype] cards whose
    // previews load lazily as they scroll into view.
    const grid = this.shadowRoot.querySelector('.grid');
    if (!grid) {
      this.observer?.disconnect();
      this.observer = null;
      this.gridElement = null;
      return;
    }
    if (grid !== this.gridElement) {
      this.observer?.disconnect();
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.#enqueuePreview(entry.target.dataset.ctype);
          }
        }
      }, {root: grid, rootMargin: '300px 0px'});
      this.gridElement = grid;
    } else {
      this.observer?.disconnect();
    }
    const tiles = Array.from(grid.querySelectorAll('[data-ctype]'));
    this.#syncPreviewLoader(tiles);
    tiles.forEach((tile) => this.observer.observe(tile));
    this.#primeVisiblePreviews(grid, tiles);
  }

  #syncPreviewLoader(tiles) {
    const currentTypes = new Set(tiles.map((tile) => tile.dataset.ctype).filter(Boolean));
    this.previewQueue = this.previewQueue.filter((cType) => currentTypes.has(cType) && !this.loadedPreviews.has(cType));
    let changed = false;
    for (const cType of Array.from(this.loadingPreviews)) {
      if (!currentTypes.has(cType)) {
        this.loadingPreviews.delete(cType);
        changed = true;
      }
    }
    if (changed) {
      this.previewInFlight = this.loadingPreviews.size;
    }
  }

  #primeVisiblePreviews(grid, tiles) {
    const rootRect = grid.getBoundingClientRect();
    const margin = 300;
    const visibleTypes = [];
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      if (rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin) {
        visibleTypes.push(tile.dataset.ctype);
      }
    }
    for (let i = visibleTypes.length - 1; i >= 0; i--) {
      this.#enqueuePreview(visibleTypes[i], true, false);
    }
    this.#pumpPreviews();
  }

  #enqueuePreview(cType, priority = false, pump = true) {
    if (!cType || this.loadedPreviews.has(cType)) {
      return;
    }
    if (this.previewQueue.includes(cType)) {
      if (priority) {
        this.previewQueue = [cType, ...this.previewQueue.filter((entry) => entry !== cType)];
      }
      return;
    }
    priority ? this.previewQueue.unshift(cType) : this.previewQueue.push(cType);
    if (pump) {
      this.#pumpPreviews();
    }
  }

  #pumpPreviews() {
    while (this.loadingPreviews.size < MAX_CONCURRENT_PREVIEWS && this.previewQueue.length > 0) {
      const cType = this.previewQueue.shift();
      if (this.loadedPreviews.has(cType)) {
        continue;
      }
      this.loadingPreviews.add(cType);
      this.previewInFlight = this.loadingPreviews.size;
      const next = new Set(this.loadedPreviews);
      next.add(cType);
      this.loadedPreviews = next; // triggers re-render -> iframe with src appears
    }
  }

  /**
   * @param {Event} event iframe load event
   */
  #onPreviewLoad(event, cType) {
    this.#hideAdminPanel(event.target);
    this.#compactPreview(event.target);
    this.#fitPreview(event.target);
    this.#onPreviewSettled(cType);
  }

  /**
   * Zoom the WHOLE element out so it fits the thumbnail box - a complete
   * "Gesamteindruck" even when small. The element is rendered at a fixed desktop
   * width (PREVIEW_RENDER_WIDTH) and scaled down by the smaller of the width- and
   * height-fit, then centred. Never upscale past 1:1.
   * @param {HTMLIFrameElement} iframe
   */
  #fitPreview(iframe) {
    let contentHeight = 0;
    try {
      const body = iframe.contentDocument && iframe.contentDocument.body;
      if (body) {
        contentHeight = body.scrollHeight || Math.round(body.getBoundingClientRect().height);
      }
    } catch (error) {
      return;
    }
    if (contentHeight < 20) {
      return;
    }
    const box = iframe.closest('.preview');
    const boxW = box?.clientWidth || this.#effectiveColWidth();
    const boxH = box?.clientHeight || PREVIEW_BOX_HEIGHT;
    const scale = Math.min(1, boxW / PREVIEW_RENDER_WIDTH, boxH / contentHeight);
    iframe.style.width = PREVIEW_RENDER_WIDTH + 'px';
    iframe.style.height = contentHeight + 'px';
    iframe.style.transform = `scale(${scale})`;
    iframe.style.left = Math.round((boxW - PREVIEW_RENDER_WIDTH * scale) / 2) + 'px';
    iframe.style.top = Math.round(Math.max(0, (boxH - contentHeight * scale) / 2)) + 'px';
  }

  #onPreviewSettled(cType = '') {
    if (cType) {
      this.loadingPreviews.delete(cType);
    } else {
      const first = this.loadingPreviews.values().next();
      if (!first.done) {
        this.loadingPreviews.delete(first.value);
      }
    }
    this.previewInFlight = this.loadingPreviews.size;
    this.#pumpPreviews();
  }

  // --- enlarged preview flyout ----------------------------------------------

  /**
   * Selects the item shown in the big preview. In single-column mode this is the
   * docked pane on the left (hover/focus driven); in multi-column mode it opens
   * the centred overlay (triggered by the per-card preview button).
   * @param {Object} item
   */
  #openPreview(item) {
    this.#cancelClosePreview();
    this.previewItem = item;
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
    this.previewItem = null;
  }

  /**
   * Sizes the flyout once its iframe has loaded: render the element scaled to the
   * space left of the anchored card so the whole element fits without a
   * scrollbar, then nudge the flyout vertically so it never overflows the screen.
   * @param {Event} event iframe load event
   */
  #onFlyoutLoad(event) {
    const iframe = event.target;
    this.#hideAdminPanel(iframe);
    const stage = iframe.closest('.previewStage');
    let contentHeight = 0;
    try {
      const body = iframe.contentDocument && iframe.contentDocument.body;
      if (body) {
        contentHeight = body.scrollHeight || Math.round(body.getBoundingClientRect().height);
      }
    } catch (error) {
      // keep the CSS fallback size
    }
    if (contentHeight < 20) {
      contentHeight = Math.round(PREVIEW_RENDER_WIDTH * 0.5);
    }

    const flyout = iframe.closest('.previewFlyout');
    // The stage width is FIXED (CSS 100% of the container); the element fills it.
    const stageWidth = (stage && stage.clientWidth) ? stage.clientWidth : this.#flyoutGeometry().width;
    // Cap the stage so the WHOLE preview (header + stage + description) fits its
    // container height: the docked pane in single-column mode, else the viewport
    // for the centred overlay. A very tall element is shrunk to fit (centred in
    // the constant-width stage) so it stays fully visible without inner scroll.
    const dockEl = iframe.closest('.dock');
    const availHeight = dockEl ? dockEl.clientHeight : window.innerHeight;
    const headerH = flyout?.querySelector('.previewHead')?.offsetHeight || 44;
    const captionH = flyout?.querySelector('.previewCaption')?.offsetHeight || 0;
    const stageBudget = Math.max(140, availHeight - 28 - headerH - captionH);
    const fitWidthScale = stageWidth / PREVIEW_RENDER_WIDTH;
    const fullHeight = contentHeight * fitWidthScale;
    let scale;
    let stageHeight;
    if (fullHeight <= stageBudget) {
      scale = fitWidthScale;
      stageHeight = fullHeight;
    } else {
      scale = stageBudget / contentHeight;
      stageHeight = stageBudget;
    }

    if (stage) {
      stage.style.height = Math.round(stageHeight) + 'px'; // width stays constant (CSS 100%)
      stage.classList.add('loaded');
    }
    iframe.style.height = contentHeight + 'px';
    iframe.style.transform = `translateX(-50%) scale(${scale})`;
    iframe.classList.add('ready');
  }

  // --- rendering ------------------------------------------------------------

  #renderPreviewDragGhost() {
    const ghost = this.previewDragGhost;
    if (!ghost) {
      return '';
    }
    const status = ghost.canDrop
      ? (lll('frontend.library.dragGhost.drop') || 'Release to insert')
      : (lll('frontend.library.dragGhost.move') || 'Move to a highlighted drop zone');
    const ghostStyle = `transform: translate3d(${ghost.left}px, ${ghost.top}px, 0) scale(${ghost.canDrop ? 1.03 : 1});`;
    return html`
      <div class=${classMap({previewDragGhost: true, 'can-drop': ghost.canDrop})}
           style="${ghostStyle}" aria-hidden="true">
        <span class="previewDragGhostIcon">
          ${ghost.iconUrl
            ? html`<img src="${ghost.iconUrl}" alt="" />`
            : html`<span class="previewDragGhostFallback">+</span>`}
        </span>
        <span class="previewDragGhostBody">
          <strong class="previewDragGhostTitle">${ghost.title}</strong>
          <span class="previewDragGhostStatus">${status}</span>
        </span>
      </div>
    `;
  }

  render() {
    if (!this.open) {
      return html``;
    }

    const filtered = this.#visibleItems();
    const onePane = this.columns === 1;
    const effW = this.#effectiveColWidth();
    const panelStyle =
      `width: min(${this.#panelWidth()}px, 94vw);` +
      `--ve-cols: ${onePane ? 1 : this.columns};` +
      `--ve-preview-width: ${effW}px;` +
      `--ve-list-width: ${this.#listWidth()}px;` +
      `--ve-card-height: ${this.#cardHeight()}px;`;
    const panelClasses = {panel: true, collapsed: this.collapsed, 'panel--single': onePane};
    const hasFilters = this.selectedGroups.size > 0 || this.searchTerm.trim() !== '';
    // In single-column mode the docked pane always shows something: the hovered
    // item, else the first item in the list.
    const dockItem = onePane ? (this.previewItem || filtered[0] || null) : null;

    return html`
      ${this.#renderPreviewDragGhost()}
      <div class=${classMap(panelClasses)} part="panel" style="${panelStyle}">
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
                <h2>${lll('frontend.library.title') || 'Add content'}</h2>
                <span class="counter"><strong>${filtered.length}</strong> / ${this.items.length}</span>
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
                @input="${this.#onSearchInput}"
              />
            </div>
          </div>

          ${this.#renderSuggestions()}

          <div class="chips">
            ${hasFilters ? html`
              <button type="button" class="chip chip--clear" @click="${this.#clearFilters}">
                ${lll('frontend.library.allCategories') || 'All'}
              </button>` : ''}
            ${this.categories.map((category) => html`
              <button
                type="button"
                class="chip ${this.selectedGroups.has(category) ? 'active' : ''}"
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
   * The scrollable element list: status messages, then (when no search/category
   * filter is active) a "Recently used" section on top followed by the rest.
   * @param {Array<Object>} filtered
   */
  #renderList(filtered) {
    if (this.loading) {
      return html`<div class="status"><span class="spinner"></span>${lll('frontend.library.loading') || 'Loading …'}</div>`;
    }
    if (this.error) {
      return html`<p class="status error">${this.error}</p>`;
    }
    if (filtered.length === 0) {
      return html`<p class="status">${lll('frontend.library.empty') || 'No elements match the current filter.'}</p>`;
    }

    const showRecent = this.searchTerm.trim() === '' && this.selectedGroups.size === 0;
    const recentItems = showRecent ? this.#recentItems() : [];
    const recentSet = new Set(recentItems.map((item) => item.cType));
    const rest = recentItems.length ? filtered.filter((item) => !recentSet.has(item.cType)) : filtered;

    return html`
      ${recentItems.length ? html`
        <div class="sectionHead" role="presentation">
          <svg class="sectionIcon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/>
          </svg>
          <span>${lll('frontend.library.recentlyUsed') || 'Recently used'}</span>
          <span class="sectionCount">${recentItems.length}</span>
        </div>
        ${repeat(recentItems, (item) => 'recent-' + item.cType, (item) => this.#renderCard(item))}
      ` : ''}
      ${recentItems.length && rest.length ? html`
        <div class="sectionHead" role="presentation">
          <span>${lll('frontend.library.allElements') || 'All elements'}</span>
          <span class="sectionCount">${rest.length}</span>
        </div>` : ''}
      ${repeat(rest, (item) => item.cType, (item) => this.#renderCard(item))}
    `;
  }

  /** Placeholder shown in the docked preview pane before any item is chosen. */
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
   * The big rendered preview. mode = 'docked' (single-column: an in-flow pane to
   * the left of the list) or 'modal' (multi-column: a centred overlay over a
   * backdrop that dismisses on click / ✕ / Escape).
   * @param {('docked'|'modal')} mode
   * @param {Object} item
   */
  #renderPreview(mode, item) {
    const previewLabel = lll('frontend.library.preview') || 'Preview';
    const closeLabel = lll('frontend.library.closePreview') || 'Close preview';
    const isModal = mode === 'modal';
    const dragHint = lll('frontend.library.dragHint') || 'Drag onto the page';
    // The whole preview is a drag source (just like a card/row): the grip in the
    // header signals it, and dragging it inserts this element. Starting the drag
    // collapses the panel / closes the overlay via #onDragInProgressChange so the
    // drop zones underneath are reachable.
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
      // (backdrop or chrome) falls through to here and closes it — the requested
      // "click the preview to close" behaviour; the ✕ and Escape also close.
      return html`
        <div class="previewModal ${this.dragging ? 'dragging' : ''}" part="preview" @click="${this.#closePreview}">
          ${inner}
        </div>`;
    }
    return html`<div class="previewDock" part="preview">${inner}</div>`;
  }

  #renderCard(item) {
    // Drop a keyword that just repeats the title (e.g. "3 spaltiges feature
    // raster") - it is redundant with the title above and wastes a whole row, so
    // a short, useful keyword leads instead.
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const keywords = (item.keywords || [])
      .filter((keyword) => keyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== titleKey)
      .slice(0, 10);

    const grip = html`
      <svg class="grabGrip" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor">
        <circle cx="6" cy="3.5" r="1.3"/><circle cx="10" cy="3.5" r="1.3"/>
        <circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/>
        <circle cx="6" cy="12.5" r="1.3"/><circle cx="10" cy="12.5" r="1.3"/>
      </svg>`;

    // Single-column mode: a compact list row showing the element's top keywords
    // (no per-row preview iframe - those were slow to load). The big docked pane
    // on the left renders the hovered/focused element's preview instead.
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

    // Multi-column mode: thumbnail card; clicking the thumbnail or the loupe
    // opens the centred overlay preview.
    const previewLoaded = this.loadedPreviews.has(item.cType);
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
                          @load="${(event) => this.#onPreviewLoad(event, item.cType)}" @error="${() => this.#onPreviewSettled(item.cType)}"></iframe>
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
            ${grip}
            ${lll('frontend.library.dragHint') || 'Drag onto the page'}
          </span>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font-family: var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
      font-size: 14px;
      line-height: 1.4;
      --ve-accent: var(--ve-accent-color, #7c5ac4);
      --ve-accent-contrast: #ffffff;
      --ve-accent-readable: color-mix(in srgb, var(--ve-accent) 78%, var(--ve-panel-text));
      --ve-card-radius: 14px;
      --ve-panel-bg: #f4f4f6;
      --ve-panel-surface: #ffffff;
      --ve-panel-border: #e3e3e8;
      --ve-panel-text: #1b1b1f;
      --ve-panel-muted: #6c6c78;
    }

    :host-context(.dark) {
      --ve-panel-bg: #16161a;
      --ve-panel-surface: #222228;
      --ve-panel-border: #34343c;
      --ve-panel-text: #f3f3f5;
      --ve-panel-muted: #a2a2ad;
      --ve-accent-readable: color-mix(in srgb, var(--ve-accent) 42%, var(--ve-panel-text));
    }

    .panel {
      position: fixed;
      inset-block: 12px;
      right: 12px;
      width: min(600px, 94vw);
      display: flex;
      flex-direction: column;
      background: var(--ve-panel-bg);
      color: var(--ve-panel-text);
      border: 1.5px solid color-mix(in srgb, var(--ve-accent) 65%, var(--ve-panel-border));
      border-radius: var(--typo3-component-border-radius, 0.75em); overflow: hidden;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34), 0 0 0 1px color-mix(in srgb, var(--ve-accent) 16%, transparent);
      z-index: 100000;
      transform: translateX(0);
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      animation: panelIn 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes panelIn {
      from { transform: translateX(40px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .panel.collapsed { transform: translateX(calc(100% + 20px)); box-shadow: none; }

    .previewDragGhost {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 2147483647;
      pointer-events: none;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 10px;
      width: max-content;
      max-width: min(336px, calc(100vw - 24px));
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(22, 22, 26, 0.96);
      color: #fff;
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.08);
      font: 600 13px/1.25 var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
      transform-origin: top left;
      transition: transform 0.08s linear, border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
      will-change: transform;
    }
    .previewDragGhost.can-drop {
      border-color: rgba(255, 255, 255, 0.72);
      background: rgba(32, 32, 38, 0.98);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38), 0 0 0 3px rgba(255, 255, 255, 0.26);
    }
    .previewDragGhostIcon {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ve-accent);
      color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    }
    .previewDragGhostIcon img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      display: block;
    }
    .previewDragGhostFallback {
      font-size: 22px;
      font-weight: 750;
      line-height: 1;
    }
    .previewDragGhostBody {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .previewDragGhostTitle {
      display: block;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
    }
    .previewDragGhostStatus {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(255, 255, 255, 0.72);
      font-size: 11px;
      font-weight: 650;
    }
    .previewDragGhost.can-drop .previewDragGhostStatus { color: #fff; }

    .header {
      padding: 16px 20px 14px;
      border-bottom: 1px solid var(--ve-panel-border);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--ve-accent) 14%, var(--ve-panel-bg)), var(--ve-panel-bg));
    }

    .headerRow { display: flex; align-items: center; justify-content: space-between; }
    .titleWrap { display: flex; align-items: center; gap: 12px; }
    .titleBadge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      color: var(--ve-accent-contrast);
      background: linear-gradient(135deg, var(--ve-accent), color-mix(in srgb, var(--ve-accent) 65%, #000));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .titleText { display: flex; flex-direction: column; gap: 1px; line-height: 1.15; }
    h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .counter { font-size: 12.5px; font-weight: 600; color: var(--ve-panel-muted); letter-spacing: 0.01em; }
    .counter strong { color: color-mix(in srgb, var(--ve-accent) 35%, var(--ve-panel-text)); font-weight: 750; }

    .searchRow { display: flex; align-items: center; gap: 8px; }
    .searchRow .searchWrap { flex: 1 1 auto; min-width: 0; }
    .searchWrap { position: relative; display: flex; align-items: center; }
    .searchIcon { position: absolute; left: 12px; color: var(--ve-panel-muted); pointer-events: none; }
    .search {
      width: 100%; box-sizing: border-box;
      padding: 11px 12px 11px 40px; border-radius: 10px;
      border: 1px solid var(--ve-panel-border); background: var(--ve-panel-surface);
      color: var(--ve-panel-text); font-size: 14px; outline: none;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .search:focus { border-color: var(--ve-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ve-accent) 30%, transparent); }
    .search::placeholder { color: var(--ve-panel-muted); }

    /* "did you mean" + autocomplete suggestion chips under the search box */
    .suggestRow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .didYouMean { font-size: 12.5px; color: var(--ve-panel-muted); }
    .suggLink {
      background: none; border: none; padding: 0; cursor: pointer;
      font: inherit; font-weight: 700; color: var(--ve-accent-readable); text-decoration: underline;
    }
    .suggChip {
      border: 1px dashed color-mix(in srgb, var(--ve-accent) 50%, var(--ve-panel-border));
      background: color-mix(in srgb, var(--ve-accent) 8%, var(--ve-panel-surface));
      color: var(--ve-panel-text); border-radius: 999px; padding: 3px 11px;
      font-size: 12px; cursor: pointer; transition: all 0.12s ease;
    }
    .suggChip:hover { border-style: solid; border-color: var(--ve-accent); }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      border: 1px solid var(--ve-panel-border); background: var(--ve-panel-surface);
      color: var(--ve-panel-muted); border-radius: 999px; padding: 5px 13px;
      font-size: 12.5px; cursor: pointer; transition: all 0.12s ease; text-transform: capitalize;
    }
    .chip:hover { border-color: color-mix(in srgb, var(--ve-accent) 60%, var(--ve-panel-border)); color: var(--ve-panel-text); }
    .chip.active {
      background: var(--ve-accent); border-color: var(--ve-accent); color: var(--ve-accent-contrast);
      box-shadow: 0 2px 10px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .chip--clear { font-weight: 650; color: var(--ve-panel-text); }

    .grid {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(var(--ve-cols, 2), minmax(0, 1fr));
      /* Section headers are grid items too; fixed auto-rows made them reserve a
         full card-height row and pushed the first content row too far down. */
      grid-auto-rows: auto;
      gap: 18px; padding: 18px 20px 28px; align-content: start;
      scrollbar-width: thin; scrollbar-color: var(--ve-panel-border) transparent;
      scroll-snap-type: y mandatory;
      scroll-padding-block-start: 18px;
    }
    .grid::-webkit-scrollbar { width: 10px; }
    .grid::-webkit-scrollbar-thumb { background: var(--ve-panel-border); border-radius: 999px; border: 3px solid var(--ve-panel-bg); }

    .status {
      grid-column: 1 / -1; color: var(--ve-panel-muted); text-align: center;
      margin: 36px 0; display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .status.error { color: #ff8484; }
    .spinner {
      width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid var(--ve-panel-border); border-top-color: var(--ve-accent);
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      position: relative; background: var(--ve-panel-surface); color: var(--ve-panel-text);
      border-radius: var(--ve-card-radius); overflow: hidden; cursor: grab;
      border: 1px solid color-mix(in srgb, var(--ve-panel-text) 22%, var(--ve-panel-border));
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      display: flex; flex-direction: column;
      height: var(--ve-card-height, 330px);
      scroll-snap-align: start;
      transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s ease, border-color 0.16s ease;
      animation: cardIn 0.3s ease backwards;
    }
    @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .card:hover {
      border-color: color-mix(in srgb, var(--ve-accent) 65%, var(--ve-panel-border));
      transform: translateY(-3px);
      box-shadow: 0 10px 26px color-mix(in srgb, var(--ve-accent) 18%, rgba(0, 0, 0, 0.30)),
                  0 0 0 1px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .card:focus-within {
      border-color: var(--ve-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .card:active { cursor: grabbing; }
    .card.is-dragging { opacity: 0.4; transform: scale(0.96) rotate(-1deg); }

    /* preview is the last row: it fills whatever height the card has left under
       the header / keyword band, and rounds the card's BOTTOM corners */
    .preview {
      position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
      background-color: color-mix(in srgb, var(--ve-accent) 6%, var(--ve-panel-bg));
      background-image: radial-gradient(color-mix(in srgb, var(--ve-accent) 17%, transparent) 1px, transparent 1.4px);
      background-size: 11px 11px;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ve-accent) 14%, transparent);
      border-bottom-left-radius: calc(var(--ve-card-radius) - 1px);
      border-bottom-right-radius: calc(var(--ve-card-radius) - 1px);
      cursor: zoom-in;
    }
    .preview iframe {
      position: absolute; top: 0; left: 0;
      width: ${PREVIEW_RENDER_WIDTH}px; height: 900px; border: 0;
      transform-origin: top left;
      pointer-events: none; animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .previewOverlay { position: absolute; inset: 0; }
    .previewPlaceholder {
      display: flex; align-items: center; justify-content: center; height: 100%;
      color: var(--ve-panel-muted); font-size: 13px; position: relative; overflow: hidden;
      background: linear-gradient(135deg, color-mix(in srgb, var(--ve-panel-bg) 55%, var(--ve-panel-surface)), var(--ve-panel-bg));
    }
    .previewPlaceholder img { width: 52px; height: 52px; opacity: 0.8; }
    .previewPlaceholder span:not(.shimmer) { padding: 0 16px; text-align: center; }
    .shimmer {
      position: absolute; inset: 0;
      background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--ve-panel-surface) 65%, transparent) 50%, transparent 70%);
      transform: translateX(-100%); animation: shimmer 1.4s infinite;
    }
    @keyframes shimmer { to { transform: translateX(100%); } }

    .grabHint {
      position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%) translateY(8px);
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(22, 22, 26, 0.92); color: #fff; font-size: 11px; font-weight: 600;
      padding: 5px 11px 5px 9px; border-radius: 999px; opacity: 0; pointer-events: none;
      transition: opacity 0.16s ease, transform 0.16s ease; white-space: nowrap;
    }
    .card:hover .grabHint { opacity: 1; transform: translateX(-50%) translateY(0); }
    .grabHint .grabGrip { flex-shrink: 0; opacity: 0.85; }
    .card:hover .grabHint .grabGrip { animation: veGrabGrip 2.2s ease-in-out infinite; }
    @keyframes veGrabGrip { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }

    /* category eyebrow sits ABOVE the title */
    .cardHead {
      flex-shrink: 0;
      display: flex; flex-direction: column; align-items: flex-start;
      text-align: left; gap: 5px;
      padding: 11px 16px 8px;
    }
    .cardCategory { margin-bottom: 1px; }

    .previewLoupe {
      position: absolute; z-index: 4; top: 8px; right: 8px;
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; padding: 0;
      border: none; border-radius: 999px;
      background: rgba(22, 22, 26, 0.55); color: #fff;
      -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      box-shadow: none;
      cursor: zoom-in;
      opacity: 0; transform: translateY(-4px) scale(0.96);
      transition: opacity 0.16s ease, transform 0.16s ease, background 0.12s ease;
    }
    .card:hover .previewLoupe,
    .card:focus-within .previewLoupe { opacity: 1; transform: translateY(0) scale(1); }
    .previewLoupe:hover { background: rgba(22, 22, 26, 0.72); transform: translateY(0) scale(1.08); }
    .previewLoupe:focus-visible { opacity: 1; transform: translateY(0); outline: 2px solid #fff; outline-offset: 2px; }

    .cardTitle {
      max-width: 100%;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      font-size: 14.5px; font-weight: 700; line-height: 1.22; letter-spacing: -0.01em;
    }

    /* keyword chips replace the prose description: a dense, scannable band that
       caps at ~2 rows so the preview stays the hero. Lightweight (not bold) and
       compact to save space. The full keyword + synonym set is in the flyout. */
    .cardKeywords {
      flex-shrink: 0;
      display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start;
      padding: 0 16px 14px;
      max-height: 3.7em; overflow: hidden;
    }
    .kw {
      display: inline-flex; align-items: center;
      font-size: 10.5px; font-weight: 400; line-height: 1.3; white-space: nowrap;
      padding: 1px 7px; border-radius: 999px;
      /* neutral, no accent tint - just a hairline outline that follows light/dark */
      background: transparent;
      border: 1px solid var(--ve-panel-border);
      color: color-mix(in srgb, var(--ve-panel-text) 72%, var(--ve-panel-muted));
    }

    .pill {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
      font-size: 10.5px; font-weight: 650; line-height: 1.45;
      padding: 2px 8px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 50%, transparent);
      background: transparent;
    }
    .pill svg { width: 12px; height: 12px; flex-shrink: 0; }
    .badge { color: var(--ve-accent-readable); text-transform: capitalize; }

    /* enlarged preview flyout: hover-opened, anchored to the left of the card it
       belongs to (top/right set inline from the card rect). Read-only. */
    .previewFlyoutWrap {
      position: fixed; top: 12px; z-index: 100001;
      right: 12px;
      max-width: 96vw; max-height: calc(100vh - 24px);
      animation: vePreviewIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes vePreviewIn { from { opacity: 0; } to { opacity: 1; } }

    .previewFlyout {
      display: flex; flex-direction: column;
      max-width: 96vw; max-height: calc(100vh - 24px);
      background: var(--ve-panel-surface); color: var(--ve-panel-text);
      border: 1.5px solid color-mix(in srgb, var(--ve-accent) 55%, var(--ve-panel-border));
      border-radius: var(--ve-card-radius); overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px color-mix(in srgb, var(--ve-accent) 22%, transparent);
    }

    .previewHead {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 13px; flex-shrink: 0;
      border-bottom: 1px solid var(--ve-panel-border);
      background: linear-gradient(180deg, color-mix(in srgb, var(--ve-accent) 12%, var(--ve-panel-surface)), var(--ve-panel-surface));
    }
    .previewEyebrow {
      flex-shrink: 0;
      font-size: 10px; font-weight: 700; line-height: 1;
      letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--ve-accent-readable);
    }
    .previewHead .previewTitle { flex: 1 1 auto; }

    /* fixed width (fills the constant-width flyout); height set by JS on load */
    .previewStage {
      position: relative; overflow: hidden; background: var(--ve-panel-bg);
      width: 100%; height: 40vh;
      transition: height 0.2s ease;
    }
    .previewStage .previewSpinner { position: absolute; top: 50%; left: 50%; margin: -9px 0 0 -9px; }
    .previewStage.loaded .previewSpinner { display: none; }
    .previewFrame {
      position: absolute; top: 0; left: 50%;
      width: ${PREVIEW_RENDER_WIDTH}px; height: 1400px; border: 0;
      transform-origin: top center;
      transform: translateX(-50%) scale(calc(${PREVIEW_DISPLAY_WIDTH} * ${PREVIEW_ZOOM_FACTOR} / ${PREVIEW_RENDER_WIDTH}));
      pointer-events: none; opacity: 0; transition: opacity 0.2s ease;
    }
    .previewFrame.ready { opacity: 1; }

    .previewCaption {
      display: flex; flex-direction: column; gap: 8px;
      padding: 9px 13px 11px; flex-shrink: 0;
      border-top: 1px solid var(--ve-panel-border);
      background: linear-gradient(0deg, color-mix(in srgb, var(--ve-accent) 8%, var(--ve-panel-surface)), var(--ve-panel-surface));
      max-height: 26vh; overflow-y: auto;
    }
    .previewTitle { font-size: 13.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .previewDesc {
      margin: 0; font-size: 12px; line-height: 1.5;
      color: color-mix(in srgb, var(--ve-panel-text) 74%, var(--ve-panel-muted));
    }

    /* ---- section headers (Recently used / All elements) ---- */
    .sectionHead {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 7px;
      margin: 6px 2px 0; padding: 2px 2px 5px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--ve-panel-muted);
    }
    .sectionHead:first-child { margin-top: 0; }
    .vlist .sectionHead { flex: 0 0 auto; margin-top: 2px; padding-bottom: 2px; }
    .sectionIcon { flex-shrink: 0; }
    .sectionCount {
      font-weight: 650; color: var(--ve-accent-readable); letter-spacing: 0;
      background: color-mix(in srgb, var(--ve-accent) 13%, transparent);
      border-radius: 999px; padding: 0 7px; font-size: 10.5px;
    }

    /* ---- single-column workarea: flexible docked preview + fixed list ---- */
    .workarea { flex: 1 1 auto; min-height: 0; display: flex; }
    /* the preview pane takes ALL the space left of the (fixed-width) list */
    .dock {
      flex: 1 1 auto; min-width: 0;
      border-right: 1px solid var(--ve-panel-border); background: var(--ve-panel-bg);
      overflow: hidden; display: flex; flex-direction: column;
    }
    .dockEmpty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 24px; text-align: center; color: var(--ve-panel-muted); font-size: 13px;
    }
    /* fixed-width compact list of element titles - a plain flex column, NOT the
       card grid, so it never inherits the grid's row sizing or scroll-snap */
    .vlist {
      /* responsive: ~34% of the workarea, clamped, so it shrinks/grows with the
         panel (which itself is capped at 94vw) across screen sizes */
      flex: 0 0 clamp(240px, 34%, var(--ve-list-width, 340px)); min-width: 0;
      overflow-y: auto; overflow-x: hidden;
      display: flex; flex-direction: column; gap: 7px; padding: 14px;
      scrollbar-width: thin; scrollbar-color: var(--ve-panel-border) transparent;
      /* snap each row to the top of the list as you scroll */
      scroll-snap-type: y proximity; scroll-padding-block-start: 14px;
    }
    .vlist::-webkit-scrollbar { width: 10px; }
    .vlist::-webkit-scrollbar-thumb { background: var(--ve-panel-border); border-radius: 999px; border: 3px solid var(--ve-panel-bg); }
    .lrow {
      flex: 0 0 auto;
      scroll-snap-align: start;
      display: flex; flex-direction: column; align-items: stretch; gap: 8px;
      padding: 10px 11px 11px; cursor: grab;
      border: 1px solid color-mix(in srgb, var(--ve-panel-text) 18%, var(--ve-panel-border));
      border-radius: 11px; background: var(--ve-panel-surface); color: var(--ve-panel-text);
      transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
    }
    .lrow:hover { border-color: color-mix(in srgb, var(--ve-accent) 60%, var(--ve-panel-border)); }
    .lrow:focus-visible { outline: 2px solid var(--ve-accent); outline-offset: 2px; }
    .lrow:active { cursor: grabbing; }
    .lrow.is-dragging { opacity: 0.4; }
    .lrow.is-active {
      border-color: var(--ve-accent);
      background: color-mix(in srgb, var(--ve-accent) 12%, var(--ve-panel-surface));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    /* top keywords on each row (no per-row preview iframe; the docked pane shows
       the rendered preview on hover) */
    .lrowKeywords {
      order: 2; display: flex; flex-wrap: wrap; gap: 4px;
      align-content: flex-start; max-height: 42px; overflow: hidden;
    }
    .lrowKeywords .kw { flex: none; }
    /* keep keyword chips legible on the accent-tinted hover/active row: a solid
       surface fill + a stronger border, both following light/dark via the vars */
    .lrow:hover .kw,
    .lrow.is-active .kw {
      background: var(--ve-panel-surface);
      border-color: color-mix(in srgb, var(--ve-panel-text) 32%, var(--ve-panel-border));
    }
    .lrowBody { order: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .lrowCat { align-self: flex-start; }
    .lrowTitle {
      font-size: 13.5px; font-weight: 700; line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .lrowGrip { flex-shrink: 0; display: inline-flex; color: var(--ve-panel-muted); opacity: 0.5; transition: opacity 0.12s ease; }
    .lrow:hover .lrowGrip { opacity: 1; }

    /* ---- docked preview pane (single-column mode) ---- */
    .previewDock { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 12px; }
    /* fill the whole dock so the preview uses all the available space */
    .previewFlyout--docked { width: 100%; height: 100%; }

    /* ---- overlay preview (multi-column mode) ---- */
    .previewModal {
      position: fixed; inset: 0; z-index: 100002;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      background: rgba(12, 12, 16, 0.55);
      -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
      cursor: zoom-out; animation: veModalIn 0.16s ease;
    }
    @keyframes veModalIn { from { opacity: 0; } to { opacity: 1; } }
    /* while dragging the preview out, keep it in the DOM (so the drag survives)
       but invisible and click-through so the drop zones underneath are usable */
    .previewModal.dragging { opacity: 0; pointer-events: none; }
    .previewFlyout--modal {
      width: min(1600px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
      animation: veModalPop 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes veModalPop { from { transform: translateY(10px) scale(0.985); opacity: 0; } to { transform: none; opacity: 1; } }
    .previewClose {
      margin-left: 4px; flex-shrink: 0; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; padding: 0;
      border: 1px solid var(--ve-panel-border); border-radius: 999px;
      background: var(--ve-panel-bg); color: var(--ve-panel-text);
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
    }
    .previewClose:hover { background: var(--ve-accent); color: var(--ve-accent-contrast); border-color: var(--ve-accent); }
    .previewClose:focus-visible { outline: 2px solid var(--ve-accent); outline-offset: 2px; }

    /* the big preview is itself a drag source */
    .previewFlyout[draggable="true"] { cursor: grab; }
    .previewFlyout[draggable="true"]:active { cursor: grabbing; }
    /* prominent drag affordance at the foot of the preview: grip + label + a
       gently pulsing arrow that reads as "drag this onto the page" */
    .previewDrag {
      flex-shrink: 0;
      display: flex; align-items: center; gap: 9px;
      padding: 9px 13px;
      border-top: 1px solid var(--ve-panel-border);
      background: color-mix(in srgb, var(--ve-accent) 11%, var(--ve-panel-surface));
      color: var(--ve-accent-readable);
      font-size: 12px; font-weight: 650; cursor: grab; user-select: none;
    }
    .previewDragGrip { flex-shrink: 0; display: inline-flex; opacity: 0.75; }
    .previewDragLabel { flex: 1 1 auto; min-width: 0; }
    .previewDragArrow { flex-shrink: 0; order: -1; display: inline-flex; animation: vePreviewDragArrow 1.4s ease-in-out infinite; }
    @keyframes vePreviewDragArrow {
      0%, 100% { transform: translateX(0); opacity: 0.5; }
      50% { transform: translateX(-5px); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .card, .shimmer, .spinner, .preview iframe,
      .previewModal, .previewFlyout, .previewStage, .previewFrame,
      .previewLoupe, .previewDragArrow, .previewDragGhost,
      .grabHint, .grabHint .grabGrip { animation: none !important; transition: none !important; }
    }
  `;
}

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
