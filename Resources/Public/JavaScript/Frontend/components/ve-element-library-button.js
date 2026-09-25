import {css, html, LitElement} from 'lit';
import {lll} from '@typo3/core/lit-helper.js';
import {dragInProgressStore} from '@typo3/visual-editor/Frontend/stores/drag-store';
import {getElementLibrary} from '@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library.js';
import {elementLibraryOpen} from '@webconsulting/visual-editor-enhancements/Shared/local-stores.js';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';

/**
 * Floating action button that toggles the element library panel. Anchored at
 * the top of the editing canvas, on top of the content elements. Reflects the
 * open/closed state (+ rotates to x) and hides while a drag is running so it
 * never covers a drop zone. Painted in the backend's primary colour
 * (Shared/theme.js).
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
      <button type="button" class="fab ${this.open ? 'open' : ''}" @click="${this.#toggle}" title="${label}" aria-label="${label}" aria-expanded="${this.open ? 'true' : 'false'}">
        <svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </button>
    `;
  }

  static styles = [themeTokens, css`
    .fab {
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 100001;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--ve-primary);
      color: var(--ve-on-primary);
      cursor: pointer;
      /* the surface-coloured ring separates the button from any site background */
      box-shadow: 0 0 0 2px var(--ve-surface-raised), var(--ve-shadow);
      transition: background-color 0.14s ease, transform 0.12s ease;
    }
    .fab:hover { background: var(--ve-primary-hover); }
    .fab:focus-visible {
      outline: 2px solid var(--ve-focus);
      outline-offset: 3px;
    }
    /* pressed: the button dips in place; scale keeps its centre, so it
       never leaves its spot */
    .fab:active { transform: scale(0.9); }

    /* The button stays where it is — its closed spot already sits inside
       the panel's top-right corner (the panel starts at 12px). Only the
       icon moves: it grows a little under the pointer and turns into the
       "x" with a spring that overshoots and settles (the second easing
       value above 1 does that). */
    .icon {
      transition: transform 0.34s cubic-bezier(0.34, 1.56, 0.64, 1);
      will-change: transform;
    }
    .fab:hover .icon { transform: scale(1.15); }
    .fab.open .icon { transform: rotate(135deg); }
    .fab.open:hover .icon { transform: rotate(135deg) scale(1.15); }
    .fab.open { background: var(--ve-primary-hover); }

    @media (prefers-reduced-motion: reduce) {
      .fab, .icon { transition: none !important; }
      .fab:active { transform: none; }
      .fab:hover .icon { transform: none; }
      .fab.open:hover .icon { transform: rotate(135deg); }
    }
  `];
}

customElements.define('ve-element-library-button', VeElementLibraryButton);
