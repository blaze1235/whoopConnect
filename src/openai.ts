import OpenAI from "openai";
import { config, Language } from "./config";
import { NormalizedWhoopData } from "./whoop";

const SYSTEM_PROMPT = `You are a health data explainer for a non-English-speaking older adult.
You explain WHOOP wearable data in very simple language.

Rules:
- Do not diagnose disease.
- Do not claim medical certainty.
- Do not create fear.
- Use short sentences.
- Explain what the numbers mean practically.
- Give gentle suggestions only: rest, light walk, hydration, sleep earlier, avoid heavy load.
- If a metric looks unusual, recommend paying attention and consulting a doctor if the person feels unwell.
- Avoid complicated fitness terminology.
- Never say the person has a disease, is sick, has heart problems, or must take medicine.
- Base ALL advice ONLY on the provided WHOOP data.
- ALWAYS answer in the requested language (Russian or Uzbek).`;

function formatValue(value: number | null, unit = ""): string {
  return value === null ? "not available" : `${value}${unit}`;
}

function formatWorkouts(data: NormalizedWhoopData): string {
  if (data.workouts.length === 0) return "none recorded";
  return data.workouts
    .map(
      (w) =>
        `${w.type}, ${w.duration_minutes} min` +
        (w.strain !== null ? `, strain ${w.strain}` : "")
    )
    .join("; ");
}

const client = config.openaiApiKey
  ? new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl || undefined,
    })
  : null;

export async function generateExplanation(
  data: NormalizedWhoopData,
  language: Language
): Promise<string> {
  if (!client) {
    return buildLocalExplanation(data, language);
  }
  try {
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(data, language) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty AI response");
    return text;
  } catch (err) {
    console.error("AI request failed, using built-in explainer:", err);
    return buildLocalExplanation(data, language);
  }
}

export async function answerUserQuestion(
  data: NormalizedWhoopData | null,
  question: string,
  language: Language
): Promise<string> {
  console.log("=== AI DEBUG ===");
  console.log("API Key present:", !!config.openaiApiKey);
  console.log("Base URL:", config.openaiBaseUrl);
  console.log("Model:", config.openaiModel);

  if (!client) {
    console.log("No AI client - using local fallback");
    return buildLocalExplanation(data || { date: "", workouts: [] } as any, language);
  }

  const languageName = language === "ru" ? "Russian" : "Uzbek";

  const dataSummary = data 
    ? `Current WHOOP data:\nRecovery: ${formatValue(data.recovery_score, "%")}\nSleep: ${formatValue(data.sleep_performance, "%")} (${formatValue(data.sleep_hours, "h")})\nStrain: ${formatValue(data.strain)}\nHRV: ${formatValue(data.hrv)} | RHR: ${formatValue(data.resting_heart_rate)} | SpO2: ${formatValue(data.spo2, "%")}\nWorkouts: ${formatWorkouts(data)}`
    : "No recent WHOOP data available.";

  const prompt = `${dataSummary}\n\nUser question: ${question}\n\nAnswer ONLY in ${languageName} language.`;

  try {
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.5,
      max_tokens: 650,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text || buildLocalExplanation(data || { date: "", workouts: [] } as any, language);
  } catch (err) {
    console.error("Chat AI failed, falling back to local:", err);
    return buildLocalExplanation(data || { date: "", workouts: [] } as any, language);
  }
}

function buildUserPrompt(data: NormalizedWhoopData, language: Language): string {
  const languageName = language === "ru" ? "Russian" : "Uzbek";
  return `Language: ${languageName}

Explain today's WHOOP data simply.

Data:
Recovery score: ${formatValue(data.recovery_score, "%")}
Sleep performance: ${formatValue(data.sleep_performance, "%")}
Sleep hours: ${formatValue(data.sleep_hours, " h")}
Strain: ${formatValue(data.strain)}
HRV: ${formatValue(data.hrv, " ms")}
Resting heart rate: ${formatValue(data.resting_heart_rate, " bpm")}
Respiratory rate: ${formatValue(data.respiratory_rate, " breaths/min")}
SpO2: ${formatValue(data.spo2, "%")}
Workouts: ${formatWorkouts(data)}

Return the answer in this structure:

1. Short morning summary
2. Sleep explanation
3. Recovery explanation
4. Activity/strain explanation
5. What to do today

Write the entire answer only in ${languageName}. Keep it warm, calm, and simple.`;
}

