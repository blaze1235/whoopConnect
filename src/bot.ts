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
    welcome: (name: string) => `Здравствуйте${name ? ", " + name : ""}! 👋\n\nЯ помогу вам понимать данные вашего браслета WHOOP простыми словами.\n\nКаждое утро я буду присылать понятное объяснение.\n\nСначала выберите язык:`,
    chooseLanguage: "Выберите язык:",
    languageSet: "Язык установлен: русский. ✅\n\nТеперь подключите WHOOP.",
    connectButton: "🔗 Подключить WHOOP",
    connectPrompt: "Нажмите кнопку ниже, чтобы подключить WHOOP.",
    alreadyConnected: "WHOOP уже подключён. ✅ Используйте /today.",
    notConnected: "WHOOP ещё не подключён. Нажмите /connect.",
    reconnect: "Подключение истекло. Пожалуйста, /connect",
    preparing: "Готовлю сводку... ⏳",
    dataNotReady: "Данные WHOOP пока не готовы.",
    genericError: "Не получилось ответить сейчас. Попробуйте позже.",
    statusConnected: (lang: string, lastDate: string | null) => `Статус: WHOOP подключён ✅\nЯзык: ${lang}` + (lastDate ? `\nПоследняя сводка: ${lastDate}` : ""),
    statusNotConnected: (lang: string) => `Статус: WHOOP не подключён ❌\nЯзык: ${lang}`,
    languageName: "русский",
    help: "Команды:\n/today — сводка за сегодня\n/connect — подключить WHOOP\n/lang — сменить язык\n/status — статус\n/ai — задать вопрос ИИ",
    aiWaiting: "ИИ ждет ваш вопрос. Спрашивайте о восстановлении, сне, нагрузке...",
  },
  uz: {
    welcome: (name: string) => `Assalomu alaykum${name ? ", " + name : ""}! 👋\n\nMen WHOOP ma'lumotlarini sodda tilda tushuntiraman.\n\nAvval tilni tanlang:`,
    chooseLanguage: "Tilni tanlang:",
    languageSet: "Til o'rnatildi: o'zbekcha. ✅",
    connectButton: "🔗 WHOOP'ni ulash",
    connectPrompt: "WHOOP'ni ulash uchun tugmani bosing.",
    alreadyConnected: "WHOOP allaqachon ulangan. ✅ /today yuboring.",
    notConnected: "WHOOP hali ulanmagan. /connect bosing.",
    reconnect: "Ulanish muddati tugadi. /connect",
    preparing: "Xulosani tayyorlayapman... ⏳",
    dataNotReady: "WHOOP ma'lumotlari hali tayyor emas.",
    genericError: "Hozir javob bera olmadim. Keyinroq urinib ko'ring.",
    statusConnected: (lang: string, lastDate: string | null) => `Holat: WHOOP ulangan ✅\nTil: ${lang}` + (lastDate ? `\nOxirgi xulosa: ${lastDate}` : ""),
    statusNotConnected: (lang: string) => `Holat: WHOOP ulanmagan ❌\nTil: ${lang}`,
    languageName: "o'zbekcha",
    help: "Buyruqlar:\n/today — bugungi xulosa\n/connect — WHOOP'ni ulash\n/lang — til\n/status — holat\n/ai — AI ga savol berish",
    aiWaiting: "AI savolingizni kutmoqda. Tiklanish, uyqu haqida so'rang...",
  },
} as const;

function texts(user: User | null) {
  return T[user?.language ?? "ru"];
}

const languageKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🇷🇺 Русский", "lang:ru"),
    Markup.button.callback("🇺🇿 O'zbekcha", "lang:uz"),
  ],
]);

async function sendConnectButton(chatId: number, telegramUserId: number, lang: Language): Promise<void> {
  const state = await createOauthState(telegramUserId);
  const url = buildAuthUrl(state);
  await bot.telegram.sendMessage(chatId, T[lang].connectPrompt, {
    ...Markup.inlineKeyboard([[Markup.button.url(T[lang].connectButton, url)]]),
  });
}

bot.start(async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  await ctx.reply(texts(user).welcome(ctx.from.first_name ?? ""), languageKeyboard);
});

bot.command("lang", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  await ctx.reply(texts(user).chooseLanguage, languageKeyboard);
});

bot.action(/^lang:(ru|uz)$/, async (ctx) => {
  const lang = ctx.match[1] as Language;
  await upsertUser(ctx.from.id, ctx.from.first_name);
  await setLanguage(ctx.from.id, lang);
  await ctx.answerCbQuery();
  await ctx.reply(T[lang].languageSet);

  const user = await getUser(ctx.from.id);
  if (user && !user.whoop_connected && ctx.chat) {
    await sendConnectButton(ctx.chat.id, ctx.from.id, lang);
  }
});

bot.command("connect", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  if (user.whoop_connected) {
    await ctx.reply(texts(user).alreadyConnected);
    return;
  }
  await sendConnectButton(ctx.chat!.id, ctx.from.id, user.language);
});

bot.command("status", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);
  if (!user.whoop_connected) {
    await ctx.reply(t.statusNotConnected(t.languageName));
    return;
  }
  const lastDate = await getLastSummaryDate(ctx.from.id);
  await ctx.reply(t.statusConnected(t.languageName, lastDate));
});

bot.command("today", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);

  if (!user.whoop_connected) {
    await ctx.reply(t.notConnected);
    return;
  }

  await ctx.reply(t.preparing);
  try {
    const { text } = await buildSummaryForUser(user);
    await ctx.reply(text);
  } catch (err) {
    if (err instanceof WhoopAuthError) {
      await ctx.reply(t.reconnect);
    } else if (err instanceof WhoopDataUnavailableError) {
      await ctx.reply(t.dataNotReady);
    } else {
      console.error("Failed to build /today summary:", err);
      await ctx.reply(t.genericError);
    }
  }
});

bot.command("ai", async (ctx) => {
  const user = await upsertUser(ctx.from.id, ctx.from.first_name);
  const t = texts(user);

  if (!user.whoop_connected) {
    await ctx.reply(t.notConnected);
    return;
  }

  await ctx.reply(t.aiWaiting);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

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
      console.log("No fresh data");
    }

    const answer = await answerUserQuestion(data, text, user.language);
    await ctx.reply(answer);
  } catch (err) {
    console.error("Chat error:", err);
    await ctx.reply(t.genericError);
  }
});

bot.help(async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(texts(user).help);
});

bot.catch((err, ctx) => {
  console.error(`Bot error for update ${ctx.update.update_id}:`, err);
});

export async function notifyWhoopConnected(telegramUserId: number): Promise<void> {
  const user = await getUser(telegramUserId);
  const lang: Language = user?.language ?? "ru";
  const message = lang === "uz"
    ? "WHOOP muvaffaqiyatli ulandi! ✅\n\n/ai buyrug'i bilan savol bering."
    : "WHOOP успешно подключён! ✅\n\nОтправьте /ai и задайте вопрос.";
  await bot.telegram.sendMessage(telegramUserId, message);
}
