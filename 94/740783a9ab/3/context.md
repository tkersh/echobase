# Session Context

## User Prompts

### Prompt 1

In CI, promote:to-production fails due to smoketest failures, even though test:target-e2e passed (and should have run the smoketest): Test 3: Auth Flow
✗ FAIL: User registration
  → HTTP 403 (expected 201)
Test 4: Order Submission
✗ FAIL: Order submission
  → No auth cookie (login failed)

### Prompt 2

[Request interrupted by user for tool use]

### Prompt 3

We shouldn't hardcode ${host}. Also, is there a less fragile way to accomplish this (like add the 127.* address to CORS_ORIGIN)?

