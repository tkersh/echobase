# GitLab CI/CD for Echobase - Quick Start

This directory now contains a complete GitLab CI/CD pipeline configuration for automated deployment to your local development machine using Docker executor.

## What Was Added

### 1. `.gitlab-ci.yml`
**Complete CI/CD pipeline with 5 stages:**
- **Validate**: Environment checks, Terraform validation, Docker Compose validation
- **Build**: Install dependencies, build Docker images
- **Test**: Unit tests, security tests, E2E tests
- **Deploy**: Automated deployment to local environment
- **Cleanup**: Manual cleanup jobs

**Key Features:**
- Docker executor with Docker-in-Docker (DinD) support
- Proper isolation between jobs using containers
- Caching for faster builds
- Test artifacts and reports
- Environment management
- Manual deployment options

### 2. `setup-gitlab-runner.sh`
**Automated setup script** that:
- Checks all prerequisites (Docker, Terraform, Node.js, etc.)
- Installs GitLab Runner (macOS or Linux)
- Registers runner with Docker executor
- Configures Docker-in-Docker support
- Starts the runner service

### 3. `GITLAB_CI_SETUP.md`
**Comprehensive documentation** covering:
- Prerequisites and installation
- Step-by-step runner setup
- Pipeline overview and stages
- Usage instructions
- Troubleshooting guide
- Advanced configuration options
- Security best practices

## Quick Start (3 Steps)

### Step 1: Install GitLab Runner
```bash
./setup-gitlab-runner.sh
```

This script will:
1. Check prerequisites
2. Install GitLab Runner
3. Register it with Docker executor
4. Configure and start the runner

### Step 2: Verify Setup
```bash
# Check runner status
gitlab-runner status

# List registered runners
gitlab-runner list
```

### Step 3: Push and Deploy
```bash
# Ensure .env file exists
./generate-credentials.sh

# Commit the CI/CD configuration
git add .gitlab-ci.yml GITLAB_CI_SETUP.md setup-gitlab-runner.sh
git commit -m "Add GitLab CI/CD pipeline with Docker executor"
git push origin main
```

The pipeline will automatically:
1. Validate your configuration
2. Build Docker images
3. Run all tests (unit, security, E2E)
4. Deploy to your local machine

## Pipeline Architecture

### Docker Executor Benefits
- **Isolation**: Each job runs in a fresh container
- **Consistency**: Same environment every time
- **Flexibility**: Use different images per job
- **Security**: Better isolation than shell executor

### Jobs Use Different Images
- **Validation jobs**: `docker/compose:latest`, `hashicorp/terraform:latest`
- **Build jobs**: `node:18-alpine`, `docker/compose:latest`
- **Test jobs**: `node:18-alpine`, `mcr.microsoft.com/playwright:v1.56.1-focal`
- **Deploy jobs**: `docker/compose:latest`

### Docker-in-Docker (DinD)
The pipeline uses Docker-in-Docker to:
- Build Docker images within CI jobs
- Run docker compose commands
- Start services for testing
- Deploy containers to your local machine

## Configuration Files

```
.
├── .gitlab-ci.yml                 # Main CI/CD pipeline configuration
├── setup-gitlab-runner.sh         # Automated runner setup script
├── GITLAB_CI_SETUP.md            # Comprehensive setup guide
└── GITLAB_CI_README.md           # This file (quick start)
```

## Runner Configuration

The runner is configured with:
- **Executor**: `docker`
- **Default Image**: `docker:24-dind`
- **Privileged Mode**: `true` (required for DinD)
- **Docker Socket**: Mounted from host for performance
- **Tags**: `docker-local`

**Config file location:**
- macOS: `~/.gitlab-runner/config.toml`
- Linux: `/etc/gitlab-runner/config.toml`

## Pipeline Stages Explained

### 1. Validate Stage (3 jobs)
```
validate:env-check       → Check Docker, Terraform, Node.js
validate:terraform       → Validate Terraform configuration
validate:compose  → Validate Docker Compose config
```

### 2. Build Stage (2 jobs)
```
build:dependencies    → Install npm packages (cached)
build:docker-images   → Build all Docker images
```

### 3. Test Stage (3 jobs)
```
test:api-gateway-unit → Run Jest unit tests
test:security         → Run security test suite (42+ tests)
test:e2e             → Run Playwright E2E tests
```

### 4. Deploy Stage (2 jobs)
```
deploy:ci-blue         → Auto deploy to CI Blue (main/develop branches)
deploy:ci-blue-manual  → Manual deploy to CI Blue (feature branches)
```

