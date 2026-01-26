# Echobase Architecture

## Overview

Echobase implements a **two-layer architecture** that separates durable infrastructure (databases) from ephemeral application services to enable true blue-green deployments with data persistence.

## Architecture Diagram

![Architecture Diagram](architecture.jpg)

**Diagram Source:** [docs/architecture.mmd](architecture.mmd) (Mermaid format)

## Two-Layer Infrastructure Model

### Layer 1: Durable Infrastructure (Database Layer)

**Purpose:** Persistent database infrastructure that survives across blue-green deployments

**Location:** `durable/` directory

**Components:**
- Dev-Local Database: `echobase-devlocal-durable-mariadb` (port 3306)
- CI Database: `echobase-ci-durable-mariadb` (port 3307)

**Characteristics:**
- **Persistent**: Databases survive application deployments and rollbacks
- **Isolated**: Separate databases for devlocal and CI environments
- **Managed Separately**: Setup/teardown independent of application lifecycle
- **Named Volumes**: Data persists in `echobase-devlocal-durable-mariadb-data` volumes

**Management:**
```bash
# Setup (idempotent - safe to run multiple times)
./durable/setup.sh [devlocal|ci]

# Teardown (preserves data)
./durable/teardown.sh [devlocal|ci]

# Teardown with data deletion
./durable/teardown.sh [devlocal|ci] --volumes
```

**Idempotent Setup:** The setup script can be run multiple times safely. It detects existing databases and skips creation, or restarts stopped containers. This is crucial for CI/CD where the setup runs automatically in every pipeline.

**See:** [durable/README.md](../durable/README.md) for detailed documentation

### Layer 2: Ephemeral Infrastructure (Application Layer)

**Purpose:** Application services that can be deployed, tested, and torn down without affecting data

**Components:**
- Frontend (React + Vite)
- API Gateway (Express with JWT auth)
- Order Processor (Background service)
- LocalStack (AWS service simulation)

**Characteristics:**
- **Ephemeral**: Can be destroyed and recreated without data loss
- **Blue-Green Deployable**: Multiple versions can run simultaneously
- **Stateless**: Application state stored in durable database
- **Port Isolated**: Each environment uses different ports

**Management:**
```bash
# Dev-Local
./start.sh                    # Start application services
docker compose down           # Stop application services

# CI Green
# Managed by GitLab CI pipeline
```

## Network Architecture

### Network Isolation

```
┌─────────────────────────────────────────────────────────────┐
│                    DURABLE LAYER                            │
│                  (Persists Across Deployments)              │
│                                                             │
│  ┌──────────────────────┐     ┌──────────────────────┐    │
│  │  Dev-Local Database  │     │    CI Database       │    │
│  │  echobase-devlocal-  │     │  echobase-ci-durable-│    │
│  │  durable-mariadb     │     │  mariadb             │    │
│  │                      │     │                      │    │
│  │  Network:            │     │  Network:            │    │
│  │  echobase-devlocal-  │     │  echobase-ci-durable-│    │
│  │  durable-network     │     │  network             │    │
│  └──────────────────────┘     └──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                ▲                             ▲
                │                             │
        ┌───────┴─────────┐         ┌────────┴──────────┐
        │  Dev-Local App  │         │   CI Green App    │
        │  echobase-      │         │   echobase-green- │
        │  network        │         │   network         │
        └─────────────────┘         └───────────────────┘
```

### Docker Networks

| Network | Purpose | Connected Services |
|---------|---------|-------------------|
| `echobase-devlocal-durable-network` | Dev-local database | Dev-local app services |
| `echobase-ci-durable-network` | CI database | CI green app services |
| `echobase-network` | Dev-local app | API, Frontend, Processor, LocalStack |
| `echobase-green-network` | CI green app | API, Frontend, Processor, LocalStack |

Application services connect to **both** their app network and the appropriate durable network to access the database.

## Port Allocation

