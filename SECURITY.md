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
- ❌ **Not Implemented** - No authentication system
- 🔒 Implement JWT-based authentication
- 🔒 Add API key validation
- 🔒 Implement role-based access control (RBAC)
- 🔒 Use the generated `JWT_SECRET` from `.env`

#### Network Security
- ❌ **Not Implemented** - No TLS/HTTPS
- 🔒 Enable HTTPS/TLS for all endpoints
- 🔒 Use Let's Encrypt or ACM for certificates
- 🔒 Configure Nginx for TLS 1.3
- 🔒 Implement HSTS headers

#### CORS Configuration
- ❌ **Insecure** - Currently allows all origins
- 🔒 Restrict CORS to specific origins in production
- 🔒 Never use `cors()` without options in production

#### Rate Limiting
- ❌ **Not Implemented** - No rate limiting
- 🔒 Implement rate limiting middleware (express-rate-limit)
- 🔒 Set appropriate limits (e.g., 100 requests per 15 minutes)
- 🔒 Use Redis for distributed rate limiting

#### Input Validation
- ⚠️ **Minimal** - Only required field validation
- 🔒 Implement comprehensive input validation (express-validator)
- 🔒 Validate string lengths, patterns, ranges
- 🔒 Sanitize all user input
- 🔒 Implement business logic validation

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

- [ ] **Authentication & Authorization**
  - [ ] Implement JWT-based authentication
  - [ ] Add API key validation
  - [ ] Implement role-based access control
  - [ ] Add user registration/login flows
  - [ ] Implement password policies

- [ ] **Network Security**
  - [ ] Configure CORS for specific origins only
  - [ ] Implement rate limiting
  - [ ] Add request size limits
  - [ ] Configure security headers (CSP, HSTS, etc.)
  - [ ] Use private subnets for backend services
  - [ ] Close unnecessary ports (3306, 4566)

- [ ] **Input Validation**
  - [ ] Implement comprehensive input validation
  - [ ] Add business logic validation
  - [ ] Sanitize all user inputs
  - [ ] Validate file uploads (if applicable)

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

**Last Updated:** 2025-10-24
**Next Review:** Before production deployment

---

## Summary

The Echobase application has been updated with improved credential management:

✅ **Fixed:**
- Hardcoded database credentials removed
- Strong random password generation implemented
- `.env` file with restrictive permissions
- Automated credential generation script

⚠️ **Still Required for Production:**
- AWS Secrets Manager or similar
- IAM roles instead of hardcoded AWS credentials
- HTTPS/TLS encryption
- Authentication and authorization
- Comprehensive input validation
- Rate limiting
- Monitoring and logging

**Current Status:** ✅ Secure for local development | ⚠️ Not production ready

Refer to `TrustBoundaries.md` for a comprehensive security analysis and `README.md` for deployment instructions.