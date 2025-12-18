# KMS key for encrypting database secrets in Secrets Manager
# Only create in durable environments (dev-local, ci)
# Note: SQS queues use SSE-SQS (AWS managed encryption), not KMS
resource "aws_kms_key" "database_encryption" {
  count = contains(["dev-local", "ci"], var.environment) ? 1 : 0

  description             = "KMS key for database secrets encryption in Secrets Manager"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "echobase-database-secrets-kms"
      Purpose = "Encrypt database credentials in Secrets Manager"
    }
  )
}

resource "aws_kms_alias" "database_encryption" {
  count = contains(["dev-local", "ci"], var.environment) ? 1 : 0

  name          = "alias/echobase-db"
  target_key_id = aws_kms_key.database_encryption[0].key_id
}
