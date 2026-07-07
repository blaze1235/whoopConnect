import { Pool } from "pg";
import { config } from "./config";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                      BIGSERIAL PRIMARY KEY,
  telegram_user_id        BIGINT UNIQUE NOT NULL,
  language                TEXT NOT NULL DEFAULT 'ru',
  first_name              TEXT,
  whoop_access_token      TEXT,
  whoop_refresh_token     TEXT,
  whoop_token_expires_at  TIMESTAMPTZ,
  whoop_connected         BOOLEAN NOT NULL DEFAULT FALSE,
  whoop_oauth_state       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id                BIGSERIAL PRIMARY KEY,
  telegram_user_id  BIGINT NOT NULL,
  summary_date      DATE NOT NULL,
  raw_data          JSONB,
  ai_summary        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (telegram_user_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_users_connected ON users (whoop_connected);
CREATE INDEX IF NOT EXISTS idx_summaries_user_date
  ON daily_summaries (telegram_user_id, summary_date);
`;

export async function runMigrations(): Promise<void> {
  await pool.query(MIGRATION_SQL);
  console.log("Database migrations applied");
}
