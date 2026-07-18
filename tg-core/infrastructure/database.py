from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

DATABASE_URL_ENV_VAR = "TRADINGAGENTS_DATABASE_URL"
ANALYSIS_LOCK_KEY = 8_724_631_904


def database_url() -> str:
    url = os.getenv(DATABASE_URL_ENV_VAR, "").strip()
    if not url:
        raise RuntimeError(f"{DATABASE_URL_ENV_VAR} must be configured in .env")
    return url


def connect(*, autocommit: bool = False):
    return psycopg.connect(database_url(), autocommit=autocommit, row_factory=dict_row)


def init_database() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_jobs (
                id UUID PRIMARY KEY,
                request_id UUID,
                ticker TEXT NOT NULL,
                trade_date DATE NOT NULL,
                asset_type TEXT NOT NULL,
                analysts JSONB NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
                request JSONB NOT NULL,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                final_state JSONB,
                decision TEXT,
                error TEXT,
                report_path TEXT,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
                cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
                cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
                progress_percent INTEGER NOT NULL DEFAULT 0,
                current_step TEXT,
                events JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                started_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ
            )
            """
        )
        conn.execute("ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS request_id UUID")
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute("ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS current_step TEXT")
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS tokens_used INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS token_usage JSONB NOT NULL DEFAULT '{}'::jsonb"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS product_users (
                clerk_user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                email TEXT,
                avatar_url TEXT NOT NULL DEFAULT '',
                interface_language TEXT NOT NULL DEFAULT 'en',
                report_language TEXT NOT NULL DEFAULT 'English',
                timezone TEXT NOT NULL DEFAULT 'UTC',
                default_market TEXT NOT NULL DEFAULT 'US',
                stripe_customer_id TEXT UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_consents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id) ON DELETE CASCADE,
                document_type TEXT NOT NULL,
                document_version TEXT NOT NULL,
                accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                ip_address TEXT,
                user_agent TEXT,
                UNIQUE (clerk_user_id, document_type, document_version)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS billing_subscriptions (
                stripe_subscription_id TEXT PRIMARY KEY,
                clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id) ON DELETE CASCADE,
                stripe_customer_id TEXT NOT NULL,
                stripe_price_id TEXT NOT NULL,
                status TEXT NOT NULL,
                cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
                current_period_start TIMESTAMPTZ,
                current_period_end TIMESTAMPTZ,
                latest_invoice_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS billing_subscriptions_user_status_idx
            ON billing_subscriptions (clerk_user_id, status)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_accounts (
                clerk_user_id TEXT PRIMARY KEY REFERENCES product_users(clerk_user_id) ON DELETE CASCADE,
                available_credits INTEGER NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
                reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
                spent_credits INTEGER NOT NULL DEFAULT 0 CHECK (spent_credits >= 0),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_reservations (
                request_id UUID PRIMARY KEY,
                clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id) ON DELETE CASCADE,
                analysis_job_id UUID UNIQUE,
                units INTEGER NOT NULL CHECK (units > 0),
                status TEXT NOT NULL CHECK (status IN ('reserved', 'consumed', 'released')),
                reason TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                settled_at TIMESTAMPTZ
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS credit_reservations_user_created_idx
            ON credit_reservations (clerk_user_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_ledger_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id) ON DELETE CASCADE,
                entry_type TEXT NOT NULL,
                available_delta INTEGER NOT NULL DEFAULT 0,
                reserved_delta INTEGER NOT NULL DEFAULT 0,
                spent_delta INTEGER NOT NULL DEFAULT 0,
                idempotency_key TEXT NOT NULL UNIQUE,
                reference_type TEXT NOT NULL,
                reference_id TEXT NOT NULL,
                description TEXT NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
            ON credit_ledger_entries (clerk_user_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stripe_webhook_events (
                stripe_event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                status TEXT NOT NULL,
                payload JSONB NOT NULL,
                error TEXT,
                received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                processed_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS billing_provider_configs (
                provider TEXT PRIMARY KEY,
                secret_key_ciphertext TEXT NOT NULL,
                webhook_secret_ciphertext TEXT NOT NULL,
                updated_by_clerk_user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS billing_config_audit_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('configured', 'cleared')),
                actor_clerk_user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS billing_config_audit_provider_created_idx
            ON billing_config_audit_events (provider, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_model_prices (
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                billing_mode TEXT NOT NULL DEFAULT 'standard',
                context_tier TEXT NOT NULL DEFAULT 'short',
                currency TEXT NOT NULL DEFAULT 'USD',
                unit_tokens INTEGER NOT NULL DEFAULT 1000000,
                input_price NUMERIC(18, 8) NOT NULL,
                cached_input_price NUMERIC(18, 8),
                cache_write_price NUMERIC(18, 8),
                output_price NUMERIC(18, 8) NOT NULL,
                source_url TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (provider, model, billing_mode, context_tier)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_pricing_sources (
                source_url TEXT PRIMARY KEY,
                update_interval_seconds INTEGER NOT NULL DEFAULT 3600,
                last_checked_at TIMESTAMPTZ,
                last_success_at TIMESTAMPTZ,
                last_error TEXT,
                model_count INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_request_id_key
            ON analysis_jobs (request_id)
            WHERE request_id IS NOT NULL
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS analysis_jobs_ticker_created_idx
            ON analysis_jobs (ticker, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS analysis_jobs_status_created_idx
            ON analysis_jobs (status, created_at DESC)
            """
        )


def healthcheck() -> None:
    with connect() as conn:
        conn.execute("SELECT 1")


@contextmanager
def analysis_execution_lock() -> Iterator[None]:
    with connect(autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (ANALYSIS_LOCK_KEY,))
        try:
            yield
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ANALYSIS_LOCK_KEY,))
