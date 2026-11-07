import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';
import {actionBarHarness} from './support/action-bar-harness.js';

const resources = new URL('../../Resources/Public/JavaScript/', import.meta.url);
const core = new URL('../../vendor/typo3/cms-core/Resources/Public/JavaScript/Contrib/', import.meta.url);
const vendor = new URL('../../vendor/friendsoftypo3/visual-editor/Resources/Public/JavaScript/', import.meta.url);
const choice = (name, tabId) => ({name, label: name, type: 'select', value: 'unknown', tab: 'Duplicate', tabId, items: [{value: 'a', label: 'A'}]});
const entry = (uid, label, overrides = {}) => ({uid, table: 'items', label, labelValue: label, liveUid: uid, state: 'live', hidden: false,
  hiddenField: 'hidden', canHide: true, hideReason: '', canEditLabel: true, labelReason: '', canMoveUp: true, canMoveDown: true,
  canDelete: true, deleteReason: '', verb: 'delete', backendUrl: '/backend', translationOnly: false, untranslated: [],
  cascade: {translations: 0, languages: []}, ...overrides});
const collection = {name: 'cards', label: 'Cards', type: 'inline', parentTable: 'tt_content', parentUid: 1, revision: 'r1',
  tab: 'Duplicate', tabId: 2, canCreate: true, createReason: '', canDelete: true, createHidden: true, backendUrl: '/backend', uids: [2, 3, 4],
  minItems: 1, maxItems: 5, childTitle: 'card', labelField: 'title', hiddenField: 'hidden', typeField: '', requiredBackend: [],
  controls: {new: true, delete: true, hide: true, sort: true, dragdrop: true, localize: true, info: true}, canSort: true, sortReason: '',
  workspaceId: 0, workspace: {id: 0, title: '', firstVersion: false}, languageId: 0, translationMode: 'default',
  translationLanguages: [], canSync: false, syncReason: 'syncNone',
  children: [entry(2, '<script>Entry</script>', {canMoveUp: false}), entry(3, 'Second', {hidden: true}), entry(4, 'Third', {canMoveDown: false})]};

