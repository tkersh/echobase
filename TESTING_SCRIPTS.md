# Testing Setup and Teardown Scripts

This document describes how to test the `setup.sh` and `teardown.sh` scripts with the new Terraform variable methodology.

## Prerequisites

Before testing, ensure you have:

1. **Docker** installed and running
2. **Terraform** installed (v1.0+)
3. **Credentials generated**: Run `./generate-credentials.sh` first

## Test Scenario 1: Fresh Setup

Starting from a clean state:

```bash
# 1. Ensure clean state
docker-compose down -v
rm -rf terraform/.terraform terraform/terraform.tfstate*

# 2. Generate credentials (if not already done)
./generate-credentials.sh

# 3. Run setup script
./setup.sh
```

**Expected Results:**
- ✅ Docker containers start successfully
- ✅ Terraform initializes without errors
- ✅ Message: "Loading database credentials from .env file..."
- ✅ Terraform creates 7 resources (KMS, Secrets, SQS, IAM)
- ✅ No "No value for required variable" errors
- ✅ Services connect to database successfully

**Verification:**
```bash
# Check Terraform state
cd terraform
terraform state list

# Should show:
# - aws_kms_key.database_encryption
# - aws_kms_alias.database_encryption
# - aws_secretsmanager_secret.db_credentials
# - aws_secretsmanager_secret_version.db_credentials
# - aws_iam_policy.db_secret_access
# - aws_sqs_queue.order_processing_queue
# - aws_sqs_queue.order_processing_dlq

# Check secret in Localstack
cd ..
docker exec echobase-localstack-1 awslocal secretsmanager list-secrets

# Check services are healthy
docker-compose ps
curl -k https://localhost:3001/health
```

## Test Scenario 2: Teardown

Testing the teardown script:

```bash
# 1. Run teardown script
./teardown.sh
```

**Expected Results:**
- ✅ Script detects Localstack is running
- ✅ Message: "Loading database credentials from .env file..."
- ✅ Terraform destroys all 7 resources
- ✅ Docker containers stop
- ✅ Prompt for volume removal (y/N)
- ✅ No errors about missing variables

**Verification:**
```bash
# Terraform state should be empty
cd terraform
terraform state list  # Should return nothing

# Containers should be stopped
docker-compose ps  # Should show no running containers

# If volumes removed, this should return nothing
docker volume ls | grep echobase
```

## Test Scenario 3: Teardown Without .env File

Testing graceful handling when `.env` is missing:

```bash
# 1. Backup .env file
mv .env .env.backup

# 2. Try to run teardown
./teardown.sh
```

**Expected Results:**
- ✅ Warning message: ".env file not found - using default values"
- ✅ Terraform destroy proceeds with default values
- ⚠️ May fail if actual credentials differ from defaults (this is expected)

```bash
# Restore .env
mv .env.backup .env
```

## Test Scenario 4: Setup Without .env File

Testing that setup requires `.env` file:

```bash
# 1. Backup .env file
mv .env .env.backup

# 2. Try to run setup
./setup.sh
```

**Expected Results:**
- ❌ Error message: "Warning: .env file not found!"
- ❌ Error message: "Please run ./generate-credentials.sh first."
- ❌ Script exits with error code 1
- ✅ Terraform is NOT applied (fails fast)

```bash
# Restore .env
mv .env.backup .env
```

## Test Scenario 5: Credential Rotation

Testing credential update workflow:

```bash
# 1. Start with working system
./setup.sh

# 2. Update password in .env
sed -i.bak 's/DB_PASSWORD=.*/DB_PASSWORD=NewPassword123ABC/' .env

# 3. Re-apply Terraform (updates Secrets Manager)
cd terraform
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
terraform apply -auto-approve
cd ..

# 4. Update MariaDB password (in production, this would be automatic)
docker exec echobase-mariadb-1 mariadb -u root -p$MYSQL_ROOT_PASSWORD \
  -e "ALTER USER '$DB_USER'@'%' IDENTIFIED BY 'NewPassword123ABC';"

# 5. Restart services to pick up new credentials
docker-compose restart api-gateway order-processor

# 6. Verify services connect with new password
docker-compose logs api-gateway | grep "Connected to RDS"
docker-compose logs order-processor | grep "Connected to RDS"
```

**Expected Results:**
- ✅ Terraform updates secret version
- ✅ Services restart successfully
- ✅ Services retrieve new password from Secrets Manager
- ✅ Database connections succeed with new password

```bash
# Restore original password
mv .env.bak .env
```

## Test Scenario 6: Manual Terraform Operations

Testing manual Terraform workflow:

