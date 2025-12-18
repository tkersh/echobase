# E2E Tests - Quick Start Guide

## 5-Minute Setup

### Step 1: Create Environment Configuration

**First time only** - Create a `.env` file with required credentials:

```bash
# From project root
cd /Users/tadk/work/echobase

# Option 1 (Recommended): Auto-generate secure credentials
./generate-credentials.sh

# Option 2: Create manually from template
cp .env.example .env
# Then edit .env and set secure passwords
```

### Step 2: Start Services

```bash
# From project root
docker compose up -d

# Verify services are running
docker compose ps
```

### Step 3: Run Setup Script

```bash
cd e2e-tests
./scripts/setup-tests.sh
```

This will:
- ✓ Check for .env file
- ✓ Verify Docker is running
- ✓ Check services are healthy
- ✓ Install dependencies
- ✓ Install Playwright browsers
- ✓ Verify database connection

### Step 4: Run Tests

```bash
# Run all tests
npm test

# Or use the comprehensive script
./scripts/run-all-tests.sh
```

## Quick Commands

```bash
# Different test categories
npm run test:api          # API tests (fast)
npm run test:frontend     # Frontend tests
npm run test:integration  # Integration tests
npm run test:security     # Security tests

# Development modes
npm run test:ui           # Interactive UI mode
npm run test:headed       # See browser while testing
npm run test:debug        # Debug mode with breakpoints

# Reports
npm run report            # View HTML report
```

## Common Issues

### "Services not ready"

```bash
# Check service health
docker compose ps

# Restart services
docker compose restart

# Check logs
docker compose logs -f
```

### "Database connection failed"

```bash
# Test database connection
docker compose exec mariadb mysql -u root -prootpassword -e "USE ordersdb; SELECT 1;"
```

### "Playwright not installed"

```bash
npx playwright install chromium
```

### "Test data conflicts"

```bash
# Clean up test data
./scripts/cleanup-tests.sh
```

## What Gets Tested?

- ✅ **Authentication**: Registration, login, JWT validation
- ✅ **Orders**: Submission, validation, async processing
- ✅ **UI Flows**: Complete user journeys
- ✅ **Security**: SQL injection, XSS, auth bypass attempts
- ✅ **Integration**: Full stack (UI → API → Queue → DB)

## Test Results

After running tests, view the report:

```bash
npm run report
```

Opens `playwright-report/index.html` in your browser with:
- Pass/fail status
- Screenshots of failures
- Detailed error messages
- Execution timeline

## Next Steps

- Read [README.md](./README.md) for detailed documentation
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Explore test files in `tests/` directory
- Write your own tests using existing patterns

## Need Help?

1. Check the [README.md](./README.md) troubleshooting section
2. Review existing test examples in `tests/`
3. Check Docker logs: `docker compose logs`
4. Verify environment: `./scripts/setup-tests.sh`