async function fixture(page, {mode = 'tabs', slow = false, fail = false, view = 'settings', field = {}, response = {}} = {}) {
  const imports = {'lit': '/core/lit/index.js', 'lit/': '/core/lit/', 'lit-element/': '/core/lit-element/', 'lit-html': '/core/lit-html/lit-html.js',
    'lit-html/': '/core/lit-html/', '@lit/reactive-element': '/core/@lit/reactive-element/reactive-element.js', '@lit/reactive-element/': '/core/@lit/reactive-element/',
    '@webconsulting/visual-editor-enhancements/': '/extension/', '@typo3/visual-editor/Frontend/stores/data-handler-store': '/vendor/Frontend/stores/data-handler-store.js',
    '@typo3/visual-editor/Shared/iframe-messaging': '/messaging.js', '@typo3/visual-editor/Frontend/components/ve-icon': '/vendor/Frontend/components/ve-icon.js'};
  // Mirror Core's explicit, versioned imports as well as its prefix fallback.
  for (const path of await readdir(resources, {recursive: true})) {
    if (path.endsWith('.js')) imports['@webconsulting/visual-editor-enhancements/' + path] = '/extension/' + path + '?bust=regression';
  }
  const posts = [];
  await page.route('https://component.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/save') {
      const body = route.request().postDataJSON();
      posts.push(body);
      const action = body?.inlineRecord?.action;
      await route.fulfill({status: fail ? (typeof fail === 'number' ? fail : 409) : 200, json: fail ? {success: false, reason: 'stale'}
        : {success: true, uid: 8, ...(action === 'create' ? {created: {uid: 8, table: 'items', hidden: true, hiddenField: 'hidden'}} : {}), ...response}});
      return;
    }
    if (url.searchParams.has('veFieldOptions')) {
      if (slow && url.searchParams.get('uid') === '1') { await new Promise(resolve => setTimeout(resolve, 150)); }
      const fields = url.searchParams.get('table') === 'items' ? [choice('Child choice', 0)] : [choice('First', 1), {...collection, ...field}];
      await route.fulfill({json: {fields}}); return;
    }
    if (url.pathname === '/messaging.js') {
      await route.fulfill({contentType: 'text/javascript', body: 'window.__sent = []; export const onMessage = () => () => {}; export const sendMessage = (command) => { window.__sent.push(command); };' }); return;
    }
    for (const [prefix, root] of [['/extension/', resources], ['/core/', core], ['/vendor/', vendor]]) {
      if (url.pathname.startsWith(prefix)) {
        await route.fulfill({contentType: 'text/javascript', body: await readFile(fileURLToPath(new URL(url.pathname.slice(prefix.length), root)), 'utf8')}); return;
      }
    }
    await route.fulfill({contentType: 'text/html', body: `<!doctype html><script type="importmap">${JSON.stringify({imports})}</script>
      <script>window.visualEditorEnhancements = {fieldChooserMode: ${JSON.stringify(mode)}, inlineRecordsEnabled: true, fieldChooserTables: ['tt_content']}; window.veInfo = {token:'token'}; window.TYPO3={settings:{ajaxUrls:{visual_editor_save:'/save'}}};</script>
      <ve-backend-save-button aria-busy="false"></ve-backend-save-button><button id="anchor">Settings</button>`});
  });
  await page.goto('https://component.test/');
  await page.evaluate(async (view) => {
    await import('/vendor/Frontend/components/ve-icon.js');
    const backend = document.querySelector('ve-backend-save-button'); Object.assign(backend, {count: 0, invalidCount: 0, saving: false});
    const {openFieldChooser} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-field-chooser.js');
    const {dataHandlerStore} = await import('/vendor/Frontend/stores/data-handler-store.js');
    window.store = dataHandlerStore;
    window.show = (options = {}) => openFieldChooser({table: 'tt_content', uid: 1, anchorRect: document.querySelector('#anchor').getBoundingClientRect(), ...options});
    window.show({view});
  }, view);
  if (view === 'entries') { await page.locator('ve-field-chooser .entryItem').first().waitFor(); }
  return posts;
}

test('duplicate tab labels remain separate, keyboard works and same-record refresh keeps selection', async ({page}) => {
  await fixture(page);
  const tabs = page.getByRole('tab', {name: 'Duplicate'});
  await expect(tabs).toHaveCount(2);
  await tabs.first().focus(); await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await page.evaluate(() => document.querySelector('ve-field-chooser').refresh());
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('sections render unknown stored values explicitly and nested settings can go Back', async ({page}) => {
  await fixture(page, {mode: 'sections'});
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveValue('unknown');
  await page.locator('.collectionShortcut').click();
  await page.getByRole('button', {name: 'More actions: <script>Entry</script>'}).click();
  await page.getByRole('menuitem', {name: 'Item settings'}).click();
  await expect(page.getByRole('combobox', {name: 'Child choice'})).toBeVisible();
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Add card', exact: true})).toBeVisible();
});

test('collection controls work with ordinary chooser disabled and cancel/Escape never write', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'disabled'});
  page.on('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', {name: 'Remove', exact: true}).first().click();
  expect(posts).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('pending, invalid and active multi-frame saves block structure without staging hidden=0', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections'});
  const add = page.getByRole('button', {name: 'Add card', exact: true});
  const removeSecond = page.locator('[data-ve-row="2"] [data-control="remove"]');
  // Staged text on an entry holds only that entry's Remove (plan 2.5).
  await page.evaluate(() => { window.store.setData('items', 2, 'title', 'Pending'); });
  await expect(add).toBeEnabled();
  await expect(removeSecond).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => { window.store.reset(); window.store.setInvalid('items', 2, 'title', true); });
  await expect(add).toBeDisabled();
  await page.evaluate(() => { window.store.setInvalid('items', 2, 'title', false); const save = document.querySelector('ve-backend-save-button'); save.saving = true; save.setAttribute('aria-busy', 'true'); });
  await expect(add).toBeDisabled();
  expect(posts).toHaveLength(0);
  expect(await page.evaluate(() => window.store.data.items?.[2]?.hidden)).toBeUndefined();
});

