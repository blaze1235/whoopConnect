import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  port: Number(optional("PORT", "3000")),

  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),

  whoopClientId: required("WHOOP_CLIENT_ID"),
  whoopClientSecret: required("WHOOP_CLIENT_SECRET"),
  whoopRedirectUri: required("WHOOP_REDIRECT_URI"),

  // AI is optional: when no key is set the bot falls back to the built-in
  // rule-based explainer, so it keeps working for free.
  openaiApiKey: optional("OPENAI_API_KEY"),
  openaiBaseUrl: optional("OPENAI_BASE_URL"),
  openaiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),

  databaseUrl: required("DATABASE_URL"),
  databaseSsl: optional("DATABASE_SSL", "false").toLowerCase() === "true",

  dailySummaryCron: optional("DAILY_SUMMARY_CRON", "0 8 * * *"),
  timezone: optional("DEFAULT_TIMEZONE", "Asia/Tashkent"),

  isProduction: optional("NODE_ENV", "development") === "production",
};

export type Language = "ru" | "uz";
