# KMS key for encrypting database secrets and RDS encryption at rest
resource "aws_kms_key" "database_encryption" {
  description             = "KMS key for database secrets encryption and RDS encryption at rest"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name        = "echobase-database-kms-key"
    Environment = "localstack"
    Application = "echobase"
    ManagedBy   = "terraform"
    Purpose     = "Database secrets and RDS encryption"
  }
}

resource "aws_kms_alias" "database_encryption" {
  name          = "alias/echobase-database"
  target_key_id = aws_kms_key.database_encryption.key_id
}

output "kms_key_id" {
  value       = aws_kms_key.database_encryption.id
  description = "ID of the KMS key for database encryption"
}

output "kms_key_arn" {
  value       = aws_kms_key.database_encryption.arn
  description = "ARN of the KMS key for database encryption"
}
