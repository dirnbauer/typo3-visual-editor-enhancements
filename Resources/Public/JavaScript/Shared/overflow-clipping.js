/**
 * Temporarily lifts `overflow: hidden|clip` off an element's ancestors.
 *
 * The link button renders OUTSIDE the box it belongs to, floating next to its
 * anchor. A single `overflow: hidden` anywhere up the tree - every card,
 * teaser and slider has one - clips it away. (The rich-text toolbar used this
 * too until 1.3.2; it now lives in a CKEditor balloon panel in <body>.)
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
