import {createClippingLift} from '@webconsulting/visual-editor-enhancements/Shared/overflow-clipping.js';

/**
 * The one place this extension reaches into the Visual Editor's own runtime.
 * Each patch first checks whether upstream already ships the behaviour and
 * turns itself off in that case, so an upstream release never gets patched
 * twice.
 *
 * Audited against friendsoftypo3/visual-editor 1.10.2: ve-editable-rich-text
 * has no toolbar placement logic and editable.css pins the CKEditor toolbar to
 * `bottom: 100%` with no viewport-top handling and no escape from an
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
 * While the editable has focus: lift `overflow: hidden` off its ancestors so
 * the floating toolbar is not clipped away, and flip the toolbar below the
 * editable when it sits too close to the top of the viewport for a toolbar
 * above it (the `ve-toolbar-below` class is styled in editable-overrides.css).
 */
function installToolbarPlacement(editableRichText) {
  if (editableRichText.visualEditorEnhancementsToolbarInstalled) {
    return;
  }

  const ckEditorEl = editableRichText.querySelector('.ck-editor');
  if (!ckEditorEl || !editableRichText.editor?.ui?.focusTracker) {
    return;
  }

  editableRichText.visualEditorEnhancementsToolbarInstalled = true;
  const clipping = createClippingLift(editableRichText);
  const placeToolbar = () => ckEditorEl.classList.toggle(
    've-toolbar-below',
    ckEditorEl.getBoundingClientRect().top < 140,
  );
  editableRichText.editor.ui.focusTracker.on('change:isFocused', (_evt, _name, isFocused) => {
    if (isFocused) {
      clipping.lift();
      placeToolbar();
      window.addEventListener('scroll', placeToolbar, {passive: true, capture: true});
      window.addEventListener('resize', placeToolbar, {passive: true});
    } else {
      clipping.restore();
      window.removeEventListener('scroll', placeToolbar, {capture: true});
      window.removeEventListener('resize', placeToolbar);
    }
  });
}
