# KMS key for encrypting db secrets and RDS encryption at rest
resource "aws_kms_key" "database_encryption" {
  description             = "KMS key for db secrets encryption and RDS encryption at rest"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "echobase-db-kms-key"
      Purpose = "DB secrets and RDS encryption"
    }
  )
}

resource "aws_kms_alias" "database_encryption" {
  name          = "alias/echobase-db"
  target_key_id = aws_kms_key.database_encryption.key_id
}
