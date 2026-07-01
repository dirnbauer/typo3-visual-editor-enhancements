import Modal from '@typo3/backend/modal.js';
import Notification from '@typo3/backend/notification.js';
import {FormEngineLinkBrowserSetLinkEvent} from '@typo3/backend/event/form-engine-link-browser-set-link-event.js';
import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';

onMessage('contentElementAdded', (feedback) => {
  Notification.success(feedback?.title || 'Content added', feedback?.message || '');
});

onMessage('openLinkBrowser', (data) => {
  const modal = Modal.advanced({
    type: 'iframe',
    title: data.title || '',
    content: data.src,
    size: 'large',
    staticBackdrop: true,
  });
  modal.addEventListener(FormEngineLinkBrowserSetLinkEvent.eventName, (event) => {
    sendMessage('linkBrowserSetLink', {value: event.value}, 'iframe');
    modal.hideModal();
  });
});

function resolveBackendAccent() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--typo3-state-purple-bg,var(--token-color-purple-base,#7c5ac4))';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color && color !== 'rgba(0, 0, 0, 0)' ? color : '#7c5ac4';
}

onMessage('requestAccent', () => sendMessage('veAccent', {color: resolveBackendAccent()}, 'iframe'));
