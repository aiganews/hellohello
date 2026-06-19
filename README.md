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

For a production-style local run without external services, use:

```bash
npm ci
npm run start:local:prod
```

For the closest local production setup, run the production Docker image with MongoDB:

```bash
npm run docker:local:prod
```

Then open:

```text
http://localhost:8080/health
http://localhost:8080/swagger
http://localhost:8080/openapi.yaml
```

To send real OTP SMS from the production-style local run, provide Telnyx SMS credentials before requesting `/v1/auth/otp/request`:

```bash
export TELNYX_API_KEY=your-telnyx-api-key
export TELNYX_FROM_NUMBER=+12065550100
npm run start:local:prod
```

Or use Twilio:

```bash
export SMS_PROVIDER=twilio
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_AUTH_TOKEN=your-rotated-twilio-auth-token
export TWILIO_FROM_NUMBER=+12065550100
npm run start:local:prod
```

The app sends the equivalent of Twilio's `Messages.json` API call with `To` set from `phoneE164`, `From` set from `TWILIO_FROM_NUMBER`, and `Body` set to the generated OTP message. The OTP is generated per request and sent to the `phoneE164` mobile number submitted in Swagger or the API request.

The verify request can use the `requestId` field directly, or pass the full OTP request response as `otpRequestResponse`. Verification still requires the six-digit code received by SMS.

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
