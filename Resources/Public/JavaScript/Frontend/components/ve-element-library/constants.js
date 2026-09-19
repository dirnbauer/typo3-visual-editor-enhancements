/** Viewport width every preview iframe is rendered at, in px. */
export const PREVIEW_RENDER_WIDTH = 1280;

/**
 * Narrowest viewport the enlarged preview is ever rendered at. Rendering at the
 * stage width would put a ~590px docked stage into the element's phone layout,
 * which is not what an editor is choosing; never narrower than a desktop
 * viewport keeps the real layout, never wider than needed keeps the text
 * legible.
 */
export const PREVIEW_MIN_RENDER_WIDTH = 1024;

/** How many recently-used elements to remember and show in the top section. */
export const RECENT_LIMIT = 8;

/** Preview thumbnail box height in px; mirrors the .preview CSS fallback. */
export const PREVIEW_BOX_HEIGHT = 260;

/**
 * Max number of preview iframes allowed to load concurrently. Each preview is
 * a real frontend request; with a small PHP-FPM pool a flood of them starves
 * the save request (drops would silently fail).
 */
export const MAX_CONCURRENT_PREVIEWS = 4;

/** Thumbnail column width in px (multi-column grid). */
export const PREVIEW_DISPLAY_WIDTH = 360;

/** Width of the compact element list beside the docked preview (one-column mode). */
export const LIST_WIDTH = 340;

/** The enlarged preview opens at this multiple of the thumbnail scale (CSS default). */
export const PREVIEW_ZOOM_FACTOR = 1.875;

/**
 * Grace period (ms) before the enlarged-preview flyout closes after the pointer
 * leaves its trigger - long enough to travel from the loupe onto the flyout.
 */
export const PREVIEW_FLYOUT_CLOSE_DELAY = 320;

/** Debounce (ms) before a keystroke triggers the server-side search request. */
export const SEARCH_DEBOUNCE = 150;
