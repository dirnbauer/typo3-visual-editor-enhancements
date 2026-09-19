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

## Run

```bash
cd Tests/E2E
npm install
npx playwright install chromium
VEE_BACKEND_PASSWORD='…' npx playwright test
```

## What is covered

- the configuration `EditModeEnhancementsMiddleware` inlines into the edit frame
- the element library FAB opening and closing the panel, with keyword chips on
  the cards
- the server-ranked search (`?elementLibrarySearch=`), including suggestions
  and did-you-mean for a misspelled term
- lazily loaded previews over the cached `?elPreview` route
- the field chooser: injected button, `?veFieldOptions` answering with `select`
  **and** `category` fields, popover rendering controls
- the rich-text toolbar staying visible when the editable sits at the top of
  the viewport
- plain-text editables being rendered as editable outputs

## Notes

- The frontend lives in a **doubly nested iframe** (module shell → module
  content → frontend `?editMode=1`); `support/backend.js` resolves that frame.
- Most enhancement markup lives in shadow roots, so the specs reach into them
  with `frame.evaluate` instead of CSS selectors.
- The backend login form moves the password into a hidden field from its own
  JavaScript; `login()` waits for that script and retries, because submitting
  too early posts an empty password.
