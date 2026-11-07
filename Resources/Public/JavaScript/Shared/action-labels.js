/**
 * Short words for the vendor's four action-bar buttons ("Delete" instead of
 * "Delete content element"). Pure, so the containment rule is node-tested.
 *
 * The vendor binds `title` and `aria-label` to its own labels
 * (lll('frontend.editContentElement') and friends); those bindings stay
 * untouched. A short word is used as visible text only when
 *  - the vendor label key identifies the button (its aria-label equals the
 *    label the vendor rendered from TYPO3.lang), and
 *  - our short key exists in TYPO3.lang, and
 *  - the short word is a case-insensitive substring of the button's current
 *    aria-label.
 * Otherwise the label stays the verbatim accessible name, so the visible
 * text is always contained in the accessible name in every language
 * (WCAG 2.5.3 "Label in Name").
 */

/** vendor label key -> our short key suffix (frontend.actionBar.short.<suffix>) */
export const VENDOR_SHORT_KEYS = Object.freeze({
  'frontend.editContentElement': 'edit',
  'frontend.showContentElement': 'show',
  'frontend.deleteContentElement': 'delete',
  'frontend.addContentElementButton': 'add',
});

/**
 * @param {string} ariaLabel the button's current accessible name
 * @param {Record<string, string>|undefined|null} lang TYPO3.lang
 * @return {string|null} the short word, or null to show the verbatim name
 */
export function shortVendorLabel(ariaLabel, lang) {
  if (typeof ariaLabel !== 'string' || ariaLabel.trim() === '' || !lang) {
    return null;
  }
  for (const [vendorKey, suffix] of Object.entries(VENDOR_SHORT_KEYS)) {
    if (typeof lang[vendorKey] !== 'string' || lang[vendorKey] !== ariaLabel) {
      continue;
    }
    const short = lang[`frontend.actionBar.short.${suffix}`];
    if (typeof short !== 'string' || short.trim() === '') {
      return null;
    }
    return isContainedIn(short, ariaLabel) ? short.trim() : null;
  }
  return null;
}

/**
 * Case-insensitive, locale-aware substring test.
 * @param {string} needle
 * @param {string} haystack
 * @return {boolean}
 */
export function isContainedIn(needle, haystack) {
  return haystack.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());
}
