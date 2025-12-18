# Environment configuration
variable "environment" {
  description = "Environment name (e.g., localstack, dev, staging, prod)"
  type        = string
  default     = "localstack"
}

variable "application_name" {
  description = "Application name used for resource naming and tagging"
  type        = string
  default     = "echobase"
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

# KMS configuration
variable "kms_deletion_window_days" {
  description = "Number of days before KMS key is deleted (7-30)"
  type        = number
  default     = 7

  validation {
    condition     = var.kms_deletion_window_days >= 7 && var.kms_deletion_window_days <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

# Secrets Manager configuration
variable "secrets_recovery_window_days" {
  description = "Number of days before secret is permanently deleted (7-30)"
  type        = number
  default     = 7

  validation {
    condition     = var.secrets_recovery_window_days >= 7 && var.secrets_recovery_window_days <= 30
    error_message = "Secrets Manager recovery window must be between 7 and 30 days."
  }
}

# Database configuration variables
# These are read from environment variables (TF_VAR_db_*)
# Set via .env file: export TF_VAR_db_user=$DB_USER

variable "db_host" {
  description = "Database host"
  type        = string
  default     = "mariadb"
}

variable "db_port" {
  description = "Port number for MariaDB connection (default: 3306)"
  type        = number
  default     = 3306

  validation {
    condition     = var.db_port > 0 && var.db_port <= 65535
    error_message = "Database port must be between 1 and 65535."
  }
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "orders_db"
}

variable "db_user" {
  description = "Database username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# LocalStack endpoint configuration
variable "localstack_endpoint" {
  description = "LocalStack endpoint URL for AWS services (use docker service name in CI)"
  type        = string
  default     = "http://localhost:4566"
}
