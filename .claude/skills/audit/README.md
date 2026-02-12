# Audit Skill

A senior-level architectural review tool. It analyzes code for structural integrity, security posture, infrastructure hygiene, test quality, observability, configuration management, and technical debt, then generates a formal fix plan.

## What it covers

| Category | Examples |
|----------|----------|
| **Security** | Token storage, input validation, CSRF/CORS, credential exposure, trust boundaries |
| **DRY / Code Smells** | Repeated logic, God functions, deep nesting, poor naming |
| **Hard-coded Values** | Ports, URLs, timeouts, credentials that belong in config |
| **Architecture** | Separation of concerns, error contract consistency, cross-boundary validation |
| **Infrastructure** | Resource limits, health checks, graceful shutdown, image pinning, CI/CD config |
| **Observability** | Logging consistency, correlation IDs, distributed tracing, secret leakage in logs |
| **Test Quality** | Flaky patterns, false negatives, missing isolation, cleanup gaps, coverage holes |
| **Configuration** | Env var sprawl, naming inconsistencies, missing .env.example documentation |
| **Efficiency** | Redundant computations, missing caching, connection pool risks |

## How to use

Type any of the following:
- "Run an **audit** on [folder/file]" - scoped audit of a specific target
- "**Review** this code" - audit the specified code
- "Give me a **senior-audit** of this project" - full-project audit across all domains
- "**Audit** the backend" - scoped to a specific domain

For full-project audits, parallel agents scan different domains (backend, frontend, infrastructure, tests) simultaneously for thoroughness.

## Severity levels

- **Critical** - Exploitable in production, data loss risk, or deployment blocker
- **High** - Significant stability, security, or maintainability risk
- **Medium** - Technical debt that increases maintenance burden
- **Low** - Cleanup and polish items

## Deliverable
Generates a detailed report at `docs/audit-fix-plan.md` with findings organized by category, each with file paths, line numbers, impact assessment, and fix suggestions. Includes a prioritized action roadmap. No code changes are made until the plan is approved.