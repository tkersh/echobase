resource "aws_sqs_queue" "order_processing_queue" {
  name                       = "order-processing-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 10
  visibility_timeout_seconds = 30

  tags = {
    Environment = "localstack"
    Application = "echobase"
  }
}

resource "aws_sqs_queue" "order_processing_dlq" {
  name = "order-processing-dlq"

  tags = {
    Environment = "localstack"
    Application = "echobase"
  }
}

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
