# E2E Test Environment Variables

## Required Environment Variables

### URL Configuration

**`WEB_BASE_URL`** - Frontend/Web URL
- **Purpose**: Base URL for Playwright browser tests and Origin header for CORS
- **Used by**: `playwright.config.js` (baseURL and Origin header), `utils/api-helper.js` (Origin header)
- **Example**: `https://echobase-green-frontend:443`
- **Required**: Yes

**`API_BASE_URL`** - API Gateway URL
- **Purpose**: Base URL for direct API calls (bypassing frontend)
- **Used by**: `utils/api-helper.js` (connects to API Gateway)
- **Example**: `https://echobase-green-api-gateway:3001`
- **Required**: Yes

### Database Configuration

**`DB_HOST`** - Database hostname
- **Example**: `echobase-ci-durable-mariadb`
- **Required**: Yes

**`DB_PORT`** - Database port
- **Example**: `3306`
- **Required**: Yes

**`DB_NAME`** - Database name
- **Example**: `orders_db`
- **Required**: Yes

**`DB_USER`** - Database username
- **Example**: `orderuser`
- **Required**: Yes

**`DB_PASSWORD`** - Database password
- **Example**: (from secrets manager)
- **Required**: Yes

## Why Two URL Variables?

E2E tests need to interact with both:

1. **Frontend (via Playwright browser)**: Uses `WEB_BASE_URL`
   - Loads web pages
   - Clicks buttons, fills forms
   - Tests the full user experience
   - Used as Origin header for CORS

2. **API (directly)**: Uses `API_BASE_URL`
   - Makes direct HTTP requests to API
   - Bypasses frontend for setup/cleanup
   - Tests API behavior independently

Both variables are required because tests often need both approaches in the same test suite.

## Validation

All required variables are validated at module load time using `validateRequiredEnv()`:
- `WEB_BASE_URL` - validated in `playwright.config.js` and `utils/api-helper.js`
- `API_BASE_URL` - validated in `utils/api-helper.js`
- Database vars - validated in `config/test-config.js` and `utils/db-helper.js`

**No silent defaults** - missing variables cause immediate failure with clear error messages.
