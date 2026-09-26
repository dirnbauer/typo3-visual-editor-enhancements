/**
 * Signs in once and stores the backend session, so the specs themselves never
 * pay for a TYPO3 login again. Playwright runs this as the `setup` project
 * that every other project depends on.
 */
import {test as setup} from '@playwright/test';

import {AUTH_STATE, config, login} from './support/backend.js';

setup('authenticate', async ({page}) => {
  // Failing here stops the run with one clear message; skipping would let
  // every spec run without a session and time out on the login form.
  if (config.password === '') {
    throw new Error('VEE_BACKEND_PASSWORD is not set - the suite cannot sign in to the TYPO3 backend');
  }
  await login(page);
  await page.context().storageState({path: AUTH_STATE});
});
