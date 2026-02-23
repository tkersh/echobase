# ADR-002: Two-Layer Infrastructure Model (Durable + Ephemeral)

## Status

Accepted

## Date

2026-01-24

## Context

Traditional deployment models treat all infrastructure as either fully persistent or fully ephemeral. This creates problems for blue-green deployments:

- **Fully persistent**: Can't deploy new versions without affecting production
- **Fully ephemeral**: Lose database state on every deployment

We needed an architecture that supports:
- Zero-downtime deployments
- Multiple environments running simultaneously (blue + green)
- Persistent data across deployments
- Easy teardown of application services without data loss

## Decision

Implement a **two-layer infrastructure model** separating durable (persistent) and ephemeral (deployable) components.

### Durable Layer

Location: `durable/docker-compose.yml`

Components that persist across all deployments:
- **MariaDB**: Shared database for blue and green
- **LocalStack (Secrets Manager, KMS)**: Credential storage
- **nginx**: Load balancer, traffic router, and observability UI auth proxy
- **OTEL Collector**: Receives traces, metrics, and logs from app services
- **Prometheus**: Metrics storage
- **Jaeger**: Distributed tracing
- **Loki**: Log aggregation
- **Grafana**: Unified observability dashboard

Container prefix: `echobase-{devlocal|ci}-durable-`

Managed with:
```bash
./durable/setup.sh [devlocal|ci]
./durable/teardown.sh [devlocal|ci]
```

### Ephemeral Layer

Location: `docker-compose.yml` + `docker-compose.{blue|green}.yml`

Components that can be deployed/destroyed independently:
- **API Gateway**: Express + JWT auth
- **Frontend**: React + Vite
- **Order Processor**: SQS consumer
- **LocalStack (SQS)**: Message queues

Container prefix: `echobase-{blue|green}-`

Managed with:
```bash
docker compose -f docker-compose.yml -f docker-compose.blue.yml -p echobase-blue up -d
docker compose -p echobase-blue down
```

### Layer Interaction

```
┌──────────────────────────────────────────────────────────────────┐
│                         DURABLE LAYER                            │
│  ┌─────────┐  ┌───────────┐  ┌───────────────┐                 │
│  │ MariaDB │  │ LocalStack│  │     nginx     │                 │
│  │  :3306  │  │ (Secrets) │  │ (LB + Auth)   │                 │
│  └────┬────┘  └─────┬─────┘  └───────┬───────┘                 │
│       │             │                 │                          │
│  ┌────┴─────────────┴─────────────────┴───────────────────────┐ │
│  │                 Observability Stack                         │ │
│  │  OTEL Collector → Prometheus, Jaeger, Loki ← Grafana       │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────┬───────────────┬────────────────────┬────────────────────┘
        │               │                    │
        │   ┌───────────┴───────────┐        │
        │   │                       │        │
┌───────┼───┼───────────┐   ┌───────┼────────┼───────────┐
│       ▼   ▼           │   │       ▼        ▼           │
│  BLUE EPHEMERAL       │   │  GREEN EPHEMERAL           │
│  ┌──────────────┐     │   │  ┌──────────────┐          │
│  │ API Gateway  │     │   │  │ API Gateway  │          │
│  │ Frontend     │     │   │  │ Frontend     │          │
│  │ Order Proc   │     │   │  │ Order Proc   │          │
│  │ LocalStack   │     │   │  │ LocalStack   │          │
│  └──────────────┘     │   │  └──────────────┘          │
└───────────────────────┘   └────────────────────────────┘
```

## Consequences

### Positive

- **Zero-downtime deployments**: Deploy new version to inactive environment, switch traffic
- **Instant rollback**: Switch back to previous environment if issues detected
- **Shared database**: No data synchronization needed between environments
- **Independent scaling**: Ephemeral services can be scaled without touching durable layer
- **Clean separation**: Clear ownership of persistent vs deployable components

### Negative

- **Complexity**: Two docker-compose files, multiple networks, container naming conventions
- **Resource usage**: Running two application stacks simultaneously uses more resources
- **Network configuration**: Ephemeral containers must be connected to durable network

### Neutral

- **Port allocation**: Requires careful port planning to avoid conflicts (see CLAUDE.md port table)
- **Environment-specific compose files**: `docker-compose.blue.yml` and `docker-compose.green.yml` override base config

## Alternatives Considered

### 1. Single docker-compose with replicas

**Rejected**: Doesn't support true blue-green with different code versions running simultaneously.

### 2. Kubernetes with Deployments

**Rejected**: Overkill for development/CI environment. Docker Compose is simpler and sufficient for this use case.

### 3. Database per environment

**Rejected**: Would require data synchronization, complicates rollback, and doubles storage costs.

## References

- `durable/docker-compose.yml` - Durable infrastructure definition
- `docker-compose.yml` - Base ephemeral services
- `docker-compose.blue.yml` / `docker-compose.green.yml` - Environment overrides
- `docs/BLUE-GREEN-DEPLOYMENT.md` - Deployment documentation
