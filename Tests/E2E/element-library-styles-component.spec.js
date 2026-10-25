import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const resources = new URL('../../Resources/Public/JavaScript/', import.meta.url);
const core = new URL('../../vendor/typo3/cms-core/Resources/Public/JavaScript/Contrib/', import.meta.url);

/** The panel's real stylesheet in a real browser; nothing else is loaded. */
async function openFixture(page) {
  const imports = {
    'lit': '/core/lit/index.js',
    'lit/': '/core/lit/',
    'lit-element/': '/core/lit-element/',
    'lit-html': '/core/lit-html/lit-html.js',
    'lit-html/': '/core/lit-html/',
    '@lit/reactive-element': '/core/@lit/reactive-element/reactive-element.js',
    '@lit/reactive-element/': '/core/@lit/reactive-element/',
    '@webconsulting/visual-editor-enhancements/': '/extension/',
  };
  await page.route('https://component.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/extension/') || path.startsWith('/core/')) {
      const root = path.startsWith('/extension/') ? resources : core;
      const relative = path.replace(/^\/(extension|core)\//, '');
      await route.fulfill({contentType: 'text/javascript', body: await readFile(fileURLToPath(new URL(relative, root)), 'utf8')});
      return;
    }
    await route.fulfill({contentType: 'text/html', body: `<!doctype html>
      <script type="importmap">${JSON.stringify({imports})}</script>
      <div id="panel"></div>`});
  });
  await page.goto('https://component.test/');
}

test('the category filter shows group names exactly as authored', async ({page}) => {
  await openFixture(page);
  const groups = ['Büro und Notizen', 'Call to action', 'Text und Medien', 'iOS-Apps'];

  const shown = await page.evaluate(async (names) => {
    const {styles} = await import('@webconsulting/visual-editor-enhancements/Frontend/components/ve-element-library/styles.js');
    const root = document.getElementById('panel').attachShadow({mode: 'open'});
    root.adoptedStyleSheets = styles.map((style) => style.styleSheet);
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const name of names) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = name;
      chips.append(chip);
    }
    root.append(chips);

    // innerText is the text as rendered, after any text-transform.
    return [...root.querySelectorAll('.chip')].map((chip) => chip.innerText);
  }, groups);

  expect(shown).toEqual(groups);
});
