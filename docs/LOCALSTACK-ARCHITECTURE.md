# LocalStack Architecture

Echobase uses **4 separate LocalStack instances** across 2 environments (devlocal and CI), with a clear separation between ephemeral (blue-green) and durable (persistent) infrastructure.

## Architecture Overview

```
Dev-Local Environment:
├── Ephemeral LocalStack (echobase-localstack)
│   ├── Port: 4576:4566
│   ├── Services: SQS, CloudWatch Logs, IAM
│   └── Purpose: Queues and logs (recreated with deployments)
└── Durable LocalStack (echobase-devlocal-durable-localstack)
    ├── Port: 4566:4566
    ├── Services: KMS, Secrets Manager
    └── Purpose: Persistent secrets and encryption keys

CI Environment:
├── Green Ephemeral LocalStack (echobase-green-localstack)
│   ├── Port: 4666:4566
│   ├── Services: SQS, CloudWatch Logs, IAM
│   └── Purpose: Queues and logs for green/canary deployment
└── Durable LocalStack (echobase-ci-durable-localstack)
    ├── Port: 4567:4566
    ├── Services: KMS, Secrets Manager
    └── Purpose: Persistent secrets and encryption keys
```

## Instance Details

### 1. Dev-Local Ephemeral LocalStack
- **Container Name**: `echobase-localstack`
- **Host Port**: `4576`
- **Internal Port**: `4566`
- **Network**: `echobase-network`
- **Services**: SQS, CloudWatch Logs, IAM
- **Persistence**: Volume-backed but ephemeral (removed on teardown)
- **Used By**:
  - api-gateway (via `SQS_ENDPOINT=http://localstack:4566`)
  - order-processor (via `SQS_ENDPOINT=http://localstack:4566`)
- **Lifecycle**: Created/destroyed with `docker compose up/down`

### 2. Dev-Local Durable LocalStack
- **Container Name**: `echobase-devlocal-durable-localstack`
- **Host Port**: `4566`
- **Internal Port**: `4566`
- **Network**: `echobase-devlocal-durable-network` (connected to `echobase-network`)
- **Services**: KMS, Secrets Manager
- **Persistence**: Persistent volume (survives teardown)
- **Used By**:
  - api-gateway (via `SECRETS_MANAGER_ENDPOINT=http://echobase-devlocal-durable-localstack:4566`)
  - order-processor (via `SECRETS_MANAGER_ENDPOINT=http://echobase-devlocal-durable-localstack:4566`)
- **Lifecycle**: Created with `./durable/setup.sh devlocal`, destroyed with `./durable/teardown.sh devlocal`

### 3. CI Green Ephemeral LocalStack
- **Container Name**: `echobase-green-localstack`
- **Host Port**: `4666`
- **Internal Port**: `4566`
- **Network**: `echobase-green-network`
- **Services**: SQS, CloudWatch Logs, IAM
- **Persistence**: Volume-backed but ephemeral
- **Used By**:
  - green api-gateway (via `SQS_ENDPOINT=http://echobase-green-localstack:4566`)
  - green order-processor (via `SQS_ENDPOINT=http://echobase-green-localstack:4566`)
- **Lifecycle**: Created/destroyed with green deployment in CI
- **CI Access**: `http://localhost:4666` from GitLab runner

### 4. CI Durable LocalStack
- **Container Name**: `echobase-ci-durable-localstack`
- **Host Port**: `4567`
- **Internal Port**: `4566`
- **Network**: `echobase-ci-durable-network` (connected to `echobase-green-network`)
- **Services**: KMS, Secrets Manager
- **Persistence**: Persistent volume
- **Used By**:
  - green api-gateway (via `SECRETS_MANAGER_ENDPOINT=http://echobase-ci-durable-localstack:4566`)
  - green order-processor (via `SECRETS_MANAGER_ENDPOINT=http://echobase-ci-durable-localstack:4566`)
- **Lifecycle**: Created with CI job `durable:setup-ci`, destroyed manually
- **CI Access**: `http://localhost:4567` from GitLab runner

## Port Mapping Summary

