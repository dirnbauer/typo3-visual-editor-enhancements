# End-to-end tests

These specs drive a **running** TYPO3 installation with this extension, the
Visual Editor and a catalog provider (an extension answering
`?elementLibrary=1`, `?elementLibrarySearch=` and `?elPreview`) installed. They
are not part of `composer ci` and not run in GitHub Actions — there is no
TYPO3 instance there.

## Environment

| Variable               | Default                                       | Meaning |
|------------------------|-----------------------------------------------|---------|
| `VEE_BASE_URL`         | `https://webconsulting-typo3-lab.ddev.site`   | Origin of the installation, no trailing slash. |
| `VEE_BACKEND_USER`     | `admin`                                       | Backend user with access to the Visual Editor module. |
| `VEE_BACKEND_PASSWORD` | *(empty — must be set)*                       | That user's password. |
| `VEE_PAGE_ID`          | `666`                                         | A `doktype=1` page that renders content elements, at least one rich-text and one plain-text editable. |
| `VEE_RTE_PAGE_ID`      | `VEE_PAGE_ID`                                 | The page for the rich-text toolbar specs (tagged `@rte`). Best one with rich-text editables side by side, cards in a row; in the lab that is `505`. |
| `VEE_SEARCH_TERM`      | `hero`                                        | A term the catalog provider is expected to match. |
| `VEE_SEARCH_TYPO`      | `heor`                                        | A misspelling of it that should yield a suggestion or a did-you-mean. |

## Run

From the package root:

```bash
VEE_BACKEND_PASSWORD='…' composer test:e2e
```

`composer test:e2e` installs Playwright into the package root's
`node_modules/` (`--no-save`, the version from `Tests/E2E/package.json`),
fetches Chromium and runs `playwright test --config Tests/E2E`. Run only the
toolbar specs with `node_modules/.bin/playwright test --config Tests/E2E
--grep @rte`.

Playwright has to load **this directory's config**: it defines the `setup`
project that signs in. Started without it - `npx playwright test` in the
package root - every spec meets the login form; the specs now say so at once
instead of timing out.

## What is covered

- the configuration `EditModeEnhancementsMiddleware` inlines into the edit frame
- the element library FAB opening and closing the panel, with keyword chips on
  the cards
- the server-ranked search (`?elementLibrarySearch=`), including suggestions
  and did-you-mean for a misspelled term
- lazily loaded previews over the cached `?elPreview` route
- the field chooser: injected button, `?veFieldOptions` answering with `select`
  **and** `category` fields, popover rendering controls
- the rich-text toolbar - CKEditor's InlineEditor balloon panel - staying
  inside the viewport with every button clickable: at the top edge, at the
  bottom edge (stays above), for the right-hand editable of a row, and for a
  long text scrolled past its top (pinned to the top of the viewport)
- plain-text editables being rendered as editable outputs

## Notes

- The suite signs in **once**, in the `setup` project (`auth.setup.js`), and
  stores the session under `support/.auth/`; the specs reuse it. A TYPO3
  bootstrap per test would dominate the runtime otherwise.
- The frontend lives in a **doubly nested iframe** (module shell → module
  content → frontend `?editMode=1`); `support/backend.js` resolves that frame.
- Most enhancement markup lives in shadow roots, so the specs reach into them
  with `frame.evaluate` instead of CSS selectors.
- The backend login form moves the password into a hidden field from its own
  JavaScript; `login()` waits for that script and retries, because submitting
  too early posts an empty password.
- The library panel renders either a thumbnail grid (`.card`, one preview
  iframe each) or a compact list (`.lrow`, one shared docked preview),
  depending on the user's `tx_visualeditor_panelColumns`. The specs cover both
  and hover the first entry so a preview loads in either mode.
