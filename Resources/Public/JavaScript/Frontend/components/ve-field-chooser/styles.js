import {css} from 'lit';

/** Styles of <ve-field-chooser>; kept apart so the component file stays readable. */
export const styles = css`
    :host {
      --ve-chooser-accent: var(--ve-accent-color, #7c5ac4);
      font-family: var(--typo3-font-family-sans, system-ui, -apple-system, sans-serif);
    }

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
      background: #fff;
      color: #1a1a20;
      border: 1px solid color-mix(in srgb, var(--ve-chooser-accent) 32%, #e3e3e8);
      border-radius: var(--typo3-component-border-radius, 0.75em);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28), 0 0 0 1px color-mix(in srgb, var(--ve-chooser-accent) 12%, transparent);
      font-size: 13px;
      line-height: 1.4;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #ececf1;
    }

    .heading {
      flex: 1;
      min-width: 0;
    }

    .elementName {
      display: block;
      overflow: hidden;
      font-size: 11px;
      font-weight: 600;
      color: color-mix(in srgb, var(--ve-chooser-accent) 70%, #55555f);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }

    .closeButton {
      flex: none;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #55555f;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }

    .closeButton:hover {
      background: #f0f0f4;
      color: #1a1a20;
    }

    .closeButton:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--ve-chooser-accent);
    }

    .tabBar {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 2px;
      padding: 0 10px;
      border-bottom: 1px solid #ececf1;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 8px 10px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: #55555f;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }

    .tab.isActive {
      color: var(--ve-chooser-accent);
      border-bottom-color: var(--ve-chooser-accent);
    }

    .tab:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: -2px;
    }

    .tabDirtyDot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ve-chooser-accent);
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
      color: #55555f;
    }

    .status.isError {
      color: #b3261e;
    }

    .groupLabel {
      margin: 6px 0 -6px;
      padding-top: 8px;
      border-top: 1px solid #ececf1;
      color: #8a8a94;
      font-size: 11px;
      font-weight: 700;
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
      color: #33333c;
    }

    .dirtyDot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ve-chooser-accent);
    }

    .select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: inherit;
      font: inherit;
    }

    .select:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
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
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fafafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .linkValue.isEmpty {
      background: #fff;
      color: #8a8a94;
      font-family: inherit;
    }

    .iconButton {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: #55555f;
      cursor: pointer;
    }

    .iconButton:hover {
      border-color: var(--ve-chooser-accent);
      background: color-mix(in srgb, var(--ve-chooser-accent) 8%, #fff);
      color: var(--ve-chooser-accent);
    }

    .iconButton:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
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
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }

    .colorInput:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
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
      border: 1px dashed #b9b9c4;
      border-radius: 6px;
      background: #fff;
    }

    .colorNone {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: #8a8a94;
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
      border: 1px solid #d4d4dc;
      border-radius: 6px;
      background: #fff;
      color: #33333c;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .colorChoose:hover {
      border-color: var(--ve-chooser-accent);
      color: var(--ve-chooser-accent);
    }

    .colorChoose:focus-visible {
      outline: none;
      border-color: var(--ve-chooser-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ve-chooser-accent) 35%, transparent);
    }

    .categoryList {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 280px;
      overflow: auto;
      padding: 4px 6px;
      border: 1px solid #ececf1;
      border-radius: 6px;
    }

    .treeRow {
      display: flex;
      align-items: center;
      gap: 1px;
    }

    .treeToggle {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #55555f;
      cursor: pointer;
    }

    .treeToggle svg {
      transition: transform 0.12s ease;
    }

    .treeToggle.isOpen svg {
      transform: rotate(90deg);
    }

    .treeToggle:hover {
      background: #f0f0f4;
      color: #1a1a20;
    }

    .treeToggle:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 1px;
    }

    .treeSpacer {
      flex: none;
      width: 18px;
    }

    .treeChildren {
      margin-left: 8px;
      padding-left: 8px;
      border-left: 1px solid #e3e3e8;
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
      background: color-mix(in srgb, var(--ve-chooser-accent) 8%, #fff);
    }

    .checkbox {
      flex: none;
      margin: 0;
      accent-color: var(--ve-chooser-accent);
    }

    .checkbox:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 1px;
    }

    .categoryLabel {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truncatedNote {
      padding: 0 6px;
      color: #8a8a94;
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 12px;
      border-top: 1px solid #ececf1;
      color: #6d6d78;
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
      color: var(--ve-chooser-accent);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .showAllButton:hover {
      text-decoration: underline;
    }

    .showAllButton:focus-visible {
      outline: 2px solid var(--ve-chooser-accent);
      outline-offset: 2px;
    }
`;
