# ADR-008: Express.js API Gateway

## Status

Accepted

## Date

2026-01-24

## Context

The application needs a backend API service that:
- Handles user authentication (registration, login)
- Validates and processes order submissions
- Integrates with AWS services (SQS, Secrets Manager)
- Serves as the single entry point for all API requests
- Supports HTTPS with self-signed certificates for development

## Decision

Use **Express.js** as the API Gateway framework, implementing a monolithic API service that handles all backend functionality.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       API GATEWAY                                │
│                    (Express.js + Node.js)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Middleware    │  │     Routes      │  │    Services     │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ • Helmet        │  │ • /health       │  │ • Auth Service  │ │
│  │ • CORS          │  │ • /api/v1/auth  │  │ • Order Service │ │
│  │ • CSRF          │  │ • /api/v1/orders│  │ • SQS Client    │ │
│  │ • Rate Limiting │  │ • /api/orders   │  │ • DB Connection │ │
│  │ • Body Parser   │  │   (legacy)      │  │                 │ │
│  │ • Compression   │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ MariaDB  │   │   SQS    │   │   Secrets    │
        │          │   │  Queue   │   │   Manager    │
        └──────────┘   └──────────┘   └──────────────┘
```

### Key Components

**Security Middleware Stack:**
```javascript
app.use(helmet());           // Security headers
app.use(cors(corsOptions));  // CORS restrictions
app.use(csrfProtection);     // Origin validation
app.use(rateLimiter);        // DoS protection
app.use(compression());      // Response compression
```

**Route Structure:**
```
/health              - Health check endpoint
/api/v1/auth/        - Authentication routes
  ├── register       - User registration
  └── login          - User login
/api/v1/orders       - Order routes (authenticated)
  ├── GET /          - List user's orders
  └── POST /         - Submit new order
/api/orders          - Legacy routes (redirect to v1)
```

**Database Integration:**
- Connection pool with mysql2 driver
- Credentials fetched from Secrets Manager at startup
- Parameterized queries to prevent SQL injection

## Consequences

### Positive

- **Mature ecosystem**: Extensive middleware library (helmet, cors, express-validator)
- **Simple learning curve**: Well-documented, widely used
- **Flexible**: Easy to add routes, middleware, integrations
- **Good performance**: Sufficient for expected load
- **AWS SDK support**: Official @aws-sdk packages work well

### Negative

- **Callback-based**: Requires async/await wrappers for clean code
- **No built-in structure**: Must establish conventions manually
- **Single process**: Needs cluster mode or PM2 for multi-core utilization

### Neutral

- **Monolithic**: Single service handles all API functionality (appropriate for current scale)
- **No TypeScript**: Using plain JavaScript (reduces complexity, faster iteration)

## Security Implementation

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT with HS256, 24h expiry |
| Password hashing | bcrypt, cost factor 12 |
| CORS | Configurable via CORS_ORIGIN env |
| CSRF | Origin header validation |
| Rate limiting | 100 req/15min per IP (configurable) |
| Input validation | express-validator |
| SQL injection | Parameterized queries |
| Headers | Helmet (XSS, clickjacking, MIME sniffing) |

## Configuration

Environment variables:
```bash
PORT=3001                              # API port
JWT_SECRET=<secret>                    # JWT signing key
CORS_ORIGIN=https://localhost:3443     # Allowed origins
RATE_LIMIT_WINDOW_MS=900000            # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100            # Max requests per window
SQS_ENDPOINT=http://localstack:4566    # SQS endpoint
SECRETS_MANAGER_ENDPOINT=http://...    # Secrets Manager endpoint
```

## Alternatives Considered

### 1. Fastify

**Considered**: Better performance, built-in validation, TypeScript support.
**Not chosen**: Less mature ecosystem at decision time, smaller community.

### 2. NestJS

**Considered**: Structured, TypeScript-first, enterprise patterns.
**Not chosen**: Overkill for current scope, steeper learning curve.

### 3. Microservices (separate auth, orders services)

**Considered**: Better separation of concerns.
**Not chosen**: Added complexity not justified at current scale.

### 4. Serverless (Lambda)

**Considered**: Auto-scaling, pay-per-use.
**Not chosen**: Complicates local development, cold start latency.

## References

- `backend/api-gateway/server.js` - Main application file
- `backend/api-gateway/middleware/` - Custom middleware
- `docs/AUTHENTICATION.md` - Authentication documentation
- `docs/SECURITY.md` - Security overview
