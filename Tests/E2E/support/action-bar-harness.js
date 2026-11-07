import {mkdir, readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

/**
 * Login-free harness for the action bar: the REAL vendor ve-content-element
 * (Lit, its light-DOM ve-drag-handle bar, ve-icon), the REAL Core
 * contextual-record-edit trigger (a PseudoButton shadow host with <slot>) and
 * the REAL Frontend/index.js injection pass of this extension. Only the
 * transport (iframe messaging, ?veFieldOptions, /save) and three Core backend
 * services the trigger imports but never calls here (Modal, Notification,
 * persistent storage) are stubbed.
 */

const root = new URL('../../../', import.meta.url);
const resources = new URL('Resources/Public/JavaScript/', root);
const contrib = new URL('vendor/typo3/cms-core/Resources/Public/JavaScript/Contrib/', root);
const coreJs = new URL('vendor/typo3/cms-core/Resources/Public/JavaScript/', root);
const backendJs = new URL('vendor/typo3/cms-backend/Resources/Public/JavaScript/', root);
const vendor = new URL('vendor/friendsoftypo3/visual-editor/Resources/Public/JavaScript/', root);
const vendorLanguage = new URL('vendor/friendsoftypo3/visual-editor/Resources/Private/Language/', root);
const language = new URL('Resources/Private/Language/', root);

export const screenshotDir = fileURLToPath(new URL('var/screenshots/', root));

const STUBS = {
  '/messaging.js': `window.__sent = []; export const onMessage = () => () => {}; export const onMessageDebounced = () => () => {};
    export const stopListeningMessages = () => {}; export const sendMessage = (command, detail) => { window.__sent.push({command, detail}); };`,
  '/stub/modal.js': 'export const Positions = {sheet: "sheet"}; export const Sizes = {expand: "expand"}; export const Types = {iframe: "iframe"}; export default {advanced() { throw new Error("modal not available in the harness"); }};',
  '/stub/notification.js': 'export default {success() {}};',
  '/stub/persistent.js': 'export default {isset: () => false, get: () => null};',
  '/stub/labels.js': 'export default {get: (key) => key};',
  '/stub/ckeditor-ui.js': 'export class BalloonPanelView {} export class ToolbarView {} export const normalizeToolbarConfig = (config) => ({items: [], ...(config || {})});',
};

/**
 * XLIFF 1.2 (vendor) and 2.0 (ours) to a TYPO3.lang object.
 * @param {string} xml
 * @param {boolean} target use <target> (translated file) instead of <source>
 */
function parseXliff(xml, target) {
  const labels = {};
  const unit = /<(?:trans-)?unit id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:trans-)?unit>/g;
  for (const [, id, body] of xml.matchAll(unit)) {
    const match = (target ? /<target>([\s\S]*?)<\/target>/ : /<source>([\s\S]*?)<\/source>/).exec(body);
    if (match) {
      labels[id] = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    }
  }
  return labels;
}

/** @param {'en'|'de'} lang */
export async function labels(lang = 'en') {
  const prefix = lang === 'en' ? '' : `${lang}.`;
  return {
    ...parseXliff(await readFile(new URL(`${prefix}locallang.xlf`, vendorLanguage), 'utf8'), lang !== 'en'),
    ...parseXliff(await readFile(new URL(`${prefix}locallang_library.xlf`, language), 'utf8'), lang !== 'en'),
  };
}

