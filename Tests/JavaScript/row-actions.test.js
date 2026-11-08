import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {collectionIntent, collectionMessage, deleteRefusal} from '../../Resources/Public/JavaScript/Shared/inline-record-actions.js';
import {cascadeItems, deleteConfirmText} from '../../Resources/Public/JavaScript/Shared/confirm-delete.js';
import {appenderPlacement, appenderPlan, stackPlacements, levelLinksPosition, moveTarget, railPlacement, restoreControl, rowReasons, unionRect} from '../../Resources/Public/JavaScript/Shared/row-actions.js';

const field = {parentTable: 'tt_content', parentUid: 5, name: 'cards', revision: 'opaque', type: 'inline', uids: [2, 3, 4], maxItems: 6,
  canCreate: true, createReason: '', createHidden: true, workspaceId: 0};
const common = {parentTable: 'tt_content', parentUid: 5, field: 'cards', revision: 'opaque'};
const entry = (uid, overrides = {}) => ({uid, table: 'items', label: `Entry ${uid}`, state: 'live', canDelete: true, deleteReason: '',
  canHide: true, canEditLabel: true, ...overrides});

describe('duplicate and restore envelopes', () => {
  it('carry only the entry uid besides the common identity', () => {
    assert.deepEqual(collectionIntent(field, 'duplicate', {childUid: 3}), {inlineRecord: {action: 'duplicate', ...common, childUid: 3}});
    assert.deepEqual(collectionIntent(field, 'restore', {childUid: 9}), {inlineRecord: {action: 'restore', ...common, childUid: 9}});
    const forged = {childUid: 3, afterUid: 2, childTable: 'x', pid: 1, sorting: 3, liveUid: 9, hidden: 0, versionUid: 12};
    for (const action of ['duplicate', 'restore']) {
      assert.deepEqual(Object.keys(collectionIntent(field, action, forged).inlineRecord).sort(), [...Object.keys(common), 'action', 'childUid'].sort());
    }
  });

  it('refuse to build without the entry', () => {
    assert.throws(() => collectionIntent(field, 'duplicate'), /needs childUid/);
    assert.throws(() => collectionIntent(field, 'restore', {childUid: 'x'}), /needs childUid/);
  });
});

describe('deleteRefusal', () => {
  it('names the bound of a refused cascade', () => {
    assert.equal(deleteRefusal(entry(2)), '');
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'depth'})), /deeper than this site allows/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'records'})), /more nested entries or media references than this site allows/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'rights'})), /nested entries or media you may not remove/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'disabled'})), /switched off for this site/);
  });

  it('keeps the 1.6 sentence for an older server and other reasons', () => {
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade'})), /Nested entries or media require the backend form/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'other'})), /Nested entries or media/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: 'min'})), /remaining entries/);
    assert.match(deleteRefusal(entry(2, {canDelete: false, deleteReason: ''})), /disabled in the backend field configuration/);
  });
});

describe('collectionMessage', () => {
  it('says where the copy went and whether it is hidden', () => {
    assert.match(collectionMessage('duplicate', field, {created: {uid: 8, hidden: true}}), /below the original\. It starts hidden/);
    assert.match(collectionMessage('duplicate', {...field, createHidden: false}, {created: {uid: 8, hidden: false}}), /live immediately/);
    assert.match(collectionMessage('duplicate', {...field, workspaceId: 4}, {created: {uid: 8}}), /in this workspace/);
  });

  it('confirms an undone removal and keeps the 1.6 sentences', () => {
    assert.equal(collectionMessage('restore', {...field, workspaceId: 4}, {}), 'Removal undone. The entry is back in this workspace draft.');
    assert.equal(collectionMessage('move', field, {}, {position: 2}), 'Moved to position 2.');
    assert.equal(collectionMessage('move', field, {moved: {position: 3}}, {position: 2}), 'Moved to position 3.');
    assert.match(collectionMessage('create', field, {}), /^Entry added\. New entries start hidden/);
    assert.match(collectionMessage('delete', field, {}), /^Entry change saved immediately/);
    assert.match(collectionMessage('create', {...field, workspaceId: 4}, {workspace: {firstVersion: true}}), /workspace\. .*Draft created/);
  });
});

describe('the counted cascade sentence', () => {
  it('counts nested entries and image references; the files stay', () => {
    assert.deepEqual(cascadeItems({children: 2, files: 1}), ['2 nested entries', '1 image reference']);
    assert.deepEqual(cascadeItems({children: 1, files: 0}), ['1 nested entry']);
    assert.deepEqual(cascadeItems(undefined), []);
    const field = {translationLanguages: [{id: 1, title: 'Deutsch'}]};
    assert.equal(deleteConfirmText({label: 'Plan', verb: 'delete', cascade: {translations: 1, languages: [1], children: 3, files: 2}}, field),
      'Remove “Plan”? Also removes 1 translations (Deutsch). Also removes 3 nested entries, 2 image references. The files stay in the file list. '
      + 'It disappears from the live site immediately. Reset does not undo this operation.');
    assert.equal(deleteConfirmText({label: 'Plan', verb: 'markForDeletion', cascade: {translations: 0, children: 1, files: 0}}, {}),
      'Remove “Plan”? Also marks 1 nested entry for deletion. Deletion is staged in this workspace; the live entry remains until publication. Reset does not undo this operation.');
    assert.match(deleteConfirmText({label: 'Plan', verb: 'delete', cascade: {children: 50, truncated: true}}, {}), /there can be more/);
  });

  it('is unchanged without nested dependents', () => {
    assert.equal(deleteConfirmText({label: 'Card', verb: 'delete', cascade: {translations: 0, languages: []}}, {}),
      'Remove “Card”? It disappears from the live site immediately. Reset does not undo this operation.');
  });
});

