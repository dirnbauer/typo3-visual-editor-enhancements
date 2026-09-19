import {dataHandlerStore} from '@typo3/visual-editor/Frontend/stores/data-handler-store';
import {useDataHandler} from '@typo3/visual-editor/Backend/use-data-handler';
import {sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';
import {contentAddedFeedback} from '@webconsulting/visual-editor-enhancements/Shared/config.js';

/**
 * Dropping a library card onto one of the Visual Editor's own <ve-drop-zone>
 * targets. The zones live inside the shadow roots of <ve-content-area> and
 * <ve-content-element>, so they are hit-tested by geometry rather than by DOM
 * events - a pointer drag from the enlarged preview never produces drop events
 * on them at all.
 */

/**
 * The text/ve-drag payload read by <ve-drop-zone>. `uid: -1` never collides
 * with a drop zone's own uid; libraryMode "copy" copies the seeded demo record
 * when one exists (so the element drops in pre-filled, matching its preview),
 * else a new empty element of that type is created.
 * @param {{cType: string, demoUid: number}} item
 */
export function libraryDragData(item) {
  return {
    table: 'tt_content',
    uid: -1,
    CType: item.cType,
    libraryMode: item.demoUid > 0 ? 'copy' : 'new',
    demoUid: item.demoUid,
  };
}

/**
 * The visible drop zone under a point, with a little leeway around its area;
 * the smallest matching zone wins so a nested zone beats its container.
 * @param {number} x
 * @param {number} y
 * @return {Element|null}
 */
export function findDropZone(x, y) {
  const leeway = 24;
  let bestZone = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const dropZone of allDropZones()) {
    if (!dropZone.show) {
      continue;
    }
    const dropArea = dropZone.shadowRoot?.querySelector('.dropArea.visible');
    if (!dropArea) {
      continue;
    }
    const rect = dropArea.getBoundingClientRect();
    if (x < rect.left - leeway || x > rect.right + leeway || y < rect.top - leeway || y > rect.bottom + leeway) {
      continue;
    }
    const area = rect.width * rect.height;
    if (area < bestArea) {
      bestArea = area;
      bestZone = dropZone;
    }
  }
  return bestZone;
}

function allDropZones() {
  const dropZones = [];
  const visitRoot = (root) => {
    root.querySelectorAll('ve-drop-zone').forEach((dropZone) => dropZones.push(dropZone));
    root.querySelectorAll('*').forEach((element) => {
      if (element.shadowRoot) {
        visitRoot(element.shadowRoot);
      }
    });
  };
  visitRoot(document);
  return dropZones;
}

/**
 * Creates the element at the drop zone: a copy of the demo record, or a new
 * record of the cType. The drop is a save - it goes straight through the
 * Visual Editor's save endpoint together with every pending change - and on
 * success the backend frame shows the "content added" notification and reloads
 * the edit frames. A container column (EXT:container) is passed on as
 * tx_container_parent; a top-level column leaves the record's default.
 * @param {Element} dropZone
 * @param {ReturnType<typeof libraryDragData>} data
 */
export async function dropOnZone(dropZone, data) {
  const containerParent = Number.isInteger(dropZone.tx_container_parent) && dropZone.tx_container_parent > 0
    ? {tx_container_parent: dropZone.tx_container_parent}
    : {};
  const actionData = {
    action: 'paste',
    target: dropZone.target,
    update: {colPos: dropZone.colPos, ...containerParent},
  };

  let saved;
  if (data.libraryMode === 'copy' && data.demoUid > 0) {
    dataHandlerStore.addCmd('tt_content', data.demoUid, 'copy', {
      ...actionData,
      update: {...actionData.update, hidden: 0},
    });
    saved = await useDataHandler(dataHandlerStore.data, dataHandlerStore.cmdArray);
  } else {
    const payload = dataHandlerStore.data;
    payload.tt_content = payload.tt_content || {};
    payload.tt_content['NEW' + crypto.randomUUID().replaceAll('-', '')] = {
      pid: dropZone.target,
      CType: data.CType,
      colPos: dropZone.colPos,
      sys_language_uid: window.veInfo.languageId,
      hidden: 0,
      ...containerParent,
    };
    saved = await useDataHandler(payload, dataHandlerStore.cmdArray);
  }

  if (!saved) {
    return;
  }
  dataHandlerStore.markSaved();
  sendMessage('contentElementAdded', contentAddedFeedback(), 'parent');
  sendMessage('reloadFrames');
}
