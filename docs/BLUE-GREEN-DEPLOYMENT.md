# Blue-Green Deployment with Durable Infrastructure

## Overview

This project implements a **true blue-green deployment strategy** with **separated durable and ephemeral infrastructure layers**. This architecture enables zero-downtime deployments while maintaining data persistence across application deployments.

### Key Features

- **Durable Database Layer**: Database infrastructure persists across blue-green deployments
- **Ephemeral Application Layer**: Application services (API, frontend, processor) are deployed as blue/green
- **Port Isolation**: Separate ports for each environment prevent conflicts
- **Modular Configuration**: Docker Compose file structure supports easy environment switching
- **CI/CD Integration**: Automated green deployment with manual promotion controls
- **Data Persistence**: Database survives application deployments and rollbacks

## Architecture

### Two-Layer Infrastructure Model

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DURABLE LAYER                                 │
│                    (Persists Across Deployments)                      │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │
│  │ Dev-Local Database  │  │   CI Database      │  │    nginx     │  │
│  │ echobase-devlocal-  │  │ echobase-ci-       │  │ Load Balancer│  │
│  │ durable-mariadb     │  │ durable-mariadb    │  │ + Auth Proxy │  │
│  │ Port: 3306          │  │ Port: 3307         │  │ :443 / :1443 │  │
│  └────────────────────┘  └────────────────────┘  └──────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Observability Stack                          │  │
│  │  OTEL Collector ──→ Prometheus (/prometheus/)                │  │
│  │       │          ──→ Jaeger (/jaeger/)                       │  │
│  │       │          ──→ Loki (/loki/)                            │  │
│  │       │                                                      │  │
│  │       │              Grafana (/grafana/) — queries all three  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                        ▲                     ▲
                        │                     │
        ┌───────────────┴─────────┐  ┌────────┴──────────┐
        │   EPHEMERAL LAYER       │  │  EPHEMERAL LAYER  │
        │   Dev-Local             │  │  CI Green         │
        │   (Blue Environment)    │  │  (Canary)         │
        │                         │  │                   │
        │   - API Gateway         │  │  - API Gateway    │
        │   - Order Processor     │  │  - Order Processor│
        │   - Frontend            │  │  - Frontend       │
        │   - LocalStack          │  │  - LocalStack     │
        │                         │  │                   │
        │   Network:              │  │  Network:         │
        │   echobase-network      │  │  echobase-green-  │
        │                         │  │  network          │
        │                         │  │                   │
        │   Ports: 3001, 3443,    │  │  Ports: 3101,     │
        │          4566           │  │         3543, 4666│
        └─────────────────────────┘  └───────────────────┘
```

### Docker Compose File Structure

The project uses a modular compose file structure with separated infrastructure layers:

#### Durable Infrastructure
**durable/docker-compose.yml** - Persistent Database Layer
- Managed separately from application deployments
- Parameterized for devlocal and CI environments
- Persists across blue-green application deployments
- Setup: `./durable/setup.sh [devlocal|ci]`
- Teardown: `./durable/teardown.sh [devlocal|ci]`

#### Ephemeral Application Infrastructure
**docker-compose.yml** - Base Application Configuration
- Contains all application service definitions
- **NO database service** (database is in durable layer)
- **NO port mappings** (ports defined in override files)
- Defines networks, volumes, environment variables for applications
- Connects to external durable database network

**docker-compose.override.yml** - Dev-Local Environment
- Automatically loaded by `docker compose up`
- Defines devlocal environment ports
- Connects to `echobase-devlocal-durable-network`
- Used for local development

**docker-compose.green.yml** - Green Environment
- Explicitly loaded with `-f` flag
- Defines green environment ports
- Connects to `echobase-ci-durable-network`
- Used for canary testing in CI/CD

### Port Allocation

The system supports **two simultaneous environments** (devlocal and CI green):

| Service | Protocol | Dev-Local | CI Green | Infrastructure Layer |
|---------|----------|-----------|----------|---------------------|
| **Frontend - HTTPS** | **HTTPS** | **3443** | **3543** | Ephemeral |
| Frontend - HTTP | HTTP (→HTTPS) | 3000 | 3100 | Ephemeral |
| **API Gateway - HTTPS** | **HTTPS** | **3001** | **3101** | Ephemeral |
| **MariaDB** | TCP | **3306** | **3307** | **Durable** |
| **LocalStack** | HTTP | 4566 | 4666 | Ephemeral |
| **LocalStack Alt** | HTTP | 4571 | 4671 | Ephemeral |

**Security:** Frontend and API Gateway enforce HTTPS with TLS encryption. HTTP ports redirect to HTTPS.

**Environment Details:**

- **Dev-Local** (via `start.sh`)
  - Application Project: `echobase` (default)
  - Database Project: `echobase-durable`
  - Application Network: `echobase-network`
  - Database Network: `echobase-devlocal-durable-network`
  - Config: `docker-compose.yml` + `docker-compose.override.yml` (auto-loaded)
  - Purpose: Daily development work on local machine

- **CI Green** (GitLab CI Canary)
  - Application Project: `echobase-green`
  - Database Project: `echobase-ci-durable`
  - Application Network: `echobase-green-network`
  - Database Network: `echobase-ci-durable-network`
  - Config: `docker-compose.yml` + `docker-compose.green.yml` (explicit)
  - Purpose: Canary testing before promotion

## CI/CD Workflow

### Automated Pipeline (all branches)

```
┌─────────────┐
│   Validate  │  - Check code quality
└──────┬──────┘  - Generate .env with high rate limits
       │
