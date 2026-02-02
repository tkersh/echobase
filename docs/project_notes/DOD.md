# Definition of Done

A checklist for verifying that any task is truly complete. Run through the applicable sections before considering work finished.

---

## General Checklist

Every task must satisfy these items:

### Code
- [ ] Change is complete and implements all requirements
- [ ] Code builds without errors
- [ ] No regressions introduced (existing functionality still works)
- [ ] Code follows project style/linting and contains no debug logs or commented-out blocks
  [ ] Logic handles edge cases (null/empty states) and fails gracefully (no infinite loaders)
- [ ] No hardcoded environment names, ports, or hostnames — use variables
- [ ] No over-engineering — only changes directly requested or clearly necessary
- [ ] No new dependencies added without explicit approval; licenses are permissive (MIT/Apache)

### Code Hygiene

* [ ] **Linting & Formatting:** Code passes all project linters (ESLint, Prettier, Black, etc.) and follows local style conventions.
* [ ] **No "Ghost" Code:** No commented-out code blocks or `console.log`/`print` statements used for debugging left in the final PR.
* [ ] **Dead Code Removal:** If a function or component was replaced, the old version was deleted, not just disconnected.

### Edge Case & Error Handling

* [ ] **Edge Cases:** Logic handles `null`, `undefined`, empty strings, or empty arrays where applicable.
* [ ] **Graceful Failure:** If a service call or API request fails, the UI/system fails gracefully (no "infinite loaders" or silent crashes).

### Dependency Management

* [ ] **No Stealth Dependencies:** No new packages added to `package.json` or `requirements.txt` unless explicitly approved.
* [ ] **License Check:** Any newly added dependencies use permissive licenses (MIT, Apache) and don't introduce vulnerabilities (`npm audit`).

### Tests
- [ ] All affected test suites pass (not just the primary one)
- [ ] New behavior has corresponding test coverage where appropriate
- [ ] Search for stale references if renaming or removing anything (selectors, field names, endpoints)
- [ ] Run codebase-wide search for old values after any rename/migration (see "API / Data Format Changes" below)

### Bug Tracker
- [ ] If this is a bug fix, entry added to `docs/project_notes/bugs.md` with date, root cause, solution, and prevention notes

### Guidelines
- [ ] If the fix reveals a general lesson, add it to `docs/project_notes/guidelines.md`

### Documentation
- [ ] Update relevant docs if behavior, API, or configuration changed (Troubleshooting.md, README, Swagger, example code)
- [ ] Update `docs/project_notes/key_facts.md` if ports, paths, or container names changed

### Security
- [ ] No new vulnerabilities introduced (OWASP top 10: injection, XSS, CSRF, etc.)
- [ ] Security tests updated if auth, validation, or access control logic changed

### Logging
- [ ] Appropriate diagnostics added for failure scenarios
- [ ] Error messages include context: what was attempted, what values were involved, what failed

---

## Additional Checklists by Change Type

Use these supplemental checklists when the change falls into one of these categories.

### API / Data Format Changes

Triggered when request/response payloads, field names, or endpoint paths change.

- [ ] Codebase-wide search for old field names (`grep -r "oldFieldName"`)
- [ ] Check all locations: test files, test helpers, fixtures, shell scripts, documentation, example code, Swagger/OpenAPI specs
- [ ] Smoke tests (`scripts/smoke-tests.sh`) updated with new payload format
- [ ] E2E test helpers (`e2e-tests/helpers/test-helpers.js`) updated
- [ ] API Gateway unit tests updated
- [ ] README and inline code examples updated
- [ ] Security tests updated (SQL injection, XSS tests may reference old fields)
* Lesson learned: The products migration left stale `{productName, quantity, totalPrice}` payloads in 6+ files across smoke tests, E2E tests, security tests, helpers, and documentation. A single `grep -r` would have caught them all.*

### Infrastructure / Durable Service Changes

Triggered when modifying docker-compose files, durable services, or CI pipeline.

- [ ] Change works in both blue and green environments (use `$DEPLOY_TARGET`, not hardcoded names)
- [ ] Durable vs ephemeral distinction respected (persistent state in durable layer only)
- [ ] Credential setup follows transactional pattern (Secrets Manager first, then database)
- [ ] New durable services added to all three places: `durable/setup.sh` start path, "already running" refresh path, and `teardown-all.sh` service list
- [ ] nginx config updated if routing changes needed
- [ ] Port allocation checked against port map in CLAUDE.md (no conflicts)
- [ ] Environment variables defined in `.gitlab-ci.yml` if used in CI
- [ ] `docker compose config` verified for correct variable substitution
- [ ] Per-environment values defined in environment-specific files, not base docker-compose.yml

### Frontend Changes

Triggered when modifying UI components, selectors, or page structure.

- [ ] All E2E test files searched for affected selectors (`grep -r "oldSelector" e2e-tests/`)
- [ ] Frontend spec, API spec, and security spec all checked for stale selectors
- [ ] Form control type changes (e.g., input to select) reflected in all tests using that control
- [ ] Cached/stale data handled gracefully (localStorage, service workers)
- [ ] CORS_ORIGIN updated in all environment files if new origins needed

### Shell Script Changes

Triggered when modifying bash scripts in `scripts/` or `durable/`.

- [ ] Script is executable (`chmod +x`)
- [ ] Arguments passed through `sh -c` are single-quoted to prevent shell interpretation
- [ ] Uses `"$@"` not `$*` for argument forwarding
- [ ] Error handling follows project pattern: fail hard for required features, warn for optional
- [ ] Tested in both network modes if applicable (host and container)
- [ ] `after_script` blocks are resilient to failures

### CI Pipeline Changes

Triggered when modifying `.gitlab-ci.yml`.

- [ ] Job handles missing artifacts gracefully (`|| echo` fallbacks)
- [ ] `after_script` handles failures
- [ ] Environment names parameterized (use `$DEPLOY_TARGET`)
- [ ] New jobs added to correct stage
- [ ] Job dependencies (`needs`) chain correctly
- [ ] All jobs run on same runner (required for shared Docker containers)

---

## How to Use This Checklist

1. Start with the **General Checklist** — every task must pass all applicable items
2. Identify which **Additional Checklists** apply based on the type of change
3. Work through each applicable checklist
4. If a checklist item doesn't apply, skip it — but consider whether it *should* apply before dismissing it

## Agent Verification (Required)
Before submitting, the agent must provide a brief "Evidence of Done" summary added to RELEASE_NOTES.md
* [ ] **Summary of Changes:** A concise description of *what* was changed and *why* is provided for the PR/Commit message.
* [ ] **Tests Run:** (The exact command used)
* [ ] **Search Verification:** (The `grep` commands used to find stale references)
* [ ] **Manual Verification:** (How a human can quickly verify the fix)
---

*Last Updated: 2026-02-02*
