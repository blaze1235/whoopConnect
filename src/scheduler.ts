import cron from "node-cron";
import { bot } from "./bot";
import { config } from "./config";
import { getConnectedUsers } from "./users";
import { buildSummaryForUser } from "./summary";
import { WhoopAuthError, WhoopDataUnavailableError } from "./whoop";

const RECONNECT_MESSAGE = {
  ru: "Подключение к WHOOP истекло, поэтому утренняя сводка не пришла. Пожалуйста, подключите заново: /connect",
  uz: "WHOOP bilan ulanish muddati tugagani uchun ertalabki xulosa kelmadi. Iltimos, qaytadan ulang: /connect",
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runDailySummaries(): Promise<void> {
  const users = await getConnectedUsers();
  console.log(`Daily summary run: ${users.length} connected user(s)`);

  for (const user of users) {
    const telegramId = Number(user.telegram_user_id);
    try {
      const { text } = await buildSummaryForUser(user);
      await bot.telegram.sendMessage(telegramId, text);
    } catch (err) {
      if (err instanceof WhoopAuthError) {
        // Token refresh failed — ask this user to reconnect, keep going.
        await bot.telegram
          .sendMessage(telegramId, RECONNECT_MESSAGE[user.language])
          .catch(() => undefined);
      } else if (err instanceof WhoopDataUnavailableError) {
        console.log(`No WHOOP data yet for user ${telegramId}, skipping`);
      } else {
        console.error(
          `Daily summary failed for user ${telegramId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    // Gentle pacing to stay well under Telegram/WHOOP rate limits.
    await sleep(1500);
  }
}

export function startScheduler(): void {
  if (!cron.validate(config.dailySummaryCron)) {
    throw new Error(`Invalid DAILY_SUMMARY_CRON expression: ${config.dailySummaryCron}`);
  }
  cron.schedule(config.dailySummaryCron, () => {
    runDailySummaries().catch((err) =>
      console.error("Daily summary run crashed:", err instanceof Error ? err.message : err)
    );
  }, { timezone: config.timezone });
  console.log(
    `Daily summaries scheduled: "${config.dailySummaryCron}" (${config.timezone})`
  );
}
