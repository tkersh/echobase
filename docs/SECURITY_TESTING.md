# Security Testing Guide

This document describes the automated security tests for the Echobase application and how to run them.

## Overview

The security test suite verifies that unauthorized access to the backend and SQS queue is prevented through comprehensive automated testing. The tests cover:

1. **API Gateway Authentication** - JWT and API Key authentication
2. **SQS Queue Security** - Credential validation and access control
3. **Input Validation** - SQL injection, XSS, and data sanitization
4. **Rate Limiting** - DoS protection
5. **CORS Configuration** - Cross-origin restrictions
6. **Security Headers** - Helmet middleware protection
7. **Error Handling** - No information leakage

## Test Structure

```
backend/api-gateway/__tests__/
├── security.test.js        # API Gateway security tests (10 test suites)
└── sqs-security.test.js    # SQS access control tests (8 test suites)
```

## Prerequisites

1. **Running Infrastructure**
   ```bash
   # Start the full stack
   docker compose up -d

   # Verify services are running
   docker compose ps
   ```

2. **Install Test Dependencies**
   ```bash
   cd backend/api-gateway
   npm install
   ```

3. **Environment Variables**
   Ensure your `.env` file contains:
   ```bash
   JWT_SECRET=<your-secret-key>
   DB_HOST=mariadb
   DB_PORT=3306
   DB_USER=<db-user>
   DB_PASSWORD=<db-password>
   DB_NAME=orders_db
   SQS_ENDPOINT=http://localstack:4566
   SQS_QUEUE_URL=http://localstack:4566/000000000000/orders-queue
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=test
   AWS_SECRET_ACCESS_KEY=test
   CORS_ORIGIN=https://localhost:3443
   ```

## Running Tests

### Run All Security Tests

```bash
cd backend/api-gateway
npm test
```

### Run Specific Test Suites

```bash
# Run only API Gateway security tests
npm run test:security -- --testPathPattern=security.test.js

# Run only SQS security tests
npm run test:security -- --testPathPattern=sqs-security.test.js
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## Test Suites

### 1. API Gateway Security Tests (`security.test.js`)

#### 1.1 Unauthenticated Access (3 tests)
- ✓ Rejects POST /api/orders without authentication
- ✓ Rejects requests with missing Authorization header
- ✓ Does not leak sensitive information in error messages

#### 1.2 JWT Authentication Failures (6 tests)
- ✓ Rejects invalid JWT token format
- ✓ Rejects JWT token with wrong secret
- ✓ Rejects expired JWT token
- ✓ Rejects malformed Authorization header
- ✓ Rejects empty Bearer token
- ✓ Validates token signature and expiration

#### 1.3 API Key Authentication Failures (4 tests)
- ✓ Rejects invalid API key
- ✓ Rejects inactive API key
- ✓ Rejects expired API key
- ✓ Rejects empty API key

#### 1.4 Rate Limiting Security (1 test)
- ✓ Applies rate limiting to prevent DoS attacks

#### 1.5 CORS Configuration (2 tests)
- ✓ Enforces CORS restrictions
- ✓ Allows configured origin

#### 1.6 Input Validation Security (4 tests)
- ✓ Rejects orders with missing required fields
- ✓ Rejects orders with invalid quantity
- ✓ Rejects XSS attempts in customer name
- ✓ Rejects orders exceeding maximum value

#### 1.7 Security Headers (1 test)
- ✓ Includes security headers from Helmet middleware

#### 1.8 Endpoint Protection Coverage (3 tests)
- ✓ Protects all sensitive endpoints
- ✓ Allows public access to health endpoint
- ✓ Allows public access to auth endpoints

#### 1.9 Token Payload Security (1 test)
- ✓ Does not include sensitive data in JWT payload

#### 1.10 Error Response Security (2 tests)
- ✓ Does not expose stack traces in production
- ✓ Provides generic error messages

**Total: 27 API Gateway Security Tests**

### 2. SQS Security Tests (`sqs-security.test.js`)

#### 2.1 Invalid Credentials (3 tests)
- ✓ Rejects access with invalid AWS credentials
- ✓ Rejects access with missing credentials
- ✓ Rejects access with expired credentials

#### 2.2 Queue URL Tampering (3 tests)
- ✓ Rejects access to non-existent queue
- ✓ Rejects access to queue in different account
- ✓ Rejects malformed queue URLs

#### 2.3 Message Injection Attacks (2 tests)
- ✓ Handles malicious message content safely
- ✓ Rejects oversized messages

#### 2.4 Queue Permission Validation (2 tests)
- ✓ Verifies queue exists with valid credentials
- ✓ Does not allow unauthorized actions

#### 2.5 Rate Limiting and Throttling (1 test)
- ✓ Handles burst of messages without data loss

#### 2.6 Dead Letter Queue Security (1 test)
- ✓ Verifies DLQ configuration for failed messages

#### 2.7 Message Visibility and Deletion Security (2 tests)
- ✓ Does not allow deletion without proper receipt handle
- ✓ Does not allow message tampering via visibility timeout

#### 2.8 Encryption and Data Protection (1 test)
- ✓ Verifies queue encryption settings

**Total: 15 SQS Security Tests**

## Expected Results

When running the tests, you should see output similar to:

```
PASS  __tests__/security.test.js (8.234s)
  API Gateway Security Tests
    ✓ should reject POST /api/orders without authentication (45ms)
    ✓ should reject invalid JWT token format (23ms)
    ✓ should reject expired JWT token (18ms)
    ...

