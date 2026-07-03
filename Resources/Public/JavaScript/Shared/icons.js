/**
 * Inline line-art SVG glyphs shared by the action-bar button, the context
 * button and the popover. The functions return complete <svg> element strings:
 * plain-DOM callers assign them to innerHTML, Lit callers render them through
 * unsafeHTML(...) from 'lit/directives/unsafe-html.js'.
 *
 * SECURITY: only ever call these with static, developer-controlled arguments -
 * the strings are injected unescaped, so no user input may be interpolated.
 */

/**
 * Sliders/options glyph used for the field settings affordances.
 * @param {number} size rendered width/height in px
 * @return {string}
 */
export const slidersIconSvg = (size) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">`
  + '<path d="M2 4.5h4.25M12.25 4.5H14M2 11.5h1.75M9.75 11.5H14"/>'
  + '<circle cx="8.25" cy="4.5" r="2"/>'
  + '<circle cx="5.75" cy="11.5" r="2"/>'
  + '</svg>';

/**
 * Chain-link glyph used for the link edit affordances.
 * @param {number} size rendered width/height in px
 * @param {string} className optional class on the <svg> element
 * @return {string}
 */
export const linkIconSvg = (size, className = '') =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}"${className !== '' ? ` class="${className}"` : ''} aria-hidden="true">`
  + '<path fill="currentColor" d="m13.7 3.8-1.4-1.4c-.8-.8-2-.8-2.8 0L5.9 5.9c-.8.8-.8 2 0 2.8l1.2 1.2.9-.8L6.9 8c-.4-.4-.4-1 0-1.4l3.2-3.2c.4-.4 1-.4 1.4 0l1.1 1.1c.4.4.4 1 0 1.4l-1.3 1.3c.2.4.4.9.4 1.4l2-2c.7-.8.7-2.1 0-2.8z"/>'
  + '<path fill="currentColor" d="m8.9 6.1-.9.8L9.1 8c.4.4.4 1 0 1.4l-3.2 3.2c-.4.4-1 .4-1.4 0l-1.1-1.1c-.4-.4-.4-1 0-1.4l1.3-1.3c-.2-.4-.4-.9-.4-1.4l-2 2c-.8.8-.8 2 0 2.8l1.4 1.4c.8.8 2 .8 2.8 0l3.5-3.5c.8-.8.8-2 0-2.8L8.9 6.1z"/>'
  + '</svg>';
