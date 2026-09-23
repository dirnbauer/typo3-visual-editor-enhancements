import Modal from '@typo3/backend/modal.js';
import Notification from '@typo3/backend/notification.js';
import {FormEngineLinkBrowserSetLinkEvent} from '@typo3/backend/event/form-engine-link-browser-set-link-event.js';
import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {resolveTheme} from '@webconsulting/visual-editor-enhancements/Shared/theme-bridge.js';

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

/**
 * Theme bridge: the edit frame renders the site, without the backend's
 * stylesheet, so this frame resolves the backend's design tokens and hands
 * the computed values over (Shared/theme-bridge.js). They are sent again whenever
 * the backend's theme or colour scheme changes while the editor is open - the
 * user menu switch, or the operating system for the "auto" scheme.
 */
const sendTheme = () => sendMessage('veTheme', resolveTheme(document), 'iframe');

onMessage('requestTheme', sendTheme);
new MutationObserver(sendTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-color-scheme', 'data-theme'],
});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', sendTheme);
