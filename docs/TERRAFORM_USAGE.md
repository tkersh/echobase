# Terraform Usage Guide

This guide explains how to use Terraform to manage AWS infrastructure for the Echobase application.

## Overview

Terraform is used to provision:
- **KMS Keys** - For encrypting secrets at rest
- **Secrets Manager** - For storing database credentials securely
- **SQS Queues** - For asynchronous order processing
- **IAM Policies** - For access control

## Prerequisites

1. **Docker** running with Localstack container
2. **Terraform** installed (v1.0+)
3. **Environment Variables** set from `.env` file

## Quick Start

### Option 1: Automated Setup (Recommended)

Use the provided scripts that handle everything automatically:

```bash
# Generate credentials
./generate-credentials.sh

# Setup everything (Docker + Terraform)
./setup.sh

# Teardown everything when done
./teardown.sh
```

### Option 2: Manual Terraform

If you need to run Terraform commands manually:

```bash
# 1. Ensure .env file exists
ls -la .env

# 2. Navigate to terraform directory
cd terraform

# 3. Export Terraform variables from .env
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME

# 4. Initialize Terraform
terraform init

# 5. Plan changes (optional but recommended)
terraform plan

# 6. Apply configuration
terraform apply

# 7. View outputs
terraform output
```

## Environment Variables

Terraform reads database credentials from environment variables with the `TF_VAR_` prefix:

| Environment Variable | Source | Required | Purpose |
|---------------------|--------|----------|---------|
| `TF_VAR_db_user` | `$DB_USER` from .env | Yes | Database username |
| `TF_VAR_db_password` | `$DB_PASSWORD` from .env | Yes | Database password |
| `TF_VAR_db_host` | `$DB_HOST` from .env | No | Database host (default: mariadb) |
| `TF_VAR_db_port` | `$DB_PORT` from .env | No | Database port (default: 3306) |
| `TF_VAR_db_name` | `$DB_NAME` from .env | No | Database name (default: orders_db) |

### Why This Approach?

✅ **Security:** No passwords hardcoded in Terraform files
✅ **Flexibility:** Different credentials per environment
✅ **Auditability:** Terraform state tracks changes without exposing secrets
✅ **Rotation:** Update `.env` file and reapply - no code changes needed

## Common Workflows

### Initial Setup

```bash
# Start Localstack
docker compose up -d localstack mariadb

# Wait for services to be ready
sleep 10

# Apply Terraform
cd terraform
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
terraform init
terraform apply -auto-approve
```

### Updating Secrets

If you rotate database credentials:

```bash
# 1. Update .env file with new password
vim .env

# 2. Update Secrets Manager via Terraform
cd terraform
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
terraform apply

# 3. Restart services to pick up new credentials
cd ..
docker compose restart api-gateway order-processor
```

### Viewing State

```bash
cd terraform

# List all resources
terraform state list

# Show specific resource
terraform state show aws_secretsmanager_secret.db_credentials

# View outputs
terraform output

# View sensitive outputs
terraform output secret_arn
```

### Destroying Resources

```bash
# Option 1: Use teardown script (recommended)
./teardown.sh

# Option 2: Manual destroy
cd terraform
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
terraform destroy
```

**Important:** Run `terraform destroy` BEFORE stopping Docker containers, as Terraform needs Localstack to be running to clean up resources.

## Troubleshooting

### Error: No value for required variable

```
Error: No value for required variable
│ on variables.tf line 19:
│  19: variable "db_user" {
```

**Cause:** Terraform variables not exported

**Solution:**
```bash
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
```

### Error: .env file not found

**Cause:** Missing credentials file

**Solution:**
```bash
# Generate credentials first
./generate-credentials.sh
```

### Error: Error acquiring the state lock

**Cause:** Previous Terraform process crashed or was interrupted

**Solution:**
```bash
# Force unlock (use the Lock ID from the error message)
terraform force-unlock <LOCK_ID>
```

### Error: Connection refused to Localstack

**Cause:** Localstack container not running

**Solution:**
```bash
# Check Localstack status
docker compose ps localstack

# Start Localstack if needed
docker compose up -d localstack

# Wait for it to be ready
sleep 10

# Test connectivity
curl http://localhost:4566/_localstack/health
```

### Secret password doesn't match database

**Cause:** Mismatch between .env and Secrets Manager

