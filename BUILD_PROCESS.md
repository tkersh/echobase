# Build Process Documentation

**Updated**: 2025-11-17

---

## Overview

The build process has been updated to ensure Docker images are always rebuilt when dependencies change. This prevents "module not found" errors after adding new npm packages.

---

## Updated Scripts

### 1. setup.sh - Complete Setup with Rebuild

**What it does**:
1. ✅ Installs npm dependencies FIRST (before Docker build)
2. ✅ Starts infrastructure (Localstack + MariaDB)
3. ✅ Provisions AWS resources with Terraform
4. ✅ **Rebuilds ALL Docker images** with `--build` flag
5. ✅ Starts all application containers

**When to use**:
- First time setup
- After adding new npm packages
- After modifying Dockerfiles
- After pulling code changes that affect dependencies

**Usage**:
```bash
./setup.sh
```

**Key Changes**:
```bash
# OLD (wrong order - npm install after Docker)
docker-compose up -d
npm install  # Too late! Docker already built

# NEW (correct order - npm install before Docker)
npm install  # Update package.json first
docker-compose up -d --build  # Then build with latest packages
```

---

### 2. start.sh - Quick Start with Optional Rebuild

**What it does**:
1. Loads environment variables
2. Starts services with existing images (fast)
3. **NEW**: Optional `--rebuild` flag to rebuild images

**When to use**:
- Starting stopped services
- After system restart
- Daily development workflow

**Usage**:
```bash
# Normal start (uses existing images)
./start.sh

# Rebuild and start (after dependency changes)
./start.sh --rebuild
```

**Key Changes**:
```bash
# NEW: Optional rebuild flag
if [ "$1" == "--rebuild" ]; then
  docker-compose up -d --build
else
  docker-compose up -d
fi
```

---

## Build Order (Correct Sequence)

### Setup Script Sequence

```
1. Check prerequisites (Docker, .env file)
   ↓
2. Install npm dependencies
   - backend/api-gateway
   - backend/order-processor
   - frontend
   ↓
3. Start infrastructure
   - docker-compose up -d localstack mariadb
   ↓
4. Wait for infrastructure (10 seconds)
   ↓
5. Provision AWS resources
   - terraform init
   - terraform apply
   ↓
6. Build and start applications
   - docker-compose up -d --build api-gateway order-processor frontend
   ↓
7. Verify services
   - docker-compose ps
```

---

## Why This Order Matters

### ❌ Wrong Order (Old Setup)

```bash
# 1. Start Docker (builds with OLD package.json)
docker-compose up -d

# 2. Install npm packages (AFTER Docker build)
npm install

# Result: Docker image doesn't have new packages!
```

**Problem**: Docker copies `package.json` during build. If npm install runs AFTER, the Docker image has the old packages.

### ✅ Correct Order (New Setup)

```bash
# 1. Install npm packages (updates package.json)
npm install

# 2. Build Docker images (copies UPDATED package.json)
docker-compose up -d --build

# Result: Docker image has all packages!
```

**Solution**: npm install FIRST, then Docker build copies the updated files.

---

## Docker Image Build Process

### How Dockerfile Uses package.json

```dockerfile
# 1. Copy package files
COPY api-gateway/package*.json ./

# 2. Install dependencies (uses copied files)
RUN npm ci --only=production

# 3. Copy application code
COPY api-gateway/ ./
```

**Key Point**: Docker copies `package.json` at build time. Changes after build are NOT included.

---

## Common Scenarios

### Scenario 1: Adding New npm Package

```bash
# 1. Add package locally
cd backend/api-gateway
npm install new-package --save

# 2. Rebuild Docker image
cd ../..
docker-compose build api-gateway

# 3. Restart container
docker-compose up -d api-gateway
```

**Or use shortcut**:
```bash
./start.sh --rebuild
```

### Scenario 2: Pulling Code Changes

```bash
# 1. Pull latest code
git pull

# 2. Run setup (handles everything)
./setup.sh
```

### Scenario 3: Updating Dependencies

```bash
# 1. Update package.json
npm update

# 2. Rebuild and restart
./start.sh --rebuild
```

### Scenario 4: Daily Development

```bash
# Just start services (no rebuild needed)
./start.sh
```

---

## Troubleshooting

### Error: "Cannot find module 'xyz'"

