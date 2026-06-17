# AWS Deployment Guide

## Overview
This guide covers deploying the HelloHello API to AWS ECS/Fargate using ECR and Secrets Manager.

## Prerequisites
- AWS CLI configured with `us-east-1`
- Docker installed
- AWS account ID: `218549830323`
- GitHub repository with secrets configured

## Local setup
1. Copy `.env.example` to `.env`.
2. Set local values for `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `ADMIN_PHONE`.
3. For production, set `USE_IN_MEMORY_MONGO=false` and `MONGODB_URI`.

## Build and push Docker image
```bash
docker build -t hellohello-api:latest .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 218549830323.dkr.ecr.us-east-1.amazonaws.com
docker tag hellohello-api:latest 218549830323.dkr.ecr.us-east-1.amazonaws.com/hellohello-api:latest
docker push 218549830323.dkr.ecr.us-east-1.amazonaws.com/hellohello-api:latest
```

## ECS setup
1. Create ECS cluster:
```bash
aws ecs create-cluster --cluster-name hellohello-cluster --region us-east-1
```
2. Register task definition:
```bash
aws ecs register-task-definition --cli-input-json file://ecs-task-def.json
```
3. Create service with ALB and network config.

## Secrets Manager
Create secret `hellohello/secrets` with JSON keys:
- `MONGODB_URI`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ADMIN_PHONE`

## GitHub Actions
The workflow in `.github/workflows/ci.yml` runs tests, builds the Docker image, pushes it to ECR, and updates the ECS service.

## Health endpoints
- `/health` returns service status
- `/ready` checks database readiness
