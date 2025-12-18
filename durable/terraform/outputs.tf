# Outputs for Durable Infrastructure Terraform

output "kms_key_id" {
  description = "ID of the KMS key for database encryption"
  value       = aws_kms_key.database_encryption.id
}

output "kms_key_arn" {
  description = "ARN of the KMS key for database encryption"
  value       = aws_kms_key.database_encryption.arn
}

output "secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "secret_name" {
  description = "Name of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.name
}
