# Trust Boundaries and Attack Surfaces

## System Overview

This document provides a security analysis of the Echobase order processing system, identifying trust boundaries, attack surfaces, and potential security vulnerabilities.

**Architecture:** Multi-tier asynchronous order processing system
- **Frontend:** React application (Port 3000)
- **API Gateway:** Express.js REST API (Port 3001)
- **Message Queue:** AWS SQS via Localstack (Port 4566)
- **Order Processor:** Node.js background service
- **Database:** MariaDB (Port 3306)

```
Internet/External Network
        │
        ├─[TRUST BOUNDARY 1]────────────────────────────
        │
        v
    Frontend (React/Nginx)  ──────> API Gateway (Express)
        │                               │
        └──[TRUST BOUNDARY 2]───────────┘
                                        │
                                        v
                                   SQS Queue (Localstack)
                                        │
                                        v
                                 Order Processor
                                        │
                            [TRUST BOUNDARY 3]
                                        │
                                        v
                                    MariaDB
```

---

## Key Findings

### Trust Boundaries Identified (5)

1. **External Network ↔ Docker Network** (🟡 MEDIUM)
   - ~~No authentication or authorization~~ ✅ **FIXED** (JWT + API Key auth)
   - ~~Permissive CORS allowing all origins~~ ✅ **FIXED**
   - No HTTPS/TLS encryption
   - ~~No rate limiting or request throttling~~ ✅ **FIXED**

2. **Frontend ↔ API Gateway** (🟡 MEDIUM)
   - No encryption within Docker network
   - ~~Minimal input validation~~ ✅ **FIXED**
   - ~~No business logic validation~~ ✅ **FIXED**

3. **API Gateway ↔ SQS Queue** (🟠 HIGH)
   - Hardcoded AWS credentials in environment variables
   - No message encryption
   - Credentials visible in Docker logs

4. **Order Processor ↔ SQS Queue** (🟠 HIGH)
   - Same credential exposure issues
   - No Dead Letter Queue monitoring
   - Potential for poison message attacks

5. **Order Processor ↔ MariaDB** (🔴 CRITICAL)
   - Hardcoded database credentials
   - No encryption at rest
   - Database port exposed to localhost
   - No audit logging

### Attack Surfaces Documented

- **Frontend (React/Nginx)** - Security Score: 🟡 5/10
  - XSS vulnerabilities, clickjacking potential, DoS exposure

- **API Gateway (Express.js)** - Security Score: 🟢 8/10 ⬆️ (was 🔴 3/10)
  - **IMPLEMENTED:** Authentication (JWT + API Key), CORS restrictions, rate limiting, input validation, sanitization
  - **Remaining:** No HTTPS (acceptable for local development)

- **SQS Queue (Localstack)** - Security Score: 🔴 2/10
  - Credential theft risk, message interception, tampering potential, queue flooding

- **Order Processor** - Security Score: 🟡 4/10
  - Poison message attacks, resource exhaustion, credential exposure

- **MariaDB Database** - Security Score: 🟡 5/10
  - Credential-based attacks, data exfiltration risk, no audit trail

### Critical Security Gaps

**Critical (Production Blockers):**
1. ~~No authentication/authorization system~~ ✅ **FIXED** (2025-10-28) - JWT + API Key authentication
2. No HTTPS/TLS encryption
3. Hardcoded credentials in environment variables
4. ~~Permissive CORS configuration~~ ✅ **FIXED** (2025-10-27)
5. ~~No rate limiting or throttling~~ ✅ **FIXED** (2025-10-27)

**High Priority:**
6. ~~No input sanitization~~ ✅ **FIXED** (2025-10-27)
7. ~~No request size limits~~ ✅ **FIXED** (2025-10-27)
8. No message encryption
9. Database encryption at rest disabled
10. No audit logging (basic logging added)

**Medium Priority:**
11. No Dead Letter Queue monitoring
12. ~~Weak database credentials~~ ✅ **FIXED** (2025-10-27)
13. No API versioning
14. ~~Insufficient business logic validation~~ ✅ **FIXED** (2025-10-27)
15. Port exposure to localhost

**Progress:** 7 of 15 gaps addressed (47%)

