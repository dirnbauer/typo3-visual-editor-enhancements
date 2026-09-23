import {css} from 'lit';

/**
 * The --ve-* design tokens every component of this extension styles against.
 * Include first in a component's `static styles`.
 *
 * Each alias reads the backend value the theme bridge delivered
 * (--ve-t3-<name>, see Shared/theme-bridge.js) and falls back to a CSS system
 * colour, which follows `color-scheme` - so the chrome is legible in light and
 * dark before (or without) the bridge.
 */
export const themeTokens = css`
  :host {
    color-scheme: var(--ve-t3-color-scheme, light dark);
    --ve-font-family: var(--ve-t3-font-family, system-ui, sans-serif);
    --ve-radius: var(--ve-t3-radius, 6px);
    --ve-radius-small: calc(var(--ve-radius) * 0.66);
    --ve-surface: var(--ve-t3-surface, Canvas);
    --ve-surface-raised: var(--ve-t3-surface-raised, Canvas);
    --ve-surface-sunken: var(--ve-t3-surface-sunken, color-mix(in srgb, CanvasText 8%, Canvas));
    --ve-text: var(--ve-t3-text, CanvasText);
    --ve-text-muted: var(--ve-t3-text-muted, color-mix(in srgb, CanvasText 65%, Canvas));
    --ve-border: var(--ve-t3-border, color-mix(in srgb, CanvasText 18%, Canvas));
    --ve-input-border: var(--ve-t3-input-border, color-mix(in srgb, CanvasText 32%, Canvas));
    --ve-hover: var(--ve-t3-hover, color-mix(in srgb, CanvasText 6%, Canvas));
    --ve-primary: var(--ve-t3-primary, Highlight);
    --ve-primary-hover: var(--ve-t3-primary-hover, color-mix(in srgb, Highlight 85%, CanvasText));
    --ve-on-primary: var(--ve-t3-on-primary, HighlightText);
    /* The primary colour as text on a surface: links, the active tab, arrows. */
    --ve-primary-text: var(--ve-t3-primary-text, LinkText);
    /* Focus rings use the primary TEXT colour: it keeps its contrast on every
       surface in both schemes (the primary background colour is too dark for
       a ring on the dark surfaces). */
    --ve-focus: var(--ve-primary-text);
    --ve-danger: var(--ve-t3-danger, CanvasText);
    --ve-overlay: var(--ve-t3-overlay, color-mix(in srgb, CanvasText 55%, Canvas));
    --ve-shadow: var(--ve-t3-shadow, 0 8px 24px color-mix(in srgb, CanvasText 18%, transparent));
    --ve-shadow-dialog: var(--ve-t3-shadow-dialog, 0 16px 48px color-mix(in srgb, CanvasText 28%, transparent));
    /* Derived: a primary-tinted surface for selected / active items. */
    --ve-primary-subtle: color-mix(in srgb, var(--ve-primary) 12%, var(--ve-surface-raised));
    /* Backend focus ring: a 2px outline in the focus colour. */
    --ve-focus-ring: 0 0 0 2px color-mix(in srgb, var(--ve-focus) 70%, transparent);
    font-family: var(--ve-font-family);
  }
`;
