/**
 * Shared helpers for the end-to-end specs: signing in to the TYPO3 backend and
 * reaching the Visual Editor edit frame.
 *
 * The frontend of the Visual Editor module lives in a doubly nested iframe
 * (module shell -> module content -> frontend `?editMode=1`), so every
 * assertion below works on a Frame, never on the page.
 */
import {fileURLToPath} from 'node:url';

import {expect} from '@playwright/test';

/**
 * Where auth.setup.js stores the backend session for every other project.
 * Absolute, so it does not depend on the directory Playwright was started in.
 */
export const AUTH_STATE = fileURLToPath(new URL('./.auth/backend.json', import.meta.url));

export const config = {
  baseUrl: process.env.VEE_BASE_URL ?? 'https://webconsulting-typo3-lab.ddev.site',
  user: process.env.VEE_BACKEND_USER ?? 'admin',
  password: process.env.VEE_BACKEND_PASSWORD ?? '',
  pageId: Number(process.env.VEE_PAGE_ID ?? 666),
  // A term the catalog provider is expected to match, and a misspelling of it
  // that it is expected to answer with a suggestion or a did-you-mean. Both
  // depend on the site's own element inventory, hence the override.
  searchTerm: process.env.VEE_SEARCH_TERM ?? 'hero',
  searchTypo: process.env.VEE_SEARCH_TYPO ?? 'heor',
};

/**
 * Signs in through the classic login provider.
 *
 * The login form moves the typed password into a hidden field from its own
 * JavaScript. Submitting before that script has run posts an empty password,
 * so the form is only submitted once the script is in place, and a failed
 * attempt is retried instead of failing the whole run.
 *
 * A retry can find the session already established - the previous attempt only
 * looked failed because a loaded installation answered slowly - in which case
 * `/typo3/login` redirects straight to the backend and there is no form left
 * to fill. That counts as success, not as a missing selector.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(config.baseUrl + '/typo3/login?loginProvider=1433416747', {waitUntil: 'load'});

    // Either the login form renders, or the session is already valid and TYPO3
    // redirects to the backend. Racing the two is the only reliable way to
    // tell: the redirect can still be in flight when the first document
    // finishes loading, so neither the URL nor readyState settles it.
    if (await isSignedIn(page)) {
      return;
    }

    await page.fill('#t3-username', config.user);
    await page.fill('#t3-password', config.password);
    await expect(page.locator('#t3-password')).toHaveValue(config.password);
    await page.click('#t3-login-submit', {noWaitAfter: true});

    if (await isSignedIn(page, 180000)) {
      return;
    }
  }
  throw new Error('backend login failed after 3 attempts - check VEE_BACKEND_USER / VEE_BACKEND_PASSWORD');
}

/**
 * Resolves true as soon as the backend module menu is on screen, false as soon
 * as the login form is (or when neither shows up within the timeout).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout
 * @return {Promise<boolean>}
 */
async function isSignedIn(page, timeout = 60000) {
  const backend = page.locator('[data-modulemenu-identifier], typo3-backend-module-menu').first();
  const loginForm = page.locator('#t3-username');
  try {
    await Promise.race([
      backend.waitFor({state: 'attached', timeout}),
      loginForm.waitFor({state: 'attached', timeout}),
    ]);
  } catch {
    return false;
  }

  return await backend.count() > 0;
}

/**
 * Opens the Visual Editor module on the configured page and returns the
 * innermost frame, the one that renders the frontend in edit mode.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<import('@playwright/test').Frame>}
 */
export async function openEditFrame(page) {
  await page.goto(`${config.baseUrl}/typo3/module/web/edit?id=${config.pageId}`, {waitUntil: 'domcontentloaded'});
  let frame = null;
  for (let i = 0; i < 90 && frame === null; i++) {
    await page.waitForTimeout(2000);
    frame = page.frames().find((candidate) => candidate.url().includes('editMode=1')) ?? null;
  }
  if (frame === null) {
    throw new Error('the Visual Editor edit frame never appeared; frames: ' + page.frames().map((f) => f.url()).join(' | '));
  }
  // The frontend entry module boots the enhancements asynchronously.
  await frame.waitForFunction(() => window.visualEditorEnhancements !== undefined, undefined, {timeout: 60000});
  await page.waitForTimeout(4000);

  return frame;
}

/**
 * The configuration EditModeEnhancementsMiddleware inlined for this request.
 *
 * @param {import('@playwright/test').Frame} frame
 * @return {Promise<Record<string, unknown>>}
 */
export function enhancementConfig(frame) {
  return frame.evaluate(() => window.visualEditorEnhancements ?? {});
}
