import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';
import {actionBarHarness, collectionField, element, entry, screenshotDir} from './support/action-bar-harness.js';

/**
 * The on-page row layer (VEE 1.7, plan 2.4 "1.7 on-page layer"): the row
 * toolbar `ve-row-actions` on f:mark.item rows and the add buttons
 * `ve-row-appender`, against the REAL vendor wrapper and store, the REAL
 * Frontend/index.js injection pass and an element refresh served by the
 * harness. The server is mocked with the 1.7 protocol (duplicate, restore,
 * cascade counts).
 */

const LABELS = {2: 'Add a card', 3: 'Export anywhere', 4: 'Translate once', 8: 'New entry', 9: 'Add a card (copy)',
  12: 'Slide one', 13: 'Slide two', 14: 'Slide three', 21: 'Unmarked one', 22: 'Unmarked two'};

/** A marked entry: its primary rendering carries the f:mark.item attributes. */
const card = (uid, collection, hidden = false, marked = true) => `<div class="card"${marked
  ? ` data-ve-item="items:${uid}" data-ve-item-live="${uid}" data-ve-collection="${collection}"${hidden ? ' data-ve-item-hidden=""' : ''}` : ''}>
  <ve-editable-text table="items" uid="${uid}" field="title"><span contenteditable="plaintext-only">${LABELS[uid]}</span></ve-editable-text>
  <p>Short supporting text for this entry.</p></div>`;

const CSS = `
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card { padding: 16px; border: 1px solid #d0d4da; border-radius: 6px; }
  .viewport { overflow: hidden; width: 600px; }
  .track { display: flex; gap: 16px; transform: translateX(0); }
  .track .card { flex: 0 0 280px; }
  @media (max-width: 600px) { .cards { grid-template-columns: 1fr; } .viewport { width: 300px; } }
`;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{collectionRows?: string, scheme?: 'light'|'dark', mode?: string, order?: number[], hidden?: number[], cards?: object, slides?: boolean}} options
 */
async function rowsPage(page, {collectionRows = 'rows', scheme = 'light', mode = 'caption', order = [2, 3, 4], hidden = [3], cards = {}, slides = false} = {}) {
  const harness = await actionBarHarness(page, {
    collectionRows, scheme, mode, css: CSS,
    collectionTypes: {tt_content: {feature_cards: ['cards'], carousel: ['slides']}},
    body: (state) => {
      state.order ??= [...order];
      state.slideShift ??= 0;
      return `
      ${element(1, 'feature_cards', 'Feature Cards Grid', `<div class="cards">${state.order.map((uid) => card(uid, 'cards', hidden.includes(uid))).join('')}</div>`)}
      ${slides ? element(6, 'carousel', 'Carousel', `<div class="viewport"><div class="track">${[12, 13, 14].map((uid) => card(uid, 'slides')).join('')}</div></div>`) : ''}
      ${element(7, 'feature_cards', 'Unmarked Cards', `<div class="cards">${[21, 22].map((uid) => card(uid, 'cards', false, false)).join('')}</div>`)}`;
    },
    payload: (url, state) => {
      const uid = url.searchParams.get('uid');
      if (uid === '1') {
        const children = state.order.map((child, index) => entry(child, LABELS[child], {hidden: hidden.includes(child),
          canMoveUp: index > 0, canMoveDown: index < state.order.length - 1, canDuplicate: true, duplicateReason: '',
          cascade: {translations: 0, languages: [], children: child === 4 ? 2 : 0, files: child === 4 ? 1 : 0, truncated: false}}));
        return [collectionField({uids: [...state.order], children, ...cards})];
      }
      if (uid === '6') {
        return [collectionField({name: 'slides', label: 'Slides', parentUid: 6, childTitle: 'slide', uids: [12, 13, 14],
          children: [12, 13, 14].map((child) => entry(child, LABELS[child]))})];
      }
      if (uid === '7') {
        return [collectionField({parentUid: 7, uids: [21, 22], children: [21, 22].map((child) => entry(child, LABELS[child]))})];
      }
      return [];
    },
    save: (body, state) => {
      const intent = body.inlineRecord ?? {};
      const order = state.order;
      if (intent.action === 'create') {
        const uid = order.includes(8) ? 10 : 8;
        LABELS[uid] ??= 'New entry';
        order.splice(intent.afterUid ? order.indexOf(intent.afterUid) + 1 : order.length, 0, uid);
        return {success: true, uid, created: {uid, table: 'items', hidden: true, hiddenField: 'hidden'}};
      }
      if (intent.action === 'duplicate') {
        order.splice(order.indexOf(intent.childUid) + 1, 0, 9);
        // The server's real success shape (InlineDuplicateTest).
        return {success: true, uid: 9, created: {uid: 9, table: 'items', hidden: true, hiddenField: 'hidden'}, duplicated: {uid: intent.childUid},
          workspace: {id: 0, firstVersion: false}};
      }
      if (intent.action === 'move') {
        order.splice(order.indexOf(intent.childUid), 1);
        order.splice(intent.afterUid === null ? 0 : order.indexOf(intent.afterUid) + 1, 0, intent.childUid);
        return {success: true, moved: {position: order.indexOf(intent.childUid) + 1}};
      }
      if (intent.action === 'delete') {
        order.splice(order.indexOf(intent.childUid), 1);
        return {success: true};
      }
      return {success: true};
    },
  });
  return harness;
}