┌──────▼──────┐
│    Build    │  - Build Docker images
└──────┬──────┘  - Install dependencies
       │
┌──────▼──────┐
│   Durable   │  - Setup CI database infrastructure
└──────┬──────┘  - echobase-ci-durable-mariadb (port 3307)
       │         - Persists across deployments
       │
┌──────▼──────┐
│deploy:green │  - Deploy green application environment
└──────┬──────┘  - Connects to durable CI database
       │         - LocalStack, API, Frontend, Order Processor
       │
┌──────▼──────┐
│    Test     │  - Run security tests against green
└──────┬──────┘  - Run E2E tests against green
       │
       ├─────────────────────────────┐
       │                             │
┌──────▼──────────┐           ┌─────▼──────┐
│ promote:green   │           │cleanup:green│
│    (manual)     │           │  (manual)  │
└──────┬──────────┘           └────────────┘
       │
┌──────▼──────┐
│rollback     │
│ (manual)    │
└─────────────┘
```

### Deployment Steps

1. **Code Pushed to Any Branch**
   - Triggers validation, build stages

2. **Durable Infrastructure Setup (automatic, idempotent)**
   - `durable:setup-ci` job runs automatically in every pipeline
   - **Idempotent behavior:**
     - First pipeline run: Creates CI database (`echobase-ci-durable-mariadb` on port 3307)
     - Subsequent runs: Detects existing database, verifies it's running, and exits early
     - If stopped: Automatically restarts it
   - Network: `echobase-ci-durable-network`
   - **Database persists** across all pipeline runs for data continuity
   - To rebuild: Run manual `cleanup:durable-ci` job first

3. **Deploy Green Application (automatic after durable setup)**
   - Deploys application services to green environment
   - Connects to existing durable CI database
   - Provisions ephemeral infrastructure:
     - LocalStack on port 4666
     - API Gateway on port 3101 (HTTPS)
     - Frontend on port 3543 (HTTPS)
     - Order Processor
   - **Database is NOT recreated** - application connects to existing durable database
   - Verifies health checks
   - Runs tests (security, E2E) against green environment

4. **Promote Green (manual)**
   - Click "Play" button in GitLab CI for `promote:green` job
   - Switches production traffic from blue to green
   - Production now serves from green environment
   - Database remains unchanged (already shared or isolated)

5. **Rollback (manual)**
   - If issues found with green application
   - Instantly switches traffic back to blue application
   - Database remains unchanged (no rollback needed)
   - Investigate green environment while blue serves traffic

6. **Cleanup (manual)**
   - `cleanup:green` - Removes green application containers
   - `cleanup:durable-ci` - Removes CI database (WARNING: deletes data!)
   - Database cleanup is separate from application cleanup

### Why This Architecture Works

**Separated Infrastructure Layers:**
- **Durable Layer**: Database persists independently of application deployments
- **Ephemeral Layer**: Application services are deployed, tested, and torn down
- No port conflicts - each layer and environment has isolated ports
- **Data persistence** - Database survives application deployment failures
- **True blue-green** - Application can be switched without database migration

**Database Management:**
- Dev-Local uses `echobase-devlocal-durable-mariadb` (port 3306)
- CI uses `echobase-ci-durable-mariadb` (port 3307)
- Both databases are **separate projects** and can run simultaneously
- Application environments connect via Docker networks
- Database data persists in named volumes

## Manual Operations

### Local Development Workflow

#### Setup (One-Time)

```bash
# Single command setup (recommended)
./start.sh
```

This **one command** will:
1. Generate credentials (prompts if missing)
2. Install dependencies
3. Setup durable database (idempotent)
4. Setup application infrastructure
5. Build and start all services

**Or step-by-step:**

```bash
# Single command handles credentials, setup, and start
./start.sh
```

#### Daily Development

```bash
# Database is already running from durable setup
# Just start application services
./start.sh

