/**
 * Unit tests for the theme bridge: the backend frame resolves its design
 * tokens, the edit frame applies them as --ve-t3-* custom properties. What
 * matters: only computed values travel, only known names are applied, and the
 * scheme the backend really renders in is what the edit frame gets.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {applyTheme, renderedScheme, resolveTheme, THEME_TOKENS} from '../../Resources/Public/JavaScript/Shared/theme-bridge.js';

/**
 * A document stand-in whose getComputedStyle() answers the token a probe
 * references with the value from `computed`.
 */
function fakeDocument({computed = {}, colorScheme = 'light dark', prefersDark = false} = {}) {
  const appended = [];
  const documentElement = {};
  return {
    appended,
    documentElement,
    body: {append: (element) => appended.push(element)},
    createElement: () => ({style: {cssText: ''}, removed: false, remove() { this.removed = true; }}),
    defaultView: {
      getComputedStyle(element) {
        if (element === documentElement) {
          return {colorScheme};
        }
        const token = /var\((--[^)]+)\)/.exec(element.style.cssText)?.[1] ?? '';
        return {getPropertyValue: () => computed[token] ?? ''};
      },
      matchMedia: () => ({matches: prefersDark}),
    },
  };
}

function fakeRoot() {
  const properties = new Map();
  return {properties, style: {setProperty: (name, value) => properties.set(name, value)}};
}

describe('resolveTheme', () => {
  it('hands over the computed value of every token the backend defines', () => {
    const doc = fakeDocument({
      computed: {
        '--typo3-state-primary-bg': 'rgb(65, 42, 162)',
        '--typo3-component-border-radius': '9px',
        '--typo3-font-family': 'Verdana, sans-serif',
      },
      colorScheme: 'only dark',
    });

    const theme = resolveTheme(doc);

    assert.equal(theme.scheme, 'dark');
    assert.deepEqual(theme.tokens, {
      primary: 'rgb(65, 42, 162)',
      radius: '9px',
      'font-family': 'Verdana, sans-serif',
    });
  });

  it('leaves tokens out that do not resolve, and cleans up its probe', () => {
    const doc = fakeDocument({computed: {'--typo3-component-box-shadow-flyout': 'none'}});

    const theme = resolveTheme(doc);

    assert.deepEqual(theme.tokens, {});
    assert.equal(doc.appended.length, 1);
    assert.equal(doc.appended[0].removed, true);
  });

  it('covers the whole token list', () => {
    assert.ok(Object.keys(THEME_TOKENS).length >= 15);
    for (const [token, property] of Object.values(THEME_TOKENS)) {
      assert.match(token, /^--typo3-/);
      assert.ok(property.length > 0);
    }
  });
});

describe('renderedScheme', () => {
  it('follows a scheme the backend forces', () => {
    assert.equal(renderedScheme(fakeDocument({colorScheme: 'only light', prefersDark: true})), 'light');
    assert.equal(renderedScheme(fakeDocument({colorScheme: 'only dark'})), 'dark');
  });

  it('follows the operating system for the "auto" scheme', () => {
    assert.equal(renderedScheme(fakeDocument({colorScheme: 'light dark', prefersDark: true})), 'dark');
    assert.equal(renderedScheme(fakeDocument({colorScheme: 'light dark', prefersDark: false})), 'light');
    assert.equal(renderedScheme(fakeDocument({colorScheme: 'normal'})), 'light');
  });
});

describe('applyTheme', () => {
  it('sets known tokens and the scheme as --ve-t3-* properties', () => {
    const root = fakeRoot();

    applyTheme({scheme: 'dark', tokens: {primary: 'rgb(1, 2, 3)', radius: '9px'}}, root);

    assert.equal(root.properties.get('--ve-t3-color-scheme'), 'dark');
    assert.equal(root.properties.get('--ve-t3-primary'), 'rgb(1, 2, 3)');
    assert.equal(root.properties.get('--ve-t3-radius'), '9px');
  });

  it('ignores unknown names, empty values and an unknown scheme', () => {
    const root = fakeRoot();

    applyTheme({scheme: 'sepia', tokens: {'position': 'fixed', primary: '', text: 42}}, root);

    assert.equal(root.properties.size, 0);
  });

  it('tolerates a missing theme', () => {
    const root = fakeRoot();

    applyTheme(null, root);
    applyTheme({scheme: 'light'}, root);

    assert.deepEqual([...root.properties.keys()], ['--ve-t3-color-scheme']);
  });
});
