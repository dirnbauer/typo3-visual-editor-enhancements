/**
 * The chooser fields that are attributes of one editable output field, out of
 * the ?veFieldOptions=1 payload. Dependency-free so it can be unit tested with
 * plain Node.
 *
 * A field in a labeled form palette (core content elements) resolves to its
 * palette mates - the header palette's type/position/link for the header. A
 * flat field (the common Content Blocks layout) has no palette, so its
 * companions are taken from the TYPO3 naming convention <stem>_<suffix>, where
 * the editable output is the stem minus a trailing content suffix
 * (header -> header_*, primary_button_text -> primary_button_*). A field with
 * no attributes of its own yields an empty list, so no button is shown for it.
 *
 * @param {string} anchorName the field name of the hovered editable output
 * @param {{fieldPalettes?: Record<string, string>, fields?: Array<{name: string}>}} payload
 * @return {Array<{name: string}>}
 */
export function relatedFields(anchorName, payload) {
  const palettes = payload.fieldPalettes || {};
  const fields = payload.fields || [];
  const anchorPalette = palettes[anchorName] ?? '';
  if (anchorPalette !== '') {
    return fields.filter((field) => palettes[field.name] === anchorPalette);
  }
  const prefix = anchorName.replace(/_(text|label)$/, '') + '_';
  return fields.filter((field) => field.name.startsWith(prefix));
}
