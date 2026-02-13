# Command: audit

Use the **audit** skill to perform a high-fidelity architectural review and generate a prioritized fix plan.

## Arguments
- `target`: Directory or file path to audit (default: `.`)
- `scope`: `full-project` | `directory` | `module` (default: `directory`)
- `depth`: `architectural` | `security` | `clean-code` | `all` (default: `all`)

## Instructions for audit

Follow the orchestration steps defined in `.claude/skills/audit/SKILL.md`:

1.  **Initialize Persona:** Adopt the Senior Software Architect persona, focusing on "brittle code" and long-term maintainability over simple functional correctness.
2.  **Domain Discovery:** Identify the project type (Monolith, Microservices, etc.) and tech stack to ensure audit rigor is contextually appropriate.
3.  **Perform Multi-Dimensional Scan:**
    * **Security & Credential Hygiene:** Check for token exposure, trust boundary gaps, and input validation.
    * **Structural Integrity:** Identify DRY violations, "God" functions, and tight coupling.
    * **Environment & Config:** Scan for hard-coded constants, `.env` sprawl, and configuration drift.
    * **Infrastructure & Ops:** Audit Dockerfiles, CI/CD configs, and observability (logging/tracing) gaps.
4.  **Severity Classification:** Map every finding to the **Critical | High | Medium | Low** rubric defined in the skill logic.
5.  **Generate Report:** Populate `docs/audit-fix-plan.md` using the exact structure from `.claude/skills/audit/TEMPLATE.md`.
6.  **Prioritized Roadmap:** Construct the **Action Roadmap** by logical dependency and risk level.
7.  **Halt for Approval:** Do not modify any source code. Wait for the user to approve the generated fix plan before proceeding to any refactoring tasks.