const rail = (page) => page.locator('ve-row-actions .bar');
const railButton = (page, name) => rail(page).locator('.button').and(page.getByLabel(name, {exact: true}));
const cardOf = (page, uid) => page.locator(`[data-ve-item="items:${uid}"]`);
const appenders = (page) => page.locator('ve-row-appender .appender');
const railShown = (page) => page.waitForFunction(() => {
  const host = document.querySelector('ve-row-actions');
  return host?.visible && !host.hasAttribute('offscreen') && getComputedStyle(host.shadowRoot.querySelector('.bar')).opacity === '1';
});
const railHidden = (page) => page.waitForFunction(() => !document.querySelector('ve-row-actions')?.visible);
/** The deep active element's text node owner: which entry has the focus. */
const focusedEntry = (page) => page.evaluate(() => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) { active = active.shadowRoot.activeElement; }
  return active?.closest?.('ve-editable-text')?.getAttribute('uid') ?? null;
});

test('rows: hovering a marked entry shows the row toolbar above it, labelled like the action bar; leaving hides it', async ({page}) => {
  await rowsPage(page);
  await cardOf(page, 3).hover();
  await railShown(page);
  await expect(page.getByRole('toolbar', {name: 'Entry 2: Export anywhere'})).toBeVisible();
  const names = await rail(page).locator('.button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(names).toEqual(['Move up', 'Move down', 'Visible on the live site', 'Add after', 'Remove', 'Duplicate', 'Item settings']);
  // Above the entry, right-aligned with it; the entry's own text stays uncovered.
  const [bar, box] = [await rail(page).boundingBox(), await cardOf(page, 3).boundingBox()];
  expect(bar.y + bar.height).toBeLessThanOrEqual(box.y + 1);
  expect(Math.abs(bar.x + bar.width - (box.x + box.width))).toBeLessThanOrEqual(1);
  // Caption mode: the shared label sheet - the pointed button's name, 11 px.
  await railButton(page, 'Duplicate').hover();
  await expect.poll(() => railButton(page, 'Duplicate').evaluate((button) => {
    const style = getComputedStyle(button, '::after');
    return {content: style.content, size: style.fontSize, opacity: style.opacity};
  })).toEqual({content: '"Duplicate"', size: '11px', opacity: '1'});
  // The hidden entry says why it looks dimmed; the toolbar's eye reads "not visible".
  await cardOf(page, 2).hover();
  await expect(page.getByRole('toolbar', {name: 'Entry 1: Add a card'})).toBeVisible();
  await expect(railButton(page, 'Move up')).toHaveAttribute('aria-disabled', 'true');
  await expect(railButton(page, 'Move up')).toHaveAttribute('title', 'This is the first entry.');
  await page.mouse.move(5, 5);
  await railHidden(page);
});

test('focus in an entry shows the toolbar; Escape inside it returns the focus to the entry; Tab is never intercepted', async ({page}) => {
  await rowsPage(page);
  await cardOf(page, 2).locator('[contenteditable]').focus();
  await railShown(page);
  await expect(page.getByRole('toolbar', {name: 'Entry 1: Add a card'})).toBeVisible();
  // Tab moves on through the page (the next entry's text), not into the toolbar.
  await page.keyboard.press('Tab');
  expect(await focusedEntry(page)).toBe('3');
  await expect(page.getByRole('toolbar', {name: 'Entry 2: Export anywhere'})).toBeVisible();
  // The pointer user's click lands in the toolbar; Escape hands the focus back.
  await railButton(page, 'Item settings').focus();
  await page.keyboard.press('Escape');
  expect(await focusedEntry(page)).toBe('3');
  // Arrow keys move inside the toolbar.
  await railButton(page, 'Move down').focus();
  await page.keyboard.press('ArrowRight');
  await expect(railButton(page, 'Visible on the live site')).toBeFocused();
});

test('add after posts afterUid, refreshes the element and puts the focus into the new entry', async ({page}) => {
  const {posts} = await rowsPage(page);
  await cardOf(page, 2).hover();
  await railShown(page);
  await railButton(page, 'Add after').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].inlineRecord).toEqual({action: 'create', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1', afterUid: 2});
  await expect(page.locator('ve-content-element[uid="1"] .card')).toHaveCount(4);
  await expect.poll(() => page.locator('ve-content-element[uid="1"] [data-ve-item]').evaluateAll((nodes) => nodes.map((node) => node.dataset.veItem)))
    .toEqual(['items:2', 'items:8', 'items:3', 'items:4']);
  await expect.poll(() => focusedEntry(page)).toBe('8');
  await expect(page.locator('ve-row-actions .status')).toContainText('Entry added. New entries start hidden.');
});

test('duplicate posts childUid; the copy follows the original and takes the focus', async ({page}) => {
  const {posts} = await rowsPage(page);
  await cardOf(page, 2).hover();
  await railShown(page);
  await railButton(page, 'Duplicate').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].inlineRecord).toEqual({action: 'duplicate', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1', childUid: 2});
  await expect.poll(() => focusedEntry(page)).toBe('9');
  const status = page.locator('ve-row-actions .status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toContainText('Copy added below the original. It starts hidden');
  await expect(status.locator('button')).toHaveCount(0);
});

test('move posts one intent and keeps the keyboard on the moved entry\'s control', async ({page}) => {
  const {posts} = await rowsPage(page);
  await cardOf(page, 3).hover();
  await railShown(page);
  await railButton(page, 'Move up').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].inlineRecord).toEqual({action: 'move', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1', childUid: 3, afterUid: null});
  await expect(page.getByRole('toolbar', {name: 'Entry 1: Export anywhere'})).toBeVisible();
  await expect(railButton(page, 'Move up')).toBeFocused();
  await expect(page.locator('ve-row-actions .status')).toContainText('Moved to position 1.');
});

test('remove asks the counted Core confirm (nested entries, image references) and focuses the next entry', async ({page}) => {
  const {posts} = await rowsPage(page);
  const messages = [];
  page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.accept(); });
  await cardOf(page, 4).hover();
  await railShown(page);
  await railButton(page, 'Remove').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(messages[0]).toBe('Remove “Translate once”? Also removes 2 nested entries, 1 image reference. The files stay in the file list. '
    + 'It disappears from the live site immediately. Reset does not undo this operation.');
  expect(posts[0].inlineRecord).toMatchObject({action: 'delete', childUid: 4});
  await expect(page.locator('ve-content-element[uid="1"] .card')).toHaveCount(2);
  // The last entry went: the focus lands on the entry now in its place (the new last one).
  await expect.poll(() => focusedEntry(page)).toBe('3');
});

