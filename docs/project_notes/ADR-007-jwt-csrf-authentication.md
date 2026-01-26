# ADR-007: JWT Authentication with CSRF Protection

## Status

Accepted

## Date

2026-01-24

## Context

The API Gateway needs to:
- Authenticate users for protected endpoints (order submission)
- Support both browser-based (frontend) and service-to-service access
- Protect against common web attacks (CSRF, XSS)
- Be stateless for horizontal scaling

## Decision

Implement **dual authentication** with JWT for users and API keys for services, plus **CSRF protection** via Origin header validation.

### Authentication Methods

#### 1. JWT (JSON Web Token) - User Authentication

```
┌─────────────────────────────────────────────────────────────────┐
│                      JWT FLOW                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. REGISTER                                                     │
│     POST /api/v1/auth/register                                   │
│     Body: { username, email, password }                          │
│     Response: { token: "eyJ...", user: {...} }                  │
│                                                                  │
│  2. LOGIN                                                        │
│     POST /api/v1/auth/login                                      │
│     Body: { username, password }                                 │
│     Response: { token: "eyJ...", user: {...} }                  │
│                                                                  │
│  3. ACCESS PROTECTED ENDPOINTS                                   │
│     GET /api/v1/orders                                           │
│     Header: Authorization: Bearer eyJ...                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**JWT Details:**
- Algorithm: HS256 (HMAC with SHA-256)
- Expiration: 24 hours
- Payload: `{ userId, username, iat, exp }`
- Secret: Stored in environment variable `JWT_SECRET`

#### 2. API Key - Service Authentication

For service-to-service or automated access:
```
Header: X-API-Key: <api-key>
```

### CSRF Protection

The CSRF middleware validates the `Origin` header for state-changing requests:

```javascript
// middleware/csrf-middleware.js
function csrfProtection(req, res, next) {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Validate Origin against CORS_ORIGIN
    const origin = req.get('origin');
    const allowedOrigins = process.env.CORS_ORIGIN.split(',');

    if (!allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: 'Origin validation failed' });
    }

    next();
}
```

**Why Origin validation works:**
- Browsers always send Origin header for cross-origin requests
- Attackers can't set custom Origin header via JavaScript
- Combined with CORS, prevents cross-site request forgery

### CORS Configuration

```javascript
const corsOptions = {
    origin: process.env.CORS_ORIGIN.split(','),  // e.g., "https://localhost:3443"
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
};
```

### Password Security

- **Hashing**: bcrypt with cost factor 12
- **Validation**: Minimum 8 chars, uppercase, lowercase, number
- **Storage**: Only hash stored in database, never plaintext

## Consequences

### Positive

- **Stateless**: JWT contains all auth info, no session storage needed
- **Scalable**: Any API instance can validate tokens
- **Dual access**: Users and services both supported
- **CSRF protected**: Origin validation prevents cross-site attacks
- **Standard**: JWT is widely supported, easy to debug

### Negative

- **Token revocation**: Can't invalidate JWT before expiration (would need blacklist)
- **Token size**: JWT larger than session ID (but acceptable)
- **Secret management**: JWT_SECRET must be protected

### Neutral

- **24h expiration**: Balance between security and user convenience
- **No refresh tokens**: Simplified implementation, users re-login after expiration

## Security Headers

In addition to authentication, Helmet middleware adds security headers:

```javascript
app.use(helmet());
// Adds: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, etc.
```

## Alternatives Considered

### 1. Session-based authentication

**Rejected**: Requires shared session storage for horizontal scaling. JWT is stateless.

### 2. OAuth2 / OpenID Connect

**Considered for future**: Good for third-party integration, but overkill for current needs.

### 3. CSRF tokens in forms

**Rejected**: More complex, requires server-side token storage. Origin validation is simpler and sufficient.

### 4. Cookie-based JWT

**Rejected**: Vulnerable to CSRF without additional protection. Authorization header is safer.

## References

- `backend/api-gateway/server.js` - JWT and CORS configuration
- `backend/api-gateway/middleware/csrf-middleware.js` - CSRF protection
- `docs/AUTHENTICATION.md` - User-facing authentication documentation
- `docs/SECURITY.md` - Security overview
