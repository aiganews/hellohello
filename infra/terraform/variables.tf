variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
  default     = "hellohello"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "github_owner" {
  description = "GitHub organization or user that owns the repository."
  type        = string
  default     = "aiganews"
}

variable "github_repo" {
  description = "GitHub repository name allowed to assume the deploy role."
  type        = string
  default     = "hellohello"
}

variable "github_branch" {
  description = "GitHub branch allowed to deploy."
  type        = string
  default     = "main"
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets that host the load balancer and NAT gateways."
  type        = list(string)
  default     = ["10.40.0.0/20", "10.40.16.0/20"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets that host ECS tasks."
  type        = list(string)
  default     = ["10.40.128.0/20", "10.40.144.0/20"]
}

variable "container_port" {
  description = "Port exposed by the HelloHello API container."
  type        = number
  default     = 8080
}

variable "container_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "container_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of ECS tasks."
  type        = number
  default     = 1
}

variable "initial_image_tag" {
  description = "Initial image tag used for the Terraform-created ECS task definition. GitHub Actions replaces this on deploy."
  type        = string
  default     = "latest"
}

variable "cors_origins" {
  description = "Comma-separated list of browser origins allowed by the API."
  type        = string
  default     = ""
}

variable "trust_proxy" {
  description = "Whether Express should trust reverse proxy headers."
  type        = bool
  default     = true
}

variable "sms_provider" {
  description = "SMS provider used for production OTP delivery. Supported values: telnyx, twilio."
  type        = string
  default     = "telnyx"

  validation {
    condition     = contains(["telnyx", "twilio"], var.sms_provider)
    error_message = "sms_provider must be either telnyx or twilio."
  }
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN. When set, the ALB serves HTTPS and redirects HTTP to HTTPS."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Optional Route53 hosted zone ID for creating an alias record."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Optional DNS name for the API, for example api.hellohello.app."
  type        = string
  default     = ""
}
