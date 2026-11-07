import {actionLabelMode} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {buildActionBarLabelCss} from '@webconsulting/visual-editor-enhancements/Shared/action-bar-label-css.js';
import {shortVendorLabel} from '@webconsulting/visual-editor-enhancements/Shared/action-labels.js';

/**
 * Very small text labels on every action-bar button, without touching the
 * vendor template: one shared constructable stylesheet (the mechanism Lit
 * itself uses for component styles) is adopted into each content element's
 * shadow root, the labels are generated content of the existing buttons, and
 * only data attributes are written:
 *  - `data-ve-labels="<mode>"` on the bar (scopes every rule of the sheet),
 *  - `data-ve-label` on vendor buttons whose short word is contained in the
 *    accessible name (Shared/action-labels.js),
 *  - `data-ve-label-current` on the one button whose caption shows (caption
 *    mode), `data-ve-labels-pinned` on the bar after a click.
 * The vendor's own click handlers are never intercepted; pointer-events:none
 * on the labels keeps the whole bar the vendor's drag handle.
 */

/** @type {CSSStyleSheet|null} */
let sharedSheet = null;
/** @type {WeakSet<Element>} bars whose pointer/focus/click state is wired */
const wiredBars = new WeakSet();
/** @type {WeakSet<Element>} content elements whose mouseleave is wired */
const wiredElements = new WeakSet();
/** @type {WeakMap<Element, Element>} bar -> pinned (clicked) button */
const pinned = new WeakMap();
/** @type {WeakSet<Element>} bars the pointer is currently inside */
const pointerInside = new WeakSet();

function sheet() {
  if (sharedSheet === null) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(buildActionBarLabelCss(actionLabelMode()));
  }
  return sharedSheet;
}

/**
 * A future vendor release that renders its own labels wins: then nothing is
 * adopted (Compatibility.rst).
 * @param {Element} bar
 */
function vendorRendersLabels(bar) {
  return !!globalThis.window?.veInfo?.actionBarLabels || bar.querySelector('.label') !== null;
}

/**
 * @param {Element} bar
 * @return {HTMLElement[]}
 */
function buttonsOf(bar) {
  return [...bar.querySelectorAll('.button')];
}

/**
 * @param {Element} bar
 * @param {Element|null} button the button whose caption shows, or null
 */
function setCurrent(bar, button) {
  for (const candidate of buttonsOf(bar)) {
    if (candidate !== button && candidate.hasAttribute('data-ve-label-current')) {
      candidate.removeAttribute('data-ve-label-current');
    }
  }
  if (button !== null && !button.hasAttribute('data-ve-label-current')) {
    button.setAttribute('data-ve-label-current', '');
  }
}

/** @param {Element} bar */
function focusVisibleButton(bar) {
  return buttonsOf(bar).find((button) => button.matches(':focus-visible')) ?? null;
}

/** @param {Element} bar */
function unpin(bar) {
  pinned.delete(bar);
  bar.removeAttribute('data-ve-labels-pinned');
}

/**
 * The caption follows the pointer while it is anywhere inside the bar
 * (moving onto the caption row keeps it: WCAG 1.4.13 hoverable), then falls
 * back to the clicked button, then to the keyboard-focused one.
 * @param {Element} bar
 */
function wireBar(bar) {
  if (wiredBars.has(bar)) {
    return;
  }
  wiredBars.add(bar);
  const buttonFrom = (event) => {
    const target = event.target instanceof Element ? event.target.closest('.button') : null;
    return target !== null && bar.contains(target) ? target : null;
  };
  bar.addEventListener('pointerover', (event) => {
    pointerInside.add(bar);
    const button = buttonFrom(event);
    if (button !== null) {
      setCurrent(bar, button);
    }
  });
  bar.addEventListener('pointerleave', () => {
    pointerInside.delete(bar);
    setCurrent(bar, pinned.get(bar) ?? focusVisibleButton(bar));
  });
  bar.addEventListener('focusin', (event) => {
    const button = buttonFrom(event);
    if (button !== null && button.matches(':focus-visible')) {
      setCurrent(bar, button);
    }
  });
  bar.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && bar.contains(next)) {
      return;
    }
    unpin(bar);
    if (!pointerInside.has(bar)) {
      setCurrent(bar, null);
    }
  });
  bar.addEventListener('click', (event) => {
    const button = buttonFrom(event);
    if (button === null) {
      return;
    }
    pinned.set(bar, button);
    bar.setAttribute('data-ve-labels-pinned', '');
    setCurrent(bar, button);
  });
}

/**
 * Leaving the whole element ends a pin (the vendor hides the bar then, unless
 * focus is still inside it).
 * @param {Element} element
 * @param {Element} bar
 */
function wireElement(element, bar) {
  if (wiredElements.has(element)) {
    return;
  }
  wiredElements.add(element);
  element.addEventListener('mouseleave', () => {
    const current = element.shadowRoot?.querySelector('.action-bar') ?? bar;
    unpin(current);
    pointerInside.delete(current);
    setCurrent(current, focusVisibleButton(current));
  });
}

/**
 * Short words for the vendor's buttons, re-evaluated on every pass: the
 * vendor may re-render its labels (another language frame, a hidden toggle).
 * @param {Element} bar
 * @param {string} mode
 */
function applyShortLabels(bar, mode) {
  const lang = globalThis.window?.TYPO3?.lang;
  for (const button of buttonsOf(bar)) {
    if (button.hasAttribute('data-ve-enhancement')) {
      continue;
    }
    const short = mode === 'icons' ? null : shortVendorLabel(button.getAttribute('aria-label') ?? '', lang);
    if (short === null) {
      button.removeAttribute('data-ve-label');
    } else if (button.getAttribute('data-ve-label') !== short) {
      button.setAttribute('data-ve-label', short);
    }
  }
}

/**
 * Idempotent; called from the shared injection pass (Frontend/index.js) for
 * every content element, after our own buttons were injected.
 * @param {Element} element a ve-content-element
 */
export function installActionBarLabels(element) {
  const root = element.shadowRoot;
  const bar = root?.querySelector('.action-bar');
  if (!root || !bar || vendorRendersLabels(bar)) {
    return;
  }
  const labelSheet = sheet();
  if (!root.adoptedStyleSheets.includes(labelSheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, labelSheet];
  }
  const mode = actionLabelMode();
  if (bar.getAttribute('data-ve-labels') !== mode) {
    bar.setAttribute('data-ve-labels', mode);
  }
  applyShortLabels(bar, mode);
  if (mode === 'caption') {
    wireBar(bar);
    wireElement(element, bar);
  }
}
