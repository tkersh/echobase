# Definition of Ready

Criteria that must be met before starting work on a task. These preparation steps prevent wasted effort and the kinds of bugs this project has encountered repeatedly.

---

## General Readiness Checklist

Before starting any task:

### Context Gathering
- [ ] Requirements are understood — what is being asked, and what "done" looks like
- [ ] `docs/project_notes/bugs.md` searched for prior issues in the affected area
- [ ] `docs/project_notes/guidelines.md` read for relevant sections (especially before touching smoke tests, CORS, shell scripts, nginx routing, or Docker Compose env vars)
- [ ] `docs/project_notes/key_facts.md` consulted for ports, paths, and container names rather than guessing

### Architecture Understanding
- [ ] Affected files and services identified — which layers of the stack does this touch?
- [ ] Durable vs ephemeral distinction understood for any infrastructure changes (see CLAUDE.md "Two-Layer Infrastructure Model")
- [ ] Existing code read before proposing changes — never modify code you haven't read

### Impact Assessment
- [ ] All test suites that could be affected identified (API Gateway unit tests, E2E API tests, E2E frontend tests, E2E security tests, smoke tests)
- [ ] Downstream consumers of any changed interface identified (other services, test files, shell scripts, documentation, example code)

---

## Additional Readiness by Change Type

### Before API / Data Format Changes

- [ ] All current consumers of the endpoint/format identified via codebase search
- [ ] List of files that will need updating compiled *before* starting (test files, helpers, fixtures, shell scripts, docs, examples)
- [ ] New format designed and agreed upon
- [ ] Migration path considered — will old clients break? Is backwards compatibility needed?

*Why: The products migration touched 10+ files across the codebase. Discovering them one at a time during CI caused multiple rounds of fixes. A grep up front would have identified them all.*

### Before Architectural Changes

- [ ] `docs/project_notes/decisions.md` checked for existing ADRs on the topic
- [ ] If conflicting with an existing decision, rationale for the change documented
- [ ] Impact on blue/green deployment understood — does this work in both environments?
- [ ] Impact on CI pipeline understood — does this require new CI jobs, variables, or runner changes?

### Before Infrastructure / Docker Changes

- [ ] Port allocation map in CLAUDE.md reviewed (no port conflicts)
- [ ] Environment variable naming convention understood (`{ENV}_{SERVICE}_{PROPERTY}`)
- [ ] Per-environment values will be defined in environment-specific files, not base docker-compose.yml
- [ ] If adding a durable service: all three registration points identified (`durable/setup.sh` start path, "already running" refresh path, `teardown-all.sh`)
- [ ] `docker compose config` will be used to verify variable substitution after changes

### Before Frontend Changes

- [ ] All E2E test files that interact with the affected components identified
- [ ] Selector names and form control types noted for cross-reference after changes
- [ ] CORS_ORIGIN implications understood if new origins or ports are introduced

### Before Shell Script Changes

- [ ] Relevant guidelines read: "Shell Commands and Escaping" and "Endpoint URLs and Networking" sections of `guidelines.md`
- [ ] Both execution contexts understood — will this run on host (devlocal) and/or inside containers (CI)?
- [ ] Quoting strategy planned for any arguments passed through `sh -c` or `docker exec`

### Before CI Pipeline Changes

- [ ] Single-runner constraint understood — all Docker-dependent jobs must run on the same runner
- [ ] Artifact dependencies mapped — which jobs produce artifacts this job needs?
- [ ] Failure modes considered — what happens if a dependency job fails?
- [ ] `after_script` resilience planned from the start

### Before Security-Related Changes

- [ ] OWASP top 10 relevance assessed — does this change touch auth, input validation, data output, or access control?
- [ ] Existing security tests identified that cover the affected area
- [ ] `TrustBoundaries.md` reviewed if the change modifies trust boundaries or data flows

---

## How to Use This Checklist

1. Start with the **General Readiness Checklist** — every task requires context gathering, architecture understanding, and impact assessment
2. Identify which **Additional Readiness** sections apply based on the type of change
3. Complete the applicable items before writing any code
4. If a checklist item reveals something unexpected (a conflicting ADR, an unknown consumer, a port conflict), resolve it before proceeding

The goal is to front-load discovery so that implementation is a single clean pass rather than a cycle of fix-break-fix.

---

*Last Updated: 2026-02-02*