test('a definitive stale rejection refreshes choices and permits a manual retry', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections', fail: true});
  await page.getByRole('button', {name: 'Add card', exact: true}).click();
  await expect(page.getByText(/The collection changed/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Add card', exact: true})).toBeEnabled();
  expect(posts).toEqual([{inlineRecord: {action: 'create', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1'}}]);
});

test('late responses for an earlier record never replace the active child settings', async ({page}) => {
  await fixture(page, {mode: 'sections', slow: true});
  await page.evaluate(() => window.show({table: 'items', uid: 2}));
  await expect(page.getByRole('combobox', {name: 'Child choice'})).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.getByRole('button', {name: 'Item settings'})).toHaveCount(0);
});


test('Core modal adapter focuses Cancel by default and dismiss/cancel do not authorize a write', async ({page}) => {
  await fixture(page);
  const results = await page.evaluate(async () => {
    const {confirmWithCoreModal} = await import('/extension/Shared/confirm-delete.js');
    const results = [];
    for (const action of ['cancel', 'dismiss', 'confirm']) {
      let buttons;
      const modal = new EventTarget();
      modal.hideModal = () => modal.dispatchEvent(new Event('typo3-modal-hidden'));
      const Modal = {confirm: (_title, _content, _severity, options) => { buttons = options; return modal; }};
      const pending = confirmWithCoreModal(Modal, 1, 'Escaped text');
      if (action === 'dismiss') { modal.hideModal(); }
      else { buttons[action === 'cancel' ? 0 : 1].trigger(null, modal); }
      results.push({allowed: await pending, cancelFocused: buttons[0].active, confirmFocused: !!buttons[1].active});
    }
    return results;
  });
  expect(results).toEqual([{allowed: false, cancelFocused: true, confirmFocused: false},
    {allowed: false, cancelFocused: true, confirmFocused: false}, {allowed: true, cancelFocused: true, confirmFocused: false}]);
});

test('an uncertain server failure blocks another write without an automatic retry', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections', fail: 500});
  await page.getByRole('button', {name: 'Add card', exact: true}).click();
  await expect(page.getByText(/Refresh the page before another/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Add card', exact: true})).toBeDisabled();
  expect(posts).toHaveLength(1);
});


test('settings remain focused on fields instead of expanding every collection action', async ({page}) => {
  await fixture(page, {mode: 'sections'});
  await expect(page.getByRole('combobox', {name: 'First'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Add card', exact: true})).toHaveCount(0);
  await expect(page.getByText('Minimum:', {exact: false})).toHaveCount(0);
});

test('entry settings and Back keep the panel at its original position', async ({page}) => {
  await fixture(page, {mode: 'sections'});
  await page.evaluate(() => {
    document.querySelector('ve-field-chooser').close();
    window.show({scopeFields: ['cards'], scopeLabel: 'Entries', anchorRect: {left: 200, top: 180, bottom: 210}});
  });
  const panel = page.getByRole('dialog');
  const before = await panel.boundingBox();
  await page.getByRole('button', {name: 'More actions: <script>Entry</script>'}).click();
  await page.getByRole('menuitem', {name: 'Item settings'}).click();
  await expect(page.getByRole('combobox', {name: 'Child choice'})).toBeVisible();
  expect((await panel.boundingBox()).x).toBe(before.x);
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  expect((await panel.boundingBox()).x).toBe(before.x);
});

test('entries toggle closes on a second pointer click and has no next-save hint', async ({page}) => {
  await fixture(page, {mode: 'sections'});
  await page.evaluate(() => {
    document.querySelector('ve-field-chooser').close();
    const button = document.querySelector('#anchor');
    button.dataset.veEnhancement = 'inline-records';
    button.onclick = () => window.show({view: 'entries', scopeFields: ['cards'], scopeLabel: 'Entries', trigger: button});
  });
  await page.locator('#anchor').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Applied with the next save.', {exact: true})).toHaveCount(0);
  await page.locator('#anchor').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('toolbar settings and entries share one component with Core versioned import URLs', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  await page.evaluate(async () => {
    document.querySelector('ve-field-chooser').close();
    const element = document.createElement('ve-content-element');
    element.setAttribute('table', 'tt_content'); element.setAttribute('uid', '1'); element.setAttribute('canModifyRecord', 'true');
    element.attachShadow({mode: 'open'}).innerHTML = '<div class="action-bar"><a class="button" href="#">Edit</a></div>';
    document.body.append(element);
    const actions = await import('@webconsulting/visual-editor-enhancements/Frontend/element-field-actions.js');
    actions.injectFieldChooserAction(element); actions.injectInlineRecordsAction(element);
  });
  const settings = page.getByRole('button', {name: 'Settings', exact: true}).and(page.locator('[data-ve-enhancement="field-chooser"]'));
  const entries = page.getByRole('button', {name: 'Entries', exact: true}).and(page.locator('[data-ve-enhancement="inline-records"]'));
  await settings.click();
  await expect(page.getByRole('dialog', {name: 'Field settings', exact: true})).toBeVisible();
  await page.getByRole('combobox', {name: 'First'}).selectOption('a');
  expect(await page.evaluate(() => window.store.data.tt_content[1].First)).toBe('a');
  await entries.click();
  await expect(page.getByRole('dialog', {name: 'Entries', exact: true})).toBeVisible();
  await settings.click();
  await expect(page.getByRole('dialog', {name: 'Field settings', exact: true})).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('ve-field-chooser')).toHaveCount(1);
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(entries).toHaveAttribute('aria-expanded', 'false');
});

/* ------------------------------------------------------------------------
 * Entries inspector (WP-G): rows, staged title and visibility, move, remove,
 * pending rule, panel behaviour. The fixture above for the panel alone, the
 * action-bar harness (real vendor content element, page editables, element
 * refresh) where the page takes part.
 * --------------------------------------------------------------------- */

const row = (page, uid) => page.locator(`ve-field-chooser [data-ve-row="${uid}"]`);

async function openEntries(page) {
  await page.locator('ve-content-element[uid="1"]').hover({position: {x: 40, y: 40}});
  await page.locator('ve-content-element[uid="1"] .action-bar [data-ve-enhancement="inline-records"]').click();
  await expect(page.getByRole('dialog', {name: 'Entries'})).toBeVisible();
  await row(page, 2).waitFor();
}

/** Upgrades the harness editables to the REAL vendor ve-editable-text (store mirror included). */
async function realEditables(page) {
  await page.evaluate(async () => {
    for (const editable of document.querySelectorAll('ve-editable-text')) {
      editable.setAttribute('valueinitial', editable.textContent.trim());
      editable.setAttribute('name', 'Title');
    }
    await import('@typo3/visual-editor/Frontend/components/ve-editable-text');
    await Promise.all([...document.querySelectorAll('ve-editable-text')].map((editable) => editable.updateComplete));
  });
}

test('title input stages the label field and the page editable follows', async ({page}) => {
  await actionBarHarness(page);
  await realEditables(page);
  await openEntries(page);
  const title = row(page, 2).getByRole('textbox', {name: 'Title of entry 1'});
  await expect(title).toHaveValue('Add a card');
  await title.fill('Renamed card');
  expect(await page.evaluate(() => window.store.data.items[2].title)).toBe('Renamed card');
  await expect(page.locator('ve-editable-text[uid="2"] .slot')).toHaveText('Renamed card');
  await expect(row(page, 2).getByText('Unsaved')).toBeVisible();
  // Escape restores the stored value: no staged change remains.
  await title.press('Escape');
  await expect(title).toHaveValue('Add a card');
  expect(await page.evaluate(() => window.store.data.items?.[2]?.title)).toBeUndefined();
  await expect(page.locator('ve-editable-text[uid="2"] .slot')).toHaveText('Add a card');
  await expect(page.getByRole('dialog', {name: 'Entries'})).toBeVisible();
  // Enter commits (leaves the field), the staged value stays for Save.
  await title.fill('Kept');
  await title.press('Enter');
  await expect(title).not.toBeFocused();
  expect(await page.evaluate(() => window.store.data.items[2].title)).toBe('Kept');
});

test('toggling the eye twice leaves the store without changes, and the page marks follow the store', async ({page}) => {
  await actionBarHarness(page);
  await openEntries(page);
  const eye = row(page, 3).getByRole('switch', {name: 'Visible on the live site'});
  await expect(eye).toHaveAttribute('aria-checked', 'true');
  await eye.click();
  await expect(eye).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => window.store.data.items[3].hidden)).toBe(true);
  await expect(page.locator('ve-editable-text[uid="3"]')).toHaveAttribute('data-ve-entry-hidden', '');
  await expect(page.locator('ve-editable-text[uid="3"]')).toHaveAttribute('title', 'Hidden on the live site');
  await expect(row(page, 3).getByText('Hidden', {exact: true})).toBeVisible();
  await eye.click();
  await expect(eye).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => ({count: window.store.changesCount, data: window.store.data}))).toEqual({count: 0, data: {}});
  await expect(page.locator('ve-editable-text[uid="3"]')).not.toHaveAttribute('data-ve-entry-hidden', '');
  await expect(page.locator('ve-editable-text[uid="3"]')).not.toHaveAttribute('title', /.*/);
});

test('a hidden entry is dimmed on the page until a staged show, and Reset re-derives the mark', async ({page}) => {
  await actionBarHarness(page, {field: {children: [{...(await import('./support/action-bar-harness.js')).entry(2, 'Add a card', {canMoveUp: false, hidden: true}),
    hidden: true}, (await import('./support/action-bar-harness.js')).entry(3, 'Export anywhere', {canMoveDown: false})]}});
  await openEntries(page);
  const editable = page.locator('ve-editable-text[uid="2"]');
  await expect(editable).toHaveAttribute('data-ve-entry-hidden', '');
  await expect.poll(() => editable.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.55');
  await row(page, 2).getByRole('switch').click();
  await expect(editable).not.toHaveAttribute('data-ve-entry-hidden', '');
  await page.evaluate(() => window.store.reset());
  await expect(editable).toHaveAttribute('data-ve-entry-hidden', '');
});

test('move up/down are disabled at the ends and post one move intent; Alt+Arrow does the same', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections'});
  const up = (uid) => row(page, uid).getByRole('button', {name: 'Move up'});
  const down = (uid) => row(page, uid).getByRole('button', {name: 'Move down'});
  await expect(up(2)).toHaveAttribute('aria-disabled', 'true');
  await expect(down(4)).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled stays clickable for the pointer: the click must not write.
  await up(2).click({force: true});
  await down(4).click({force: true});
  expect(posts).toHaveLength(0);
  await down(2).click();
  await expect(page.getByRole('status').getByText('Moved to position 2.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('ve-field-chooser').busy)).toBe(false);
  const common = {parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1'};
  expect(posts).toEqual([{inlineRecord: {action: 'move', ...common, childUid: 2, afterUid: 3}}]);
  // Keyboard: Alt+ArrowUp on the third row moves it after the first row.
  await row(page, 4).getByRole('textbox').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => posts.length).toBe(2);
  await expect.poll(() => page.evaluate(() => document.querySelector('ve-field-chooser').busy)).toBe(false);
  expect(posts[1]).toEqual({inlineRecord: {action: 'move', ...common, childUid: 4, afterUid: 2}});
  // To the very top: afterUid null.
  await row(page, 3).getByRole('textbox').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2]).toEqual({inlineRecord: {action: 'move', ...common, childUid: 3, afterUid: null}});
});

test('remove asks the Core modal with cascade counts', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections', field: {
    translationLanguages: [{id: 1, title: 'Deutsch'}, {id: 2, title: '中文'}, {id: 3, title: 'Magyar'}],
    children: [entry(2, 'Add a card', {canMoveUp: false, cascade: {translations: 3, languages: [1, 2, 3]}}), entry(3, 'Second'), entry(4, 'Third', {canMoveDown: false})]}});
  const messages = [];
  page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.accept(); });
  await row(page, 2).getByRole('button', {name: 'Remove'}).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect.poll(() => page.evaluate(() => document.querySelector('ve-field-chooser').busy)).toBe(false);
  expect(messages[0]).toBe('Remove “Add a card”? Also removes 3 translations (Deutsch, 中文, Magyar). It disappears from the live site immediately. Reset does not undo this operation.');
  expect(posts[0].inlineRecord).toEqual({action: 'delete', parentTable: 'tt_content', parentUid: 1, field: 'cards', revision: 'r1', childUid: 2});
  // The Delete key on a focused row opens the same confirmation (dismissed: no write).
  page.removeAllListeners('dialog');
  page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.dismiss(); });
  await row(page, 3).getByRole('button', {name: 'Move up'}).focus();
  await page.keyboard.press('Delete');
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1]).toContain('Remove “Second”?');
  expect(posts).toHaveLength(1);
});

