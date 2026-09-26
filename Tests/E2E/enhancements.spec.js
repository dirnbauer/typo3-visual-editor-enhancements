/**
 * End-to-end coverage of the editor-facing features against a running TYPO3
 * installation. See Tests/E2E/README.md for the environment this needs.
 *
 * Every enhancement lives inside the Visual Editor's edit frame and most of it
 * inside a shadow root, so the assertions reach into the shadow roots through
 * `frame.evaluate` rather than through CSS selectors that stop at the boundary.
 */
import {expect, test} from '@playwright/test';

import {config, enhancementConfig, openEditFrame} from './support/backend.js';

/** @type {import('@playwright/test').Frame} */
let frame;
/** @type {string[]} */
let assetErrors;

test.beforeEach(async ({page}, testInfo) => {
  assetErrors = [];
  // Only this extension's own assets are asserted on. A loaded installation
  // drops the odd TYPO3 core module request under load, and that is not what
  // this suite is about.
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('visual-editor-enhancements')) {
      assetErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => {
    if (error.message.includes('visual-editor-enhancements')) {
      assetErrors.push(`page error: ${error.message}`);
    }
  });

  // Tests tagged @rte run on the rich-text page (VEE_RTE_PAGE_ID).
  frame = await openEditFrame(page, testInfo.tags.includes('@rte') ? config.rtePageId : config.pageId);
});

test.afterEach(() => {
  expect(assetErrors, 'no failed module requests and no uncaught errors of this extension').toEqual([]);
});

const openLibrary = (target) => target.evaluate(() => {
  document.querySelector('ve-element-library-button').shadowRoot.querySelector('button').click();
});

/**
 * The panel renders one of two layouts, chosen by the backend user's
 * `tx_visualeditor_panelColumns` setting: a thumbnail grid of `.card`s, each
 * with its own preview iframe, or a compact list of `.lrow`s that share one
 * docked preview. The assertions below cover both.
 */
const panelState = (target) => target.evaluate(() => {
  const panel = document.querySelector('ve-element-library');
  if (panel === null) {
    return {present: false, open: false, items: 0, keywordChips: 0, previewFrames: 0, mode: null};
  }
  const root = panel.shadowRoot;

  return {
    present: true,
    open: panel.open === true,
    items: root.querySelectorAll('.card, .lrow').length,
    keywordChips: root.querySelectorAll('.kw').length,
    previewFrames: root.querySelectorAll('iframe').length,
    mode: panel.columns === 1 ? 'list' : 'grid',
  };
});

test('the edit frame receives the inlined configuration', async () => {
  const configuration = await enhancementConfig(frame);

  expect(configuration).toMatchObject({
    elementLibraryEnabled: expect.any(Boolean),
    contextButtonsEnabled: expect.any(Boolean),
    editableLinksEnabled: expect.any(Boolean),
    elementRefreshEnabled: expect.any(Boolean),
  });
  expect([1, 3]).toContain(configuration.elementLibraryColumns);
  expect(['disabled', 'sections', 'tabs']).toContain(configuration.fieldChooserMode);
});

test('the element library FAB opens and closes the panel', async ({page}) => {
  await expect.poll(
    () => frame.evaluate(() => document.querySelectorAll('ve-element-library-button').length),
    {timeout: 60000},
  ).toBe(1);

  // The button turns its "+" into an "x" but stays where it is: its spot is
  // fixed, and the "x" has to sit in the same place the "+" was.
  const fabRect = () => frame.evaluate(() => {
    const rect = document.querySelector('ve-element-library-button').shadowRoot.querySelector('button').getBoundingClientRect();
    return {top: Math.round(rect.top), right: Math.round(rect.right), width: Math.round(rect.width)};
  });
  const closedRect = await fabRect();

  await openLibrary(frame);
  await expect.poll(async () => (await panelState(frame)).open, {timeout: 60000}).toBe(true);
  await expect.poll(async () => (await panelState(frame)).items, {timeout: 90000}).toBeGreaterThan(0);
  await page.waitForTimeout(400); // the icon's spring settles
  expect(await fabRect(), 'the button does not move when the panel opens').toEqual(closedRect);

  const opened = await panelState(frame);
  expect(opened.keywordChips, 'entries show keyword chips').toBeGreaterThan(0);

  await openLibrary(frame);
  await expect.poll(async () => (await panelState(frame)).open, {timeout: 30000}).toBe(false);
  await page.waitForTimeout(500);
});

