# SQS Outputs
output "sqs_queue_url" {
  value       = aws_sqs_queue.order_processing_queue.url
  description = "URL of the order processing SQS queue"
}

output "sqs_queue_arn" {
  value       = aws_sqs_queue.order_processing_queue.arn
  description = "ARN of the order processing SQS queue"
}

output "sqs_dlq_url" {
  value       = aws_sqs_queue.order_processing_dlq.url
  description = "URL of the dead letter queue"
}

output "sqs_dlq_arn" {
  value       = aws_sqs_queue.order_processing_dlq.arn
  description = "ARN of the dead letter queue"
}

# KMS Outputs (conditional - only in durable environments)
output "kms_key_id" {
  value       = length(aws_kms_key.database_encryption) > 0 ? aws_kms_key.database_encryption[0].id : "not-created-in-ephemeral-env"
  description = "ID of the KMS key for db encryption (only in durable environments)"
}

output "kms_key_arn" {
  value       = length(aws_kms_key.database_encryption) > 0 ? aws_kms_key.database_encryption[0].arn : "not-created-in-ephemeral-env"
  description = "ARN of the KMS key for db encryption (only in durable environments)"
}

# Secrets Manager Outputs (conditional - only in durable environments)
output "secret_arn" {
  value       = length(aws_secretsmanager_secret.db_credentials) > 0 ? aws_secretsmanager_secret.db_credentials[0].arn : "not-created-in-ephemeral-env"
  description = "ARN of the Secrets Manager secret containing database credentials (only in durable environments)"
  sensitive   = true
}

output "secret_name" {
  value       = length(aws_secretsmanager_secret.db_credentials) > 0 ? aws_secretsmanager_secret.db_credentials[0].name : "not-created-in-ephemeral-env"
  description = "Name of the Secrets Manager secret (only in durable environments)"
}
