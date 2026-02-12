/**
 * Data Access Layer (DAL)
 * Centralized database queries used across backend services.
 * Replaces scattered raw SQL with reusable, tested functions.
 */

/**
 * Find a user by ID
 * @param {object} db - Database pool
 * @param {number} userId - User ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserById(db, userId) {
  const [rows] = await db.execute(
    'SELECT id, username, email, full_name, password_hash FROM users WHERE id = ?',
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a user by username
 * @param {object} db - Database pool
 * @param {number} username - Username
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByUsername(db, username) {
  const [rows] = await db.execute(
    'SELECT id, username, email, full_name, password_hash FROM users WHERE username = ?',
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Check if a user exists by username or email
 * @param {object} db - Database pool
 * @param {string} username
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function userExists(db, username, email) {
  const [rows] = await db.execute(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    [username, email]
  );
  return rows.length > 0;
}

/**
 * Find a product by ID
 * @param {object} db - Database pool
 * @param {number} productId - Product ID
 * @returns {Promise<object|null>} Product object or null
 */
async function getProductById(db, productId) {
  const [rows] = await db.execute(
    'SELECT id, name, cost, sku FROM products WHERE id = ?',
    [productId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all products
 * @param {object} db - Database pool
 * @returns {Promise<Array>} Array of product objects
 */
async function getAllProducts(db) {
  const [rows] = await db.execute('SELECT id, name, cost, sku FROM products ORDER BY name');
  return rows;
}

/**
 * Get orders for a user
 * @param {object} db - Database pool
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of order objects
 */
async function getOrdersByUserId(db, userId) {
  const [rows] = await db.execute(
    `SELECT id, product_name as productName, sku, quantity,
            total_price as totalPrice, order_status as status, created_at as createdAt
     FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

module.exports = {
  getUserById,
  getUserByUsername,
  userExists,
  getProductById,
  getAllProducts,
  getOrdersByUserId,
};
