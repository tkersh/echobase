# Claude AI Development Guide for Echobase

This document provides critical context for AI assistants working on this codebase.

**Detailed documentation is in `docs/project_notes/`** - this file contains protocols for when to consult each document.

---

## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.

### Memory Files

| File | Contents |
|------|----------|
| **guidelines.md** | Architecture principles, CI/CD constraints, deployment patterns, common pitfalls, decision-making guidelines |
| **key_facts.md** | Commands, ports, secrets paths, critical files, environment variables |
| **bugs.md** | Bug log with dates, solutions, and prevention notes |
| **decisions.md** | Index of Architectural Decision Records (ADRs) |
| **issues.md** | Work log with ticket IDs and descriptions |
| **DOD.md** | Definition of Done checklist (READ BEFORE marking any task complete) |
| **DOR.md** | Definition of Ready checklist (READ BEFORE starting any task) |

---

## Memory-Aware Protocols

### Before Starting Any Task
- Review `docs/project_notes/DOR.md` and work through the applicable readiness checklists
- Gather context, understand architecture, and assess impact before writing code

### When Completing Any Task
- Review `docs/project_notes/DOD.md` and work through the applicable checklists
- General checklist applies to every task; additional checklists apply based on change type

### Before Proposing Architectural Changes
- Check `docs/project_notes/decisions.md` for existing decisions
- Verify the proposed approach doesn't conflict with past choices
- If it does conflict, acknowledge the existing decision and explain why a change is warranted

### Before Modifying Infrastructure or Scripts
- Read `docs/project_notes/guidelines.md` first
- Especially important for: smoke tests, curl commands, nginx routing, shell scripts, CORS/CSRF handling
- These capture lessons learned about endpoint routing, network modes, shell escaping, and Origin header requirements

### When Adding New Code or Infrastructure
- Always include appropriate logging for failure diagnostics
- See `docs/project_notes/guidelines.md` "Logging and Diagnostics" section

### When Encountering Errors or Bugs
- Search `docs/project_notes/bugs.md` for similar issues
- Apply known solutions if found
- Document new bugs and solutions when resolved

### When Fixing a Bug
- Add the specific bug to `docs/project_notes/bugs.md`
- Add general guidelines to `docs/project_notes/guidelines.md` that capture the broader lessons

### When Looking Up Project Configuration
- Check `docs/project_notes/key_facts.md` for ports, secrets paths, container naming, commands
- Prefer documented facts over assumptions

### When Completing Work on Tickets
- Log completed work in `docs/project_notes/issues.md`
- Include ticket ID, date, brief description

### When User Requests Memory Updates
- Update the appropriate memory file (bugs, decisions, key_facts, or issues)
- Follow the established format and style (bullet lists, dates, concise entries)

---

## Quick Command Reference

```bash
./start.sh                              # Setup + start (idempotent)
cd backend/api-gateway && npm test      # API Gateway tests
cd e2e-tests && npm test                # E2E tests
./scripts/detect-target-environment.sh  # Which env to deploy to
./scripts/get-active-environment.sh     # Current production env
```

See `docs/project_notes/key_facts.md` for full command reference.

---

## Document Maintenance

**When to update docs/project_notes/**:

- New architectural patterns → `guidelines.md`
- Common bugs/pitfalls → `bugs.md` + `guidelines.md`
- Configuration changes → `key_facts.md`
- Major decisions → `decisions.md` + create ADR

**Last Updated**: 2026-02-03
**Version**: 3.0 (Moved detailed content to docs/project_notes/)
