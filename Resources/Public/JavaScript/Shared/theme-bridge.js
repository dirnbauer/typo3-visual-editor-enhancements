/**
 * Theme bridge between the backend frame and the Visual Editor's edit frame.
 *
 * The editor chrome of this extension - element library, field chooser,
 * floating buttons - wears the TYPO3 backend's look, although it runs in the
 * edit frame: that frame renders the SITE, so TYPO3's backend stylesheet and
 * its --typo3-* tokens are not loaded there.
 *
 * The backend frame (Backend/index.js) therefore resolves the tokens listed
 * below in its own document - theme ("fresh", "modern", "classic") and colour
 * scheme included - and hands the computed values to the edit frame, which
 * sets them as --ve-t3-<name> on its root (applyTheme()). Components only ever
 * read the --ve-* aliases defined by `themeTokens` (Shared/theme.js); until
 * the backend answers, or when the edit frame is opened on its own, CSS system
 * colours stand in, and those follow the colour scheme set by `color-scheme`.
 *
 * This module imports nothing, so both frames can load it and the unit tests
 * run it without a browser.
 */

/**
 * name => [backend token, CSS property that resolves it to a computed value]
 */
export const THEME_TOKENS = Object.freeze({
  surface: ['--typo3-component-bg', 'background-color'],
  'surface-raised': ['--typo3-surface-container-lowest', 'background-color'],
  'surface-sunken': ['--typo3-surface-container-high', 'background-color'],
  text: ['--typo3-component-color', 'color'],
  'text-muted': ['--typo3-text-color-variant', 'color'],
  border: ['--typo3-component-border-color', 'border-top-color'],
  'input-border': ['--typo3-input-border-color', 'border-top-color'],
  hover: ['--typo3-component-hover-bg', 'background-color'],
  primary: ['--typo3-state-primary-bg', 'background-color'],
  'primary-hover': ['--typo3-state-primary-hover-bg', 'background-color'],
  'on-primary': ['--typo3-state-primary-color', 'color'],
  'primary-text': ['--typo3-text-color-primary', 'color'],
  danger: ['--typo3-text-color-danger', 'color'],
  overlay: ['--typo3-overlay-bg', 'background-color'],
  shadow: ['--typo3-component-box-shadow-flyout', 'box-shadow'],
  'shadow-dialog': ['--typo3-component-box-shadow-dialog', 'box-shadow'],
  radius: ['--typo3-component-border-radius', 'border-top-left-radius'],
  'font-family': ['--typo3-font-family', 'font-family'],
});

/**
 * Backend side: the computed value of every THEME_TOKENS entry in `doc`, plus
 * the colour scheme the backend currently renders in ('light' | 'dark').
 * @param {Document} doc
 * @return {{scheme: 'light'|'dark', tokens: Object<string, string>}}
 */
export function resolveTheme(doc = document) {
  const view = doc.defaultView;
  const probe = doc.createElement('span');
  (doc.body || doc.documentElement).append(probe);
  const tokens = {};
  for (const [name, [token, property]] of Object.entries(THEME_TOKENS)) {
    probe.style.cssText = `display:none;border-style:solid;${property}:var(${token})`;
    const value = view.getComputedStyle(probe).getPropertyValue(property).trim();
    if (value !== '' && value !== 'none') {
      tokens[name] = value;
    }
  }
  probe.remove();
  return {scheme: renderedScheme(doc), tokens};
}

/**
 * The scheme the backend document actually renders in: a forced
 * `color-scheme: only dark|light` wins, "light dark" (the backend's "auto")
 * follows the operating system.
 * @param {Document} doc
 * @return {'light'|'dark'}
 */
export function renderedScheme(doc = document) {
  const declared = doc.defaultView.getComputedStyle(doc.documentElement).colorScheme || '';
  const schemes = declared.split(/\s+/).filter((part) => part === 'light' || part === 'dark');
  if (schemes.length === 1) {
    return schemes[0];
  }
  return doc.defaultView.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Edit-frame side: exposes a resolved theme as --ve-t3-* custom properties on
 * `root` (they inherit into every shadow root). Unknown names are ignored, so
 * a newer backend cannot inject arbitrary properties.
 * @param {{scheme?: string, tokens?: Object<string, string>}|null} theme
 * @param {HTMLElement} root
 */
export function applyTheme(theme, root = document.documentElement) {
  if (theme?.scheme === 'light' || theme?.scheme === 'dark') {
    root.style.setProperty('--ve-t3-color-scheme', theme.scheme);
  }
  for (const [name, value] of Object.entries(theme?.tokens || {})) {
    if (Object.hasOwn(THEME_TOKENS, name) && typeof value === 'string' && value !== '') {
      root.style.setProperty(`--ve-t3-${name}`, value);
    }
  }
}