test('typing a term asks the server for a ranking and reorders the panel', async ({page}) => {
  await openLibrary(frame);
  await expect.poll(async () => (await panelState(frame)).items, {timeout: 90000}).toBeGreaterThan(0);
  const total = (await panelState(frame)).items;

  const search = page.waitForResponse((response) => response.url().includes('elementLibrarySearch='), {timeout: 60000});
  await frame.evaluate((term) => {
    const input = document.querySelector('ve-element-library').shadowRoot.querySelector('input');
    input.value = term;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }, config.searchTerm);

  const response = await search;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body.matches), 'the endpoint answers with a match list').toBe(true);
  expect(body.matches.length).toBeGreaterThan(0);

  // The panel shows the ranked subset, not the whole catalog.
  await expect.poll(async () => (await panelState(frame)).items, {timeout: 30000}).toBeLessThan(total);
});

test('a misspelled term still produces suggestions or a did-you-mean', async ({page}) => {
  await openLibrary(frame);
  await expect.poll(async () => (await panelState(frame)).items, {timeout: 90000}).toBeGreaterThan(0);

  const search = page.waitForResponse((response) => response.url().includes('elementLibrarySearch='), {timeout: 60000});
  await frame.evaluate((term) => {
    const input = document.querySelector('ve-element-library').shadowRoot.querySelector('input');
    input.value = term;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }, config.searchTypo);

  const body = await (await search).json();
  const hasHelp = (body.suggestions ?? []).length > 0 || body.didYouMean !== null && body.didYouMean !== undefined;
  expect(hasHelp, `expected a suggestion or a did-you-mean, got ${JSON.stringify(body).slice(0, 200)}`).toBe(true);

  // and the panel offers them as clickable chips / a did-you-mean line
  await expect.poll(
    () => frame.evaluate(() => {
      const root = document.querySelector('ve-element-library').shadowRoot;

      return root.querySelectorAll('.suggChip, .suggLink').length;
    }),
    {timeout: 30000},
  ).toBeGreaterThan(0);
});

test('previews load lazily through the cached ?elPreview route', async ({page}) => {
  /** @type {number[]} */
  const previewStatuses = [];
  page.on('response', (response) => {
    if (response.url().includes('elPreview')) {
      previewStatuses.push(response.status());
    }
  });

  await openLibrary(frame);
  await expect.poll(async () => (await panelState(frame)).items, {timeout: 90000}).toBeGreaterThan(0);

  // In list mode nothing is previewed until an entry is hovered; in grid mode
  // the visible cards load their own iframes. Hovering the first entry covers
  // both without having to know which mode the user is in.
  await frame.evaluate(() => {
    const entry = document.querySelector('ve-element-library').shadowRoot.querySelector('.card, .lrow');
    entry?.dispatchEvent(new MouseEvent('mouseenter', {bubbles: false}));
    entry?.dispatchEvent(new FocusEvent('focus', {bubbles: false}));
  });

  await expect.poll(async () => (await panelState(frame)).previewFrames, {timeout: 90000}).toBeGreaterThan(0);
  await page.waitForTimeout(6000);

  expect(previewStatuses.length, 'at least one preview was requested').toBeGreaterThan(0);
  expect(previewStatuses.filter((status) => status >= 400), 'every preview answered').toEqual([]);

  // A preview URL is an ordinary cacheable frontend request; the panel must
  // keep loading them through that route rather than through an uncached
  // backend endpoint.
  const previewUrls = await frame.evaluate(() =>
    [...document.querySelector('ve-element-library').shadowRoot.querySelectorAll('iframe')]
      .map((iframe) => iframe.getAttribute('src') ?? ''));
  expect(previewUrls.some((url) => url.includes('elPreview')), `preview iframes use the ?elPreview route: ${previewUrls[0]}`).toBe(true);
});

