import {fieldChooserMode, fieldChooserTables, isContextButtonsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config';
import {fetchFieldOptions} from '@webconsulting/visual-editor-enhancements/Shared/field-options-cache';

/**
 * Editable outputs (<ve-editable-text>, <ve-editable-rich-text>) the hover
 * listeners are already attached to. The repeated injection sweeps in
 * Frontend/index.js re-scan every content element (which also picks up
 * late-rendered outputs), so the WeakSet keeps the per-output attach
 * idempotent.
 */
const attachedOutputs = new WeakSet();

/** @type {Promise<import('./components/ve-context-chip').VeContextChip>|null} */
let chipPromise = null;

/**
 * Lazily imports the shared singleton context button; the promise is cached so
 * every output drives the same instance.
 * @return {Promise<import('./components/ve-context-chip').VeContextChip>}
 */
function contextChip() {
  chipPromise ??= import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-context-chip')
    .then((module) => module.getContextChip());
  return chipPromise;
}

/**
 * Attaches the per-output context affordance to one content element: hovering
 * (or focusing) a vendor-marked editable output inside it shows a small
 * floating button that opens the field chooser scoped to the backend form
 * group of that output's field - e.g. the "header" output leads to the header
 * palette fields. The action-bar button keeps opening the full popover.
 * Applied to every <ve-content-element> by the shared injection pass in
 * Frontend/index.js; elements whose table is not enabled for the field chooser
 * (or that the user may not modify) are skipped. <ve-editable-link> outputs
 * keep their own dedicated link buttons and are deliberately not scanned here;
 * text outputs inside a link-edited button (a CTA's label) are suppressed too,
 * so one website button never stacks a second floating affordance next to its
 * link button.
 * @param {Element} contentElement
 */
export function attachElementContextAffordance(contentElement) {
  if (!isContextButtonsEnabled()
    || fieldChooserMode() === 'disabled'
    || !fieldChooserTables().includes(contentElement.getAttribute('table'))
    || !contentElement.hasAttribute('canModifyRecord')
  ) {
    return;
  }
  // HTML getAttribute() is case-insensitive, so the camel-case attribute names
  // of <ve-content-element> resolve as-is.
  const record = {
    table: contentElement.getAttribute('table'),
    uid: Number(contentElement.getAttribute('uid')),
    elementName: contentElement.getAttribute('elementName') ?? '',
  };
  for (const output of contentElement.querySelectorAll('ve-editable-text, ve-editable-rich-text')) {
    if (attachedOutputs.has(output)) {
      continue;
    }
    attachedOutputs.add(output);
    if (hasOwnLinkEditButton(output)) {
      continue;
    }
    attachOutputAffordance(output, record);
  }
}

/**
 * True when the output sits inside a link or button that carries its own
 * link-edit affordance (a <ve-editable-link> rendered as the interactive
 * element's next sibling or direct child - the two anchor placements the
 * link ViewHelper documents). A CTA's label already offers inline text
 * editing plus the floating link button; a third floating button for the
 * same spot only adds noise, so the context button is suppressed there.
 * The element's other outputs and the action-bar button still reach the
 * field settings.
 * @param {Element} output
 * @return {boolean}
 */
function hasOwnLinkEditButton(output) {
  for (let node = output.parentElement; node !== null && node.tagName !== 'VE-CONTENT-ELEMENT'; node = node.parentElement) {
    if (node.tagName !== 'A' && node.tagName !== 'BUTTON') {
      continue;
    }
    if (node.nextElementSibling?.tagName === 'VE-EDITABLE-LINK') {
      return true;
    }
    for (const child of node.children) {
      if (child.tagName === 'VE-EDITABLE-LINK') {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * The hover-button affordance for one editable output. This function is the
 * swappable seam: future per-output affordances (a context menu, an inline
 * toolbar, ...) replace this attach logic while the scan above stays as-is.
 * @param {Element} output
 * @param {{table: string, uid: number, elementName: string}} record
 */
function attachOutputAffordance(output, record) {
  // Guards the async race between hover and the field-options fetch: when the
  // pointer already left (or focus moved on) before the fetch resolved, the
  // button must not appear after the fact.
  let hovering = false;
  const show = async () => {
    hovering = true;
    let payload;
    try {
      payload = await fetchFieldOptions(record.table, record.uid);
    } catch {
      return; // endpoint failure: silently show no button
    }
    const anchorGroup = payload.fieldGroups?.[output.getAttribute('field')] ?? '';
    const relevant = (payload.fields || []).filter((field) => field.group === anchorGroup);
    if (!hovering || !anchorGroup || relevant.length === 0) {
      return;
    }
    const chip = await contextChip();
    if (!hovering) {
      return;
    }
    chip.showFor(output, (outputElement, buttonRect) => openScopedChooser(record, anchorGroup, buttonRect));
  };
  const hide = () => {
    hovering = false;
    // Only an already-created chip can be visible - never trigger the lazy
    // import just to hide. Chaining on the pending promise still hides a chip
    // whose import is in flight.
    if (chipPromise !== null) {
      chipPromise.then((chip) => chip.scheduleHide());
    }
  };
  output.addEventListener('pointerenter', show);
  output.addEventListener('focusin', show);
  output.addEventListener('pointerleave', hide);
  output.addEventListener('focusout', hide);
}

/**
 * Opens the field chooser popover scoped to one backend form group, anchored
 * to the context button the user activated.
 * @param {{table: string, uid: number, elementName: string}} record
 * @param {string} scopeGroup
 * @param {DOMRect} anchorRect
 */
async function openScopedChooser(record, scopeGroup, anchorRect) {
  const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser');
  openFieldChooser({
    table: record.table,
    uid: record.uid,
    elementName: record.elementName,
    anchorRect,
    scopeGroup,
  });
}
