import express from "express";
import { config } from "./config";
import { runMigrations, pool } from "./db";
import { bot, notifyWhoopConnected } from "./bot";
import { startScheduler } from "./scheduler";
import { getUser, saveWhoopTokens } from "./users";
import { exchangeCodeForTokens } from "./whoop";

export const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Simple HTML pages the user sees in the browser after the WHOOP login.
function resultPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 16px;text-align:center;color:#222}h1{font-size:22px}</style>
</head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

app.get("/whoop/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !state) {
    res
      .status(400)
      .send(resultPage("Ошибка / Xatolik", "Missing code or state parameter."));
    return;
  }

  // state format: "<telegram_user_id>.<random nonce>", created by the bot.
  const telegramUserId = Number.parseInt(state.split(".")[0], 10);
  if (!Number.isFinite(telegramUserId)) {
    res.status(400).send(resultPage("Ошибка / Xatolik", "Invalid state parameter."));
    return;
  }

  try {
    const user = await getUser(telegramUserId);
    // Verify the state matches what we generated for this user (anti-CSRF).
    if (!user || user.whoop_oauth_state !== state) {
      res
        .status(403)
        .send(
          resultPage(
            "Ошибка / Xatolik",
            "This connection link is invalid or expired. Please run /connect in Telegram again."
          )
        );
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    await saveWhoopTokens(
      telegramUserId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    await notifyWhoopConnected(telegramUserId).catch((err) =>
      console.error("Failed to send Telegram confirmation:", err.message)
    );

    res.send(
      resultPage(
        "WHOOP подключён ✅",
        "Всё готово! Вернитесь в Telegram. / Hammasi tayyor! Telegramga qayting."
      )
    );
  } catch (err) {
    console.error(
      "WHOOP callback failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    res
      .status(500)
      .send(
        resultPage(
          "Ошибка / Xatolik",
          "Could not connect WHOOP. Please run /connect in Telegram and try again."
        )
      );
  }
});

async function main(): Promise<void> {
  await runMigrations();

  app.listen(config.port, () => {
    console.log(`HTTP server listening on port ${config.port}`);
  });

  startScheduler();

  // Long polling keeps setup simple (no public webhook needed for the bot).
  bot
    .launch(() => {
      console.log("Telegram bot started");
    })
    .catch((err) => {
      console.error(
        "Telegram bot failed to start (check TELEGRAM_BOT_TOKEN):",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down`);
    bot.stop(signal);
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal startup error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
