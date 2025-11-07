import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from project root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
// Load e2e-tests specific overrides (e.g., DB_HOST=localhost for host machine)
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true, quiet: true });

/**
 * Playwright configuration for Echobase E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: false, // Run tests serially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid race conditions

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Base URL for frontend tests
    baseURL: process.env.BASE_URL || 'https://localhost:3443',

    // Collect trace on failure
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Ignore HTTPS errors (self-signed certificates in dev)
    ignoreHTTPSErrors: true,
  },

  // Configure projects for different test types
  projects: [
    {
      name: 'API Tests',
      testMatch: /.*\.api\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Frontend Tests',
      testMatch: /.*\.frontend\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Integration Tests',
      testMatch: /.*\.integration\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Security Tests',
      testMatch: /.*\.security\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web server configuration (optional - assumes services are already running)
  // Uncomment if you want Playwright to start services automatically
  // webServer: {
  //   command: 'docker-compose up',
  //   port: 3443,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
