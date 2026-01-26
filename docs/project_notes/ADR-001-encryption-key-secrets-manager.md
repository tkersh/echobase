# ADR-001: Store MariaDB Encryption Key in Secrets Manager

## Status

Accepted

## Date

2026-01-23

## Context

MariaDB data-at-rest encryption requires an encryption key file (`keyfile.enc`) containing a 256-bit AES key. Previously, this key was:

1. Generated locally by `mariadb/config/generate-keys.sh`
2. Called during `./generate-credentials.sh` execution
3. `COPY`'d into the Docker image at build time (`mariadb/Dockerfile`)
4. Protected from git commits via `.gitignore` entries

This approach had several problems:

- **Key baked into image**: The same encryption key was embedded in every image built from that source
- **Inconsistent with credential management**: Database credentials (username/password) were already stored in Secrets Manager, but encryption keys were handled differently
- **Build-time dependency**: The key file had to exist locally before building the image
- **No key rotation support**: Changing keys required rebuilding images

## Decision

Store the MariaDB encryption key in AWS Secrets Manager (LocalStack in development), consistent with how database credentials are managed.

### Implementation

1. **Terraform** creates a new secret `echobase/database/encryption-key` in durable LocalStack
2. **durable/setup.sh** generates a 256-bit encryption key and stores it in Secrets Manager before creating the database
3. **MariaDB Dockerfile** installs AWS CLI and uses a custom entrypoint wrapper
4. **docker-entrypoint-wrapper.sh** fetches the encryption key from Secrets Manager at container startup and writes it to `/etc/mysql/encryption/keyfile.enc`
5. The original MariaDB entrypoint is then executed

### Secret Structure

```json
{
  "key_id": 1,
  "key_hex": "<64-character-hex-string>"
}
```

### Flow

```
┌─────────────────────┐
│ durable/setup.sh    │
│                     │
│ 1. Generate key     │
│ 2. Store in SM      │
│ 3. Start MariaDB    │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Secrets Manager     │
│ (Durable LocalStack)│
│                     │
│ echobase/database/  │
│ encryption-key      │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ MariaDB Container   │
│                     │
│ entrypoint-wrapper: │
│ 1. Fetch key from SM│
│ 2. Write keyfile    │
│ 3. Start MariaDB    │
└─────────────────────┘
```

## Consequences

### Positive

- **Consistent secret management**: All secrets (credentials and encryption keys) are managed the same way
- **No secrets in images**: Docker images are portable and don't contain environment-specific secrets
- **Key rotation possible**: Update secret in Secrets Manager, restart container
- **Transactional setup**: Key is stored in Secrets Manager before database is created (same as credentials)
- **Audit trail**: Secrets Manager provides versioning and can be configured for access logging

### Negative

- **Startup latency**: MariaDB must fetch the key from Secrets Manager before starting (~1-2s)
- **Dependency on LocalStack**: MariaDB container depends on LocalStack being healthy
- **AWS CLI in image**: MariaDB image size increases due to AWS CLI installation (~50MB)

### Neutral

- **Migration path**: Existing installations will have credentials but no encryption key; setup.sh handles this by detecting and generating missing keys

## Files Changed

- `durable/terraform/variables.tf` - Added `db_encryption_key` variable
- `durable/terraform/secrets.tf` - Added encryption key secret resource
- `durable/setup.sh` - Generate and store encryption key
- `durable/terraform-apply.sh` - Pass encryption key to Terraform
- `durable/docker-compose.yml` - Pass Secrets Manager endpoint to MariaDB
- `mariadb/Dockerfile` - Install AWS CLI, use entrypoint wrapper
- `mariadb/docker-entrypoint-wrapper.sh` - New file to fetch key at startup
- `mariadb/config/README.md` - Updated documentation
- `generate-credentials.sh` - Removed local key generation
- `.gitignore` - Removed `*.enc` entries (no longer needed)

## Files Removed

- `mariadb/config/keyfile.enc` - No longer stored locally
- `mariadb/config/generate-keys.sh` - No longer needed

## Alternatives Considered

### 1. Remove encryption entirely

**Rejected**: Data-at-rest encryption is a security best practice, even in development environments. Removing it would reduce production parity.

### 2. Generate key at image build time via BuildKit secrets

**Rejected**: Would still embed the key in the image layer. Docker BuildKit secrets only prevent the secret from appearing in intermediate layers, not the final layer if written to a file.

### 3. Use Docker secrets (Swarm mode)

**Rejected**: Would require Docker Swarm, adding complexity. Secrets Manager approach works in both Docker Compose and Kubernetes.

### 4. Mount key via Docker volume

**Rejected**: Requires the key to exist on the host, which creates the same local-file-dependency problem we're trying to solve.

## References

- [MariaDB Data-at-Rest Encryption](https://mariadb.com/kb/en/data-at-rest-encryption/)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [LocalStack Secrets Manager](https://docs.localstack.cloud/user-guide/aws/secretsmanager/)
