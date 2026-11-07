import {translate} from './dom-utils.js';
import {collectionReason, inlineLabel} from './inline-record-actions.js';

/**
 * What the two collection buttons of the action bar may do, decided from the
 * capability payload (?veFieldOptions=1, the FormEngine-backed field list) the
 * buttons fetch on click. Pure, so the refusal reasons are node-tested.
 *
 * @param {{fields?: Array<{type: string, canCreate?: boolean, createReason?: string}>}} data
 * @return {{collections: object[], creatable: object[], entriesReason: string, addReason: string}}
 *   an empty reason means "allowed"
 */
export function collectionCapability(data) {
  const collections = (data?.fields ?? []).filter((field) => field?.type === 'inline');
  const creatable = collections.filter((field) => field.canCreate === true && !field.createReason);
  const none = translate('frontend.actionBar.noCollections', 'This element has no entries you can edit here.');
  let addReason = '';
  if (collections.length === 0) {
    addReason = none;
  } else if (creatable.length === 0) {
    addReason = collectionReason(collections.find((field) => field.createReason)?.createReason) || inlineLabel('controls');
  }
  return {collections, creatable, entriesReason: collections.length === 0 ? none : '', addReason};
}