### Overall Security Assessment

**Status:** ⚠️ **NOT PRODUCTION READY**

This system demonstrates good architectural patterns (queue-based async processing, separation of concerns, parameterized SQL queries) but requires significant security hardening before production deployment. Multiple critical vulnerabilities must be addressed, particularly around authentication, encryption, and credential management.

**Recommended Action:** Implement remaining Phase 1 security enhancements (HTTPS, secrets management) before considering production deployment. Authentication, CORS restrictions, and rate limiting have been successfully implemented.

---

## Trust Boundaries

### 1. External Network ↔ Docker Network (PRIMARY BOUNDARY)

**Location:** Internet/User Browser → Docker Host → Frontend/API Gateway

**Security Level:** **UNTRUSTED → SEMI-TRUSTED**

**Current Protection Mechanisms:**
- Port binding to localhost (3000, 3001)
- Docker network isolation (echobase-network, bridge driver)
- Nginx serving static assets
- Basic security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)

**Vulnerabilities:**
- ✅ **~~No Authentication:~~** ~~Anyone with network access can submit orders~~ **FIXED** - JWT + API Key authentication
- ℹ️ **No RBAC:** No role-based access control (low priority - basic auth sufficient)
- ✅ **~~Permissive CORS:~~** ~~`app.use(cors())` allows requests from ANY origin~~ **FIXED** - Now restricted to specific origin
- ❌ **No HTTPS/TLS:** All traffic in plaintext (HTTP only)
- ✅ **~~No Rate Limiting:~~** ~~Vulnerable to denial-of-service attacks~~ **FIXED** - 100 req/15min per IP
- ✅ **~~No Request Size Limits:~~** ~~Can accept unlimited payload sizes~~ **FIXED** - 1MB limit
- ✅ **~~No API Keys/Tokens:~~** ~~No client identity verification~~ **FIXED** - API Key + JWT authentication

**Attack Vectors:**
- ~~Unauthorized order submission from any source~~ ✅ **MITIGATED** (authentication required)
- ~~Cross-Site Request Forgery (CSRF) attacks~~ ✅ **MITIGATED** (CORS restrictions + authentication)
- ~~Denial of Service (DoS) through unlimited requests~~ ✅ **MITIGATED** (rate limiting)
- Man-in-the-middle attacks (no encryption)
- ~~Large payload attacks to exhaust resources~~ ✅ **MITIGATED** (size limits)
- ~~Cross-origin data exfiltration~~ ✅ **MITIGATED** (CORS restrictions)

**Risk Level:** 🟡 **MEDIUM** (was 🔴 **CRITICAL**)

---

### 2. Frontend ↔ API Gateway

**Location:** React Application → Express.js API

**Security Level:** **TRUSTED INTERNAL**

**Current Protection Mechanisms:**
- Communication over Docker internal network
- Hardcoded API endpoint URL in environment variables
- Input validation at API Gateway (required fields)
- Error handling with generic error messages

**Vulnerabilities:**
- ⚠️ **No TLS/Encryption:** HTTP communication within Docker network
- ✅ **~~No Input Sanitization:~~** ~~String values not validated for length or content~~ **FIXED** - Full validation & sanitization
- ✅ **~~No Business Logic Validation:~~** ~~Negative quantities/prices allowed~~ **FIXED** - Range validation & business rules
- ⚠️ **Hardcoded Endpoints:** API URL in environment variables (not secret)

**Attack Vectors:**
- Network sniffing within Docker network (if compromised)
- ~~Injection of malicious data (e.g., extremely long strings)~~ ✅ **MITIGATED** (input validation & sanitization)
- ~~Business logic bypass (negative values, special characters)~~ ✅ **MITIGATED** (validation rules)

**Risk Level:** 🟡 **MEDIUM**

---

### 3. API Gateway ↔ SQS Queue

**Location:** Express.js → Localstack (AWS SQS)

**Security Level:** **TRUSTED INTERNAL**

**Current Protection Mechanisms:**
- Internal Docker network communication
- SQS endpoint hardcoded in environment variables
- Message attributes for order metadata

**Vulnerabilities:**
- ❌ **Hardcoded AWS Credentials:** Access key and secret in `.env` files
  - AWS_ACCESS_KEY_ID=test
  - AWS_SECRET_ACCESS_KEY=test
