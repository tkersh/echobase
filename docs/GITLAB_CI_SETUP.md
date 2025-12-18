# GitLab CI/CD Setup Guide for Local Deployment

This guide will help you set up GitLab CI/CD for automated deployment to your local development machine.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GitLab Runner Setup](#gitlab-runner-setup)
3. [Configuration](#configuration)
4. [Pipeline Overview](#pipeline-overview)
5. [Usage](#usage)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

Before setting up the GitLab runner, ensure you have the following installed on your local development machine:

- **Docker** (version 20.10 or higher)
  ```bash
  docker --version
  ```

- **Docker Compose** (version 2.0 or higher)
  ```bash
  docker compose --version
  ```

- **Terraform** (version 1.0 or higher)
  ```bash
  terraform --version
  ```

- **Node.js** (version 16 or higher)
  ```bash
  node --version
  ```

- **npm** (comes with Node.js)
  ```bash
  npm --version
  ```

- **GitLab Runner** (will be installed in next section)

## GitLab Runner Setup

### Step 1: Install GitLab Runner

#### On macOS:
```bash
# Using Homebrew
brew install gitlab-runner

# Or download the binary
sudo curl --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-darwin-amd64
sudo chmod +x /usr/local/bin/gitlab-runner
```

#### On Linux:
```bash
# Download the binary
sudo curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64

# Give it execute permissions
sudo chmod +x /usr/local/bin/gitlab-runner

# Create a GitLab CI user
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash

# Install and run as service
sudo gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
```

### Step 2: Register the Runner

1. **Get your GitLab registration token:**
   - Go to your GitLab project
   - Navigate to **Settings > CI/CD > Runners**
   - Expand the **Runners** section
   - Copy the registration token

2. **Register the runner:**
   ```bash
   gitlab-runner register
   ```

3. **Answer the prompts:**
   ```
   Enter the GitLab instance URL:
   > https://gitlab.com  (or your GitLab instance URL)

   Enter the registration token:
   > [paste your token]

   Enter a description for the runner:
   > Local Development Runner

   Enter tags for the runner (comma-separated):
   > docker-local

   Enter optional maintenance note:
   > [press Enter to skip]

   Enter an executor:
   > docker

   Enter the default Docker image:
   > docker:24-dind

   Runner registered successfully!
   ```

### Step 3: Configure Runner for Docker-in-Docker

The runner needs to be configured for Docker-in-Docker (DinD) access:

#### Edit Runner Configuration

After registration, edit the runner config to enable privileged mode and Docker socket mounting:

**On macOS:**
```bash
# Edit the config file
nano ~/.gitlab-runner/config.toml
```

**On Linux:**
```bash
# Edit the config file
sudo nano /etc/gitlab-runner/config.toml
```

**Add/verify these settings in the `[[runners.docker]]` section:**
```toml
[[runners]]
  name = "Local Development Runner"
  url = "https://gitlab.com"
  token = "YOUR_TOKEN"
  executor = "docker"
  [runners.docker]
    tls_verify = false
    image = "docker:24-dind"
    privileged = true
    disable_entrypoint_overwrite = false
    oom_kill_disable = false
    disable_cache = false
    volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/certs/client", "/cache"]
    shm_size = 0
```

**Important settings:**
- `privileged = true` - Required for Docker-in-Docker
- `volumes = ["/var/run/docker.sock:/var/run/docker.sock", ...]` - Mounts host Docker socket for better performance

### Step 4: Start the Runner

```bash
# Start the runner
gitlab-runner start

# Verify it's running
gitlab-runner status

# View available runners
gitlab-runner list
```

## Configuration

### Environment Variables

The pipeline requires a `.env` file with your credentials. Generate it first:

```bash
./generate-credentials.sh
```

This creates a `.env` file with:
- Database credentials
- AWS credentials (for Localstack)
- JWT secrets
- Service ports

**IMPORTANT:** The `.env` file must be present in your project root for the pipeline to work.

### GitLab CI/CD Variables (Optional)

For added security, you can store sensitive variables in GitLab:

1. Go to **Settings > CI/CD > Variables**
2. Add the following variables:
   - `MYSQL_ROOT_PASSWORD` - Database root password
   - `MYSQL_PASSWORD` - Database user password
   - `JWT_SECRET` - JWT signing secret
   - `AWS_ACCESS_KEY_ID` - AWS access key (for Localstack)
   - `AWS_SECRET_ACCESS_KEY` - AWS secret key (for Localstack)

**Note:** If using GitLab variables, modify `.gitlab-ci.yml` to use `$CI_VARIABLE_NAME` instead of sourcing from `.env`.

## Pipeline Overview

The CI/CD pipeline consists of 5 stages:

### 1. Validate Stage
- **`validate:env-check`** - Checks all prerequisites (Docker, Terraform, Node.js)
- **`validate:terraform`** - Validates Terraform configuration
- **`validate:compose`** - Validates Docker Compose configuration

### 2. Build Stage
- **`build:dependencies`** - Installs all Node.js dependencies
- **`build:docker-images`** - Builds all Docker images

### 3. Test Stage
- **`test:api-gateway-unit`** - Runs API Gateway unit tests
- **`test:security`** - Runs security tests (authentication, authorization, etc.)
- **`test:e2e`** - Runs end-to-end Playwright tests

### 4. Deploy Stage
- **`deploy:ci-blue`** - Automatically deploys to CI Blue environment (main/develop branches)
- **`deploy:ci-blue-manual`** - Manual deployment to CI Blue for feature branches

### 5. Cleanup Stage
- **`cleanup:devlocal`** - Stops devlocal services and removes containers (manual)
- **`cleanup:ci-blue`** - Stops CI Blue services and removes containers (manual)
- **`cleanup:green`** - Stops green services and removes containers (manual)
- **`cleanup:volumes`** - Removes containers and volumes (manual, destructive)

### Utility Jobs
- **`logs:view`** - View logs from all services (manual)
- **`database:query`** - Query recent orders from database (manual)

## Usage

### Automatic Deployment

When you push to `main` or `develop` branches, the pipeline will:

1. Validate your code and configuration
2. Build Docker images
3. Run all tests (unit, security, E2E)
4. Deploy to your local environment automatically

```bash
git add .
git commit -m "Your changes"
git push origin main
```

### Manual Deployment

For feature branches, deployment is manual:

1. Push your changes:
   ```bash
   git push origin feature/my-feature
   ```

2. Go to **CI/CD > Pipelines** in GitLab
3. Find your pipeline
4. Click the play button on `deploy:ci-blue-manual`

### Viewing Logs

To view logs from running services:

1. Go to **CI/CD > Pipelines**
2. Find your pipeline
3. Click the play button on `logs:view` job
4. View the job output

### Querying Database

To check recent orders:

1. Go to **CI/CD > Pipelines**
2. Find your pipeline
3. Click the play button on `database:query` job
4. View the query results

### Cleanup

To stop services and clean up:

**Option 1: Remove containers only**
1. Go to **CI/CD > Pipelines**
2. Click the play button on `cleanup:local` job

**Option 2: Remove containers and volumes (WARNING: deletes data)**
1. Go to **CI/CD > Pipelines**
2. Click the play button on `cleanup:volumes` job

## Pipeline Execution Flow

```
┌─────────────────┐
│   Validate      │
│  - env-check    │
│  - terraform    │
│  - docker       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Build       │
│  - dependencies │
│  - images       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│      Test       │
│  - unit         │
│  - security     │
│  - e2e          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Deploy      │
│  - local (auto) │
│  - manual       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Cleanup      │
│  - manual only  │
└─────────────────┘
```

## Accessing Deployed Services

After successful deployment, your services will be available at:

- **Frontend:** https://localhost:3443
- **API Gateway:** https://localhost:3001
- **Localstack:** http://localhost:4566
- **MariaDB:** localhost:3306

## Monitoring Pipeline Execution

### View Pipeline Status

1. Go to **CI/CD > Pipelines**
2. Click on a pipeline to see job details
3. Click on individual jobs to view logs

### View Test Results

Test results and artifacts are saved for 1 week:

1. Go to **CI/CD > Pipelines**
2. Click on your pipeline
3. On the right sidebar, click **Tests** or **Artifacts**
4. Download reports:
   - E2E test reports (Playwright HTML reports)
   - Coverage reports
   - Security test results

### Environment Status

You can view the deployment environment:

1. Go to **Deployments > Environments**
2. Click on **local-development**
3. See deployment history and status
4. Click **Open** to access the frontend

## Troubleshooting

### Runner Not Picking Up Jobs

**Problem:** Pipeline stuck in "pending" state.

**Solution:**
```bash
# Check runner status
gitlab-runner status

# Restart runner
gitlab-runner restart

# Check runner logs
gitlab-runner --debug run
```

### Docker Permission Errors

**Problem:** "permission denied while trying to connect to the Docker daemon"

**Solution:**
```bash
# On Linux, add gitlab-runner to docker group
sudo usermod -aG docker gitlab-runner
sudo systemctl restart gitlab-runner

# Verify
sudo -u gitlab-runner docker ps
```

### .env File Not Found

**Problem:** Pipeline fails with ".env file not found"

**Solution:**
```bash
# Generate credentials
./generate-credentials.sh

# Verify the file exists
ls -la .env
```

### Terraform State Locked

**Problem:** "Error acquiring the state lock"

**Solution:**
```bash
# Force unlock (get lock ID from error message)
cd terraform
terraform force-unlock <LOCK_ID>
```

### Port Already in Use

**Problem:** "port is already allocated"

**Solution:**
```bash
# Stop existing containers
docker compose down

# Or kill processes using the port
lsof -ti:3001 | xargs kill -9  # For API Gateway
lsof -ti:3443 | xargs kill -9  # For Frontend
```

### Services Not Starting

**Problem:** Containers exit immediately after starting

**Solution:**
```bash
# Check logs
docker compose logs api-gateway
docker compose logs order-processor

# Restart services
docker compose restart

# Full restart
docker compose down && docker compose up -d
```

### E2E Tests Failing

**Problem:** Playwright tests timeout or fail

**Solution:**
```bash
# Increase wait time in pipeline (edit .gitlab-ci.yml)
# Change sleep 20 to sleep 30 in test:e2e job

# Install browser dependencies
cd e2e-tests
npx playwright install-deps
```

### Cleanup Hanging

**Problem:** Cleanup job takes too long or hangs

**Solution:**
```bash
# Manually cleanup
docker compose down -v
docker system prune -af

# Reset Terraform state
cd terraform
rm -rf .terraform terraform.tfstate*
terraform init
```

## Advanced Configuration

### Custom Runner Tags

To run jobs on specific runners, modify tags in `.gitlab-ci.yml`:

```yaml
default:
  tags:
    - docker-local     # Your runner tag (Docker executor)
    - macos            # Optional additional tags
    - development
```

### Parallel Test Execution

To speed up tests, you can parallelize E2E tests:

```yaml
test:e2e:
  parallel: 3
  script:
    - npm test -- --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}
```

### Custom Deployment Environments

To add staging or production environments:

```yaml
deploy:staging:
  stage: deploy
  script:
    - # Your staging deployment script
  environment:
    name: staging
    url: https://staging.localhost
  only:
    - develop
```

### Scheduled Pipelines

To run tests on a schedule:

1. Go to **CI/CD > Schedules**
2. Click **New schedule**
3. Set interval (e.g., daily at 2 AM)
4. Select target branch
5. Save schedule

## Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use GitLab CI/CD variables** for sensitive data
3. **Limit runner access** - Only allow specific projects
4. **Rotate credentials regularly** - Run `./generate-credentials.sh` periodically
5. **Monitor pipeline logs** - Check for exposed secrets
6. **Use protected branches** - Require approvals for main/develop

## Support

For issues with:
- **GitLab Runner**: Check [GitLab Runner docs](https://docs.gitlab.com/runner/)
- **Pipeline configuration**: See [GitLab CI/CD docs](https://docs.gitlab.com/ee/ci/)
- **Echobase application**: See project README.md

## Next Steps

1. **Set up notifications**: Configure GitLab to send pipeline status to Slack/email
2. **Add code quality checks**: Integrate linters and code analyzers
3. **Enable caching**: Speed up pipelines with Docker layer caching
4. **Add deployment approvals**: Require manual approval for deployments
5. **Monitor resources**: Set up alerts for runner resource usage

---

**Happy CI/CD-ing! 🚀**
