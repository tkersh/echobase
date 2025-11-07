---
name: security-boundaries
description: >
  Proactively analyzes codebases to identify and document security trust boundaries, attack surfaces,
  data flows, and potential vulnerabilities. Use this skill when starting work on a new project,
  when exploring an unfamiliar codebase, when security architecture needs assessment, or when
  the user explicitly requests security analysis. Creates comprehensive documentation in TrustBoundaries.md
  covering: external interfaces, authentication/authorization boundaries, data validation points,
  third-party integrations, network boundaries, privilege escalation risks, and attack surface analysis.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - Write
---

# Security Boundaries Analysis Skill

This skill performs comprehensive security analysis of a codebase to identify trust boundaries and attack surfaces.

## What This Skill Does

Analyzes the project architecture to identify and document:

1. **Trust Boundaries** - Points where data crosses security domains
   - External API endpoints and interfaces
   - User input validation points
   - Authentication and authorization checks
   - Database access layers
   - Third-party service integrations
   - Inter-service communication boundaries
   - File system access points

2. **Attack Surfaces** - Entry points that could be exploited
   - HTTP endpoints (REST APIs, webhooks, etc.)
   - WebSocket connections
   - File upload mechanisms
   - Database queries (SQL injection risks)
   - Command execution points
   - Deserialization points
   - External data parsing (JSON, XML, etc.)

3. **Data Flow Analysis**
   - How untrusted data enters the system
   - Data transformation and validation pipelines
   - Where data is stored and how it's protected
   - Data exfiltration risks

4. **Security Controls**
   - Authentication mechanisms
   - Authorization/access control implementations
   - Input validation and sanitization
   - Encryption (at rest and in transit)
   - Logging and monitoring for security events

## When Claude Uses This Skill

Claude will automatically invoke this skill when:
- You ask to analyze a new codebase or project
- You explicitly request security analysis or threat modeling
- You ask about trust boundaries, attack surfaces, or security architecture
- You're starting work on an unfamiliar project that needs security assessment
- You're building a new project

## Output

Creates or updates `TrustBoundaries.md` in the project root with:
- Architecture diagram (Mermaid) showing trust boundaries
- Detailed enumeration of attack surfaces
- Risk assessment for identified entry points
- Recommendations for security improvements
- References to specific files and line numbers for each finding

## Usage

Simply ask Claude to:
- "Analyze the security boundaries of this project"
- "What are the trust boundaries in this codebase?"
- "Document the attack surfaces"
- Or Claude will invoke this automatically when appropriate

## Analysis Process

1. **Discovery Phase**
   - Identify application entry points (web servers, APIs, CLIs)
   - Find authentication and authorization code
   - Locate data storage and access patterns
   - Identify external integrations

2. **Analysis Phase**
   - Map data flows across boundaries
   - Assess validation and sanitization
   - Evaluate authentication/authorization strength
   - Check for common vulnerability patterns

3. **Documentation Phase**
   - Generate comprehensive TrustBoundaries.md
   - Create visual diagrams
   - Provide actionable recommendations
   - Reference specific code locations

## Example Findings Format

```markdown
## Trust Boundary: API Gateway → Backend Service

**Location**: `src/api/gateway.js:45-67`

**Description**: REST API endpoint accepting user orders

**Trust Level**: External (untrusted) → Internal (trusted)

**Controls in Place**:
- JWT authentication validation
- Input schema validation with Joi
- Rate limiting (100 req/min)

**Risks**:
- [MEDIUM] SQL injection possible if order_id not properly escaped
- [LOW] Denial of service through large payload (>10MB not rejected)

**Recommendations**:
- Use parameterized queries for all database access
- Implement request size limits at middleware level
```