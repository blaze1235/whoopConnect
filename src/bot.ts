import { Markup, Telegraf } from "telegraf";
import { config, Language } from "./config";
import {
  createOauthState,
  getLastSummaryDate,
  getUser,
  setLanguage,
  upsertUser,
  User,
} from "./users";
import { buildAuthUrl, WhoopAuthError, WhoopDataUnavailableError, fetchNormalizedData, getValidAccessToken } from "./whoop";
import { buildSummaryForUser } from "./summary";
import { answerUserQuestion } from "./openai";
import { NormalizedWhoopData } from "./whoop";

export const bot = new Telegraf(config.telegramBotToken);

// All user-facing bot texts in both languages.
const T = {
  ru: {
    welcome: (name: string) =>
      `Здравствуйте${name ? ", " + name : ""}! 👋\n\nЯ помогу вам понимать данные вашего браслета WHOOP простыми словами.\n\nКаждое утро я буду присылать понятное объяснение...\n\nСначала выберите язык:`,
    chooseLanguage: "Выберите язык:",
    languageSet: "Язык установлен: русский. ✅",
    connectButton: "🔗 Подключить WHOOP",
    connectPrompt: "Нажмите кнопку ниже, чтобы подключить WHOOP...",
    alreadyConnected: "WHOOP уже подключён. ✅ Используйте /today...",
    notConnected: "WHOOP ещё не подключён. Нажмите /connect...",
    reconnect: "Подключение к WHOOP истекло. Пожалуйста, подключите заново: /connect",
    preparing: "Готовлю вашу сводку, одну минуту… ⏳",
    dataNotReady: "Данные WHOOP пока не готовы...",
    genericError: "Не получилось подготовить объяснение сейчас...",
    statusConnected: (lang: string, lastDate: string | null) => `Статус: WHOOP подключён ✅\nЯзык: ${lang}\n` + (lastDate ? `Последняя сводка: ${lastDate}` : "Сводок пока не было."),
    statusNotConnected: (lang: string) => `Статус: WHOOP не подключён ❌\nЯзык: ${lang}`,
    languageName: "русский",
    help: "Команды:\n/today — сводка за сегодня\n/connect — подключить WHOOP\n/lang — сменить язык\n/status — статус\n/ai — задать вопрос ИИ",
    aiWaiting: "ИИ ждет ваш вопрос. Спрашивайте о восстановлении, сне, тренировках...",
  },
  uz: {
    // Similar Uzbek texts...
    help: "Buyruqlar:\n/today — bugungi xulosa\n/connect — WHOOP'ni ulash\n/lang — tilni o'zgartirish\n/status — ulanish holati\n/ai — AI ga savol berish",
    aiWaiting: "AI savolingizni kutmoqda. Tiklanish, uyqu, mashqlar haqida so'rang...",
  },
} as const;

function texts(user: User | null) {
  return T[user?.language ?? "ru"];
}

const languageKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🇷🇺 Русский", "lang:ru"), Markup.button.callback("🇺🇿 O'zbekcha", "lang:uz")],
]);

// ... (keep all your original functions: sendConnectButton, start, lang, connect, status, today, help, notifyWhoopConnected ...)

bot.command("ai", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);

  if (!user.whoop_connected) {
    await ctx.reply(t.notConnected);
    return;
  }

  await ctx.reply(t.aiWaiting, Markup.keyboard([["/today", "/status"]]).resize());
});

bot.on("text", async (ctx) => {
  const messageText = ctx.message.text.trim();
  if (messageText.startsWith("/")) return; // Skip commands

  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);

  if (!user.whoop_connected) {
    await ctx.reply(t.notConnected);
    return;
  }

  await ctx.reply("Думаю над ответом... ⏳");

  try {
    const accessToken = await getValidAccessToken(user);
    let data: NormalizedWhoopData | null = null;

    try {
      data = await fetchNormalizedData(accessToken, config.timezone);
    } catch (e) {
      console.log("No fresh data for chat");
    }

    const answer = await answerUserQuestion(data, messageText, user.language);
    await ctx.reply(answer);
  } catch (err) {
    console.error("Chat handler error:", err);
    await ctx.reply(t.genericError);
  }
});

// Keep all your other handlers (start, lang, etc.) as they were...

bot.help(async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(texts(user).help);
});

bot.catch((err, ctx) => {
  console.error(`Bot error:`, err);
});

export async function notifyWhoopConnected(telegramUserId: number): Promise<void> {
  // ... your original function
}
