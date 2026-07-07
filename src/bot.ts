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
import { buildAuthUrl, WhoopAuthError, WhoopDataUnavailableError } from "./whoop";
import { buildSummaryForUser } from "./summary";

export const bot = new Telegraf(config.telegramBotToken);

// All user-facing bot texts in both languages.
const T = {
  ru: {
    welcome: (name: string) =>
      `Здравствуйте${name ? ", " + name : ""}! 👋\n\nЯ помогу вам понимать данные вашего браслета WHOOP простыми словами.\n\nКаждое утро я буду присылать понятное объяснение: как вы спали, как восстановился организм и что лучше делать сегодня.\n\nСначала выберите язык:`,
    chooseLanguage: "Выберите язык:",
    languageSet:
      "Язык установлен: русский. ✅\n\nТеперь подключите ваш WHOOP — нажмите кнопку ниже.",
    connectButton: "🔗 Подключить WHOOP",
    connectPrompt:
      "Нажмите кнопку ниже, чтобы подключить WHOOP. Откроется сайт WHOOP — войдите в свой аккаунт и разрешите доступ.",
    alreadyConnected:
      "WHOOP уже подключён. ✅ Используйте /today, чтобы получить сводку за сегодня.",
    notConnected:
      "WHOOP ещё не подключён. Нажмите /connect, чтобы подключить.",
    reconnect:
      "Подключение к WHOOP истекло. Пожалуйста, подключите заново: /connect",
    preparing: "Готовлю вашу сводку, одну минуту… ⏳",
    dataNotReady:
      "Данные WHOOP пока не готовы. Возможно, часы ещё не синхронизировались. Попробуйте позже.",
    genericError:
      "Не получилось подготовить объяснение сейчас. Попробуйте ещё раз чуть позже.",
    statusConnected: (lang: string, lastDate: string | null) =>
      `Статус: WHOOP подключён ✅\nЯзык: ${lang}\n` +
      (lastDate ? `Последняя сводка: ${lastDate}` : "Сводок пока не было."),
    statusNotConnected: (lang: string) =>
      `Статус: WHOOP не подключён ❌\nЯзык: ${lang}\n\nНажмите /connect, чтобы подключить.`,
    languageName: "русский",
    help:
      "Команды:\n/today — сводка за сегодня\n/connect — подключить WHOOP\n/lang — сменить язык\n/status — статус подключения",
  },
  uz: {
    welcome: (name: string) =>
      `Assalomu alaykum${name ? ", " + name : ""}! 👋\n\nMen WHOOP bilaguzugingiz ma'lumotlarini sodda tilda tushuntirib beraman.\n\nHar kuni ertalab sizga tushunarli xulosa yuboraman: qanday uxlaganingiz, organizm qanchalik tiklangani va bugun nima qilgan ma'qul.\n\nAvval tilni tanlang:`,
    chooseLanguage: "Tilni tanlang:",
    languageSet:
      "Til o'rnatildi: o'zbekcha. ✅\n\nEndi WHOOP hisobingizni ulang — pastdagi tugmani bosing.",
    connectButton: "🔗 WHOOP'ni ulash",
    connectPrompt:
      "WHOOP'ni ulash uchun pastdagi tugmani bosing. WHOOP sayti ochiladi — hisobingizga kiring va ruxsat bering.",
    alreadyConnected:
      "WHOOP allaqachon ulangan. ✅ Bugungi xulosa uchun /today buyrug'ini yuboring.",
    notConnected: "WHOOP hali ulanmagan. Ulash uchun /connect buyrug'ini bosing.",
    reconnect:
      "WHOOP bilan ulanish muddati tugadi. Iltimos, qaytadan ulang: /connect",
    preparing: "Xulosangizni tayyorlayapman, bir daqiqa… ⏳",
    dataNotReady:
      "WHOOP ma'lumotlari hali tayyor emas. Soat hali sinxronlashmagan bo'lishi mumkin. Keyinroq urinib ko'ring.",
    genericError:
      "Hozir tushuntirishni tayyorlab bo'lmadi. Birozdan keyin yana urinib ko'ring.",
    statusConnected: (lang: string, lastDate: string | null) =>
      `Holat: WHOOP ulangan ✅\nTil: ${lang}\n` +
      (lastDate ? `Oxirgi xulosa: ${lastDate}` : "Hozircha xulosalar bo'lmagan."),
    statusNotConnected: (lang: string) =>
      `Holat: WHOOP ulanmagan ❌\nTil: ${lang}\n\nUlash uchun /connect buyrug'ini bosing.`,
    languageName: "o'zbekcha",
    help:
      "Buyruqlar:\n/today — bugungi xulosa\n/connect — WHOOP'ni ulash\n/lang — tilni o'zgartirish\n/status — ulanish holati",
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

async function sendConnectButton(
  chatId: number,
  telegramUserId: number,
  lang: Language
): Promise<void> {
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
  await sendConnectButton(ctx.chat.id, ctx.from.id, user.language);
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
      console.error("Failed to build /today summary:", err instanceof Error ? err.message : err);
      await ctx.reply(t.genericError);
    }
  }
});

bot.help(async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(texts(user).help);
});

// Last-resort error handler so a single bad update never crashes the bot.
bot.catch((err, ctx) => {
  console.error(
    `Bot error for update ${ctx.update.update_id}:`,
    err instanceof Error ? err.message : err
  );
});

export async function notifyWhoopConnected(telegramUserId: number): Promise<void> {
  const user = await getUser(telegramUserId);
  const lang: Language = user?.language ?? "ru";
  const message =
    lang === "uz"
      ? "WHOOP muvaffaqiyatli ulandi! ✅\n\nBugungi xulosani olish uchun /today buyrug'ini yuboring. Har kuni ertalab soat 8:00 da avtomatik xulosa yuboraman."
      : "WHOOP успешно подключён! ✅\n\nОтправьте /today, чтобы получить сводку за сегодня. Каждое утро в 8:00 я буду присылать сводку автоматически.";
  await bot.telegram.sendMessage(telegramUserId, message);
}