test('the eye stages visibility like the inspector: the entry dims at once and a second toggle leaves the store clean', async ({page}) => {
  await rowsPage(page);
  await cardOf(page, 2).hover();
  await railShown(page);
  const eye = railButton(page, 'Visible on the live site');
  await expect(eye).toHaveAttribute('aria-checked', 'true');
  await eye.click();
  await expect(eye).toHaveAttribute('aria-checked', 'false');
  await expect(cardOf(page, 2)).toHaveAttribute('data-ve-item-hidden', '');
  expect(await page.evaluate(() => window.store.hasChangedData('items', 2, 'hidden'))).toBe(true);
  await eye.click();
  await expect(eye).toHaveAttribute('aria-checked', 'true');
  await expect(cardOf(page, 2)).not.toHaveAttribute('data-ve-item-hidden', '');
  expect(await page.evaluate(() => window.store.hasChangedData('items', 2, 'hidden'))).toBe(false);
});

test('a Reset (store discard) re-derives the mark of an entry hidden from the toolbar', async ({page}) => {
  await rowsPage(page);
  await cardOf(page, 2).hover();
  await railShown(page);
  await railButton(page, 'Visible on the live site').click();
  await expect(cardOf(page, 2)).toHaveAttribute('data-ve-item-hidden', '');
  await page.evaluate(() => window.store.reset());
  await expect(cardOf(page, 2)).not.toHaveAttribute('data-ve-item-hidden', '');
});

