# Input variables for Durable Infrastructure Terraform

variable "aws_region" {
  description = "AWS region (for LocalStack compatibility)"
  type        = string
  default     = "us-east-1"
}

variable "aws_access_key_id" {
  description = "AWS Access Key ID (for LocalStack)"
  type        = string
}

variable "aws_secret_access_key" {
  description = "AWS Secret Access Key (for LocalStack)"
  type        = string
  sensitive   = true
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint URL"
  type        = string
}

variable "db_user" {
  description = "Database username"
  type        = string
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_host" {
  description = "Database host"
  type        = string
}

variable "db_port" {
  description = "Database port"
  type        = number
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "kms_deletion_window_days" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 7
}

variable "secrets_recovery_window_days" {
  description = "Secrets Manager recovery window in days"
  type        = number
  default     = 7
}

variable "environment" {
  description = "Environment name (dev-local or ci)"
  type        = string
}
