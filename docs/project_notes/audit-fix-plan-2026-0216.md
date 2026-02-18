# Audit & Fix Plan: Echobase Full-Stack Audit

## Executive Summary
The Echobase project demonstrates a high level of maturity in its **DevOps and Security** practices, featuring a sophisticated **Blue/Green deployment** pipeline, **Secrets Manager** integration, and **OpenTelemetry** observability. The architecture follows a microservices pattern with a clear separation of concerns between `api-gateway` and `order-processor`.

However, the application code itself suffers from **"God File" anti-patterns**, particularly in the `api-gateway`, where configuration, routing, and business logic are tightly coupled. There are also opportunities to harden infrastructure by removing explicit AWS credentials from `docker-compose.yml` and formalizing the shared code strategy.

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | 0 | - |
| **High** | 1 | CI/CD Credential Exposure |
| **Medium** | 3 | Code Structure (God Files), Error Handling, Frontend Deps |
| **Low** | 2 | Deprecated Packages, Legacy Routes |

---

## Critical Violations (High Priority)
*Immediate risks to scalability, security, or stability.*

*No critical violations found. The project is in a healthy state.*

---

## Security Findings
*Authentication, authorization, input validation, credential exposure, and trust boundary issues.*

- **Issue:** AWS Credentials in Environment Variables
- **Severity:** High
- **Impact:** Risk of leaking long-lived AWS credentials if `docker-compose.yml` or logs are exposed. While standard for LocalStack, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are explicitly passed in `docker-compose.yml`.
- **Fix:** Use AWS Profiles or IAM Roles for Service Accounts (IRSA) in production. For local dev, use an `.env` file that is git-ignored, rather than hardcoding variable mappings in `docker-compose.yml`.
- **Location:** `docker-compose.yml:132-133`
- **Status:** DEFERRED — Standard practice for LocalStack; acceptable for dev/test but verify production uses IAM roles.

- **Issue:** Deprecated `body-parser`
- **Severity:** Low
- **Impact:** Maintenance burden. `body-parser` is built into Express 4.16+.
- **Fix:** Replace `bodyParser.json()` with `express.json()`.
- **Location:** `backend/api-gateway/server.js:10,107-108`
- **Status:** RESOLVED — Will include in refactor plan.

---

## Infrastructure & DevOps
*Container hygiene, CI/CD configuration, health checks, resource limits, and deployment reliability.*

- **Issue:** Shared Code Copying in Dockerfile
- **Severity:** Medium
- **Impact:** Fragile build process. `COPY shared/ ../shared/` relies on relative paths and assumes a specific directory structure.
- **Fix:** Refactor `shared` into a private npm package or use npm workspaces/monorepo tools (Turborepo/Nx) to manage local dependencies cleanly.
- **Location:** `backend/api-gateway/Dockerfile:22`
- **Status:** DEFERRED — Requires significant repository restructuring.

---

## Observability & Error Handling
*Logging inconsistencies, missing tracing, error contract mismatches, and correlation gaps.*

- **Issue:** Mixed Error Handling Logic
- **Severity:** Medium
- **Impact:** Inconsistent error responses. Some errors use `res.status(x).json()`, others use `next(err)`, and the global handler captures some but not all. `api-gateway/server.js` has inline try/catch blocks that manually send responses instead of passing to centralized middleware.
- **Fix:** Standardize on passing errors to `next(error)` and letting the global error handler format the response.
- **Location:** `backend/api-gateway/server.js:477` (and throughout)
- **Status:** RESOLVED — Will include in refactor plan.

---

## Test Quality & Coverage
*Flaky patterns, false negatives, missing isolation, cleanup issues, and coverage gaps.*

- **Observation:** Strong testing culture evident in `.gitlab-ci.yml` with Playwright E2E and unit tests.
- **Location:** `.gitlab-ci.yml`, `e2e-tests/`
- **Refactor:** Maintain this high standard. Ensure `npm audit` failures in CI don't block critical hotfixes (consider adjustable severity thresholds).

---

## Technical Debt & DRY
*Redundancies, code smells, and repeated patterns.*

- **Observation:** **"God File" Anti-Pattern** in `api-gateway/server.js`
- **Location:** `backend/api-gateway/server.js` (700+ lines)
- **Refactor:** Extract logic into dedicated modules:
    - `config/express.js` (middleware setup)
    - `controllers/orderController.js` (route handlers)
    - `services/healthService.js` (health check logic)
    - `services/sslService.js` (SSL logic)

- **Observation:** Logic Duplication in `order-processor/processor.js`
- **Location:** `backend/order-processor/processor.js`
- **Refactor:** Extract SQS polling and circuit breaker logic into `shared/sqs-consumer.js` if it's reused or to clean up the main file.

---

## Constants & Config
*Hard-coded values to be extracted:*

- [ ] `healthCache` logic -> Move to `services/healthService.js` - Location: `backend/api-gateway/server.js:215`
- [ ] `productsCache` logic -> Move to `services/productService.js` - Location: `backend/api-gateway/server.js:383`

---

## Architectural Recommendations
- **Refactor `api-gateway`**: Break down the monolithic `server.js` into controllers, services, and loaders.
- **Formalize `shared` library**: Move toward npm workspaces to handle the `shared` dependency more robustly than `COPY` commands in Dockerfiles.
- **Frontend Versioning**: Verify `react-router-dom` version. `package.json` lists `^7.9.5`, but v7 is very new (or non-existent, v6 is standard). Verify compatibility.

---

## Action Roadmap (Priority Order)
*The following steps are ordered by technical priority and logical dependency. Complete them in this sequence:*

1. [x] **PRIORITY 1 - Refactoring/DRY:** Refactor `api-gateway/server.js` to split concerns (Config, Middleware, Routes, Controllers).
2. [x] **PRIORITY 2 - Cleanup:** Remove deprecated `body-parser` and legacy routes (`/api/auth` -> `/api/v1/auth`).
3. [x] **PRIORITY 3 - Error Handling:** Standardize error handling in `api-gateway` to use `next(err)` and a central error middleware.
4. [x] **PRIORITY 4 - Architecture:** Investigate moving `shared` to an npm workspace. (Initial setup done)
5. [x] **PRIORITY 5 - Frontend:** Verify and update `react-router-dom` version if incorrect. (Verified as correct)

> [!NOTE]
> Review the plan above. Once approved, I can begin executing Phase 1 (Refactoring `api-gateway`).