test('inline label mode: every toolbar button shows its name beside its icon', async ({page}) => {
  await rowsPage(page, {mode: 'inline'});
  await cardOf(page, 3).hover();
  await railShown(page);
  const labels = await rail(page).locator('.button').evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button, '::after');
    return style.opacity === '1' ? style.content : '';
  }));
  expect(labels).toEqual(['"Move up"', '"Move down"', '"Visible on the live site"', '"Add after"', '"Remove"', '"Duplicate"', '"Item settings"']);
});

test('appender: one add button after the last entry, follows levelLinksPosition, refused at the maximum', async ({page}) => {
  for (const [levelLinksPosition, sides] of [['bottom', ['bottom']], ['top', ['top']], ['both', ['top', 'bottom']], ['none', []], [undefined, ['bottom']]]) {
    const {posts} = await rowsPage(page, {collectionRows: 'appender', cards: levelLinksPosition ? {levelLinksPosition} : {}});
    await cardOf(page, 3).hover();
    // appender mode: no row toolbar.
    await expect(page.locator('ve-row-actions')).toHaveCount(0);
    if (sides.length === 0) {
      await page.waitForTimeout(300);
      await expect(appenders(page)).toHaveCount(0);
      await page.unrouteAll({behavior: 'wait'});
      continue;
    }
    await expect(appenders(page)).toHaveCount(sides.length);
    await expect.poll(() => appenders(page).evaluateAll((buttons) => buttons.map((button) => button.dataset.side))).toEqual(sides);
    const grid = await page.locator('ve-content-element[uid="1"] .cards').boundingBox();
    const element = await page.locator('ve-content-element[uid="1"]').boundingBox();
    for (const side of sides) {
      const box = await page.locator(`ve-row-appender .appender[data-side="${side}"]`).boundingBox();
      if (side === 'bottom') { expect(box.y).toBeGreaterThanOrEqual(grid.y + grid.height); } else { expect(box.y + box.height).toBeLessThanOrEqual(grid.y); }
      expect(Math.round(box.width)).toBe(Math.round(grid.width));
      // Never across the element's edge: inside the gap when it fits (the
      // heading's room above), else just outside (the 24 px padding below).
      const edge = side === 'bottom' ? element.y + element.height : element.y;
      expect(box.y >= edge - 0.5 || box.y + box.height <= edge + 0.5).toBe(true);
    }
    const first = page.locator('ve-row-appender .appender').first();
    await expect(first).toHaveText(sides[0] === 'top' ? 'Add feature card at the start' : 'Add feature card');
    // 60 % at rest, full on its own hover.
    expect(await first.evaluate((button) => /^(rgba|color)\(.*0\.6\)$/.test(getComputedStyle(button).backgroundColor))).toBe(true);
    await first.hover();
    await expect.poll(() => first.evaluate((button) => /^rgb\(\d+, \d+, \d+\)$/.test(getComputedStyle(button).backgroundColor))).toBe(true);
    await first.click();
    await expect.poll(() => posts.length).toBe(sides[0] === 'top' ? 2 : 1);
    expect(posts[0].inlineRecord).toEqual({action: 'create', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1'});
    if (sides[0] === 'top') {
      // Core's create appends; one move puts the new entry first.
      expect(posts[1].inlineRecord).toMatchObject({action: 'move', childUid: 8, afterUid: null});
      await expect.poll(() => page.locator('ve-content-element[uid="1"] [data-ve-item]').first().getAttribute('data-ve-item')).toBe('items:8');
    }
    await expect.poll(() => focusedEntry(page)).toBe('8');
    await page.unrouteAll({behavior: 'wait'});
  }
  // At the maximum: the button stays, refused, with the reason; a click writes nothing.
  const {posts} = await rowsPage(page, {collectionRows: 'appender', cards: {maxItems: 3}});
  await cardOf(page, 3).hover();
  const full = appenders(page).first();
  await expect(full).toHaveAttribute('aria-disabled', 'true');
  await expect(full).toContainText('The collection has reached its entry limit.');
  await full.click({force: true});
  await page.waitForTimeout(200);
  expect(posts).toHaveLength(0);
});

test('rows mode: the rail and the add button together; the add button of the hovered element only', async ({page}) => {
  await rowsPage(page, {slides: true});
  await cardOf(page, 2).hover();
  await railShown(page);
  await expect(appenders(page)).toHaveCount(1);
  await expect(appenders(page)).toHaveText('Add feature card');
  await cardOf(page, 12).hover();
  await expect(page.getByRole('toolbar', {name: 'Entry 1: Slide one'})).toBeVisible();
  await expect(appenders(page)).toHaveText('Add slide');
});

test('unmarked templates get no row toolbar and no add button', async ({page}) => {
  await rowsPage(page);
  await page.locator('ve-content-element[uid="7"] ve-editable-text[uid="21"]').hover();
  await page.locator('ve-content-element[uid="7"] ve-editable-text[uid="21"] [contenteditable]').focus();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.querySelector('ve-row-actions')?.visible)).toBe(false);
  expect(await page.evaluate(() => !!document.querySelector('ve-row-appender')?.visible)).toBe(false);
});

