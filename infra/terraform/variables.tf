variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "recon"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-southeast-2"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "recon"
}

variable "db_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "recon"
}

variable "domain_name" {
  description = "Domain name for SES identity"
  type        = string
}

variable "ses_from_email" {
  description = "From email address for SES"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for security groups and networking"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for RDS and Lambda"
  type        = list(string)
}