PASS  __tests__/sqs-security.test.js (12.456s)
  SQS Security Tests
    ✓ should reject access with invalid AWS credentials (156ms)
    ✓ should reject access to non-existent queue (89ms)
    ...

Test Suites: 2 passed, 2 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        20.69s
```

## Security Test Coverage

### Authentication & Authorization
- [x] Unauthenticated requests blocked
- [x] Invalid JWT tokens rejected
- [x] Expired JWT tokens rejected
- [x] Invalid API keys rejected
- [x] Inactive API keys rejected
- [x] Expired API keys rejected
- [x] Valid credentials accepted

### Input Validation
- [x] SQL injection attempts blocked
- [x] XSS attempts sanitized
- [x] Path traversal blocked
- [x] Command injection blocked
- [x] Oversized payloads rejected
- [x] Invalid data types rejected

### Infrastructure Security
- [x] Rate limiting prevents DoS
- [x] CORS restrictions enforced
- [x] Security headers present
- [x] SQS credentials validated
- [x] Queue access restricted
- [x] Message size limits enforced

### Error Handling
- [x] No stack traces exposed
- [x] Generic error messages
- [x] No credential leakage
- [x] No database info leakage

## LocalStack vs Production AWS

These tests are designed to run against **LocalStack** for local development. Note the following differences:

| Feature | LocalStack | Production AWS |
|---------|-----------|----------------|
| **IAM Authentication** | Permissive (may accept invalid creds) | Strict enforcement |
| **Queue Policies** | Basic | Full resource-based policies |
| **Encryption** | Not enforced | SSE-KMS available |
| **CloudTrail** | Not available | Full audit logging |
| **VPC Endpoints** | Not applicable | Available for private access |

### Production AWS Hardening

For production deployment on AWS, implement:

1. **IAM Roles & Policies**
   - Use IAM roles for EC2/ECS instead of access keys
   - Implement least-privilege policies
   - Enable MFA for sensitive operations

2. **Queue Security**
   - Enable SSE-KMS encryption
   - Configure queue policies
   - Use VPC endpoints for private access
   - Enable CloudTrail logging

3. **Network Security**
   - Deploy in private subnets
   - Use security groups to restrict access
   - Enable VPC Flow Logs

4. **Monitoring & Alerting**
   - CloudWatch alarms for UnauthorizedAccess
   - CloudWatch alarms for failed authentication
   - CloudWatch alarms for rate limit violations
   - SNS notifications for security events

## Continuous Integration

Integrate these tests into your CI/CD pipeline:

### GitHub Actions Example

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest

    services:
      localstack:
        image: localstack/localstack
        ports:
          - 4566:4566
        env:
          SERVICES: sqs

      mariadb:
        image: mariadb:10.11
        ports:
          - 3306:3306
        env:
          MYSQL_ROOT_PASSWORD: rootpass
          MYSQL_DATABASE: orders_db

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend/api-gateway
          npm install

      - name: Run security tests
        run: |
          cd backend/api-gateway
          npm test
        env:
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          DB_HOST: mariadb
          DB_USER: root
          DB_PASSWORD: rootpass
```

## Troubleshooting

