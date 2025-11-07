# Security Boundaries Analysis Skill

This Claude Code skill automatically analyzes your codebase to identify and document trust boundaries, attack surfaces, and security risks.

## Installation

This skill is already installed as a project skill in `.claude/skills/security-boundaries/`.

All team members with access to this repository will automatically have access to this skill when using Claude Code.

## How It Works

Claude will **automatically invoke** this skill when you:

- Start analyzing a new codebase
- Ask about security architecture
- Request threat modeling or security analysis
- Ask questions about trust boundaries or attack surfaces
- Use phrases like "analyze security" or "document attack surface"

The skill's description is optimized for Claude to recognize when security analysis is needed.

## Manual Invocation

You can also explicitly ask Claude to use this skill:

```
"Use the security-boundaries skill to analyze this project"
"Document the trust boundaries and attack surfaces"
"Run a security analysis on this codebase"
```

## What Gets Analyzed

The skill examines:

- ✅ API endpoints and external interfaces
- ✅ Authentication and authorization mechanisms
- ✅ Input validation and sanitization
- ✅ Database access patterns
- ✅ Third-party integrations
- ✅ File upload/download functionality
- ✅ Command execution points
- ✅ Data encryption (at rest and in transit)
- ✅ Logging and monitoring
- ✅ Common vulnerability patterns (OWASP Top 10)

## Output

Creates `TrustBoundaries.md` in your project root containing:

- Architecture diagram showing trust boundaries
- Comprehensive attack surface enumeration
- Risk assessment with severity levels
- Specific code references (file:line)
- Actionable security recommendations
- Threat scenarios and mitigations

## Customization

You can customize the skill by:

1. **Editing SKILL.md** - Modify the analysis focus or add specific patterns to detect
2. **Updating the template** - Customize the output format in `templates/TrustBoundaries.template.md`
3. **Adding supporting files** - Include additional reference documentation or scripts

## Tool Access

This skill has restricted tool access for security:
- `Read` - Read source code files
- `Glob` - Find files by pattern
- `Grep` - Search for security-relevant code patterns
- `Task` - Launch specialized analysis agents
- `Write` - Create the TrustBoundaries.md output

The skill cannot execute bash commands or modify existing code, ensuring safe analysis.

## Example Usage

### Automatic Invocation

```
You: "Let's review the security architecture of this application"

Claude: [Automatically invokes security-boundaries skill]
        I'll analyze the security boundaries and attack surfaces...
        [Performs comprehensive analysis]
        [Creates TrustBoundaries.md with findings]
```

### Explicit Request

```
You: "Document the trust boundaries and attack surfaces of this system into TrustBoundaries.md"

Claude: [Invokes security-boundaries skill]
        [Analyzes codebase]
        [Generates documentation]
```

## Integration with Development Workflow

Consider using this skill:

- **Before security reviews** - Generate baseline documentation
- **After major architecture changes** - Update trust boundary analysis
- **When onboarding new developers** - Provide security context
- **Before penetration testing** - Identify test targets
- **During threat modeling sessions** - Document attack surfaces

## Maintenance

Update this skill when:

- New security patterns emerge in your architecture
- You adopt new frameworks or technologies
- Compliance requirements change
- Team security standards evolve

## Files

```
.claude/skills/security-boundaries/
├── SKILL.md                          # Skill definition and instructions
├── README.md                         # This file
└── templates/
    └── TrustBoundaries.template.md  # Output format template
```

## Tips for Best Results

1. **Be specific** - "Analyze authentication boundaries" focuses on auth
2. **Provide context** - Mention specific concerns or compliance needs
3. **Review output** - Claude's analysis should be validated by security experts
4. **Iterate** - Ask follow-up questions about specific findings
5. **Update regularly** - Re-run analysis after significant code changes

## Limitations

- This is automated analysis, not a substitute for manual security review
- May not catch logic flaws or business logic vulnerabilities
- Depends on code quality and documentation
- Cannot perform dynamic testing or penetration testing
- Should be complemented with security scanning tools

## Security Note

This skill only analyzes code and creates documentation. It does not:
- Execute code or commands
- Modify existing files
- Make network requests
- Access production systems
- Store or transmit sensitive data

## Support

For issues or enhancements:
1. Review the SKILL.md description to ensure proper triggers
2. Check that allowed-tools includes necessary capabilities
3. Examine Claude Code documentation for skill troubleshooting
4. Update the skill definition based on project needs

## Version

**Version**: 1.0.0
**Created**: 2025-11-05
**Last Updated**: 2025-11-05