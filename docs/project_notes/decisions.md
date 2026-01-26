# Architectural Decisions

This file indexes architectural decisions (ADRs) for this project. Full ADR documents are stored as separate files in this directory.

## Format

Each decision should include:
- ADR number and title
- Date
- Status (Proposed, Accepted, Deprecated, Superseded)
- Brief summary
- Link to full ADR document

---

## Decision Index

### ADR-001: Store MariaDB Encryption Key in Secrets Manager (2026-01-23)

**Status:** Accepted

**Summary:** Store the MariaDB data-at-rest encryption key in AWS Secrets Manager (LocalStack in development) rather than baking it into the Docker image. This provides consistent secret management, enables key rotation, and removes build-time dependencies.

**Full Document:** [ADR-001-encryption-key-secrets-manager.md](ADR-001-encryption-key-secrets-manager.md)

**Key Points:**
- Encryption key stored at `echobase/database/encryption-key`
- MariaDB container fetches key at startup via AWS CLI
- Consistent with how database credentials are already managed

---

## Adding New Decisions

When making architectural decisions:

1. Create a new file: `ADR-XXX-brief-title.md`
2. Add an index entry to this file
3. Include: Context, Decision, Alternatives Considered, Consequences

Use the format from ADR-001 as a template.

---

## Tips

- Number decisions sequentially (ADR-001, ADR-002, etc.)
- Always include date for context
- Be honest about trade-offs
- Update status if decisions are revisited or superseded
- Focus on "why" not "how" (implementation details go in code)