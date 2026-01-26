# ADR-011: MariaDB with Data-at-Rest Encryption

## Status

Accepted

## Date

2026-01-24

## Context

The application needs a relational database that:
- Stores user accounts and orders
- Supports ACID transactions
- Works well in containers
- Provides data-at-rest encryption for security compliance
- Is compatible with MySQL (common tooling, drivers)

## Decision

Use **MariaDB** with **data-at-rest encryption** enabled, storing the encryption key in Secrets Manager.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MARIADB                                   │
│                  (Durable Infrastructure)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Encryption at Rest                                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  ││
│  │  │   ibdata1    │    │  Table Files │    │  Redo Logs   │  ││
│  │  │  (encrypted) │    │  (encrypted) │    │  (encrypted) │  ││
│  │  └──────────────┘    └──────────────┘    └──────────────┘  ││
│  │                              ▲                               ││
│  │                              │                               ││
│  │                    ┌─────────┴─────────┐                    ││
│  │                    │  AES-256-CBC Key  │                    ││
│  │                    │  (from keyfile)   │                    ││
│  │                    └─────────┬─────────┘                    ││
│  │                              │                               ││
│  │                              ▼                               ││
│  │                    ┌─────────────────────┐                  ││
│  │                    │  Secrets Manager    │                  ││
│  │                    │  (Durable LS)       │                  ││
│  │                    └─────────────────────┘                  ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Schema                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  users                      orders                          ││
│  │  ├── id (PK)                ├── id (PK)                     ││
│  │  ├── username (unique)      ├── user_id (FK)                ││
│  │  ├── email (unique)         ├── product_name                ││
│  │  ├── password_hash          ├── quantity                    ││
│  │  ├── full_name              ├── total_price                 ││
│  │  └── created_at             ├── status                      ││
│  │                             └── created_at                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Encryption Configuration

```ini
# my.cnf
[mariadb]
plugin_load_add = file_key_management
file_key_management_filename = /etc/mysql/encryption/keyfile.enc
file_key_management_encryption_algorithm = AES_CBC

# Encrypt all tables by default
innodb_encrypt_tables = ON
innodb_encrypt_log = ON
innodb_encryption_threads = 4
encrypt_tmp_files = ON
```

### Key Management

The encryption key is:
1. Generated during `durable/setup.sh`
2. Stored in Secrets Manager (see ADR-001)
3. Fetched by MariaDB container at startup
4. Written to `/etc/mysql/encryption/keyfile.enc`

Key format:
```
1;<hex-encoded-256-bit-key>
```

### Container Startup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│               MARIADB CONTAINER STARTUP                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. docker-entrypoint-wrapper.sh                                │
│     │                                                           │
│     ├── Fetch encryption key from Secrets Manager               │
│     │   aws secretsmanager get-secret-value \                   │
│     │       --secret-id echobase/database/encryption-key        │
│     │                                                           │
│     ├── Write key to /etc/mysql/encryption/keyfile.enc          │
│     │                                                           │
│     └── Execute original docker-entrypoint.sh                   │
│                                                                  │
│  2. docker-entrypoint.sh (MariaDB official)                     │
│     │                                                           │
│     ├── Initialize database if needed                           │
│     │                                                           │
│     └── Start MariaDB server with encryption enabled            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- **Security compliance**: Data encrypted at rest
- **MySQL compatibility**: Standard MySQL drivers and tools work
- **Containerized**: Easy to deploy and manage
- **Shared across blue/green**: Both environments use same database
- **Key rotation ready**: Can update key in Secrets Manager

### Negative

- **Performance overhead**: ~5-10% CPU for encryption/decryption
- **Startup dependency**: Must wait for Secrets Manager
- **Key management complexity**: Key must be available before DB starts

### Neutral

- **Single instance**: No replication (appropriate for dev/CI)
- **LocalStack in dev**: Production would use real Secrets Manager

## Schema Management

Currently using initialization scripts:
```sql
-- init.sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Future consideration: Flyway or Liquibase for migrations.

## Alternatives Considered

### 1. MySQL

**Considered**: Most popular, well-supported.
**Not chosen**: MariaDB is drop-in compatible with better licensing and community.

### 2. PostgreSQL

**Considered**: Advanced features, better JSON support.
**Not chosen**: MariaDB sufficient, team more familiar with MySQL syntax.

### 3. No encryption

**Rejected**: Security best practice, even in development. Maintains production parity.

### 4. Application-level encryption

**Considered**: Encrypt specific columns in application code.
**Not chosen**: More complex, database-level is more comprehensive.

### 5. SQLite

**Considered**: Simple, no server needed.
**Not chosen**: Doesn't support concurrent access well, no encryption by default.

## References

- `mariadb/` - MariaDB Docker configuration
- `mariadb/Dockerfile` - Custom image with AWS CLI
- `mariadb/docker-entrypoint-wrapper.sh` - Key fetching wrapper
- `mariadb/config/my.cnf` - MariaDB configuration
- ADR-001: Encryption Key in Secrets Manager
- ADR-005: Transactional Credential Setup
