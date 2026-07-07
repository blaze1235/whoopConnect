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
- Base ALL advice ONLY on the provided WHOOP data.`;

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
  console.log("Client created:", !!client);

  if (!client) {
    return "AI чат временно недоступен. Проверьте API ключ в настройках Railway.";
  }

  const dataSummary = data 
    ? `Current WHOOP data:\nRecovery: ${formatValue(data.recovery_score, "%")}\nSleep: ${formatValue(data.sleep_performance, "%")} (${formatValue(data.sleep_hours, "h")})\nStrain: ${formatValue(data.strain)}\nHRV: ${formatValue(data.hrv)} | RHR: ${formatValue(data.resting_heart_rate)} | SpO2: ${formatValue(data.spo2, "%")}\nWorkouts: ${formatWorkouts(data)}`
    : "No recent WHOOP data available.";

  const prompt = `${dataSummary}\n\nUser question: ${question}`;

  try {
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.5,
      max_tokens: 650,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\nAnswer ONLY based on the provided WHOOP data." },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text || "Не получилось ответить сейчас. Попробуйте позже.";
  } catch (err) {
    console.error("Chat AI failed:", err);
    return "Извините, сейчас не могу ответить. Попробуйте /today.";
  }
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

const RU: Texts = { /* your original RU object - keep as is */ };
// ... (paste your original RU, UZ and buildLocalExplanation here)

const UZ: Texts = { /* your original UZ object */ };

export function buildLocalExplanation(
  data: NormalizedWhoopData,
  language: Language
): string {
  // your original function
  const t = language === "ru" ? RU : UZ;
  // ... rest of your original buildLocalExplanation
}
