# Test Inventory

Complete inventory of all E2E tests in the suite.

## Summary Statistics

- **Total Test Files**: 8
- **Total Test Suites**: 30+
- **Total Individual Tests**: 100+
- **Test Categories**: 4 (API, Frontend, Integration, Security)

---

## API Tests (39 tests)

### tests/api/auth.api.spec.js (20 tests)

#### User Registration (10 tests)
1. ✅ should register a new user with valid data
2. ✅ should reject registration with duplicate username
3. ✅ should reject registration with duplicate email
4. ✅ should reject registration with missing username
5. ✅ should reject registration with missing email
6. ✅ should reject registration with invalid email format
7. ✅ should reject registration with short password
8. ✅ should reject registration with password missing uppercase
9. ✅ should reject registration with password missing lowercase
10. ✅ should reject registration with password missing number
11. ✅ should reject registration with empty password

#### User Login (6 tests)
12. ✅ should login with valid credentials
13. ✅ should reject login with invalid username
14. ✅ should reject login with invalid password
15. ✅ should reject login with missing username
16. ✅ should reject login with missing password
17. ✅ should reject login with empty credentials

#### JWT Token Validation (4 tests)
18. ✅ should accept valid JWT token for protected endpoints
19. ✅ should reject requests without JWT token
20. ✅ should reject requests with invalid JWT token
21. ✅ should reject requests with malformed JWT token

### tests/api/orders.api.spec.js (19 tests)

#### Order Submission (13 tests)
1. ✅ should submit a valid order
2. ✅ should submit order with decimal quantity
3. ✅ should submit order with large quantity
4. ✅ should submit order with large total price
5. ✅ should reject order without authentication
6. ✅ should reject order with missing product name
7. ✅ should reject order with empty product name
8. ✅ should reject order with missing quantity
9. ✅ should reject order with missing total price
10. ✅ should reject order with negative quantity
11. ✅ should reject order with zero quantity
12. ✅ should reject order with negative total price
13. ✅ should reject order with invalid quantity type
14. ✅ should reject order with invalid total price type

#### Orders Info Endpoint (1 test)
15. ✅ should get orders info without authentication

#### Multiple Orders (1 test)
16. ✅ should allow user to submit multiple orders

---

## Frontend Tests (30 tests)

### tests/frontend/registration.frontend.spec.js (10 tests)

1. ✅ should display registration form
2. ✅ should register a new user successfully
3. ✅ should show error for duplicate username
4. ✅ should validate password requirements
5. ✅ should validate required fields
6. ✅ should have link to login page
7. ✅ should persist session after registration
8. ✅ should sanitize input to prevent XSS
9. ✅ should handle long input values

### tests/frontend/login.frontend.spec.js (10 tests)

1. ✅ should display login form
2. ✅ should login with valid credentials
3. ✅ should show error for invalid credentials
4. ✅ should show error for wrong password
5. ✅ should have link to registration page
6. ✅ should persist session after login
7. ✅ should handle empty form submission
8. ✅ should mask password input
9. ✅ should redirect authenticated users to orders page

### tests/frontend/orders.frontend.spec.js (12 tests)

1. ✅ should display order form
2. ✅ should display logout button
3. ✅ should submit an order successfully
4. ✅ should clear form after successful submission
5. ✅ should logout successfully
6. ✅ should redirect to login if not authenticated
7. ✅ should validate required fields
8. ✅ should validate numeric fields
9. ✅ should handle multiple consecutive orders
10. ✅ should handle special characters in product name
11. ✅ should handle decimal values in quantity
12. ✅ should handle large numbers

---

## Integration Tests (16 tests)

### tests/integration/full-flow.integration.spec.js (7 tests)

1. ✅ should complete full registration, login, and order flow via API
2. ✅ should complete full flow via UI
3. ✅ should handle register, logout, login, and order flow
4. ✅ should process multiple orders from the same user
5. ✅ should handle concurrent orders from different users
6. ✅ should preserve session across page refreshes
7. ✅ should reject order submission from unauthenticated user after logout

### tests/integration/async-processing.integration.spec.js (9 tests)

1. ✅ should process order asynchronously via SQS
2. ✅ should process multiple orders in sequence
3. ✅ should handle order processing with different quantities and prices
4. ✅ should maintain order integrity with special characters
5. ✅ should process orders from multiple users independently
6. ✅ should set correct timestamps on orders
7. ✅ should handle rapid consecutive order submissions

---

## Security Tests (25+ tests)

### tests/security/security.security.spec.js (25+ tests)

#### SQL Injection Protection (3 test suites)
1. ✅ should prevent SQL injection in username field (5 payload tests)
2. ✅ should prevent SQL injection in login (5 payload tests)
3. ✅ should prevent SQL injection in order product name (5 payload tests)

#### XSS Protection (2 tests)
4. ✅ should sanitize XSS in registration
5. ✅ should sanitize XSS in order product name

#### Authentication & Authorization (4 tests)
6. ✅ should reject order submission without token
7. ✅ should reject order submission with invalid token
8. ✅ should reject order submission with malformed token
9. ✅ should protect orders page from unauthenticated access

