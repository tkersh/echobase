terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region                      = var.aws_region
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    sqs            = var.localstack_endpoint
    cloudwatchlogs = var.localstack_endpoint
    iam            = var.localstack_endpoint
    kms            = var.localstack_endpoint
    secretsmanager = var.localstack_endpoint
  }
}
