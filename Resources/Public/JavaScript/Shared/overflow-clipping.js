/**
 * Temporarily lifts `overflow: hidden|clip` off an element's ancestors.
 *
 * Both floating affordances of this extension render OUTSIDE the box they
 * belong to: the CKEditor toolbar floats above its editable, the link button
 * floats next to its anchor. A single `overflow: hidden` anywhere up the tree
 * - every card, teaser and slider has one - clips them away, which reads as
 * "the toolbar has no icons to click" rather than as a CSS problem.
 *
 * Lifting is scoped to the interaction: lift() on focus, restore() on blur,
 * so the page keeps its own clipping the rest of the time. Both calls are
 * idempotent, and restore() puts back the exact inline value that was there
 * (including "no inline value at all").
 *
 * @param {Element} element the element whose ancestors may clip it
 * @return {{lift: () => void, restore: () => void}}
 */
export function createClippingLift(element) {
  /** @type {Array<[HTMLElement, string]>} ancestor + its previous inline overflow */
  const clipped = [];

  return {
    lift() {
      if (clipped.length > 0) {
        return;
      }
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflow;
        if (overflow === 'hidden' || overflow === 'clip') {
          clipped.push([node, node.style.overflow]);
          node.style.setProperty('overflow', 'visible', 'important');
        }
      }
    },
    restore() {
      while (clipped.length) {
        const [node, previous] = clipped.pop();
        if (previous) {
          node.style.overflow = previous;
        } else {
          node.style.removeProperty('overflow');
        }
      }
    },
  };
}