# When done, stop application (database keeps running)
docker compose down

# Database persists! Next day:
./start.sh  # Database already there
```

#### Teardown

```bash
# Stop application services
docker compose down

# Stop durable database (preserves data)
./durable/teardown.sh devlocal

# Or delete database data too (WARNING: deletes all data!)
./durable/teardown.sh devlocal --volumes
```

### CI Environment Operations

#### Manual CI Database Setup

```bash
# Generate credentials
./scripts/generate-credentials.sh

# Setup CI durable database
./durable/setup.sh ci

# Database is now ready for CI green deployments
```

#### Manual Green Deployment

```bash
# Ensure CI database is running
docker ps --filter "name=echobase-ci-durable-mariadb"

# Deploy green application environment
docker compose -f docker-compose.yml -f docker-compose.green.yml -p echobase-green up -d

# Application connects to echobase-ci-durable-mariadb
```

#### Testing Environments

```bash
# Test Dev-Local (HTTPS)
curl -k https://localhost:3001/health      # API Gateway
curl -k https://localhost:3443             # Frontend

# Test CI Green (HTTPS)
curl -k https://localhost:3101/health      # API Gateway
curl -k https://localhost:3543             # Frontend

# Check database connections
docker logs echobase-devlocal-api-gateway | grep -i database
docker logs echobase-green-api-gateway | grep -i database

# Note: -k flag allows self-signed certificates
# All traffic uses HTTPS for encryption in transit
```

### Database Operations

```bash
# Connect to devlocal database
docker exec -it echobase-devlocal-durable-mariadb mariadb -u root -p

# Connect to CI database
docker exec -it echobase-ci-durable-mariadb mariadb -u root -p

# View database status
docker ps --filter "name=durable"

# Check database networks
docker network inspect echobase-devlocal-durable-network
docker network inspect echobase-ci-durable-network
```

### Cleanup

```bash
# Remove green application environment
docker compose -f docker-compose.yml -f docker-compose.green.yml -p echobase-green down

# Remove devlocal application environment
docker compose down

# Remove durable databases (CAREFUL - deletes data!)
./durable/teardown.sh devlocal --volumes
./durable/teardown.sh ci --volumes
```

## GitLab CI Jobs Reference

### Automatic Jobs

| Job | Stage | Description |
|-----|-------|-------------|
| `validate:*` | validate | Validates code, generates .env |
| `build:*` | build | Builds Docker images |
| `durable:setup-ci` | durable | **Sets up/verifies CI database (idempotent)** |
| `deploy:green` | deploy-green | Deploys green application (connects to durable DB) |
| `test:*` | test | Runs all tests against green |

### Manual Jobs

| Job | Description | When to Use |
|-----|-------------|-------------|
| `promote:green` | Switch production to green | After verifying green is healthy |
| `rollback:to-blue` | Switch production back to blue | If green has issues |
| `cleanup:green` | Remove green application | After investigation or rollback |
| `cleanup:durable-ci` | **Remove CI database (DELETES DATA!)** | When resetting test environment |

## Best Practices

### Deployment Workflow

1. **Database is Persistent**
   - Database survives application deployments
   - No need to migrate data between blue/green
   - Application rollback doesn't affect database
   - Database schema changes need migration strategy

2. **Monitor Both Layers**
   - Check durable database health: `docker ps --filter "name=durable"`
   - Check application health: `curl -k https://localhost:3101/health`
   - Review logs: `docker logs echobase-green-api-gateway`

