/**
 * The label stylesheet adopted into every content element's shadow root
 * (Shared/action-bar-label-css.js). Pure CSS text, so the rules that carry
 * the accessibility promises are pinned here; the component spec
 * (Tests/E2E/action-bar-labels-component.spec.js) proves them in Chromium.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  ACTION_LABEL_MODES,
  buildActionBarLabelCss,
  LABEL_METRICS,
  normalizeActionLabelMode,
} from '../../Resources/Public/JavaScript/Shared/action-bar-label-css.js';

const BASE = '.action-bar[data-ve-labels] .button[hidden]{display:none}';

describe('buildActionBarLabelCss', () => {
  it('icons mode produces only the base rules', () => {
    const css = buildActionBarLabelCss('icons');
    assert.ok(css.includes(BASE));
    assert.ok(css.includes('.button[aria-disabled="true"]{opacity:.5;cursor:not-allowed}'));
    assert.ok(!css.includes('::after'));
    assert.equal(css.trim().split('\n').length, 2);
  });

  it('caption reserves a row and reveals only the current, focused or pinned label', () => {
    const css = buildActionBarLabelCss('caption');
    const bar = '.action-bar[data-ve-labels][data-ve-labels="caption"]';
    assert.ok(css.includes(`${bar}{flex-wrap:wrap;row-gap:0}`));
    assert.ok(css.includes(`${bar}::after{content:'';flex-basis:100%;height:${LABEL_METRICS.captionRow}px}`));
    assert.match(css, /\.button::after\{position:absolute;left:4px;right:4px;bottom:calc\(var\(--auto-no-overlap-padding, 0px\) \+ 4px\);height:14px;font-family:inherit;font-size:11px;font-weight:500;/);
    assert.match(css, /opacity:0;transition:opacity \.12s ease/);
    // A click pins by setting data-ve-label-current on the clicked button (Frontend/action-bar-labels.js).
    assert.ok(css.includes(`${bar} .button[data-ve-label-current]::after,\n${bar}:not(:has([data-ve-label-current])) .button:focus-visible::after{opacity:1}`));
    assert.doesNotMatch(css, /:hover/, 'hover is tracked per bar in JS so the caption stays while the pointer is anywhere in the bar');
  });

  it('inline and stacked have no hover selectors and change size only with the bar', () => {
    for (const mode of ['inline', 'stacked']) {
      const css = buildActionBarLabelCss(mode);
      assert.doesNotMatch(css, /:hover|data-ve-label-current|@media \(hover/, mode);
      assert.match(css, /\.button\{display:inline-grid;/, mode);
    }
    assert.match(buildActionBarLabelCss('inline'), /grid-auto-flow:column;align-items:center;column-gap:6px\}/);
    assert.match(buildActionBarLabelCss('inline'), /font-size:11px;font-weight:500;letter-spacing:\.01em;/);
    assert.match(buildActionBarLabelCss('stacked'), /grid-template-rows:minmax\(14px, auto\) 10px;/);
    assert.match(buildActionBarLabelCss('stacked'), /font-size:10px;font-weight:500;letter-spacing:\.02em;.*line-height:10px/);
  });

  it('every mode uses attr(aria-label) and honours data-ve-label', () => {
    for (const mode of ['caption', 'inline', 'stacked']) {
      const css = buildActionBarLabelCss(mode);
      assert.ok(css.includes('.button::after{content:attr(aria-label)}'), mode);
      assert.ok(css.includes('.button[data-ve-label]::after{content:attr(data-ve-label)}'), mode);
      assert.doesNotMatch(css, /content:"[^"]/, `${mode}: no literal label text`);
    }
  });

  it('hover:none switches caption to inline and reduced-motion removes transitions', () => {
    const css = buildActionBarLabelCss('caption');
    const touch = css.slice(css.indexOf('@media (hover: none){'));
    assert.match(touch, /::after\{content:none;display:none\}/);
    assert.match(touch, /\.button\{display:inline-grid;grid-auto-flow:column/);
    assert.match(touch, /\.button::after\{position:static;opacity:1;/);
    for (const mode of ['caption', 'inline', 'stacked']) {
      assert.match(buildActionBarLabelCss(mode), /@media \(prefers-reduced-motion: reduce\)\{[^}]*\.button::after\{transition:none\}\}/, mode);
    }
  });

  it('puts the base rules last so [hidden] wins over a mode\'s display', () => {
    for (const mode of ACTION_LABEL_MODES) {
      const css = buildActionBarLabelCss(mode);
      assert.ok(css.lastIndexOf(BASE) > css.lastIndexOf('display:inline-grid'), mode);
    }
  });

  it('falls back to caption for unknown modes', () => {
    assert.equal(normalizeActionLabelMode('carousel'), 'caption');
    assert.equal(normalizeActionLabelMode(undefined), 'caption');
    assert.equal(buildActionBarLabelCss('carousel'), buildActionBarLabelCss('caption'));
  });
});
