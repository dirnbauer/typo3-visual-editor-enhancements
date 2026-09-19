/**
 * Signs in once and stores the backend session, so the specs themselves never
 * pay for a TYPO3 login again. Playwright runs this as the `setup` project
 * that every other project depends on.
 */
import {test as setup} from '@playwright/test';

import {AUTH_STATE, config, login} from './support/backend.js';

setup('authenticate', async ({page}) => {
  setup.skip(config.password === '', 'VEE_BACKEND_PASSWORD is not set');
  await login(page);
  await page.context().storageState({path: AUTH_STATE});
});