test('panel mode puts nothing on the page', async ({page}) => {
  await rowsPage(page, {collectionRows: 'panel'});
  await cardOf(page, 2).hover();
  await cardOf(page, 2).locator('[contenteditable]').focus();
  await page.waitForTimeout(400);
  await expect(page.locator('ve-row-actions, ve-row-appender')).toHaveCount(0);
});

test('the inspector mirror outlines the page row only; the toolbar answers the page alone', async ({page}) => {
  await rowsPage(page);
  const entries = page.locator('ve-content-element[uid="1"]').locator('[data-ve-enhancement="inline-records"]');
  await page.locator('ve-content-element[uid="1"]').hover();
  await entries.click();
  await page.locator('ve-field-chooser [data-ve-row="3"]').waitFor();
  await page.locator('ve-field-chooser [data-ve-row="3"]').hover();
  await expect(cardOf(page, 3)).toHaveAttribute('data-ve-item-highlight', '');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.querySelector('ve-row-actions')?.visible)).toBe(false);
  // The page side: hovering the entry marks its inspector row and shows the toolbar.
  await cardOf(page, 2).hover();
  await railShown(page);
  await expect(page.locator('ve-field-chooser [data-ve-row="2"]')).toHaveClass(/isMirrored/);
});

test('transformed containers: the toolbar follows a sliding entry and steps aside when it leaves the slider viewport', async ({page}) => {
  await rowsPage(page, {slides: true});
  await cardOf(page, 12).locator('[contenteditable]').focus();
  await railShown(page);
  const before = await rail(page).boundingBox();
  const slide = await cardOf(page, 12).boundingBox();
  expect(Math.abs(before.x + before.width - (slide.x + slide.width))).toBeLessThanOrEqual(1);
  await page.locator('.track').evaluate((track) => { track.style.transform = 'translateX(-120px)'; });
  await expect.poll(async () => Math.round((await rail(page).boundingBox()).x)).toBe(Math.round(before.x - 120));
  await page.locator('.track').evaluate((track) => { track.style.transform = 'translateX(-700px)'; });
  await expect(page.locator('ve-row-actions')).toHaveAttribute('offscreen', '');
  await expect.poll(() => rail(page).evaluate((bar) => getComputedStyle(bar).opacity)).toBe('0');
  await page.locator('.track').evaluate((track) => { track.style.transform = 'translateX(0)'; });
  await expect(page.locator('ve-row-actions')).not.toHaveAttribute('offscreen', '');
  // Scrolled out of the viewport: aside as well.
  await page.evaluate(() => { document.body.style.paddingBottom = '3000px'; window.scrollTo(0, 2500); });
  await expect(page.locator('ve-row-actions')).toHaveAttribute('offscreen', '');
});

