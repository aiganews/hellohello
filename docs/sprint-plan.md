# 12-Week MVP Sprint Plan

**Product:** HelloHello — prepaid international calling  
**Goal:** Ship a working MVP for US/EU → Ethiopia (+251) and Kenya (+254) corridors  
**Team assumption:** 2 backend, 1 mobile, 1 part-time DevOps/QA

---

## Milestones

| Milestone | Week | Deliverable |
|-----------|------|-------------|
| M1 — Foundation | 2 | Auth, wallet schema, CI/CD |
| M2 — Money in | 4 | Stripe top-up + balance |
| M3 — First call | 6 | End-to-end call via Telnyx |
| M4 — Billing | 8 | CDR billing + call history |
| M5 — MVP hardening | 10 | Fraud, monitoring, staging |
| M6 — Beta launch | 12 | TestFlight/Play internal beta |

---

## Sprint 1 (Week 1–2) — Foundation

**Theme:** Project setup, core schema, auth skeleton

### Backend
- [ ] Repo setup (monorepo or services layout)
- [ ] PostgreSQL + Redis via Docker Compose
- [ ] Run migration `001_initial_schema.sql`
- [ ] API gateway / NestJS project scaffold
- [ ] Health check endpoints
- [ ] Structured logging + correlation IDs

### Auth
- [ ] `POST /auth/otp/request` (SMS provider integration)
- [ ] `POST /auth/otp/verify` (JWT issue)
- [ ] User + wallet auto-create on first login
- [ ] Refresh token flow

### Mobile
- [ ] Flutter project scaffold
- [ ] Navigation shell (Login, Home, Dialer, Wallet, History)
- [ ] Secure token storage

### DevOps
- [ ] GitHub Actions: lint, test, build
- [ ] Staging AWS account skeleton (RDS, ECS)

**Exit criteria:** User can sign up with OTP and see empty wallet.

---

## Sprint 2 (Week 3–4) — Wallet & Top-up

**Theme:** Money in the door

### Backend
- [ ] Wallet service (double-entry ledger)
- [ ] `GET /wallet`, `GET /wallet/transactions`
- [ ] Stripe Checkout session creation
- [ ] Stripe webhook handler (idempotent credit)
- [ ] `POST /topups`, `GET /topups/{id}`

### Rating
- [ ] `GET /rates/lookup?number=`
- [ ] `GET /rates/countries`
- [ ] Prefix matching logic (longest prefix wins)
- [ ] Seed rates for +251, +254, +1

### Mobile
- [ ] Wallet balance screen
- [ ] Top-up flow (Stripe in-app browser / webview)
- [ ] Rate preview on dial pad input

### QA
- [ ] Test top-up $10 → balance increases
- [ ] Duplicate webhook does not double-credit

**Exit criteria:** User can add funds and see rate for a +251 number.

---

## Sprint 3 (Week 5–6) — Telephony MVP

**Theme:** First real call

### Backend
- [ ] Telnyx account + connection setup
- [ ] Call orchestrator service
- [ ] `POST /calls` — originate PSTN leg
- [ ] WebRTC credential token issuance
- [ ] Wallet hold on call start
- [ ] `POST /webhooks/telnyx` — handle initiated/answered/hangup
- [ ] `GET /calls/{id}`, `POST /calls/{id}/hangup`

### Mobile
- [ ] Integrate Telnyx WebRTC SDK (or SIP)
- [ ] Call UI (dialing, in-call, hang up)
- [ ] Connect to `POST /calls` before dial

### Telephony
- [ ] Configure webhook URL in Telnyx portal
- [ ] Test calls to +251 and +254 test numbers
- [ ] Document runbook for failed originate

**Exit criteria:** User completes a real answered call from app to mobile phone.

---

## Sprint 4 (Week 7–8) — Billing & History

**Theme:** Accurate charging

### Backend
- [ ] Billing engine (increment rules, capture/release hold)
- [ ] CDR storage (`cdrs` table)
- [ ] `GET /calls` history with pagination
- [ ] Unanswered/busy = no charge logic
- [ ] Daily reconciliation job (internal vs Telnyx)

