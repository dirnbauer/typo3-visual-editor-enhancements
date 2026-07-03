/**
 * Small DOM/UI helpers shared by the floating affordances and the popover.
 */

/**
 * Clamps value into [min, max]; the max is guarded so a max below min can
 * never invert the range (callers position fixed elements where narrow
 * viewports can make the available span negative).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @return {number}
 */
export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Backend-user-language label lookup with an English fallback; the labels are
 * exported to TYPO3.lang by EditModeEnhancementsMiddleware.
 * @param {string} key
 * @param {string} fallback
 * @return {string}
 */
export const translate = (key, fallback) => window.TYPO3?.lang?.[key] || fallback;

/**
 * Keeps a fixed-position floating element glued to its anchor while the page
 * scrolls, resizes or the visual viewport changes (pinch zoom, on-screen
 * keyboard). start()/stop() are idempotent; the onChange callback re-runs the
 * caller's own positioning.
 */
export class ViewportTracker {
  #onChange;
  #active = false;

  /** @param {() => void} onChange */
  constructor(onChange) {
    this.#onChange = onChange;
  }

  start() {
    if (this.#active) {
      return;
    }
    this.#active = true;
    window.addEventListener('scroll', this.#onChange, {passive: true, capture: true});
    window.addEventListener('resize', this.#onChange, {passive: true});
    window.visualViewport?.addEventListener('scroll', this.#onChange, {passive: true});
    window.visualViewport?.addEventListener('resize', this.#onChange, {passive: true});
  }

  stop() {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    window.removeEventListener('scroll', this.#onChange, {capture: true});
    window.removeEventListener('resize', this.#onChange);
    window.visualViewport?.removeEventListener('scroll', this.#onChange);
    window.visualViewport?.removeEventListener('resize', this.#onChange);
  }
}