test('axe: the row toolbar, its status card and the add button pass WCAG 2.2 AA (light and dark)', async ({page}) => {
  const axe = await readFile(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
  for (const scheme of ['light', 'dark']) {
    await rowsPage(page, {scheme});
    await cardOf(page, 3).hover();
    await railShown(page);
    await railButton(page, 'Visible on the live site').hover();
    await page.evaluate(() => document.querySelector('ve-row-actions').announce('Moved to position 2.'));
    await page.addScriptTag({content: axe});
    const result = await page.evaluate(async () => window.axe.run({include: [['ve-row-actions'], ['ve-row-appender']]},
      {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']}}));
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
    expect(result.passes.length).toBeGreaterThan(0);
    await page.unrouteAll({behavior: 'wait'});
  }
});

test('screenshots: the row toolbar and the add button, light and dark, 1280 and 390 px', async ({page}) => {
  test.setTimeout(120000);
  for (const width of [1280, 390]) {
    for (const scheme of ['light', 'dark']) {
      await page.setViewportSize({width, height: 900});
      await rowsPage(page, {scheme});
      await cardOf(page, 3).hover();
      await railShown(page);
      await railButton(page, 'Add after').hover();
      await expect(appenders(page)).toHaveCount(1);
      await page.waitForTimeout(150);
      await page.screenshot({path: `${screenshotDir}collection-rows-${scheme}-${width}.png`});
      await page.unrouteAll({behavior: 'wait'});
    }
  }
});

test('nested collections: a nested entry\'s toolbar acts on its own collection through the payload chain', async ({page}) => {
  const nested = (uid, label) => `<li data-ve-item="items:${uid}" data-ve-item-live="${uid}" data-ve-collection="features">
    <ve-editable-text table="items" uid="${uid}" field="title"><span contenteditable="plaintext-only">${label}</span></ve-editable-text></li>`;
  const requests = [];
  const {posts} = await actionBarHarness(page, {collectionRows: 'rows', css: CSS,
    body: () => element(1, 'pricing', 'Pricing', `<div class="cards"><div class="card" data-ve-item="items:2" data-ve-item-live="2" data-ve-collection="plans">
      <ve-editable-text table="items" uid="2" field="title"><span contenteditable="plaintext-only">Pro</span></ve-editable-text>
      <ul>${nested(31, 'Unlimited pages')}${nested(32, 'Priority support')}</ul></div></div>`),
    payload: (url) => {
      requests.push(`${url.searchParams.get('table')}:${url.searchParams.get('uid')}:${url.searchParams.get('context') ?? ''}`);
      if (url.searchParams.get('table') === 'tt_content') {
        return [collectionField({name: 'plans', label: 'Plans', childTitle: 'plan', uids: [2], children: [entry(2, 'Pro', {canMoveUp: false, canMoveDown: false})]})];
      }
      return [collectionField({name: 'features', label: 'Features', parentTable: 'items', parentUid: 2, revision: 'n1', childTitle: 'feature', uids: [31, 32],
        children: [entry(31, 'Unlimited pages', {canMoveUp: false}), entry(32, 'Priority support', {canMoveDown: false})]})];
    },
  });
  await page.locator('[data-ve-item="items:32"]').hover();
  await railShown(page);
  await expect(page.getByRole('toolbar', {name: 'Entry 2: Priority support'})).toBeVisible();
  expect(requests).toContain(`items:2:${JSON.stringify([{table: 'tt_content', uid: 1, field: 'plans'}])}`);
  await railButton(page, 'Move up').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].inlineRecord).toEqual({action: 'move', parentTable: 'items', parentUid: 2, field: 'features', revision: 'n1', childUid: 32, afterUid: null});
  // Hovering the parent entry outside the nested list shows the parent's toolbar.
  await page.locator('[data-ve-item="items:2"] > ve-editable-text').hover();
  await expect(page.getByRole('toolbar', {name: 'Entry 1: Pro'})).toBeVisible();
});
