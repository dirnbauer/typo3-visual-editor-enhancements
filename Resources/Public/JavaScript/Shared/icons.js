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
 * A list with an add mark: the action-bar "Add entry" button (our own
 * line-art glyph, so the bar never shows two bare plus icons beside the
 * vendor's actions-document-add).
 */
export const addEntryIconSvg = (size) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`
  + '<path d="M2 3h1M6 3h8M2 7h1M6 7h5M2 11h1M6 11h2M12 10v5M9.5 12.5h5"/>'
  + '</svg>';

/**
 * Filled 16x16 glyphs copied verbatim from Core's T3Icons
 * (EXT:core/Resources/Public/Icons/T3Icons/svgs/actions/<identifier>.svg,
 * TYPO3 14.3). The edit frame cannot resolve Core icon identifiers by name -
 * the vendor's ve-icon knows nine glyphs and typo3-backend-icon needs the
 * backend's icon AJAX route - so the paths live here, one identifier each.
 * @param {string} paths inner markup of the icon's <g fill="currentColor">
 * @return {(size: number) => string}
 */
const coreIcon = (paths) => (size) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><g fill="currentColor">${paths}</g></svg>`;

/** actions-list-alternative: the "Entries" button (opens the entries inspector). */
export const listIconSvg = coreIcon('<path d="M14.5 2h-13c-.3 0-.5.2-.5.5v11c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5v-11c0-.3-.2-.5-.5-.5zM14 13H2V3h12v10z"/><path d="M3 4h2v2H3zM6 4h7v2H6zM3 7h2v2H3zM6 7h7v2H6zM3 10h2v2H3zM6 10h7v2H6z"/>');

/** actions-caret-up: move an entry up. */
export const caretUpIconSvg = coreIcon('<path d="m8.407 4.57 4.028 5.64a.5.5 0 0 1-.407.791H3.972a.5.5 0 0 1-.407-.791l4.028-5.64a.5.5 0 0 1 .814 0z"/>');

/** actions-caret-down: move an entry down. */
export const caretDownIconSvg = coreIcon('<path d="M7.593 11.43 3.565 5.79A.5.5 0 0 1 3.972 5h8.057a.5.5 0 0 1 .407.791l-4.028 5.64a.5.5 0 0 1-.815-.001z"/>');

/** actions-eye-slash: the "Hidden" badge. */
export const eyeSlashIconSvg = coreIcon('<path d="M8.071 3h.141C11.889 3.143 15 5.286 15 8.069c0 1.254-.699 2.427-1.849 3.314l-.792-.792c.956-.713 1.572-1.625 1.641-2.562 0-1.154-1.057-2.447-2.538-3.168.148.433.296.866.296 1.443a3.545 3.545 0 0 1-1.101 2.586L6.901 5.133c.315-.272.73-.442 1.144-.442.282 0 .423-.141.423-.282s-.282-.282-.423-.282c-.59 0-1.15.214-1.594.556L5.198 3.43A9.559 9.559 0 0 1 8.071 3ZM2 8.029c0 2.02 2.64 3.924 6 3.971a8.069 8.069 0 0 0 1.96-.272l.85.85A9.38 9.38 0 0 1 8 13c-4.03 0-7-2.286-7-5 0-1.287.7-2.478 1.858-3.374l.712.712C2.582 6.069 2 7.048 2 8.029Zm2.351-1.91 3.79 3.79-.087.001c-2.074 0-3.703-1.587-3.703-3.606v-.185ZM2.354 1.646l12 12a.5.5 0 0 1-.708.708l-12-12a.5.5 0 0 1 .708-.708Z"/>');

/** actions-document-synchronize: "Sync translations". */
export const documentSynchronizeIconSvg = coreIcon('<path d="M6.768 15H1.5a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v5.47a5.779 5.779 0 0 0-1-.831V2H2v12h3.975c.227.362.493.698.793 1Zm-1.572-3H3v1h2.476a5.707 5.707 0 0 1-.28-1Zm-.018-2H3v1h2.1a5.87 5.87 0 0 1 .078-1Zm.735-2H3v1h2.44c.125-.35.285-.685.473-1Zm2.01-2H3v1h3.671a5.775 5.775 0 0 1 1.251-1ZM3 3h10v2H3V3Zm8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM9.285 8.55l-.517-.86a4 4 0 0 1 6.248 3.307h.825c.14 0 .226.161.151.285l-1.307 2.433a.175.175 0 0 1-.304 0l-1.357-2.433c-.075-.124.011-.284.151-.284h.84a3 3 0 0 0-4.73-2.449ZM11.024 14c.645 0 1.218-.203 1.707-.55l.517.86A4 4 0 0 1 7 11.002h-.817c-.14 0-.226-.161-.152-.285l1.3-2.433a.175.175 0 0 1 .304 0l1.316 2.433c.074.124-.012.284-.152.284H8C8.001 12.658 9.368 14 11.024 14Z"/>');

/** actions-document-localize: "Localize to <language>". */
export const documentLocalizeIconSvg = coreIcon('<path d="M3 3h10v2H3zM3 6h1v1H3zM3 8h1v1H3zM3 10h1v1H3zM3 12h1v1H3zM15 7v7h-4.2l-.8.4V14H6V7m-1-.5v8a.5.5 0 0 0 .5.5H9v1l2-1h4.5a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-10a.5.5 0 0 0-.5.5z"/><path d="M4 14H2V2h12v3h1V1.5c0-.3-.2-.5-.5-.5h-13c-.3 0-.5.2-.5.5v13c0 .3.2.5.5.5H4v-1z"/>');

/** actions-form-insert-after: "Add after" on an entry. */
export const formInsertAfterIconSvg = coreIcon('<path d="M14 1h-4v1h4v5H2V2h1V1H1v7h14V1z"/><path d="M13 3H3v3h10V3zM4 1h5v1H4zM11 11H9V9H7v2H5v2h2v2h2v-2h2z"/>');

/** actions-workspace: the workspace context strip. */
export const workspaceIconSvg = coreIcon('<path d="M14.5 4H13V1.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5V3H1.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H4v1.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5zM4 2h8v8h-1V3.5a.5.5 0 0 0-.5-.5H4V2zM2 4h8v8H2V4zm12 10H5v-1h5.5a.5.5 0 0 0 .5-.5V11h1.5a.5.5 0 0 0 .5-.5V5h1v9z"/>');

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