- ❌ **No Message Encryption:** Order data transmitted in plaintext
- ❌ **No TLS:** HTTP communication to Localstack
- ⚠️ **Credentials in Environment Variables:** Visible in Docker logs/config

**Attack Vectors:**
- Credential exposure through environment variable leakage
- Queue message interception (if Docker network compromised)
- Unauthorized queue access if credentials are stolen
- Message tampering or deletion

**Risk Level:** 🟠 **HIGH** (Development), 🔴 **CRITICAL** (Production)

---

### 4. Order Processor ↔ SQS Queue

**Location:** Background Service → Localstack (AWS SQS)

**Security Level:** **TRUSTED INTERNAL**

**Current Protection Mechanisms:**
- Long polling (10 second wait time)
- Visibility timeout (30 seconds) prevents duplicate processing
- Dead Letter Queue for failed messages
- Message deletion only after successful processing

**Vulnerabilities:**
- ❌ **Hardcoded AWS Credentials:** Same as API Gateway
- ❌ **No Message Encryption:** Order data readable in queue
- ❌ **No Dead Letter Queue Monitoring:** Failed messages accumulate indefinitely
- ⚠️ **No Poison Message Handling:** Malformed messages could crash processor

**Attack Vectors:**
- Credential exposure
- Queue message interception
- Dead Letter Queue overflow
- Service disruption through malformed messages

**Risk Level:** 🟠 **HIGH**

---

### 5. Order Processor ↔ MariaDB (CRITICAL DATA BOUNDARY)

**Location:** Background Service → Database

**Security Level:** **TRUSTED INTERNAL**

**Current Protection Mechanisms:**
- ✅ **Parameterized SQL Queries:** Protection against SQL injection
  - `INSERT INTO orders (...) VALUES (?, ?, ?, ?, ?)`
- TCP connection with username/password authentication
- Database user with limited privileges (orderuser)
- Indexes for performance (idx_order_status, idx_created_at)

**Vulnerabilities:**
- ❌ **Hardcoded Database Credentials:**
  - DB_USER=orderuser
  - DB_PASSWORD=orderpass
- ❌ **No TLS/Encryption:** TCP connection in plaintext
- ❌ **No Encryption at Rest:** Database files stored unencrypted
- ❌ **Public Port Exposure:** Port 3306 exposed to localhost
- ⚠️ **Credentials Logged:** Database password visible in Docker logs
- ⚠️ **No Connection Pooling Limits:** Potential resource exhaustion

**Attack Vectors:**
- Database credential theft from environment variables
- Network sniffing to capture credentials (within Docker network)
- Direct database access if credentials are compromised
- Data exfiltration from unencrypted database files
- Connection exhaustion attacks

**Risk Level:** 🔴 **CRITICAL**

---

## Attack Surfaces

### A. Frontend (React/Nginx)

**Entry Points:**
- HTTP endpoint on port 3000 (localhost)
- Static asset serving
- User input form (order submission)

**Attack Vectors:**
1. **Cross-Site Scripting (XSS)**
   - User input not sanitized in UI
   - Potential for stored XSS if data reflected back
   - *Mitigation:* X-XSS-Protection header enabled

2. **Clickjacking**
   - *Mitigation:* X-Frame-Options: SAMEORIGIN header enabled

3. **MIME Sniffing**
   - *Mitigation:* X-Content-Type-Options: nosniff enabled

4. **Denial of Service**
   - No rate limiting on static asset requests
   - *Risk:* Resource exhaustion through rapid requests

**Current Security Score:** 🟡 **5/10**

---

### B. API Gateway (Express.js)

**Entry Points:**
- `GET /health` - Health check endpoint (no auth required)
- `POST /api/auth/register` - User registration (no auth required)
- `POST /api/auth/login` - User login (no auth required)
- `POST /api/orders` - Order submission endpoint (auth required)
- `GET /api/orders` - Order info endpoint (testing)

