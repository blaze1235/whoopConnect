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

const T = {
  ru: {
    welcome: (name: string) => `Здравствуйте${name ? ", " + name : ""}! 👋\n\nЯ помогу вам понимать данные WHOOP...\n\nСначала выберите язык:`,
    chooseLanguage: "Выберите язык:",
    languageSet: "Язык установлен: русский. ✅\n\nТеперь подключите WHOOP.",
    connectButton: "🔗 Подключить WHOOP",
    connectPrompt: "Нажмите кнопку ниже, чтобы подключить WHOOP.",
    alreadyConnected: "WHOOP уже подключён. ✅ Используйте /today.",
    notConnected: "WHOOP ещё не подключён. Нажмите /connect.",
    reconnect: "Подключение истекло. /connect",
    preparing: "Готовлю сводку... ⏳",
    dataNotReady: "Данные WHOOP пока не готовы.",
    genericError: "Не получилось ответить сейчас. Попробуйте позже.",
    statusConnected: (lang: string, lastDate: string | null) => `Статус: WHOOP подключён ✅\nЯзык: ${lang}` + (lastDate ? `\nПоследняя сводка: ${lastDate}` : ""),
    statusNotConnected: (lang: string) => `Статус: WHOOP не подключён ❌\nЯзык: ${lang}`,
    languageName: "русский",
    help: "Команды:\n/today — сводка\n/connect — подключить\n/lang — язык\n/status — статус\n/ai — задать вопрос ИИ",
    aiWaiting: "ИИ ждет ваш вопрос. Спрашивайте о восстановлении, сне, нагрузке...",
  },
  uz: {
    welcome: (name: string) => `Assalomu alaykum${name ? ", " + name : ""}! 👋\n\nMen WHOOP ma'lumotlarini tushuntiraman...\n\nAvval tilni tanlang:`,
    chooseLanguage: "Tilni tanlang:",
    languageSet: "Til o'rnatildi: o'zbekcha. ✅",
    connectButton: "🔗 WHOOP'ni ulash",
    connectPrompt: "WHOOP'ni ulash uchun tugmani bosing.",
    alreadyConnected: "WHOOP allaqachon ulangan. ✅ /today buyrug'ini yuboring.",
    notConnected: "WHOOP hali ulanmagan. /connect buyrug'ini bosing.",
    reconnect: "Ulanish muddati tugadi. /connect",
    preparing: "Xulosani tayyorlayapman... ⏳",
    dataNotReady: "WHOOP ma'lumotlari hali tayyor emas.",
    genericError: "Hozir javob bera olmadim. Keyinroq urinib ko'ring.",
    statusConnected: (lang: string, lastDate: string | null) => `Holat: WHOOP ulangan ✅\nTil: ${lang}` + (lastDate ? `\nOxirgi xulosa: ${lastDate}` : ""),
    statusNotConnected: (lang: string) => `Holat: WHOOP ulanmagan ❌\nTil: ${lang}`,
    languageName: "o'zbekcha",
    help: "Buyruqlar:\n/today — bugungi xulosa\n/connect — WHOOP'ni ulash\n/lang — til\n/status — holat\n/ai — AI ga savol",
    aiWaiting: "AI savolingizni kutmoqda. Tiklanish, uyqu haqida so'rang...",
  },
} as const;

function texts(user: User | null) {
  return T[user?.language ?? "ru"];
}

// Rest of your original code (start, connect, etc.) should stay the same. 

// Add this for /ai
bot.command("ai", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);

  if (!user.whoop_connected) {
    await ctx.reply(t.notConnected);
    return;
  }

  await ctx.reply(t.aiWaiting);
});

// Keep your original handlers...

bot.help(async (ctx) => {
  await ctx.reply(texts(await getUser(ctx.from.id)).help);
});

export async function notifyWhoopConnected(telegramUserId: number): Promise<void> {
  // your original
}
