import {css} from 'lit';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';
import {PREVIEW_DISPLAY_WIDTH, PREVIEW_RENDER_WIDTH, PREVIEW_ZOOM_FACTOR} from './constants.js';

/**
 * Styles of <ve-element-library>; kept apart so the component file stays
 * readable. Every colour, radius, shadow and the font come from the backend's
 * design tokens (Shared/theme.js): the panel reads like a backend module -
 * header on the raised surface, cards on the component surface, the primary
 * colour only for the active filter and the selection.
 */
export const styles = [themeTokens, css`
    :host {
      display: block;
      font-size: 13px;
      line-height: 1.4;
      color: var(--ve-text);
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .panel {
      position: fixed;
      inset-block: 12px;
      right: 12px;
      width: min(600px, 94vw);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--ve-surface);
      color: var(--ve-text);
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      box-shadow: var(--ve-shadow-dialog);
      z-index: 100000;
      transform: translateX(0);
      transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
      animation: panelIn 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes panelIn {
      from { transform: translateX(24px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .panel.collapsed { transform: translateX(calc(100% + 20px)); box-shadow: none; }

    /* ---- header: title, counter, search, category filter ---- */

    .header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 18px 12px;
      border-bottom: 1px solid var(--ve-border);
      background: var(--ve-surface-raised);
    }

    .headerRow { display: flex; align-items: center; justify-content: space-between; }
    .titleWrap { display: flex; align-items: center; gap: 10px; }
    .titleBadge {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 32px; height: 32px;
      border-radius: var(--ve-radius-small);
      background: var(--ve-primary);
      color: var(--ve-on-primary);
    }
    .titleText { display: flex; flex-direction: column; gap: 1px; line-height: 1.2; }
    h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .counter { font-size: 12px; color: var(--ve-text-muted); font-variant-numeric: tabular-nums; }
    .counter strong { color: var(--ve-text); font-weight: 600; }

    .searchRow { display: flex; align-items: center; gap: 8px; }
    .searchRow .searchWrap { flex: 1 1 auto; min-width: 0; }
    .searchWrap { position: relative; display: flex; align-items: center; }
    .searchIcon { position: absolute; left: 10px; color: var(--ve-text-muted); pointer-events: none; }
    .search {
      width: 100%;
      padding: 7px 10px 7px 34px;
      border: 1px solid var(--ve-input-border);
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      font: inherit;
      outline: none;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .search:focus { border-color: var(--ve-focus); box-shadow: var(--ve-focus-ring); }
    .search::placeholder { color: var(--ve-text-muted); }

    /* "did you mean" + autocomplete suggestions under the search box */
    .suggestRow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .didYouMean { font-size: 12px; color: var(--ve-text-muted); }
    .suggLink {
      padding: 0; border: none; background: none; cursor: pointer;
      font: inherit; font-weight: 600; color: var(--ve-primary-text); text-decoration: underline;
    }
    .suggChip {
      padding: 2px 10px;
      border: 1px dashed var(--ve-input-border);
      border-radius: var(--ve-radius-small);
      background: transparent;
      color: var(--ve-text);
      font: inherit; font-size: 12px;
      cursor: pointer;
    }
    .suggChip:hover { border-style: solid; border-color: var(--ve-primary-text); }

    /* Category filter: backend "default" buttons that stay pressed. */
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      padding: 3px 10px;
      border: 1px solid var(--ve-input-border);
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      font: inherit; font-size: 12px;
      text-transform: capitalize;
      cursor: pointer;
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    .chip:hover { background: var(--ve-hover); }
    .chip.active { border-color: var(--ve-primary); background: var(--ve-primary); color: var(--ve-on-primary); }
    .chip--clear { font-weight: 600; }

    :is(.search, .chip, .suggChip, .suggLink, .previewLoupe, .previewClose, .lrow):focus-visible {
      outline: 2px solid var(--ve-focus);
      outline-offset: 1px;
    }

    /* ---- the element list: thumbnail grid (3 columns) ---- */

    .grid {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(var(--ve-cols, 2), minmax(0, 1fr));
      /* Section headers are grid items too; fixed auto-rows made them reserve a
         full card-height row and pushed the first content row too far down. */
      grid-auto-rows: auto;
      gap: 16px; padding: 16px 18px 24px; align-content: start;
      scrollbar-width: thin; scrollbar-color: var(--ve-input-border) transparent;
      /* Mandatory snapping always pulled the first card to the top and moved the
         "Recently used" heading out of view as soon as scrolling settled. */
      scroll-snap-type: y proximity;
      scroll-padding-block-start: 16px;
    }

    .status {
      grid-column: 1 / -1;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      margin: 36px 0;
      color: var(--ve-text-muted); text-align: center;
    }
    .status.error { color: var(--ve-danger); }
    .spinner {
      width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid var(--ve-border); border-top-color: var(--ve-primary-text);
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      position: relative;
      display: flex; flex-direction: column;
      height: var(--ve-card-height, 330px);
      overflow: hidden;
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      cursor: grab;
      scroll-snap-align: start;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .card:hover { border-color: var(--ve-input-border); box-shadow: var(--ve-shadow); }
    .card:focus-within { border-color: var(--ve-focus); box-shadow: var(--ve-focus-ring); }
    .card:active { cursor: grabbing; }
    .card.is-dragging { opacity: 0.45; }

    /* category eyebrow ABOVE the title */
    .cardHead {
      display: flex; flex-direction: column; align-items: flex-start; flex-shrink: 0;
      gap: 3px; padding: 10px 14px 8px;
      text-align: left;
    }
    .cardTitle {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      max-width: 100%;
      font-size: 14px; font-weight: 600; line-height: 1.25;
    }

    /* keyword band: dense and scannable, capped at ~2 rows so the preview stays
       the largest part of the card */
    .cardKeywords {
      display: flex; flex-wrap: wrap; align-content: flex-start; flex-shrink: 0; gap: 4px;
      max-height: 3.6em; overflow: hidden;
      padding: 0 14px 12px;
    }
    .kw {
      display: inline-flex; align-items: center;
      padding: 0 6px;
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius-small);
      color: var(--ve-text-muted);
      font-size: 11px; line-height: 1.5; white-space: nowrap;
    }

    /* the element's category, set as a small eyebrow */
    .pill {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
      color: var(--ve-text-muted);
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.3;
      text-transform: uppercase;
    }
    .pill svg { width: 12px; height: 12px; flex-shrink: 0; }

    /* preview: the last row, filling the height left under header + keywords */
    .preview {
      position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
      border-top: 1px solid var(--ve-border);
      background: var(--ve-surface-sunken);
      cursor: zoom-in;
    }
    .preview iframe {
      position: absolute; top: 0; left: 0;
      width: ${PREVIEW_RENDER_WIDTH}px; height: 900px; border: 0;
      transform-origin: top left;
      pointer-events: none;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .previewOverlay { position: absolute; inset: 0; }
    .previewPlaceholder {
      position: relative; display: flex; align-items: center; justify-content: center;
      height: 100%; overflow: hidden;
      color: var(--ve-text-muted); font-size: 13px;
    }
    .previewPlaceholder img { width: 48px; height: 48px; opacity: 0.8; }
    .previewPlaceholder span:not(.shimmer) { padding: 0 16px; text-align: center; }
    .shimmer {
      position: absolute; inset: 0;
      background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--ve-surface-raised) 60%, transparent) 50%, transparent 70%);
      transform: translateX(-100%);
      animation: shimmer 1.4s infinite;
    }
    @keyframes shimmer { to { transform: translateX(100%); } }

    /* Floating hints over a preview use the inverted surface: the text colour
       as background, so they read on any rendered element in both schemes. */
    .grabHint,
    .previewLoupe,
    .previewDragGhost {
      background: color-mix(in srgb, var(--ve-text) 88%, transparent);
      color: var(--ve-surface-raised);
    }

    .grabHint {
      position: absolute; left: 50%; bottom: 10px;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px 4px 8px;
      border-radius: var(--ve-radius-small);
      font-size: 11px; font-weight: 600; white-space: nowrap;
      opacity: 0; pointer-events: none;
      transform: translateX(-50%) translateY(6px);
      transition: opacity 0.14s ease, transform 0.14s ease;
    }
    .card:hover .grabHint { opacity: 1; transform: translateX(-50%) translateY(0); }
    .grabHint .grabGrip { flex-shrink: 0; opacity: 0.85; }

    .previewLoupe {
      position: absolute; z-index: 4; top: 8px; right: 8px;
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; padding: 0;
      border: none; border-radius: var(--ve-radius-small);
      cursor: zoom-in;
      opacity: 0;
      transition: opacity 0.14s ease;
    }
    .card:hover .previewLoupe,
    .card:focus-within .previewLoupe,
    .previewLoupe:focus-visible { opacity: 1; }

    /* ---- section headers (Recently used / All elements) ---- */

    .sectionHead {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 7px;
      margin: 4px 2px 0; padding: 2px 2px 4px;
      color: var(--ve-text-muted);
      font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    }
    .sectionHead:first-child { margin-top: 0; }
    .grid .sectionHead { scroll-snap-align: start; }
    .vlist .sectionHead { flex: 0 0 auto; margin-top: 2px; padding-bottom: 2px; }
    .sectionIcon { flex-shrink: 0; }
    .sectionCount {
      padding: 0 6px;
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-sunken);
      color: var(--ve-text);
      font-size: 10.5px; letter-spacing: 0;
    }

    /* ---- one column: a compact list beside a docked preview ---- */

    .workarea { flex: 1 1 auto; min-height: 0; display: flex; }
    /* the preview pane takes ALL the space left of the (fixed-width) list */
    .dock {
      flex: 1 1 auto; min-width: 0;
      display: flex; flex-direction: column; overflow: hidden;
      border-right: 1px solid var(--ve-border);
      background: var(--ve-surface);
    }
    .dockEmpty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 24px;
      color: var(--ve-text-muted); font-size: 13px; text-align: center;
    }
    /* a plain flex column, NOT the card grid, so it never inherits the grid's
       row sizing or scroll-snap; ~34% of the workarea, clamped */
    .vlist {
      flex: 0 0 clamp(240px, 34%, var(--ve-list-width, 340px)); min-width: 0;
      display: flex; flex-direction: column; gap: 6px;
      overflow-y: auto; overflow-x: hidden;
      padding: 12px;
      scrollbar-width: thin; scrollbar-color: var(--ve-input-border) transparent;
      scroll-snap-type: y proximity; scroll-padding-block-start: 12px;
    }
    .lrow {
      display: flex; flex: 0 0 auto; flex-direction: column; align-items: stretch; gap: 6px;
      padding: 9px 11px 10px;
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      cursor: grab;
      scroll-snap-align: start;
      transition: border-color 0.12s ease, background-color 0.12s ease;
    }
    .lrow:hover { border-color: var(--ve-input-border); }
    .lrow:active { cursor: grabbing; }
    .lrow.is-dragging { opacity: 0.45; }
    .lrow.is-active { border-color: var(--ve-primary-text); background: var(--ve-primary-subtle); }
    .lrowKeywords {
      order: 2; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px;
      max-height: 42px; overflow: hidden;
    }
    .lrowKeywords .kw { flex: none; }
    .lrowBody { order: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .lrowCat { align-self: flex-start; }
    .lrowTitle {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      font-size: 13.5px; font-weight: 600; line-height: 1.25;
    }

    /* ---- the enlarged preview: docked pane or centred dialog ---- */

    .previewFlyout {
      display: flex; flex-direction: column;
      max-width: 96vw; max-height: calc(100vh - 24px);
      overflow: hidden;
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      box-shadow: var(--ve-shadow-dialog);
    }
    .previewHead {
      display: flex; align-items: center; flex-shrink: 0; gap: 9px;
      padding: 9px 13px;
      border-bottom: 1px solid var(--ve-border);
    }
    .previewEyebrow {
      flex-shrink: 0;
      color: var(--ve-text-muted);
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; line-height: 1; text-transform: uppercase;
    }
    .previewHead .previewTitle { flex: 1 1 auto; }
    .previewTitle { min-width: 0; overflow: hidden; font-size: 13.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

    /* fixed width (fills the constant-width flyout); height set by JS on load */
    .previewStage {
      position: relative; overflow: hidden;
      width: 100%; height: 40vh;
      background: var(--ve-surface-sunken);
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
      display: flex; flex-direction: column; flex-shrink: 0; gap: 8px;
      max-height: 26vh; overflow-y: auto;
      padding: 9px 13px 11px;
      border-top: 1px solid var(--ve-border);
    }
    .previewDesc { margin: 0; color: var(--ve-text-muted); font-size: 12px; line-height: 1.5; }

    .previewDock { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 12px; }
    .previewFlyout--docked { width: 100%; height: auto; max-height: 100%; box-shadow: none; }

    .previewModal {
      position: fixed; inset: 0; z-index: 100002;
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      background: color-mix(in srgb, var(--ve-overlay) 55%, transparent);
      cursor: zoom-out;
      animation: veModalIn 0.16s ease;
    }
    @keyframes veModalIn { from { opacity: 0; } to { opacity: 1; } }
    /* while dragging the preview out, keep it in the DOM (so the drag survives)
       but invisible and click-through so the drop zones underneath are usable */
    .previewModal.dragging { opacity: 0; pointer-events: none; }
    .previewFlyout--modal { width: min(1600px, calc(100vw - 32px)); max-height: calc(100vh - 32px); }
    .previewClose {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 30px; height: 30px; margin-left: 4px; padding: 0;
      border: 1px solid var(--ve-input-border);
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
      cursor: pointer;
    }
    .previewClose:hover { background: var(--ve-hover); }

    /* the big preview is itself a drag source */
    .previewFlyout[draggable="true"] { cursor: grab; }
    .previewFlyout[draggable="true"]:active { cursor: grabbing; }
    /* drag affordance at the foot of the preview: grip + label + an arrow that
       reads as "drag this onto the page" */
    .previewDrag {
      display: flex; align-items: center; flex-shrink: 0; gap: 9px;
      padding: 9px 13px;
      border-top: 1px solid var(--ve-border);
      background: var(--ve-surface-sunken);
      color: var(--ve-text);
      font-size: 12px; font-weight: 600;
      cursor: grab; user-select: none;
    }
    .previewDragGrip { display: inline-flex; flex-shrink: 0; opacity: 0.75; }
    .previewDragLabel { flex: 1 1 auto; min-width: 0; }
    .previewDragArrow { display: inline-flex; flex-shrink: 0; order: -1; color: var(--ve-primary-text); animation: vePreviewDragArrow 1.4s ease-in-out infinite; }
    @keyframes vePreviewDragArrow {
      0%, 100% { transform: translateX(0); opacity: 0.55; }
      50% { transform: translateX(-4px); opacity: 1; }
    }

    /* the chip following the pointer while the enlarged preview is dragged */
    .previewDragGhost {
      position: fixed; top: 0; left: 0; z-index: 2147483647;
      display: flex; align-items: center; gap: 10px;
      width: max-content; max-width: min(336px, calc(100vw - 24px));
      padding: 9px 12px;
      border: 1px solid transparent;
      border-radius: var(--ve-radius);
      box-shadow: var(--ve-shadow-dialog);
      font-size: 13px; font-weight: 600; line-height: 1.25;
      pointer-events: none;
      transform-origin: top left;
      transition: transform 0.08s linear, border-color 0.12s ease;
      will-change: transform;
    }
    .previewDragGhost.can-drop { border-color: var(--ve-primary-text); }
    .previewDragGhostIcon {
      display: flex; align-items: center; justify-content: center; flex: none;
      width: 32px; height: 32px; overflow: hidden;
      border-radius: var(--ve-radius-small);
      background: var(--ve-primary);
      color: var(--ve-on-primary);
    }
    .previewDragGhostIcon img { display: block; width: 20px; height: 20px; object-fit: contain; }
    .previewDragGhostFallback { font-size: 20px; font-weight: 700; line-height: 1; }
    .previewDragGhostBody { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .previewDragGhostTitle { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .previewDragGhostStatus {
      display: block; overflow: hidden;
      font-size: 11px; font-weight: 500; opacity: 0.8;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .previewDragGhost.can-drop .previewDragGhostStatus { opacity: 1; }

    .visually-hidden {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
      overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .shimmer, .spinner, .preview iframe,
      .previewModal, .previewFlyout, .previewStage, .previewFrame,
      .previewLoupe, .previewDragArrow, .previewDragGhost,
      .grabHint, .card, .lrow, .chip { animation: none !important; transition: none !important; }
    }
`];