| Service | Dev-Local | CI Green | Infrastructure Layer |
|---------|-----------|----------|---------------------|
| **MariaDB** | **3306** | **3307** | **Durable** |
| Frontend HTTPS | 3443 | 3543 | Ephemeral |
| Frontend HTTP | 3000 | 3100 | Ephemeral |
| API Gateway HTTPS | 3001 | 3101 | Ephemeral |
| LocalStack | 4566 | 4666 | Ephemeral |

## Docker Compose Structure

### Durable Infrastructure

**File:** `durable/docker-compose.yml`

```yaml
# Parameterized database infrastructure
# Uses environment-specific .env files:
# - durable/.env.devlocal
# - durable/.env.ci

services:
  mariadb:
    # Database service with configurable:
    # - Container name
    # - Network name
    # - Volume name
    # - Port
```

### Ephemeral Application Infrastructure

**File:** `docker-compose.yml` (Base configuration)
- NO port mappings (defined in override files)
- NO database service (database is in durable layer)
- Application services only
- External network references to durable databases

**File:** `docker-compose.override.yml` (Dev-Local)
- Auto-loaded by `docker compose up`
- Port mappings for devlocal
- Connects to `echobase-devlocal-durable-network`

**File:** `docker-compose.green.yml` (CI Green)
- Explicitly loaded with `-f` flag
- Port mappings for CI green
- Connects to `echobase-ci-durable-network`

## Data Flow

### User Registration/Authentication

```
User → Frontend (React)
     → API Gateway (/api/auth/register or /api/auth/login)
     → Secrets Manager (retrieve DB credentials)
     → Durable Database (create/verify user)
     → API Gateway (return JWT token)
     → Frontend (store token, redirect to orders)
```

### Order Processing

```
User → Frontend (with JWT)
     → API Gateway (/api/orders with Authorization header)
     → SQS (send order message)
     → Order Processor (poll SQS)
     → Secrets Manager (retrieve DB credentials)
     → Durable Database (insert order)
```

## Blue-Green Deployment Workflow

### Phase 1: Setup Durable Infrastructure (One-Time)

**Recommended - Single Command:**
```bash
./setup.sh
```

This command:
- Generates credentials (prompts if needed)
- Sets up devlocal durable database (idempotent)
- Installs dependencies and provisions infrastructure
- Builds and starts application services

**Or Manual:**
```bash
./generate-credentials.sh
./durable/setup.sh devlocal    # Dev-local database
./durable/setup.sh ci           # CI database (for CI environment)
```

Databases are now ready and will persist across all deployments.

**Note:** The setup is idempotent - running `./setup.sh` multiple times is safe and won't recreate existing databases.

### Phase 2: Deploy Application (Repeatable)

#### Dev-Local Deployment

```bash
./setup.sh     # Install deps, setup app infrastructure
./start.sh     # Start application services
```

Application connects to existing `echobase-devlocal-durable-mariadb`.

#### CI Green Deployment (Automated)

```
1. GitLab CI: durable:setup-ci
   - Verifies echobase-ci-durable-mariadb exists
   - Creates if missing

2. GitLab CI: deploy:green
   - Starts green application services
   - Connects to echobase-ci-durable-mariadb

3. GitLab CI: test:*
   - Runs tests against green environment

4. Manual: promote:green
   - Switches traffic to green

5. Manual: cleanup:green
   - Removes green application containers
   - Database persists for next deployment
```

### Phase 3: Rollback (If Needed)

```bash
# Application rollback
./scripts/switch-traffic.sh blue

# Database rollback NOT needed
# Database was never modified during green deployment
```

## Benefits of This Architecture

✅ **Data Persistence**
- Database survives application deployments and rollbacks
- No data migration needed between blue/green

✅ **True Blue-Green**
- Application can be switched without database downtime
- Database changes are decoupled from application deployments

✅ **Easy Rollback**
- Roll back application without affecting database
- Instant rollback by switching traffic

