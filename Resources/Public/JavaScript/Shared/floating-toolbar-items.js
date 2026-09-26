/**
 * The item list of the floating rich-text toolbar, as pure data: no DOM, no
 * CKEditor import, so it runs under plain Node.
 */

/**
 * The buttons the toolbar always shows, in this order. Every other item the
 * RTE preset configures goes into the "Show more items" group behind them; a
 * button the preset does not configure is left out, never added.
 */
export const ALWAYS_VISIBLE = ['bold', 'italic', 'link', 'bulletedList'];

/**
 * Rearranges a normalized CKEditor toolbar item list into one short row: the
 * ALWAYS_VISIBLE buttons the list has, then one nested group - CKEditor's
 * standard `{label, icon, items}` toolbar group - with everything else in
 * configuration order. Line breaks are dropped (a floating toolbar has one
 * row), and so are separators that lose a neighbour.
 *
 * @param {Array<string|object>} items the `items` of normalizeToolbarConfig()
 * @param {string} moreLabel the group's label, already translated
 * @return {Array<string|object>}
 */
export function floatingToolbarItems(items, moreLabel) {
  const visible = ALWAYS_VISIBLE.filter((name) => items.includes(name));
  const others = items.filter((item) => item !== '-' && !visible.includes(item));
  const more = others.filter((item, index) => item !== '|'
    || (index > 0 && index < others.length - 1 && others[index - 1] !== '|'));
  if (!more.some((item) => item !== '|')) {
    return visible;
  }

  return [...visible, {label: moreLabel, icon: 'threeVerticalDots', items: more}];
}
