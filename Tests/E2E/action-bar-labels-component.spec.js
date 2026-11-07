import {join} from 'node:path';
import {expect, test} from '@playwright/test';
import {actionBarHarness, screenshotDir} from './support/action-bar-harness.js';

/**
 * Action-bar labels (User settings > Visual editor > Action bar labels) and
 * the Add entry button, against the real vendor content element and the real
 * Core contextual edit trigger. No backend, no sign-in.
 */

const bar = (uid = 1) => `ve-content-element[uid="${uid}"]`;

/** Hover the element so the vendor shows its bar (class "hovered"). */
async function showBar(page, uid = 1) {
  await page.locator(bar(uid)).hover({position: {x: 40, y: 40}});
  await page.waitForFunction((uid) => document.querySelector(`ve-content-element[uid="${uid}"]`).shadowRoot.querySelector('.action-bar').classList.contains('hovered'), uid);
}

/** Describes every .button of the bar: accessible name, label text, caption state. */
function describeButtons(page, uid = 1) {
  return page.evaluate((uid) => {
    const actionBar = document.querySelector(`ve-content-element[uid="${uid}"]`).shadowRoot.querySelector('.action-bar');
    return [...actionBar.querySelectorAll('.button')].map((button) => {
      const after = getComputedStyle(button, '::after');
      return {kind: button.dataset.veEnhancement ?? button.tagName.toLowerCase(), name: button.getAttribute('aria-label'),
        title: button.getAttribute('title'), hidden: button.hidden, content: after.content, opacity: after.opacity,
        position: after.position, fontSize: after.fontSize, current: button.hasAttribute('data-ve-label-current'),
        popup: button.getAttribute('aria-haspopup'), disabled: button.getAttribute('aria-disabled')};
    });
  }, uid);
}

const barRect = (page, uid = 1) => page.evaluate((uid) => {
  const rect = document.querySelector(`ve-content-element[uid="${uid}"]`).shadowRoot.querySelector('.action-bar').getBoundingClientRect();
  return {width: rect.width, height: rect.height, x: rect.x, y: rect.y};
}, uid);

/** The button's on-screen box, reached through the wrapper's shadow root. */
function buttonLocator(page, selector, uid = 1) {
  return page.locator(`${bar(uid)} .action-bar ${selector}`);
}

const unquote = (content) => content.replace(/^"|"$/g, '');

test('adopts one shared stylesheet per element and keeps vendor buttons intact', async ({page}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await actionBarHarness(page);
  const result = await page.evaluate(() => {
    const [first, second] = document.querySelectorAll('ve-content-element');
    const sheetOf = (element) => element.shadowRoot.adoptedStyleSheets.filter((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes('data-ve-labels')));
    const vendorButtons = (element) => [...element.shadowRoot.querySelectorAll('.action-bar .button:not([data-ve-enhancement])')]
      .map((button) => ({tag: button.tagName.toLowerCase(), title: button.getAttribute('title'), name: button.getAttribute('aria-label'), children: button.childElementCount}));
    return {first: sheetOf(first).length, second: sheetOf(second).length, shared: sheetOf(first)[0] === sheetOf(second)[0], vendor: vendorButtons(first)};
  });
  expect(result.first).toBe(1);
  expect(result.second).toBe(1);
  expect(result.shared).toBe(true);
  // The vendor's title + aria-label bindings and its single icon child stay untouched.
  expect(result.vendor).toEqual([
    {tag: 'typo3-backend-contextual-record-edit-trigger', title: 'Edit content element', name: 'Edit content element', children: 1},
    {tag: 'button', title: 'Show content element', name: 'Show content element', children: 1},
    {tag: 'button', title: 'Delete content element', name: 'Delete content element', children: 1},
    {tag: 'button', title: 'Add content element', name: 'Add content element', children: 1},
  ]);
  expect(errors).toEqual([]);
});

test('every label equals or is contained in the accessible name, in English and German', async ({page}) => {
  for (const lang of ['en', 'de']) {
    await actionBarHarness(page, {lang, mode: 'inline'});
    await showBar(page);
    const buttons = (await describeButtons(page)).filter((button) => !button.hidden);
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    for (const button of buttons) {
      expect(button.name.toLocaleLowerCase(), `${lang}: ${button.kind}`).toContain(unquote(button.content).toLocaleLowerCase());
    }
    const byKind = Object.fromEntries(buttons.map((button) => [button.kind, unquote(button.content)]));
    expect(byKind).toEqual(lang === 'en'
      ? {'typo3-backend-contextual-record-edit-trigger': 'Edit', button: 'Add', 'field-chooser': 'Settings', 'inline-records': 'Entries', 'inline-add': 'Add entry'}
      : {'typo3-backend-contextual-record-edit-trigger': 'Bearbeiten', button: 'Hinzufügen', 'field-chooser': 'Einstellungen', 'inline-records': 'Einträge', 'inline-add': 'Eintrag hinzufügen'});
    await page.unrouteAll({behavior: 'wait'});
  }
});

