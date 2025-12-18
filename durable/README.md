# Durable Infrastructure

This directory contains the durable infrastructure layer for Echobase, which manages persistent databases that survive blue-green deployments.

## Architecture Overview

In a true blue-green deployment pattern, the database must be separate from the ephemeral application environments to maintain data consistency across deployments. This directory provides that separation.

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Durable Infrastructure                   │
│                                                             │
│  ┌──────────────────────┐     ┌──────────────────────┐    │
│  │  Dev-Local Database  │     │    CI Database       │    │
│  │                      │     │                      │    │
│  │  Container:          │     │  Container:          │    │
│  │  echobase-devlocal-  │     │  echobase-ci-        │    │
│  │  durable-mariadb     │     │  durable-mariadb     │    │
│  │                      │     │                      │    │
│  │  Network:            │     │  Network:            │    │
│  │  echobase-devlocal-  │     │  echobase-ci-        │    │
│  │  durable-network     │     │  durable-network     │    │
│  │                      │     │                      │    │
│  │  Port: 3306          │     │  Port: 3307          │    │
│  └──────────────────────┘     └──────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        ▲                     ▲
                        │                     │
        ┌───────────────┴─────────┐  ┌────────┴──────────┐
        │   Blue Environment      │  │  Green Environment│
        │   (Dev-Local)           │  │  (CI)             │
        │                         │  │                   │
        │   - API Gateway         │  │  - API Gateway    │
        │   - Order Processor     │  │  - Order Processor│
        │   - Frontend            │  │  - Frontend       │
        │   - LocalStack          │  │  - LocalStack     │
        └─────────────────────────┘  └───────────────────┘
```

## Two Environments

### 1. Dev-Local Environment

Used for local development on your machine.

- **Container Name:** `echobase-devlocal-durable-mariadb`
- **Network:** `echobase-devlocal-durable-network`
- **Port:** `3306`
- **Volume:** `echobase-devlocal-durable-mariadb-data`

**Setup (Idempotent):**
```bash
./durable/setup.sh devlocal
```

This command is **idempotent**:
- If database exists and is running: skips creation, reports status
- If database exists but is stopped: starts it
- If database doesn't exist: creates it

You can run it multiple times safely - it will not recreate an existing database.

**Teardown:**
```bash
# Preserve data
./durable/teardown.sh devlocal

# Remove data volumes (WARNING: deletes all data!)
./durable/teardown.sh devlocal --volumes
```

### 2. CI Environment

Used for continuous integration and automated testing.

- **Container Name:** `echobase-ci-durable-mariadb`
- **Network:** `echobase-ci-durable-network`
- **Port:** `3307`
- **Volume:** `echobase-ci-durable-mariadb-data`

**Setup (Idempotent):**
```bash
./durable/setup.sh ci
```

This command is **idempotent** (safe to run multiple times):
- First run: Creates the CI database
- Subsequent runs: Detects existing database and skips creation
- If stopped: Automatically restarts the existing database

**In CI/CD:** The `durable:setup-ci` job runs automatically in every pipeline but only creates the database once. Subsequent runs verify it's running and exit early.

**Teardown:**
```bash
# Preserve data
./durable/teardown.sh ci

