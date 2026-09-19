import {defineConfig, devices} from '@playwright/test';

/**
 * The suite drives a running TYPO3 backend, so it is deliberately serial and
 * patient: a cold TYPO3 bootstrap behind DDEV easily needs a minute, and the
 * Visual Editor renders the frontend in a doubly nested iframe on top of that.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 300000,
  expect: {timeout: 30000},
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.VEE_BASE_URL ?? 'https://webconsulting-typo3-lab.ddev.site',
    ignoreHTTPSErrors: true,
    viewport: {width: 1700, height: 1000},
    actionTimeout: 120000,
    navigationTimeout: 240000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