test('caption shows the current button\'s name without changing the bar width', async ({page}) => {
  await actionBarHarness(page);
  await showBar(page);
  const before = await barRect(page);
  const resting = await describeButtons(page);
  expect(resting.every((button) => button.opacity === '0')).toBe(true);
  await buttonLocator(page, '[data-ve-enhancement="inline-add"]').hover();
  await expect.poll(async () => (await describeButtons(page)).find((button) => button.kind === 'inline-add').opacity).toBe('1');
  const add = (await describeButtons(page)).find((button) => button.kind === 'inline-add');
  expect(add.content).toBe('"Add entry"');
  expect(add.fontSize).toBe('11px');
  expect(add.position).toBe('absolute');
  expect((await describeButtons(page)).filter((button) => button.opacity === '1')).toHaveLength(1);
  const after = await barRect(page);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  await page.screenshot({path: join(screenshotDir, 'action-bar-caption-hover-add-entry.png'), clip: {x: after.x - 16, y: after.y - 16, width: after.width + 32, height: after.height + 32}});
});

test('the caption stays while the pointer moves onto it inside the bar', async ({page}) => {
  await actionBarHarness(page);
  await showBar(page);
  const entriesButton = buttonLocator(page, '[data-ve-enhancement="inline-records"]');
  await entriesButton.hover();
  const rect = await barRect(page);
  const button = await entriesButton.boundingBox();
  // Straight down into the reserved caption row (the bottom 14 px above the
  // bar's 4 px padding), then along it to the left: no other button is entered.
  await page.mouse.move(button.x + button.width / 2, rect.y + rect.height - 10, {steps: 4});
  await page.mouse.move(rect.x + 12, rect.y + rect.height - 10, {steps: 4});
  await page.waitForTimeout(200);
  const entries = (await describeButtons(page)).find((button) => button.kind === 'inline-records');
  expect(entries.current).toBe(true);
  expect(entries.opacity).toBe('1');
});

test('the contextual edit trigger host renders its ::after label (CSS Scoping), no fallback needed', async ({page}) => {
  await actionBarHarness(page);
  await showBar(page);
  // Rendering proof by pixels: the caption row differs once the trigger is current.
  const rect = await barRect(page);
  const clip = {x: rect.x, y: rect.y + rect.height - 20, width: rect.width, height: 20};
  await page.mouse.move(rect.x + 8, rect.y + 8); // headline: no button entered yet
  await page.evaluate(() => document.querySelector('ve-content-element').shadowRoot.querySelectorAll('[data-ve-label-current]').forEach((node) => node.removeAttribute('data-ve-label-current')));
  await page.waitForTimeout(200);
  const empty = await page.screenshot({clip});
  await page.evaluate(() => document.querySelector('ve-content-element').shadowRoot.querySelector('typo3-backend-contextual-record-edit-trigger').setAttribute('data-ve-label-current', ''));
  await page.waitForTimeout(200);
  const labelled = await page.screenshot({clip});
  expect(Buffer.compare(empty, labelled)).not.toBe(0);
  const trigger = (await describeButtons(page)).find((button) => button.kind === 'typo3-backend-contextual-record-edit-trigger');
  expect(trigger.content).toBe('"Edit"');
  expect(trigger.opacity).toBe('1');
  // The host's own shadow root is only Core's <slot>: no node was added for the label.
  expect(await page.evaluate(() => {
    const host = document.querySelector('ve-content-element').shadowRoot.querySelector('typo3-backend-contextual-record-edit-trigger');
    return {shadow: host.shadowRoot.innerHTML.replace(/<!--[^]*?-->/g, '').trim(), light: host.querySelectorAll('.ve-label').length};
  })).toEqual({shadow: '<slot></slot>', light: 0});
  await page.screenshot({path: join(screenshotDir, 'action-bar-caption-contextual-trigger.png'), clip: {x: rect.x - 16, y: rect.y - 16, width: rect.width + 32, height: rect.height + 32}});
});

