# Environment Variables Checklist

This document lists all environment variables required across the codebase and where they're validated.

## Backend API Gateway Tests

### Security Tests (`backend/api-gateway/__tests__/security.test.js`)
**Required:**
- `GREEN_FRONTEND_PORT` - Port for CORS origin testing (set in CI: line 358 of .gitlab-ci.yml)
- `JWT_SECRET` - From .env file (validated in server.js startup via API_GATEWAY_REQUIRED_VARS)
- `RATE_LIMIT_MAX_REQUESTS` - Rate limit configuration (used in tests, optional in production if RATE_LIMIT_ENABLED=false)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (used in tests, optional in production if RATE_LIMIT_ENABLED=false)

**Set in CI:**
```bash
docker compose -p echobase-green exec -T -e GREEN_FRONTEND_PORT=${GREEN_FRONTEND_PORT} api-gateway npm test
```

### SQS Security Tests (`backend/api-gateway/__tests__/sqs-security.test.js`)
**Required:**
- `SQS_QUEUE_URL` - SQS queue URL
- `AWS_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials

**Source:** Loaded from `.env` file via dotenv

## E2E Tests

### Test Configuration (`e2e-tests/config/test-config.js`)
**Required:**
- `DB_HOST` - Database hostname
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

### Playwright Configuration (`e2e-tests/playwright.config.js`)
**Required:**
- `WEB_BASE_URL` - Frontend/web URL for browser tests

### API Helper (`e2e-tests/utils/api-helper.js`)
**Required:**
- `WEB_BASE_URL` - Frontend URL (used for Origin header)
- `API_BASE_URL` - API Gateway URL (used for HTTP requests)

### Database Helper (`e2e-tests/utils/db-helper.js`)
**Required:**
- `DB_HOST` - Database hostname
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

**Set in CI (test:green-e2e job):**
```bash
docker create \
  -e DB_HOST=echobase-ci-durable-mariadb \
  -e DB_PORT=3306 \
  -e DB_NAME=$DB_NAME \
  -e DB_USER=$DB_USER \
  -e DB_PASSWORD=$DB_PASSWORD \
  -e API_BASE_URL=https://echobase-green-api-gateway:3001 \
  -e WEB_BASE_URL=https://echobase-green-frontend:443 \
  ...
```

## CI/CD Configuration

### Global Variables (`.gitlab-ci.yml`)
```yaml
variables:
  GREEN_FRONTEND_PORT: "3543"
  GREEN_API_PORT: "3101"
  GREEN_DB_PORT: "3406"
  GREEN_LOCALSTACK_PORT: "4666"
```

## Validation Summary

| Environment Variable | Required By | Validated In | Source |
|---------------------|-------------|--------------|--------|
| `GREEN_FRONTEND_PORT` | Security tests | security.test.js | CI variable |
| `JWT_SECRET` | Security tests, API Gateway | server.js (API_GATEWAY_REQUIRED_VARS) | .env file |
| `RATE_LIMIT_MAX_REQUESTS` | Security tests | Used in tests (optional in production) | .env file |
| `RATE_LIMIT_WINDOW_MS` | Security tests | Used in tests (optional in production) | .env file |
| `SQS_QUEUE_URL` | SQS tests, API Gateway | sqs-security.test.js, server.js | .env file |
| `AWS_REGION` | SQS tests, API Gateway | sqs-security.test.js, server.js | .env file |
| `AWS_ACCESS_KEY_ID` | SQS tests, API Gateway | sqs-security.test.js, server.js | .env file |
| `AWS_SECRET_ACCESS_KEY` | SQS tests, API Gateway | sqs-security.test.js, server.js | .env file |
| `WEB_BASE_URL` | E2E tests | playwright.config.js, api-helper.js | CI env var |
| `API_BASE_URL` | E2E tests | api-helper.js | CI env var |
| `DB_HOST` | E2E tests | test-config.js, db-helper.js | CI env var |
| `DB_PORT` | E2E tests | test-config.js, db-helper.js | CI env var |
| `DB_NAME` | E2E tests | test-config.js, db-helper.js | CI env var |
| `DB_USER` | E2E tests | test-config.js, db-helper.js | CI env var |
| `DB_PASSWORD` | E2E tests | test-config.js, db-helper.js | CI env var |

## Validation Principles

✅ **All required variables are validated** - No silent defaults
✅ **Fail-fast behavior** - Missing variables cause immediate errors with clear messages
✅ **Common utilities used** - `validateRequiredEnv()` function used consistently
✅ **Clear error messages** - Lists all missing variables at once
✅ **Validated at module load** - Errors appear immediately, not during test execution

## No Silent Defaults Policy

This codebase enforces **NO SILENT DEFAULTS** for environment variables. If a required variable is missing, the application will:
1. Throw a clear error message
2. List all missing variables
3. Exit immediately (fail-fast)

The only exception is `LOG_LEVEL` in production code, which defaults to `'INFO'` (standard logging practice).
