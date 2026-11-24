import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4180',
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: !process.env.CI,
  },
});
