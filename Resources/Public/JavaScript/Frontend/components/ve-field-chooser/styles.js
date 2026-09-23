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

    @media (prefers-reduced-motion: reduce) {
      .treeToggle svg { transition: none; }
    }
`];
