# Secrets Manager secret for database credentials
# This secret persists across blue-green deployments
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "echobase/database/credentials"
  description             = "Database credentials for MariaDB instance (durable)"
  kms_key_id              = aws_kms_key.database_encryption.id
  recovery_window_in_days = var.secrets_recovery_window_days

  tags = {
    Name        = "echobase-db-credentials"
    Purpose     = "Database credentials encrypted with KMS"
    Environment = var.environment
    Tier        = "durable"
  }
}

# Store the database credentials in Secrets Manager
# Credentials are read from the durable MariaDB container
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username      = var.db_user
    password      = var.db_password
    root_password = var.db_root_password
    engine        = "mariadb"
    host          = var.db_host
    port          = var.db_port
    dbname        = var.db_name
  })
}

# Secrets Manager secret for MariaDB data-at-rest encryption key
# This key is used by MariaDB's file_key_management plugin
resource "aws_secretsmanager_secret" "db_encryption_key" {
  name                    = "echobase/database/encryption-key"
  description             = "MariaDB data-at-rest encryption key (durable)"
  kms_key_id              = aws_kms_key.database_encryption.id
  recovery_window_in_days = var.secrets_recovery_window_days

  tags = {
    Name        = "echobase-db-encryption-key"
    Purpose     = "MariaDB data-at-rest encryption"
    Environment = var.environment
    Tier        = "durable"
  }
}

# Store the encryption key in Secrets Manager
resource "aws_secretsmanager_secret_version" "db_encryption_key" {
  secret_id = aws_secretsmanager_secret.db_encryption_key.id
  secret_string = jsonencode({
    key_id  = 1
    key_hex = var.db_encryption_key
  })
}