test('the field chooser resolves select and category fields for a record', async ({page}) => {
  const configuration = await enhancementConfig(frame);
  test.skip(configuration.fieldChooserMode === 'disabled', 'the field chooser is off for this user or page');

  const candidates = await frame.evaluate(() =>
    [...document.querySelectorAll('ve-content-element')]
      .filter((element) => element.shadowRoot?.querySelector('[data-ve-enhancement="field-chooser"]'))
      .length);
  expect(candidates, 'the field-chooser button is injected into at least one element').toBeGreaterThan(0);

  // Ask the endpoint for every element that offers the chooser and collect the
  // field types it resolves. Whether one particular record carries a category
  // field is content-dependent, so the assertion is made across the page.
  const resolved = await frame.evaluate(async () => {
    const records = [...document.querySelectorAll('ve-content-element')]
      .filter((element) => element.shadowRoot?.querySelector('[data-ve-enhancement="field-chooser"]'))
      .map((element) => ({table: element.getAttribute('table'), uid: element.getAttribute('uid')}))
      .slice(0, 12);

    const types = new Set();
    const statuses = [];
    for (const record of records) {
      const response = await fetch(
        `${window.location.pathname}?veFieldOptions=1&editMode=1&table=${encodeURIComponent(record.table)}&uid=${record.uid}`,
        {headers: {'X-Request-Token': window.veInfo.token}},
      );
      statuses.push(response.status);
      const payload = await response.json();
      (payload.fields ?? []).forEach((field) => types.add(field.type));
    }

    return {types: [...types], statuses};
  });

  expect(resolved.statuses.length, 'at least one record was queried').toBeGreaterThan(0);
  expect([...new Set(resolved.statuses)], '?veFieldOptions answers 200').toEqual([200]);
  expect(resolved.types, 'the endpoint resolves select fields').toContain('select');
  expect(resolved.types, 'the endpoint resolves category fields').toContain('category');

  // The popover itself opens and renders the record's fields.
  await frame.evaluate(() => {
    const element = [...document.querySelectorAll('ve-content-element')]
      .find((candidate) => candidate.shadowRoot?.querySelector('[data-ve-enhancement="field-chooser"]'));
    element.shadowRoot.querySelector('[data-ve-enhancement="field-chooser"]').click();
  });

  await expect.poll(
    () => frame.evaluate(() => document.querySelectorAll('ve-field-chooser').length),
    {timeout: 60000},
  ).toBe(1);

  await expect.poll(
    () => frame.evaluate(() => {
      const root = document.querySelector('ve-field-chooser')?.shadowRoot;

      return root === null || root === undefined ? -1 : root.querySelectorAll('.field').length;
    }),
    {timeout: 60000},
  ).toBeGreaterThan(0);

  const popover = await frame.evaluate(() => {
    const root = document.querySelector('ve-field-chooser').shadowRoot;

    return {
      dialog: root.querySelectorAll('[role="dialog"]').length,
      selects: root.querySelectorAll('select.select').length,
      controls: root.querySelectorAll('select, input, button').length,
    };
  });
  expect(popover.dialog, 'the popover is a dialog').toBe(1);
  expect(popover.controls, 'the popover renders editable controls').toBeGreaterThan(0);

  await frame.evaluate(() => document.querySelector('ve-field-chooser')?.close?.());
});

/**
 * Picks the rich-text editable a toolbar scenario needs, from where the
 * editables sit on the page: 'top' one that can be scrolled up to the top
 * edge, 'bottom' one whose end can be scrolled down to the bottom edge,
 * 'right' the one reaching furthest right (the last card of a row), 'first'
 * any. -1 when the page has none.
 */
const pickRichText = (target, strategy) => target.evaluate((how) => {
  const viewport = document.documentElement.clientHeight;
  const scrollable = document.documentElement.scrollHeight;
  const boxes = [...document.querySelectorAll('ve-editable-rich-text')]
    .map((node, index) => {
      const rect = node.getBoundingClientRect();

      return {index, top: rect.top + window.scrollY, height: rect.height, right: rect.right, width: rect.width};
    })
    .filter((box) => box.width > 0 && box.height > 0);
  const pick = {
    top: () => boxes.find((box) => box.top > 0 && scrollable - box.top >= viewport),
    bottom: () => boxes.find((box) => box.top + box.height >= viewport && box.height < viewport / 2),
    right: () => boxes.reduce((best, box) => (best === undefined || box.right > best.right ? box : best), undefined),
  }[how];

  return (pick?.() ?? boxes[0])?.index ?? -1;
}, strategy);

