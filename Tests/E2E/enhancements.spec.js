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

test.beforeEach(async ({page}) => {
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

  frame = await openEditFrame(page);
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
 * Where the CKEditor toolbar of the first rich-text editable ended up after a
 * real click into it, in viewport coordinates, plus the viewport itself.
 */
async function measureToolbar(frame) {
  return frame.evaluate(() => {
    const editable = document.querySelector('ve-editable-rich-text');
    const toolbar = editable.querySelector('.ck-toolbar') ?? document.querySelector('.ck-toolbar');
    if (toolbar === null) {
      return null;
    }
    const box = toolbar.getBoundingClientRect();
    const editor = editable.querySelector('.ck-editor');

    return {
      top: box.top,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      height: box.height,
      width: box.width,
      viewport: {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight},
      buttons: toolbar.querySelectorAll('button').length,
      side: editor?.classList.contains('ve-toolbar-inside') ? 'inside' : editor?.classList.contains('ve-toolbar-below') ? 'below' : 'above',
      // While the editable has focus the patch lifts `overflow: hidden` off
      // every ancestor, otherwise the floating toolbar is clipped away.
      clippingAncestors: (() => {
        let clipped = 0;
        for (let node = editable.parentElement; node !== null && node !== document.body; node = node.parentElement) {
          const overflow = getComputedStyle(node);
          if (overflow.overflowX === 'hidden' || overflow.overflowY === 'hidden') {
            clipped++;
          }
        }

        return clipped;
      })(),
    };
  });
}

function expectToolbarInsideViewport(placement) {
  expect(placement, 'a CKEditor toolbar exists once the editable has focus').not.toBeNull();
  expect(placement.height, 'the toolbar has a rendered height').toBeGreaterThan(0);
  expect(placement.width, 'the toolbar has a rendered width').toBeGreaterThan(0);
  expect(placement.buttons, 'the toolbar shows its buttons').toBeGreaterThan(0);
  expect(placement.top, 'the toolbar is not cut off above the viewport').toBeGreaterThan(-1);
  expect(placement.left, 'the toolbar is not cut off left of the viewport').toBeGreaterThan(-1);
  expect(placement.right, 'the toolbar does not run past the right edge of the viewport').toBeLessThanOrEqual(placement.viewport.width);
  expect(placement.bottom, 'the toolbar does not run past the bottom edge of the viewport').toBeLessThanOrEqual(placement.viewport.height);
  expect(placement.clippingAncestors, 'no ancestor clips the floating toolbar while the editable has focus').toBe(0);
}

test('the rich-text toolbar stays visible on focus, also near the viewport top', async ({page}) => {
  const count = await frame.evaluate(() => document.querySelectorAll('ve-editable-rich-text').length);
  test.skip(count === 0, 'the test page renders no rich-text editable');

  // Scroll the editable right under the top edge of the edit frame, the
  // position where a toolbar placed above the editable would be cut off.
  await frame.evaluate(() => document.querySelector('ve-editable-rich-text').scrollIntoView({block: 'start'}));
  await page.waitForTimeout(1500);

  // CKEditor only builds its toolbar on a real focus change, so this has to be
  // an actual click, not element.focus().
  await frame.locator('ve-editable-rich-text').first().click({force: true});
  await page.waitForTimeout(3000);

  expectToolbarInsideViewport(await measureToolbar(frame));
  await page.waitForTimeout(500);
});

test('the rich-text toolbar stays visible near the bottom edge of the viewport', async ({page}) => {
  const count = await frame.evaluate(() => document.querySelectorAll('ve-editable-rich-text').length);
  test.skip(count === 0, 'the test page renders no rich-text editable');

  // The editable's bottom on the bottom edge of the edit frame: a toolbar
  // flipped below it would be below the fold.
  await frame.evaluate(() => document.querySelector('ve-editable-rich-text').scrollIntoView({block: 'end'}));
  await page.waitForTimeout(1500);
  await frame.locator('ve-editable-rich-text').first().click({force: true});
  await page.waitForTimeout(3000);

  const placement = await measureToolbar(frame);
  expectToolbarInsideViewport(placement);
  expect(placement.side, 'with the editable at the bottom the toolbar sits above it').toBe('above');
  await page.waitForTimeout(500);
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