async function importMap() {
  const imports = {'lit': '/contrib/lit/index.js', 'lit/': '/contrib/lit/', 'lit-element/': '/contrib/lit-element/', 'lit-html': '/contrib/lit-html/lit-html.js',
    'lit-html/': '/contrib/lit-html/', '@lit/reactive-element': '/contrib/@lit/reactive-element/reactive-element.js', '@lit/reactive-element/': '/contrib/@lit/reactive-element/',
    '@typo3/core/': '/corejs/', '@typo3/backend/element/': '/backendjs/element/', '@typo3/backend/enum/': '/backendjs/enum/',
    '@typo3/backend/modal.js': '/stub/modal.js', '@typo3/backend/notification.js': '/stub/notification.js',
    '@typo3/backend/storage/persistent.js': '/stub/persistent.js', '~labels/backend.alt_doc': '/stub/labels.js',
    '@ckeditor/ckeditor5-ui': '/stub/ckeditor-ui.js',
    '@webconsulting/visual-editor-enhancements/': '/extension/'};
  for (const path of await readdir(vendor, {recursive: true})) {
    if (path.endsWith('.js')) { imports['@typo3/visual-editor/' + path.slice(0, -3)] = '/vendor/' + path; }
  }
  imports['@typo3/visual-editor/Shared/iframe-messaging'] = '/messaging.js';
  // Mirror Core's explicit, versioned imports as well as its prefix fallback.
  for (const path of await readdir(resources, {recursive: true})) {
    if (path.endsWith('.js')) { imports['@webconsulting/visual-editor-enhancements/' + path] = '/extension/' + path + '?v=harness'; }
  }
  return imports;
}

const collectionField = (overrides = {}) => ({name: 'cards', label: 'Feature cards', type: 'inline', parentTable: 'tt_content', parentUid: 1,
  revision: 'r1', tab: 'General', tabId: 1, canCreate: true, canDelete: true, createHidden: true, backendUrl: '/backend', uids: [2, 3],
  minItems: 0, maxItems: 6, children: [{uid: 2, table: 'items', label: 'Add a card', backendUrl: '/backend', canDelete: true, verb: 'delete'},
    {uid: 3, table: 'items', label: 'Export anywhere', backendUrl: '/backend', canDelete: true, verb: 'delete'}], ...overrides});

function element(uid, cType, name, inner) {
  return `<ve-content-element id="tt_content:${uid}" table="tt_content" uid="${uid}" pid="1" colPos="0" CType="${cType}" elementName="${name}"
    canModifyRecord hiddenFieldName="hidden"><div class="ce"><h2>${name}</h2>${inner}</div></ve-content-element>`;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{mode?: string, collectionTypes?: object|null, lang?: 'en'|'de', scheme?: 'light'|'dark', field?: object, inlineRecords?: boolean, markers?: boolean}} options
 * @return {Promise<{posts: object[], state: {created: boolean}}>}
 */
