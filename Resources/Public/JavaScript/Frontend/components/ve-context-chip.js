import {css, html, LitElement} from 'lit';

const translate = (key, fallback) => window.TYPO3?.lang?.[key] || fallback;

/**
 * Singleton floating chip button shown near the top-right corner of the
 * hovered (or focused) content element; clicking it opens the field chooser
 * for exactly that element without a trip through the action bar. It follows
 * its element on scroll/resize while visible and hides after a short grace
 * period once the pointer leaves - moving onto the chip itself cancels the
 * hide, so it stays clickable. Driven via showFor()/scheduleHide() from
 * Frontend/element-context-affordance.js.
 *
 * @extends {HTMLElement}
 */
export class VeContextChip extends LitElement {
  static properties = {
    // Reflected so the :host([visible]) styles drive the fade/scale transition.
    visible: {type: Boolean, reflect: true},
    chipStyle: {type: String, state: true, attribute: false},
  };

  constructor() {
    super();
    this.visible = false;
    this.chipStyle = '';
    /** @type {Element|null} the content element the chip currently belongs to */
    this.target = null;
    /** @type {((contentElement: Element, anchorRect: DOMRect) => void)|null} */
    this.activate = null;
    this.hideTimer = 0;
    this.tracking = false;
    this.onViewportChange = () => {
      if (this.visible && this.target !== null) {
        this.#position();
      }
    };
  }

  disconnectedCallback() {
    this.hideNow();
    super.disconnectedCallback();
  }

  /**
   * Shows the chip for one content element; a newer call simply retargets the
   * shared chip. The activate callback receives (target, buttonRect) when the
   * chip is clicked.
   * @param {Element} target
   * @param {(contentElement: Element, anchorRect: DOMRect) => void} activate
   */
  showFor(target, activate) {
    this.#cancelHide();
    this.target = target;
    this.activate = activate;
    if (!this.#position()) {
      return; // target is fully outside the viewport: #position() hid the chip
    }
    this.visible = true;
    this.#startViewportTracking();
  }

  /**
   * Hides after a grace period, so the pointer can travel from the content
   * element onto the (overlapping, but non-descendant) chip without it
   * vanishing: the chip's own pointerenter cancels the timer again.
   */
  scheduleHide() {
    this.#cancelHide();
    this.hideTimer = setTimeout(() => this.hideNow(), 150);
  }

  hideNow() {
    this.#cancelHide();
    this.visible = false;
    this.#stopViewportTracking();
    this.target = null;
  }

  #cancelHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = 0;
    }
  }

  /**
   * Anchors the chip inside the target's top-right corner, clamped to the
   * viewport so it stays reachable for tall or partially scrolled-out
   * elements. Returns false (and hides) when the target left the viewport.
   * @return {boolean}
   */
  #position() {
    const rect = this.target.getBoundingClientRect();
    const size = 32;
    const edge = 8;
    const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || size);
    const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || size);
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewportHeight || rect.left >= viewportWidth) {
      this.hideNow();
      return false;
    }
    const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
    const left = clamp(rect.right - size - edge, edge, viewportWidth - size - edge);
    const top = clamp(rect.top + edge, edge, Math.max(edge, rect.bottom - size - edge));
    this.chipStyle = `left:${Math.round(left)}px;top:${Math.round(top)}px;`;
    return true;
  }

  updated(changedProperties) {
    if (changedProperties.has('chipStyle')) {
      // The host itself is the fixed-positioned box (see :host styles) and
      // render() cannot set host inline styles, so they are applied here.
      this.style.cssText = this.chipStyle;
    }
  }

  #startViewportTracking() {
    if (this.tracking) {
      return;
    }
    this.tracking = true;
    window.addEventListener('scroll', this.onViewportChange, {passive: true, capture: true});
    window.addEventListener('resize', this.onViewportChange, {passive: true});
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', this.onViewportChange, {passive: true});
      window.visualViewport.addEventListener('resize', this.onViewportChange, {passive: true});
    }
  }

  #stopViewportTracking() {
    if (!this.tracking) {
      return;
    }
    this.tracking = false;
    window.removeEventListener('scroll', this.onViewportChange, {capture: true});
    window.removeEventListener('resize', this.onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('scroll', this.onViewportChange);
      window.visualViewport.removeEventListener('resize', this.onViewportChange);
    }
  }

  #handlePointerEnter() {
    this.#cancelHide();
  }

  #handlePointerLeave() {
    this.scheduleHide();
  }

  #handleClick(event) {
    if (this.target === null) {
      return;
    }
    this.activate?.(this.target, event.currentTarget.getBoundingClientRect());
  }

  render() {
    const label = translate('frontend.contextChip.open', 'Edit element settings');
    // Same sliders/options glyph as the action-bar button injected in
    // Frontend/index.js, sized like <ve-icon> (16x16).
    return html`
      <button
        type="button"
        class="chip"
        data-ve-enhancement="field-chooser"
        tabindex="${this.visible ? 0 : -1}"
        aria-hidden="${this.visible ? 'false' : 'true'}"
        title="${label}"
        aria-label="${label}"
        @pointerenter="${this.#handlePointerEnter}"
        @pointerleave="${this.#handlePointerLeave}"
        @click="${this.#handleClick}"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 4.5h4.25M12.25 4.5H14M2 11.5h1.75M9.75 11.5H14"/>
          <circle cx="8.25" cy="4.5" r="2"/>
          <circle cx="5.75" cy="11.5" r="2"/>
        </svg>
      </button>
    `;
  }

  static styles = css`
    :host {
      position: fixed;
      z-index: 100001;
      opacity: 0;
      transform: scale(0.9);
      pointer-events: none;
      transition: opacity 0.12s ease, transform 0.12s ease;
    }

    :host([visible]) {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }

    .chip {
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: var(--ve-accent-color, #7c5ac4);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }

    .chip:focus-visible {
      outline: 2px solid #fff;
      box-shadow: 0 0 0 4px var(--ve-accent-color, #7c5ac4);
    }

    @media (prefers-reduced-motion: reduce) {
      :host { transition: opacity 0.12s ease; }
    }
  `;
}

/** @type {VeContextChip|null} */
let contextChip = null;

/**
 * Lazily creates the singleton chip element, appends it to the document body
 * and returns it; callers drive it via showFor()/scheduleHide().
 * @return {VeContextChip}
 */
export function getContextChip() {
  if (contextChip === null) {
    contextChip = document.createElement('ve-context-chip');
    document.body.appendChild(contextChip);
  }
  return contextChip;
}

customElements.define('ve-context-chip', VeContextChip);