```bash
# 1. Navigate to terraform directory
cd terraform

# 2. Export variables
source ../.env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME

# 3. Test plan
terraform plan

# 4. Test apply
terraform apply -auto-approve

# 5. Test destroy
terraform destroy -auto-approve

cd ..
```

**Expected Results:**
- ✅ `terraform plan` shows no errors
- ✅ No "No value for required variable" errors
- ✅ All operations complete successfully

## Test Scenario 7: Full Cycle Test

Complete end-to-end test:

```bash
# 1. Clean slate
docker-compose down -v
rm -rf terraform/.terraform terraform/terraform.tfstate*

# 2. Generate credentials
./generate-credentials.sh

# 3. Setup
./setup.sh

# 4. Verify system works
curl -k https://localhost:3443/health
curl -k https://localhost:3001/health

# 5. Teardown
./teardown.sh
```

**Expected Results:**
- ✅ All steps complete without errors
- ✅ Services are healthy after setup
- ✅ Clean teardown with no orphaned resources

## Common Issues and Solutions

### Issue: "No value for required variable"

**Cause:** Terraform variables not exported

**Solution:**
```bash
source .env
export TF_VAR_db_user=$DB_USER
export TF_VAR_db_password=$DB_PASSWORD
export TF_VAR_db_host=$DB_HOST
export TF_VAR_db_port=$DB_PORT
export TF_VAR_db_name=$DB_NAME
```

### Issue: "Error acquiring state lock"

**Cause:** Previous Terraform run was interrupted

**Solution:**
```bash
cd terraform
terraform force-unlock <LOCK_ID>
cd ..
```

### Issue: Terraform destroy fails with connection refused

**Cause:** Localstack stopped before running destroy

**Solution:**
```bash
# Start Localstack
docker-compose up -d localstack

# Wait for it to be ready
sleep 10

# Then run teardown
./teardown.sh
```

### Issue: Services can't connect to database after credential rotation

**Cause:** Services cached old credentials or password mismatch

**Solution:**
```bash
# Verify secret has correct password
docker exec echobase-localstack-1 awslocal secretsmanager get-secret-value \
  --secret-id echobase/database/credentials

# Restart services
docker-compose restart api-gateway order-processor

# Check logs
docker-compose logs api-gateway order-processor
```

## Performance Benchmarks

Expected timing for operations:

| Operation | Expected Time |
|-----------|---------------|
| `generate-credentials.sh` | 2-5 seconds |
| `setup.sh` (first run) | 60-90 seconds |
| `setup.sh` (subsequent) | 30-45 seconds |
| `teardown.sh` | 20-30 seconds |
| Terraform apply | 25-35 seconds |
| Terraform destroy | 25-35 seconds |

## Automated Testing Script

Create a test script to automate all scenarios:

```bash
#!/bin/bash
# test-scripts.sh - Automated testing of setup/teardown scripts

set -e

echo "=== Echobase Script Testing ==="
echo ""

# Test 1: Fresh setup
echo "Test 1: Fresh setup"
docker-compose down -v 2>/dev/null || true
rm -rf terraform/.terraform terraform/terraform.tfstate* 2>/dev/null || true
./setup.sh
echo "✓ Test 1 passed"
echo ""

# Test 2: Teardown
echo "Test 2: Teardown"
./teardown.sh <<< "n"  # Don't remove volumes
echo "✓ Test 2 passed"
echo ""

# Test 3: Re-setup (faster path)
echo "Test 3: Re-setup"
./setup.sh
echo "✓ Test 3 passed"
echo ""

# Test 4: Health checks
echo "Test 4: Health checks"
curl -k -f https://localhost:3001/health
curl -k -f https://localhost:3443/health
echo "✓ Test 4 passed"
echo ""

# Test 5: Final teardown
echo "Test 5: Final teardown"
./teardown.sh <<< "y"  # Remove volumes
echo "✓ Test 5 passed"
echo ""

echo "=== All tests passed ==="
```

## Checklist

Before committing changes, verify:

- [ ] `setup.sh` exports all 5 Terraform variables
- [ ] `teardown.sh` exports all 5 Terraform variables
- [ ] `setup.sh` exits with error if `.env` missing
- [ ] `teardown.sh` uses defaults if `.env` missing
- [ ] Both scripts have executable permissions
- [ ] Variables are loaded from `.env` file (not hardcoded)
- [ ] No passwords visible in script output
- [ ] Terraform state lists all expected resources after apply
- [ ] Terraform state is empty after destroy
- [ ] Services connect successfully after setup
- [ ] No orphaned resources after teardown

## Related Documentation

- `terraform/README.md` - Terraform configuration details
- `docs/TERRAFORM_USAGE.md` - Complete Terraform usage guide
- `SECURITY-IMPROVEMENTS.md` - Security implementation details
- `README.md` - Main project documentation
