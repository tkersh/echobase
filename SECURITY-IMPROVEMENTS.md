# Security Improvements

This document details the security improvements implemented in the Echobase application.

**Date Implemented:** 2025-10-27
**Version:** 2.0 (Security Hardened)

---

## Overview

Based on the security analysis in `TrustBoundaries.md`, we've implemented multiple layers of security hardening for the API Gateway, focusing on practical improvements that enhance security without requiring complex authentication systems or TLS certificates for local development.

## Security Features Implemented

### 1. Helmet (Security Headers) ✅

**Risk Mitigated:** Various web vulnerabilities (XSS, clickjacking, MIME sniffing)

**Implementation:**
```javascript
const helmet = require('helmet');
app.use(helmet());
```

**Headers Added:**
- `X-DNS-Prefetch-Control`: Controls browser DNS prefetching
- `X-Frame-Options`: Prevents clickjacking attacks
- `Strict-Transport-Security`: Forces HTTPS (when enabled)
- `X-Download-Options`: Prevents IE from executing downloads
- `X-Content-Type-Options`: Prevents MIME sniffing
- `X-XSS-Protection`: Enables browser XSS protection

**Impact:** 🟢 **HIGH** - Protects against common web vulnerabilities

---

### 2. CORS Restrictions ✅

**Risk Mitigated:** Cross-origin attacks, CSRF vulnerabilities

**Before:**
```javascript
app.use(cors()); // Allows ALL origins - DANGEROUS
```

**After:**
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
  maxAge: 86400,
};
app.use(cors(corsOptions));
```

**Configuration:**
- Environment variable: `CORS_ORIGIN`
- Default: `http://localhost:3000`
- Only allows specified origin(s)
- Limits methods to GET and POST
- Restricts headers to Content-Type

**Impact:** 🟢 **CRITICAL** - Prevents unauthorized cross-origin access

---

### 3. Rate Limiting ✅

**Risk Mitigated:** Denial of Service (DoS) attacks, brute force attempts

**Implementation:**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

**Configuration:**
- `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds (default: 900000 = 15 minutes)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: 100)

**Features:**
- Applied to `/api/` routes only (not health checks)
- Returns rate limit info in `RateLimit-*` headers
- IP-based tracking
- Automatic cleanup of expired records

**Impact:** 🟢 **HIGH** - Prevents resource exhaustion attacks

---

### 4. Request Size Limits ✅

**Risk Mitigated:** Large payload attacks, memory exhaustion

**Implementation:**
```javascript
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
```

**Limits:**
- JSON payloads: 1 MB maximum
- URL-encoded payloads: 1 MB maximum

**Impact:** 🟡 **MEDIUM** - Prevents resource exhaustion from oversized requests

---

### 5. Input Validation & Sanitization ✅

**Risk Mitigated:** Injection attacks, XSS, invalid data

**Implementation:**
```javascript
const { body, validationResult } = require('express-validator');

