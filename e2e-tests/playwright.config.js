import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateRequiredEnv } from './utils/env-validator.js';

// Load environment variables:
// 1. Root .env for base config (DB_NAME, AWS settings, etc.)
// 2. Root .env.secrets for secrets (JWT_SECRET, MCP_API_KEY)
// 3. Local e2e-tests/.env for test-specific overrides (DB_HOST=localhost, WEB_BASE_URL)
// 4. Local e2e-tests/.env.secrets for test credentials (DB_USER, DB_PASSWORD)
// Local files use override:true so e2e-tests/.env (DB_HOST=localhost) wins over
// root .env (DB_HOST=echobase-devlocal-durable-mariadb). In CI, environment
// variables set via docker -e flags still take precedence over all file values.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env.secrets'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true, quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env.secrets'), override: true, quiet: true });

validateRequiredEnv(['WEB_BASE_URL'], 'Playwright configuration');

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
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }]] : []),
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Base URL for frontend tests
    baseURL: process.env.WEB_BASE_URL,

    // Note: Origin header is set automatically by the browser for POST requests
    // For API tests, ApiHelper explicitly sets Origin header
    // Removed extraHTTPHeaders Origin to avoid conflicts with browser's natural Origin

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