// Built-in Local Explainer
type Level = "good" | "medium" | "low" | "unknown";

function recoveryLevel(score: number | null): Level {
  if (score === null) return "unknown";
  if (score >= 67) return "good";
  if (score >= 34) return "medium";
  return "low";
}

function sleepLevel(performance: number | null, hours: number | null): Level {
  if (performance === null && hours === null) return "unknown";
  const perf = performance ?? (hours !== null ? (hours / 8) * 100 : 0);
  if (perf >= 80) return "good";
  if (perf >= 60) return "medium";
  return "low";
}

function strainLevel(strain: number | null): Level {
  if (strain === null) return "unknown";
  if (strain >= 14) return "low";
  if (strain >= 8) return "medium";
  return "good";
}

interface Texts {
  greeting: (recovery: number | null) => string;
  recovery: Record<Level, string>;
  sleep: (level: Level, hours: number | null) => string;
  strain: Record<Level, string>;
  workouts: (list: string) => string;
  vitals: (rhr: number | null, hrv: number | null, spo2: number | null) => string;
  advice: Record<Level, string>;
  missing: string;
}

function formatWorkoutListLocal(data: NormalizedWhoopData, language: Language): string {
  return data.workouts
    .map((w) =>
      language === "ru"
        ? `${w.type} — ${w.duration_minutes} мин`
        : `${w.type} — ${w.duration_minutes} daqiqa`
    )
    .join(", ");
}

const RU: Texts = {
  greeting: (recovery) => recovery !== null ? `Доброе утро. Сегодня восстановление: ${recovery}%.` : "Доброе утро. Вот сводка по вашим данным.",
  recovery: {
    good: "Организм хорошо восстановился. Сегодня можно жить в обычном ритме.",
    medium: "Восстановление среднее. Организм немного устал, лучше не перегружаться.",
    low: "Восстановление низкое. Организму нужен отдых. Сегодня лучше провести день спокойно.",
    unknown: "Данные о восстановлении пока недоступны.",
  },
  sleep: (level, hours) => {
    const hoursPart = hours !== null ? ` Вы спали примерно ${hours} ч.` : "";
    switch (level) {
      case "good": return `Сон был хороший.${hoursPart} Организм успел отдохнуть.`;
      case "medium": return `Сон был нормальный, но не полный.${hoursPart} Сегодня можно лечь немного раньше.`;
      case "low": return `Сна было мало.${hoursPart} Постарайтесь сегодня лечь пораньше и отдохнуть днём, если получится.`;
      default: return "Данные о сне пока недоступны.";
    }
  },
  strain: {
    good: "Вчера нагрузка была лёгкой. Сегодня можно спокойно погулять или сделать лёгкие дела.",
    medium: "Вчера нагрузка была средней. Сегодня можно делать обычные дела и прогулку.",
    low: "Вчера нагрузка была высокой. Сегодня лучше отдохнуть и не браться за тяжёлую работу.",
    unknown: "Данные о нагрузке пока недоступны.",
  },
  workouts: (list) => `Активность: ${list}.`,
  vitals: (rhr, hrv, spo2) => {
    const parts: string[] = [];
    if (rhr !== null) parts.push(`пульс в покое ${rhr}`);
    if (hrv !== null) parts.push(`вариабельность пульса ${hrv}`);
    if (spo2 !== null) parts.push(`кислород в крови ${spo2}%`);
    if (parts.length === 0) return "";
    return `Показатели: ${parts.join(", ")}. Если вы чувствуете себя хорошо, всё в порядке. Если чувствуете себя плохо, лучше поговорить с врачом.`;
  },
  advice: {
    good: "Совет на сегодня: пейте воду, гуляйте и постарайтесь хорошо поспать вечером.",
    medium: "Совет на сегодня: пейте воду, не перегружайтесь и лягте спать пораньше.",
    low: "Совет на сегодня: больше отдыхайте, пейте воду, избегайте тяжёлых дел. Если почувствуете себя плохо, обратитесь к врачу.",
    unknown: "Совет на сегодня: пейте воду, двигайтесь понемногу и хорошо отдыхайте.",
  },
  missing: "Некоторые данные сегодня недоступны. Это нормально — часы могли ещё не синхронизироваться.",
};

