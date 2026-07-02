import {css, html, LitElement} from 'lit';
import {lll} from '@typo3/core/lit-helper.js';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {isEditableLinksEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config';
import {requestLinkEdit} from '@webconsulting/visual-editor-enhancements/Shared/link-edit-request';

/**
 * Inline editor for pure TCA type=link fields: renders a floating link icon
 * near the (separately editable or derived) link text. Clicking it asks the
 * backend frame to open the TYPO3 link browser; the chosen typolink value
 * travels back via the shared link-edit bridge (Shared/link-edit-request) and
 * is staged on the editor's pending change list (written with the next
 * explicit save, like an inline text edit) - never saved to the database on
 * its own.
 *
 * Rendered by the ve:render.link ViewHelper in edit mode only.
 *
 * @extends {HTMLElement}
 */
export class VeEditableLink extends LitElement {
  static properties = {
    table: {type: String},
    uid: {type: Number},
    field: {type: String},
    value: {type: String},
    name: {type: String},
    linkBrowserUrl: {type: String},
    active: {type: Boolean, state: true, attribute: false},
    buttonStyle: {type: String, state: true, attribute: false},
  };

  constructor() {
    super();
    this.value = this.getAttribute('value') ?? '';
    // The link value present when the editor loaded: the baseline the change
    // list diffs against, so reverting to it clears the pending change.
    this.valueInitial = this.value;
    // The button floats outside the edited element and stays hidden until its
    // sibling field is being edited.
    this.active = false;
    this.buttonStyle = '';
    this.hovered = false;
    this.pointerActivated = false;
    this.syncRaf = 0;
    this.trackingViewport = false;
    this.clippedAncestors = [];
    this.focusAnchor = null;
    this.onFocusChange = (event) => {
      this.#rememberFocusAnchor(event);
      this.#scheduleSync();
    };
    this.onPointerDown = (event) => {
      const anchor = this.#anchorFromEvent(event);
      this.pointerActivated = anchor !== null;
      if (anchor !== null) {
        this.focusAnchor = anchor;
      }
      this.#scheduleSync();
    };
    this.onViewportChange = () => this.#scheduleSync();
  }

  connectedCallback() {
    super.connectedCallback();
    // focusin/focusout are composed, so they fire here even when the focus moves
    // into the editable text's shadow DOM (the contenteditable).
    document.addEventListener('focusin', this.onFocusChange);
    document.addEventListener('focusout', this.onFocusChange);
    document.addEventListener('pointerdown', this.onPointerDown, true);
  }

  disconnectedCallback() {
    document.removeEventListener('focusin', this.onFocusChange);
    document.removeEventListener('focusout', this.onFocusChange);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    this.#stopViewportTracking();
    this.#restoreClipping();
    if (this.syncRaf) {
      cancelAnimationFrame(this.syncRaf);
      this.syncRaf = 0;
    }
    super.disconnectedCallback();
  }

  firstUpdated() {
    dataHandlerStore.setInitialData(this.table, this.uid, this.field, this.valueInitial);
  }

  /**
   * Recompute on the next frame: a focusout->focusin move fires focusout first,
   * when :focus-within is briefly false; waiting a frame lets it settle so the
   * button does not flicker when focus crosses between the text and the button.
   */
  #scheduleSync() {
    if (this.syncRaf) {
      cancelAnimationFrame(this.syncRaf);
    }
    this.syncRaf = requestAnimationFrame(() => {
      this.syncRaf = 0;
      this.#sync();
    });
  }

  /**
   * Visible while the edited field's group has focus, while the pointer is
   * over the button, or while the button itself holds focus - the last two keep
   * it reachable when the pointer/focus leaves the text to actually click it.
   */
  #sync() {
    const group = this.#anchorElement();
    const next = this.hovered
      || this.pointerActivated
      || this.matches(':focus-within')
      || (group !== null && typeof group.matches === 'function' && group.matches(':focus-within'));

    if (next && group !== null) {
      this.#positionButton(group);
    }

    if (next !== this.active) {
      this.active = next;
      if (next) {
        this.#liftClipping();
        this.#startViewportTracking();
      } else {
        this.buttonStyle = '';
        this.#stopViewportTracking();
        this.#restoreClipping();
      }
    }
  }

  #anchorElement() {
    if (this.focusAnchor !== null && this.focusAnchor.isConnected) {
      return this.focusAnchor;
    }
    return this.previousElementSibling ?? this.parentElement;
  }

  #rememberFocusAnchor(event) {
    if (event.type !== 'focusin') {
      return;
    }

    const anchor = this.#anchorFromEvent(event);
    if (anchor !== null) {
      this.focusAnchor = anchor;
    }
  }

  #anchorFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(this)) {
      return null;
    }

    const previous = this.previousElementSibling;
    const targetedControl = this.#targetedControlFromPath(path, previous);
    if (targetedControl !== null) {
      return targetedControl;
    }

    for (const node of path) {
      if (!(node instanceof Element) || node === this) {
        continue;
      }
      if (node.nextElementSibling === this) {
        return node;
      }
    }

    if (
      previous !== null
      && path.some((node) => node instanceof Node && (node === previous || previous.contains(node)))
    ) {
      return previous;
    }

    return null;
  }

  #targetedControlFromPath(path, scope) {
    for (const node of path) {
      if (!(node instanceof Element)) {
        continue;
      }

      const control = this.#controlForNode(node, scope);
      if (control !== null) {
        return control;
      }
    }

    return null;
  }

  #controlForNode(node, scope) {
    const control = this.#closestControl(node);
    if (control === null) {
      return null;
    }

    if (scope === null) {
      return control;
    }

    if (control === scope || scope.contains(control)) {
      return control;
    }

    return null;
  }

  #closestControl(node) {
    if (node.matches('a[href], button, [data-slot="button"], [role="button"], [role="link"]')) {
      return node;
    }

    if (node.matches('ve-editable-text, ve-editable-rich-text')) {
      return node.closest('a[href], button, [data-slot="button"], [role="button"], [role="link"]') ?? node;
    }

    return null;
  }

  #positionButton(anchor) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    const buttonSize = 36;
    const gap = 8;
    const edge = 8;
    const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || buttonSize);
    const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || buttonSize);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const maxLeft = Math.max(edge, viewportWidth - buttonSize - edge);
    const maxTop = Math.max(edge, viewportHeight - buttonSize - edge);

    let left = rect.right + gap;
    let top = rect.top + (rect.height / 2) - (buttonSize / 2);

    if (left + buttonSize + edge > viewportWidth) {
      const leftSide = rect.left - buttonSize - gap;
      if (leftSide >= edge) {
        left = leftSide;
      } else {
        left = rect.right - buttonSize;
        top = rect.top - buttonSize - gap;
        if (top < edge && rect.bottom + gap + buttonSize <= viewportHeight - edge) {
          top = rect.bottom + gap;
        }
      }
    }

    left = clamp(left, edge, maxLeft);
    top = clamp(top, edge, maxTop);
    this.buttonStyle = `--ve-link-button-left:${Math.round(left)}px;--ve-link-button-top:${Math.round(top)}px;`;
  }

  #startViewportTracking() {
    if (this.trackingViewport) {
      return;
    }
    this.trackingViewport = true;
    window.addEventListener('scroll', this.onViewportChange, {passive: true, capture: true});
    window.addEventListener('resize', this.onViewportChange, {passive: true});
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', this.onViewportChange, {passive: true});
      window.visualViewport.addEventListener('resize', this.onViewportChange, {passive: true});
    }
  }

  #stopViewportTracking() {
    if (!this.trackingViewport) {
      return;
    }
    this.trackingViewport = false;
    window.removeEventListener('scroll', this.onViewportChange, {capture: true});
    window.removeEventListener('resize', this.onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('scroll', this.onViewportChange);
      window.visualViewport.removeEventListener('resize', this.onViewportChange);
    }
  }

  #liftClipping() {
    if (this.clippedAncestors.length > 0) {
      return;
    }
    for (let el = this.parentElement; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflow;
      if (overflow === 'hidden' || overflow === 'clip') {
        this.clippedAncestors.push([el, el.style.overflow]);
        el.style.setProperty('overflow', 'visible', 'important');
      }
    }
  }

  #restoreClipping() {
    while (this.clippedAncestors.length) {
      const [el, value] = this.clippedAncestors.pop();
      if (value) {
        el.style.overflow = value;
      } else {
        el.style.removeProperty('overflow');
      }
    }
  }

  #handlePointerEnter() {
    this.hovered = true;
    this.#sync();
  }

  #handlePointerLeave() {
    this.hovered = false;
    this.#scheduleSync();
  }

  #openLinkBrowser() {
    const currentValue = dataHandlerStore.data?.[this.table]?.[this.uid]?.[this.field] ?? this.value;
    const src = this.linkBrowserUrl + '&P%5BcurrentValue%5D=' + encodeURIComponent(currentValue);
    requestLinkEdit(
      {src, title: lll('frontend.editLink') || 'Edit link'},
      (value) => this.applyLink(value),
    );
  }

  /**
   * Stages the typolink chosen in the link browser on the editor's pending
   * change list via dataHandlerStore.setData - exactly like an inline text
   * edit. It is written to the database only on the next explicit save; setting
   * a link must never force an immediate save of all other pending changes.
   * @param {string} typolink
   */
  applyLink(typolink) {
    if (typolink === undefined || typolink === null || typolink === this.value) {
      return;
    }

    dataHandlerStore.setData(this.table, this.uid, this.field, typolink);
    this.value = typolink;
  }

  render() {
    // Respect the per-user Visual Editor setup toggle.
    if (!isEditableLinksEnabled()) {
      return html``;
    }
    const label = lll('frontend.editLink') || 'Edit link';
    const title = label + (this.name ? ': ' + this.name : '');
    // Icon-only square "edit link" button floating near the element it edits;
    // the field name lives in the tooltip / aria-label.
    return html`
      <button
        type="button"
        class="linkButton ${this.active ? 'is-active' : ''}"
        style="${this.buttonStyle}"
        tabindex="${this.active ? 0 : -1}"
        aria-hidden="${this.active ? 'false' : 'true'}"
        @pointerenter="${this.#handlePointerEnter}"
        @pointerleave="${this.#handlePointerLeave}"
        @click="${this.#openLinkBrowser}"
        title="${title}"
        aria-label="${title}"
      >
        <svg class="linkIcon" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="m13.7 3.8-1.4-1.4c-.8-.8-2-.8-2.8 0L5.9 5.9c-.8.8-.8 2 0 2.8l1.2 1.2.9-.8L6.9 8c-.4-.4-.4-1 0-1.4l3.2-3.2c.4-.4 1-.4 1.4 0l1.1 1.1c.4.4.4 1 0 1.4l-1.3 1.3c.2.4.4.9.4 1.4l2-2c.7-.8.7-2.1 0-2.8z"/>
          <path fill="currentColor" d="m8.9 6.1-.9.8L9.1 8c.4.4.4 1 0 1.4l-3.2 3.2c-.4.4-1 .4-1.4 0l-1.1-1.1c-.4-.4-.4-1 0-1.4l1.3-1.3c-.2-.4-.4-.9-.4-1.4l-2 2c-.8.8-.8 2 0 2.8l1.4 1.4c.8.8 2 .8 2.8 0l3.5-3.5c.8-.8.8-2 0-2.8L8.9 6.1z"/>
        </svg>
      </button>
    `;
  }

  static styles = css`
    :host {
      display: inline-block;
      inline-size: 0;
      block-size: 0;
      vertical-align: middle;
      overflow: visible;
      --ve-link-accent: var(--ve-accent-color, #7c5ac4);
    }

    /* Icon-only square "edit link" button floating near the link it edits. It matches
       the sibling CTA's height (shadcn h-9 = 2.25rem) and uses the button corner
       radius, so it reads as a rounded SQUARE (not a circle, not a pill) that
       belongs with the button. Solid brand purple + white icon stays legible on
       both light and dark sections; 2.25rem clears the WCAG 2.5.8 target size.

       Hidden until the field it edits is being edited - it appears only while
       the sibling text/link field, the button itself, or the pointer is on it
       (see #sync), so the editor stays uncluttered. It is fixed-positioned
       instead of inline, so narrow/full-width CTAs never lose space to it and
       overflow-clipped card sections cannot cut it off. */
    .linkButton {
      position: fixed;
      top: var(--ve-link-button-top, -1000px);
      left: var(--ve-link-button-left, -1000px);
      z-index: 100002;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 2.25rem;
      height: 2.25rem;
      margin: 0;
      padding: 0;
      border: 1px solid color-mix(in srgb, #fff 28%, var(--ve-link-accent));
      border-radius: var(--radius, 0.5rem);
      background: var(--ve-link-accent);
      color: #fff;
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
      transform: scale(0.92);
      transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
    }

    .linkButton.is-active {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    .linkIcon {
      display: block;
      width: 1.25rem;
      height: 1.25rem;
    }

    .linkButton.is-active:hover {
      background: color-mix(in srgb, var(--ve-link-accent) 86%, #000);
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.42);
    }

    /* dual ring (white inside, brand outside) stays visible on any background */
    .linkButton:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--ve-link-accent), 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    @media (prefers-reduced-motion: reduce) {
      .linkButton { transition: opacity 0.12s ease; }
    }
  `;
}

customElements.define('ve-editable-link', VeEditableLink);
