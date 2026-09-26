import {BalloonPanelView} from '@ckeditor/ckeditor5-ui';
import {Rect, ResizeObserver, toUnit} from '@ckeditor/ckeditor5-utils';

/**
 * The one place this extension reaches into the Visual Editor's own runtime.
 * Each patch first checks whether upstream already ships the behaviour and
 * turns itself off in that case, so an upstream release never gets patched
 * twice.
 *
 * Audited against friendsoftypo3/visual-editor 1.10.3: ve-editable-rich-text
 * mounts a ClassicEditor, and editable.css "simulates" CKEditor's
 * InlineEditor by pinning the classic toolbar above the editable
 * (`position: absolute; bottom: 100%`). That toolbar is cut off at the top of
 * the viewport and by every `overflow: hidden` ancestor - see
 * Documentation/Compatibility.rst.
 */
const toPx = toUnit('px');

/**
 * Space between the toolbar and the editable: the Visual Editor draws a 4px
 * focus outline outside the editable, plus 4px of air.
 */
const TOOLBAR_GAP = 8;

// Installed on the first focus of each rich-text field rather than by
// wrapping the component's firstUpdated: this module and the Visual Editor's
// load in no fixed order, and when theirs came first no editor on the page got
// the toolbar. On focus the editor exists, whatever the order was.
document.addEventListener('focusin', (event) => {
  const host = event.target instanceof Element ? event.target.closest('ve-editable-rich-text') : null;
  if (host !== null) {
    installInlineToolbar(host);
  }
}, {capture: true});

const alreadyFocused = document.activeElement?.closest?.('ve-editable-rich-text');
if (alreadyFocused) {
  installInlineToolbar(alreadyFocused);
}

/**
 * Gives the ClassicEditor the toolbar of CKEditor's InlineEditor - the editor
 * editable.css simulates. TYPO3 ships no @ckeditor/ckeditor5-editor-inline,
 * so this does what InlineEditorUIView and InlineEditorUI (CKEditor 47.6) do,
 * with CKEditor's own classes: the toolbar moves into a BalloonPanelView in
 * the editor's body collection - outside the page, where no `overflow:
 * hidden` ancestor can clip it - which is shown while the editor has focus
 * and pinned to the editable. CKEditor's positioning picks the side that fits
 * the viewport and follows scrolling and resizing.
 *
 * Only a ClassicEditor has its toolbar in a sticky panel; should upstream
 * switch to InlineEditor, this does nothing. Runs once per field.
 */
function installInlineToolbar(editableRichText) {
  const editor = editableRichText.editor;
  const ui = editor?.ui;
  const view = ui?.view;
  const toolbar = view?.toolbar;
  const editableElement = ui?.getEditableElement();
  if (editableRichText.visualEditorEnhancementsToolbarInstalled || !toolbar || !view.stickyPanel || !view.body || !editableElement) {
    return;
  }
  editableRichText.visualEditorEnhancementsToolbarInstalled = true;
  // editable-overrides.css hides the then empty top panel of exactly these
  // editors; any other keeps the Visual Editor's own toolbar.
  editableRichText.setAttribute('data-ve-inline-toolbar', '');

  // InlineEditorUIView#constructor and #render.
  const panel = new BalloonPanelView(editor.locale);
  panel.extendTemplate({attributes: {class: 'ck-toolbar-container'}});
  view.body.add(panel);
  view.stickyPanel.content.remove(toolbar);
  panel.content.add(toolbar);

  // InlineEditorUIView#render: the toolbar is as wide as the editable. Set
  // once right away as well - the observer reports asynchronously, and the
  // first pin below must already measure the wrapped toolbar.
  const matchEditableWidth = () => {
    toolbar.maxWidth = toPx(new Rect(editableElement).width);
  };
  matchEditableWidth();
  const resizeObserver = new ResizeObserver(editableElement, matchEditableWidth);
  editor.on('destroy', () => resizeObserver.destroy());

  // InlineEditorUIView#_getPanelPositionTop and #_getPanelPositions, plus the
  // gap: above the editable when it fits, at the top of the viewport while a
  // long editable is scrolled past its top, below it otherwise.
  const panelTop = (editableRect, panelRect) => {
    const viewportTop = ui.viewportOffset?.visualTop || 0;
    if (editableRect.top > panelRect.height + TOOLBAR_GAP + viewportTop) {
      return editableRect.top - panelRect.height - TOOLBAR_GAP;
    }
    if (editableRect.bottom > panelRect.height + viewportTop + 50) {
      return viewportTop;
    }

    return editableRect.bottom + TOOLBAR_GAP;
  };
  const positions = [
    (editableRect, panelRect) => ({
      top: panelTop(editableRect, panelRect),
      left: editableRect.left,
      name: 'toolbar_west',
      config: {withArrow: false},
    }),
    (editableRect, panelRect) => ({
      top: panelTop(editableRect, panelRect),
      left: editableRect.left + editableRect.width - panelRect.width,
      name: 'toolbar_east',
      config: {withArrow: false},
    }),
  ];
  if (editor.locale.uiLanguageDirection !== 'ltr') {
    positions.reverse();
  }

  // InlineEditorUI#_initToolbar, plus one pin right away: this runs while
  // the field is getting focus, so it is visible already.
  const pin = () => {
    if (panel.isVisible) {
      panel.pin({target: editableElement, positions});
    }
  };
  panel.bind('isVisible').to(ui.focusTracker, 'isFocused');
  panel.listenTo(ui, 'update', pin);
  pin();
}