**Cause**: Docker image doesn't have the module.

**Solution**:
```bash
# Option 1: Rebuild specific service
docker-compose build api-gateway
docker-compose up -d api-gateway

# Option 2: Rebuild everything
./start.sh --rebuild

# Option 3: Full setup
./setup.sh
```

### Error: "npm install" fails during setup

**Cause**: Permission issues or corrupted cache.

**Solution**:
```bash
# Fix npm cache permissions
sudo chown -R $(whoami) ~/.npm

# Or use setup script's --no-cache option
# (To be implemented if needed)
```

### Docker Build is Slow

**Cause**: Rebuilding all layers.

**Optimization**:
```bash
# Only rebuild changed services
docker-compose build api-gateway
docker-compose up -d api-gateway
```

---

## Best Practices

### ✅ DO

1. **Run setup.sh after**:
   - Cloning repository
   - Adding npm packages
   - Pulling dependency changes
   - Modifying Dockerfiles

2. **Use start.sh --rebuild when**:
   - You updated package.json manually
   - You added a new module
   - You're troubleshooting module errors

3. **Use plain start.sh when**:
   - Starting stopped services
   - Daily development work
   - No code changes since last build

### ❌ DON'T

1. **Don't run** `docker-compose up` directly
   - Use scripts instead (they handle rebuild logic)

2. **Don't run** `npm install` in running containers
   - Install on host, then rebuild image

3. **Don't skip** rebuild after adding packages
   - Always rebuild when dependencies change

---

## Verification Checklist

After running setup.sh, verify:

```bash
# 1. All containers running
docker-compose ps
# Should show: api-gateway, order-processor, frontend, localstack, mariadb

# 2. No module errors in logs
docker-compose logs api-gateway | grep -i "cannot find module"
# Should return nothing

# 3. Server started successfully
docker-compose logs api-gateway | grep "running"
# Should show: "API Gateway running on HTTPS port 3001"

# 4. All modules loaded
curl -k https://localhost:3001/health
# Should return 200 OK with health status
```

---

## Script Comparison

| Feature | setup.sh | start.sh | start.sh --rebuild |
|---------|----------|----------|--------------------|
| npm install | ✅ Yes | ❌ No | ❌ No |
| Terraform | ✅ Yes | ❌ No | ❌ No |
| Docker build | ✅ Always | ❌ Never | ✅ Always |
| Start services | ✅ Yes | ✅ Yes | ✅ Yes |
| Best for | Initial setup, dependency changes | Daily use | Code/dependency changes |
| Speed | Slow (5-10 min) | Fast (10 sec) | Medium (2-3 min) |

---

## Environment-Specific Notes

### Development
- Use `start.sh --rebuild` frequently
- Log level: DEBUG
- Fast iteration

### Staging
- Always use `setup.sh` for clean builds
- Log level: INFO
- Test with production-like setup

### Production
- Use CI/CD pipeline
- Log level: WARN or ERROR
- Automated rebuild on deploy

---

## CI/CD Integration

### Example GitHub Actions

```yaml
name: Build and Test

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Generate credentials
        run: ./generate-credentials.sh

      - name: Setup and build
        run: ./setup.sh

      - name: Run tests
        run: |
          cd backend/api-gateway
          npm test

      - name: Verify health
        run: |
          sleep 10
          curl -f https://localhost:3001/health
```

---

## Quick Reference

```bash
# Full setup (first time or after dependency changes)
./setup.sh

# Quick start (daily use)
./start.sh

# Start with rebuild (after code changes)
./start.sh --rebuild

# Manual rebuild specific service
docker-compose build api-gateway
docker-compose up -d api-gateway

# View logs
docker-compose logs -f api-gateway

# Stop services
docker-compose down

# Complete cleanup
docker-compose down -v
```

---

## Summary of Changes

### setup.sh
- ✅ Moved npm install BEFORE Docker build
- ✅ Added `--build` flag to ensure rebuild
- ✅ Split infrastructure and application startup
- ✅ Clearer progress messages

### start.sh
- ✅ Added `--rebuild` flag option
- ✅ Clear messages about when to rebuild
- ✅ Better help text

### Result
- ✅ No more "module not found" errors
- ✅ Predictable build process
- ✅ Fast daily workflow
- ✅ Easy dependency updates

---

**All scripts now handle dependency changes correctly!** ✅