describe('row reasons shared by the inspector and the row toolbar', () => {
  it('offers Duplicate only when the server publishes it and explains a refusal', () => {
    assert.equal(rowReasons(field, entry(2)).duplicate, '');
    assert.equal(rowReasons(field, entry(2, {canDuplicate: true})).duplicate, '');
    assert.match(rowReasons(field, entry(2, {canDuplicate: false, duplicateReason: 'copyUnsupported'})).duplicate, /Only entries without nested entries or media can be duplicated here/);
    assert.match(rowReasons(field, entry(2, {canDuplicate: false, duplicateReason: 'max'})).duplicate, /entry limit/);
    assert.equal(rowReasons(field, entry(2, {canDuplicate: true}), 'Busy.').duplicate, 'Busy.');
  });

  it('holds Remove for staged text and names a refused cascade', () => {
    assert.equal(rowReasons(field, entry(2), '', 'Save first.').remove, 'Save first.');
    assert.match(rowReasons(field, entry(2, {canDelete: false, deleteReason: 'cascade', cascadeReason: 'rights'})).remove, /you may not remove/);
  });

  it('Undo removal: only on listed placeholders the server marks restorable', () => {
    assert.deepEqual(restoreControl(entry(3, {state: 'deleted'})), {offered: false, reason: ''});
    assert.deepEqual(restoreControl(entry(3, {state: 'deleted', canRestore: true})), {offered: true, reason: ''});
    assert.match(restoreControl(entry(3, {state: 'deleted', canRestore: false, restoreReason: 'restoreLive'})).reason, /Only removals staged in a workspace can be undone/);
    assert.equal(restoreControl(entry(3, {state: 'deleted', canRestore: true}), 'Busy.').reason, 'Busy.');
    assert.equal(restoreControl(entry(3, {canRestore: true})).offered, false);
  });

  it('moves one step by afterUid', () => {
    const children = [entry(2), entry(3), entry(4)];
    assert.deepEqual(moveTarget({...field, children}, children[2], 'up'), {afterUid: 2});
    assert.deepEqual(moveTarget({...field, children}, children[1], 'up'), {afterUid: null});
    assert.equal(moveTarget({...field, children}, children[0], 'up'), null);
    assert.deepEqual(moveTarget({...field, children}, children[0], 'down'), {afterUid: 3});
  });
});

describe('the on-page add button', () => {
  const children = [entry(2), entry(3)];
  it('follows levelLinksPosition', () => {
    assert.equal(levelLinksPosition({}), 'bottom');
    assert.equal(levelLinksPosition({levelLinksPosition: 'nonsense'}), 'bottom');
    assert.deepEqual(appenderPlan({...field, children, levelLinksPosition: 'top'}).map((plan) => plan.side), ['top']);
    assert.deepEqual(appenderPlan({...field, children, levelLinksPosition: 'bottom'}).map((plan) => plan.side), ['bottom']);
    assert.deepEqual(appenderPlan({...field, children, levelLinksPosition: 'both'}).map((plan) => plan.side), ['top', 'bottom']);
    assert.deepEqual(appenderPlan({...field, children, levelLinksPosition: 'none'}), []);
  });

  it('is refused with a reason at the maximum, by the server or by count', () => {
    assert.equal(appenderPlan({...field, children})[0].reason, '');
    assert.match(appenderPlan({...field, children, canCreate: false, createReason: 'max'})[0].reason, /entry limit/);
    assert.match(appenderPlan({...field, children, maxItems: 2})[0].reason, /entry limit/);
    assert.equal(appenderPlan({...field, children, maxItems: 99999})[0].reason, '', 'Core\'s default maxitems is unlimited');
    assert.equal(appenderPlan({...field, children}, 'Busy.')[0].reason, 'Busy.');
  });
});

