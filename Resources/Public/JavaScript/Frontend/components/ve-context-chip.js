import {css, html, LitElement} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {clamp, translate, ViewportTracker} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils';
import {slidersIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons';

/**
 * Singleton floating chip button shown next to the hovered (or focused)
 * editable output (<ve-editable-text> / <ve-editable-rich-text>); clicking it
 * opens the field chooser scoped to that output's backend form group, without
 * a trip through the action bar. It sits right of the output's rect (falling
 * back to the left side, then inside the top-right corner, when there is no
 * space - mirroring ve-editable-link's side fallback), follows its output on
 * scroll/resize while visible and hides after a short grace period once the
 * pointer leaves - moving onto the chip itself cancels the hide, so it stays
 * clickable. Driven via showFor()/scheduleHide() from
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
    /** @type {Element|null} the editable output the chip currently belongs to */
    this.target = null;
    /** @type {((outputElement: Element, anchorRect: DOMRect) => void)|null} */
    this.activate = null;
    this.hideTimer = 0;
    this.viewportTracker = new ViewportTracker(() => {
      if (this.visible && this.target !== null) {
        this.#position();
      }
    });
  }

  disconnectedCallback() {
    this.hideNow();
    super.disconnectedCallback();
  }

  /**
   * Shows the chip for one editable output; a newer call simply retargets the
   * shared chip. The activate callback receives (target, buttonRect) when the
   * chip is clicked.
   * @param {Element} target
   * @param {(outputElement: Element, anchorRect: DOMRect) => void} activate
   */
  showFor(target, activate) {
    this.#cancelHide();
    this.target = target;
    this.activate = activate;
    if (!this.#position()) {
      return; // target is fully outside the viewport: #position() hid the chip
    }
    this.visible = true;
    this.viewportTracker.start();
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
    this.viewportTracker.stop();
    this.target = null;
  }

  #cancelHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = 0;
    }
  }

  /**
   * Anchors the chip next to the target output's rect: preferred right of it,
   * top-aligned; falls back to the left side, then inside the rect's top-right
   * corner, when neither side has space (mirroring ve-editable-link's side
   * fallback). Clamped to an 8px viewport margin so it stays reachable for
   * partially scrolled-out outputs. Returns false (and hides) when the target
   * left the viewport.
   * @return {boolean}
   */
  #position() {
    const rect = this.target.getBoundingClientRect();
    const size = 28;
    const gap = 8;
    const edge = 8;
    const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || size);
    const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || size);
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewportHeight || rect.left >= viewportWidth) {
      this.hideNow();
      return false;
    }
    let left = rect.right + gap;
    let top = rect.top;
    if (left + size + edge > viewportWidth) {
      const leftSide = rect.left - size - gap;
      if (leftSide >= edge) {
        left = leftSide;
      } else {
        // Neither side fits: sit inside the output's top-right corner.
        left = rect.right - size - edge;
        top = rect.top + edge;
      }
    }
    left = clamp(left, edge, viewportWidth - size - edge);
    top = clamp(top, edge, viewportHeight - size - edge);
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
    const label = translate('frontend.contextButton.open', 'Edit related field settings');
    // Same sliders/options glyph as the action-bar button injected in
    // Frontend/index.js, at 14x14 to fit the compact 28px chip.
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
        ${unsafeHTML(slidersIconSvg(14))}
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
      width: 28px;
      height: 28px;
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
