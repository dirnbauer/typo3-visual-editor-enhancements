import {css, html, LitElement} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {lll} from '@typo3/core/lit-helper.js';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {isEditableLinksEnabled} from '@webconsulting/visual-editor-enhancements/Shared/config.js';
import {clamp, viewportSize, ViewportTracker} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {linkIconSvg} from '@webconsulting/visual-editor-enhancements/Shared/icons.js';
import {createClippingLift} from '@webconsulting/visual-editor-enhancements/Shared/overflow-clipping.js';
import {requestLinkEdit} from '@webconsulting/visual-editor-enhancements/Shared/link-edit-request.js';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';

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
    this.viewportTracker = new ViewportTracker(() => this.#scheduleSync());
    this.clipping = createClippingLift(this);
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
    this.viewportTracker.stop();
    this.clipping.restore();
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
        this.clipping.lift();
        this.viewportTracker.start();
      } else {
        this.buttonStyle = '';
        this.viewportTracker.stop();
        this.clipping.restore();
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
    const {width: viewportWidth, height: viewportHeight} = viewportSize(buttonSize);
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
        ${unsafeHTML(linkIconSvg(20, 'linkIcon'))}
      </button>
    `;
  }

  static styles = [themeTokens, css`
    :host {
      display: inline-block;
      inline-size: 0;
      block-size: 0;
      vertical-align: middle;
      overflow: visible;
    }

    /* Icon-only square "edit link" button floating near the link it edits. It
       matches the sibling CTA's height (2.25rem, which also clears the WCAG 2.5.8
       target size) and takes the site's button radius (--radius) where the site
       defines one, so it reads as belonging to the button; colours are the
       backend's primary pair, legible on light and dark sections alike.

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
      border: 1px solid color-mix(in srgb, var(--ve-on-primary) 28%, var(--ve-primary));
      border-radius: var(--radius, var(--ve-radius-small));
      background: var(--ve-primary);
      color: var(--ve-on-primary);
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      box-shadow: var(--ve-shadow);
      transform: scale(0.92);
      transition: opacity 0.12s ease, transform 0.12s ease, background-color 0.12s ease;
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
      background: var(--ve-primary-hover);
    }

    /* surface ring inside, focus colour outside: visible on any background */
    .linkButton:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--ve-surface-raised), 0 0 0 4px var(--ve-focus);
    }

    @media (prefers-reduced-motion: reduce) {
      .linkButton { transition: opacity 0.12s ease; }
    }
  `];
}

customElements.define('ve-editable-link', VeEditableLink);
