# SQS queues use default SSE-SQS encryption (AWS managed keys)
# This is simpler and works in all environments (durable and ephemeral)
# KMS is reserved for database secrets only
resource "aws_sqs_queue" "order_processing_queue" {
  name                       = "order-processing-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 10
  visibility_timeout_seconds = 30
  # Use default SQS encryption (SSE-SQS) - no KMS key needed
  sqs_managed_sse_enabled = true

  tags = merge(
    local.common_tags,
    {
      Name    = "order-processing-queue"
      Purpose = "Main queue for order processing"
    }
  )
}

resource "aws_sqs_queue" "order_processing_dlq" {
  name                      = "order-processing-dlq"
  message_retention_seconds = 1209600 # 14 days - longer retention for DLQ
  # Use default SQS encryption (SSE-SQS) - no KMS key needed
  sqs_managed_sse_enabled = true

  tags = merge(
    local.common_tags,
    {
      Name    = "order-processing-dlq"
      Purpose = "Dead letter queue for failed order messages"
    }
  )
}
