---
name: security-test-updater
description: >
  Automatically analyzes code changes and updates security tests to maintain comprehensive coverage.
  Use this skill after modifying code, adding features, refactoring, or when security-relevant changes
  are made. Identifies authentication, authorization, input validation, encryption, and other security
  concerns in changed code, then creates or updates corresponding security tests. Triggers on code
  modifications, feature additions, API changes, authentication updates, database changes, or when
  user explicitly requests test updates. Ensures security regression prevention through automated test
  coverage.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - Edit
  - Bash
---

# Security Test Updater Skill

You are automatically maintaining security test coverage after code changes. This skill ensures that every security-relevant code change has corresponding test coverage.

## When This Skill Activates

This skill should be invoked automatically when:
- Code has been modified (especially security-relevant code)
- New features are added
- API endpoints are created or modified
- Authentication/authorization logic changes
- Database access code changes
- Input validation is added or modified
- Encryption/decryption code changes
- Third-party integrations are added
- User explicitly requests security test updates

## Core Responsibilities

### 1. Analyze Code Changes
Identify what changed and assess security implications:
- New API endpoints → Need authentication/authorization tests
- Database queries → Need injection prevention tests
- Input handlers → Need validation and sanitization tests
- File operations → Need path traversal and access control tests
- Authentication code → Need credential and session tests
- Encryption code → Need cryptographic security tests

### 2. Identify Missing Test Coverage
For each security-relevant change, determine:
- What security tests currently exist
- What security scenarios are NOT tested
- What edge cases and attack vectors need coverage
- What regression risks exist

### 3. Create or Update Security Tests
Generate comprehensive tests covering:

#### Authentication & Authorization Tests
- Valid credentials acceptance
- Invalid credentials rejection
- Token/session validation
- Permission checks (RBAC/ABAC)
- Privilege escalation attempts
- Session fixation/hijacking
- Password strength requirements
- Account lockout mechanisms

#### Input Validation Tests
- Required field validation
- Type validation (string, number, email, etc.)
- Length limits (min/max)
- Format validation (regex patterns)
- Special character handling
- Boundary conditions (empty, null, undefined)
- Malicious input rejection (XSS, injection attempts)

#### Injection Prevention Tests
- SQL injection attempts
- NoSQL injection attempts
- Command injection attempts
- LDAP injection attempts
- XML injection attempts
- Template injection attempts

#### API Security Tests
- Unauthenticated access rejection
- CORS policy enforcement
- Rate limiting effectiveness
- Request size limits
- Content-Type validation
- HTTP method restrictions

#### Encryption & Data Protection Tests
- Data encrypted at rest
- Data encrypted in transit
- Secure key storage
- Proper cipher usage
- IV/nonce randomness
- No hardcoded secrets

#### Access Control Tests
- Horizontal privilege escalation prevention
- Vertical privilege escalation prevention
- Direct object reference protection (IDOR)
- Path traversal prevention
- File access restrictions

#### Error Handling & Information Disclosure Tests
- Generic error messages (no stack traces in production)
- No sensitive data in logs
- No credentials in responses
- Proper exception handling

## Test Structure and Organization

### Naming Convention
```
tests/
├── security/
│   ├── auth/
│   │   ├── authentication.test.js
│   │   ├── authorization.test.js
│   │   └── session-management.test.js
│   ├── input-validation/
│   │   ├── api-validation.test.js
│   │   ├── sanitization.test.js
│   │   └── boundary-tests.test.js
│   ├── injection/
│   │   ├── sql-injection.test.js
│   │   ├── xss-prevention.test.js
│   │   └── command-injection.test.js
│   ├── api-security/
│   │   ├── cors.test.js
│   │   ├── rate-limiting.test.js
│   │   └── request-validation.test.js
│   └── data-protection/
│       ├── encryption.test.js
│       └── secrets-management.test.js
```

### Test Template Structure

Each test file should follow this pattern:

```javascript
/**
 * Security Test: [Category]
 *
 * Purpose: [What security concerns this tests]
 * Related Code: [File paths being tested]
 * Last Updated: [Date]
 * Coverage: [What scenarios are covered]
 */

const request = require('supertest');
const app = require('../path/to/app');

describe('Security: [Category]', () => {
  describe('[Specific Feature/Endpoint]', () => {

    // Positive security tests (should allow)
    it('should allow valid, authorized requests', async () => {
      // Test legitimate use cases
    });

    // Negative security tests (should block)
    it('should reject unauthorized access attempts', async () => {
      // Test security controls
    });

    it('should prevent [specific attack vector]', async () => {
      // Test attack prevention
    });

    // Edge cases
    it('should handle edge case: [description]', async () => {
      // Test boundary conditions
    });

  });
});
```

## Analysis Process

### Step 1: Identify Changed Files
```bash
# If using git, check recent changes
git diff --name-only HEAD~1 HEAD
# Or analyze files mentioned in conversation context
```

### Step 2: Read Changed Code
Read each modified file and identify:
- Function signatures and their security implications
- API endpoints and their authentication requirements
- Database queries and injection risks
- Input handling and validation needs
- Encryption/decryption operations
- Configuration changes affecting security

