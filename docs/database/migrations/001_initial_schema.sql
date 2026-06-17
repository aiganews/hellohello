-- HelloHello initial schema
-- Migration: 001_initial_schema
-- PostgreSQL 15+

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_kyc_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE user_status AS ENUM ('active', 'suspended');
CREATE TYPE wallet_tx_type AS ENUM ('topup', 'hold', 'capture', 'release', 'refund', 'adjustment');
CREATE TYPE call_status AS ENUM ('initiated', 'ringing', 'answered', 'completed', 'failed', 'cancelled');
CREATE TYPE topup_provider AS ENUM ('stripe', 'mpesa', 'telebirr');
CREATE TYPE topup_status AS ENUM ('pending', 'succeeded', 'failed');
CREATE TYPE carrier_status AS ENUM ('active', 'disabled');
CREATE TYPE device_platform AS ENUM ('ios', 'android');

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_e164      VARCHAR(20) NOT NULL UNIQUE,
    email           CITEXT UNIQUE,
    country_code    CHAR(2) NOT NULL,
    kyc_status      user_kyc_status NOT NULL DEFAULT 'pending',
    status          user_status NOT NULL DEFAULT 'active',
    preferred_currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_country_code ON users (country_code);

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       VARCHAR(128) NOT NULL,
    platform        device_platform NOT NULL,
    push_token      TEXT,
    app_version     VARCHAR(32),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE INDEX idx_devices_user_id ON devices (user_id);

-- ---------------------------------------------------------------------------
-- Wallets
-- ---------------------------------------------------------------------------

CREATE TABLE wallets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    available_balance   NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
    held_balance        NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (held_balance >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Wallet transactions (immutable ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE wallet_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    type                wallet_tx_type NOT NULL,
    amount              NUMERIC(12, 4) NOT NULL,
    currency            CHAR(3) NOT NULL,
    reference_type      VARCHAR(64),
    reference_id        UUID,
    idempotency_key     VARCHAR(128) NOT NULL UNIQUE,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_wallet_created ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX idx_wallet_tx_reference ON wallet_transactions (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Rate plans
-- ---------------------------------------------------------------------------

CREATE TABLE rate_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(128) NOT NULL UNIQUE,
    currency    CHAR(3) NOT NULL DEFAULT 'USD',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE destination_rates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_plan_id            UUID NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
    prefix                  VARCHAR(16) NOT NULL,
    country_code            CHAR(2) NOT NULL,
    description             VARCHAR(255) NOT NULL,
    retail_rate_per_min     NUMERIC(10, 4) NOT NULL CHECK (retail_rate_per_min >= 0),
    wholesale_rate_per_min  NUMERIC(10, 4) NOT NULL CHECK (wholesale_rate_per_min >= 0),
    billing_increment_sec   INTEGER NOT NULL DEFAULT 60 CHECK (billing_increment_sec > 0),
    min_duration_sec        INTEGER NOT NULL DEFAULT 0 CHECK (min_duration_sec >= 0),
    effective_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rate_plan_id, prefix, effective_from)
);

CREATE INDEX idx_destination_rates_prefix ON destination_rates (prefix, effective_from DESC);
CREATE INDEX idx_destination_rates_country ON destination_rates (country_code);

-- ---------------------------------------------------------------------------
-- Carriers
-- ---------------------------------------------------------------------------

CREATE TABLE carriers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(128) NOT NULL UNIQUE,
    provider_key    VARCHAR(64) NOT NULL,
    sip_host        VARCHAR(255),
    auth_type       VARCHAR(32) NOT NULL DEFAULT 'api',
    status          carrier_status NOT NULL DEFAULT 'active',
    priority        INTEGER NOT NULL DEFAULT 100,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carrier_routes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id      UUID NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
    prefix          VARCHAR(16) NOT NULL,
    cost_per_min    NUMERIC(10, 4) NOT NULL CHECK (cost_per_min >= 0),
    quality_score   NUMERIC(4, 2) NOT NULL DEFAULT 4.0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (carrier_id, prefix)
);

CREATE INDEX idx_carrier_routes_prefix ON carrier_routes (prefix, active);

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------

