# ADR-004: Blue-Green Deployment Architecture

## Status

Accepted

## Date

2026-01-24

## Context

The system requires:
- Zero-downtime deployments
- Instant rollback capability
- Pre-production testing of new versions
- Confidence that deployments won't break production

Traditional rolling deployments don't provide instant rollback and can leave the system in a mixed state during deployment.

## Decision

Implement **blue-green deployment** where two complete environments run simultaneously, with nginx routing production traffic to one while the other is updated.

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DETECT TARGET                                                │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Query nginx: "What's active?"                           │ │
│     │ If blue → deploy to GREEN                               │ │
│     │ If green → deploy to BLUE                               │ │
│     │ If none → deploy to GREEN (bootstrap)                   │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  2. DEPLOY TO INACTIVE                                           │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ docker compose -p echobase-$TARGET up -d --build        │ │
│     │ Wait for health checks to pass                          │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  3. SMOKE TEST (Pre-promotion)                                   │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Test via direct ports (8080 for blue, 8081 for green)   │ │
│     │ Verify health, frontend, auth flow, order submission    │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  4. SWITCH TRAFFIC                                               │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ ./scripts/switch-traffic.sh $TARGET                     │ │
│     │ nginx now routes to new environment                     │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  5. SMOKE TEST (Post-promotion)                                  │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Test via production URL (port 443)                      │ │
│     │ If fails → ROLLBACK to previous environment             │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  6. (Optional) TEARDOWN OLD                                      │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Keep old environment for quick rollback                 │ │
│     │ Or teardown to free resources                           │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Port Allocation

| Service | Blue | Green | Production (nginx) |
|---------|------|-------|-------------------|
| Frontend HTTPS | 3544 | 3543 | 443 |
| API Gateway | 3102 | 3101 | 443/api |
| Direct Access | 8080 | 8081 | - |

### Rollback

Rollback is instant - just switch traffic back:
```bash
# If green deployment fails
./scripts/switch-traffic.sh blue
# Production immediately routes to blue again
```

## Consequences

### Positive

- **Zero downtime**: Traffic switches atomically via nginx
- **Instant rollback**: Previous version still running, just switch back
- **Pre-production testing**: Test new version before it receives traffic
- **Confidence**: If smoke tests pass on direct ports, production will work
- **Isolation**: New deployment can't affect production until traffic switch

### Negative

- **Resource usage**: Two complete environments running simultaneously
- **Database migrations**: Must be backwards-compatible (both versions share DB)
- **Complexity**: More moving parts than simple restart deployments

### Neutral

- **Cleanup responsibility**: Must decide when to teardown old environment
- **State management**: nginx must accurately track active environment (see ADR-003)

## Database Migration Strategy

Since both environments share the database:

1. **Additive changes only**: Add columns/tables, don't remove
2. **Default values**: New columns must have defaults for old code
3. **Deprecation period**: Remove columns only after both versions updated
4. **Feature flags**: Use flags to enable new features after migration

## Alternatives Considered

### 1. Rolling deployment

**Rejected**: No instant rollback. Mixed state during deployment.

### 2. Canary deployment

**Considered for future**: Could route percentage of traffic to new version. Current architecture supports this but not implemented.

### 3. Feature flags only

**Rejected**: Doesn't address infrastructure/dependency changes. Code still deploys together.

## References

- ADR-002: Two-Layer Infrastructure (enables blue-green)
- ADR-003: nginx as Single Source of Truth
- `docs/BLUE-GREEN-DEPLOYMENT.md` - Detailed documentation
- `.gitlab-ci.yml` - CI pipeline implementation
