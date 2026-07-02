import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';

/**
 * Shared bridge to the TYPO3 link browser living in the backend (parent)
 * frame: Backend/index.js opens a modal for the openLinkBrowser message and
 * answers with linkBrowserSetLink once a link was picked. Both the inline
 * <ve-editable-link> button and the field chooser's link rows go through this
 * module, so exactly one message listener exists and exactly one link edit can
 * be pending at a time - a newer request simply supersedes an older one whose
 * modal was closed without picking a link.
 */

/** @type {((typolink: string) => void)|null} */
let pendingCallback = null;
let listening = false;

/**
 * Asks the backend frame to open the link browser and hands the chosen
 * typolink to onSetLink. The callback is never invoked when the modal is
 * dismissed without a choice; it is dropped when a newer request comes in.
 * @param {{src: string, title: string}} request - src is the full link browser
 *   URL including the appended P[currentValue] parameter; title is the modal
 *   title shown in the backend.
 * @param {(typolink: string) => void} onSetLink
 */
export function requestLinkEdit({src, title}, onSetLink) {
  if (!listening) {
    listening = true;
    onMessage('linkBrowserSetLink', (detail) => {
      if (pendingCallback && detail) {
        const callback = pendingCallback;
        pendingCallback = null;
        callback(detail.value);
      }
    });
  }
  pendingCallback = onSetLink;
  sendMessage('openLinkBrowser', {src, title});
}
