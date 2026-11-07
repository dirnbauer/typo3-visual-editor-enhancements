import {css} from 'lit';
import {themeTokens} from '@webconsulting/visual-editor-enhancements/Shared/theme.js';

/**
 * Styles of <ve-field-chooser>; kept apart so the component file stays
 * readable. The popover is drawn like a backend dropdown: component surface,
 * backend form controls (raised surface, input border, focus ring), nav-tabs
 * for the form's tabs - all from the backend's design tokens (Shared/theme.js).
 */
export const styles = [themeTokens, css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .popover {
      position: fixed;
      z-index: 100002;
      display: flex;
      flex-direction: column;
      width: min(480px, calc(100vw - 24px));
      max-height: 60vh;
      background: var(--ve-surface);
      color: var(--ve-text);
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius);
      box-shadow: var(--ve-shadow-dialog);
      font-size: 13px;
      line-height: 1.4;
    }

    /* Entries layouts (User settings > Entries panel). */
    .popover.isDrawer {
      top: 12px;
      right: 12px;
      width: min(400px, calc(100vw - 24px));
      max-height: calc(100dvh - 24px);
    }

    .popover.isTray {
      right: 12px;
      bottom: 12px;
      left: 12px;
      width: auto;
      max-height: min(42dvh, 420px);
    }

    .popover.isAnchored {
      width: min(480px, calc(100vw - 24px));
    }

    .body { container-type: inline-size; container-name: entries; }

    .header, .footer { flex-shrink: 0; }
    .body { min-height: 0; overscroll-behavior: contain; }
    button, summary, a { -webkit-tap-highlight-color: transparent; }
    button:focus-visible, summary:focus-visible, a:focus-visible,
    typo3-backend-contextual-record-edit-trigger:focus-visible {
      outline: 2px solid var(--ve-focus);
      outline-offset: 2px;
    }
    button:disabled { cursor: default; opacity: 0.55; }

    .notice, .collectionNotice, .collectionHint, .actionReason, .entryHint, .entryReadOnly {
      margin: 0;
      color: var(--ve-text-muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .notice { padding: 10px 12px; border-bottom: 1px solid var(--ve-border); }
    /* The status region stays in the DOM (live regions must exist before they speak). */
    .notice.isEmpty { height: 0; padding: 0; border: 0; overflow: hidden; }

    /* Where the editor works: live / workspace draft, language, translation mode. */
    .contextStrip {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 0;
      padding: 8px 12px; border-bottom: 1px solid var(--ve-border);
      color: var(--ve-text-muted); font-size: 11px; line-height: 1.4;
    }
    .contextChip {
      display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px;
      border-radius: 999px; background: var(--ve-surface-sunken); color: var(--ve-text); font-size: 11px;
    }
    .contextChip.isWorkspace { background: var(--ve-primary-subtle); color: var(--ve-primary-text); font-weight: 600; }
    .contextMode { flex-basis: 100%; }
    .contextHint { font-size: 11px; }
    .entryBadge.isMuted { border-style: dashed; }
    .syncButton {
      display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 6px;
      border: 1px solid transparent; border-radius: var(--ve-radius-small); background: transparent;
      color: var(--ve-text-muted); font: inherit; font-size: 12px; font-weight: 600; cursor: not-allowed;
    }
    ve-row-menu.syncMenu { font-size: 12px; }

    .pendingNotice {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      border-bottom: 1px solid var(--ve-border); color: var(--ve-text-muted); font-size: 11px; line-height: 1.4;
    }
    .pendingNotice > span:nth-child(2) { flex: 1; min-width: 0; }
    .saveNow {
      flex: none; padding: 3px 8px; border: 1px solid var(--ve-input-border); border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised); color: var(--ve-primary-text); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .saveNow:hover { border-color: var(--ve-primary-text); background: var(--ve-primary-subtle); }
    .pendingDot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--ve-primary-text); }

    .collection { display: flex; flex-direction: column; gap: 8px; }
    .collection + .collection { padding-top: 14px; border-top: 1px solid var(--ve-border); }
    .collectionHeader { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; }
    .collectionHeader h3 { flex: 1; min-width: 0; margin: 0; font-size: 12px; font-weight: 600; }
    .count, .entryBadge {
      flex: none;
      padding: 0 6px;
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius-small);
      color: var(--ve-text-muted);
      font-size: 11px;
      font-weight: 400;
      line-height: 18px;
      font-variant-numeric: tabular-nums;
    }
    .minHint { color: var(--ve-text-muted); font-size: 11px; }

    .entryHead { display: none; }
    .entryList { list-style: none; margin: 0 -6px; padding: 0; }
    .entryItem {
      position: relative;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      grid-template-areas: "number main actions" ". note note";
      align-items: start;
      gap: 0 6px;
      padding: 4px 4px 4px 6px;
      border-radius: var(--ve-radius-small);
    }
    .entryItem + .entryItem { box-shadow: 0 -1px 0 var(--ve-border); }
    .entryItem:hover, .entryItem:focus-within { background: var(--ve-hover); box-shadow: none; }
    .entryItem:hover + .entryItem, .entryItem:focus-within + .entryItem { box-shadow: none; }
    /* The page row under the pointer: one small colour spot, nothing louder. */
    .entryItem.isMirrored::before {
      content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px;
      border-radius: 2px; background: var(--ve-primary-text);
    }
    .entryNumber {
      grid-area: number; padding-top: 6px;
      color: var(--ve-text-muted); text-align: end; font-size: 11px; font-variant-numeric: tabular-nums;
    }
    .entryMain { grid-area: main; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .entryTitle, .entryTitleLink, .entryTitleText {
      display: block; width: 100%; min-width: 0; min-height: 28px; margin: 0; padding: 4px 6px;
      border: 1px solid transparent; border-radius: var(--ve-radius-small);
      background: transparent; color: var(--ve-text);
      font: inherit; font-size: 13px; line-height: 18px; text-align: start; text-decoration: none;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Multi-line label (TCA type=text): one row at rest, growing with its
       lines where field-sizing is supported; elsewhere rows=1 scrolls and
       the editor can drag it taller. */
    .entryTitle.isMultiline {
      white-space: pre-wrap; overflow-wrap: anywhere; text-overflow: clip;
      overflow: auto; max-height: 160px; resize: vertical; field-sizing: content;
    }
    @supports (field-sizing: content) { .entryTitle.isMultiline { resize: none; } }
    .entryTitle::placeholder { color: var(--ve-text-muted); }
    .entryItem:hover .entryTitle { border-color: var(--ve-border); background: var(--ve-surface-raised); }
    .entryTitle:focus-visible {
      outline: none; border-color: var(--ve-focus); background: var(--ve-surface-raised); box-shadow: var(--ve-focus-ring);
    }
    .entryTitleLink { cursor: pointer; }
    .entryTitleLink:hover { color: var(--ve-primary-text); }
    .isHiddenEntry .entryTitle, .isHiddenEntry .entryTitleLink, .isDeleted .entryTitleText { color: var(--ve-text-muted); }
    .isDeleted .entryTitleText { text-decoration: line-through; text-decoration-color: var(--ve-border); }
    .entryMeta { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 6px 2px; }
    .entryMeta:empty { display: none; }
    .entryBadge { display: inline-flex; align-items: center; gap: 4px; }
    .entryBadge.isPending { border-color: transparent; padding-left: 0; }
    .entryBadge.isDeleted { border-style: dashed; }

    /* Row actions: quiet at rest, full on row hover/focus, always on touch. */
    .entryActions {
      grid-area: actions; display: flex; align-items: center; gap: 0; padding-top: 1px;
      opacity: .35; transition: opacity .12s ease;
    }
    .entryItem:hover .entryActions, .entryItem:focus-within .entryActions { opacity: 1; }
    @media (hover: none) { .entryActions { opacity: 1; } }
    .rowAction.iconButton {
      width: 26px; height: 26px; border: 1px solid transparent; background: transparent; color: var(--ve-text);
    }
    .rowAction.iconButton:hover:not([aria-disabled="true"]) { border-color: var(--ve-border); background: var(--ve-surface-raised); }
    .rowAction[aria-disabled="true"] { opacity: .4; cursor: not-allowed; }
    .rowAction[role="switch"][aria-checked="false"] { color: var(--ve-text-muted); }
    .rowAction ve-icon { display: inline-flex; }
    ve-row-menu.rowAction { color: var(--ve-text); }
    .entryHint, .actionReason, .entryReadOnly { grid-area: note; padding: 0 6px 4px; font-size: 11px; }
    /* A refused control explains itself while it has keyboard focus. */
    .actionReason { display: none; }
    .entryItem:has([aria-disabled="true"][aria-describedby]:focus-visible) .actionReason { display: flex; flex-direction: column; }

    .collectionFooter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .footerSpacer { flex: 1; }
    .addEntry {
      display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 10px;
      border: 1px solid var(--ve-input-border); border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised); color: var(--ve-text); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .addEntry:hover:not([aria-disabled="true"]) { background: var(--ve-primary-subtle); border-color: var(--ve-primary-text); }
    .addEntry[aria-disabled="true"] { opacity: .55; cursor: not-allowed; }
    .collectionHint, .collectionNotice { font-size: 11px; }
    .backendLink { color: var(--ve-primary-text); font-size: 11px; text-underline-offset: 3px; }
    .collectionShortcut {
      display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px;
      border: 1px solid var(--ve-border); border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised); color: var(--ve-text); font: inherit; text-align: start; cursor: pointer;
    }
    .collectionShortcut > span:first-of-type { flex: 1; }
    .collectionShortcut:hover { background: var(--ve-hover); }

    /* Focus lands on the dialog itself when it opens (see openFor()). */
    .popover:focus {
      outline: none;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--ve-border);
    }

    .heading {
      flex: 1;
      min-width: 0;
    }

    .elementName {
      display: block;
      overflow: hidden;
      color: var(--ve-text-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .closeButton,
    .iconButton,
    .treeToggle {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--ve-text);
      cursor: pointer;
    }

    .closeButton {
      width: 28px;
      height: 28px;
      border: 1px solid transparent;
      border-radius: var(--ve-radius-small);
      background: transparent;
      font-size: 18px;
      line-height: 1;
    }

    .closeButton:hover,
    .treeToggle:hover {
      background: var(--ve-hover);
    }

    :is(.closeButton, .iconButton, .treeToggle, .tab, .showAllButton, .colorChoose, .checkbox):focus-visible {
      outline: 2px solid var(--ve-focus);
      outline-offset: 1px;
    }

    /* the backend form's tabs as nav-tabs */
    .tabBar {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 2px;
      padding: 0 10px;
      border-bottom: 1px solid var(--ve-border);
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-bottom: -1px;
      padding: 8px 10px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: var(--ve-text-muted);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }

    .tab:hover {
      color: var(--ve-text);
    }

    .tab.isActive {
      color: var(--ve-text);
      border-bottom-color: var(--ve-primary-text);
    }

    .tab:focus-visible {
      outline-offset: -2px;
    }

    .tabDirtyDot,
    .dirtyDot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ve-primary-text);
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
      padding: 10px 12px;
    }

    .status {
      margin: 0;
      color: var(--ve-text-muted);
    }

    .status.isError {
      color: var(--ve-danger);
    }

    .groupLabel {
      margin: 6px 0 -6px;
      padding-top: 8px;
      border-top: 1px solid var(--ve-border);
      color: var(--ve-text-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .groupLabel:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .fieldLabel {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
    }

    /* backend form controls: raised surface, input border, focus ring */
    .select,
    .linkValue,
    .iconButton,
    .colorInput,
    .colorChoose {
      border: 1px solid var(--ve-input-border);
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised);
      color: var(--ve-text);
    }

    .select {
      width: 100%;
      padding: 6px 8px;
      font: inherit;
    }

    .select:focus-visible,
    .colorInput:focus-visible {
      outline: none;
      border-color: var(--ve-focus);
      box-shadow: var(--ve-focus-ring);
    }

    .linkRow,
    .colorRow {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .linkValue {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      padding: 6px 8px;
      background: var(--ve-surface-sunken);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .linkValue.isEmpty {
      background: var(--ve-surface-raised);
      color: var(--ve-text-muted);
      font-family: inherit;
    }

    .iconButton {
      width: 28px;
      height: 28px;
    }

    .iconButton:hover,
    .colorChoose:hover {
      background: var(--ve-hover);
    }

    .checkRow {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      padding: 4px 0;
      cursor: pointer;
    }

    .colorInput {
      flex: none;
      width: 34px;
      height: 28px;
      padding: 2px;
      cursor: pointer;
    }

    /* Kept in the DOM (not display:none) so .click() reliably opens the
       native picker, anchored near the row; invisible and skipped by focus
       order and screen readers. */
    .colorInput.isHidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      padding: 0;
      border: 0;
      clip-path: inset(50%);
      opacity: 0;
      pointer-events: none;
    }

    .colorSwatch {
      flex: none;
      width: 34px;
      height: 28px;
      border: 1px dashed var(--ve-input-border);
      border-radius: var(--ve-radius-small);
    }

    .colorNone {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: var(--ve-text-muted);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .colorValue {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .colorChoose {
      flex: none;
      padding: 5px 10px;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .categoryList {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 280px;
      overflow: auto;
      padding: 4px 6px;
      border: 1px solid var(--ve-border);
      border-radius: var(--ve-radius-small);
      background: var(--ve-surface-raised);
    }

    .treeRow {
      display: flex;
      align-items: center;
      gap: 1px;
    }

    .treeToggle {
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 4px;
      background: transparent;
    }

    .treeToggle svg {
      transition: transform 0.12s ease;
    }

    .treeToggle.isOpen svg {
      transform: rotate(90deg);
    }

    .treeSpacer {
      flex: none;
      width: 18px;
    }

    .treeChildren {
      margin-left: 8px;
      padding-left: 8px;
      border-left: 1px solid var(--ve-border);
    }

    .categoryItem {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 7px;
      min-width: 0;
      padding: 3px 6px;
      border-radius: 4px;
      cursor: pointer;
    }

    .categoryItem:hover {
      background: var(--ve-hover);
    }

    .categoryItem.isStructure {
      cursor: default;
      color: var(--ve-text-muted);
    }

    .categoryItem.isStructure:hover {
      background: none;
    }

    .checkbox {
      flex: none;
      margin: 0;
      accent-color: var(--ve-primary);
    }

    .categoryLabel {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truncatedNote {
      padding: 0 6px;
      color: var(--ve-text-muted);
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 12px;
      border-top: 1px solid var(--ve-border);
      color: var(--ve-text-muted);
      font-size: 11px;
    }

    .footerHint {
      min-width: 0;
    }

    .showAllButton {
      flex: none;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: none;
      color: var(--ve-primary-text);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .showAllButton:hover {
      text-decoration: underline;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }


    /* Tray: the rows become a compact table (# · title · state · actions),
       the same DOM in a wider grid; narrow trays keep the stacked rows. */
    @container entries (min-width: 640px) {
      .isTray .entryHead, .isTray .entryItem {
        grid-template-columns: 24px minmax(12em, 28em) minmax(8em, 1fr) auto;
        grid-template-areas: "number title state actions" ". note note note";
      }
      .isTray .entryHead {
        display: grid; gap: 0 10px; padding: 0 4px 4px 6px;
        border-bottom: 1px solid var(--ve-border);
        color: var(--ve-text-muted); font-size: 11px; font-weight: 600;
      }
      .isTray .entryHead > span:first-child { text-align: end; }
      .isTray .entryItem { gap: 0 10px; align-items: center; }
      .isTray .entryNumber { padding-top: 0; }
      .isTray .entryMain { display: contents; }
      .isTray .entryTitle, .isTray .entryTitleLink, .isTray .entryTitleText { grid-area: title; }
      .isTray .entryMeta { grid-area: state; padding: 0; }
      .isTray .entryMeta:empty { display: block; }
      .isTray .collection { gap: 6px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .treeToggle svg, .entryActions { transition: none; }
    }
`];
