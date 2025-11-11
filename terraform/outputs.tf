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

# KMS Outputs
output "kms_key_id" {
  value       = aws_kms_key.database_encryption.id
  description = "ID of the KMS key for db encryption"
}

output "kms_key_arn" {
  value       = aws_kms_key.database_encryption.arn
  description = "ARN of the KMS key for db encryption"
}

# Secrets Manager Outputs
output "secret_arn" {
  value       = aws_secretsmanager_secret.db_credentials.arn
  description = "ARN of the Secrets Manager secret containing database credentials"
  sensitive   = true
}

output "secret_name" {
  value       = aws_secretsmanager_secret.db_credentials.name
  description = "Name of the Secrets Manager secret"
}
