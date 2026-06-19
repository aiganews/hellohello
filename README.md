# HelloHello — International Calling Platform

Boss Revolution–style prepaid international calling app with multi-carrier routing.

## Documentation

| Document | Path |
|----------|------|
| System design | [docs/system-design.md](docs/system-design.md) |
| OpenAPI spec | [docs/api/openapi.yaml](docs/api/openapi.yaml) |
| Telnyx telephony integration | [docs/telephony/telnyx-integration.md](docs/telephony/telnyx-integration.md) |
| Database migrations | [docs/database/migrations/001_initial_schema.sql](docs/database/migrations/001_initial_schema.sql) |
| 12-week MVP sprint plan | [docs/sprint-plan.md](docs/sprint-plan.md) |

## Initial corridors

- US/EU → Ethiopia (`+251`)
- US/EU → Kenya (`+254`)

## Tech stack (MVP)

- **Mobile:** Flutter
- **Backend:** Node.js (NestJS) or Java (Spring Boot)
- **Database:** PostgreSQL + Redis
- **Telephony:** Telnyx (MVP) → multi-carrier SIP at scale
- **Payments:** Stripe (+ M-PESA / telebirr in phase 2)

## Local API implementation

This workspace now includes a Node.js Express API implementation for the HelloHello backend.

Run locally:

```bash
cd /Users/yemaneweleslasea/projects/hellohello
npm install
npm test
npm run dev
```

The server listens on `http://localhost:8080`.

For production-style startup, use:

```bash
npm start
```

Stripe configuration should be provided through environment variables or a secret manager before using payment routes.

Do not commit real secret keys into source control.

Swagger UI is available at:

```bash
http://localhost:8080/swagger
```

Raw OpenAPI YAML can be fetched from:

```bash
http://localhost:8080/openapi.yaml
```

CI / Deployment secrets
----------------------

To enable automated deploys from GitHub Actions you must add the following repository secrets in your GitHub repository settings (Settings → Secrets → Actions):

- `AWS_ACCESS_KEY_ID` — AWS IAM user access key with permissions to push to ECR and update ECS services.
- `AWS_SECRET_ACCESS_KEY` — The corresponding secret access key.
- `AWS_REGION` — e.g. `us-east-1`.
- `AWS_ACCOUNT_ID` — Your AWS account ID (numeric).
- `AWS_ECS_CLUSTER_NAME` — The ECS cluster name to update (e.g. `hellohello-cluster`).
- `AWS_ECS_SERVICE_NAME` — The ECS service name to force a new deployment (e.g. `hellohello-api-service`).

Once these are configured the CI workflow will build the Docker image, push it to ECR, and trigger a new ECS deployment on merges to `main`.
