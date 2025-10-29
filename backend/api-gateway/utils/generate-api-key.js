#!/usr/bin/env node
/**
 * API Key Generation Utility
 *
 * Usage: node generate-api-key.js <key-name> [expires-in-days]
 *
 * Examples:
 *   node generate-api-key.js "frontend-app"
 *   node generate-api-key.js "mobile-app" 365
 *   node generate-api-key.js "test-key" 30
 */

require('dotenv').config();
const crypto = require('crypto');
const mysql = require('mysql2/promise');

/**
 * Generate a cryptographically secure random API key
 * Format: 64 character hexadecimal string
 */
function generateSecureAPIKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Insert API key into database
 */
async function createAPIKey(keyName, expiresInDays = null) {
  // Create database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    // Generate API key
    const apiKey = generateSecureAPIKey();

    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(expiresInDays));
      expiresAt = expiryDate.toISOString().slice(0, 19).replace('T', ' ');
    }

    // Insert into database
    const [result] = await connection.execute(
      'INSERT INTO api_keys (key_name, api_key, is_active, expires_at) VALUES (?, ?, TRUE, ?)',
      [keyName, apiKey, expiresAt]
    );

    console.log('\n✅ API Key generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Key ID:      ${result.insertId}`);
    console.log(`Key Name:    ${keyName}`);
    console.log(`API Key:     ${apiKey}`);
    console.log(`Is Active:   true`);
    console.log(`Expires:     ${expiresAt || 'Never'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Save this API key securely. It will not be shown again.');
    console.log('   Use it in API requests via the X-API-Key header.\n');
    console.log('Example usage with curl:');
    console.log(`  curl -X POST http://localhost:3001/api/orders \\`);
    console.log(`    -H "X-API-Key: ${apiKey}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"customerName":"John Doe","productName":"Widget","quantity":5,"totalPrice":49.95}'\n`);

    return {
      id: result.insertId,
      keyName,
      apiKey,
      expiresAt,
    };
  } finally {
    await connection.end();
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: Key name is required\n');
    console.log('Usage: node generate-api-key.js <key-name> [expires-in-days]\n');
    console.log('Examples:');
    console.log('  node generate-api-key.js "frontend-app"');
    console.log('  node generate-api-key.js "mobile-app" 365');
    console.log('  node generate-api-key.js "test-key" 30\n');
    process.exit(1);
  }

  const keyName = args[0];
  const expiresInDays = args[1] || null;

  // Validate key name
  if (keyName.length < 1 || keyName.length > 100) {
    console.error('❌ Error: Key name must be between 1 and 100 characters\n');
    process.exit(1);
  }

  // Validate expiration days
  if (expiresInDays && (isNaN(expiresInDays) || parseInt(expiresInDays) <= 0)) {
    console.error('❌ Error: Expiration days must be a positive number\n');
    process.exit(1);
  }

  try {
    await createAPIKey(keyName, expiresInDays);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating API key:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateSecureAPIKey,
  createAPIKey,
};