/**
 * Security Test Template: Authentication & Authorization
 *
 * Purpose: Comprehensive testing of authentication and authorization mechanisms
 * Use this template for: Login, registration, password reset, token validation, permissions
 *
 * Customize:
 * - Replace [AUTH_ENDPOINT] with actual auth endpoint
 * - Replace [AUTH_METHOD] with authentication method (JWT, session, OAuth)
 * - Add specific business rules
 */

const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Security: Authentication', () => {

  // ========================================
  // LOGIN TESTS
  // ========================================
  describe('Login Functionality', () => {

    it('should accept valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'validuser',
          password: 'ValidPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'validuser',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid credentials|authentication failed/i);
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'AnyPassword123!'
        });

      expect(response.status).toBe(401);
      // Error message should be generic (don't reveal user existence)
      expect(response.body.error).toMatch(/invalid credentials/i);
    });

    it('should prevent timing attacks (constant-time comparison)', async () => {
      const timings = [];

      // Test with valid user, invalid password
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'validuser', password: 'wrong' });
        timings.push(Date.now() - start);
      }
      const validUserTime = average(timings);

      timings.length = 0;

      // Test with invalid user
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'nonexistent', password: 'wrong' });
        timings.push(Date.now() - start);
      }
      const invalidUserTime = average(timings);

      // Timing difference should be minimal (< 50ms) to prevent user enumeration
      expect(Math.abs(validUserTime - invalidUserTime)).toBeLessThan(50);
    });

    it('should implement account lockout after failed attempts', async () => {
      const username = 'lockouttest';

      // Make 5 failed login attempts (assuming lockout threshold is 5)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ username, password: 'wrongpassword' });
      }

      // 6th attempt should be locked out
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'correctpassword' });

      expect(response.status).toBe(429); // Too Many Requests
      expect(response.body.error).toMatch(/account locked|too many attempts/i);
    });

    it('should not reveal user existence through error messages', async () => {
      const validUserResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'validuser', password: 'wrong' });

      const invalidUserResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'wrong' });

      // Both should have same error message
      expect(validUserResponse.body.error).toBe(invalidUserResponse.body.error);
    });

    it('should reject SQL injection attempts in username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: "admin' OR '1'='1",
          password: "anything"
        });

      expect(response.status).toBe(401);
      expect(response.body.token).toBeUndefined();
    });

    it('should handle special characters in passwords safely', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'validuser',
          password: "'; DROP TABLE users; --"
        });

      expect(response.status).toBe(401);
      // Verify users table still exists
      const usersExist = await checkTableExists('users');
      expect(usersExist).toBe(true);
    });

  });

  // ========================================
  // REGISTRATION TESTS
  // ========================================
  describe('User Registration', () => {

    it('should allow registration with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'StrongPass123!',
          confirmPassword: 'StrongPass123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.userId).toBeDefined();
    });

    it('should enforce password strength requirements', async () => {
      const weakPasswords = [
        '123456',           // Too simple
        'password',         // Common word
        'abc',              // Too short
        'NoNumber!',        // Missing number
        'nonumber123',      // Missing special char
        'NOLOWERCASE123!'   // Missing lowercase
      ];

      for (const weakPass of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: weakPass,
            confirmPassword: weakPass
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/password|strength/i);
      }
    });

    it('should prevent duplicate username registration', async () => {
      const userData = {
        username: 'duplicatetest',
        email: 'unique1@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!'
      };

      // First registration should succeed
      const response1 = await request(app)
        .post('/api/auth/register')
        .send(userData);
      expect(response1.status).toBe(201);

      // Second registration with same username should fail
      const response2 = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, email: 'unique2@example.com' });
      expect(response2.status).toBe(409); // Conflict
    });

    it('should prevent duplicate email registration', async () => {
      const email = 'duplicate@example.com';

      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user1',
          email,
          password: 'ValidPass123!',
          confirmPassword: 'ValidPass123!'
        });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user2',
          email,
          password: 'ValidPass123!',
          confirmPassword: 'ValidPass123!'
        });

      expect(response.status).toBe(409);
    });

    it('should store passwords securely (hashed, not plaintext)', async () => {
      const password = 'SecurePass123!';

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'hashtest',
          email: 'hashtest@example.com',
          password,
          confirmPassword: password
        });

      expect(response.status).toBe(201);

      // Retrieve user from database
      const user = await getUserFromDB('hashtest');

      // Password should be hashed (bcrypt hash starts with $2)
      expect(user.password).toMatch(/^\$2[aby]\$/);
      expect(user.password).not.toBe(password);

      // Should be able to verify with bcrypt
      const isValid = await bcrypt.compare(password, user.password);
      expect(isValid).toBe(true);
    });

    it('should sanitize username input to prevent XSS', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: '<script>alert("xss")</script>',
          email: 'xsstest@example.com',
          password: 'ValidPass123!',
          confirmPassword: 'ValidPass123!'
        });

      // Should either reject or sanitize
      if (response.status === 201) {
        const user = await getUserFromDB(response.body.userId);
        expect(user.username).not.toContain('<script>');
      } else {
        expect(response.status).toBe(400);
      }
    });

  });

  // ========================================
  // TOKEN VALIDATION TESTS
  // ========================================
  describe('Token Validation', () => {

    it('should accept valid JWT tokens', async () => {
      const token = jwt.sign(
        { userId: 1, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/expired|invalid/i);
    });

    it('should reject tokens with invalid signature', async () => {
      const token = jwt.sign(
        { userId: 1, role: 'admin' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('should reject tampered tokens', async () => {
      const validToken = jwt.sign(
        { userId: 1, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Tamper with the token
      const tamperedToken = validToken.slice(0, -5) + 'xxxxx';

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
    });

    it('should reject tokens with missing claims', async () => {
      const token = jwt.sign(
        { /* missing userId */ },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

  });

  // ========================================
  // AUTHORIZATION / PERMISSION TESTS
  // ========================================
  describe('Authorization & Permissions', () => {

    it('should allow users to access their own resources', async () => {
      const user1Token = generateTokenForUser(1);

      const response = await request(app)
        .get('/api/users/1/profile')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
    });

    it('should prevent users from accessing other users resources (IDOR)', async () => {
      const user1Token = generateTokenForUser(1);

      const response = await request(app)
        .get('/api/users/2/profile')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/forbidden|access denied/i);
    });

    it('should allow admins to access all resources', async () => {
      const adminToken = generateTokenForRole('admin');

      const response = await request(app)
        .get('/api/users/2/profile')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should prevent privilege escalation via token manipulation', async () => {
      // User tries to modify their token to gain admin access
      const userToken = generateTokenForUser(1);

      // Attempt to create a new token with admin role (should fail signature check)
      const decoded = jwt.decode(userToken);
      decoded.role = 'admin';
      const manipulatedToken = jwt.sign(decoded, 'wrong-secret');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${manipulatedToken}`);

      expect(response.status).toBe(401);
    });

    it('should enforce role-based access control', async () => {
      const roles = [
        { role: 'user', endpoint: '/api/admin/users', shouldSucceed: false },
        { role: 'moderator', endpoint: '/api/moderator/reports', shouldSucceed: true },
        { role: 'moderator', endpoint: '/api/admin/settings', shouldSucceed: false },
        { role: 'admin', endpoint: '/api/admin/settings', shouldSucceed: true }
      ];

      for (const test of roles) {
        const token = generateTokenForRole(test.role);
        const response = await request(app)
          .get(test.endpoint)
          .set('Authorization', `Bearer ${token}`);

        if (test.shouldSucceed) {
          expect(response.status).not.toBe(403);
        } else {
          expect(response.status).toBe(403);
        }
      }
    });

  });

  // ========================================
  // SESSION MANAGEMENT TESTS
  // ========================================
  describe('Session Management', () => {

    it('should invalidate session on logout', async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'validuser', password: 'ValidPass123!' });

      const token = loginResponse.body.token;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Try to use token after logout
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('should prevent session fixation attacks', async () => {
      // Attacker gets a session token
      const attackerToken = 'attacker-fixed-session-token';

      // Victim logs in
      const response = await request(app)
        .post('/api/auth/login')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ username: 'victim', password: 'VictimPass123!' });

      // New session should be created (different token)
      expect(response.body.token).toBeDefined();
      expect(response.body.token).not.toBe(attackerToken);
    });

    it('should implement token refresh securely', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'validuser', password: 'ValidPass123!' });

      const refreshToken = loginResponse.body.refreshToken;

      // Use refresh token to get new access token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.token).toBeDefined();
      expect(refreshResponse.body.token).not.toBe(loginResponse.body.token);
    });

  });

});

// ========================================
// HELPER FUNCTIONS
// ========================================

function generateTokenForUser(userId) {
  return jwt.sign(
    { userId, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function generateTokenForRole(role) {
  return jwt.sign(
    { userId: 1, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function getUserFromDB(usernameOrId) {
  // Implementation depends on your database
  // This is a placeholder
  return null;
}

async function checkTableExists(tableName) {
  // Implementation depends on your database
  return true;
}

function average(numbers) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}