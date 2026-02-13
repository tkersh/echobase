# Audit & Fix Plan: {{target_path}}

## Executive Summary
{{brief_state_of_the_code}}

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | {{count}} | {{areas}} |
| **High** | {{count}} | {{areas}} |
| **Medium** | {{count}} | {{areas}} |
| **Low** | {{count}} | {{areas}} |

---

## Critical Violations (High Priority)
*Immediate risks to scalability, security, or stability.*
- **Issue:** {{issue}}
- **Impact:** {{impact}}
- **Fix:** {{fix_suggestion}}
- **Location:** `{{file_path}}:{{line_numbers}}`
- **Status:** {{RESOLVED | DEFERRED | DECLINED}} {{— reason if deferred/declined; deviation note if implementation differed from plan}}

---

## Security Findings
*Authentication, authorization, input validation, credential exposure, and trust boundary issues.*
- **Issue:** {{issue}}
- **Severity:** {{Critical|High|Medium|Low}}
- **Impact:** {{impact}}
- **Fix:** {{fix_suggestion}}
- **Location:** `{{file_path}}:{{line_numbers}}`
- **Status:** {{RESOLVED | DEFERRED | DECLINED}}

---

## Infrastructure & DevOps
*Container hygiene, CI/CD configuration, health checks, resource limits, and deployment reliability.*
- **Issue:** {{issue}}
- **Severity:** {{Critical|High|Medium|Low}}
- **Impact:** {{impact}}
- **Fix:** {{fix_suggestion}}
- **Location:** `{{file_path}}:{{line_numbers}}`
- **Status:** {{RESOLVED | DEFERRED | DECLINED}}

---

## Observability & Error Handling
*Logging inconsistencies, missing tracing, error contract mismatches, and correlation gaps.*
- **Issue:** {{issue}}
- **Severity:** {{Critical|High|Medium|Low}}
- **Impact:** {{impact}}
- **Fix:** {{fix_suggestion}}
- **Location:** `{{file_path}}:{{line_numbers}}`
- **Status:** {{RESOLVED | DEFERRED | DECLINED}}

---

## Test Quality & Coverage
*Flaky patterns, false negatives, missing isolation, cleanup issues, and coverage gaps.*
- **Issue:** {{issue}}
- **Severity:** {{Critical|High|Medium|Low}}
- **Impact:** {{impact}}
- **Fix:** {{fix_suggestion}}
- **Location:** `{{file_path}}:{{line_numbers}}`
- **Status:** {{RESOLVED | DEFERRED | DECLINED}}

---

## Technical Debt & DRY
*Redundancies, code smells, and repeated patterns.*
- **Observation:** {{observation}}
- **Location:** `{{location}}`
- **Refactor:** {{refactor_strategy}}

---

## Constants & Config
*Hard-coded values to be extracted:*
- [ ] {{value}} -> Move to {{destination}} - Location: `{{file_path}}:{{line_numbers}}`

---

## Architectural Recommendations
- {{high_level_advice}}

---

## Action Roadmap (Priority Order)
*The following steps are ordered by technical priority and logical dependency. Complete them in this sequence:*

1. [ ] **PRIORITY 1 - Security:** {{security_fixes}}
2. [ ] **PRIORITY 2 - Stability:** {{stability_fixes}}
3. [ ] **PRIORITY 3 - Architecture:** {{architecture_fixes}}
4. [ ] **PRIORITY 4 - Refactoring/DRY:** {{refactoring_fixes}}
5. [ ] **PRIORITY 5 - Testing:** {{testing_fixes}}
6. [ ] **PRIORITY 6 - Cleanup:** {{cleanup_step_description}}

> [!NOTE]
> Review the plan above. Once approved, I can begin executing Phase 1.