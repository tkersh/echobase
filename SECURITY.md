# Security Guide

This document provides security guidance for deploying and operating the Echobase order processing system.

## Table of Contents

- [Quick Start - Secure Credential Setup](#quick-start---secure-credential-setup)
- [Credential Management](#credential-management)
- [Security Best Practices](#security-best-practices)
- [Production Deployment Checklist](#production-deployment-checklist)
- [Vulnerability Reporting](#vulnerability-reporting)

---

## Quick Start - Secure Credential Setup

### For Local Development

1. **Generate Secure Credentials**
   ```bash
   ./generate-credentials.sh
   ```
   This script will:
   - Generate strong random passwords for the database
   - Create a `.env` file with all necessary credentials
   - Set restrictive file permissions (600)
   - Display a credential summary

2. **Start the Application**
   ```bash
   docker-compose up -d
   ```

3. **Verify Credentials**
   ```bash
   # Check that .env file has correct permissions
   ls -la .env
   # Should show: -rw------- (600)
   ```

### Manual Credential Setup

If you prefer to set credentials manually:

1. **Copy the example file**
   ```bash
   cp .env.example .env
   ```

2. **Generate a strong database password**
   ```bash
   # Generate a 32-character alphanumeric password
   openssl rand -base64 48 | tr -d "=+/" | cut -c1-32
   ```

3. **Edit `.env` and replace all `CHANGE_ME_TO_STRONG_RANDOM_PASSWORD` values**

4. **Set restrictive permissions**
   ```bash
   chmod 600 .env
   ```

---

## Credential Management

### Current Issues (Development Environment)

The following credential issues exist in the current development setup:

1. **Hardcoded Database Credentials** - ✅ FIXED
   - Previously: Credentials hardcoded in `docker-compose.yml`
   - Now: Credentials loaded from `.env` file with strong random values

2. **Hardcoded AWS Credentials** - ⚠️ ACCEPTABLE FOR LOCAL DEV
   - Status: Using `test/test` credentials for Localstack
   - Impact: This is acceptable for local development with Localstack
   - Production Fix: Use IAM roles or AWS Secrets Manager

3. **Credentials in Environment Variables** - ⚠️ MITIGATED
   - Status: Environment variables are necessary but now use strong values
   - Mitigation: `.env` file has restrictive permissions (600)
   - Production Fix: Use AWS Secrets Manager, HashiCorp Vault, or similar

### Credential Hierarchy

```
┌─────────────────────────────────────────────────────┐
│ Root .env file (for Docker Compose)                │
│ - Database credentials (MYSQL_*)                   │
│ - DB connection credentials (DB_*)                 │
│ - AWS credentials (AWS_ACCESS_KEY_ID, etc)        │
│ - JWT secret (for future auth)                     │
└─────────────────────────────────────────────────────┘
                        │
                        ├─> Mariadb container
                        ├─> API Gateway container
                        ├─> Order Processor container
                        └─> Frontend container

┌─────────────────────────────────────────────────────┐
│ Individual service .env files (for local dev)      │
│ backend/api-gateway/.env                           │
│ backend/order-processor/.env                       │
│ frontend/.env                                      │
└─────────────────────────────────────────────────────┘
```

**Important:**
- Docker Compose uses the **root `.env` file**
- Individual service `.env` files are only for running services locally outside Docker
- The root `.env` file takes precedence when running `docker-compose`

### Environment Variable Security

#### Good Practices Implemented

✅ **`.env` file in `.gitignore`**
- The `.env` file is automatically excluded from version control
- Only `.env.example` files are committed

✅ **Restrictive File Permissions**
- The `generate-credentials.sh` script sets `.env` to mode 600
- Only the file owner can read or write

✅ **Strong Random Passwords**
- Database passwords are 32 characters
- JWT secret is 64 characters
- Uses cryptographically secure random generation

✅ **Separation of Concerns**
- Database credentials separate from application credentials
- Different passwords for root and application user

#### Remaining Risks (Development)

⚠️ **Environment Variables Visible in Docker**
- Docker containers expose environment variables
- Can be viewed with `docker inspect`
- **Mitigation:** Use secrets management in production

⚠️ **No Encryption at Rest**
- The `.env` file is stored in plain text
- Database files are not encrypted
- **Mitigation:** Use full-disk encryption and secrets management

⚠️ **Credentials in Process Environment**
- Environment variables visible in process listings
- **Mitigation:** Use secrets management solutions

---

## Security Best Practices

### 1. Credential Storage

#### Development (Current)
- ✅ Use `.env` file with strong random passwords
- ✅ Set file permissions to 600
- ✅ Never commit `.env` to version control
- ✅ Use `generate-credentials.sh` for automatic secure generation

#### Production (Recommended)
- 🔒 **AWS Secrets Manager** - Store all credentials in AWS Secrets Manager
- 🔒 **IAM Roles** - Use IAM roles for AWS service access (no hardcoded credentials)
- 🔒 **Vault** - Use HashiCorp Vault for multi-cloud secrets management
- 🔒 **Docker Secrets** - Use Docker Swarm secrets or Kubernetes secrets
- 🔒 **Rotate Regularly** - Implement automatic credential rotation

### 2. Database Security

#### Current Implementation
- ✅ Strong random passwords (32 characters)
- ✅ Separate root and application user
- ✅ Parameterized SQL queries (SQL injection protection)
- ✅ Normalized database schema:
  - **users table:** id, username, email, full_name, password_hash
  - **orders table:** id, user_id (NOT NULL, FK to users), product_name, quantity, total_price, status
  - Foreign key: orders.user_id → users.id (ON DELETE CASCADE)
  - Customer names stored in users table only (no duplication)
  - API keys table removed (JWT-only authentication)

#### Additional Recommendations
- 🔒 Enable TLS for database connections
- 🔒 Enable encryption at rest (MariaDB TDE)
- 🔒 Use AWS RDS with automatic encryption
- 🔒 Restrict database user privileges (principle of least privilege)
- 🔒 Enable database audit logging
- 🔒 Close port 3306 to external access (use private network only)

### 3. AWS/Cloud Security

#### Current Implementation (Localstack Development)
- ✅ Using test credentials for local development
- ✅ Localstack isolated to Docker network

#### Production Recommendations
- 🔒 **Never use hardcoded AWS credentials**
- 🔒 Use IAM roles for EC2/ECS/Lambda
- 🔒 Use IAM roles for cross-service communication
- 🔒 Enable AWS Secrets Manager for database credentials
- 🔒 Enable SQS encryption (KMS)
- 🔒 Enable SQS access policies (restrict by IAM role)
- 🔒 Use VPC endpoints for AWS services (no internet access)

### 4. Application Security

#### Authentication & Authorization
- ✅ **Implemented** - JWT-based authentication
  - User registration and login with bcrypt password hashing (12 salt rounds)
  - JWT token generation with 24-hour expiration
  - JWT validation middleware protecting all order endpoints
  - Strong JWT secret (64 characters) from `.env`
  - Password requirements: 8+ chars, uppercase, lowercase, number
  - Username/email uniqueness validation
- ✅ **Removed** - API key authentication (simplified to JWT-only)
- 🔒 **Production TODO** - Implement role-based access control (RBAC)
- 🔒 **Production TODO** - Add refresh token mechanism
- 🔒 **Production TODO** - Implement account lockout after failed attempts

#### JWT Validation Details

**Validator:** The `jsonwebtoken` npm library (version tracked in package.json)

**Location:** `backend/api-gateway/middleware/auth.js`

**Validation Process:**
```javascript
// Line 23: jwt.verify performs:
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

**What is Validated:**
1. **Signature Verification** - Ensures token was signed with `JWT_SECRET` using HMAC-SHA256
2. **Expiration Check** - Verifies token hasn't expired (24-hour lifetime from creation)
3. **Payload Integrity** - Confirms payload hasn't been tampered with
4. **Payload Extraction** - Decodes userId, username, and fullName

**Error Handling:**
- `JsonWebTokenError` → 401 "Invalid token" (malformed or wrong signature)
- `TokenExpiredError` → 401 "Token expired" (lifetime exceeded)
- Other errors → 500 "Authentication error" (unexpected issues)

**Applied To:**
- ✅ All `/api/orders` endpoints (POST, GET)
- ✅ Applied via `authenticateJWT` middleware in `server.js:126`

**NOT Applied To:**
- ✅ `/api/auth/register` (public - user registration)
- ✅ `/api/auth/login` (public - user authentication)
- ✅ `/health` (public - health check endpoint)

**Token Lifecycle:**
1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. Server generates JWT with `jwt.sign(payload, JWT_SECRET, {expiresIn: '24h'})`
3. Client stores token (localStorage/sessionStorage)
4. Client sends token in `Authorization: Bearer <token>` header
5. Middleware validates token before allowing access to protected routes
6. Token expires after 24 hours, requiring re-authentication

**Security Considerations:**
- ✅ JWT secret is 64 characters (strong entropy)
- ✅ Tokens expire after 24 hours (limits exposure window)
- ✅ Tokens include user identity (userId, username, fullName)
- ⚠️ No token revocation mechanism (token valid until expiration)
- ⚠️ No refresh token (users must re-login after 24 hours)
- 🔒 **Production TODO:** Implement token blacklist/revocation
- 🔒 **Production TODO:** Add refresh tokens with shorter access token lifetime
- 🔒 **Production TODO:** Store tokens in httpOnly cookies (more secure than localStorage)

#### Network Security
- ❌ **Not Implemented** - No TLS/HTTPS
- 🔒 Enable HTTPS/TLS for all endpoints
- 🔒 Use Let's Encrypt or ACM for certificates
- 🔒 Configure Nginx for TLS 1.3
- 🔒 Implement HSTS headers

#### CORS Configuration
- ✅ **Configured** - Restricted to specific origin
  - Default: `http://localhost:3000` (configurable via `CORS_ORIGIN`)
  - Methods: GET, POST only
  - Headers: Content-Type, Authorization
  - Credentials: Enabled for cookie/session support
- 🔒 **Production TODO:** Update `CORS_ORIGIN` to production frontend URL
- 🔒 **Production TODO:** Consider multiple allowed origins if needed

#### Rate Limiting
- ✅ **Implemented** - Express rate limiter on API routes
  - Default: 100 requests per 15 minutes per IP
  - Applies to `/api/*` routes only (health check excluded)
  - Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`
  - Returns 429 "Too many requests" when exceeded
- 🔒 **Production TODO:** Use Redis for distributed rate limiting
- 🔒 **Production TODO:** Implement different limits per endpoint
- 🔒 **Production TODO:** Add stricter limits for auth endpoints

#### Input Validation
- ✅ **Implemented** - Comprehensive validation with express-validator
  - **User Registration:** username (3-50 chars, alphanumeric), email, fullName, password (8+ chars with complexity)
  - **User Login:** username and password required
  - **Orders:** productName (1-255 chars), quantity (1-10000), totalPrice (0.01-1000000)
  - **Sanitization:** HTML escaping, trimming, type conversion
  - **Business Logic:** Order total cannot exceed $1,000,000
- ✅ **SQL Injection Protection:** Parameterized queries throughout
- 🔒 **Production TODO:** Add more specific business rules
- 🔒 **Production TODO:** Implement file upload validation if needed

---

## Production Deployment Checklist

Before deploying to production, ensure all items are completed:

### Critical Security Requirements

- [ ] **Credentials Management**
  - [ ] Remove all hardcoded credentials from code
  - [ ] Implement AWS Secrets Manager or similar
  - [ ] Use IAM roles for AWS service access
  - [ ] Rotate all credentials from development
  - [ ] Generate production-specific strong passwords
  - [ ] Store backup of credentials in secure location

- [ ] **Encryption**
  - [ ] Enable HTTPS/TLS for all endpoints
  - [ ] Enable database encryption at rest
  - [ ] Enable SQS message encryption (KMS)
  - [ ] Enable TLS for database connections
  - [ ] Obtain and configure SSL/TLS certificates

- [x] **Authentication & Authorization**
  - [x] Implement JWT-based authentication
  - [x] Add user registration/login flows
  - [x] Implement password policies
  - [ ] ~~Add API key validation~~ (removed - JWT-only)
  - [ ] Implement role-based access control (RBAC)
  - [ ] Add refresh token mechanism
  - [ ] Implement account lockout after failed attempts
  - [ ] Add password reset flow

- [x] **Network Security**
  - [x] Configure CORS for specific origins only (configured, needs production URL)
  - [x] Implement rate limiting (100 req/15 min, configurable)
  - [x] Add request size limits (1MB payload limit)
  - [x] Configure security headers (Helmet.js - XSS, clickjacking, MIME sniffing)
  - [ ] Use private subnets for backend services
  - [ ] Close unnecessary ports (3306, 4566) in production
  - [ ] Enable HTTPS/TLS
  - [ ] Configure HSTS headers

- [x] **Input Validation**
  - [x] Implement comprehensive input validation (express-validator)
  - [x] Add business logic validation (order totals, field ranges)
  - [x] Sanitize all user inputs (HTML escaping, trimming)
  - [x] Use parameterized queries (SQL injection protection)
  - [ ] Validate file uploads (not applicable - no file uploads currently)

- [ ] **Monitoring & Logging**
  - [ ] Implement audit logging for all actions
  - [ ] Set up CloudWatch or similar monitoring
  - [ ] Configure log aggregation (ELK, CloudWatch Logs)
  - [ ] Set up alerts for security events
  - [ ] Implement Dead Letter Queue monitoring
  - [ ] Configure uptime monitoring

- [ ] **Compliance**
  - [ ] Review compliance requirements (PCI DSS, GDPR, HIPAA, SOC 2)
  - [ ] Implement data retention policies
  - [ ] Add data encryption for PII
  - [ ] Implement right to erasure (if GDPR applicable)
  - [ ] Document security controls

### Infrastructure Security

- [ ] **Docker Security**
  - [ ] Use official base images only
  - [ ] Scan images for vulnerabilities (`docker scan`)
  - [ ] Run containers as non-root user
  - [ ] Use Docker secrets (not environment variables)
  - [ ] Enable Docker Content Trust

- [ ] **AWS Security**
  - [ ] Enable GuardDuty (threat detection)
  - [ ] Configure security groups (least privilege)
  - [ ] Enable VPC Flow Logs
  - [ ] Use AWS WAF for API Gateway
  - [ ] Enable AWS Config for compliance monitoring
  - [ ] Implement backup and disaster recovery

- [ ] **Dependency Security**
  - [ ] Run `npm audit` and fix all vulnerabilities
  - [ ] Keep dependencies up to date
  - [ ] Use Dependabot or similar for automated updates
  - [ ] Review and approve all dependency updates

---

## Vulnerability Reporting

If you discover a security vulnerability in this project:

1. **Do NOT** open a public GitHub issue
2. **Do NOT** commit the vulnerability details to version control
3. **DO** contact the security team directly at: [security@example.com]
4. **DO** provide detailed information about the vulnerability
5. **DO** allow reasonable time for a fix before public disclosure

### What to Include in Your Report

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)
- Your contact information

We take security seriously and will respond to all legitimate reports within 48 hours.

---

## Security Resources

### Tools

- **Credential Generation**
  - `./generate-credentials.sh` - Automated credential generation
  - `openssl rand -base64 64` - Manual secret generation

- **Security Scanning**
  - `npm audit` - Dependency vulnerability scanning
  - `docker scan` - Container vulnerability scanning
  - `npm audit --omit=dev --audit-level=high` - Production dependency scan

### Documentation

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS Security Best Practices](https://docs.aws.amazon.com/security/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

### Related Documents

- `TrustBoundaries.md` - Comprehensive trust boundary and attack surface analysis
- `README.md` - General setup and deployment instructions
- `.env.example` - Environment variable template

---

## Security Updates

This document should be reviewed and updated:
- Before each production deployment
- After any security incident
- Quarterly as part of security reviews
- When new security features are added

**Last Updated:** 2025-10-30 (JWT authentication implementation)
**Next Review:** Before production deployment

---

## Summary

The Echobase application has been updated with comprehensive security features:

✅ **Implemented:**
- **Credential Management**
  - Hardcoded database credentials removed
  - Strong random password generation (32+ char passwords, 64 char JWT secret)
  - `.env` file with restrictive permissions (600)
  - Automated credential generation script
- **Authentication & Authorization**
  - JWT-based authentication with 24-hour token expiration
  - User registration with bcrypt password hashing (12 salt rounds)
  - Password complexity requirements (8+ chars, mixed case, numbers)
  - Username/email uniqueness validation
  - JWT validation middleware on all protected endpoints
  - API key authentication removed (JWT-only for simplicity)
- **Input Validation & Sanitization**
  - Comprehensive validation with express-validator
  - HTML escaping and input trimming
  - SQL injection protection via parameterized queries
  - Business logic validation (order totals, field ranges)
- **Network Security**
  - CORS restricted to specific origin (configurable)
  - Rate limiting (100 requests per 15 minutes per IP)
  - Request size limits (1MB payload maximum)
  - Security headers via Helmet.js (XSS, clickjacking, MIME sniffing protection)
- **Database Security**
  - Foreign key relationships (orders.user_id → users.id)
  - Proper database normalization (customer name in users table)
  - Separate database users (root vs application)

⚠️ **Still Required for Production:**
- **Secrets Management**
  - AWS Secrets Manager or HashiCorp Vault
  - IAM roles instead of hardcoded AWS credentials
- **Encryption**
  - HTTPS/TLS for all endpoints
  - Database encryption at rest
  - SQS message encryption (KMS)
- **Enhanced Authentication**
  - Refresh token mechanism
  - Token revocation/blacklist
  - Account lockout after failed attempts
  - Password reset flow
  - Role-based access control (RBAC)
- **Infrastructure**
  - Private subnets for backend services
  - Close unnecessary ports in production
  - Distributed rate limiting with Redis
- **Monitoring & Compliance**
  - Comprehensive audit logging
  - CloudWatch or similar monitoring
  - Log aggregation and alerting
  - Compliance documentation (PCI DSS, GDPR, etc.)

**Current Status:** ✅ Secure for local development | ⚠️ Production-ready baseline (additional hardening recommended)

**Key Files:**
- `SECURITY.md` (this file) - Security implementation details
- `TrustBoundaries.md` - Comprehensive trust boundary and attack surface analysis
- `AUTHENTICATION.md` - Authentication system documentation
- `README.md` - Setup and deployment instructions
- `docs/architecture.mmd` - System architecture diagram with authentication flow