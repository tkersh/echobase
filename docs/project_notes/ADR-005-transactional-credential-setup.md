# ADR-005: Transactional Credential Setup

## Status

Accepted

## Date

2026-01-24

## Context

Database setup requires:
1. Generate credentials (username, password, encryption key)
2. Store credentials in Secrets Manager
3. Create database with those credentials

The **order of operations matters**. If step 3 happens before step 2:
- Database created with credentials
- Terraform fails storing to Secrets Manager
- Now database has credentials that Secrets Manager doesn't know about
- Applications can't retrieve credentials → connection failures
- Manual intervention required to fix mismatch

This happened in production and caused significant debugging time.

## Decision

Implement **transactional credential setup**: Store credentials in Secrets Manager BEFORE creating the database.

### Setup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     durable/setup.sh                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. START LOCALSTACK                                             │
│     └─► Secrets Manager available                                │
│                                                                  │
│  2. CHECK SECRETS MANAGER                                        │
│     ├─► Credentials exist? Use them (skip to step 5)            │
│     └─► No credentials? Continue to step 3                       │
│                                                                  │
│  3. GENERATE CREDENTIALS                                         │
│     ├─► MYSQL_USER, MYSQL_PASSWORD                               │
│     ├─► MYSQL_ROOT_PASSWORD                                      │
│     └─► DB_ENCRYPTION_KEY                                        │
│                                                                  │
│  4. STORE IN SECRETS MANAGER (via Terraform)     ◄── FIRST!     │
│     ├─► terraform apply                                          │
│     ├─► If FAILS → EXIT (no database created)                   │
│     └─► If SUCCESS → credentials are persisted                  │
│                                                                  │
│  5. CREATE DATABASE                              ◄── SECOND!     │
│     ├─► Start MariaDB container                                  │
│     ├─► Container fetches credentials from Secrets Manager       │
│     └─► Database initialized with those credentials              │
│                                                                  │
│  6. VERIFY                                                       │
│     └─► Confirm database accepts Secrets Manager credentials     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Error Handling

| Failure Point | Result | Recovery |
|---------------|--------|----------|
| Terraform fails | Script exits, no DB created | Fix Terraform, re-run setup |
| DB creation fails | Credentials in SM, no DB | Re-run setup (uses existing creds) |
| DB accepts wrong creds | Should never happen | Teardown --volumes, re-run |

### Key Principle

**Secrets Manager is the source of truth for credentials.**

- Never generate credentials that aren't stored in Secrets Manager
- Never create database before Secrets Manager has credentials
- Always fetch credentials from Secrets Manager, never from local files

## Consequences

### Positive

- **No orphaned credentials**: Database only created if Secrets Manager succeeds
- **Idempotent setup**: Re-running setup uses existing credentials
- **Single source of truth**: Secrets Manager always has correct credentials
- **Debuggable**: If DB fails, credentials are already in SM for inspection

### Negative

- **Startup dependency**: Must wait for LocalStack before database
- **Terraform dependency**: Credential storage requires Terraform apply

### Neutral

- **Retry behavior**: Failed setup can be re-run without cleanup

## Implementation Details

From `durable/setup.sh`:

```bash
# Step 1: Ensure LocalStack running
wait_for_localstack

# Step 2: Check for existing credentials
EXISTING_CREDS=$(fetch_credentials_from_sm)
if [ -n "$EXISTING_CREDS" ]; then
    # Use existing credentials
    parse_credentials "$EXISTING_CREDS"
else
    # Step 3: Generate new credentials
    MYSQL_USER="app_user"
    MYSQL_PASSWORD=$(generate_password)
    # ...

    # Step 4: Store in Secrets Manager FIRST
    if ! ./durable/terraform-apply.sh; then
        echo "ERROR: Failed to store credentials"
        exit 1  # Don't create database!
    fi
fi

# Step 5: Create database (only reached if SM succeeded)
docker compose -f durable/docker-compose.yml up -d mariadb
```

## Alternatives Considered

### 1. Store credentials after database creation

**Rejected**: This was the original approach. Led to orphaned credentials when Terraform failed.

### 2. Store credentials in environment file

**Rejected**: File could be lost, not versioned, different between environments.

### 3. Generate credentials at database start

**Rejected**: Database would have credentials that nothing else knows about.

## References

- `durable/setup.sh` - Implementation of transactional setup
- `durable/terraform-apply.sh` - Terraform wrapper for credential storage
- ADR-001: Encryption Key in Secrets Manager
- `docs/project_notes/bugs.md` - Historical bugs from non-transactional setup