✅ **Environment Isolation**
- Dev-local and CI have completely separate databases
- No risk of CI tests affecting local development data

✅ **Zero Downtime**
- Deploy new application versions without database downtime
- Database remains available during application deployments

✅ **Simplified Operations**
- Database management is separate from application deployment
- Clear separation of concerns

## Security Architecture

### Encryption

- **At Rest**: MariaDB AES-256 encryption for all data
- **In Transit**: HTTPS for all frontend/API communication
- **Key Management**: AWS KMS for encryption key management
- **Secrets**: AWS Secrets Manager for credential storage

### Authentication & Authorization

- **JWT**: JSON Web Tokens for user authentication
- **API Protection**: All /api/orders endpoints require valid JWT
- **Password Hashing**: Bcrypt for password storage
- **Session Management**: Secure session handling

### Network Security

- **Network Isolation**: Application and database on separate networks
- **CORS**: Configured for specific origins only
- **Rate Limiting**: Protection against DoS attacks
- **Input Validation**: Parameterized queries prevent SQL injection

**See:** [SECURITY.md](SECURITY.md) for comprehensive security documentation

## Infrastructure as Code

### Terraform

**Provisions:**
- SQS queues (order-processing-queue, DLQ)
- KMS encryption keys
- Secrets Manager secrets

**Location:** `terraform/` directory

### Docker Compose

**Durable Layer:** `durable/docker-compose.yml`
- Database infrastructure
- Parameterized for multiple environments

**Ephemeral Layer:** `docker-compose.yml` + override files
- Application services
- Blue-green deployment support

## Monitoring & Operations

### Health Checks

```bash
# Application health
curl -k https://localhost:3001/health    # Dev-Local API
curl -k https://localhost:3101/health    # CI Green API

# Database health
docker ps --filter "name=durable"
docker logs echobase-devlocal-durable-mariadb
```

### Logs

```bash
# Application logs
docker compose logs -f api-gateway
docker compose logs -f order-processor

# Database logs
docker logs echobase-devlocal-durable-mariadb
```

### Database Access

```bash
# Connect to devlocal database
docker exec -it echobase-devlocal-durable-mariadb mariadb -u root -p

# Connect to CI database
docker exec -it echobase-ci-durable-mariadb mariadb -u root -p
```

## Production Considerations

For production deployment, consider:

1. **Database Service**
   - Replace containerized MariaDB with AWS RDS
   - Enable automated backups
   - Configure read replicas for scalability

2. **Database Replication**
   - Primary-replica setup for high availability
   - Multi-AZ deployment for disaster recovery

3. **Schema Migrations**
   - Implement database migration strategy
   - Use tools like Flyway or Liquibase
   - Test migrations in staging before production

4. **Monitoring**
   - CloudWatch for application metrics
   - RDS Performance Insights for database monitoring
   - Automated alerting for failures

5. **Secrets Management**
   - Replace Localstack with real AWS Secrets Manager
   - Enable automatic secret rotation
   - Use IAM roles instead of access keys

**See:** [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) for production deployment guide

## Documentation

- **[README.md](../README.md)** - Project overview and quick start
- **[durable/README.md](../durable/README.md)** - Durable infrastructure guide
- **[docs/BLUE-GREEN-DEPLOYMENT.md](BLUE-GREEN-DEPLOYMENT.md)** - Deployment workflow
- **[SECURITY.md](SECURITY.md)** - Security architecture and best practices
- **[docs/TERRAFORM_USAGE.md](TERRAFORM_USAGE.md)** - Infrastructure provisioning

## Diagram Legend

**In architecture diagrams:**
- **Solid lines** (→): Direct service calls or data flow
- **Dashed lines** (-.→): Infrastructure management or belongs-to relationships
- **Blue boxes**: Ephemeral application services
- **Dark blue cylinders**: Durable database infrastructure
- **Orange boxes**: AWS services (SQS)
- **Purple boxes**: Infrastructure management (Terraform, Docker)
