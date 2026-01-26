# Key Facts

Non-sensitive project configuration, constants, and frequently-needed reference information.

## Security Warning

**NEVER store passwords, API keys, or sensitive credentials in this file.** This file is committed to version control.

**Where to store secrets:**
- Secrets Manager (durable LocalStack): `echobase/database/credentials`, `echobase/database/encryption-key`
- Environment variables in `.env` files (excluded via `.gitignore`)

---

## Infrastructure Architecture

**Two-Layer Model:**
- **Durable Layer**: MariaDB, Secrets Manager (LocalStack), nginx - persistent infrastructure
- **Ephemeral Layer**: API Gateway, Frontend, Order Processor, SQS (LocalStack) - blue/green deployable

**Container Naming:**
- Durable: `echobase-{devlocal|ci}-durable-{service}`
- Ephemeral Blue: `echobase-blue-{service}`
- Ephemeral Green: `echobase-green-{service}`

---

## Port Allocation

### Dev-Local Environment
| Service | Port |
|---------|------|
| API Gateway | 3001 |
| Frontend HTTPS | 3443 |
| LocalStack (ephemeral) | 4566 |
| MariaDB | 3306 |

### CI Blue Environment
| Service | Port |
|---------|------|
| API Gateway | 3102 |
| Frontend HTTPS | 3544 |
| LocalStack (ephemeral) | 4667 |
| MariaDB | 3307 (shared) |

### CI Green Environment
| Service | Port |
|---------|------|
| API Gateway | 3101 |
| Frontend HTTPS | 3543 |
| LocalStack (ephemeral) | 4666 |
| MariaDB | 3307 (shared) |

---

## Secrets Manager Paths

All secrets stored in durable LocalStack at runtime:

- `echobase/database/credentials` - MariaDB username/password
- `echobase/database/encryption-key` - MariaDB AES-256 encryption key (see ADR-001)

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base ephemeral services (no ports) |
| `docker-compose.override.yml` | Dev-local ports (auto-loaded) |
| `docker-compose.blue.yml` | CI blue environment |
| `docker-compose.green.yml` | CI green environment |
| `durable/docker-compose.yml` | Persistent infrastructure |
| `.gitlab-ci.yml` | CI pipeline definition |

---

## Environment Variable Naming

Pattern: `{ENV}_{SERVICE}_{PROPERTY}`

Examples:
- `GREEN_FRONTEND_PORT`
- `BLUE_API_GATEWAY_PORT`

**Important:** Containers expect exact env-prefixed names. Don't use generic names like `FRONTEND_PORT`.

---

## LocalStack Instances

| Instance | Purpose | Persistence |
|----------|---------|-------------|
| Durable (`echobase-{env}-durable-localstack`) | Secrets Manager, KMS | Persistent |
| Ephemeral (`echobase-{blue\|green}-localstack`) | SQS queues | Per-deployment |

---

## Important URLs

**Documentation:**
- Deployment Architecture: `docs/BLUE-GREEN-DEPLOYMENT.md`
- Security Overview: `docs/SECURITY.md`
- Trust Boundaries: `TrustBoundaries.md`

---

## Tips

- Keep entries current (update when things change)
- Mark deprecated items clearly with dates
- Include both production and development details
- Use consistent formatting