### Step 3: Find Existing Tests
```bash
# Search for existing test files
Glob: "**/*.test.js", "**/*.spec.js", "**/test/**/*.js"
# Search for tests related to changed files
Grep: "describe.*[filename]"
```

### Step 4: Analyze Test Coverage Gaps
For each security-relevant change, check:
- Does a test exist for this function/endpoint?
- Does the test cover authentication/authorization?
- Does the test cover input validation?
- Does the test cover attack scenarios?
- Are edge cases tested?

### Step 5: Generate or Update Tests
Based on gaps identified:
- Create new test files if needed
- Add new test cases to existing files
- Update assertions to match code changes
- Add attack vector tests
- Add edge case tests

### Step 6: Verify Test Quality
Ensure tests include:
- Clear descriptions of what's being tested
- Both positive (should allow) and negative (should block) cases
- Attack scenario simulations
- Proper assertions
- Comments explaining security rationale
- References to related code files

## Code Change Examples and Corresponding Tests

### Example 1: New API Endpoint

**Code Change (backend/api/routes.js):**
```javascript
app.post('/api/orders', async (req, res) => {
  const { customerId, items, total } = req.body;
  await db.query('INSERT INTO orders VALUES (?, ?, ?)', [customerId, items, total]);
  res.json({ success: true });
});
```

**Required Security Tests:**
```javascript
describe('Security: POST /api/orders', () => {

  it('should reject unauthenticated requests', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({ customerId: 1, items: [], total: 100 });
    expect(response.status).toBe(401);
  });

  it('should prevent SQL injection in customerId', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer validtoken')
      .send({ customerId: "1'; DROP TABLE orders--", items: [], total: 100 });
    expect(response.status).toBe(400);
    // Verify table still exists
    const count = await db.query('SELECT COUNT(*) FROM orders');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer validtoken')
      .send({ customerId: 1 }); // missing items and total
    expect(response.status).toBe(400);
  });

  it('should prevent negative totals', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer validtoken')
      .send({ customerId: 1, items: [], total: -100 });
    expect(response.status).toBe(400);
  });

  it('should enforce authorization - users can only create their own orders', async () => {
    const user2Token = 'token-for-user-2';
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ customerId: 999, items: [], total: 100 }); // trying to order as different user
    expect(response.status).toBe(403);
  });
});
```

### Example 2: Authentication Function

**Code Change (backend/auth/login.js):**
```javascript
async function login(username, password) {
  const user = await db.findUser(username);
  if (user && bcrypt.compareSync(password, user.passwordHash)) {
    return jwt.sign({ userId: user.id }, SECRET_KEY);
  }
  return null;
}
```

**Required Security Tests:**
```javascript
describe('Security: Authentication', () => {

  it('should accept valid credentials', async () => {
    const token = await login('validuser', 'correctpassword');
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token, SECRET_KEY);
    expect(decoded.userId).toBe(expectedUserId);
  });

  it('should reject invalid password', async () => {
    const token = await login('validuser', 'wrongpassword');
    expect(token).toBeNull();
  });

  it('should reject non-existent user', async () => {
    const token = await login('nonexistent', 'anypassword');
    expect(token).toBeNull();
  });

  it('should prevent timing attacks', async () => {
    const start1 = Date.now();
    await login('validuser', 'wrongpassword');
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await login('nonexistent', 'anypassword');
    const time2 = Date.now() - start2;

    // Timing should be similar (within 50ms) to prevent user enumeration
    expect(Math.abs(time1 - time2)).toBeLessThan(50);
  });

  it('should reject SQL injection attempts in username', async () => {
    const token = await login("admin' OR '1'='1", 'anypassword');
    expect(token).toBeNull();
  });

  it('should handle special characters in password safely', async () => {
    const specialChars = "'; DROP TABLE users; --";
    const token = await login('validuser', specialChars);
    expect(token).toBeNull();
    // Verify users table still exists
    const users = await db.query('SELECT COUNT(*) FROM users');
    expect(users).toBeDefined();
  });
});
```

### Example 3: Input Validation

**Code Change (backend/validators/order.js):**
```javascript
function validateOrder(order) {
  if (!order.customerId || !order.items || !order.total) {
    throw new Error('Missing required fields');
  }
  if (order.total < 0) {
    throw new Error('Total cannot be negative');
  }
  return true;
}
```

