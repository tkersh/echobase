# Security Test Updater Skill

Automatically maintains security test coverage by creating and updating tests whenever security-relevant code changes are made.

## Purpose

This skill ensures that every security-sensitive code change has corresponding test coverage, preventing security regressions and catching vulnerabilities early in the development cycle.

## When It Activates

Claude will automatically invoke this skill when:

- ✅ Code modifications are made (especially security-relevant code)
- ✅ New API endpoints are created
- ✅ Authentication or authorization logic changes
- ✅ Database access code is modified
- ✅ Input validation is added or changed
- ✅ Encryption or cryptographic code changes
- ✅ Third-party integrations are added
- ✅ You explicitly request security test updates

## What It Does

### 1. Analyzes Code Changes
- Identifies what code was modified
- Assesses security implications of changes
- Determines what security scenarios need testing

### 2. Identifies Test Coverage Gaps
- Finds existing security tests
- Compares against required coverage
- Identifies missing test scenarios
- Locates edge cases and attack vectors

### 3. Creates or Updates Tests
- Generates comprehensive security test cases
- Updates existing tests to match code changes
- Adds attack scenario simulations
- Ensures both positive and negative test cases

### 4. Verifies Test Quality
- Runs new/updated tests
- Reports results and coverage
- Identifies remaining gaps

## Test Categories Covered

### Authentication & Authorization
- Credential validation
- Token/session management
- Permission checks (RBAC/ABAC)
- Privilege escalation prevention
- Account security (lockout, password policies)

### Input Validation
- Required field validation
- Type and format validation
- Length and boundary checks
- Special character handling
- Malicious input rejection

### Injection Prevention
- SQL injection attempts
- NoSQL injection attempts
- Command injection attempts
- XSS prevention
- Template injection

### API Security
- Unauthenticated access rejection
- CORS policy enforcement
- Rate limiting
- Request size limits
- HTTP method restrictions

### Data Protection
- Encryption at rest and in transit
- Secure key storage
- No hardcoded secrets
- Proper cipher usage

### Access Control
- Horizontal privilege escalation
- Vertical privilege escalation
- IDOR prevention
- Path traversal prevention
- File access restrictions

## Example Usage

### Automatic Invocation

```
You: "Add a new POST /api/orders endpoint that requires authentication"

Claude: [Implements the endpoint]
Claude: [security-test-updater skill activates automatically]
Claude: "I've added the endpoint. Now updating security tests..."
Claude: [Creates tests/security/api/orders.test.js with:]
        - Authentication requirement test
        - Authorization test
        - Input validation tests
        - SQL injection prevention tests
        - Rate limiting test
Claude: [Runs tests]
Claude: "✅ Security tests updated. Added 7 new test cases. All tests passing."
```

### Explicit Request

```
You: "Update the security tests for the authentication module"

Claude: [security-test-updater skill activates]
Claude: [Analyzes auth code]
Claude: [Updates tests/security/auth/authentication.test.js]
Claude: [Runs tests and reports results]
```

## Test Structure

Tests are organized by security category:

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

## Test Quality Standards

Every security test created by this skill:

- ✅ Has a clear, descriptive name
- ✅ Tests both positive cases (should allow) and negative cases (should block)
- ✅ Includes attack scenario simulations
- ✅ Has proper assertions with meaningful messages
- ✅ Includes comments explaining security rationale
- ✅ References the code being tested
- ✅ Runs in isolation (no interdependencies)
- ✅ Cleans up after itself

## Example Test Output

```javascript
/**
 * Security Test: API Order Endpoint
 *
 * Purpose: Ensure POST /api/orders is secure against common attacks
 * Related Code: backend/api/routes/orders.js
 * Last Updated: 2025-11-05
 * Coverage: Authentication, Authorization, Input Validation, SQL Injection
 */

describe('Security: POST /api/orders', () => {

  it('should reject unauthenticated requests', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({ customerId: 1, items: [], total: 100 });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('should prevent SQL injection in customerId', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer validtoken')
      .send({ customerId: "1'; DROP TABLE orders--", items: [], total: 100 });
    expect(response.status).toBe(400);
  });

  it('should prevent users from creating orders for other users', async () => {
    const user2Token = getTokenForUser(2);
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ customerId: 999, items: [], total: 100 });
    expect(response.status).toBe(403);
  });

  // ... more tests ...
});
```

