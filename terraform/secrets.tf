# Secrets Manager secret for database credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "echobase/database/credentials"
  description             = "Database credentials for MariaDB instance"
  kms_key_id              = aws_kms_key.database_encryption.id
  recovery_window_in_days = 7

  tags = {
    Name        = "echobase-db-credentials"
    Environment = "localstack"
    Application = "echobase"
    ManagedBy   = "terraform"
    Purpose     = "Database credentials encrypted with KMS"
  }
}

# Store the database credentials in Secrets Manager
# In localstack, MariaDB runs in a docker container
# These credentials match the .env file configuration
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "orderuser"
    password = "Sk9NwvzVdqbiV0cNJF8ALBESKCGCbIjh"
    engine   = "mariadb"
    host     = "mariadb"
    port     = 3306
    dbname   = "orders_db"
  })
}

# IAM policy for accessing the secret
resource "aws_iam_policy" "db_secret_access" {
  name        = "echobase-db-secret-access"
  description = "Policy to allow access to database credentials in Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.db_credentials.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.database_encryption.arn
      }
    ]
  })

  tags = {
    Name        = "echobase-db-secret-access"
    Environment = "localstack"
    Application = "echobase"
    ManagedBy   = "terraform"
  }
}

# Outputs
output "secret_arn" {
  value       = aws_secretsmanager_secret.db_credentials.arn
  description = "ARN of the Secrets Manager secret containing database credentials"
  sensitive   = true
}

output "secret_name" {
  value       = aws_secretsmanager_secret.db_credentials.name
  description = "Name of the Secrets Manager secret"
}
