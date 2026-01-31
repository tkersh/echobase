import { createValidUser, createValidOrder } from '../utils/test-data.js';
import { TEST_CONFIG } from '../config/test-config.js';

/**
 * Helper functions for common test workflows
 * These reduce code duplication across test files
 */

/**
 * Register a new user and verify in database
 * @param {ApiHelper} apiHelper - API helper instance
 * @param {DatabaseHelper} dbHelper - Database helper instance
 * @param {Array} testUsers - Array to track users for cleanup
 * @param {Object} userData - Optional user data (will create if not provided)
 * @returns {Promise<{userData, regResponse, dbUser}>}
 */
export async function registerUser(apiHelper, dbHelper, testUsers, userData = null) {
  const user = userData || createValidUser();
  testUsers.push(user);

  const regResponse = await apiHelper.register(user);
  const dbUser = await dbHelper.getUserByUsername(user.username);

  return { userData: user, regResponse, dbUser };
}

/**
 * Register and login a user, returning auth token
 * @param {ApiHelper} apiHelper - API helper instance
 * @param {DatabaseHelper} dbHelper - Database helper instance
 * @param {Array} testUsers - Array to track users for cleanup
 * @param {Object} userData - Optional user data (will create if not provided)
 * @returns {Promise<{userData, dbUser, loginResponse, token}>}
 */
export async function registerAndLoginUser(apiHelper, dbHelper, testUsers, userData = null) {
  const { userData: user, dbUser } = await registerUser(apiHelper, dbHelper, testUsers, userData);

  // Clear any existing token before login
  apiHelper.clearToken();

  const loginResponse = await apiHelper.login({
    username: user.username,
    password: user.password,
  });

  return {
    userData: user,
    dbUser,
    loginResponse,
    token: apiHelper.token,
  };
}

/**
 * Submit an order and wait for it to be processed
 * @param {ApiHelper} apiHelper - API helper instance
 * @param {DatabaseHelper} dbHelper - Database helper instance
 * @param {number} userId - User ID from database
 * @param {Object} orderData - Optional order data (will create if not provided)
 * @param {number} timeout - Wait timeout in ms
 * @returns {Promise<{orderData, submitResponse, dbOrder}>}
 */
export async function submitAndWaitForOrder(
  apiHelper,
  dbHelper,
  userId,
  orderData = null,
  timeout = TEST_CONFIG.TIMEOUTS.ORDER_PROCESSING
) {
  const order = orderData || createValidOrder();
  const submitResponse = await apiHelper.submitOrder(order);

  const dbOrder = await dbHelper.waitForOrder(
    userId,
    timeout,
    TEST_CONFIG.TIMEOUTS.CHECK_INTERVAL
  );

  return { orderData: order, submitResponse, dbOrder };
}

/**
 * Verify that order data matches what was submitted
 * @param {Object} dbOrder - Order from database
 * @param {Object} orderData - Original order data submitted
 */
export function verifyOrderMatches(dbOrder, orderData) {
  if (!dbOrder) {
    throw new Error('Order not found in database');
  }

  // Compare product ID
  if (orderData.productId != null && parseInt(dbOrder.product_id) !== parseInt(orderData.productId)) {
    throw new Error(
      `Product ID mismatch: expected ${orderData.productId} but got ${dbOrder.product_id}`
    );
  }

  // Compare quantity
  if (parseFloat(dbOrder.quantity) !== parseFloat(orderData.quantity)) {
    throw new Error(
      `Quantity mismatch: expected ${orderData.quantity} but got ${dbOrder.quantity}`
    );
  }
}

/**
 * Login via UI (for frontend tests)
 * @param {Page} page - Playwright page instance
 * @param {Object} credentials - {username, password}
 */
export async function loginViaUI(page, credentials) {
  await page.fill('input[name="username"]', credentials.username);
  await page.fill('input[name="password"]', credentials.password);
  await page.click('button[type="submit"]');
}

/**
 * Submit order via UI (for frontend tests)
 * @param {Page} page - Playwright page instance
 * @param {Object} orderData - {productId, quantity}
 */
export async function submitOrderViaUI(page, orderData) {
  await page.selectOption('select[name="productName"]', String(orderData.productId));
  await page.fill('input[name="quantity"]', orderData.quantity.toString());
  await page.click('button[type="submit"]');
}

/**
 * Purge SQS queue to ensure clean state
 * @returns {Promise<void>}
 */
export async function purgeSQSQueue() {
  const { execSync } = await import('child_process');

  try {
    execSync(
      `docker exec ${TEST_CONFIG.LOCALSTACK_CONTAINER_NAME} ` +
        `awslocal sqs purge-queue --queue-url ${TEST_CONFIG.SQS_QUEUE_URL}`,
      { stdio: 'ignore' }
    );
  } catch (e) {
    console.warn('Warning: Could not purge SQS queue:', e.message);
  }
}
