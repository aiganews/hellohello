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
| Repository agents | [AGENTS.md](AGENTS.md) |

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
