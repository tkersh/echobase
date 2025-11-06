# Database configuration variables
# These are read from environment variables (TF_VAR_db_*)
# Set via .env file: export TF_VAR_db_user=$DB_USER

variable "db_host" {
  description = "Database host"
  type        = string
  default     = "mariadb"
}

variable "db_port" {
  description = "Database port"
  type        = number
  default     = 3306
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