**Security Improvements Implemented:**
✅ **Helmet Security Headers** - Protection against XSS, clickjacking, MIME sniffing (2025-10-27)
✅ **CORS Restrictions** - Limited to specific origin (`http://localhost:3000`) (2025-10-27)
✅ **Rate Limiting** - 100 requests per 15 minutes per IP (2025-10-27)
✅ **Request Size Limits** - 1MB maximum payload size (2025-10-27)
✅ **Input Validation** - Comprehensive validation with express-validator (2025-10-27)
✅ **Input Sanitization** - HTML escaping, trimming, type conversion (2025-10-27)
✅ **Business Logic Validation** - Order total value limits (2025-10-27)
✅ **Error Handling** - Generic errors, no information disclosure (2025-10-27)
✅ **JWT Authentication** - User authentication with bcrypt password hashing (2025-10-28)
✅ **API Key Authentication** - Service-to-service authentication (2025-10-28)

**Attack Vectors:**
1. **Unauthenticated Access** ✅ **FIXED**
   - Was: No API keys, tokens, or authentication required
   - Now: JWT or API Key required for all order operations
   - *Impact:* Only authenticated users/services can submit orders
   - Implementation: `authenticateEither` middleware (JWT or API key)

2. **Cross-Origin Resource Sharing (CORS)** ✅ **FIXED**
   - Was: `app.use(cors())` allows ALL origins
   - Now: Restricted to `process.env.CORS_ORIGIN` (default: `http://localhost:3000`)
   - *Impact:* Prevents unauthorized cross-origin requests

3. **Denial of Service (DoS)** ✅ **MITIGATED**
   - Was: No rate limiting or throttling
   - Now: Rate limited to 100 requests per 15 minutes per IP
   - Request size limited to 1MB
   - *Impact:* Significantly reduces DoS attack surface

4. **Input Validation Bypass** ✅ **FIXED**
   - Was: Only checks for required fields
   - Now: Comprehensive validation for:
     - ✅ String length limits (1-255 characters)
     - ✅ Character pattern validation (alphanumeric + safe characters)
     - ✅ Numeric range validation (quantity: 1-10,000, price: 0.01-1,000,000)
     - ✅ Business logic validation (order total < $1M)
   - *Impact:* Prevents injection attacks and data integrity issues

5. **Information Disclosure** ✅ **FIXED**
   - Was: Error messages may leak system information
   - Now: Generic error messages, no stack traces exposed
   - *Impact:* Reduces information leakage

6. **Mass Assignment** ⚠️ **Partially Mitigated**
   - Validation only processes specified fields
   - Extra fields in payload are ignored
   - *Impact:* Reduced risk of unintended data storage

**Security Score:** 🟢 **8/10** (was 🔴 **3/10**)

**Remaining Gaps:**
- ❌ No HTTPS/TLS (acceptable for local development)
- ⚠️ Basic audit logging only (includes auth tracking)

**See `SECURITY-IMPROVEMENTS.md` and `AUTHENTICATION.md` for detailed implementation guides.**

---

### C. SQS Queue (Localstack)

**Entry Points:**
- SQS API endpoint at port 4566
- Queue URL: `http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue`

**Attack Vectors:**
1. **Credential Theft**
   - AWS credentials hardcoded in `.env` files
   - *Risk:* Unauthorized queue access, message manipulation

2. **Message Interception**
   - No encryption in transit (HTTP)
   - *Risk:* Data leakage, privacy violations

3. **Message Tampering**
   - No message signing or integrity checks
   - *Risk:* Data corruption, fraudulent orders

4. **Queue Flooding**
   - No message count limits enforced
   - *Risk:* Queue overflow, cost escalation (production)

5. **Dead Letter Queue Overflow**
   - No monitoring or automatic cleanup
   - *Risk:* Lost orders, indefinite message retention

**Current Security Score:** 🔴 **2/10**

---

### D. Order Processor (Background Service)

**Entry Points:**
- SQS message polling (every 5 seconds)
- Database connection

**Attack Vectors:**
1. **Poison Message Attack**
   - Malformed JSON could crash the service
   - No validation of message structure before parsing
   - *Risk:* Service disruption, order processing failure

2. **Resource Exhaustion**
   - Processes up to 10 messages per poll
   - No timeout limits on database operations
   - *Risk:* Memory exhaustion, database connection pool depletion

