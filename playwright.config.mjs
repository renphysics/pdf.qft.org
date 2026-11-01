// Browser tests: the journeys in tests/QA-CHECKLIST.md, in Chromium, WebKit
// (Safari's engine) and Firefox.
//   npm run test:browser                          every browser installed here
//   BROWSERS=webkit npm run test:browser          one browser (CI runs each in its own job)
//   npx playwright test --project=phone-webkit    one project
// `desktop` and `phone` use dist/ as it is in the repository. `release` stamps a
// copy like the Pages deployment and serves it under the GitHub project path.
// Locally, WebKit and Firefox run once installed (npx playwright install webkit
// firefox); in CI a missing browser is an error.
import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices, firefox, webkit } from '@playwright/test';

const CI = Boolean(process.env.CI);
const engines = { chromium, webkit, firefox };
const chosen = process.env.BROWSERS ? process.env.BROWSERS.split(',').map((name) => name.trim()) : Object.keys(engines);
const runs = (engine) => chosen.includes(engine) && (CI || engine === 'chromium' || existsSync(engines[engine].executablePath()));
if (!process.env.TEST_WORKER_INDEX) {
  const skipped = chosen.filter((engine) => !runs(engine));
  if (skipped.length) console.log(`Not installed here, so not tested: ${skipped.join(', ')}.`);
}

const desktop = { viewport: { width: 1280, height: 900 } };
const notDesktop = /(phone|release)\.spec\.mjs$/;
const phoneOnly = /phone\.spec\.mjs$/;

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: 'tests/output/playwright',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'tests/output/playwright-report' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node scripts/serve.mjs dist 4173', url: 'http://127.0.0.1:4173/', reuseExistingServer: !CI },
    {
      command: 'node scripts/serve.mjs dist 4174 /pdf.qft.org/ --release',
      url: 'http://127.0.0.1:4174/pdf.qft.org/',
      reuseExistingServer: !CI,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...desktop }, testIgnore: notDesktop },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: phoneOnly },
    {
      name: 'release',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174/pdf.qft.org/' },
      testMatch: /release\.spec\.mjs$/,
    },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], ...desktop }, testIgnore: notDesktop },
    // An iPhone in Safari's engine. (Firefox has no mobile emulation.)
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] }, testMatch: phoneOnly },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], ...desktop }, testIgnore: notDesktop },
  ].filter((project) => runs(project.use.browserName || project.use.defaultBrowserType)),
});