test('a row with staged text disables Remove only and offers Save now which sends doSave', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections'});
  await row(page, 3).getByRole('textbox').fill('Typed, not saved');
  const remove = row(page, 3).getByRole('button', {name: 'Remove'});
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await remove.focus();
  await expect(row(page, 3).locator('.actionReason')).toHaveText("Save this entry's text first.");
  await expect(remove).toHaveAccessibleDescription("Save this entry's text first.");
  // Everything else proceeds.
  await expect(row(page, 2).getByRole('button', {name: 'Remove'})).not.toHaveAttribute('aria-disabled', 'true');
  await expect(row(page, 3).getByRole('button', {name: 'Move up'})).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', {name: 'Add card', exact: true})).toBeEnabled();
  await remove.click({force: true});
  expect(posts).toHaveLength(0);
  await page.getByRole('button', {name: 'Save now'}).click();
  expect(await page.evaluate(() => window.__sent)).toEqual(['doSave']);
});

test('a second add while text is pending lists the row and says the page updates after Save', async ({page}) => {
  const {posts} = await actionBarHarness(page);
  await openEntries(page);
  await row(page, 2).getByRole('textbox').fill('Unsaved title');
  await page.getByRole('button', {name: 'Add feature card'}).click();
  await expect(row(page, 8)).toBeVisible();
  expect(posts.map((post) => post.inlineRecord.action)).toEqual(['create']);
  await expect(page.getByRole('status')).toHaveText(/The page shows it after you save your text\./);
  await expect(page.getByRole('button', {name: 'Save now'})).toBeVisible();
  // The element was not replaced: its staged text survives, the new entry is not on the page yet.
  await expect(page.locator('ve-editable-text[uid="8"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.store.data.items[2].title)).toBe('Unsaved title');
  await expect(row(page, 8).getByRole('textbox')).toBeFocused();
});

test('panel stays open on page pointerdown and closes on Escape and ×', async ({page}) => {
  await actionBarHarness(page);
  await openEntries(page);
  const dialog = page.getByRole('dialog', {name: 'Entries'});
  await page.locator('ve-editable-text[uid="3"]').click();
  await page.locator('main').click({position: {x: 5, y: 5}});
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await openEntries(page);
  await dialog.getByRole('button', {name: 'Close'}).click();
  await expect(dialog).toHaveCount(0);
});

test('Escape returns focus to the trigger', async ({page}) => {
  await actionBarHarness(page);
  await openEntries(page);
  await row(page, 2).getByRole('textbox').focus();
  // The first Escape in the title input only restores the title.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: 'Entries'})).toBeVisible();
  await row(page, 2).getByRole('button', {name: 'Move down'}).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const element = document.querySelector('ve-content-element[uid="1"]');
    return element.shadowRoot.activeElement?.dataset.veEnhancement ?? null;
  })).toBe('inline-records');
});