# Remove data volumes (WARNING: deletes all data!)
./durable/teardown.sh ci --volumes
```

**To rebuild:** Run `cleanup:durable-ci` manual job in GitLab CI, then the next pipeline will recreate it.

## How It Works

### Configuration Files

- **`docker-compose.yml`**: Main compose file for durable infrastructure
- **`.env.devlocal`**: Configuration for devlocal environment
- **`.env.ci`**: Configuration for CI environment
- **`setup.sh`**: **Idempotent** setup script - safe to run multiple times
- **`teardown.sh`**: Teardown script with optional volume removal

The setup script merges these environment files with the root `.env` file (which contains database credentials) to create the appropriate configuration.

### Idempotent Setup

The `setup.sh` script is **idempotent**, meaning it can be run multiple times safely:

1. **First Run**: Creates the database container and network
2. **Subsequent Runs**:
   - Detects the existing container
   - If running: Reports status and exits (no changes)
   - If stopped: Starts the existing container

This is especially important in CI/CD where the `durable:setup-ci` job runs automatically in every pipeline. The database is created once and reused across all pipeline runs, maintaining data continuity for testing.

### Integration with Application Environments

Application environments connect to the durable databases through Docker networks:

1. **Dev-Local (Blue) Environment:**
   - Connects to `echobase-devlocal-durable-network`
   - Uses `DB_HOST=echobase-devlocal-durable-mariadb`

2. **CI Green Environment:**
   - Connects to `echobase-ci-durable-network`
   - Uses `DB_HOST=echobase-ci-durable-mariadb`

### Database Connection

Applications reference the database using environment variables:

```bash
DB_HOST=echobase-devlocal-durable-mariadb  # For devlocal
DB_HOST=echobase-ci-durable-mariadb        # For CI
DB_PORT=3306
DB_NAME=orders_db
DB_USER=app_user
DB_PASSWORD=<from .env>
```

## Why Separate Databases?

Having separate databases for devlocal and CI provides:

1. **Isolation:** Development and CI don't interfere with each other
2. **Data Safety:** CI tests can't corrupt local development data
3. **Parallel Execution:** Run local dev and CI simultaneously
4. **Realistic Testing:** CI tests run against a clean database state

## Blue-Green Deployment Benefits

By separating the database into durable infrastructure:

1. **Data Persistence:** Database survives blue-green environment switches
2. **Zero Downtime:** Can deploy new application versions without database migration downtime
3. **Easy Rollback:** Roll back application without affecting database
4. **Shared State:** Blue and green environments can share the same database (if desired)

## Usage Examples

### Local Development Workflow

```bash
# Initial setup
./generate-credentials.sh
./durable/setup.sh devlocal
./setup.sh
./start.sh

# Develop, test, iterate...

# When done for the day, tear down app but keep database
docker compose down

# Database persists! Next day:
./start.sh  # Database already running
```

### CI/CD Workflow

The GitLab CI pipeline automatically:

1. Sets up durable CI infrastructure in the `durable` stage
2. Deploys green environment (connecting to CI database)
3. Runs tests against green environment
4. Optionally promotes green to production
5. Cleans up green environment (database persists for next run)

## Troubleshooting

### Check Database Status

```bash
# Dev-local
docker ps --filter "name=echobase-devlocal-durable-mariadb"
docker logs echobase-devlocal-durable-mariadb

# CI
docker ps --filter "name=echobase-ci-durable-mariadb"
docker logs echobase-ci-durable-mariadb
```

### Connect to Database

```bash
# Dev-local (from host)
docker exec -it echobase-devlocal-durable-mariadb mariadb -u root -p

# CI (from host)
docker exec -it echobase-ci-durable-mariadb mariadb -u root -p
```

### Reset Database

```bash
# WARNING: This deletes all data!

# Dev-local
./durable/teardown.sh devlocal --volumes
./durable/setup.sh devlocal

# CI
./durable/teardown.sh ci --volumes
./durable/setup.sh ci
```

### Network Issues

If containers can't connect to the database:

1. Verify the database container is running
2. Check that application containers are on the correct network:
   ```bash
   docker network inspect echobase-devlocal-durable-network
   docker network inspect echobase-ci-durable-network
   ```
3. Verify `DB_HOST` environment variable in application containers

## Files

```
durable/
├── README.md              # This file
├── docker-compose.yml     # Durable infrastructure definition
├── .env.devlocal        # Dev-local environment config
├── .env.ci               # CI environment config
├── setup.sh              # Setup script
└── teardown.sh           # Teardown script
```

## Migration from Old Architecture

The old architecture had mariadb defined in `docker-compose.yml`, which meant:
- Database was recreated with each blue-green deployment
- Blue and green couldn't share a database
- Data was lost during deployments (unless volumes persisted)

The new architecture:
- Database is separate and durable
- Blue-green deployments don't touch the database
- True blue-green deployment pattern with data persistence
