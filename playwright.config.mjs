// Browser tests: the journeys in tests/QA-CHECKLIST.md, run in Chromium.
//   npm run test:browser                 all projects
//   npx playwright test --project=phone  one project
// `desktop` and `phone` use dist/ as it is in the repository. `release` stamps a
// copy like the Pages deployment and serves it under the GitHub project path.
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

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
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testIgnore: /(phone|release)\.spec\.mjs$/,
    },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /phone\.spec\.mjs$/ },
    {
      name: 'release',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174/pdf.qft.org/' },
      testMatch: /release\.spec\.mjs$/,
    },
  ],
});
