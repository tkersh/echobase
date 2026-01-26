# MariaDB Encryption Configuration

This directory contains the encryption configuration for MariaDB data-at-rest encryption.

## Architecture

Encryption keys are stored in **AWS Secrets Manager** (via LocalStack in development) and fetched at container startup. This ensures:

- Keys are never baked into Docker images
- Keys are managed alongside other secrets in the durable infrastructure
- Keys persist across blue-green deployments
- Consistent approach with database credentials

## Files

- **encryption-minimal.cnf** - MariaDB configuration file that enables encryption
- **encryption.cnf** - Full encryption configuration (reference)

## How It Works

1. **Setup** (`durable/setup.sh`) generates a 256-bit encryption key
2. **Terraform** stores the key in Secrets Manager (`echobase/database/encryption-key`)
3. **Container startup** (`docker-entrypoint-wrapper.sh`) fetches the key from Secrets Manager
4. **MariaDB** reads the key from `/etc/mysql/encryption/keyfile.enc`

## Key Management

### Key Location

The encryption key is stored in:
- **Secret Name**: `echobase/database/encryption-key`
- **Location**: Durable LocalStack container (`echobase-{devlocal|ci}-durable-localstack`)
- **Encryption**: KMS-encrypted via `alias/echobase-db`

### Viewing Key Info (Development Only)

```bash
# Get encryption key metadata (don't expose the actual key!)
docker exec echobase-devlocal-durable-localstack \
  awslocal secretsmanager describe-secret \
  --secret-id echobase/database/encryption-key
```

### Key Rotation

To rotate the encryption key:

1. Generate a new secret version in Secrets Manager
2. Restart the MariaDB container (it will fetch the new key)
3. MariaDB will automatically re-encrypt tables with the new key

## Encryption Features Enabled

The configuration in `encryption-minimal.cnf` enables:

- **InnoDB table encryption** - All new InnoDB tables are encrypted by default
- **InnoDB log encryption** - Transaction logs are encrypted

For full encryption features, see `encryption.cnf`.

## Verify Encryption

To verify that encryption is working:

```bash
# Connect to the database
docker exec -it echobase-devlocal-durable-mariadb mariadb -u root -p

# Check encryption status
SHOW VARIABLES LIKE 'innodb_encrypt%';

# Check if a specific table is encrypted
SELECT NAME, ENCRYPTION FROM INFORMATION_SCHEMA.INNODB_TABLESPACES
WHERE NAME LIKE 'orders_db%';
```

## Troubleshooting

### MariaDB won't start - "Failed to fetch encryption key"

Check that LocalStack is running and healthy:
```bash
docker logs echobase-devlocal-durable-localstack --tail 20
```

Verify the secret exists:
```bash
docker exec echobase-devlocal-durable-localstack \
  awslocal secretsmanager list-secrets
```

### Tables not encrypted

Check:
```sql
SHOW VARIABLES LIKE 'innodb_encrypt_tables';
```

Should show `ON` or `FORCE`.

## References

- [MariaDB Encryption Documentation](https://mariadb.com/kb/en/data-at-rest-encryption/)
- [File Key Management Plugin](https://mariadb.com/kb/en/file-key-management-encryption-plugin/)
