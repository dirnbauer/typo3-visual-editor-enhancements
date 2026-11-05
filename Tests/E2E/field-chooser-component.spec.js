import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const resources = new URL('../../Resources/Public/JavaScript/', import.meta.url);
const core = new URL('../../vendor/typo3/cms-core/Resources/Public/JavaScript/Contrib/', import.meta.url);
const vendor = new URL('../../vendor/friendsoftypo3/visual-editor/Resources/Public/JavaScript/', import.meta.url);
const choice = (name, tabId) => ({name, label: name, type: 'select', value: 'unknown', tab: 'Duplicate', tabId, items: [{value: 'a', label: 'A'}]});
const collection = {name: 'cards', label: 'Cards', type: 'inline', parentTable: 'tt_content', parentUid: 1, revision: 'r1',
  tab: 'Duplicate', tabId: 2, canCreate: true, canDelete: true, createHidden: true, backendUrl: '/backend', uids: [2, 3], minItems: 1, maxItems: 5,
  children: [{uid: 2, table: 'items', label: '<script>Entry</script>', backendUrl: '/backend', canDelete: true, verb: 'delete'}]};

async function fixture(page, {mode = 'tabs', slow = false, fail = false} = {}) {
  const imports = {'lit': '/core/lit/index.js', 'lit/': '/core/lit/', 'lit-element/': '/core/lit-element/', 'lit-html': '/core/lit-html/lit-html.js',
    'lit-html/': '/core/lit-html/', '@lit/reactive-element': '/core/@lit/reactive-element/reactive-element.js', '@lit/reactive-element/': '/core/@lit/reactive-element/',
    '@webconsulting/visual-editor-enhancements/': '/extension/', '@typo3/visual-editor/Frontend/stores/data-handler-store': '/vendor/Frontend/stores/data-handler-store.js',
    '@typo3/visual-editor/Shared/iframe-messaging': '/messaging.js'};
  const posts = [];
  await page.route('https://component.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/save') {
      posts.push(route.request().postDataJSON());
      await route.fulfill({status: fail ? 409 : 200, json: fail ? {success: false, reason: 'stale'} : {success: true, uid: 8}});
      return;
    }
    if (url.searchParams.has('veFieldOptions')) {
      if (slow && url.searchParams.get('uid') === '1') { await new Promise(resolve => setTimeout(resolve, 150)); }
      const fields = url.searchParams.get('table') === 'items' ? [choice('Child choice', 0)] : [choice('First', 1), collection];
      await route.fulfill({json: {fields}}); return;
    }
    if (url.pathname === '/messaging.js') {
      await route.fulfill({contentType: 'text/javascript', body: 'export const onMessage = () => () => {}; export const sendMessage = () => {};' }); return;
    }
    for (const [prefix, root] of [['/extension/', resources], ['/core/', core], ['/vendor/', vendor]]) {
      if (url.pathname.startsWith(prefix)) {
        await route.fulfill({contentType: 'text/javascript', body: await readFile(fileURLToPath(new URL(url.pathname.slice(prefix.length), root)), 'utf8')}); return;
      }
    }
    await route.fulfill({contentType: 'text/html', body: `<!doctype html><script type="importmap">${JSON.stringify({imports})}</script>
      <script>window.visualEditorEnhancements = {fieldChooserMode: ${JSON.stringify(mode)}, inlineRecordsEnabled: true}; window.veInfo = {token:'token'}; window.TYPO3={settings:{ajaxUrls:{visual_editor_save:'/save'}}};</script>
      <ve-backend-save-button aria-busy="false"></ve-backend-save-button><button id="anchor">Settings</button>`});
  });
  await page.goto('https://component.test/');
  await page.evaluate(async () => {
    const backend = document.querySelector('ve-backend-save-button'); Object.assign(backend, {count: 0, invalidCount: 0, saving: false});
    const {openFieldChooser} = await import('/extension/Frontend/components/ve-field-chooser.js');
    const {dataHandlerStore} = await import('/vendor/Frontend/stores/data-handler-store.js');
    window.store = dataHandlerStore;
    window.show = (options = {}) => openFieldChooser({table: 'tt_content', uid: 1, anchorRect: document.querySelector('#anchor').getBoundingClientRect(), ...options});
    window.show();
  });
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
  await page.getByRole('button', {name: 'Item settings'}).click();
  await expect(page.getByRole('combobox', {name: 'Child choice'})).toBeVisible();
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Add entry', exact: true})).toBeVisible();
});

test('collection controls work with ordinary chooser disabled and cancel/Escape never write', async ({page}) => {
  const posts = await fixture(page, {mode: 'disabled'});
  page.on('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', {name: 'Remove', exact: true}).click();
  expect(posts).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('pending, invalid and active multi-frame saves block structure without staging hidden=0', async ({page}) => {
  const posts = await fixture(page, {mode: 'sections'});
  await page.evaluate(() => { window.store.setInitialData('items', 2, 'hidden', 1); window.store.setData('items', 2, 'title', 'Pending'); });
  await expect(page.getByRole('button', {name: 'Add entry', exact: true})).toBeDisabled();
  await page.evaluate(() => { window.store.reset(); window.store.setInvalid('items', 2, 'title', true); });
  await expect(page.getByRole('button', {name: 'Add entry', exact: true})).toBeDisabled();
  await page.evaluate(() => { window.store.setInvalid('items', 2, 'title', false); const save = document.querySelector('ve-backend-save-button'); save.saving = true; save.setAttribute('aria-busy', 'true'); });
  await expect(page.getByRole('button', {name: 'Add entry', exact: true})).toBeDisabled();
  expect(posts).toHaveLength(0);
  expect(await page.evaluate(() => window.store.data.items?.[2]?.hidden)).toBeUndefined();
});

test('HTTP failure blocks further attempts and preserves pending store baselines', async ({page}) => {
  const posts = await fixture(page, {mode: 'sections', fail: true});
  await page.getByRole('button', {name: 'Add entry', exact: true}).click();
  await expect(page.getByText(/Collection action refused: stale/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Add entry', exact: true})).toBeDisabled();
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
