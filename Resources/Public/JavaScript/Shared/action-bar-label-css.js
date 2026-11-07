/**
 * The stylesheet that gives every action-bar button a very small text label
 * (User settings > Visual editor > Action bar labels). Pure: it only builds
 * CSS text; Frontend/action-bar-labels.js adopts it into each content
 * element's shadow root as one shared constructable stylesheet.
 *
 * The vendor bar (`ve-drag-handle.action-bar`) renders in light DOM inside the
 * `ve-content-element` shadow root, so `.action-bar .button` outranks the
 * vendor's `.button` without touching the vendor template. Labels are
 * generated content - `attr(aria-label)`, or `attr(data-ve-label)` for a short
 * word that is contained in the accessible name - so the visible text always
 * equals or is part of the accessible name (WCAG 2.5.3).
 *
 * Every selector is scoped to `[data-ve-labels]`, the attribute the installer
 * sets on the bar together with adopting the sheet.
 */

/** @type {readonly ['caption', 'inline', 'stacked', 'icons']} */
export const ACTION_LABEL_MODES = Object.freeze(['caption', 'inline', 'stacked', 'icons']);

export const DEFAULT_ACTION_LABEL_MODE = 'caption';

/** Sizes in px; the documentation and the component spec quote these. */
export const LABEL_METRICS = Object.freeze({
  captionRow: 14,
  captionFont: 11,
  inlineFont: 11,
  inlineGap: 6,
  stackedFont: 10,
  stackedRows: [14, 10],
});

/**
 * @param {string} mode
 * @return {'caption'|'inline'|'stacked'|'icons'}
 */
export function normalizeActionLabelMode(mode) {
  return ACTION_LABEL_MODES.includes(mode) ? mode : DEFAULT_ACTION_LABEL_MODE;
}

const BAR = '.action-bar[data-ve-labels]';

/**
 * Always adopted: our buttons toggle with the hidden attribute (the vendor's
 * `.button {display: inline-flex}` would otherwise beat the UA `[hidden]`
 * rule), refused actions stay focusable and look refused.
 */
function baseRules() {
  return `${BAR} .button[hidden]{display:none}
${BAR} .button[aria-disabled="true"]{opacity:.5;cursor:not-allowed}
`;
}

/** The label text shared by every mode: the accessible name, or the contained short word. */
function labelContent(selector) {
  return `${selector} .button::after{content:attr(aria-label)}
${selector} .button[data-ve-label]::after{content:attr(data-ve-label)}
`;
}

const TYPE = (size, letterSpacing) => `font-family:inherit;font-size:${size}px;font-weight:500;letter-spacing:${letterSpacing};color:inherit;white-space:nowrap;pointer-events:none;user-select:none`;

/**
 * Inline: every button shows its name beside its icon, whenever the bar is
 * visible (the vendor already gates the bar on hover and focus). The bar grows
 * once, when it appears - never while the pointer is over it.
 * @param {string} selector
 */
function inlineRules(selector) {
  const {inlineFont, inlineGap} = LABEL_METRICS;
  return `${selector} .button{display:inline-grid;grid-auto-flow:column;align-items:center;column-gap:${inlineGap}px}
${selector} .button::after{position:static;opacity:1;height:auto;${TYPE(inlineFont, '.01em')};line-height:14px;overflow:visible}
`;
}

/** Stacked: a 10 px name under each icon. */
function stackedRules(selector) {
  const {stackedFont, stackedRows} = LABEL_METRICS;
  return `${selector} .button{display:inline-grid;grid-template-rows:minmax(${stackedRows[0]}px, auto) ${stackedRows[1]}px;justify-items:center;align-items:center;row-gap:2px}
${selector} .button::after{${TYPE(stackedFont, '.02em')};line-height:${stackedRows[1]}px}
`;
}

/**
 * Caption: a permanently reserved row below the icons; only the current
 * button's name shows there. Current = the button the pointer last entered
 * while it is inside the bar, the pinned (clicked) one, or the focus-visible
 * one. The row is reserved at rest, so revealing a caption never changes the
 * bar's size. The caption is positioned against the bar (the vendor bar is
 * absolutely positioned, its buttons are not positioned).
 */
function captionRules(selector) {
  const {captionRow, captionFont} = LABEL_METRICS;
  return `${selector}{flex-wrap:wrap;row-gap:0}
${selector}::after{content:'';flex-basis:100%;height:${captionRow}px}
${selector} .button::after{position:absolute;left:4px;right:4px;bottom:calc(var(--auto-no-overlap-padding, 0px) + 4px);height:${captionRow}px;${TYPE(captionFont, '.01em')};line-height:${captionRow}px;text-align:start;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .12s ease}
${selector} .button[data-ve-label-current]::after,
${selector}:not(:has([data-ve-label-current])) .button:focus-visible::after{opacity:1}
`;
}

/**
 * Touch screens have no hover: a tap shows the bar and acts at once, so the
 * caption row would never be useful - and every absolutely positioned caption
 * at opacity 1 would overlap. Switch to the inline rules there.
 */
function hoverNoneCaptionRules(selector) {
  return `@media (hover: none){
${selector}{flex-wrap:nowrap;row-gap:normal}
${selector}::after{content:none;display:none}
${inlineRules(selector).trim()}
${selector} .button::after{left:auto;right:auto;bottom:auto;text-overflow:clip;transition:none}
}
`;
}

function reducedMotionRules(selector) {
  return `@media (prefers-reduced-motion: reduce){${selector} .button::after{transition:none}}
`;
}

/**
 * @param {string} mode one of ACTION_LABEL_MODES; anything else means the default
 * @return {string} CSS text for CSSStyleSheet.replaceSync()
 */
export function buildActionBarLabelCss(mode) {
  const resolved = normalizeActionLabelMode(mode);
  if (resolved === 'icons') {
    return baseRules();
  }
  const selector = `${BAR}[data-ve-labels="${resolved}"]`;
  let css = labelContent(selector);
  if (resolved === 'caption') {
    css += captionRules(selector) + hoverNoneCaptionRules(selector);
  } else if (resolved === 'inline') {
    css += inlineRules(selector);
  } else {
    css += stackedRules(selector);
  }
  // Base rules last: the [hidden] rule must win over inline-grid of a mode.
  return css + reducedMotionRules(selector) + baseRules();
}
