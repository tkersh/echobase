# ADR-006: LocalStack for Local AWS Services

## Status

Accepted

## Date

2026-01-24

## Context

The application uses AWS services:
- **SQS**: Message queue for order processing
- **Secrets Manager**: Credential storage
- **KMS**: Encryption key management

For local development and CI, we needed a way to:
- Run without AWS credentials or internet access
- Have consistent behavior between dev and production
- Support the two-layer infrastructure model (durable + ephemeral)
- Avoid AWS costs during development

## Decision

Use **LocalStack** to emulate AWS services locally, with **separate instances** for durable and ephemeral resources.

### LocalStack Instance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DURABLE LOCALSTACK                          │
│              (echobase-{devlocal|ci}-durable-localstack)         │
├─────────────────────────────────────────────────────────────────┤
│  Services: Secrets Manager, KMS                                  │
│  Persistence: Volume-backed, survives deployments               │
│  Purpose: Store credentials and encryption keys                  │
│  Lifecycle: Created with durable/setup.sh, rarely torn down     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EPHEMERAL LOCALSTACK                          │
│                (echobase-{blue|green}-localstack)                │
├─────────────────────────────────────────────────────────────────┤
│  Services: SQS, CloudWatch Logs, IAM                            │
│  Persistence: Temporary, recreated with deployments             │
│  Purpose: Message queues for order processing                    │
│  Lifecycle: Created/destroyed with blue-green deployments       │
└─────────────────────────────────────────────────────────────────┘
```

### Port Allocation

| Instance | Environment | Host Port |
|----------|-------------|-----------|
| Durable | devlocal | 4566 |
| Durable | CI | 4567 |
| Ephemeral | devlocal | 4576 |
| Ephemeral | blue | 4667 |
| Ephemeral | green | 4666 |

### Service Configuration

Applications connect to the appropriate LocalStack:

```yaml
# For credentials (durable)
SECRETS_MANAGER_ENDPOINT: http://echobase-ci-durable-localstack:4566

# For queues (ephemeral)
SQS_ENDPOINT: http://echobase-green-localstack:4566
```

### Why Separate Instances?

1. **Different lifecycles**: Credentials persist; queues are ephemeral
2. **Network isolation**: Durable services on durable network
3. **Independent scaling**: Can restart queues without affecting credentials
4. **Clear ownership**: No confusion about which LocalStack owns what

## Consequences

### Positive

- **No AWS costs**: Development and CI are free
- **No credentials needed**: Works offline, no AWS account required
- **Fast startup**: LocalStack starts in seconds
- **Production parity**: Same AWS SDK calls work in both environments
- **Consistent CI**: Same environment on every CI run

### Negative

- **Not 100% AWS compatible**: Some edge cases behave differently
- **Resource usage**: Multiple LocalStack instances use memory
- **Version drift**: LocalStack updates may change behavior

### Neutral

- **Terraform compatibility**: Terraform works with LocalStack via endpoint override
- **AWS CLI works**: Can use `aws` CLI with `--endpoint-url` flag

## Service-Specific Notes

### Secrets Manager

```bash
# Store secret
aws --endpoint-url=http://localhost:4566 secretsmanager create-secret \
    --name echobase/database/credentials \
    --secret-string '{"username":"app_user","password":"..."}'

# Retrieve secret
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value \
    --secret-id echobase/database/credentials
```

### SQS

```bash
# Create queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
    --queue-name order-queue

# Send message
aws --endpoint-url=http://localhost:4566 sqs send-message \
    --queue-url http://localhost:4566/000000000000/order-queue \
    --message-body '{"orderId": 123}'
```

## Alternatives Considered

### 1. Use real AWS services

**Rejected**: Requires AWS credentials, internet access, incurs costs, complicates CI setup.

### 2. Mock AWS SDK in tests

**Rejected**: Doesn't test actual AWS SDK behavior, mocks can diverge from reality.

### 3. Single LocalStack for everything

**Rejected**: Doesn't support the durable/ephemeral separation needed for blue-green.

### 4. ElasticMQ for SQS only

**Rejected**: Would need separate solution for Secrets Manager. LocalStack provides both.

## References

- `docs/LOCALSTACK-ARCHITECTURE.md` - Detailed LocalStack documentation
- `durable/docker-compose.yml` - Durable LocalStack configuration
- `docker-compose.yml` - Ephemeral LocalStack configuration
- `terraform/` - Terraform configs for LocalStack resources
