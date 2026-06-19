# HelloHello Terraform Stack

This stack provisions the AWS infrastructure needed to run the HelloHello API on ECS/Fargate and deploy it from GitHub Actions.

## Quick start

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

After apply, populate the Secrets Manager secret and copy the output values into GitHub repository variables as described in `../../docs/aws-deploy.md`.

## Browser access

Use these outputs after the first successful deployment:

```bash
terraform output -raw health_url
terraform output -raw swagger_url
```

If no ACM certificate and domain are configured, the outputs use the public Application Load Balancer DNS name over HTTP. If `certificate_arn`, `hosted_zone_id`, and `domain_name` are configured, the outputs use HTTPS.

## Secret handling

Terraform creates the Secrets Manager secret metadata only. Runtime secret values must be written outside Terraform to avoid storing credentials in Terraform state.