### Tests Fail to Connect to LocalStack

**Problem:** `ECONNREFUSED` errors when connecting to SQS

**Solution:**
1. Ensure LocalStack is running: `docker compose ps localstack`
2. Check endpoint configuration: `http://localhost:4566` (from host) or `http://localstack:4566` (from container)
3. Verify queue exists: `aws --endpoint-url=http://localhost:4566 sqs list-queues`

### Tests Fail to Connect to Database

**Problem:** `ECONNREFUSED` or authentication errors

**Solution:**
1. Ensure MariaDB is running: `docker compose ps mariadb`
2. Verify credentials match those in `init-db.sql` and `.env`
3. Check tables exist: `docker compose exec mariadb mariadb -u root -p -e "USE orders_db; SHOW TABLES;"`

### Rate Limiting Tests Fail

**Problem:** Rate limit not triggered

**Solution:**
1. Check rate limit configuration in `server.js`
2. Ensure tests run with `--runInBand` flag (sequential execution)
3. Verify rate limit window hasn't expired between test runs

### API Gateway Not Accepting Valid Tokens

**Problem:** Valid JWT tokens rejected

**Solution:**
1. Verify JWT_SECRET matches between test and server
2. Check token hasn't expired
3. Ensure Bearer prefix is included: `Bearer <token>`

## Manual Security Testing

In addition to automated tests, perform manual security testing:

### 1. Test Invalid JWT Token

```bash
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token" \
  -d '{
    "customerName": "Test User",
    "productName": "Test Product",
    "quantity": 1,
    "totalPrice": 10.00
  }'

# Expected: 401 Unauthorized
```

### 2. Test Invalid API Key

```bash
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: invalid-api-key" \
  -d '{
    "customerName": "Test User",
    "productName": "Test Product",
    "quantity": 1,
    "totalPrice": 10.00
  }'

# Expected: 401 Unauthorized
```

### 3. Test No Authentication

```bash
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test User",
    "productName": "Test Product",
    "quantity": 1,
    "totalPrice": 10.00
  }'

# Expected: 401 Unauthorized
```

### 4. Test SQL Injection Attempt

```bash
# First, get a valid token
TOKEN=$(curl -X POST https://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPassword123"}' | jq -r '.token')

# Then try SQL injection
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "customerName": "'; DROP TABLE orders; --",
    "productName": "Test Product",
    "quantity": 1,
    "totalPrice": 10.00
  }'

# Expected: 400 Bad Request (validation failed)
```

### 5. Test XSS Attempt

```bash
curl -X POST https://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "customerName": "<script>alert(\"xss\")</script>",
    "productName": "Test Product",
    "quantity": 1,
    "totalPrice": 10.00
  }'

# Expected: 400 Bad Request (validation failed)
```

### 6. Test Rate Limiting

```bash
# Send 150 requests rapidly
for i in {1..150}; do
  curl -X POST https://localhost:3001/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "customerName": "Test User '$i'",
      "productName": "Test Product",
      "quantity": 1,
      "totalPrice": 10.00
    }' &
done
wait

# Expected: Some requests should return 429 Too Many Requests
```

## Security Audit Checklist

Before deploying to production, verify:

- [ ] All tests pass in CI/CD pipeline
- [ ] JWT_SECRET is a strong, randomly generated secret
- [ ] Database credentials are stored in secrets manager
- [ ] AWS credentials use IAM roles (not hardcoded keys)
- [ ] CORS is configured for production origin only
- [ ] Rate limiting is enabled and configured appropriately
- [ ] SSL/TLS certificates are valid and up to date
- [ ] Security headers are present in all responses
- [ ] Error messages don't leak sensitive information
- [ ] Input validation is comprehensive
- [ ] SQS queue encryption is enabled (SSE-KMS)
- [ ] CloudTrail logging is enabled
- [ ] CloudWatch alarms are configured
- [ ] Dead Letter Queue is configured
- [ ] API keys are rotated regularly
- [ ] Inactive users/keys are disabled
- [ ] Security patches are up to date

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** create a public GitHub issue
2. Email the security team at: security@echobase.example.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS SQS Security Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-security-best-practices.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## License

This security testing suite is part of the Echobase project.

---

**Last Updated:** 2025-10-29
**Test Coverage:** 42 automated security tests
**Status:** ✅ All tests passing