const UZ: Texts = {
  greeting: (recovery) => recovery !== null ? `Xayrli tong. Bugungi tiklanish: ${recovery}%.` : "Xayrli tong. Ma'lumotlaringiz bo'yicha qisqacha xulosa.",
  recovery: {
    good: "Organizm yaxshi tiklangan. Bugun odatdagidek yashash mumkin.",
    medium: "Tiklanish o'rtacha. Organizm biroz charchagan, o'zingizni ortiqcha zo'riqtirmang.",
    low: "Tiklanish past. Organizmga dam kerak. Bugun kunni tinch o'tkazgan ma'qul.",
    unknown: "Tiklanish haqidagi ma'lumot hozircha mavjud emas.",
  },
  sleep: (level, hours) => {
    const hoursPart = hours !== null ? ` Siz taxminan ${hours} soat uxladingiz.` : "";
    switch (level) {
      case "good": return `Uyqu yaxshi bo'lgan.${hoursPart} Organizm dam olishga ulgurgan.`;
      case "medium": return `Uyqu yomon emas, lekin to'liq emas.${hoursPart} Bugun biroz ertaroq uxlash foydali bo'ladi.`;
      case "low": return `Uyqu kam bo'lgan.${hoursPart} Bugun ertaroq uxlashga harakat qiling va iloji bo'lsa kunduzi dam oling.`;
      default: return "Uyqu haqidagi ma'lumot hozircha mavjud emas.";
    }
  },
  strain: {
    good: "Kecha yuklama yengil bo'lgan. Bugun bemalol sayr qilish yoki yengil ishlarni qilish mumkin.",
    medium: "Kecha yuklama o'rtacha bo'lgan. Bugun oddiy ishlar va yurish mumkin.",
    low: "Kecha yuklama yuqori bo'lgan. Bugun dam olgan va og'ir ishlardan saqlangan ma'qul.",
    unknown: "Yuklama haqidagi ma'lumot hozircha mavjud emas.",
  },
  workouts: (list) => `Faollik: ${list}.`,
  vitals: (rhr, hrv, spo2) => {
    const parts: string[] = [];
    if (rhr !== null) parts.push(`tinch holatdagi puls ${rhr}`);
    if (hrv !== null) parts.push(`puls o'zgaruvchanligi ${hrv}`);
    if (spo2 !== null) parts.push(`qondagi kislorod ${spo2}%`);
    if (parts.length === 0) return "";
    return `Ko'rsatkichlar: ${parts.join(", ")}. O'zingizni yaxshi his qilsangiz, hammasi joyida. Agar o'zingizni yomon his qilsangiz, shifokor bilan gaplashgan ma'qul.`;
  },
  advice: {
    good: "Bugungi maslahat: ko'proq suv iching, sayr qiling va kechqurun yaxshi uxlashga harakat qiling.",
    medium: "Bugungi maslahat: suv iching, o'zingizni ortiqcha charchatmang va ertaroq uxlang.",
    low: "Bugungi maslahat: ko'proq dam oling, suv iching, og'ir ishlardan saqlaning. O'zingizni yomon his qilsangiz, shifokorga murojaat qiling.",
    unknown: "Bugungi maslahat: suv iching, ozgina harakat qiling va yaxshi dam oling.",
  },
  missing: "Bugun ba'zi ma'lumotlar mavjud emas. Bu odatiy hol — soat hali sinxronlashmagan bo'lishi mumkin.",
};

export function buildLocalExplanation(
  data: NormalizedWhoopData,
  language: Language
): string {
  const t = language === "ru" ? RU : UZ;

  const rLevel = recoveryLevel(data.recovery_score);
  const sLevel = sleepLevel(data.sleep_performance, data.sleep_hours);
  const stLevel = strainLevel(data.strain);

  const sections: string[] = [
    t.greeting(data.recovery_score),
    t.sleep(sLevel, data.sleep_hours),
    t.recovery[rLevel],
    t.strain[stLevel],
  ];

  if (data.workouts.length > 0) {
    sections.push(t.workouts(formatWorkoutListLocal(data, language)));
  }

  const vitals = t.vitals(data.resting_heart_rate, data.hrv, data.spo2);
  if (vitals) sections.push(vitals);

  const hasMissing = data.recovery_score === null || data.sleep_performance === null || data.strain === null;
  if (hasMissing) sections.push(t.missing);

  const adviceLevel: Level = rLevel === "low" || stLevel === "low" ? "low" : rLevel === "medium" || stLevel === "medium" ? "medium" : "good";
  sections.push(t.advice[adviceLevel]);

  return sections.join("\n\n");
}