test('a click pins the caption until the pointer leaves, and a Lit re-render keeps labels and injected buttons', async ({page}) => {
  await actionBarHarness(page);
  await showBar(page);
  const toggle = buttonLocator(page, 'button[role="switch"]');
  await toggle.click();
  // The vendor toggled isHidden and re-rendered its template.
  await expect.poll(() => page.evaluate(() => document.querySelector('ve-content-element').isHidden)).toBe(true);
  const rect = await barRect(page);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height + 60, {steps: 4}); // out of the bar, still inside the element
  await page.waitForTimeout(200);
  let state = await page.evaluate(() => {
    const actionBar = document.querySelector('ve-content-element').shadowRoot.querySelector('.action-bar');
    return {pinned: actionBar.hasAttribute('data-ve-labels-pinned'), mode: actionBar.dataset.veLabels, current: actionBar.querySelector('[data-ve-label-current]')?.getAttribute('role'),
      ours: [...actionBar.querySelectorAll('[data-ve-enhancement]')].map((button) => button.dataset.veEnhancement), label: actionBar.querySelector('[role="switch"]').dataset.veLabel};
  });
  expect(state).toEqual({pinned: true, mode: 'caption', current: 'switch', ours: ['field-chooser', 'inline-records', 'inline-add'], label: 'Show'});
  await page.mouse.move(5, 5, {steps: 4}); // leave the element
  await page.waitForTimeout(200);
  state = await page.evaluate(() => {
    const actionBar = document.querySelector('ve-content-element').shadowRoot.querySelector('.action-bar');
    return {pinned: actionBar.hasAttribute('data-ve-labels-pinned'), current: actionBar.querySelectorAll('[data-ve-label-current]').length};
  });
  expect(state).toEqual({pinned: false, current: 0});
});

test('keyboard focus reveals the label like hover', async ({page}) => {
  await actionBarHarness(page);
  await page.mouse.move(5, 5);
  let focused = null;
  for (let step = 0; step < 12 && focused === null; step++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => {
      const active = document.querySelector('ve-content-element').shadowRoot.activeElement;
      return active?.classList.contains('button') ? (active.dataset.veEnhancement ?? active.tagName.toLowerCase()) : null;
    });
  }
  expect(focused).toBe('typo3-backend-contextual-record-edit-trigger');
  await page.waitForTimeout(200);
  const trigger = (await describeButtons(page)).find((button) => button.kind === focused);
  expect(trigger).toMatchObject({current: true, opacity: '1', content: '"Edit"'});
  // Tab order: Edit, then our Settings, Entries, Add entry, then the vendor's Show, Delete, Add.
  for (let step = 0; step < 5; step++) { await page.keyboard.press('Tab'); }
  await page.waitForTimeout(200);
  const visible = (await describeButtons(page)).filter((button) => button.opacity === '1');
  expect(visible.map((button) => button.content)).toEqual(['"Delete"']);
});

test('inline, stacked and icons modes', async ({page}) => {
  const results = {};
  for (const mode of ['inline', 'stacked', 'icons']) {
    await actionBarHarness(page, {mode});
    const resting = await barRect(page);
    await showBar(page);
    const shown = await barRect(page);
    await buttonLocator(page, '[data-ve-enhancement="inline-add"]').hover();
    await page.waitForTimeout(200);
    const hovered = await barRect(page);
    results[mode] = {buttons: (await describeButtons(page)).filter((button) => !button.hidden), resting, shown, hovered};
    await page.screenshot({path: join(screenshotDir, `action-bar-${mode}.png`), clip: {x: hovered.x - 16, y: hovered.y - 16, width: hovered.width + 32, height: hovered.height + 32}});
    await page.unrouteAll({behavior: 'wait'});
  }
  for (const mode of ['inline', 'stacked']) {
    const {buttons, shown, hovered} = results[mode];
    expect(buttons.every((button) => button.opacity === '1' && button.position === 'static'), mode).toBe(true);
    expect(new Set(buttons.map((button) => button.fontSize)), mode).toEqual(new Set([mode === 'inline' ? '11px' : '10px']));
    // Sizes change only when the bar appears, never while it is hovered.
    expect(hovered.width, mode).toBe(shown.width);
    expect(buttons.filter((button) => button.title !== null && button.kind.startsWith('inline')), mode).toEqual([]);
  }
  const icons = results.icons.buttons;
  expect(icons.every((button) => button.content === 'none' || button.content === 'normal')).toBe(true);
  // icons mode: our buttons keep their descriptive tooltip.
  expect(icons.filter((button) => button.kind === 'inline-records' || button.kind === 'field-chooser').map((button) => button.title))
    .toEqual(['Edit field settings', 'Edit collection entries']);
});