test('marked-for-deletion rows are listed read-only', async ({page}) => {
  const posts = await fixture(page, {view: 'entries', mode: 'sections', field: {workspaceId: 4, workspace: {id: 4, title: 'Staging', firstVersion: false},
    uids: [2, 4], children: [entry(2, 'Kept', {canMoveUp: false, state: 'new'}), entry(3, 'Gone', {state: 'deleted', canDelete: false, deleteReason: 'deleted',
      canHide: false, hideReason: 'deleted', canEditLabel: false, labelReason: 'deleted', canMoveUp: false, canMoveDown: false}), entry(4, 'Third', {canMoveDown: false, state: 'modified'})]}});
  const deleted = row(page, 3);
  await expect(deleted.getByText('Marked for deletion', {exact: true})).toBeVisible();
  await expect(deleted.getByRole('textbox')).toHaveCount(0);
  await expect(deleted.getByRole('button')).toHaveCount(0);
  await expect(row(page, 2).getByText('New in draft')).toBeVisible();
  await expect(row(page, 4).getByText('Changed in draft')).toBeVisible();
  await expect(page.locator('.contextStrip')).toContainText('Workspace draft «Staging»');
  // Numbering skips the placeholder; moves only know live members.
  await expect(row(page, 4).locator('.entryNumber')).toHaveText('3');
  await row(page, 4).getByRole('button', {name: 'Move up'}).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].inlineRecord).toMatchObject({action: 'move', childUid: 4, afterUid: null});
});