const orderValidation = [
  body('customerName')
    .trim()
    .isLength({ min: 1, max: 255 })
    .matches(/^[a-zA-Z0-9\s\-'.]+$/)
    .escape(),
  // ... similar for other fields
];

app.post('/api/orders', orderValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  // ... process order
});
```

**Validation Rules:**

| Field | Rules |
|-------|-------|
| `customerName` | Length: 1-255 chars, Pattern: alphanumeric + spaces/hyphens/apostrophes/periods, Escaped |
| `productName` | Length: 1-255 chars, Pattern: alphanumeric + spaces/hyphens/apostrophes/periods, Escaped |
| `quantity` | Integer, Range: 1-10,000 |
| `totalPrice` | Float, Range: 0.01-1,000,000 |

**Sanitization:**
- `.trim()`: Removes leading/trailing whitespace
- `.escape()`: Escapes HTML entities
- `.toInt()` / `.toFloat()`: Type conversion

**Impact:** 🟢 **CRITICAL** - Prevents injection attacks and data corruption

---

### 6. Business Logic Validation ✅

**Risk Mitigated:** Invalid business transactions, fraud

**Implementation:**
```javascript
// Additional business logic validation
if (quantity * totalPrice > 1000000) {
  return res.status(400).json({
    error: 'Order total exceeds maximum allowed value',
    message: 'Order value (quantity × price) cannot exceed $1,000,000',
  });
}
```

**Rules:**
- Order total value (quantity × price) cannot exceed $1,000,000
- Prevents obviously fraudulent or erroneous orders

**Impact:** 🟡 **MEDIUM** - Adds business logic layer protection

---

### 7. Error Handling & Information Disclosure ✅

**Risk Mitigated:** Information leakage, stack trace exposure

**Before:**
```javascript
catch (error) {
  res.status(500).json({ error: 'Failed to submit order', details: error.message });
}
```

**After:**
```javascript
catch (error) {
  console.error('Error submitting order:', error);
  // Security: Don't expose internal error details to client
  res.status(500).json({
    error: 'Failed to submit order',
    message: 'An error occurred while processing your order. Please try again later.',
  });
}
```

**Features:**
- Generic error messages for clients
- Detailed logging server-side
- No stack trace exposure
- Separate 404 and 500 error handlers

**Impact:** 🟡 **MEDIUM** - Prevents information leakage

---

### 8. Basic Audit Logging ✅

**Risk Mitigated:** Lack of accountability, incident investigation

**Implementation:**
```javascript
// Log for audit trail (in production, use proper logging service)
console.log(`Order submitted: ${result.MessageId} - ${customerName} - ${productName}`);
```

**Current Logging:**
- Order submissions (MessageId, customer, product)
- Errors (full stack traces)
- Startup configuration

**Recommendations for Production:**
- Use structured logging (Winston, Bunyan)
- Send logs to centralized service (CloudWatch, ELK)
- Include request IDs, user IDs, timestamps
- Log authentication attempts, authorization failures

**Impact:** 🟡 **MEDIUM** - Enables basic audit trail

---

## Configuration

### Environment Variables

Add these to your `.env` file (automatically added by `generate-credentials.sh`):

```bash
# API Gateway Security Configuration
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=100       # Max requests per window
```

### Dependencies Added

```json
{
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5",
  "express-validator": "^7.0.1"
}
```

---

## Testing the Security Improvements

### 1. Test CORS Restrictions

```bash
# Should succeed (from allowed origin)
curl -X POST http://localhost:3001/api/orders \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget","quantity":1,"totalPrice":9.99}'

# Should fail (from disallowed origin)
curl -X POST http://localhost:3001/api/orders \
  -H "Origin: http://evil-site.com" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget","quantity":1,"totalPrice":9.99}'
```

### 2. Test Rate Limiting

```bash
# Run this script to trigger rate limiting
for i in {1..105}; do
  curl -X POST http://localhost:3001/api/orders \
    -H "Content-Type: application/json" \
    -d '{"customerName":"Test","productName":"Widget","quantity":1,"totalPrice":9.99}'
  echo "Request $i"
done

# After 100 requests, you should see:
# {"error":"Too many requests from this IP, please try again later."}
```

### 3. Test Input Validation

```bash
# Test 1: Missing required field (should fail)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget"}'

# Test 2: Invalid quantity (should fail)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget","quantity":-5,"totalPrice":9.99}'

# Test 3: Quantity too large (should fail)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget","quantity":99999,"totalPrice":9.99}'

# Test 4: Invalid characters in name (should fail)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"<script>alert(1)</script>","productName":"Widget","quantity":1,"totalPrice":9.99}'

# Test 5: Valid order (should succeed)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"John Doe","productName":"Widget","quantity":5,"totalPrice":49.95}'
```

### 4. Test Business Logic Validation

```bash
# Order total exceeds $1,000,000 (should fail)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","productName":"Widget","quantity":1000,"totalPrice":1001}'
```

### 5. Test Request Size Limits

```bash
# Generate a large payload (>1MB) - should fail
python3 -c "print('{\"customerName\":\"' + 'A'*2000000 + '\",\"productName\":\"Test\",\"quantity\":1,\"totalPrice\":9.99}')" | \
  curl -X POST http://localhost:3001/api/orders \
    -H "Content-Type: application/json" \
    -d @-
```

---

## Security Score Improvement

### Before (Original Implementation)

**API Gateway Security Score:** 🔴 **3/10**

❌ No authentication
❌ Permissive CORS (allows all origins)
❌ No rate limiting
❌ No request size limits
❌ Minimal input validation
❌ No sanitization
❌ Information disclosure in errors
❌ No security headers

### After (Current Implementation)

**API Gateway Security Score:** 🟡 **7/10**

✅ Security headers (Helmet)
✅ CORS restrictions
✅ Rate limiting
✅ Request size limits
✅ Comprehensive input validation
✅ Input sanitization
✅ Business logic validation
✅ Error handling (no information disclosure)
✅ Basic audit logging

⚠️ Still Missing (for production):
- Authentication & authorization
- HTTPS/TLS
- Database encryption at rest
- Centralized audit logging
- API versioning
- Comprehensive monitoring/alerting

---

## Impact on Attack Surfaces

| Attack Surface | Before | After | Improvement |
|----------------|--------|-------|-------------|
| **CORS** | 🔴 Any origin | 🟢 Specific origin | **Critical** |
| **DoS** | 🔴 Unlimited requests | 🟢 Rate limited | **High** |
| **Injection** | 🔴 No validation | 🟢 Validated & sanitized | **Critical** |
| **XSS** | 🔴 No sanitization | 🟢 Input escaped | **High** |
| **Payload Attacks** | 🔴 No limits | 🟢 1MB limit | **Medium** |
| **Info Disclosure** | 🔴 Error details exposed | 🟢 Generic errors | **Medium** |
| **Clickjacking** | 🟡 Nginx headers | 🟢 Helmet headers | **High** |
| **Business Logic** | 🔴 No validation | 🟢 Validated | **Medium** |

---

## Production Recommendations

### Immediate Next Steps

1. **Authentication & Authorization**
   - Implement JWT-based authentication
   - Add role-based access control (RBAC)
   - Use the pre-generated `JWT_SECRET` from `.env`

2. **HTTPS/TLS**
   - Obtain SSL/TLS certificates (Let's Encrypt, ACM)
   - Configure Nginx or ALB for HTTPS
   - Redirect HTTP → HTTPS
   - Enable HSTS (already configured by Helmet when using HTTPS)

3. **Enhanced Logging**
   - Implement structured logging (Winston)
   - Send logs to CloudWatch/ELK
   - Add request IDs for tracing
   - Include user context in logs

4. **Database Security**
   - Enable encryption at rest
   - Use TLS for database connections
   - Implement connection pooling limits
   - Add database query timeout limits

5. **Monitoring & Alerting**
   - Set up application monitoring (Datadog, New Relic)
   - Configure alerts for:
     - Rate limit threshold breaches
     - High error rates
     - Unusual traffic patterns
     - Failed validation attempts

6. **Additional Hardening**
   - Implement API versioning (`/v1/api/orders`)
   - Add request signing for sensitive operations
   - Implement idempotency keys
   - Add webhook signature verification
   - Enable CSP (Content Security Policy) headers

---

## Files Modified

### Created/Updated:
- `backend/api-gateway/server.js` - Complete security rewrite
- `backend/api-gateway/package.json` - Added security dependencies
- `.env.example` - Added CORS and rate limit config
- `generate-credentials.sh` - Added new config variables
- `SECURITY-IMPROVEMENTS.md` - This document

### Documentation:
- See `SECURITY.md` for complete security guide
- See `TrustBoundaries.md` for threat analysis
- See `README.md` for setup instructions

---

## Deployment Instructions

### For Existing Installations

1. **Update dependencies:**
   ```bash
   cd backend/api-gateway
   npm install
   cd ../..
   ```

2. **Update .env file:**
   ```bash
   # Add these lines to your .env file:
   CORS_ORIGIN=http://localhost:3000
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

3. **Rebuild Docker images:**
   ```bash
   docker-compose down
   docker-compose build api-gateway
   docker-compose up -d
   ```

4. **Test the security features:**
   ```bash
   # Check security headers
   curl -I http://localhost:3001/health

   # Test rate limiting
   # (run curl in a loop)

   # Test input validation
   # (see testing section above)
   ```

### For New Installations

Run the standard setup:
```bash
./generate-credentials.sh
./setup.sh
./start.sh
```

Security features are automatically enabled!

---

## Maintenance

### Regular Security Tasks

**Weekly:**
- Review application logs for suspicious activity
- Check rate limit metrics

**Monthly:**
- Update dependencies (`npm update`)
- Run security audit (`npm audit`)
- Review and rotate credentials if needed

**Quarterly:**
- Review and update security policies
- Conduct security testing
- Update this documentation

---

**Document Version:** 1.0
**Last Updated:** 2025-10-27
**Next Review:** 2025-11-27
**Maintained By:** Development Team

---

## References

- Main Security Guide: `SECURITY.md`
- Trust Boundaries Analysis: `TrustBoundaries.md`
- IAM Setup: `IAM-SETUP.md`
- README: `README.md`

## External Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet Documentation](https://helmetjs.github.io/)
- [express-validator Documentation](https://express-validator.github.io/)
- [express-rate-limit Documentation](https://github.com/express-rate-limit/express-rate-limit)