# KMS key for encrypting database secrets
# This key persists across blue-green deployments
resource "aws_kms_key" "database_encryption" {
  description             = "KMS key for database secrets encryption (durable)"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  tags = {
    Name        = "echobase-db-kms-key"
    Purpose     = "Database secrets encryption"
    Environment = var.environment
    Tier        = "durable"
  }
}

resource "aws_kms_alias" "database_encryption" {
  name          = "alias/echobase-db"
  target_key_id = aws_kms_key.database_encryption.key_id
}