CREATE TABLE calls (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id               VARCHAR(128),
    to_e164                 VARCHAR(20) NOT NULL,
    from_cli                VARCHAR(20),
    status                  call_status NOT NULL DEFAULT 'initiated',
    carrier_id              UUID REFERENCES carriers(id),
    carrier_call_id         VARCHAR(128),
    retail_rate_per_min     NUMERIC(10, 4) NOT NULL,
    wholesale_rate_per_min  NUMERIC(10, 4),
    currency                CHAR(3) NOT NULL DEFAULT 'USD',
    hold_transaction_id     UUID REFERENCES wallet_transactions(id),
    started_at              TIMESTAMPTZ,
    answered_at             TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,
    duration_sec            INTEGER CHECK (duration_sec IS NULL OR duration_sec >= 0),
    billed_amount           NUMERIC(12, 4) CHECK (billed_amount IS NULL OR billed_amount >= 0),
    fail_reason             VARCHAR(255),
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calls_user_created ON calls (user_id, created_at DESC);
CREATE INDEX idx_calls_status ON calls (status);
CREATE INDEX idx_calls_carrier_call_id ON calls (carrier_call_id);
CREATE INDEX idx_calls_to_e164 ON calls (to_e164);

-- ---------------------------------------------------------------------------
-- CDRs
-- ---------------------------------------------------------------------------

CREATE TABLE cdrs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    carrier_call_id VARCHAR(128) NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    duration_sec    INTEGER,
    disposition     VARCHAR(64),
    wholesale_cost  NUMERIC(12, 4),
    raw_payload     JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cdrs_call_id ON cdrs (call_id);
CREATE INDEX idx_cdrs_carrier_call_id ON cdrs (carrier_call_id);

-- ---------------------------------------------------------------------------
-- Topups
-- ---------------------------------------------------------------------------

CREATE TABLE topups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    provider        topup_provider NOT NULL,
    provider_ref    VARCHAR(255),
    amount          NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    status          topup_status NOT NULL DEFAULT 'pending',
    checkout_url    TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_topups_user_created ON topups (user_id, created_at DESC);
CREATE INDEX idx_topups_provider_ref ON topups (provider, provider_ref);

-- ---------------------------------------------------------------------------
-- OTP requests
-- ---------------------------------------------------------------------------

CREATE TABLE otp_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_e164      VARCHAR(20) NOT NULL,
    code_hash       VARCHAR(255) NOT NULL,
    channel         VARCHAR(16) NOT NULL DEFAULT 'sms',
    expires_at      TIMESTAMPTZ NOT NULL,
    verified_at     TIMESTAMPTZ,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_phone_created ON otp_requests (phone_e164, created_at DESC);

-- ---------------------------------------------------------------------------
-- Webhook idempotency
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(64) NOT NULL,
    external_id     VARCHAR(255) NOT NULL,
    payload         JSONB NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, external_id)
);

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

INSERT INTO rate_plans (id, name, currency, active)
VALUES ('00000000-0000-4000-8000-000000000001', 'default-usd', 'USD', TRUE);

INSERT INTO destination_rates (
    rate_plan_id, prefix, country_code, description,
    retail_rate_per_min, wholesale_rate_per_min,
    billing_increment_sec
) VALUES
    ('00000000-0000-4000-8000-000000000001', '251', 'ET', 'Ethiopia', 0.2500, 0.1800, 60),
    ('00000000-0000-4000-8000-000000000001', '2519', 'ET', 'Ethiopia Mobile', 0.2500, 0.1800, 60),
    ('00000000-0000-4000-8000-000000000001', '254', 'KE', 'Kenya', 0.1200, 0.0800, 60),
    ('00000000-0000-4000-8000-000000000001', '2547', 'KE', 'Kenya Mobile', 0.1200, 0.0800, 60),
    ('00000000-0000-4000-8000-000000000001', '1', 'US', 'USA/Canada', 0.0100, 0.0050, 60);

INSERT INTO carriers (id, name, provider_key, status, priority, config)
VALUES (
    '00000000-0000-4000-8000-000000000010',
    'Telnyx',
    'telnyx',
    'active',
    1,
    '{"connection_id": "REPLACE_ME"}'::jsonb
);

INSERT INTO carrier_routes (carrier_id, prefix, cost_per_min, quality_score)
VALUES
    ('00000000-0000-4000-8000-000000000010', '251', 0.1800, 4.0),
    ('00000000-0000-4000-8000-000000000010', '254', 0.0800, 4.5),
    ('00000000-0000-4000-8000-000000000010', '1', 0.0050, 4.8);

-- ---------------------------------------------------------------------------
-- Updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_calls_updated_at
    BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_topups_updated_at
    BEFORE UPDATE ON topups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carriers_updated_at
    BEFORE UPDATE ON carriers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