test('row menu: role=menu with arrow keys, Home/End, Escape back to its trigger, one menu at a time', async ({page}) => {
  await fixture(page, {view: 'entries', mode: 'sections'});
  const trigger = row(page, 2).getByRole('button', {name: /^More actions/});
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const items = menu.getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Opening another row's menu closes the first; a pointerdown outside closes it.
  await trigger.click();
  await expect(page.getByRole('menu')).toHaveCount(1);
  await row(page, 3).getByRole('button', {name: /^More actions/}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(page.getByRole('menu')).toHaveAccessibleName('More actions: Second');
  await page.mouse.click(5, 5);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('row actions are quiet at rest and full on hover; refused controls stay focusable', async ({page}) => {
  await fixture(page, {view: 'entries', mode: 'sections', field: {canSort: false, sortReason: 'unsorted'}});
  const actions = row(page, 3).locator('.entryActions');
  await page.mouse.move(1, 1);
  expect(await actions.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.35');
  await row(page, 3).hover();
  await expect.poll(() => actions.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  const up = row(page, 3).getByRole('button', {name: 'Move up'});
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  expect(await up.evaluate((node) => node.disabled)).toBe(false);
  await expect(up).toHaveAttribute('title', 'This collection has no stored order. Use the backend form.');
  // One tab stop per toolbar: Tab from the title lands on the toolbar, arrows move inside it.
  await row(page, 3).getByRole('textbox').focus();
  await page.keyboard.press('Tab');
  await expect(up).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 3).getByRole('button', {name: 'Move down'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(row(page, 4).getByRole('textbox')).toBeFocused();
});