### 5. Cleanup Stage (2 jobs)
```
cleanup:devlocal    → Stop devlocal containers (manual)
cleanup:volumes  → Remove volumes (manual, destructive)
```

## Accessing Services After Deployment

Once deployed, services are available at:
- **Frontend**: https://localhost:3443
- **API Gateway**: https://localhost:3001
- **Localstack**: http://localhost:4566
- **MariaDB**: localhost:3306

## Viewing Pipeline in GitLab

1. **Pipelines**: `CI/CD > Pipelines`
2. **Jobs**: Click on pipeline → Click on job name
3. **Logs**: Real-time logs in job view
4. **Artifacts**: Click "Browse" on right side
5. **Tests**: Click "Tests" tab for test results
6. **Environment**: `Deployments > Environments > devlocal` or `ci-blue-development`

## Manual Jobs

Some jobs are manual and require clicking "play" button:
- `deploy:ci-blue-manual` - Manual deployment to CI Blue for feature branches
- `cleanup:devlocal` - Stop and remove devlocal containers
- `cleanup:ci-blue` - Stop and remove CI Blue containers
- `cleanup:green` - Stop and remove green containers
- `cleanup:volumes` - Remove containers AND volumes (destructive)
- `logs:view` - View logs from all services
- `database:query` - Query recent orders

## Common Commands

```bash
# Check runner status
gitlab-runner status

# Restart runner
gitlab-runner restart

# View runner logs
gitlab-runner --debug run

# Stop runner
gitlab-runner stop

# Unregister runner
gitlab-runner unregister --all-runners
```

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| Pipeline stuck in "pending" | `gitlab-runner restart` |
| "Docker permission denied" | Check config.toml has privileged=true |
| ".env file not found" | Run `./generate-credentials.sh` |
| Port already in use | `docker compose down` |
| Services not starting | Check `docker compose logs` |
| Tests timeout | Increase sleep time in .gitlab-ci.yml |

## Environment Variables

The pipeline uses variables from `.env` file:
- Database credentials (DB_USER, DB_PASSWORD, etc.)
- AWS credentials for Localstack
- JWT secrets
- Service ports
- SQS queue URLs

**Security**: The `.env` file is required in your repository root but should NEVER be committed to version control (already in `.gitignore`).

## Next Steps

1. **Test the Pipeline**: Push a commit and watch it run
2. **Customize Jobs**: Edit `.gitlab-ci.yml` to add custom jobs
3. **Add Notifications**: Configure GitLab to send alerts
4. **Set up Schedules**: Run tests on a schedule
5. **Add Code Quality**: Integrate linters and analyzers

## Documentation

- **Quick Start**: This file (GITLAB_CI_README.md)
- **Detailed Guide**: GITLAB_CI_SETUP.md
- **Application README**: README.md
- **Security**: SECURITY.md

## Support

**Pipeline Issues:**
- Check job logs in GitLab UI
- See GITLAB_CI_SETUP.md troubleshooting section
- Check runner status: `gitlab-runner status`

**Application Issues:**
- See README.md
- Check service logs: `docker compose logs`

**GitLab Runner Issues:**
- GitLab Runner docs: https://docs.gitlab.com/runner/
- GitLab CI/CD docs: https://docs.gitlab.com/ee/ci/

## Key Differences: Docker Executor vs Shell Executor

| Feature | Docker Executor | Shell Executor |
|---------|----------------|----------------|
| Isolation | Each job in fresh container | Jobs run on host |
| Dependencies | Installed per job | Shared across jobs |
| Cleanup | Automatic | Manual |
| Performance | Slightly slower (container startup) | Faster |
| Security | Better isolation | Less isolation |
| Flexibility | Different images per job | Same environment |
| Docker-in-Docker | Requires privileged mode | Native Docker access |

**We chose Docker executor** for better isolation and consistency, which is more suitable for CI/CD best practices.

## What Happens on Each Push

```
1. Code pushed to GitLab
   ↓
2. Pipeline triggered automatically
   ↓
3. Validate stage runs (environment checks)
   ↓
4. Build stage runs (install deps, build images)
   ↓
5. Test stage runs (unit, security, E2E tests)
   ↓
6. Deploy stage runs (if on main/develop)
   ↓
7. Services deployed to https://localhost:3443
```

---

**Ready to deploy? Run `./setup-gitlab-runner.sh` to get started! 🚀**