3. **Credential Exposure**
   - DB credentials logged at startup
   - Environment variables visible in process list
   - *Risk:* Database credential theft

4. **Race Conditions**
   - Visibility timeout (30s) may cause duplicate processing if operation slow
   - *Risk:* Duplicate orders in database

**Current Security Score:** 🟡 **4/10**

---

### E. MariaDB Database

**Entry Points:**
- TCP connection on port 3306 (exposed to localhost)
- Database connection from Order Processor

**Attack Vectors:**
1. **Credential-Based Attacks**
   - Weak credentials (orderuser/orderpass)
   - Credentials stored in plaintext in `.env` files
   - *Risk:* Unauthorized database access

2. **SQL Injection** ✅ **PROTECTED**
   - Parameterized queries used throughout
   - *Risk:* LOW (good implementation)

3. **Data Exfiltration**
   - No encryption at rest
   - Database files accessible if host compromised
   - *Risk:* Complete data breach

4. **Direct Database Access**
   - Port 3306 exposed to localhost
   - If Docker host compromised, database is accessible
   - *Risk:* Bypass application logic, direct data manipulation

5. **No Audit Trail**
   - No logging of database access or modifications
   - Cannot trace who accessed what data
   - *Risk:* Compliance violations, undetectable breaches

**Current Security Score:** 🟡 **5/10**

---

## Security Gaps Summary

### Critical Gaps (Production Blockers)

1. ~~**No Authentication/Authorization System**~~ ✅ **FIXED**
   - ~~Impact: Anyone can submit orders~~
   - ~~Components: Frontend, API Gateway~~
   - ~~Recommendation: Implement JWT or OAuth2~~
   - **Implementation:** JWT + API Key authentication (2025-10-28)

2. **No HTTPS/TLS Encryption**
   - Impact: All traffic in plaintext
   - Components: All network communications
   - Recommendation: Enable TLS certificates, enforce HTTPS

3. **Hardcoded Credentials in Environment Variables**
   - Impact: Easy credential theft
   - Components: API Gateway, Order Processor
   - Recommendation: Use AWS Secrets Manager, Vault, or managed identities

4. ~~**Permissive CORS Configuration**~~ ✅ **FIXED**
   - ~~Impact: Any website can access API~~
   - ~~Components: API Gateway~~
   - ~~Recommendation: Restrict to specific origins~~

5. ~~**No Rate Limiting or Throttling**~~ ✅ **FIXED**
   - ~~Impact: DoS vulnerability~~
   - ~~Components: API Gateway, Frontend~~
   - ~~Recommendation: Implement rate limiting middleware~~

---

### High Priority Gaps

6. ~~**No Input Sanitization**~~ ✅ **FIXED**
   - ~~Impact: Data integrity issues, potential injection~~
   - ~~Components: API Gateway~~
   - ~~Recommendation: Validate string lengths, patterns, ranges~~

7. ~~**No Request Size Limits**~~ ✅ **FIXED**
   - ~~Impact: Resource exhaustion~~
   - ~~Components: API Gateway~~
   - ~~Recommendation: Add payload size limits (e.g., 1MB max)~~

8. **No Message Encryption**
   - Impact: Queue data readable in transit
   - Components: SQS Queue
   - Recommendation: Enable SQS encryption (KMS)

9. **Database Encryption at Rest Disabled**
   - Impact: Data readable if storage compromised
   - Components: MariaDB
   - Recommendation: Enable transparent data encryption (TDE)

10. **No Audit Logging**
    - Impact: Cannot trace security incidents
    - Components: All components
    - Recommendation: Implement centralized logging (CloudWatch, ELK stack)

---

### Medium Priority Gaps

11. **No Dead Letter Queue Monitoring**
    - Impact: Failed orders lost indefinitely
    - Components: SQS, Order Processor
    - Recommendation: Add DLQ alarms and automated reprocessing

12. ~~**Weak Database Credentials**~~ ✅ **FIXED**
    - ~~Impact: Easy brute force~~
    - ~~Components: MariaDB~~
    - ~~Recommendation: Use strong, randomly generated passwords~~

13. **No API Versioning**
    - Impact: Breaking changes affect all clients
    - Components: API Gateway
    - Recommendation: Implement `/v1/` prefix

