# Architectural Decisions

This file indexes architectural decisions (ADRs) for this project. Full ADR documents are stored as separate files in this directory.

## Format

Each decision should include:
- ADR number and title
- Date
- Status (Proposed, Accepted, Deprecated, Superseded)
- Brief summary
- Link to full ADR document

---

## Decision Index

### ADR-001: Store MariaDB Encryption Key in Secrets Manager (2026-01-23)

**Status:** Accepted

**Summary:** Store the MariaDB data-at-rest encryption key in AWS Secrets Manager (LocalStack in development) rather than baking it into the Docker image. This provides consistent secret management, enables key rotation, and removes build-time dependencies.

**Full Document:** [ADR-001-encryption-key-secrets-manager.md](ADR-001-encryption-key-secrets-manager.md)

**Key Points:**
- Encryption key stored at `echobase/database/encryption-key`
- MariaDB container fetches key at startup via AWS CLI
- Consistent with how database credentials are already managed

---

### ADR-002: Two-Layer Infrastructure Model (2026-01-24)

**Status:** Accepted

**Summary:** Separate infrastructure into durable (persistent) and ephemeral (deployable) layers to enable zero-downtime blue-green deployments while maintaining persistent data.

**Full Document:** [ADR-002-two-layer-infrastructure.md](ADR-002-two-layer-infrastructure.md)

**Key Points:**
- Durable: MariaDB, Secrets Manager (LocalStack), nginx - never torn down
- Ephemeral: API Gateway, Frontend, Order Processor, SQS - blue/green deployable
- Shared database between blue and green environments

---

### ADR-003: nginx as Single Source of Truth (2026-01-24)

**Status:** Accepted

**Summary:** Use nginx configuration as the single source of truth for which environment (blue/green) is currently serving production traffic, rather than artifacts, labels, or external state files.

**Full Document:** [ADR-003-nginx-single-source-of-truth.md](ADR-003-nginx-single-source-of-truth.md)

**Key Points:**
- `/.active-env` endpoint returns current active environment
- Scripts query nginx directly, no artifacts needed
- State can't diverge from actual traffic routing

---

### ADR-004: Blue-Green Deployment Architecture (2026-01-24)

**Status:** Accepted

**Summary:** Implement blue-green deployment where two complete environments run simultaneously, with nginx routing traffic to one while the other is updated, enabling zero-downtime deployments and instant rollback.

**Full Document:** [ADR-004-blue-green-deployment.md](ADR-004-blue-green-deployment.md)

**Key Points:**
- Deploy to inactive environment, switch traffic when ready
- Instant rollback by switching back to previous environment
- Smoke tests before and after traffic switch

---

### ADR-005: Transactional Credential Setup (2026-01-24)

**Status:** Accepted

**Summary:** Store credentials in Secrets Manager BEFORE creating the database to ensure consistency and prevent orphaned credentials when Terraform fails.

**Full Document:** [ADR-005-transactional-credential-setup.md](ADR-005-transactional-credential-setup.md)

**Key Points:**
- Generate → Store in Secrets Manager → Create database
- If Terraform fails, database not created (nothing to clean up)
- Secrets Manager is single source of truth for credentials

---

### ADR-006: LocalStack for AWS Services (2026-01-24)

**Status:** Accepted

**Summary:** Use LocalStack to emulate AWS services (SQS, Secrets Manager, KMS) locally, with separate instances for durable and ephemeral resources to support the two-layer infrastructure model.

**Full Document:** [ADR-006-localstack-for-aws-services.md](ADR-006-localstack-for-aws-services.md)

**Key Points:**
- Durable LocalStack: Secrets Manager, KMS (persistent)
- Ephemeral LocalStack: SQS queues (per-deployment)
- No AWS credentials or costs for development/CI

---

### ADR-007: JWT Authentication with CSRF Protection (2026-01-24)

**Status:** Accepted

**Summary:** Implement dual authentication with JWT for users and API keys for services, plus CSRF protection via Origin header validation against allowed CORS origins.

**Full Document:** [ADR-007-jwt-csrf-authentication.md](ADR-007-jwt-csrf-authentication.md)

**Key Points:**
- JWT tokens (HS256, 24h expiry) for user authentication
- API keys for service-to-service access
- Origin header validation prevents CSRF attacks

---

### ADR-008: Express.js API Gateway (2026-01-24)

**Status:** Accepted

**Summary:** Use Express.js as the API Gateway framework, implementing a monolithic API service that handles authentication, order submission, and integrations with AWS services.

**Full Document:** [ADR-008-express-api-gateway.md](ADR-008-express-api-gateway.md)

**Key Points:**
- Express.js with security middleware stack (Helmet, CORS, rate limiting)
- Routes: /health, /api/v1/auth, /api/v1/orders
- Integrates with SQS, Secrets Manager, MariaDB

---

### ADR-009: React + Vite Frontend (2026-01-24)

**Status:** Accepted

**Summary:** Use React for the UI framework with Vite as the build tool, served via nginx in production. Provides fast development iteration and optimized production builds.

**Full Document:** [ADR-009-react-vite-frontend.md](ADR-009-react-vite-frontend.md)

**Key Points:**
- Vite for fast HMR and optimized builds
- React Router for SPA routing
- Multi-stage Docker build with nginx

---

### ADR-010: SQS-Based Async Order Processing (2026-01-24)

**Status:** Accepted

**Summary:** Implement asynchronous order processing using SQS as a message broker between the API Gateway and Order Processor, providing reliability, decoupling, and resilience.

**Full Document:** [ADR-010-sqs-async-order-processing.md](ADR-010-sqs-async-order-processing.md)

**Key Points:**
- API queues orders to SQS, returns immediately
- Order Processor polls SQS, writes to database
- Dead Letter Queue (DLQ) for failed messages after 3 retries

---

### ADR-011: MariaDB with Data-at-Rest Encryption (2026-01-24)

**Status:** Accepted

**Summary:** Use MariaDB with data-at-rest encryption enabled, storing the encryption key in Secrets Manager. Provides MySQL compatibility with security compliance.

**Full Document:** [ADR-011-mariadb-encryption.md](ADR-011-mariadb-encryption.md)

**Key Points:**
- AES-256-CBC encryption for all tables, logs, and temp files
- Encryption key fetched from Secrets Manager at container startup
- Shared database across blue/green environments

---

## Adding New Decisions

When making architectural decisions:

1. Create a new file: `ADR-XXX-brief-title.md`
2. Add an index entry to this file
3. Include: Context, Decision, Alternatives Considered, Consequences

Use the format from ADR-001 as a template.

---

## Tips

- Number decisions sequentially (ADR-001, ADR-002, etc.)
- Always include date for context
- Be honest about trade-offs
- Update status if decisions are revisited or superseded
- Focus on "why" not "how" (implementation details go in code)