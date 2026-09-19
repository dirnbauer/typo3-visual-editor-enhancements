import {css} from 'lit';
import {PREVIEW_DISPLAY_WIDTH, PREVIEW_RENDER_WIDTH, PREVIEW_ZOOM_FACTOR} from './constants.js';

/** Styles of <ve-element-library>; kept apart so the component file stays readable. */
export const styles = css`
    :host {
      display: block;
      font-family: var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
      font-size: 14px;
      line-height: 1.4;
      --ve-accent: var(--ve-accent-color, #7c5ac4);
      --ve-accent-contrast: #ffffff;
      --ve-accent-readable: color-mix(in srgb, var(--ve-accent) 78%, var(--ve-panel-text));
      --ve-card-radius: 14px;
      --ve-panel-bg: #f4f4f6;
      --ve-panel-surface: #ffffff;
      --ve-panel-border: #e3e3e8;
      --ve-panel-text: #1b1b1f;
      --ve-panel-muted: #6c6c78;
    }

    :host-context(.dark) {
      --ve-panel-bg: #16161a;
      --ve-panel-surface: #222228;
      --ve-panel-border: #34343c;
      --ve-panel-text: #f3f3f5;
      --ve-panel-muted: #a2a2ad;
      --ve-accent-readable: color-mix(in srgb, var(--ve-accent) 42%, var(--ve-panel-text));
    }

    .panel {
      position: fixed;
      inset-block: 12px;
      right: 12px;
      width: min(600px, 94vw);
      display: flex;
      flex-direction: column;
      background: var(--ve-panel-bg);
      color: var(--ve-panel-text);
      border: 1.5px solid color-mix(in srgb, var(--ve-accent) 65%, var(--ve-panel-border));
      border-radius: var(--typo3-component-border-radius, 0.75em); overflow: hidden;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34), 0 0 0 1px color-mix(in srgb, var(--ve-accent) 16%, transparent);
      z-index: 100000;
      transform: translateX(0);
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      animation: panelIn 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes panelIn {
      from { transform: translateX(40px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .panel.collapsed { transform: translateX(calc(100% + 20px)); box-shadow: none; }

    .previewDragGhost {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 2147483647;
      pointer-events: none;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 10px;
      width: max-content;
      max-width: min(336px, calc(100vw - 24px));
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(22, 22, 26, 0.96);
      color: #fff;
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.08);
      font: 600 13px/1.25 var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
      transform-origin: top left;
      transition: transform 0.08s linear, border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
      will-change: transform;
    }
    .previewDragGhost.can-drop {
      border-color: rgba(255, 255, 255, 0.72);
      background: rgba(32, 32, 38, 0.98);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38), 0 0 0 3px rgba(255, 255, 255, 0.26);
    }
    .previewDragGhostIcon {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ve-accent);
      color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    }
    .previewDragGhostIcon img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      display: block;
    }
    .previewDragGhostFallback {
      font-size: 22px;
      font-weight: 750;
      line-height: 1;
    }
    .previewDragGhostBody {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .previewDragGhostTitle {
      display: block;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
    }
    .previewDragGhostStatus {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(255, 255, 255, 0.72);
      font-size: 11px;
      font-weight: 650;
    }
    .previewDragGhost.can-drop .previewDragGhostStatus { color: #fff; }

    .header {
      padding: 16px 20px 14px;
      border-bottom: 1px solid var(--ve-panel-border);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--ve-accent) 14%, var(--ve-panel-bg)), var(--ve-panel-bg));
    }

    .headerRow { display: flex; align-items: center; justify-content: space-between; }
    .titleWrap { display: flex; align-items: center; gap: 12px; }
    .titleBadge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      color: var(--ve-accent-contrast);
      background: linear-gradient(135deg, var(--ve-accent), color-mix(in srgb, var(--ve-accent) 65%, #000));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .titleText { display: flex; flex-direction: column; gap: 1px; line-height: 1.15; }
    h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .counter { font-size: 12.5px; font-weight: 600; color: var(--ve-panel-muted); letter-spacing: 0.01em; }
    .counter strong { color: color-mix(in srgb, var(--ve-accent) 35%, var(--ve-panel-text)); font-weight: 750; }

    .searchRow { display: flex; align-items: center; gap: 8px; }
    .searchRow .searchWrap { flex: 1 1 auto; min-width: 0; }
    .searchWrap { position: relative; display: flex; align-items: center; }
    .searchIcon { position: absolute; left: 12px; color: var(--ve-panel-muted); pointer-events: none; }
    .search {
      width: 100%; box-sizing: border-box;
      padding: 11px 12px 11px 40px; border-radius: 10px;
      border: 1px solid var(--ve-panel-border); background: var(--ve-panel-surface);
      color: var(--ve-panel-text); font-size: 14px; outline: none;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .search:focus { border-color: var(--ve-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ve-accent) 30%, transparent); }
    .search::placeholder { color: var(--ve-panel-muted); }

    /* "did you mean" + autocomplete suggestion chips under the search box */
    .suggestRow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .didYouMean { font-size: 12.5px; color: var(--ve-panel-muted); }
    .suggLink {
      background: none; border: none; padding: 0; cursor: pointer;
      font: inherit; font-weight: 700; color: var(--ve-accent-readable); text-decoration: underline;
    }
    .suggChip {
      border: 1px dashed color-mix(in srgb, var(--ve-accent) 50%, var(--ve-panel-border));
      background: color-mix(in srgb, var(--ve-accent) 8%, var(--ve-panel-surface));
      color: var(--ve-panel-text); border-radius: 999px; padding: 3px 11px;
      font-size: 12px; cursor: pointer; transition: all 0.12s ease;
    }
    .suggChip:hover { border-style: solid; border-color: var(--ve-accent); }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      border: 1px solid var(--ve-panel-border); background: var(--ve-panel-surface);
      color: var(--ve-panel-muted); border-radius: 999px; padding: 5px 13px;
      font-size: 12.5px; cursor: pointer; transition: all 0.12s ease; text-transform: capitalize;
    }
    .chip:hover { border-color: color-mix(in srgb, var(--ve-accent) 60%, var(--ve-panel-border)); color: var(--ve-panel-text); }
    .chip.active {
      background: var(--ve-accent); border-color: var(--ve-accent); color: var(--ve-accent-contrast);
      box-shadow: 0 2px 10px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .chip--clear { font-weight: 650; color: var(--ve-panel-text); }

    .grid {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(var(--ve-cols, 2), minmax(0, 1fr));
      /* Section headers are grid items too; fixed auto-rows made them reserve a
         full card-height row and pushed the first content row too far down. */
      grid-auto-rows: auto;
      gap: 18px; padding: 18px 20px 28px; align-content: start;
      scrollbar-width: thin; scrollbar-color: var(--ve-panel-border) transparent;
      /* Mandatory snapping always pulled the first card to the top and moved the
         "Recently used" heading out of view as soon as scrolling settled. */
      scroll-snap-type: y proximity;
      scroll-padding-block-start: 18px;
    }
    .grid::-webkit-scrollbar { width: 10px; }
    .grid::-webkit-scrollbar-thumb { background: var(--ve-panel-border); border-radius: 999px; border: 3px solid var(--ve-panel-bg); }

    .status {
      grid-column: 1 / -1; color: var(--ve-panel-muted); text-align: center;
      margin: 36px 0; display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .status.error { color: #ff8484; }
    .spinner {
      width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid var(--ve-panel-border); border-top-color: var(--ve-accent);
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      position: relative; background: var(--ve-panel-surface); color: var(--ve-panel-text);
      border-radius: var(--ve-card-radius); overflow: hidden; cursor: grab;
      border: 1px solid color-mix(in srgb, var(--ve-panel-text) 22%, var(--ve-panel-border));
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      display: flex; flex-direction: column;
      height: var(--ve-card-height, 330px);
      scroll-snap-align: start;
      transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s ease, border-color 0.16s ease;
      animation: cardIn 0.3s ease backwards;
    }
    @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .card:hover {
      border-color: color-mix(in srgb, var(--ve-accent) 65%, var(--ve-panel-border));
      transform: translateY(-3px);
      box-shadow: 0 10px 26px color-mix(in srgb, var(--ve-accent) 18%, rgba(0, 0, 0, 0.30)),
                  0 0 0 1px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .card:focus-within {
      border-color: var(--ve-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    .card:active { cursor: grabbing; }
    .card.is-dragging { opacity: 0.4; transform: scale(0.96) rotate(-1deg); }

    /* preview is the last row: it fills whatever height the card has left under
       the header / keyword band, and rounds the card's BOTTOM corners */
    .preview {
      position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
      background-color: color-mix(in srgb, var(--ve-accent) 6%, var(--ve-panel-bg));
      background-image: radial-gradient(color-mix(in srgb, var(--ve-accent) 17%, transparent) 1px, transparent 1.4px);
      background-size: 11px 11px;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ve-accent) 14%, transparent);
      border-bottom-left-radius: calc(var(--ve-card-radius) - 1px);
      border-bottom-right-radius: calc(var(--ve-card-radius) - 1px);
      cursor: zoom-in;
    }
    .preview iframe {
      position: absolute; top: 0; left: 0;
      width: ${PREVIEW_RENDER_WIDTH}px; height: 900px; border: 0;
      transform-origin: top left;
      pointer-events: none; animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .previewOverlay { position: absolute; inset: 0; }
    .previewPlaceholder {
      display: flex; align-items: center; justify-content: center; height: 100%;
      color: var(--ve-panel-muted); font-size: 13px; position: relative; overflow: hidden;
      background: linear-gradient(135deg, color-mix(in srgb, var(--ve-panel-bg) 55%, var(--ve-panel-surface)), var(--ve-panel-bg));
    }
    .previewPlaceholder img { width: 52px; height: 52px; opacity: 0.8; }
    .previewPlaceholder span:not(.shimmer) { padding: 0 16px; text-align: center; }
    .shimmer {
      position: absolute; inset: 0;
      background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--ve-panel-surface) 65%, transparent) 50%, transparent 70%);
      transform: translateX(-100%); animation: shimmer 1.4s infinite;
    }
    @keyframes shimmer { to { transform: translateX(100%); } }

    .grabHint {
      position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%) translateY(8px);
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(22, 22, 26, 0.92); color: #fff; font-size: 11px; font-weight: 600;
      padding: 5px 11px 5px 9px; border-radius: 999px; opacity: 0; pointer-events: none;
      transition: opacity 0.16s ease, transform 0.16s ease; white-space: nowrap;
    }
    .card:hover .grabHint { opacity: 1; transform: translateX(-50%) translateY(0); }
    .grabHint .grabGrip { flex-shrink: 0; opacity: 0.85; }
    .card:hover .grabHint .grabGrip { animation: veGrabGrip 2.2s ease-in-out infinite; }
    @keyframes veGrabGrip { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }

    /* category eyebrow sits ABOVE the title */
    .cardHead {
      flex-shrink: 0;
      display: flex; flex-direction: column; align-items: flex-start;
      text-align: left; gap: 5px;
      padding: 11px 16px 8px;
    }
    .cardCategory { margin-bottom: 1px; }

    .previewLoupe {
      position: absolute; z-index: 4; top: 8px; right: 8px;
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; padding: 0;
      border: none; border-radius: 999px;
      background: rgba(22, 22, 26, 0.55); color: #fff;
      -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      box-shadow: none;
      cursor: zoom-in;
      opacity: 0; transform: translateY(-4px) scale(0.96);
      transition: opacity 0.16s ease, transform 0.16s ease, background 0.12s ease;
    }
    .card:hover .previewLoupe,
    .card:focus-within .previewLoupe { opacity: 1; transform: translateY(0) scale(1); }
    .previewLoupe:hover { background: rgba(22, 22, 26, 0.72); transform: translateY(0) scale(1.08); }
    .previewLoupe:focus-visible { opacity: 1; transform: translateY(0); outline: 2px solid #fff; outline-offset: 2px; }

    .cardTitle {
      max-width: 100%;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      font-size: 14.5px; font-weight: 700; line-height: 1.22; letter-spacing: -0.01em;
    }

    /* keyword chips replace the prose description: a dense, scannable band that
       caps at ~2 rows so the preview stays the hero. Lightweight (not bold) and
       compact to save space. The full keyword + synonym set is in the flyout. */
    .cardKeywords {
      flex-shrink: 0;
      display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start;
      padding: 0 16px 14px;
      max-height: 3.7em; overflow: hidden;
    }
    .kw {
      display: inline-flex; align-items: center;
      font-size: 10.5px; font-weight: 400; line-height: 1.3; white-space: nowrap;
      padding: 1px 7px; border-radius: 999px;
      /* neutral, no accent tint - just a hairline outline that follows light/dark */
      background: transparent;
      border: 1px solid var(--ve-panel-border);
      color: color-mix(in srgb, var(--ve-panel-text) 72%, var(--ve-panel-muted));
    }

    .pill {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
      font-size: 10.5px; font-weight: 650; line-height: 1.45;
      padding: 2px 8px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 50%, transparent);
      background: transparent;
    }
    .pill svg { width: 12px; height: 12px; flex-shrink: 0; }
    .badge { color: var(--ve-accent-readable); text-transform: capitalize; }

    /* enlarged preview flyout (docked pane or centred overlay). */

    .previewFlyout {
      display: flex; flex-direction: column;
      max-width: 96vw; max-height: calc(100vh - 24px);
      background: var(--ve-panel-surface); color: var(--ve-panel-text);
      border: 1.5px solid color-mix(in srgb, var(--ve-accent) 55%, var(--ve-panel-border));
      border-radius: var(--ve-card-radius); overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px color-mix(in srgb, var(--ve-accent) 22%, transparent);
    }

    .previewHead {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 13px; flex-shrink: 0;
      border-bottom: 1px solid var(--ve-panel-border);
      background: linear-gradient(180deg, color-mix(in srgb, var(--ve-accent) 12%, var(--ve-panel-surface)), var(--ve-panel-surface));
    }
    .previewEyebrow {
      flex-shrink: 0;
      font-size: 10px; font-weight: 700; line-height: 1;
      letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--ve-accent-readable);
    }
    .previewHead .previewTitle { flex: 1 1 auto; }

    /* fixed width (fills the constant-width flyout); height set by JS on load */
    .previewStage {
      position: relative; overflow: hidden; background: var(--ve-panel-bg);
      width: 100%; height: 40vh;
      transition: height 0.2s ease;
    }
    .previewStage .previewSpinner { position: absolute; top: 50%; left: 50%; margin: -9px 0 0 -9px; }
    .previewStage.loaded .previewSpinner { display: none; }
    .previewFrame {
      position: absolute; top: 0; left: 50%;
      width: ${PREVIEW_RENDER_WIDTH}px; height: 1400px; border: 0;
      transform-origin: top center;
      transform: translateX(-50%) scale(calc(${PREVIEW_DISPLAY_WIDTH} * ${PREVIEW_ZOOM_FACTOR} / ${PREVIEW_RENDER_WIDTH}));
      pointer-events: none; opacity: 0; transition: opacity 0.2s ease;
    }
    .previewFrame.ready { opacity: 1; }

    .previewCaption {
      display: flex; flex-direction: column; gap: 8px;
      padding: 9px 13px 11px; flex-shrink: 0;
      border-top: 1px solid var(--ve-panel-border);
      background: linear-gradient(0deg, color-mix(in srgb, var(--ve-accent) 8%, var(--ve-panel-surface)), var(--ve-panel-surface));
      max-height: 26vh; overflow-y: auto;
    }
    .previewTitle { font-size: 13.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .previewDesc {
      margin: 0; font-size: 12px; line-height: 1.5;
      color: color-mix(in srgb, var(--ve-panel-text) 74%, var(--ve-panel-muted));
    }

    /* ---- section headers (Recently used / All elements) ---- */
    .sectionHead {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 7px;
      margin: 6px 2px 0; padding: 2px 2px 5px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--ve-panel-muted);
    }
    .sectionHead:first-child { margin-top: 0; }
    .grid .sectionHead { scroll-snap-align: start; }
    .vlist .sectionHead { flex: 0 0 auto; margin-top: 2px; padding-bottom: 2px; }
    .sectionIcon { flex-shrink: 0; }
    .sectionCount {
      font-weight: 650; color: var(--ve-accent-readable); letter-spacing: 0;
      background: color-mix(in srgb, var(--ve-accent) 13%, transparent);
      border-radius: 999px; padding: 0 7px; font-size: 10.5px;
    }

    /* ---- single-column workarea: flexible docked preview + fixed list ---- */
    .workarea { flex: 1 1 auto; min-height: 0; display: flex; }
    /* the preview pane takes ALL the space left of the (fixed-width) list */
    .dock {
      flex: 1 1 auto; min-width: 0;
      border-right: 1px solid var(--ve-panel-border); background: var(--ve-panel-bg);
      overflow: hidden; display: flex; flex-direction: column;
    }
    .dockEmpty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 24px; text-align: center; color: var(--ve-panel-muted); font-size: 13px;
    }
    /* fixed-width compact list of element titles - a plain flex column, NOT the
       card grid, so it never inherits the grid's row sizing or scroll-snap */
    .vlist {
      /* responsive: ~34% of the workarea, clamped, so it shrinks/grows with the
         panel (which itself is capped at 94vw) across screen sizes */
      flex: 0 0 clamp(240px, 34%, var(--ve-list-width, 340px)); min-width: 0;
      overflow-y: auto; overflow-x: hidden;
      display: flex; flex-direction: column; gap: 7px; padding: 14px;
      scrollbar-width: thin; scrollbar-color: var(--ve-panel-border) transparent;
      /* snap each row to the top of the list as you scroll */
      scroll-snap-type: y proximity; scroll-padding-block-start: 14px;
    }
    .vlist::-webkit-scrollbar { width: 10px; }
    .vlist::-webkit-scrollbar-thumb { background: var(--ve-panel-border); border-radius: 999px; border: 3px solid var(--ve-panel-bg); }
    .lrow {
      flex: 0 0 auto;
      scroll-snap-align: start;
      display: flex; flex-direction: column; align-items: stretch; gap: 8px;
      padding: 10px 11px 11px; cursor: grab;
      border: 1px solid color-mix(in srgb, var(--ve-panel-text) 18%, var(--ve-panel-border));
      border-radius: 11px; background: var(--ve-panel-surface); color: var(--ve-panel-text);
      transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
    }
    .lrow:hover { border-color: color-mix(in srgb, var(--ve-accent) 60%, var(--ve-panel-border)); }
    .lrow:focus-visible { outline: 2px solid var(--ve-accent); outline-offset: 2px; }
    .lrow:active { cursor: grabbing; }
    .lrow.is-dragging { opacity: 0.4; }
    .lrow.is-active {
      border-color: var(--ve-accent);
      background: color-mix(in srgb, var(--ve-accent) 12%, var(--ve-panel-surface));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ve-accent) 45%, transparent);
    }
    /* top keywords on each row (no per-row preview iframe; the docked pane shows
       the rendered preview on hover) */
    .lrowKeywords {
      order: 2; display: flex; flex-wrap: wrap; gap: 4px;
      align-content: flex-start; max-height: 42px; overflow: hidden;
    }
    .lrowKeywords .kw { flex: none; }
    /* keep keyword chips legible on the accent-tinted hover/active row: a solid
       surface fill + a stronger border, both following light/dark via the vars */
    .lrow:hover .kw,
    .lrow.is-active .kw {
      background: var(--ve-panel-surface);
      border-color: color-mix(in srgb, var(--ve-panel-text) 32%, var(--ve-panel-border));
    }
    .lrowBody { order: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .lrowCat { align-self: flex-start; }
    .lrowTitle {
      font-size: 13.5px; font-weight: 700; line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }

    /* ---- docked preview pane (single-column mode) ---- */
    .previewDock { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 12px; }
    /* fill the whole dock so the preview uses all the available space */
    .previewFlyout--docked { width: 100%; height: 100%; }

    /* ---- overlay preview (multi-column mode) ---- */
    .previewModal {
      position: fixed; inset: 0; z-index: 100002;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      background: rgba(12, 12, 16, 0.55);
      -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
      cursor: zoom-out; animation: veModalIn 0.16s ease;
    }
    @keyframes veModalIn { from { opacity: 0; } to { opacity: 1; } }
    /* while dragging the preview out, keep it in the DOM (so the drag survives)
       but invisible and click-through so the drop zones underneath are usable */
    .previewModal.dragging { opacity: 0; pointer-events: none; }
    .previewFlyout--modal {
      width: min(1600px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
      animation: veModalPop 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes veModalPop { from { transform: translateY(10px) scale(0.985); opacity: 0; } to { transform: none; opacity: 1; } }
    .previewClose {
      margin-left: 4px; flex-shrink: 0; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; padding: 0;
      border: 1px solid var(--ve-panel-border); border-radius: 999px;
      background: var(--ve-panel-bg); color: var(--ve-panel-text);
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
    }
    .previewClose:hover { background: var(--ve-accent); color: var(--ve-accent-contrast); border-color: var(--ve-accent); }
    .previewClose:focus-visible { outline: 2px solid var(--ve-accent); outline-offset: 2px; }

    /* the big preview is itself a drag source */
    .previewFlyout[draggable="true"] { cursor: grab; }
    .previewFlyout[draggable="true"]:active { cursor: grabbing; }
    /* prominent drag affordance at the foot of the preview: grip + label + a
       gently pulsing arrow that reads as "drag this onto the page" */
    .previewDrag {
      flex-shrink: 0;
      display: flex; align-items: center; gap: 9px;
      padding: 9px 13px;
      border-top: 1px solid var(--ve-panel-border);
      background: color-mix(in srgb, var(--ve-accent) 11%, var(--ve-panel-surface));
      color: var(--ve-accent-readable);
      font-size: 12px; font-weight: 650; cursor: grab; user-select: none;
    }
    .previewDragGrip { flex-shrink: 0; display: inline-flex; opacity: 0.75; }
    .previewDragLabel { flex: 1 1 auto; min-width: 0; }
    .previewDragArrow { flex-shrink: 0; order: -1; display: inline-flex; animation: vePreviewDragArrow 1.4s ease-in-out infinite; }
    @keyframes vePreviewDragArrow {
      0%, 100% { transform: translateX(0); opacity: 0.5; }
      50% { transform: translateX(-5px); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .card, .shimmer, .spinner, .preview iframe,
      .previewModal, .previewFlyout, .previewStage, .previewFrame,
      .previewLoupe, .previewDragArrow, .previewDragGhost,
      .grabHint, .grabHint .grabGrip { animation: none !important; transition: none !important; }
    }
`;