3. **Use Rollback Liberally**
   - If ANY issues with green application, rollback immediately
   - Database remains unchanged during rollback
   - Investigate offline, redeploy when fixed

### Database Considerations

**Important Architectural Points:**

- **Dev-Local** and **CI** use **separate databases** (different containers, ports, networks)
- Data does NOT sync between devlocal and CI databases
- Each environment is isolated for testing purposes
- Database persists across application deployments within the same environment

**For Production:**
- Consider shared RDS or managed database service
- Implement database replication for HA
- Use read replicas for performance
- Enable automatic backups
- Plan schema migration strategy

## Troubleshooting

### Durable Database Issues

```bash
# Check CI database status
docker ps --filter "name=echobase-ci-durable-mariadb"
docker logs echobase-devlocal-durable-mariadb
docker logs echobase-ci-durable-mariadb

# Restart database
./durable/teardown.sh devlocal
./durable/setup.sh devlocal

# Reset database (deletes data!)
./durable/teardown.sh devlocal --volumes
./durable/setup.sh devlocal
```

### Application Can't Connect to Database

```bash
# Verify database is running
docker ps --filter "name=durable"

# Check network connectivity
docker network inspect echobase-devlocal-durable-network
docker network inspect echobase-ci-durable-network

# Verify application is on correct network
docker inspect echobase-devlocal-api-gateway | grep -A 10 Networks
docker inspect echobase-green-api-gateway | grep -A 10 Networks

# Check environment variables
docker exec echobase-devlocal-api-gateway env | grep DB_
docker exec echobase-green-api-gateway env | grep DB_
```

### Green Deployment Fails

```bash
# Check if CI database exists
docker ps --filter "name=echobase-ci-durable-mariadb"

# If missing, create it
./durable/setup.sh ci

# Check green service status
docker compose -p echobase-green ps

# View green logs
docker compose -p echobase-green logs

# Cleanup and retry
docker compose -f docker-compose.yml -f docker-compose.green.yml -p echobase-green down
# Re-run deploy:green job in GitLab
```

### Port Conflicts

```bash
# Check what's using ports
lsof -i :3306  # Dev-Local DB
lsof -i :3307  # CI DB
lsof -i :3101  # Green API
lsof -i :3543  # Green Frontend

# Kill conflicting process
kill -9 <PID>
```

## Benefits of Durable Infrastructure Architecture

✅ **Data Persistence**: Database survives application deployments and rollbacks
✅ **True Blue-Green**: Application can be switched without database migration
✅ **Easy Rollback**: Roll back application without affecting database
✅ **Isolation**: Dev-local and CI have completely separate databases
✅ **Zero Downtime**: Deploy new application versions without database downtime
✅ **Simplified Operations**: Database management is separate from application deployment

## Documentation

- [Main README](../README.md) - Project overview
- [Durable Infrastructure Guide](../durable/README.md) - **Detailed database infrastructure documentation**
- [Terraform Usage](TERRAFORM_USAGE.md) - Infrastructure provisioning
- [Security Documentation](SECURITY.md) - Security best practices

## Next Steps

To implement advanced deployment patterns:

1. **Canary with Gradual Traffic Shifting**
   - Nginx Plus or HAProxy - Weighted load balancing
   - AWS ALB - Target group weight adjustment

2. **Service Mesh** (Istio/Linkerd)
   - Fine-grained traffic control
   - Observability and monitoring

3. **Database Replication**
   - Primary-replica setup for HA
   - Read replicas for performance

4. **Automated Rollback**
   - Health check-based automatic rollback
   - Metrics-driven deployment decisions

This blue-green setup with durable infrastructure provides the foundation for these advanced patterns.
