import mysql from 'mysql2/promise';

/**
 * Database helper for E2E test verification
 * Provides utilities to interact with MariaDB for test assertions
 */
class DatabaseHelper {
  constructor() {
    this.connection = null;
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'app_user',
      password: process.env.DB_PASSWORD || '',  // No default - must be provided
      database: process.env.DB_NAME || 'orders_db'
    };
  }

  /**
   * Connect to the database
   */
  async connect() {
    if (!this.connection) {
      this.connection = await mysql.createConnection(this.config);
    }
    return this.connection;
  }

  /**
   * Close the database connection
   */
  async disconnect() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * Get a user by username
   */
  async getUserByUsername(username) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows[0] || null;
  }

  /**
   * Get a user by email
   */
  async getUserByEmail(email) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0] || null;
  }

  /**
   * Get a user by ID
   */
  async getUserById(userId) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Get all orders for a user
   */
  async getOrdersByUserId(userId) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  /**
   * Get the most recent order for a user
   */
  async getLatestOrderByUserId(userId) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId) {
    const conn = await this.connect();
    const [rows] = await conn.execute(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );
    return rows[0] || null;
  }

  /**
   * Count total users
   */
  async getUserCount() {
    const conn = await this.connect();
    const [rows] = await conn.execute('SELECT COUNT(*) as count FROM users');
    return rows[0].count;
  }

  /**
   * Count total orders
   */
  async getOrderCount() {
    const conn = await this.connect();
    const [rows] = await conn.execute('SELECT COUNT(*) as count FROM orders');
    return rows[0].count;
  }

  /**
   * Delete a user by username (for cleanup)
   */
  async deleteUserByUsername(username) {
    const conn = await this.connect();
    const [result] = await conn.execute(
      'DELETE FROM users WHERE username = ?',
      [username]
    );
    return result.affectedRows;
  }

  /**
   * Delete all orders for a user (for cleanup)
   */
  async deleteOrdersByUserId(userId) {
    const conn = await this.connect();
    const [result] = await conn.execute(
      'DELETE FROM orders WHERE user_id = ?',
      [userId]
    );
    return result.affectedRows;
  }

  /**
   * Wait for a user to appear in the database (for async registration tests)
   * @param {string} username - Username to look for
   * @param {number} maxWaitMs - Maximum time to wait in milliseconds
   * @param {number} checkIntervalMs - Interval between checks in milliseconds
   * @returns {Promise<Object|null>} The user if found, null if timeout
   */
  async waitForUser(username, maxWaitMs = 5000, checkIntervalMs = 500) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const user = await this.getUserByUsername(username);
      if (user) {
        return user;
      }
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    return null;
  }

  /**
   * Wait for an order to appear in the database (for async processing tests)
   * @param {number} userId - User ID
   * @param {number} maxWaitMs - Maximum time to wait in milliseconds
   * @param {number} checkIntervalMs - Interval between checks in milliseconds
   * @returns {Promise<Object|null>} The order if found, null if timeout
   */
  async waitForOrder(userId, maxWaitMs = 10000, checkIntervalMs = 500) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const order = await this.getLatestOrderByUserId(userId);
      if (order) {
        return order;
      }
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    return null;
  }

  /**
   * Execute a raw SQL query (use with caution)
   */
  async query(sql, params = []) {
    const conn = await this.connect();
    const [rows] = await conn.execute(sql, params);
    return rows;
  }
}

export default DatabaseHelper;