## Integration with CI/CD

The skill creates tests that can be run in your CI/CD pipeline:

```bash
# Run all security tests
npm test tests/security/

# Run specific category
npm test tests/security/auth/

# Run with coverage
npm run test:coverage

# Run security tests only
npm test -- --grep "Security:"
```

## Benefits

### Automated Security Coverage
- Never forget to test security scenarios
- Consistent test coverage across the codebase
- Reduces manual security testing burden

### Regression Prevention
- Catch security regressions immediately
- Ensure fixes stay fixed
- Maintain security posture over time

### Security by Default
- Security tests created alongside feature code
- Security becomes part of definition of "done"
- Shift-left security testing

### Documentation
- Tests document security requirements
- Clear examples of what's protected
- Attack scenarios documented in code

### Compliance Support
- Demonstrates security testing practices
- Audit trail of security measures
- Supports security certification processes

## Configuration

### Test Framework Detection
The skill automatically detects and uses your testing framework:
- Jest
- Mocha + Chai
- Jasmine
- Supertest (for API testing)
- Etc.

### Customization
You can customize test generation by:
1. Modifying SKILL.md to focus on specific security concerns
2. Adding project-specific test patterns to templates/
3. Creating custom test utilities and helpers

## Common Patterns

### Pattern 1: After Adding Endpoint
```
User: "Add GET /api/users endpoint"
Skill: Creates tests for:
  - Authentication requirement
  - Authorization (only admins)
  - Query parameter validation
  - SQL injection prevention
  - Rate limiting
```

### Pattern 2: After Modifying Auth
```
User: "Update login to support 2FA"
Skill: Updates tests to cover:
  - 2FA token validation
  - Invalid 2FA token rejection
  - 2FA bypass prevention
  - Token expiration
```

### Pattern 3: After Adding Validation
```
User: "Add email validation to user registration"
Skill: Creates tests for:
  - Valid email acceptance
  - Invalid email rejection
  - SQL injection in email field
  - XSS prevention in email
  - Email length limits
```

## Limitations

- Tests generated are based on code analysis, not runtime behavior
- Cannot test complex business logic vulnerabilities automatically
- May need manual refinement for specialized security requirements
- Requires existing test infrastructure to be in place

## Best Practices

1. **Review Generated Tests**: Always review tests before committing
2. **Run Tests Immediately**: Verify tests work and pass/fail correctly
3. **Add Context**: Add comments explaining complex security scenarios
4. **Keep Updated**: Re-run skill when code changes significantly
5. **Supplement with Manual Tests**: Use for baseline coverage, add manual tests for complex scenarios

## Troubleshooting

### Tests Not Being Created
- Ensure your code changes are security-relevant
- Check that test framework dependencies are installed
- Verify test directory structure exists

### Tests Failing
- May indicate actual security issues in code
- Review test expectations vs. actual behavior
- Update code to pass tests or adjust tests if expectations are wrong

### Coverage Gaps
- Skill focuses on common security patterns
- May need manual tests for unique scenarios
- Consider adding custom patterns to SKILL.md

## Support

This skill works best when:
- You have a test framework configured (Jest, Mocha, etc.)
- You follow consistent coding patterns
- You have clear security requirements
- You run tests regularly

## Version

**Version**: 1.0.0
**Created**: 2025-11-05
**Last Updated**: 2025-11-05

## Related Skills

- **security-boundaries**: Analyzes trust boundaries and attack surfaces
- **code-reviewer**: Reviews code for security issues (if available)
- **test-runner**: Executes tests (if available)

---

**Note**: This skill is designed to help maintain security test coverage automatically. It should complement, not replace, manual security reviews, penetration testing, and security audits.