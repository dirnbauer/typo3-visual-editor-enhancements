/**
 * Helpers for the same-origin preview iframes: hide editor chrome inside them,
 * measure the rendered element and scale it into a box.
 */

/**
 * Hides the TYPO3 frontend admin panel inside a preview - editor chrome that
 * sits on top of the rendered element. Injected as a stylesheet so it also
 * covers a panel that JavaScript mounts after load.
 * @param {HTMLIFrameElement} iframe
 */
export function hideAdminPanel(iframe) {
  injectStyle(iframe, 've-hide-adminpanel',
    '#TSFE_ADMIN_PANEL_FORM,.typo3-adminPanel,#typo3-adminPanel,typo3-adminpanel,.t3-adminPanel,#admPanel{display:none!important}');
}

/**
 * Card thumbnails only (never the enlarged flyout): cut the leading section's
 * top padding so the element starts at the top of the box instead of wasting
 * a third of it on whitespace.
 * @param {HTMLIFrameElement} iframe
 */
export function compactPreview(iframe) {
  injectStyle(iframe, 've-compact-preview', 'body>*:first-child{padding-block-start:14px!important}');
}

function injectStyle(iframe, id, cssText) {
  try {
    const doc = iframe.contentDocument;
    if (!doc || doc.getElementById(id)) {
      return;
    }
    const style = doc.createElement('style');
    style.id = id;
    style.textContent = cssText;
    (doc.head || doc.documentElement).appendChild(style);
  } catch {
    // cross-origin or detached document - nothing to do
  }
}

/**
 * The rendered height of the preview document, 0 when it cannot be read
 * (cross-origin, detached, not yet laid out).
 * @param {HTMLIFrameElement} iframe
 * @return {number}
 */
export function contentHeight(iframe) {
  try {
    const body = iframe.contentDocument?.body;
    return body ? (body.scrollHeight || Math.round(body.getBoundingClientRect().height)) : 0;
  } catch {
    return 0;
  }
}

/**
 * Zooms the whole element out so it fits the thumbnail box - a complete
 * impression even when small - by the smaller of the width- and height-fit,
 * centred, never upscaled past 1:1.
 * @param {HTMLIFrameElement} iframe
 * @param {number} boxWidth
 * @param {number} boxHeight
 * @param {number} renderWidth the viewport width the iframe renders at
 */
export function fitThumbnail(iframe, boxWidth, boxHeight, renderWidth) {
  const height = contentHeight(iframe);
  if (height < 20) {
    return;
  }
  const scale = Math.min(1, boxWidth / renderWidth, boxHeight / height);
  iframe.style.width = renderWidth + 'px';
  iframe.style.height = height + 'px';
  iframe.style.transform = `scale(${scale})`;
  iframe.style.left = Math.round((boxWidth - renderWidth * scale) / 2) + 'px';
  iframe.style.top = Math.round(Math.max(0, (boxHeight - height * scale) / 2)) + 'px';
}
