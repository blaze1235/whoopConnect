import { randomBytes } from "crypto";
import { pool } from "./db";
import { Language } from "./config";

export interface User {
  id: number;
  telegram_user_id: string; // pg returns BIGINT as string
  language: Language;
  first_name: string | null;
  whoop_access_token: string | null;
  whoop_refresh_token: string | null;
  whoop_token_expires_at: Date | null;
  whoop_connected: boolean;
  whoop_oauth_state: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function upsertUser(
  telegramUserId: number,
  firstName?: string
): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (telegram_user_id, first_name)
     VALUES ($1, $2)
     ON CONFLICT (telegram_user_id)
     DO UPDATE SET first_name = COALESCE($2, users.first_name),
                   updated_at = NOW()
     RETURNING *`,
    [telegramUserId, firstName ?? null]
  );
  return result.rows[0];
}

export async function getUser(telegramUserId: number): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE telegram_user_id = $1",
    [telegramUserId]
  );
  return result.rows[0] ?? null;
}

export async function setLanguage(
  telegramUserId: number,
  language: Language
): Promise<void> {
  await pool.query(
    "UPDATE users SET language = $2, updated_at = NOW() WHERE telegram_user_id = $1",
    [telegramUserId, language]
  );
}

/**
 * Creates a fresh random OAuth state for this user and stores it, so the
 * /whoop/callback can verify the request really started from this Telegram user.
 */
export async function createOauthState(telegramUserId: number): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const state = `${telegramUserId}.${nonce}`;
  await pool.query(
    "UPDATE users SET whoop_oauth_state = $2, updated_at = NOW() WHERE telegram_user_id = $1",
    [telegramUserId, state]
  );
  return state;
}

export async function saveWhoopTokens(
  telegramUserId: number,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET whoop_access_token = $2,
         whoop_refresh_token = $3,
         whoop_token_expires_at = NOW() + ($4 || ' seconds')::interval,
         whoop_connected = TRUE,
         whoop_oauth_state = NULL,
         updated_at = NOW()
     WHERE telegram_user_id = $1`,
    [telegramUserId, accessToken, refreshToken, String(expiresInSeconds)]
  );
}

export async function markDisconnected(telegramUserId: number): Promise<void> {
  await pool.query(
    `UPDATE users
     SET whoop_connected = FALSE,
         whoop_access_token = NULL,
         whoop_refresh_token = NULL,
         whoop_token_expires_at = NULL,
         updated_at = NOW()
     WHERE telegram_user_id = $1`,
    [telegramUserId]
  );
}

export async function getConnectedUsers(): Promise<User[]> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE whoop_connected = TRUE ORDER BY id"
  );
  return result.rows;
}

export async function saveDailySummary(
  telegramUserId: number,
  summaryDate: string,
  rawData: unknown,
  aiSummary: string
): Promise<void> {
  await pool.query(
    `INSERT INTO daily_summaries (telegram_user_id, summary_date, raw_data, ai_summary)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_user_id, summary_date)
     DO UPDATE SET raw_data = $3, ai_summary = $4`,
    [telegramUserId, summaryDate, JSON.stringify(rawData), aiSummary]
  );
}

export async function getLastSummaryDate(
  telegramUserId: number
): Promise<string | null> {
  const result = await pool.query<{ summary_date: string }>(
    `SELECT to_char(summary_date, 'YYYY-MM-DD') AS summary_date
     FROM daily_summaries
     WHERE telegram_user_id = $1
     ORDER BY summary_date DESC
     LIMIT 1`,
    [telegramUserId]
  );
  return result.rows[0]?.summary_date ?? null;
}
