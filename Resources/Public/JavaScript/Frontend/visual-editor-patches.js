import {lll} from '@typo3/core/lit-helper.js';
import {flipInsertBefore} from '@typo3/visual-editor/Frontend/flip-insert-before';
import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';

patchDropZoneContainerParentHandling();
patchRichTextToolbarPlacement();

function patchDropZoneContainerParentHandling() {
  customElements.whenDefined('ve-drop-zone').then(() => {
    const DropZone = customElements.get('ve-drop-zone');
    if (!DropZone?.prototype?._drop || DropZone.prototype._drop.visualEditorEnhancementsWrapped) {
      return;
    }

    const currentDrop = Function.prototype.toString.call(DropZone.prototype._drop);
    if (currentDrop.includes('this.tx_container_parent > 0') && currentDrop.includes('removeAttribute')) {
      return;
    }

    const patchedDrop = async function (event) {
      const dataString = event.dataTransfer.getData('text/ve-drag');
      if (!dataString) {
        return;
      }
      event.preventDefault();
      const data = JSON.parse(dataString);

      const actionData = {
        action: 'paste',
        target: this.target,
        update: {
          colPos: this.colPos,
          ...(
            Number.isInteger(this.tx_container_parent) && this.tx_container_parent > 0
              ? {tx_container_parent: this.tx_container_parent}
              : {}
          ),
        },
      };

      if (event.dataTransfer.dropEffect === 'copy') {
        const question = dataHandlerStore.changesCount > 0 ? lll('frontend.confirmCopy.saveAll') : lll('frontend.confirmCopy');
        if (!confirm(question)) {
          return;
        }

        dataHandlerStore.addCmd(data.table, data.uid, 'copy', actionData);

        sendMessage('doSave');
        const unsubscribe = onMessage('saveEnded', () => {
          unsubscribe();
          sendMessage('reloadFrames');
        });
        return;
      }

      dataHandlerStore.addCmd(data.table, data.uid, 'move', actionData);

      this.isDragHovering = false;

      const firstParent = findFirstParent(['ve-content-element', 've-content-area'], this);
      if (!firstParent) {
        throw new Error('Cannot find parent ve-content-element or ve-content-area for drop zone');
      }

      const sourceElement = document.getElementById(data.table + ':' + data.uid);
      if (!sourceElement) {
        throw new Error('Cannot find source element for drop operation: ' + data.table + ':' + data.uid);
      }

      sourceElement.setAttribute('colPos', this.colPos);
      if (Number.isInteger(this.tx_container_parent) && this.tx_container_parent > 0) {
        sourceElement.setAttribute('tx_container_parent', this.tx_container_parent);
      } else {
        sourceElement.removeAttribute('tx_container_parent');
      }
      this.sendContentElementMoved(firstParent, sourceElement);

      switch (firstParent.tagName.toLowerCase()) {
        case 've-content-element':
          flipInsertBefore(firstParent.parentNode, sourceElement, firstParent.nextSibling);
          return;
        case 've-content-area':
          flipInsertBefore(firstParent, sourceElement, firstParent.firstChild);
          return;
      }
    };
    patchedDrop.visualEditorEnhancementsWrapped = true;
    DropZone.prototype._drop = patchedDrop;
  });
}

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

function installToolbarPlacement(editableRichText) {
  if (editableRichText.visualEditorEnhancementsToolbarInstalled) {
    return;
  }

  const ckEditorEl = editableRichText.querySelector('.ck-editor');
  if (!ckEditorEl || !editableRichText.editor?.ui?.focusTracker) {
    return;
  }

  editableRichText.visualEditorEnhancementsToolbarInstalled = true;
  const clippedAncestors = [];
  const liftClipping = () => {
    for (let el = editableRichText.parentElement; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflow;
      if (overflow === 'hidden' || overflow === 'clip') {
        clippedAncestors.push([el, el.style.overflow]);
        el.style.setProperty('overflow', 'visible', 'important');
      }
    }
  };
  const restoreClipping = () => {
    while (clippedAncestors.length) {
      const [el, value] = clippedAncestors.pop();
      if (value) {
        el.style.overflow = value;
      } else {
        el.style.removeProperty('overflow');
      }
    }
  };
  const placeToolbar = () => ckEditorEl.classList.toggle(
    've-toolbar-below',
    ckEditorEl.getBoundingClientRect().top < 140,
  );
  editableRichText.editor.ui.focusTracker.on('change:isFocused', (_evt, _name, isFocused) => {
    if (isFocused) {
      liftClipping();
      placeToolbar();
      window.addEventListener('scroll', placeToolbar, {passive: true, capture: true});
      window.addEventListener('resize', placeToolbar, {passive: true});
    } else {
      restoreClipping();
      window.removeEventListener('scroll', placeToolbar, {capture: true});
      window.removeEventListener('resize', placeToolbar);
    }
  });
}

function findFirstParent(tagNamesToFind, element) {
  if (tagNamesToFind.includes(element.tagName.toLowerCase())) {
    return element;
  }
  const parentElement = element.parentNode;
  if (!parentElement) {
    return null;
  }
  if (parentElement instanceof ShadowRoot) {
    return findFirstParent(tagNamesToFind, parentElement.host);
  }
  return findFirstParent(tagNamesToFind, parentElement);
}
