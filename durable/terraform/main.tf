# Terraform configuration for Durable Infrastructure
# This creates persistent KMS keys and Secrets Manager secrets
# that survive blue-green deployments

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Provider configuration for LocalStack
provider "aws" {
  region = var.aws_region

  # LocalStack endpoints
  endpoints {
    secretsmanager = var.localstack_endpoint
    kms            = var.localstack_endpoint
  }

  # Disable AWS-specific features
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  # LocalStack credentials (can be anything)
  access_key = var.aws_access_key_id
  secret_key = var.aws_secret_access_key
}
