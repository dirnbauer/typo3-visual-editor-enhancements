import {createClippingLift} from '@webconsulting/visual-editor-enhancements/Shared/overflow-clipping.js';
import {ViewportTracker} from '@webconsulting/visual-editor-enhancements/Shared/dom-utils.js';
import {placeToolbar, toolbarMaxWidth} from '@webconsulting/visual-editor-enhancements/Shared/toolbar-placement.js';

/**
 * The one place this extension reaches into the Visual Editor's own runtime.
 * Each patch first checks whether upstream already ships the behaviour and
 * turns itself off in that case, so an upstream release never gets patched
 * twice.
 *
 * Audited against friendsoftypo3/visual-editor 1.10.3: ve-editable-rich-text
 * has no toolbar placement logic and editable.css pins the CKEditor toolbar to
 * `bottom: 100%; left: 0` with no viewport handling and no escape from an
 * `overflow: hidden` ancestor - see Documentation/Compatibility.rst.
 */
patchRichTextToolbarPlacement();

function patchRichTextToolbarPlacement() {
  customElements.whenDefined('ve-editable-rich-text').then(() => {
    const EditableRichText = customElements.get('ve-editable-rich-text');
    if (!EditableRichText?.prototype?.firstUpdated || EditableRichText.prototype.firstUpdated.visualEditorEnhancementsWrapped) {
      return;
    }

    const currentFirstUpdated = Function.prototype.toString.call(EditableRichText.prototype.firstUpdated);
    if (currentFirstUpdated.includes('ve-toolbar-below')) {
      return;
    }

    const originalFirstUpdated = EditableRichText.prototype.firstUpdated;
    const patchedFirstUpdated = async function (...args) {
      await originalFirstUpdated.apply(this, args);
      installToolbarPlacement(this);
    };
    patchedFirstUpdated.visualEditorEnhancementsWrapped = true;
    EditableRichText.prototype.firstUpdated = patchedFirstUpdated;
  });
}

/**
 * The part of the viewport a toolbar can be seen in: the document's client
 * box, which excludes a classic scrollbar (window.innerWidth includes it).
 * @return {{width: number, height: number}}
 */
const visibleViewport = () => ({
  width: document.documentElement.clientWidth || window.innerWidth,
  height: document.documentElement.clientHeight || window.innerHeight,
});

/**
 * While the editable has focus: lift `overflow: hidden` off its ancestors so
 * the floating toolbar is not clipped away, and keep the toolbar inside the
 * viewport - above the editable when there is room, below it otherwise, over
 * its first lines when neither fits, and never past the left or right edge.
 * The geometry is Shared/toolbar-placement.js; the result reaches the CSS in
 * editable-overrides.css as the `ve-toolbar-below` / `ve-toolbar-inside`
 * classes and the `--ve-toolbar-*` custom properties on the .ck-editor.
 */
function installToolbarPlacement(editableRichText) {
  if (editableRichText.visualEditorEnhancementsToolbarInstalled) {
    return;
  }

  const ckEditorEl = editableRichText.querySelector('.ck-editor');
  const toolbarPanel = ckEditorEl?.querySelector('.ck-editor__top');
  const focusTracker = editableRichText.editor?.ui?.focusTracker;
  if (!ckEditorEl || !toolbarPanel || !focusTracker) {
    return;
  }

  editableRichText.visualEditorEnhancementsToolbarInstalled = true;
  const clipping = createClippingLift(editableRichText);

  const place = () => {
    const viewport = visibleViewport();
    // The width comes first: it decides how many rows the toolbar wraps
    // into, and the rows decide whether it still fits above.
    ckEditorEl.style.setProperty('--ve-toolbar-max-width', `${toolbarMaxWidth(viewport)}px`);
    const toolbar = (toolbarPanel.querySelector('.ck-toolbar') ?? toolbarPanel).getBoundingClientRect();
    if (toolbar.width === 0 || toolbar.height === 0) {
      // Not shown yet (upstream displays it once CKEditor marks the editable
      // focused); the ResizeObserver below calls again when it is laid out.
      return;
    }

    const editor = ckEditorEl.getBoundingClientRect();
    const placement = placeToolbar({editor, toolbar, viewport});
    // The shift is corrected from where the toolbar really is, so a border or
    // padding on the containing block can never accumulate an error.
    const shift = parseFloat(ckEditorEl.style.getPropertyValue('--ve-toolbar-left')) || 0;
    ckEditorEl.style.setProperty('--ve-toolbar-left', `${Math.round(shift + placement.left - toolbar.left)}px`);
    ckEditorEl.style.setProperty('--ve-toolbar-top', `${Math.round(placement.top - editor.top)}px`);
    ckEditorEl.classList.toggle('ve-toolbar-below', placement.side === 'below');
    ckEditorEl.classList.toggle('ve-toolbar-inside', placement.side === 'inside');
  };

  let frame = 0;
  const schedule = () => {
    if (frame) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const viewportTracker = new ViewportTracker(schedule);
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;

  focusTracker.on('change:isFocused', (_evt, _name, isFocused) => {
    if (isFocused) {
      clipping.lift();
      place();
      viewportTracker.start();
      sizeObserver?.observe(toolbarPanel);
    } else {
      viewportTracker.stop();
      sizeObserver?.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      clipping.restore();
    }
  });
}