/**
 * Clicks into the editable - CKEditor only builds its toolbar on a real focus
 * change, so this has to be an actual click, not element.focus() - and gives
 * the toolbar time to be placed.
 */
async function focusRichText(page, index) {
  const editable = frame.locator('ve-editable-rich-text').nth(index).locator('.ck-editor__editable');
  await editable.scrollIntoViewIfNeeded();
  await editable.click({position: {x: 24, y: 12}, force: true});
  await expect.poll(
    () => frame.evaluate((i) => document.querySelectorAll('ve-editable-rich-text')[i].editor?.ui.focusTracker.isFocused === true, index),
    {message: 'the click gives the rich-text field focus', timeout: 10000},
  ).toBe(true);
  await page.waitForTimeout(1500);
}

/** Scrolls the focused editable to a new spot; the toolbar is placed again on scroll. */
async function scrollRichText(page, index, block) {
  await frame.evaluate(([i, where]) => {
    document.querySelectorAll('ve-editable-rich-text')[i].scrollIntoView({block: where, behavior: 'instant'});
  }, [index, block]);
  await page.waitForTimeout(800);
}

/**
 * Where the CKEditor toolbar of the focused editable at `index` ended up, in
 * viewport coordinates, with the viewport, the editable and how many of the
 * toolbar's buttons can actually be clicked. Since 1.3.2 the toolbar lives in
 * a CKEditor balloon panel in <body>, as in CKEditor's InlineEditor.
 */