| Environment | Instance Type | Container | Host Port | Container Port |
|-------------|--------------|-----------|-----------|----------------|
| Dev-Local | Ephemeral | echobase-localstack | 4576 | 4566 |
| Dev-Local | Durable | echobase-devlocal-durable-localstack | 4566 | 4566 |
| CI Green | Ephemeral | echobase-green-localstack | 4666 | 4566 |
| CI | Durable | echobase-ci-durable-localstack | 4567 | 4566 |

## Service Endpoints

### From Application Containers
Applications always connect using container names on internal port 4566:

**Ephemeral (SQS, Logs):**
- Dev-local: `http://localstack:4566`
- CI green: `http://echobase-green-localstack:4566`

**Durable (KMS, Secrets Manager):**
- Dev-local: `http://echobase-devlocal-durable-localstack:4566`
- CI: `http://echobase-ci-durable-localstack:4566`

### From Host / CI Runner
External access uses localhost with mapped ports:

- Dev-local ephemeral: `http://localhost:4576`
- Dev-local durable: `http://localhost:4566`
- CI green ephemeral: `http://localhost:4666`
- CI durable: `http://localhost:4567`

## Why Separate Instances?

### Ephemeral vs. Durable
- **Ephemeral**: SQS queues and logs are environment-specific and should be recreated with each deployment
- **Durable**: Database credentials and encryption keys must persist across deployments for data continuity

### Dev-Local vs. CI
- **Dev-Local**: Single developer environment, can use default ports
- **CI**: Multiple concurrent environments (green/canary testing), requires distinct ports to avoid conflicts

## Network Architecture

```
Dev-Local:
┌──────────────────────────────────────────────────────────────┐
│ echobase-network                                              │
│  ├── echobase-localstack (ephemeral)                         │
│  ├── echobase-api-gateway ────────┐                          │
│  └── echobase-order-processor ────┼──> echobase-devlocal-durable-network
│                                    │    └── echobase-devlocal-durable-localstack
│                                    └──> echobase-devlocal-durable-network
│                                         └── echobase-devlocal-durable-mariadb
└──────────────────────────────────────────────────────────────┘

CI:
┌──────────────────────────────────────────────────────────────┐
│ echobase-green-network                                        │
│  ├── echobase-green-localstack (ephemeral)                   │
│  ├── echobase-green-api-gateway ────┐                        │
│  └── echobase-green-order-processor ┼──> echobase-ci-durable-network
│                                      │    ├── echobase-ci-durable-localstack
│                                      └──> echobase-ci-durable-network
│                                           └── echobase-ci-durable-mariadb
└──────────────────────────────────────────────────────────────┘
```

## Terraform Usage

Terraform is used to configure the **durable** LocalStack instances only:

- **Dev-local**: `./durable/terraform-apply.sh devlocal`
  - Connects to: `http://localhost:4566`
  - Creates: KMS key, Secrets Manager secret in `echobase-devlocal-durable-localstack`

- **CI**: `./durable/terraform-apply.sh ci`
  - Connects to: `http://localhost:4567`
  - Creates: KMS key, Secrets Manager secret in `echobase-ci-durable-localstack`

Ephemeral LocalStack instances do not use Terraform - their resources are created dynamically by the application.

## Troubleshooting

### Cannot connect to LocalStack from application
- Verify the application is on the correct network
- Check `SQS_ENDPOINT` and `SECRETS_MANAGER_ENDPOINT` environment variables
- Ensure durable infrastructure is running: `docker ps | grep durable`

### Cannot connect to LocalStack from host/scripts
- Use the correct host port (not 4566)
- Dev-local ephemeral: `curl http://localhost:4576/_localstack/health`
- Dev-local durable: `curl http://localhost:4566/_localstack/health`
- CI green ephemeral: `curl http://localhost:4666/_localstack/health`
- CI durable: `curl http://localhost:4567/_localstack/health`

### Terraform apply fails in CI
- Ensure using `http://localhost:4567` (not container name)
- GitLab runner container cannot resolve durable network hostnames
- Check `LOCALSTACK_TIMEOUT` is set appropriately (default: 150s in CI)
