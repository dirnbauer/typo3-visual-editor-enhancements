import {css, html, LitElement} from 'lit';
import {lll} from '@typo3/core/lit-helper.js';
import {dragInProgressStore} from '@typo3/visual-editor/Frontend/stores/drag-store';
import {getElementLibrary} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library';
import {elementLibraryOpen} from '@webconsulting/visual-editor-enhancements/Shared/local-stores';

/**
 * Floating action button that toggles the element library panel. Anchored at
 * the top of the editing canvas, on top of the content elements. Reflects the
 * open/closed state (+ rotates to x) and hides while a drag is running so it
 * never covers a drop zone. Accent colour comes from the backend theme token
 * (--ve-accent-color, provided by the backend bridge) with a sane fallback.
 *
 * @extends {HTMLElement}
 */
export class VeElementLibraryButton extends LitElement {
  static properties = {
    dragging: {type: Boolean, state: true, attribute: false},
    open: {type: Boolean, state: true, attribute: false},
  };

  constructor() {
    super();
    this.dragging = false;
    this.open = !!elementLibraryOpen.get();
    this.onDragInProgressChange = this.#onDragInProgressChange.bind(this);
    this.onLibraryToggle = this.#onLibraryToggle.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    dragInProgressStore.addEventListener('change', this.onDragInProgressChange);
    document.addEventListener('ve-library-toggle', this.onLibraryToggle);
  }

  disconnectedCallback() {
    dragInProgressStore.removeEventListener('change', this.onDragInProgressChange);
    document.removeEventListener('ve-library-toggle', this.onLibraryToggle);
    super.disconnectedCallback();
  }

  #onDragInProgressChange() {
    this.dragging = !!dragInProgressStore.value;
  }

  #onLibraryToggle(event) {
    this.open = !!event.detail?.open;
  }

  #toggle() {
    getElementLibrary().toggle();
  }

  render() {
    if (this.dragging) {
      return html``;
    }
    const label = this.open
      ? (lll('frontend.library.close') || 'Close library')
      : (lll('frontend.library.open') || 'Add content from library');
    return html`
      <button type="button" class="fab ${this.open ? 'open' : ''}" @click="${this.#toggle}" title="${label}" aria-label="${label}" aria-pressed="${this.open}">
        <svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </button>
    `;
  }

  static styles = css`
    :host {
      --ve-accent: var(--ve-accent-color, #7c5ac4);
      --ve-accent-contrast: #ffffff;
      /* halo ring around the FAB: white on a dark canvas, dark on light */
      --ve-fab-ring: rgba(255, 255, 255, 0.92);
      font-family: var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
    }

    .fab {
      position: fixed;
      top: 14px;
      right: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border-radius: 50%;
      border: none;
      background: var(--ve-accent);
      color: var(--ve-accent-contrast);
      cursor: pointer;
      box-shadow: 0 0 0 2px var(--ve-fab-ring), 0 8px 22px color-mix(in srgb, var(--ve-accent) 50%, transparent), 0 2px 6px rgba(0,0,0,0.25);
      z-index: 100001;
      transition: transform 0.14s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.14s ease, background 0.14s ease, top 0.22s cubic-bezier(0.22, 1, 0.36, 1), right 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .fab:hover { transform: translateY(-1px) scale(1.06); box-shadow: 0 0 0 2px var(--ve-fab-ring), 0 12px 28px color-mix(in srgb, var(--ve-accent) 55%, transparent); }
    .fab:active { transform: translateY(0) scale(0.98); }

    .icon { transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
    .fab.open .icon { transform: rotate(135deg); }
    /* open: the "x" nests cleanly inside the panel's top-right corner. The panel
       now floats (inset-block:12px) with a soft shadow, so nudge the button down
       and in (was hanging over the panel's edge) and use a tighter shadow since
       it now rests on the panel surface rather than over the canvas. */
    .fab.open {
      top: 20px;
      right: 20px;
      background: color-mix(in srgb, var(--ve-accent) 78%, #000);
      box-shadow: 0 0 0 2px var(--ve-fab-ring), 0 6px 18px color-mix(in srgb, var(--ve-accent) 38%, transparent), 0 2px 6px rgba(0, 0, 0, 0.28);
    }

    @media (prefers-color-scheme: light) {
      :host { --ve-fab-ring: rgba(20, 20, 26, 0.5); }
    }

    @media (prefers-reduced-motion: reduce) {
      .fab, .icon { transition: none !important; }
    }
  `;
}

customElements.define('ve-element-library-button', VeElementLibraryButton);
