# ADR-003: nginx as Single Source of Truth for Active Environment

## Status

Accepted

## Date

2026-01-24

## Context

In a blue-green deployment model, the system must track which environment (blue or green) is currently serving production traffic. This state must be:

- **Consistent**: All components must agree on which environment is active
- **Persistent**: Survives container restarts and CI job failures
- **Queryable**: Scripts and CI jobs need to determine the active environment
- **Authoritative**: Must match what's actually routing traffic

Previous approaches considered:
- Docker labels on containers
- Artifacts passed between CI jobs
- S3/file-based state storage
- Environment variables

All had synchronization issues - the recorded state could diverge from actual traffic routing.

## Decision

Use **nginx configuration as the single source of truth** for which environment is active.

### Implementation

nginx config contains the active environment marker:
```nginx
# In nginx config
location = /.active-env {
    default_type text/plain;
    return 200 "blue";  # or "green" or "none"
}
```

Scripts query nginx directly:
```bash
# scripts/get-active-environment.sh
curl -s http://localhost/.active-env
# Returns: "blue", "green", or "none"

# scripts/detect-target-environment.sh
# Queries nginx, returns the OTHER environment for deployment
```

### Query Flow

```
┌─────────────────────────────────────────────────────────┐
│                     CI/CD Pipeline                       │
│                                                          │
│  ┌─────────────────────┐                                │
│  │ detect-target-env.sh │                                │
│  │                      │                                │
│  │ 1. Query nginx       │                                │
│  │ 2. If blue → green   │                                │
│  │ 3. If green → blue   │                                │
│  │ 4. If none → green   │                                │
│  └──────────┬───────────┘                                │
│             │ curl /.active-env                          │
│             ▼                                            │
│  ┌─────────────────────┐                                │
│  │  nginx (durable)     │                                │
│  │                      │                                │
│  │  Config contains:    │                                │
│  │  return 200 "blue"   │ ◄── Single Source of Truth    │
│  └──────────┬───────────┘                                │
│             │                                            │
│             ▼                                            │
│  Traffic routes to blue environment                      │
└─────────────────────────────────────────────────────────┘
```

### Traffic Switching

`scripts/switch-traffic.sh` updates nginx config and reloads:
```bash
./scripts/switch-traffic.sh green
# 1. Generates new nginx config with green as active
# 2. Copies config to nginx container
# 3. Reloads nginx
# 4. Verifies /.active-env returns "green"
```

## Consequences

### Positive

- **No synchronization issues**: Config directly controls what routes traffic
- **Always accurate**: Can't have state say "blue" while routing to "green"
- **Survives failures**: Config persists in durable container
- **No artifacts needed**: CI jobs query nginx directly, no file passing
- **Simple queries**: `curl /.active-env` returns current state

### Negative

- **nginx dependency**: Scripts fail if nginx container is down
- **No history**: Only current state is stored (no audit trail without logging)
- **Docker exec required**: In CI, must use `docker exec` to query nginx

### Neutral

- **Config regeneration**: Switching traffic requires regenerating and copying config file
- **Reload latency**: nginx reload takes ~100ms

## Alternatives Considered

### 1. Docker container labels

**Rejected**: Labels could be stale if containers restart. Would require updating labels atomically with traffic switch.

### 2. CI artifacts

**Rejected**: Artifacts can be missing, corrupted, or stale. Jobs might run on different runners without artifact access.

### 3. S3 state file

**Rejected**: Adds external dependency. State could diverge from actual nginx config.

### 4. Consul/etcd

**Rejected**: Overkill for this use case. nginx already exists and routes traffic.

## References

- `scripts/get-active-environment.sh` - Query active environment
- `scripts/detect-target-environment.sh` - Determine deployment target
- `scripts/switch-traffic.sh` - Switch traffic and update nginx
- `scripts/generate-nginx-config.sh` - Generate nginx config from template
- `nginx-blue-green.conf.template` - nginx configuration template
