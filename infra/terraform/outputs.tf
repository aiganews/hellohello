output "aws_account_id" {
  description = "AWS account ID where the stack is deployed."
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS region where the stack is deployed."
  value       = var.aws_region
}

output "ecr_repository_name" {
  description = "ECR repository name used by the deployment workflow."
  value       = aws_ecr_repository.api.name
}

output "ecr_repository_url" {
  description = "ECR repository URL used by the deployment workflow."
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name used by the deployment workflow."
  value       = aws_ecs_cluster.api.name
}

output "ecs_service_name" {
  description = "ECS service name used by the deployment workflow."
  value       = aws_ecs_service.api.name
}

output "ecs_task_definition_family" {
  description = "ECS task definition family used by the deployment workflow."
  value       = aws_ecs_task_definition.api.family
}

output "ecs_container_name" {
  description = "ECS container name used by the deployment workflow."
  value       = local.container_name
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN to store in the GitHub AWS_ROLE_TO_ASSUME repository variable."
  value       = aws_iam_role.github_deploy.arn
}

output "load_balancer_dns_name" {
  description = "Public DNS name for direct browser access to the API."
  value       = aws_lb.api.dns_name
}

output "application_url" {
  description = "Preferred browser URL for the deployed API."
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.api.dns_name}"
}

output "health_url" {
  description = "Health check URL for browser or curl verification."
  value       = var.domain_name != "" ? "https://${var.domain_name}/health" : "http://${aws_lb.api.dns_name}/health"
}

output "swagger_url" {
  description = "Swagger UI URL for browser access."
  value       = var.domain_name != "" ? "https://${var.domain_name}/swagger" : "http://${aws_lb.api.dns_name}/swagger"
}

output "secrets_manager_secret_name" {
  description = "Secrets Manager secret name to populate with runtime JSON values."
  value       = aws_secretsmanager_secret.app.name
}

output "secrets_manager_secret_arn" {
  description = "Secrets Manager secret ARN referenced by ECS task secrets."
  value       = aws_secretsmanager_secret.app.arn
}
