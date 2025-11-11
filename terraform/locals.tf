# Local values for use across all resources
locals {
  # Common tags applied to all resources
  common_tags = {
    Environment = var.environment
    Application = var.application_name
    ManagedBy   = "terraform"
  }
}