test('hover:none shows inline labels instead of the caption row', async ({browser}) => {
  const context = await browser.newContext({hasTouch: true, isMobile: true, viewport: {width: 1280, height: 900}, ignoreHTTPSErrors: true});
  const page = await context.newPage();
  await actionBarHarness(page);
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  await page.locator(bar(1)).tap({position: {x: 40, y: 60}});
  await page.evaluate(() => document.querySelector('ve-content-element').shadowRoot.querySelector('.action-bar').classList.add('hovered'));
  const buttons = (await describeButtons(page)).filter((button) => !button.hidden);
  expect(buttons.every((button) => button.position === 'static' && button.opacity === '1')).toBe(true);
  await context.close();
});

test('reduced motion removes the caption transition', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await actionBarHarness(page);
  const transition = await page.evaluate(() => getComputedStyle(document.querySelector('ve-content-element').shadowRoot.querySelector('.action-bar .button'), '::after').transitionDuration);
  expect(transition).toBe('0s');
});

test('Add entry and Entries render from the first paint with collectionTypes, only for CTypes with collections', async ({page}) => {
  await actionBarHarness(page);
  const state = await page.evaluate(() => [...document.querySelectorAll('ve-content-element')].map((element) => {
    const actionBar = element.shadowRoot.querySelector('.action-bar');
    const add = actionBar.querySelector('[data-ve-enhancement="inline-add"]');
    const entries = actionBar.querySelector('[data-ve-enhancement="inline-records"]');
    return {cType: element.getAttribute('CType'), add: add && !add.hidden, entries: entries && !entries.hidden,
      addPopup: add?.getAttribute('aria-haspopup') ?? null, entriesPopup: entries?.getAttribute('aria-haspopup') ?? null, addTitle: add?.getAttribute('title') ?? null};
  }));
  expect(state).toEqual([
    {cType: 'feature_cards', add: true, entries: true, addPopup: null, entriesPopup: 'dialog', addTitle: null},
    {cType: 'text', add: false, entries: false, addPopup: null, entriesPopup: 'dialog', addTitle: null},
  ]);
});

test('without collectionTypes the buttons are discovered on hover, as in 1.5', async ({page}) => {
  await actionBarHarness(page, {collectionTypes: null});
  const visible = () => page.evaluate(() => {
    const add = document.querySelector('ve-content-element').shadowRoot.querySelector('[data-ve-enhancement="inline-add"]');
    return !add.hidden;
  });
  expect(await visible()).toBe(false);
  await showBar(page);
  await expect.poll(visible).toBe(true);
});

test('Add entry creates at the end, refreshes the element, opens the inspector and focuses the new editable', async ({page}) => {
  const {posts} = await actionBarHarness(page);
  await showBar(page);
  await buttonLocator(page, '[data-ve-enhancement="inline-add"]').click();
  await expect(page.getByRole('dialog', {name: 'Entries'})).toBeVisible();
  expect(posts).toEqual([{inlineRecord: {action: 'create', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1'}}]);
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    return active?.closest('ve-editable-text')?.getAttribute('uid') ?? null;
  })).toBe('8');
  await expect(page.getByText('Entry added.', {exact: false})).toBeVisible();
});

test('Add entry is aria-disabled with the reason after the capability fetch refuses it', async ({page}) => {
  const {posts} = await actionBarHarness(page, {field: {canCreate: false, createReason: 'max'}});
  await showBar(page);
  const add = buttonLocator(page, '[data-ve-enhancement="inline-add"]');
  await add.click();
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(add).toHaveAttribute('title', 'The collection has reached its entry limit.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(posts).toEqual([]);
  // Still in the tab order, still visible: never hidden after a refusal.
  expect(await add.evaluate((button) => button.hidden || button.tabIndex < 0)).toBe(false);
});

test('screenshots: caption at rest and on Add entry, light and dark, with the inspector after Add entry', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme: scheme});
    await actionBarHarness(page, {scheme});
    await showBar(page);
    const rect = await barRect(page);
    await page.screenshot({path: join(screenshotDir, `action-bar-caption-rest-${scheme}.png`), clip: {x: 0, y: 0, width: 1280, height: rect.y + rect.height + 260}});
    await buttonLocator(page, '[data-ve-enhancement="inline-add"]').hover();
    await page.waitForTimeout(250);
    await page.screenshot({path: join(screenshotDir, `action-bar-caption-add-entry-${scheme}.png`), clip: {x: 0, y: 0, width: 1280, height: rect.y + rect.height + 260}});
    await buttonLocator(page, '[data-ve-enhancement="inline-add"]').click();
    await expect(page.getByRole('dialog', {name: 'Entries'})).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({path: join(screenshotDir, `add-entry-inspector-${scheme}.png`)});
    await page.unrouteAll({behavior: 'wait'});
  }
});