### Mobile
- [ ] Call history list
- [ ] Call receipt detail (duration, cost, destination)
- [ ] Low balance warning

### Admin (minimal)
- [ ] Internal admin page: search user, view calls, view wallet tx

**Exit criteria:** Call history shows correct duration and charge; wallet reconciles.

---

## Sprint 5 (Week 9–10) — Fraud & Reliability

**Theme:** Don't lose money

### Backend
- [ ] Fraud rules: max calls/day, max spend/day
- [ ] Prefix blacklist (premium numbers)
- [ ] Insufficient balance mid-call handling
- [ ] Webhook signature verification hardening
- [ ] Retry/idempotency for all webhooks

### DevOps
- [ ] CloudWatch dashboards (call success, ASR, webhook errors)
- [ ] PagerDuty alerts for billing mismatch
- [ ] Staging environment end-to-end tests

### Mobile
- [ ] Error states (402 insufficient balance, network failure)
- [ ] Retry UX for failed call setup

**Exit criteria:** Fraud test cases pass; alerts fire on simulated billing mismatch.

---

## Sprint 6 (Week 11–12) — Beta Launch

**Theme:** Ship to real users

### Product
- [ ] Onboarding tutorial
- [ ] Rate transparency screen ("Ethiopia $0.25/min")
- [ ] Terms of service + rate disclosure
- [ ] Support email / feedback form

### Backend
- [ ] Production deployment
- [ ] Secrets Manager for Telnyx/Stripe keys
- [ ] Rate limiting on auth endpoints
- [ ] Backup/restore drill for RDS

### Mobile
- [ ] TestFlight + Play Console internal testing
- [ ] Crash reporting (Firebase/Sentry)
- [ ] App Store assets (icon, screenshots)

### QA
- [ ] Full regression on iOS + Android
- [ ] 50 test calls across +251/+254 prefixes
- [ ] Load test: 20 concurrent call setups

**Exit criteria:** 10–20 beta users can sign up, top up, and call successfully.

---

## Backlog (post-MVP)

| Priority | Item |
|----------|------|
| P1 | M-PESA / telebirr top-up |
| P1 | Second carrier + LCR failover |
| P2 | Contacts import + favorites |
| P2 | Promo codes / referral credits |
| P2 | Callback calling mode |
| P3 | Admin rate management UI |
| P3 | Ethiopia operator interconnect |
| P3 | Multi-currency wallets |

---

## Story point guide (team velocity)

| Size | Meaning | Example |
|------|---------|---------|
| 1 | Few hours | Add API field |
| 3 | 1–2 days | Wallet hold/capture |
| 5 | 3–5 days | Telnyx webhook billing |
| 8 | Full sprint slice | WebRTC integration |
| 13 | Multi-sprint | Multi-carrier LCR |

**Estimated MVP total:** ~120–150 story points

---

## Risk register

| Risk | Mitigation | Owner |
|------|------------|-------|
| Poor +251 call quality | Test multiple Telnyx routes; plan carrier B | Telephony |
| Ethiopia regulatory | Legal review before public launch | Product |
| WebRTC NAT issues | Telnyx TURN; fallback callback mode | Mobile |
| Billing disputes | Immutable ledger + CDR archive | Backend |
| Stripe fraud | 3DS, velocity limits | Backend |

---

## Definition of Done (per story)

- [ ] Code reviewed and merged
- [ ] Unit tests for business logic
- [ ] API documented in OpenAPI (if new endpoint)
- [ ] Deployed to staging
- [ ] QA sign-off or demo recorded

---

## Weekly cadence

| Day | Activity |
|-----|----------|
| Monday | Sprint planning / priority review |
| Wednesday | Telephony quality review (ASR, failures) |
| Friday | Demo + retro |

---

## Related documents

- [System design](system-design.md)
- [OpenAPI spec](api/openapi.yaml)
- [Telnyx integration](telephony/telnyx-integration.md)
- [Database schema](database/migrations/001_initial_schema.sql)