function measureToolbar(target, index) {
  return target.evaluate((i) => {
    const editable = document.querySelectorAll('ve-editable-rich-text')[i].querySelector('.ck-editor__editable');
    const panel = document.querySelector('.ck-balloon-panel.ck-toolbar-container.ck-balloon-panel_visible');
    const toolbar = panel?.querySelector('.ck-toolbar') ?? null;
    if (editable === null || toolbar === null) {
      return null;
    }
    const box = toolbar.getBoundingClientRect();
    const editableBox = editable.getBoundingClientRect();
    const viewport = {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
    const buttons = [...toolbar.querySelectorAll('.ck-toolbar__items > *')]
      .filter((item) => !item.matches('.ck-toolbar__separator, .ck-toolbar__line-break'));
    const clickable = buttons.filter((item) => {
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (rect.width === 0 || x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
        return false;
      }
      const hit = document.elementFromPoint(x, y);

      return hit !== null && item.contains(hit);
    });

    return {
      top: box.top,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      height: box.height,
      width: box.width,
      editor: {top: editableBox.top, bottom: editableBox.bottom},
      viewport,
      buttons: buttons.length,
      clickable: clickable.length,
      // 'over' is InlineEditor's sticky case: pinned to the top of the
      // viewport while a long editable is scrolled past its top.
      side: box.bottom <= editableBox.top ? 'above' : box.top >= editableBox.bottom ? 'below' : 'over',
    };
  }, index);
}

function expectToolbarInsideViewport(placement) {
  expect(placement, 'a CKEditor toolbar is shown in its balloon panel once the editable has focus').not.toBeNull();
  expect(placement.height, 'the toolbar has a rendered height').toBeGreaterThan(0);
  expect(placement.buttons, 'the toolbar shows its buttons').toBeGreaterThan(0);
  expect(placement.top, 'the toolbar is not cut off above the viewport').toBeGreaterThan(-1);
  expect(placement.left, 'the toolbar is not cut off left of the viewport').toBeGreaterThan(-1);
  expect(placement.right, 'the toolbar does not run past the right edge of the viewport').toBeLessThanOrEqual(placement.viewport.width);
  expect(placement.bottom, 'the toolbar does not run past the bottom edge of the viewport').toBeLessThanOrEqual(placement.viewport.height);
  expect(placement.clickable, 'every toolbar button can be clicked').toBe(placement.buttons);
}

test('the rich-text toolbar stays in view for an editable at the top edge of the viewport', {tag: '@rte'}, async ({page}) => {
  const index = await pickRichText(frame, 'top');
  test.skip(index < 0, `page ${config.rtePageId} renders no rich-text editable`);

  await focusRichText(page, index);
  // The editable right under the top edge: a toolbar above it would be cut off.
  await scrollRichText(page, index, 'start');

  const placement = await measureToolbar(frame, index);
  expectToolbarInsideViewport(placement);
  if (placement.editor.top < placement.height + 18) {
    expect(placement.side, 'no room above, so the toolbar goes below or over the editable').not.toBe('above');
  }
});

test('the rich-text toolbar stays above an editable at the bottom edge of the viewport', {tag: '@rte'}, async ({page}) => {
  const index = await pickRichText(frame, 'bottom');
  test.skip(index < 0, `page ${config.rtePageId} renders no rich-text editable`);

  await focusRichText(page, index);
  // The editable's end on the bottom edge: a toolbar below it would be below the fold.
  await scrollRichText(page, index, 'end');

  const placement = await measureToolbar(frame, index);
  expectToolbarInsideViewport(placement);
  if (placement.editor.top >= placement.height + 18) {
    expect(placement.side, 'with room above, the toolbar sits above the editable').toBe('above');
  }
});

test('the rich-text toolbar of the right-hand editable stays inside the viewport', {tag: '@rte'}, async ({page}) => {
  const index = await pickRichText(frame, 'right');
  test.skip(index < 0, `page ${config.rtePageId} renders no rich-text editable`);

  // The last card of a row: anchored to the editable's left edge, a toolbar
  // wider than the card runs past the right edge of the edit frame.
  await focusRichText(page, index);
  await scrollRichText(page, index, 'center');

  expectToolbarInsideViewport(await measureToolbar(frame, index));
});

test('the rich-text toolbar stays at the top of the viewport while a long text is scrolled past its top', {tag: '@rte'}, async ({page}) => {
  const index = await pickRichText(frame, 'first');
  test.skip(index < 0, `page ${config.rtePageId} renders no rich-text editable`);

  // Make the editable taller than the viewport - layout only, the content is
  // not touched - so the toolbar has to stay in view while it scrolls.
  await frame.evaluate((i) => {
    const style = document.createElement('style');
    style.textContent = 've-editable-rich-text[data-e2e-tall] .ck-editor__editable { min-height: 200vh !important; }';
    document.head.append(style);
    document.querySelectorAll('ve-editable-rich-text')[i].setAttribute('data-e2e-tall', '');
  }, index);
  await focusRichText(page, index);
  const before = await measureToolbar(frame, index);

  // Scroll on until the top of the editable is 300px above the viewport.
  await frame.evaluate((i) => {
    const rect = document.querySelectorAll('ve-editable-rich-text')[i].getBoundingClientRect();
    window.scrollTo({top: window.scrollY + rect.top + 300, behavior: 'instant'});
  }, index);
  await page.waitForTimeout(800);

  const placement = await measureToolbar(frame, index);
  expectToolbarInsideViewport(placement);
  expect(placement.side, 'the toolbar is pinned to the top of the viewport, over the editable').toBe('over');
  expect(placement.width, 'the toolbar keeps its width').toBeGreaterThanOrEqual(before.width * 0.9);
});

test('plain-text editables are rendered as editable outputs', async () => {
  const editables = await frame.evaluate(() => {
    const nodes = [...document.querySelectorAll('ve-editable-text')];

    return {
      total: nodes.length,
      // f:render.text on a TCA Textarea emits allowNewlines; that is the
      // plain-text editable pattern this extension documents.
      withNewlines: nodes.filter((node) => node.hasAttribute('allowNewlines') || node.hasAttribute('allownewlines')).length,
      editable: nodes.filter((node) => node.querySelector('[contenteditable]') !== null || node.hasAttribute('contenteditable')).length,
    };
  });

  expect(editables.total, `page ${config.pageId} renders plain-text editables`).toBeGreaterThan(0);
});