#### Input Validation (4 tests)
10. ✅ should enforce password complexity (4 weak password tests)
11. ✅ should validate email format (4 invalid email tests)
12. ✅ should enforce order field requirements (3 missing field tests)
13. ✅ should reject negative values in orders (2 tests)

#### HTTPS and Security Headers (2 tests)
14. ✅ should enforce HTTPS
15. ✅ should include security headers

#### Error Handling (2 tests)
16. ✅ should not leak sensitive information in error messages
17. ✅ should handle database errors gracefully

#### Session Management (2 tests)
18. ✅ should clear session on logout
19. ✅ should not accept reused tokens after logout

#### Rate Limiting (1 test)
20. ✅ should rate limit excessive requests (skipped by default)

---

## Utility Files

### utils/db-helper.js
Database helper for test verification with methods:
- getUserByUsername, getUserByEmail, getUserById
- getOrdersByUserId, getLatestOrderByUserId, getOrderById
- getUserCount, getOrderCount
- deleteUserByUsername, deleteOrdersByUserId
- **waitForOrder** (async processing verification)
- query (custom SQL)

### utils/api-helper.js
API client for testing with methods:
- register, login
- submitOrder, getOrdersInfo
- healthCheck
- setToken, clearToken
- request (custom requests)

### utils/test-data.js
Test data generators and fixtures:
- generateUsername, generateEmail, generateValidPassword
- createValidUser, createValidOrder
- invalidPasswords, invalidOrders
- sqlInjectionPayloads, xssPayloads
- waitFor (async utility)

---

## Test Scripts

### scripts/setup-tests.sh
- Verifies Docker is running
- Starts docker compose services
- Waits for service health checks
- Installs dependencies
- Installs Playwright browsers
- Verifies database connection

### scripts/cleanup-tests.sh
- Cleans up test users from database
- Deletes associated orders
- Removes test data matching patterns

### scripts/run-all-tests.sh
- Runs setup
- Executes all tests
- Generates reports
- Runs cleanup

---

## Configuration Files

### playwright.config.js
- Test execution settings (single worker, serial execution)
- Reporter configuration (HTML, JSON, console)
- Browser settings (Chrome, HTTPS ignore)
- Test matching patterns by category
- Timeout and retry configuration

### package.json
- Dependencies: @playwright/test, mysql2
- Test scripts for different categories
- Report and debugging commands

### .gitignore
- Excludes node_modules, test results, logs
- Ignores environment files and IDE configs

---

## Documentation Files

### README.md
- Complete testing guide
- Installation and setup
- Running tests
- Test structure overview
- Utility documentation
- Best practices
- CI/CD integration
- Troubleshooting

### ARCHITECTURE.md
- System architecture diagrams
- Test layer descriptions
- Data flow examples
- Async processing handling
- Test isolation strategy
- Performance considerations
- Extensibility guide

### QUICK_START.md
- 5-minute setup guide
- Quick command reference
- Common issues and solutions
- Test coverage summary

### TEST_INVENTORY.md (this file)
- Complete test listing
- Test count by category
- File structure overview

---

## Test Coverage Breakdown

| Category     | Test Files | Test Suites | Individual Tests | Coverage                           |
|--------------|------------|-------------|------------------|------------------------------------|
| API          | 2          | 8           | 39               | Authentication, Orders, Validation |
| Frontend     | 3          | 3           | 30               | UI Components, Forms, Navigation   |
| Integration  | 2          | 2           | 16               | Full Flows, Async Processing       |
| Security     | 1          | 9           | 25+              | SQL Injection, XSS, Auth, etc.     |
| **TOTAL**    | **8**      | **22+**     | **110+**         | **Complete E2E Coverage**          |

---

## Test Execution Time Estimates

- **API Tests**: ~5-10 seconds
- **Frontend Tests**: ~30-60 seconds
- **Integration Tests**: ~2-4 minutes (async waiting)
- **Security Tests**: ~10-20 seconds
- **Total Suite**: ~4-6 minutes (serial execution)

---

## Continuous Integration Ready

The test suite includes:
- ✅ Automated setup scripts
- ✅ Cleanup scripts
- ✅ Environment verification
- ✅ Health checks
- ✅ HTML/JSON reports
- ✅ Screenshot/video on failure
- ✅ Exit codes for CI/CD
- ✅ Parallel-ready (currently serial for stability)

---

## Future Test Additions

Potential areas for expansion:
- [ ] Visual regression tests (screenshot comparison)
- [ ] Performance tests (response time assertions)
- [ ] Accessibility tests (WCAG compliance)
- [ ] Mobile/responsive tests
- [ ] Load tests (concurrent users)
- [ ] API contract tests (OpenAPI)
- [ ] Network error simulation
- [ ] Database migration tests
- [ ] Email notification tests (if applicable)
- [ ] File upload tests (if applicable)

---

**Last Updated**: 2025-11-05
**Test Suite Version**: 1.0.0
