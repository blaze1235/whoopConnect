# WHOOP → Telegram Bot (Russian / Uzbek)

A Telegram bot that connects to a WHOOP account once and then explains the
person's daily WHOOP data (recovery, sleep, strain, workouts) in **simple
Russian or Uzbek** — designed for a non-English-speaking older adult.

⚠️ The bot never diagnoses. It only explains wellness numbers in plain words
and gives gentle suggestions (rest, water, light walk, sleep earlier). If a
number looks unusual it only suggests talking to a doctor *if the person feels
unwell*.

## Features

- `/start` — saves the user, asks for language (🇷🇺 / 🇺🇿), shows Connect button
- `/connect` — WHOOP OAuth link (state is bound to the Telegram user)
- `/today` — fetches the latest WHOOP data and replies with a simple explanation
- `/lang` — change language any time
- `/status` — connection status + last summary date
- Daily automatic summary at **08:00 Asia/Tashkent** (configurable cron)
- Automatic WHOOP token refresh; asks to reconnect if refresh fails
- Missing metrics never crash the bot — it explains what is available

## AI options (including a free one)

The explanation layer works in three modes, picked by your `.env`:

| Mode | Cost | Setup |
|------|------|-------|
| **Built-in explainer** | Free, no API at all | Leave `OPENAI_API_KEY` empty. The bot generates warm, safe Russian/Uzbek text from the numbers using built-in rules. |
| **Free hosted model** | Free tier | Set `OPENAI_BASE_URL=https://openrouter.ai/api/v1`, an [OpenRouter](https://openrouter.ai) key in `OPENAI_API_KEY`, and `OPENAI_MODEL=meta-llama/llama-3.3-70b-instruct:free` (or another `:free` model). Groq also works: `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_MODEL=llama-3.3-70b-versatile`. |
| **OpenAI** | Paid (cheap with `gpt-4o-mini`) | Just set `OPENAI_API_KEY`. |

If the AI call ever fails, the bot automatically falls back to the built-in
explainer, so your father always gets his morning message.

## Stack

Node.js · TypeScript · Express · Telegraf · PostgreSQL (or Supabase) ·
OpenAI SDK (any OpenAI-compatible endpoint) · node-cron · dotenv

## Setup

### 0. Prerequisites

- Node.js ≥ 18
- A PostgreSQL database (local, or free [Supabase](https://supabase.com) project)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- WHOOP developer app from <https://developer.whoop.com> (create an app, note
  Client ID and Client Secret)

### 1. Install

```bash
npm install
```

### 2. Create .env

```bash
cp .env.example .env
```

Fill in `TELEGRAM_BOT_TOKEN`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`,
`DATABASE_URL`. For Supabase set `DATABASE_SSL=true`.

### 3. Run database migration

```bash
npm run migrate
```

(Migrations also run automatically on startup.)

### 4. Start in dev mode

```bash
npm run dev
```

### 5. Expose the callback with ngrok (local testing)

WHOOP must be able to reach your OAuth callback over HTTPS:

```bash
ngrok http 3000
```

### 6. Set the redirect URI

In `.env`:

```
WHOOP_REDIRECT_URI=https://your-ngrok-url/whoop/callback
```

**Also add the exact same URL as a Redirect URI in your WHOOP developer app
settings** — WHOOP rejects any URI that isn't registered. Restart `npm run dev`
after changing `.env`.

### 7. Try it

1. Open your bot in Telegram, send `/start`
2. Pick Русский or O'zbekcha
3. Tap **Connect WHOOP**, log in with the WHOOP account, allow access
4. Send `/today` — you get the explanation
5. Every morning at 08:00 (Asia/Tashkent) the summary arrives automatically

## Production

```bash
npm run build
npm start
```

Deploy anywhere that runs Node (Railway, Render, Fly.io, a small VPS).
Set `WHOOP_REDIRECT_URI` to your permanent domain and register it in the WHOOP
app. The bot uses long polling, so only the `/whoop/callback` route needs to be
publicly reachable.

## Database schema

`users`: `id`, `telegram_user_id`, `language` (default `ru`), `first_name`,
`whoop_access_token`, `whoop_refresh_token`, `whoop_token_expires_at`,
`whoop_connected`, `whoop_oauth_state`, `created_at`, `updated_at`

`daily_summaries`: `id`, `telegram_user_id`, `summary_date`, `raw_data` (jsonb),
`ai_summary`, `created_at` — unique per user per day.

## Privacy & safety

- Tokens are stored only in the database and never logged.
- OAuth `state` contains the Telegram user ID **plus a random nonce** that is
  verified server-side, so one user cannot attach tokens to another user.
- Health data is not logged in production; only stored per user.
- The AI system prompt forbids diagnoses, medical certainty, and fear-inducing
  language; the built-in fallback explainer is rule-based and safe by
  construction.

## Environment variables

See [.env.example](.env.example) for the full annotated list.