14. ~~**Insufficient Business Logic Validation**~~ ✅ **FIXED**
    - ~~Impact: Invalid data in database~~
    - ~~Components: API Gateway, Order Processor~~
    - ~~Recommendation: Add min/max constraints, enum validation~~

15. **Port Exposure to Localhost**
    - Impact: Services accessible if host compromised
    - Components: All services
    - Recommendation: Use internal Docker networks only, remove port mappings

---

### Low Priority Gaps

16. **No Role-Based Access Control (RBAC)**
    - Impact: All authenticated users have same permissions
    - Components: API Gateway
    - Recommendation: Implement role system (admin, user, service) for future scalability
    - Note: Basic authentication is sufficient for current requirements

---

## Recommended Security Enhancements

### Phase 1: Critical (Before Production)

1. **Implement Authentication & Authorization**
   ```javascript
   // Example: JWT middleware
   const jwt = require('jsonwebtoken');
   app.use('/api', authenticateToken);
   ```

2. **Enable HTTPS/TLS**
   - Obtain SSL/TLS certificates (Let's Encrypt, ACM)
   - Configure Nginx for HTTPS
   - Redirect HTTP → HTTPS

3. **Restrict CORS**
   ```javascript
   app.use(cors({
     origin: 'https://yourdomain.com',
     credentials: true
   }));
   ```

4. **Use AWS Secrets Manager**
   ```javascript
   // Replace hardcoded credentials
   const AWS = require('aws-sdk');
   const secretsManager = new AWS.SecretsManager();
   const dbCredentials = await secretsManager.getSecretValue({
     SecretId: 'prod/db/credentials'
   }).promise();
   ```

5. **Implement Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   app.use('/api/', limiter);
   ```

---

### Phase 2: High Priority

6. **Add Input Validation & Sanitization**
   ```javascript
   const { body, validationResult } = require('express-validator');

   app.post('/api/orders', [
     body('customerName').isLength({ min: 1, max: 255 }).trim().escape(),
     body('productName').isLength({ min: 1, max: 255 }).trim().escape(),
     body('quantity').isInt({ min: 1, max: 10000 }),
     body('totalPrice').isFloat({ min: 0.01, max: 1000000 })
   ], (req, res) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       return res.status(400).json({ errors: errors.array() });
     }
     // Process order
   });
   ```

7. **Add Request Size Limits**
   ```javascript
   app.use(express.json({ limit: '1mb' }));
   ```

8. **Enable SQS Encryption**
   ```hcl
   # Terraform
   resource "aws_sqs_queue" "order_queue" {
     name                       = "order-processing-queue"
     kms_master_key_id         = aws_kms_key.sqs_encryption.id
     kms_data_key_reuse_period_seconds = 300
   }
   ```

9. **Enable Database Encryption**
   - Use AWS RDS with encryption enabled
   - Or configure MariaDB with TDE plugin

10. **Implement Audit Logging**
    ```javascript
    const winston = require('winston');
    const logger = winston.createLogger({
      transports: [
        new winston.transports.File({ filename: 'audit.log' })
      ]
    });

    logger.info('Order submitted', {
      userId: req.user.id,
      orderId: messageId,
      timestamp: new Date(),
      ip: req.ip
    });
    ```

---

### Phase 3: Medium Priority

11. **Add DLQ Monitoring**
    ```javascript
    // CloudWatch alarm for DLQ depth
    const alarm = new cloudwatch.Alarm(this, 'DLQAlarm', {
      metric: dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 10,
      evaluationPeriods: 1
    });
    ```

12. **Implement API Versioning**
    ```javascript
    app.use('/v1/api/orders', ordersRouter);
    ```

13. **Add Business Logic Validation**
    ```javascript
    if (quantity < 1 || quantity > 10000) {
      return res.status(400).json({
        error: 'Quantity must be between 1 and 10000'
      });
    }
    ```

14. **Network Segmentation**
    - Move database to private subnet (no internet access)
    - Use security groups to restrict inter-service communication
    - Remove port mappings for internal services

15. **Add Security Monitoring**
    - Enable AWS GuardDuty (threat detection)
    - Implement Web Application Firewall (WAF)
    - Set up intrusion detection system (IDS)

---

## Threat Model Summary

### Threat Actors

1. **External Attackers (Internet)**
   - Goal: Disrupt service, steal data, commit fraud
   - Access: Public endpoints (Frontend, API)
   - Capabilities: Unlimited requests, CSRF, XSS

2. **Malicious Insiders (Developers/Operators)**
   - Goal: Data exfiltration, sabotage
   - Access: Docker host, environment variables, database
   - Capabilities: Credential theft, direct DB access

3. **Compromised Dependencies**
   - Goal: Supply chain attack
   - Access: npm packages, Docker images
   - Capabilities: Code execution, backdoor installation

---

### Attack Scenarios

**Scenario 1: Unauthorized Order Submission** ⚠️ **PARTIALLY MITIGATED**
1. Attacker discovers API endpoint (port scan or documentation)
2. ~~Submits thousands of fraudulent orders (no rate limiting)~~ **MITIGATED** - Rate limited to 100 req/15min
3. ~~Queue and database overflow~~ **MITIGATED** - Rate limiting prevents overflow
4. Legitimate orders cannot be processed (authentication still needed)
**Impact:** ~~DoS~~ **MITIGATED**, data pollution (still possible), business disruption (reduced)

**Scenario 2: Credential Theft & Database Breach**
1. Attacker gains access to Docker host (unrelated vulnerability)
2. Reads `.env` file containing DB credentials
3. Connects directly to MariaDB (port 3306)
4. Exfiltrates all order data (no encryption at rest)
**Impact:** Complete data breach, privacy violations, compliance penalties

**Scenario 3: Man-in-the-Middle Attack**
1. Attacker intercepts network traffic (HTTP, no TLS)
2. Reads order data in transit (plaintext)
3. Modifies orders before they reach API (no integrity checks)
**Impact:** Data theft, order fraud

**Scenario 4: Cross-Site Request Forgery (CSRF)** ✅ **MITIGATED**
1. Attacker creates malicious website
2. User visits while authenticated (hypothetically)
3. ~~Malicious site submits orders to API (CORS allows all origins)~~ **MITIGATED** - CORS restricted to localhost:3000
4. ~~Orders created without user consent~~ **PREVENTED** - CORS blocks cross-origin requests
**Impact:** ~~Fraudulent orders~~ **MITIGATED**, ~~user account compromise~~ **MITIGATED**

---

## Compliance Considerations

### PCI DSS (Payment Card Data)
- ❌ Not compliant (no encryption, weak access controls)
- Required if storing credit card information

### GDPR (Personal Data)
- ❌ Not compliant (no encryption, no audit logging, no access controls)
- Required if processing EU citizen data
- Missing: Data minimization, right to erasure, breach notification

### SOC 2 (Service Organization Controls)
- ❌ Not compliant (insufficient security controls)
- Required for SaaS providers
- Missing: Access controls, encryption, monitoring, incident response

### HIPAA (Healthcare Data)
- ❌ Not compliant (no encryption, no audit logging)
- Required if processing health information

---

## References

### Key Files
- API Gateway: `backend/api-gateway/server.js`
- Order Processor: `backend/order-processor/processor.js`
- Frontend: `frontend/src/App.jsx`
- Docker Compose: `docker-compose.yml`
- Terraform: `terraform/main.tf`, `terraform/sqs.tf`
- Database Schema: `init-db.sql`
- Nginx Config: `frontend/nginx.conf`

### Security Best Practices
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- AWS Security Best Practices: https://docs.aws.amazon.com/security/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework

---

**Document Version:** 1.1
**Last Updated:** 2025-10-28
**Next Review:** Before production deployment

**Security Status:** ⚠️ **NOT PRODUCTION READY** - Multiple critical vulnerabilities identified

**Recent Updates:**
- **2025-10-27:** Implemented API Gateway security hardening (CORS, rate limiting, input validation, sanitization, business logic validation, error handling)
- **2025-10-28:** Implemented authentication system (JWT + API Key) with user registration/login, password hashing (bcrypt), API key generation utility, and database tables for users and API keys. Updated security assessment to reflect authentication implementation.
