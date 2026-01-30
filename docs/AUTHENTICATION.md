# Authentication Guide

## Overview

The Echobase API Gateway supports two authentication methods:

1. **JWT (JSON Web Token)** - For user authentication (registration/login)
2. **API Key** - For service-to-service authentication

Both methods provide secure access to protected endpoints, particularly the order submission endpoint.

## Table of Contents

- [User Authentication (JWT)](#user-authentication-jwt)
- [API Key Authentication](#api-key-authentication)
- [Protected Endpoints](#protected-endpoints)
- [Security Features](#security-features)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## User Authentication (JWT)

### Registration

Create a new user account:

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

**Validation Rules:**
- Username: 3-50 characters, alphanumeric + underscores only
- Email: Valid email format
- Password: Minimum 8 characters, must contain at least one uppercase, one lowercase, and one number

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

### Login

Authenticate with existing credentials:

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "SecurePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

### Using JWT Tokens

Include the JWT token in the `Authorization` header for protected endpoints:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Details:**
- **Expiration:** 24 hours
- **Payload:** Contains `userId` and `username`
- **Algorithm:** HS256 (HMAC with SHA-256)

---

## API Key Authentication

### Generating API Keys

Use the built-in utility to generate API keys:

```bash
cd backend/api-gateway
node utils/generate-api-key.js <key-name> [expires-in-days]
```

**Examples:**

```bash
# Non-expiring key for frontend
node utils/generate-api-key.js "frontend-app"

# Key that expires in 365 days
node utils/generate-api-key.js "mobile-app" 365

# Test key that expires in 30 days
node utils/generate-api-key.js "test-key" 30
```

**Output:**
```
✅ API Key generated successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key ID:      1
Key Name:    frontend-app
API Key:     a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8
Is Active:   true
Expires:     Never
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: Save this API key securely. It will not be shown again.
```

### Using API Keys

Include the API key in the `X-API-Key` header:

```
X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8
```

**API Key Features:**
- **Format:** 64-character hexadecimal string
- **Storage:** Stored in database with metadata
- **Tracking:** `last_used_at` timestamp updated on each use
- **Status:** Can be deactivated without deletion
- **Expiration:** Optional expiration date

---

## Protected Endpoints

### Order Submission

**Endpoint:** `POST /api/orders`

**Authentication:** Required (JWT or API Key)

**Request Headers (choose one):**
```
# Option 1: JWT
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Option 2: API Key
X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8
```

**Request Body:**
```json
{
  "customerName": "John Doe",
  "productName": "Widget",
  "quantity": 5,
  "totalPrice": 49.95
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Order submitted successfully",
  "messageId": "abc-123-def-456",
  "order": {
    "customerName": "John Doe",
    "productName": "Widget",
    "quantity": 5,
    "totalPrice": 49.95,
    "timestamp": "2025-10-28T12:34:56.789Z"
  }
}
```

**Error Responses:**

401 Unauthorized - No authentication provided:
```json
{
  "error": "Authentication required",
  "message": "Provide either Authorization header (Bearer token) or X-API-Key header"
}
```

401 Unauthorized - Invalid token:
```json
{
  "error": "Authentication failed",
  "message": "Invalid token"
}
```

401 Unauthorized - Expired token:
```json
{
  "error": "Authentication failed",
  "message": "Token expired"
}
```

401 Unauthorized - Invalid API key:
```json
{
  "error": "Authentication failed",
  "message": "Invalid API key"
}
```

---

## Security Features

### Password Security
- **Hashing Algorithm:** bcrypt
- **Salt Rounds:** 12
- **Password Requirements:**
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### JWT Security
- **Secret:** Stored in `JWT_SECRET` environment variable
- **Algorithm:** HS256 (HMAC-SHA256)
- **Expiration:** 24 hours
- **Token Validation:** Signature, expiration, and structure verified

### API Key Security
- **Generation:** Cryptographically secure random bytes (32 bytes → 64 hex chars)
- **Storage:** Stored in database with metadata
- **Validation:** Database lookup, active status check, expiration check
- **Tracking:** Last used timestamp for audit trail

### Authentication Middleware
- **JWT Middleware:** `authenticateJWT` - Validates Bearer tokens
- **API Key Middleware:** `authenticateAPIKey` - Validates X-API-Key headers
- **Combined Middleware:** `authenticateEither` - Accepts either method (JWT preferred)

### Audit Logging
All authenticated requests are logged with:
- Order details (customer, product, quantity, price)
- Message ID (SQS)
- Authentication method (user:username or apikey:keyname)

Example log:
```
Order submitted: msg-123 - John Doe - Widget [user:johndoe]
Order submitted: msg-456 - Jane Smith - Gadget [apikey:frontend-app]
```

---

## Examples

### Example 1: User Registration and Order Submission (JWT)

```bash
# 1. Register a new user
curl -X POST https://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePassword123"
  }'

# Response includes token:
# {"success":true,"token":"eyJhbGci...","user":{...}}

# 2. Submit an order using the token
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "customerName": "John Doe",
    "productName": "Widget",
    "quantity": 5,
    "totalPrice": 49.95
  }'
```

### Example 2: User Login and Order Submission (JWT)

```bash
# 1. Login with existing credentials
curl -X POST https://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "SecurePassword123"
  }'

# Response includes token:
# {"success":true,"token":"eyJhbGci...","user":{...}}

# 2. Submit an order using the token
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "customerName": "John Doe",
    "productName": "Widget",
    "quantity": 5,
    "totalPrice": 49.95
  }'
```

### Example 3: API Key Generation and Order Submission

```bash
# 1. Generate an API key (run on server with database access)
cd backend/api-gateway
node utils/generate-api-key.js "frontend-app"

# Copy the generated API key from output

# 2. Submit an order using the API key
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8" \
  -d '{
    "customerName": "Jane Smith",
    "productName": "Gadget",
    "quantity": 10,
    "totalPrice": 199.99
  }'
```

### Example 4: Frontend Integration (React/JavaScript)

```javascript
// JWT Authentication
async function registerAndSubmitOrder() {
  // 1. Register user
  const registerResponse = await fetch('https://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'johndoe',
      email: 'john@example.com',
      password: 'SecurePassword123'
    })
  });

  const { token } = await registerResponse.json();

  // 2. Submit order with JWT
  const orderResponse = await fetch('https://localhost:3001/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      customerName: 'John Doe',
      productName: 'Widget',
      quantity: 5,
      totalPrice: 49.95
    })
  });

  const order = await orderResponse.json();
  console.log('Order submitted:', order);
}

// API Key Authentication
async function submitOrderWithAPIKey() {
  const response = await fetch('https://localhost:3001/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8'
    },
    body: JSON.stringify({
      customerName: 'Jane Smith',
      productName: 'Gadget',
      quantity: 10,
      totalPrice: 199.99
    })
  });

  const order = await response.json();
  console.log('Order submitted:', order);
}
```

---

## Troubleshooting

### Issue: "Authentication required"

**Cause:** No authentication header provided

**Solution:** Include either `Authorization: Bearer <token>` or `X-API-Key: <key>` header

### Issue: "Invalid token"

**Cause:** JWT token is malformed or signature doesn't match

**Solutions:**
- Verify token hasn't been manually modified
- Ensure JWT_SECRET environment variable matches between registration and validation
- Check token is being sent with correct "Bearer " prefix

### Issue: "Token expired"

**Cause:** JWT token is older than 24 hours

**Solution:** Login again to get a new token

### Issue: "Invalid API key"

**Cause:** API key doesn't exist in database

**Solutions:**
- Verify API key is correctly copied (64 hex characters)
- Check API key exists in `api_keys` table
- Ensure no extra whitespace in the key

### Issue: "API key is inactive"

**Cause:** API key has been deactivated

**Solution:** Reactivate the key in the database:
```sql
UPDATE api_keys SET is_active = TRUE WHERE api_key = '<your-key>';
```

### Issue: "API key has expired"

**Cause:** API key has passed its expiration date

**Solution:** Generate a new API key

### Issue: Database connection errors

**Cause:** API Gateway cannot connect to MariaDB

**Solutions:**
- Verify MariaDB is running: `docker compose ps`
- Check database credentials in `.env` file
- Ensure API Gateway has DB_* environment variables configured
- Verify `users` and `api_keys` tables exist: `docker compose exec mariadb mariadb -u root -p -e "USE orders_db; SHOW TABLES;"`

---

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### API Keys Table

```sql
CREATE TABLE api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(64) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL
);
```

---

## Environment Variables

Required environment variables for authentication:

```bash
# Database connection (required for both auth methods)
DB_HOST=mariadb
DB_PORT=3306
DB_USER=<username>
DB_PASSWORD=<password>
DB_NAME=orders_db

# JWT secret (required for user authentication)
JWT_SECRET=<secure-random-secret>
```

The `JWT_SECRET` is automatically generated by `scripts/generate-credentials.sh` if using the provided setup scripts.

---

## Best Practices

### For JWT Authentication:
1. **Store tokens securely** - Use httpOnly cookies or secure storage (not localStorage for sensitive apps)
2. **Implement token refresh** - Consider adding a refresh token mechanism for longer sessions
3. **Handle expiration gracefully** - Redirect to login when token expires
4. **Don't store sensitive data in JWT** - Token payload is readable (only signed, not encrypted)

### For API Key Authentication:
1. **Rotate keys regularly** - Generate new keys periodically
2. **Use expiration dates** - Set reasonable expiration dates for keys
3. **Monitor usage** - Check `last_used_at` timestamps for suspicious activity
4. **Secure key storage** - Store API keys in environment variables or secrets management
5. **One key per service** - Don't share API keys between different applications
6. **Deactivate unused keys** - Set `is_active = FALSE` instead of deleting for audit trail

### General Security:
1. **Use HTTPS in production** - Never send auth credentials over HTTP
2. **Enable CORS restrictions** - Configure CORS_ORIGIN environment variable
3. **Monitor authentication failures** - Set up alerts for repeated auth failures
4. **Regular security audits** - Review user accounts and API keys periodically
5. **Strong passwords** - Enforce password complexity requirements

---

## Migration Notes

### Existing Deployments

If you have an existing Echobase deployment without authentication:

1. **Rebuild database** - The new schema includes `users` and `api_keys` tables
   ```bash
   docker compose down -v
   docker compose up -d
   ```

2. **Update environment variables** - Ensure `JWT_SECRET` and DB_* variables are set

3. **Generate API keys** - Create API keys for any existing integrations

4. **Update clients** - Update frontend/clients to include authentication headers

5. **Test thoroughly** - Verify authentication works before deploying to production

### Testing

Authentication can be temporarily disabled for testing by modifying server.js:

```javascript
// Remove authenticateEither middleware temporarily
app.post('/api/orders', orderValidation, async (req, res) => {
  // ... existing code
});
```

**Note:** Never disable authentication in production!