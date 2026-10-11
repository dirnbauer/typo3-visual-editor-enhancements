import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const resources = new URL('../../Resources/Public/JavaScript/', import.meta.url);
const core = new URL('../../vendor/typo3/cms-core/Resources/Public/JavaScript/Contrib/', import.meta.url);

/** Real Lit component and browser default actions; only backend bridges are stubbed. */
async function openFixture(page, enabled = true) {
  const imports = {
    'lit': '/core/lit/index.js',
    'lit/': '/core/lit/',
    'lit-element/': '/core/lit-element/',
    'lit-html': '/core/lit-html/lit-html.js',
    'lit-html/': '/core/lit-html/',
    '@lit/reactive-element': '/core/@lit/reactive-element/reactive-element.js',
    '@lit/reactive-element/': '/core/@lit/reactive-element/',
    '@webconsulting/visual-editor-enhancements/': '/extension/',
    '@typo3/core/lit-helper.js': '/labels.js',
    '@typo3/visual-editor/Frontend/stores/data-handler-store': '/store.js',
    '@webconsulting/visual-editor-enhancements/Shared/link-edit-request.js': '/link-browser.js',
  };
  await page.route('https://component.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/extension/') || path.startsWith('/core/')) {
      const root = path.startsWith('/extension/') ? resources : core;
      const relative = path.replace(/^\/(extension|core)\//, '');
      await route.fulfill({contentType: 'text/javascript', body: await readFile(fileURLToPath(new URL(relative, root)), 'utf8')});
      return;
    }
    const bridges = {
      '/labels.js': 'export const lll = () => "Edit link";',
      '/store.js': 'export const dataHandlerStore = {setInitialData() {}, setData() {}};',
      '/link-browser.js': 'export const requestLinkEdit = (request) => window.linkRequests.push(request);',
    };
    if (bridges[path]) {
      await route.fulfill({contentType: 'text/javascript', body: bridges[path]});
      return;
    }
    await route.fulfill({contentType: 'text/html', body: `<!doctype html>
      <script type="importmap">${JSON.stringify({imports})}</script>
      <script>
        window.visualEditorEnhancements = {editableLinksEnabled: ${enabled}};
        window.linkRequests = [];
        window.events = [];
        for (const type of ['pointerdown', 'focusin', 'click']) {
          document.addEventListener(type, event => window.events.push({type, prevented: event.defaultPrevented}));
        }
      </script>
      <script type="module" src="/extension/Frontend/components/ve-editable-link.js"></script>
      <style>a { display: inline-block; padding: 20px; margin: 20px; }</style>
      <a id="cta" href="#destination" data-slot="button"><span>View details</span></a><ve-editable-link table="products" uid="23" field="link" value="#destination" linkbrowserurl="/browser?field=link"></ve-editable-link>
      <a id="other" href="#other">Other navigation</a>`});
  });
  await page.goto('https://component.test/');
  await page.evaluate(() => customElements.whenDefined('ve-editable-link'));
}

test('clicking a translated-label CTA activates its link editor without navigation', async ({page}) => {
  await openFixture(page);
  await page.locator('#cta span').click();

  expect(await page.evaluate(() => window.events.map(event => event.type))).toEqual(['pointerdown', 'focusin', 'click']);
  expect(await page.evaluate(() => window.events.at(-1).prevented)).toBe(true);
  await expect(page).toHaveURL('https://component.test/');
  await page.locator('ve-editable-link').getByRole('button', {name: 'Edit link'}).click();
  expect(await page.evaluate(() => window.linkRequests)).toEqual([{src: '/browser?field=link&P%5BcurrentValue%5D=%23destination', title: 'Edit link'}]);
});

test('keyboard activation edits the associated CTA and unrelated links still navigate', async ({page}) => {
  await openFixture(page);
  await page.locator('#cta').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('https://component.test/');
  await expect(page.locator('ve-editable-link').getByRole('button', {name: 'Edit link'})).toBeVisible();
  await page.locator('#other').click();
  await expect(page).toHaveURL('https://component.test/#other');
});

test('disabled link editing leaves the CTA navigation available', async ({page}) => {
  await openFixture(page, false);
  await page.locator('#cta span').click();
  await expect(page).toHaveURL('https://component.test/#destination');
});