describe('placement', () => {
  const viewport = {width: 1280, height: 800};
  const size = {width: 200, height: 30};
  it('puts the row toolbar above the entry, right-aligned, inside when there is no room', () => {
    assert.deepEqual(railPlacement({top: 300, bottom: 400, left: 100, right: 600}, size, viewport), {left: 400, top: 266, inside: false});
    assert.deepEqual(railPlacement({top: 10, bottom: 200, left: 100, right: 600}, size, viewport), {left: 400, top: 14, inside: true});
    assert.equal(railPlacement({top: 900, bottom: 1000, left: 100, right: 600}, size, viewport), null);
    assert.equal(railPlacement({top: -300, bottom: -10, left: 100, right: 600}, size, viewport), null);
    assert.equal(railPlacement({top: 300, bottom: 400, left: 1400, right: 1700}, size, viewport), null, 'a slide moved out to the side');
    assert.equal(railPlacement({top: 300, bottom: 300, left: 100, right: 100}, size, viewport), null, 'not rendered');
    assert.equal(railPlacement({top: 300, bottom: 400, left: 0, right: 120}, size, viewport).left, 8, 'clamped to the edge');
  });

  it('puts the add button below the last entry or above the first, full width', () => {
    const rect = {top: 100, bottom: 400, left: 40, right: 1000};
    assert.deepEqual(appenderPlacement(rect, 'bottom', 32, viewport), {left: 40, top: 406, width: 960});
    assert.deepEqual(appenderPlacement(rect, 'top', 32, viewport), {left: 40, top: 62, width: 960});
    assert.equal(appenderPlacement({...rect, bottom: 900, top: 820}, 'bottom', 32, viewport), null);
    assert.equal(appenderPlacement({top: 10, bottom: 50, left: 40, right: 100}, 'bottom', 32, viewport).width, 160, 'minimum width');
  });

  it('never straddles the element edge: inside the gap when it fits, else just outside', () => {
    const rect = {top: 100, bottom: 400, left: 40, right: 1000};
    // The gap below the entries holds the button: 6 px below them, as without a frame.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame: {top: 0, bottom: 460}}).top, 406);
    // A tight gap (36 px): centred, 2 px from the edge.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame: {top: 0, bottom: 436}}).top, 402);
    // Too small (24 px, a card's padding): just outside the element, 6 px below its edge.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame: {top: 0, bottom: 424}}).top, 430);
    assert.equal(appenderPlacement(rect, 'top', 32, viewport, {frame: {top: 90, bottom: 460}}).top, 52, 'top side: above the element');
    assert.equal(appenderPlacement(rect, 'top', 32, viewport, {frame: {top: 0, bottom: 460}}).top, 62, 'top side: inside the gap');
    // Entries spilling over the frame: placed against the entries.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame: {top: 0, bottom: 380}}).top, 406);
  });

  it('never covers the element\'s other content beyond the entries (clearance)', () => {
    const rect = {top: 100, bottom: 400, left: 40, right: 1000};
    const frame = {top: 0, bottom: 700};
    // A table body right below the header cells (0 px): outside the element.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame, clearance: 0}).top, 706);
    // A caption 20 px below the rows: still too tight, outside.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame, clearance: 20}).top, 706);
    // 50 px of free space before the next content: inside that gap, 6 px below the entries.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame, clearance: 50}).top, 406);
    // Top side: content right above the first entry puts it above the element.
    assert.equal(appenderPlacement(rect, 'top', 32, viewport, {frame: {top: 60, bottom: 700}, clearance: 0}).top, 22);
    // No other content (Infinity) = the element's own gap decides, as before.
    assert.equal(appenderPlacement(rect, 'bottom', 32, viewport, {frame: {top: 0, bottom: 436}, clearance: Infinity}).top, 402);
  });

  it('stacks add buttons that would land on the same spot', () => {
    const a = {left: 40, top: 706, width: 960};
    // Both outside the element: the second moves below the first (32 px + 4 px gap).
    assert.deepEqual(stackPlacements([a, {...a}], [32, 32], ['bottom', 'bottom']), [a, {...a, top: 742}]);
    // Top side: the second moves above.
    assert.deepEqual(stackPlacements([{...a, top: 20}, {...a, top: 20}], [32, 32], ['top', 'top'])[1].top, -16);
    // Apart already, or off screen: unchanged.
    assert.deepEqual(stackPlacements([a, {...a, top: 800}, null], [32, 32, 32], ['bottom', 'bottom', 'bottom']), [a, {...a, top: 800}, null]);
    // Side by side (no horizontal overlap): unchanged.
    assert.deepEqual(stackPlacements([a, {...a, left: 1100}], [32, 32], ['bottom', 'bottom'])[1].top, 706);
  });

  it('unions the boxes of the primary renderings', () => {
    assert.deepEqual(unionRect([{top: 10, bottom: 50, left: 0, right: 100}, {top: 60, bottom: 90, left: 120, right: 200}, null,
      {top: 0, bottom: 0, left: 0, right: 0}]), {top: 10, left: 0, bottom: 90, right: 200});
    assert.equal(unionRect([]), null);
  });
});

describe('clipRect', () => {
  it('keeps what a carousel viewport leaves visible', async () => {
    const {clipRect} = await import('../../Resources/Public/JavaScript/Shared/row-actions.js');
    const viewport = {top: 100, bottom: 400, left: 100, right: 700};
    assert.deepEqual(clipRect({top: 120, bottom: 380, left: 600, right: 900}, [viewport]), {top: 120, bottom: 380, left: 600, right: 700});
    assert.equal(clipRect({top: 120, bottom: 380, left: 720, right: 900}, [viewport]), null, 'the next slide, outside the viewport');
    assert.deepEqual(clipRect({top: 1, bottom: 2, left: 1, right: 2}), {top: 1, bottom: 2, left: 1, right: 2});
  });
});