**Required Security Tests:**
```javascript
describe('Security: Order Validation', () => {

  it('should accept valid orders', () => {
    const valid = { customerId: 1, items: ['item1'], total: 100 };
    expect(() => validateOrder(valid)).not.toThrow();
  });

  it('should reject missing customerId', () => {
    const invalid = { items: ['item1'], total: 100 };
    expect(() => validateOrder(invalid)).toThrow('Missing required fields');
  });

  it('should reject negative totals', () => {
    const invalid = { customerId: 1, items: ['item1'], total: -100 };
    expect(() => validateOrder(invalid)).toThrow('Total cannot be negative');
  });

  it('should reject extremely large totals (overflow protection)', () => {
    const invalid = { customerId: 1, items: ['item1'], total: Number.MAX_SAFE_INTEGER + 1 };
    expect(() => validateOrder(invalid)).toThrow();
  });

  it('should reject non-numeric totals', () => {
    const invalid = { customerId: 1, items: ['item1'], total: "100' OR '1'='1" };
    expect(() => validateOrder(invalid)).toThrow();
  });

  it('should reject array injection in customerId', () => {
    const invalid = { customerId: [1, 2, 3], items: ['item1'], total: 100 };
    expect(() => validateOrder(invalid)).toThrow();
  });
});
```

## Test Execution and Verification

After creating/updating tests:

1. **Run the new tests:**
```bash
npm test -- --grep "Security:"
# or
npm test tests/security/
```

2. **Verify coverage:**
```bash
npm run test:coverage
# Check that changed files have security test coverage
```

3. **Report results:**
- List tests added/updated
- Show test execution results
- Report coverage percentages
- Identify remaining gaps

## Integration with Development Workflow

### Trigger Points
1. **After Code Edit**: When using Edit or Write tools to modify security-relevant code
2. **After Feature Addition**: When implementing new endpoints or features
3. **Explicit Request**: When user asks to "update security tests"
4. **Pre-Commit**: Before committing security-related changes

### Workflow Example
```
User: "Add a new POST /api/users endpoint"
Assistant: [Implements endpoint code]
Assistant: [security-test-updater skill activates]
Assistant: [Analyzes new endpoint security requirements]
Assistant: [Creates/updates tests in tests/security/api/users.test.js]
Assistant: [Runs tests to verify]
Assistant: "Security tests updated. Added 5 new test cases covering authentication, input validation, and injection prevention."
```

## Quality Standards

Every security test must:
- ✅ Have a clear, descriptive name explaining what's being tested
- ✅ Test both positive (should allow) and negative (should block) cases
- ✅ Include at least one attack scenario simulation
- ✅ Have proper assertions with meaningful error messages
- ✅ Include comments explaining the security rationale
- ✅ Reference the code file/function being tested
- ✅ Be runnable in isolation (no test interdependencies)
- ✅ Clean up after itself (restore state, close connections)

## Common Security Test Patterns

### Pattern 1: Unauthorized Access
```javascript
it('should reject unauthorized access to [resource]', async () => {
  const response = await request(app)
    .get('/api/protected-resource')
    // No Authorization header
    .expect(401);
  expect(response.body.error).toBe('Unauthorized');
});
```

### Pattern 2: Insufficient Permissions
```javascript
it('should prevent regular users from accessing admin resources', async () => {
  const userToken = generateTokenForRole('user');
  const response = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${userToken}`)
    .expect(403);
  expect(response.body.error).toBe('Forbidden');
});
```

### Pattern 3: Input Validation
```javascript
it('should reject [invalid input type]', async () => {
  const maliciousInput = "<script>alert('xss')</script>";
  const response = await request(app)
    .post('/api/resource')
    .send({ name: maliciousInput })
    .expect(400);
  expect(response.body.error).toContain('Invalid input');
});
```

### Pattern 4: Injection Prevention
```javascript
it('should prevent SQL injection in [parameter]', async () => {
  const injectionAttempt = "1' OR '1'='1";
  const response = await request(app)
    .get(`/api/users/${injectionAttempt}`)
    .expect(400);
  // Verify no data was leaked
  expect(response.body.users).toBeUndefined();
});
```

### Pattern 5: Rate Limiting
```javascript
it('should enforce rate limits on [endpoint]', async () => {
  const requests = Array(101).fill(null).map(() =>
    request(app).post('/api/orders')
  );
  const responses = await Promise.all(requests);
  const tooManyRequests = responses.filter(r => r.status === 429);
  expect(tooManyRequests.length).toBeGreaterThan(0);
});
```

## Output and Reporting

After updating tests, provide:

1. **Summary of Changes:**
   - Number of test files created/updated
   - Number of new test cases added
   - Categories of tests added (auth, validation, injection, etc.)

2. **Test Execution Results:**
   ```
   Security Test Results:
   ✅ 45 tests passed
   ❌ 2 tests failed
   ⚠️ 3 tests skipped (pending implementation)

   Coverage: 87% of changed files
   ```

3. **Remaining Gaps:**
   - List any security scenarios not yet covered
   - Suggest additional tests that should be added

4. **Recommendations:**
   - Any code changes needed to make tests pass
   - Additional security measures to consider

## Important Notes

- **Always run tests after creating them** to ensure they work correctly
- **Tests should fail appropriately** - verify security controls actually block attacks
- **Don't just test happy paths** - attack scenarios are more important
- **Keep tests maintainable** - use helpers and utilities to reduce duplication
- **Document test purposes** - future developers need to understand why tests exist
- **Update test data** - ensure test fixtures reflect current schema and requirements

This skill helps maintain a strong security posture by ensuring that security tests evolve alongside the codebase, preventing regressions and catching vulnerabilities early.