**Solution:**
```bash
# Reapply Terraform with correct password
cd terraform
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
terraform apply

# Restart services
cd ..
docker compose restart api-gateway order-processor
```

## Verification

### Verify Terraform State

```bash
cd terraform

# Check if resources exist in state
terraform state list

# Expected output:
# aws_iam_policy.db_secret_access
# aws_kms_alias.database_encryption
# aws_kms_key.database_encryption
# aws_secretsmanager_secret.db_credentials
# aws_secretsmanager_secret_version.db_credentials
# aws_sqs_queue.order_processing_dlq
# aws_sqs_queue.order_processing_queue
```

### Verify Secret in Localstack

```bash
# List secrets
docker exec echobase-devlocal-localstack awslocal secretsmanager list-secrets

# Get secret value
docker exec echobase-devlocal-localstack awslocal secretsmanager get-secret-value \
  --secret-id echobase/database/credentials

# Expected: JSON with username, password, host, port, dbname
```

### Verify Services Connected

```bash
# Check API Gateway logs
docker compose logs api-gateway | grep "Successfully retrieved database credentials"

# Check Order Processor logs
docker compose logs order-processor | grep "Connected to RDS MariaDB"

# Test API health
curl -k https://localhost:3001/health
```

## Script Reference

### setup.sh

**Purpose:** Complete application setup including Terraform provisioning

**What it does:**
1. Checks Docker is running
2. Verifies `.env` file exists
3. Starts Docker containers
4. Initializes Terraform
5. Exports database variables from `.env`
6. Applies Terraform configuration
7. Installs Node.js dependencies

**Usage:**
```bash
./setup.sh
```

### teardown.sh

**Purpose:** Clean shutdown and resource cleanup

**What it does:**
1. Exports database variables from `.env`
2. Runs `terraform destroy` (requires Localstack running)
3. Stops Docker containers

**Usage:**
```bash
./teardown.sh

# To also remove volumes:
./teardown.sh
docker compose down -v
```

### generate-credentials.sh

**Purpose:** Generate secure random credentials

**What it does:**
1. Generates strong random passwords
2. Creates `.env` file with all credentials
3. Generates database encryption keys
4. Sets restrictive file permissions

**Usage:**
```bash
./generate-credentials.sh
```

## Best Practices

### DO ✅

- Always use `setup.sh` for initial setup
- Always use `teardown.sh` before stopping containers
- Run `terraform plan` before `apply` in production
- Keep `.env` file backed up securely
- Review Terraform state changes carefully
- Use different `.env` files per environment

### DON'T ❌

- Never commit `.env` file to git
- Never hardcode passwords in `.tf` files
- Never run `docker compose down` before `terraform destroy`
- Never share `.env` file via insecure channels
- Never use production credentials in development
- Never skip the plan step in production

## Production Migration

When moving from Localstack to production AWS:

1. **Update Provider Configuration** (`terraform/main.tf`)
   ```hcl
   provider "aws" {
     region = "us-east-1"
     # Remove endpoint and access_key/secret_key
     # Use IAM roles instead
   }
   ```

2. **Use Remote State**
   ```hcl
   terraform {
     backend "s3" {
       bucket         = "my-terraform-state"
       key            = "echobase/terraform.tfstate"
       region         = "us-east-1"
       encrypt        = true
       dynamodb_table = "terraform-locks"
     }
   }
   ```

3. **Use Parameter Store or Secrets Manager for Terraform Variables**
   - Don't use `.env` files in production
   - Use AWS Systems Manager Parameter Store
   - Or use a secure secret management solution

4. **Enable Secret Rotation**
   - Uncomment rotation config in `secrets.tf`
   - Set up Lambda rotation function
   - Test rotation thoroughly

5. **Use RDS Instead of Docker**
   - Replace MariaDB container with RDS instance
   - Update `db_host` variable
   - Enable Multi-AZ and backups

## Additional Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [AWS Secrets Manager Guide](https://docs.aws.amazon.com/secretsmanager/)
- [Localstack Documentation](https://docs.localstack.cloud/)
- Project Documentation:
  - `terraform/README.md` - Terraform configuration details
  - `SECURITY-IMPROVEMENTS.md` - Security implementation details
  - `SECURITY.md` - General security best practices

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review `terraform/README.md`
3. Check Terraform logs: `terraform show`
4. Check Localstack logs: `docker compose logs localstack`
5. Open an issue on GitHub
