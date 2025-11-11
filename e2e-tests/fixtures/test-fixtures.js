import { test as base } from '@playwright/test';
import DatabaseHelper from '../utils/db-helper.js';
import ApiHelper from '../utils/api-helper.js';

/**
 * Custom Playwright fixtures for e2e tests
 *
 * Usage:
 *   import { test } from '../fixtures/test-fixtures.js';
 *
 * Available fixtures:
 *   - dbHelper: Automatically connects and disconnects from database
 *   - apiHelper: Provides API interaction methods
 *   - testUsers: Array to track test users for automatic cleanup
 */
export const test = base.extend({
  /**
   * Database helper fixture
   * Automatically connects before each test and disconnects after
   */
  dbHelper: async ({}, use) => {
    const helper = new DatabaseHelper();
    await helper.connect();
    await use(helper);
    await helper.disconnect();
  },

  /**
   * API helper fixture
   * Provides methods for interacting with the API
   */
  apiHelper: async ({}, use) => {
    const helper = new ApiHelper();
    await use(helper);
  },

  /**
   * Test users fixture
   * Automatically cleans up test users after each test
   */
  testUsers: async ({ dbHelper }, use) => {
    const users = [];

    // Provide the users array to the test
    await use(users);

    // Cleanup: Delete all test users and their orders
    for (const user of users) {
      try {
        if (user.username) {
          await dbHelper.deleteUserByUsername(user.username);
        }
      } catch (e) {
        console.error(`Cleanup error for user ${user.username}:`, e.message);
      }
    }
  },
});

export { expect } from '@playwright/test';
