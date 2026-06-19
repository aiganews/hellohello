# AWS Deployment Guide

## Overview

HelloHello deploys to AWS with Terraform-managed infrastructure and GitHub Actions continuous deployment.

Terraform provisions:

- VPC with public and private subnets
- Internet gateway, NAT gateways, and route tables
- Application Load Balancer
- ECS/Fargate cluster, service, task definition, and security groups
- ECR repository
- CloudWatch log group
- Secrets Manager secret metadata
- GitHub Actions OIDC IAM role for deployment
- Optional Route53 alias record and HTTPS listener

GitHub Actions deploys:

1. `CI` runs tests on `main`.
2. `Deploy` starts only after `CI` succeeds.
3. The workflow assumes the Terraform-created AWS role through GitHub OIDC.
4. The workflow builds and pushes a Docker image to ECR.
5. The workflow updates the ECS service with the new image.

## Prerequisites

- AWS CLI authenticated with permission to create Terraform resources.
- Terraform `>= 1.6`.
- GitHub repository admin access for adding repository variables.
- A MongoDB connection string for production.
- Optional: ACM certificate and Route53 hosted zone for HTTPS/domain access.

## Provision infrastructure

From the repository root:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

The default production names match the existing HelloHello deployment names:

- ECR repository: `hellohello-api`
- ECS cluster: `hellohello-cluster`
- ECS service: `hellohello-api-service`
- ECS task definition family: `hellohello-api-task`
- ECS container name: `hellohello-api`

## Runtime secrets

Terraform creates the secret metadata but does not write secret values, because Terraform state should not contain runtime credentials.

Populate the secret after `terraform apply`:

```bash
aws secretsmanager put-secret-value \
  --region "$(terraform output -raw aws_region)" \
  --secret-id "$(terraform output -raw secrets_manager_secret_name)" \
  --secret-string '{
    "MONGODB_URI": "mongodb+srv://user:url-encoded-password@example.mongodb.net/hellohello?retryWrites=true&w=majority",
    "ACCESS_TOKEN_SECRET": "replace-with-strong-random-value",
    "REFRESH_TOKEN_SECRET": "replace-with-strong-random-value",
    "ADMIN_PHONE": "+251900642936",
    "OTP_HASH_SECRET": "replace-with-strong-random-value",
    "TELNYX_API_KEY": "replace-with-telnyx-api-key",
    "TELNYX_FROM_NUMBER": "+12065550100",
    "TELNYX_MESSAGING_PROFILE_ID": "",
    "TWILIO_ACCOUNT_SID": "",
    "TWILIO_AUTH_TOKEN": "",
    "TWILIO_FROM_NUMBER": "",
    "TWILIO_MESSAGING_SERVICE_SID": "",
    "TWILIO_WHATSAPP_FROM": "",
    "TWILIO_WHATSAPP_CONTENT_SID": "",
    "TWILIO_WHATSAPP_STATUS_CALLBACK_URL": "https://timberwolf-mastiff-9776.twil.io/hellohello-callback"
  }'
```

Use real production values. Do not commit them.

For Telnyx, set `sms_provider = "telnyx"` in `terraform.tfvars` and provide `TELNYX_API_KEY` plus either `TELNYX_FROM_NUMBER` or `TELNYX_MESSAGING_PROFILE_ID`. `TELNYX_FROM_NUMBER` must be an SMS-enabled E.164 number.

For Twilio SMS, set `sms_provider = "twilio"` in `terraform.tfvars` and provide `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`. Twilio Account SIDs start with `AC`; Messaging Service SIDs start with `MG`.

For Twilio WhatsApp template OTP, provide `TWILIO_FROM_NUMBER` such as `+14155238886` or `TWILIO_WHATSAPP_FROM` such as `whatsapp:+14155238886`, plus `TWILIO_WHATSAPP_CONTENT_SID` such as `HX...`. The app sends `ContentVariables` with the generated OTP as variable `1`; when `TWILIO_FROM_NUMBER` is used, the app automatically adds the `whatsapp:` prefix.

In Twilio Console, configure the WhatsApp Sandbox endpoints with `POST`:

| Sandbox field | URL |
|---------------|-----|
| When a message comes in | `https://timberwolf-mastiff-9776.twil.io/hellohello-reply` |
| Status callback URL | `https://timberwolf-mastiff-9776.twil.io/hellohello-callback` |

For Sandbox testing, the recipient must join by sending `join sort-behavior` from WhatsApp to `+1 415 523 8886`. The expected participant for the current test number is `whatsapp:+12065366291`.

`TWILIO_WHATSAPP_STATUS_CALLBACK_URL` maps to the outbound status callback URL. It is not a substitute for the Sandbox inbound reply URL.

## Configure GitHub Actions CD

Add these repository variables in GitHub:

| Variable | Value |
|----------|-------|
| `AWS_REGION` | `terraform output -raw aws_region` |
| `AWS_ROLE_TO_ASSUME` | `terraform output -raw github_actions_deploy_role_arn` |
| `ECR_REPOSITORY` | `terraform output -raw ecr_repository_name` |
| `ECS_CLUSTER` | `terraform output -raw ecs_cluster_name` |
| `ECS_SERVICE` | `terraform output -raw ecs_service_name` |
| `ECS_TASK_DEFINITION_FAMILY` | `terraform output -raw ecs_task_definition_family` |
| `ECS_CONTAINER_NAME` | `terraform output -raw ecs_container_name` |

The deploy workflow is `.github/workflows/deploy.yml`.

It runs automatically after `CI` succeeds on `main`. You can also run it manually from GitHub Actions with **Run workflow**.

## Access the API in a web browser

After Terraform and the first deploy complete, open:

```bash
terraform output -raw health_url
terraform output -raw swagger_url
```

Without a custom domain, the URLs use the public Application Load Balancer DNS name:

```text
http://<alb-dns-name>/health
http://<alb-dns-name>/swagger
http://<alb-dns-name>/openapi.yaml
```

With `certificate_arn`, `hosted_zone_id`, and `domain_name` set in `terraform.tfvars`, Terraform creates HTTPS access:

```text
https://api.hellohello.app/health
https://api.hellohello.app/swagger
https://api.hellohello.app/openapi.yaml
```

## Optional HTTPS and domain configuration

1. Create or import an ACM certificate in the same region as the ALB.
2. Set these values in `infra/terraform/terraform.tfvars`:

```hcl
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
hosted_zone_id  = "Z..."
domain_name     = "api.hellohello.app"
```

3. Run:

```bash
terraform plan
terraform apply
```

Terraform will redirect HTTP to HTTPS when a certificate is configured.

## Health endpoints

- `/health` returns service status and is used by the load balancer.
- `/ready` checks database readiness.

## Legacy task definition

`ecs-task-def.json` is retained as a reference artifact. The active deployment path uses Terraform and the task definition managed in `infra/terraform`.
