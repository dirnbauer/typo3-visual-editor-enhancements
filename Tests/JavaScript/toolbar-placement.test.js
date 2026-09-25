/**
 * Unit tests for the rich-text toolbar geometry. What matters: the toolbar
 * ends up inside the viewport on all four sides, prefers above, falls back to
 * below, and only lies over the editable when the page leaves no other room.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {placeToolbar, toolbarMaxWidth, TOOLBAR_GAP, VIEWPORT_MARGIN} from '../../Resources/Public/JavaScript/Shared/toolbar-placement.js';

const viewport = {width: 1400, height: 800};
const toolbar = {width: 700, height: 80};
const box = ({top, height = 120, left = 100, width = 500}) => ({top, bottom: top + height, left, right: left + width});

function assertInsideViewport({left, top}, size, view = viewport) {
  assert.ok(left >= VIEWPORT_MARGIN, `left ${left} keeps the margin`);
  assert.ok(left + size.width <= view.width - VIEWPORT_MARGIN, `right edge ${left + size.width} stays inside ${view.width}`);
  assert.ok(top >= VIEWPORT_MARGIN, `top ${top} keeps the margin`);
  assert.ok(top + size.height <= view.height - VIEWPORT_MARGIN, `bottom edge ${top + size.height} stays inside ${view.height}`);
}

describe('placeToolbar', () => {
  it('sits above the editable with a gap when there is room', () => {
    const editor = box({top: 400});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.side, 'above');
    assert.equal(placement.top, 400 - TOOLBAR_GAP - toolbar.height);
    assert.equal(placement.left, editor.left);
    assertInsideViewport(placement, toolbar);
  });

  it('flips below the editable when the top of the viewport is too close', () => {
    const editor = box({top: 60});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.side, 'below');
    assert.equal(placement.top, editor.bottom + TOOLBAR_GAP);
    assertInsideViewport(placement, toolbar);
  });

  it('flips exactly when the toolbar, its gap and the margin no longer fit above', () => {
    const fits = toolbar.height + TOOLBAR_GAP + VIEWPORT_MARGIN;
    assert.equal(placeToolbar({editor: box({top: fits}), toolbar, viewport}).side, 'above');
    assert.equal(placeToolbar({editor: box({top: fits - 1}), toolbar, viewport}).side, 'below');
  });

  it('stays above when the editable sits at the bottom of the viewport', () => {
    const editor = box({top: 700, height: 200});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.side, 'above');
    assertInsideViewport(placement, toolbar);
  });

  it('lies over the editable when neither side has room, and stays visible', () => {
    const editor = box({top: 40, height: 740});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.side, 'inside');
    assert.equal(placement.top, 40, 'over the first lines of the editable');
    assertInsideViewport(placement, toolbar);
  });

  it('keeps the margin when the editable extends above the viewport', () => {
    const editor = box({top: -300, height: 1400});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.side, 'inside');
    assert.equal(placement.top, VIEWPORT_MARGIN);
  });

  it('shifts left when anchoring to the editable would run past the right edge', () => {
    const editor = box({top: 400, left: 1000, width: 380});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.left, viewport.width - VIEWPORT_MARGIN - toolbar.width);
    assertInsideViewport(placement, toolbar);
  });

  it('shifts right when the editable starts left of the viewport', () => {
    const editor = box({top: 400, left: -50});
    const placement = placeToolbar({editor, toolbar, viewport});
    assert.equal(placement.left, VIEWPORT_MARGIN);
  });

  it('starts at the margin when the toolbar is wider than the viewport allows', () => {
    const narrow = {width: 600, height: 800};
    const placement = placeToolbar({editor: box({top: 400, left: 200}), toolbar, viewport: narrow});
    assert.equal(placement.left, VIEWPORT_MARGIN);
  });

  it('never returns a position above or left of the margin, whatever the input', () => {
    const tiny = {width: 300, height: 200};
    const tall = {width: 500, height: 250};
    const placement = placeToolbar({editor: box({top: -100, height: 900, left: 400}), toolbar: tall, viewport: tiny});
    assert.equal(placement.left, VIEWPORT_MARGIN);
    assert.equal(placement.top, VIEWPORT_MARGIN);
  });
});

describe('toolbarMaxWidth', () => {
  it('leaves the margin on both sides of a narrow viewport', () => {
    assert.equal(toolbarMaxWidth({width: 375}), 375 - 2 * VIEWPORT_MARGIN);
  });

  it('caps the width on wide viewports so the toolbar stays readable', () => {
    assert.equal(toolbarMaxWidth({width: 2560}), 960);
  });

  it('never goes negative', () => {
    assert.equal(toolbarMaxWidth({width: 4}), 0);
  });
});
