import {defineConfig, devices} from '@playwright/test';

import {AUTH_STATE} from './support/backend.js';

/**
 * The suite drives a running TYPO3 backend, so it is deliberately serial and
 * patient: a cold TYPO3 bootstrap behind DDEV easily needs a minute, and the
 * Visual Editor renders the frontend in a doubly nested iframe on top of that.
 */
const shared = {
  ...devices['Desktop Chrome'],
  baseURL: process.env.VEE_BASE_URL ?? 'https://webconsulting-typo3-lab.ddev.site',
  ignoreHTTPSErrors: true,
  viewport: {width: 1700, height: 1000},
  actionTimeout: 120000,
  navigationTimeout: 240000,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
};

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 300000,
  expect: {timeout: 30000},
  reporter: [['list']],
  projects: [
    // Signing in once costs one TYPO3 bootstrap instead of one per test.
    {name: 'setup', testMatch: /auth\.setup\.js$/, use: shared},
    {
      name: 'enhancements',
      testMatch: /.*\.spec\.js$/,
      dependencies: ['setup'],
      use: {...shared, storageState: AUTH_STATE},
    },
  ],
});
