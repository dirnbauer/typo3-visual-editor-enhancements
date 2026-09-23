import {html} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {lll} from '@typo3/core/lit-helper.js';

/**
 * The two drag images of the element library.
 *
 * Cards and the enlarged preview are HTML5 drag sources; the browser's default
 * ghost is a generic globe/iframe icon that is often empty while the preview
 * iframe is still loading, so setCustomDragImage() replaces it with a small
 * labelled chip. The pointer drag out of the enlarged preview (no HTML5 drag
 * events at all) renders its own chip through renderDragGhost() from a state
 * object created by ghostState() and moved by moveGhost().
 */

const GHOST_WIDTH = 336;
const GHOST_HEIGHT = 62;

/**
 * @param {{title?: string, cType: string, iconUrl?: string}} item
 * @param {number} x
 * @param {number} y
 */
export function ghostState(item, x, y) {
  return {
    title: item.title || item.cType,
    cType: item.cType,
    iconUrl: item.iconUrl || '',
    canDrop: false,
    ...ghostPosition(x, y),
  };
}

export function moveGhost(ghost, x, y, canDrop) {
  return {...ghost, canDrop, ...ghostPosition(x, y)};
}

function ghostPosition(x, y) {
  return {
    left: Math.round(Math.max(12, Math.min(window.innerWidth - GHOST_WIDTH - 12, x + 18))),
    top: Math.round(Math.max(12, Math.min(window.innerHeight - GHOST_HEIGHT - 12, y + 18))),
  };
}

/** @param {ReturnType<typeof ghostState>|null} ghost */
export function renderDragGhost(ghost) {
  if (!ghost) {
    return '';
  }
  const status = ghost.canDrop
    ? (lll('frontend.library.dragGhost.drop') || 'Release to insert')
    : (lll('frontend.library.dragGhost.move') || 'Move to a highlighted drop zone');
  const ghostStyle = `transform: translate3d(${ghost.left}px, ${ghost.top}px, 0) scale(${ghost.canDrop ? 1.03 : 1});`;
  return html`
    <div class=${classMap({previewDragGhost: true, 'can-drop': ghost.canDrop})} style="${ghostStyle}" aria-hidden="true">
      <span class="previewDragGhostIcon">
        ${ghost.iconUrl
          ? html`<img src="${ghost.iconUrl}" alt="" />`
          : html`<span class="previewDragGhostFallback">+</span>`}
      </span>
      <span class="previewDragGhostBody">
        <strong class="previewDragGhostTitle">${ghost.title}</strong>
        <span class="previewDragGhostStatus">${status}</span>
      </span>
    </div>
  `;
}

let previousCursors = null;

/** Shows a grabbing cursor for the whole document while a pointer drag runs. */
export function beginGrabCursor() {
  previousCursors ??= [document.documentElement.style.cursor, document.body.style.cursor];
  document.documentElement.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';
}

export function endGrabCursor() {
  if (previousCursors === null) {
    return;
  }
  [document.documentElement.style.cursor, document.body.style.cursor] = previousCursors;
  previousCursors = null;
}

/**
 * Replaces the browser's default HTML5 drag image with a labelled chip (the
 * element's icon + title). Falls back to the browser default on any error.
 * @param {DragEvent} event
 * @param {{title?: string, cType: string, iconUrl?: string}} item
 */
export function setCustomDragImage(event, item) {
  if (typeof event.dataTransfer.setDragImage !== 'function') {
    return;
  }
  try {
    const ghost = document.createElement('div');
    ghost.setAttribute('aria-hidden', 'true');
    // Light DOM (appended to <body>), so it reads the --ve-t3-* backend
    // tokens the theme bridge sets on the root directly: the inverted
    // surface of the backend, like the in-panel drag chip.
    ghost.style.cssText = [
      'position:fixed', 'top:-1000px', 'left:-1000px', 'z-index:2147483647',
      'display:inline-flex', 'align-items:center', 'gap:8px',
      'padding:7px 13px', 'border-radius:var(--ve-t3-radius,6px)',
      'background:color-mix(in srgb,var(--ve-t3-text,CanvasText) 92%,transparent)',
      'color:var(--ve-t3-surface-raised,Canvas)',
      'font:600 13px/1.2 var(--ve-t3-font-family,system-ui,sans-serif)',
      'white-space:nowrap', 'box-shadow:var(--ve-t3-shadow-dialog,none)',
      'pointer-events:none',
    ].join(';');
    if (item.iconUrl) {
      const img = document.createElement('img');
      img.src = item.iconUrl;
      img.style.cssText = 'width:18px;height:18px;flex:none;';
      ghost.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = item.title || item.cType;
    ghost.appendChild(label);
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 16, 18);
    // The node only needs to exist at the moment of setDragImage.
    setTimeout(() => ghost.remove(), 0);
  } catch {
    // setDragImage unsupported or blocked - keep the browser default
  }
}
