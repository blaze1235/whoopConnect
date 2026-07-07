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
- ALWAYS answer in the requested language.`;

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

export async function answerUserQuestion(
  data: NormalizedWhoopData | null,
  question: string,
  language: Language
): Promise<string> {
  console.log("AI Request - Key:", !!config.openaiApiKey, "Model:", config.openaiModel);

  if (!client) {
    return buildLocalExplanation(data || { date: "", workouts: [] } as any, language);
  }

  const languageName = language === "ru" ? "Russian" : "Uzbek";

  const dataSummary = data 
    ? `Current WHOOP data:\nRecovery: ${formatValue(data.recovery_score, "%")}\nSleep: ${formatValue(data.sleep_performance, "%")} (${formatValue(data.sleep_hours, "h")})\nStrain: ${formatValue(data.strain)}\nHRV: ${formatValue(data.hrv)} | RHR: ${formatValue(data.resting_heart_rate)} | SpO2: ${formatValue(data.spo2, "%")}\nWorkouts: ${formatWorkouts(data)}`
    : "No recent WHOOP data available.";

  const prompt = `${dataSummary}\n\nUser question: ${question}\n\nAnswer in ${languageName} language only.`;

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
    console.error("AI failed, falling back to local:", err);
    return buildLocalExplanation(data || { date: "", workouts: [] } as any, language);
  }
}

// Keep your original generateExplanation, buildLocalExplanation, RU, UZ etc. below...
// (paste your existing ones at the bottom)
