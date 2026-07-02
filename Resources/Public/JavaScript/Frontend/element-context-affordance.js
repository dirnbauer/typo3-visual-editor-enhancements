import {fieldChooserMode, fieldChooserTables, isContextButtonsEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config';

/**
 * Content elements a context affordance is already attached to. The hover
 * listeners live on the <ve-content-element> host (not in its shadow root),
 * so unlike the action-bar buttons there is no DOM marker to check - the
 * WeakSet keeps the repeated injection sweeps in Frontend/index.js idempotent.
 */
const attached = new WeakSet();

/** @type {{attach: (contentElement: Element, activate: (contentElement: Element, anchorRect: DOMRect) => void) => void}|null} */
let implementation = null;

/**
 * Attaches the per-element context affordance - currently a floating chip
 * shown on hover/focus that opens the field chooser - to one content element.
 * Applied to every <ve-content-element> by the shared injection pass in
 * Frontend/index.js; elements whose table is not enabled for the field
 * chooser (or that the user may not modify) are skipped.
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
  if (attached.has(contentElement)) {
    return;
  }
  attached.add(contentElement);
  (implementation ??= createChipAffordance()).attach(contentElement, openChooserFor);
}

/**
 * Opens the field chooser popover for a content element, anchored to the
 * affordance the user activated. HTML getAttribute() is case-insensitive, so
 * the camel-case attribute names of <ve-content-element> resolve as-is.
 * @param {Element} contentElement
 * @param {DOMRect} anchorRect
 */
async function openChooserFor(contentElement, anchorRect) {
  const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser');
  openFieldChooser({
    table: contentElement.getAttribute('table'),
    uid: Number(contentElement.getAttribute('uid')),
    cType: contentElement.getAttribute('cType') ?? '',
    elementName: contentElement.getAttribute('elementName') ?? '',
    anchorRect,
  });
}

/**
 * The hover-chip affordance: one shared floating <ve-context-chip> button
 * follows the hovered/focused content element and activates the chooser on
 * click. This factory is the swappable seam - future affordances (an
 * action-bar-only mode, a context menu, ...) implement the same
 * {attach(contentElement, activate)} contract and are swapped in here.
 * @return {{attach: (contentElement: Element, activate: (contentElement: Element, anchorRect: DOMRect) => void) => void}}
 */
function createChipAffordance() {
  /** @type {Promise<import('./components/ve-context-chip').VeContextChip>|null} */
  let chipPromise = null;
  const chip = () => {
    chipPromise ??= import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-context-chip')
      .then((module) => module.getContextChip());
    return chipPromise;
  };
  return {
    attach(contentElement, activate) {
      // Show and hide chain on the same promise, so a pointerleave during the
      // initial lazy import still runs after the show and hides the chip again.
      const show = () => chip().then((instance) => instance.showFor(contentElement, activate));
      const hide = () => chip().then((instance) => instance.scheduleHide());
      contentElement.addEventListener('pointerenter', show);
      contentElement.addEventListener('focusin', show);
      contentElement.addEventListener('pointerleave', hide);
      contentElement.addEventListener('focusout', hide);
    },
  };
}