export async function actionBarHarness(page, {mode = 'caption', collectionTypes = {tt_content: {feature_cards: ['cards']}}, lang = 'en',
  scheme = 'light', field = {}, inlineRecords = true, markers = false} = {}) {
  const imports = await importMap();
  const lang_ = await labels(lang);
  const posts = [];
  const state = {created: false};
  const config = {actionLabelMode: mode, inlineRecordsEnabled: inlineRecords, fieldChooserMode: 'tabs', fieldChooserTables: ['tt_content'],
    elementLibraryEnabled: false, contextButtonsEnabled: false, editableLinksEnabled: false, elementRefreshEnabled: true, workspaceId: 0, colorScheme: scheme};
  if (collectionTypes !== null) { config.collectionTypes = collectionTypes; }
  const html = () => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Action bar harness</title>
    <script type="importmap">${JSON.stringify({imports})}</script>
    <script>window.visualEditorEnhancements = ${JSON.stringify(config)};
      window.veInfo = {token: 'token', allowNewContent: true, languageId: 0, editContentUrl: '/edit/__TABLE__/__UID__', editContentContextualUrl: '/contextual/__TABLE__/__UID__'};
      window.TYPO3 = {lang: ${JSON.stringify(lang_)}, settings: {ajaxUrls: {visual_editor_save: '/save'}}};</script>
    <link rel="stylesheet" href="/css/editable-overrides.css">
    <style>
      html { color-scheme: ${scheme}; }
      body { margin: 0; padding: 96px 48px; font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: ${scheme === 'dark' ? '#0f1115' : '#f6f7f9'}; color: ${scheme === 'dark' ? '#e6e6e6' : '#1b1d21'}; }
      .ce { padding: 24px; border-radius: 8px; background: ${scheme === 'dark' ? '#1b1e24' : '#fff'}; }
      .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .cards > div { padding: 16px; border: 1px solid ${scheme === 'dark' ? '#2e333b' : '#e3e5e8'}; border-radius: 6px; }
      ve-content-element { margin-bottom: 96px; }
    </style></head><body>
    <ve-backend-save-button aria-busy="false"></ve-backend-save-button>
    <main>
      ${element(1, 'feature_cards', 'Feature Cards Grid', `<div class="cards">
        <div${markers ? ' data-ve-item="items:2" data-ve-item-live="2" data-ve-collection="cards"' : ''}><ve-editable-text table="items" uid="2" field="title"><span contenteditable="plaintext-only">Add a card</span></ve-editable-text></div>
        <div${markers ? ' data-ve-item="items:3" data-ve-item-live="3" data-ve-collection="cards" data-ve-item-hidden=""' : ''}><ve-editable-text table="items" uid="3" field="title"><span contenteditable="plaintext-only">Export anywhere</span></ve-editable-text></div>
        ${state.created ? '<div><ve-editable-text table="items" uid="8" field="title"><span contenteditable="plaintext-only">New entry</span></ve-editable-text></div>' : ''}
      </div>`)}
      ${element(5, 'text', 'Text', '<p>A plain text element without collections.</p>')}
    </main>
    <script type="module">
      const backend = document.querySelector('ve-backend-save-button'); Object.assign(backend, {count: 0, invalidCount: 0, saving: false});
      await import('@typo3/visual-editor/Frontend/components/ve-icon');
      await import('@typo3/visual-editor/Frontend/components/ve-drag-handle');
      await import('@typo3/backend/element/contextual-record-edit-trigger.js');
      await import('@typo3/visual-editor/Frontend/components/ve-content-element');
      await import('@webconsulting/visual-editor-enhancements/Frontend/index.js');
      window.store = (await import('@typo3/visual-editor/Frontend/stores/data-handler-store')).dataHandlerStore;
      window.harnessReady = true;
    </script></body></html>`;

  await page.route('https://component.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/save') {
      posts.push(route.request().postDataJSON());
      state.created = true;
      await route.fulfill({json: {success: true, uid: 8, created: {uid: 8, table: 'items', hidden: true, hiddenField: 'hidden'}}});
      return;
    }
    if (url.searchParams.has('veFieldOptions')) {
      const fields = url.searchParams.get('uid') === '1'
        ? [collectionField({...field, ...(state.created ? {uids: [2, 3, 8], children: [...collectionField().children,
          {uid: 8, table: 'items', label: 'New entry', backendUrl: '/backend', canDelete: true, verb: 'delete', hidden: true}]} : {})})]
        : [];
      await route.fulfill({json: {fields}});
      return;
    }
    if (url.pathname === '/css/editable-overrides.css') {
      await route.fulfill({contentType: 'text/css', body: await readFile(fileURLToPath(new URL('Resources/Public/Css/editable-overrides.css', root)), 'utf8')});
      return;
    }
    if (STUBS[url.pathname]) {
      await route.fulfill({contentType: 'text/javascript', body: STUBS[url.pathname]});
      return;
    }
    for (const [prefix, base] of [['/extension/', resources], ['/contrib/', contrib], ['/corejs/', coreJs], ['/backendjs/', backendJs], ['/vendor/', vendor]]) {
      if (url.pathname.startsWith(prefix)) {
        await route.fulfill({contentType: 'text/javascript', body: await readFile(fileURLToPath(new URL(url.pathname.slice(prefix.length), base)), 'utf8')});
        return;
      }
    }
    await route.fulfill({contentType: 'text/html', body: html()});
  });
  await page.goto('https://component.test/');
  await page.waitForFunction(() => window.harnessReady === true);
  // The injection pass runs after the vendor's first render.
  await page.waitForFunction(() => document.querySelector('ve-content-element')?.shadowRoot?.querySelector('.action-bar[data-ve-labels]'));
  await mkdir(screenshotDir, {recursive: true});
  return {posts, state};
}

/**
 * Runs fn in the page against the bar of the content element with that uid.
 * @param {import('@playwright/test').Page} page
 * @param {number} uid
 */
export function barHandle(page, uid = 1) {
  return page.evaluateHandle((uid) => document.querySelector(`ve-content-element[uid="${uid}"]`).shadowRoot.querySelector('.action-bar'), uid);
}
