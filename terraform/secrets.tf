# Secrets Manager secret for database credentials
# Only create in durable environments (dev-local, ci)
# Green/blue ephemeral environments should NOT create secrets - they read from durable LocalStack
resource "aws_secretsmanager_secret" "db_credentials" {
  count = contains(["dev-local", "ci"], var.environment) ? 1 : 0

  name                    = "echobase/database/credentials"
  description             = "Database credentials for MariaDB instance"
  kms_key_id              = aws_kms_key.database_encryption[0].id
  recovery_window_in_days = var.secrets_recovery_window_days

  tags = merge(
    local.common_tags,
    {
      Name    = "echobase-db-credentials"
      Purpose = "Database credentials encrypted with KMS"
    }
  )
}

# Store the database credentials in Secrets Manager
# Credentials are read from environment variables (set in .env file)
# This avoids hardcoding sensitive values in Terraform code
# Only create in durable environments (dev-local, ci)
resource "aws_secretsmanager_secret_version" "db_credentials" {
  count = contains(["dev-local", "ci"], var.environment) ? 1 : 0

  secret_id = aws_secretsmanager_secret.db_credentials[0].id
  secret_string = jsonencode({
    username = var.db_user
    password = var.db_password
    engine   = "mariadb"
    host     = var.db_host
    port     = var.db_port
    dbname   = var.db_name
  })
}
