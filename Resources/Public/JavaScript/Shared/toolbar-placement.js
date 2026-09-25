/**
 * Where the floating CKEditor toolbar of a <ve-editable-rich-text> goes, as
 * pure geometry: no DOM, so it runs under plain Node.
 *
 * The Visual Editor pins the toolbar above the editable, anchored to its left
 * edge. That fails whenever the page leaves no room there: at the top of the
 * viewport the toolbar is cut off above, in the right-hand card of a row it
 * runs past the right edge, near the bottom a toolbar flipped below vanishes
 * again. The rule here is the one every floating UI follows: above when there
 * is room above, else below when there is room below, else over the top of
 * the editable itself - and always shifted so it ends inside the viewport.
 */
import {clamp} from './dom-utils.js';

/** Space kept between the toolbar and the editable's highlighted box. Mirrors --ve-toolbar-gap in editable-overrides.css. */
export const TOOLBAR_GAP = 10;
/** Space kept between the toolbar and the viewport's edges. */
export const VIEWPORT_MARGIN = 8;
/** The toolbar never grows wider than this, wide screens or not; it wraps instead. */
export const TOOLBAR_MAX_WIDTH = 960;

/**
 * The widest the toolbar may be in this viewport before it wraps into more
 * rows: the viewport minus a margin on each side, capped for readability.
 *
 * @param {{width: number}} viewport
 * @param {{margin?: number, cap?: number}} [options]
 * @return {number}
 */
export function toolbarMaxWidth(viewport, {margin = VIEWPORT_MARGIN, cap = TOOLBAR_MAX_WIDTH} = {}) {
  return Math.max(0, Math.min(cap, viewport.width - 2 * margin));
}

/**
 * Picks the side and the viewport position of the toolbar.
 *
 * `editor` is the editable's box and `toolbar` the toolbar's rendered size,
 * both in viewport coordinates as getBoundingClientRect() reports them.
 * The result is the viewport position of the toolbar's top-left corner and
 * the side it sits on: 'above' or 'below' the editable with a gap, or
 * 'inside' - laid over the editable's first lines - when neither side has
 * room, which only happens when the editable fills the viewport.
 *
 * @param {{
 *   editor: {top: number, bottom: number, left: number},
 *   toolbar: {width: number, height: number},
 *   viewport: {width: number, height: number},
 *   gap?: number,
 *   margin?: number,
 * }} input
 * @return {{side: 'above'|'below'|'inside', left: number, top: number}}
 */
export function placeToolbar({editor, toolbar, viewport, gap = TOOLBAR_GAP, margin = VIEWPORT_MARGIN}) {
  const clearance = toolbar.height + gap + margin;
  let side;
  let top;
  if (editor.top >= clearance) {
    side = 'above';
    top = editor.top - gap - toolbar.height;
  } else if (viewport.height - editor.bottom >= clearance) {
    side = 'below';
    top = editor.bottom + gap;
  } else {
    side = 'inside';
    top = clamp(editor.top, margin, viewport.height - margin - toolbar.height);
  }

  const left = toolbar.width + 2 * margin > viewport.width
    ? margin
    : clamp(editor.left, margin, viewport.width - margin - toolbar.width);

  return {side, left, top};
}
