import { config } from "./config";
import { generateExplanation } from "./openai";
import { User, saveDailySummary } from "./users";
import {
  fetchNormalizedData,
  getValidAccessToken,
  NormalizedWhoopData,
} from "./whoop";

export interface SummaryResult {
  data: NormalizedWhoopData;
  text: string;
}

/**
 * Full pipeline for one user: valid token -> WHOOP data -> explanation -> DB.
 * Throws WhoopAuthError / WhoopDataUnavailableError for the caller to translate
 * into a friendly message.
 */
export async function buildSummaryForUser(user: User): Promise<SummaryResult> {
  const accessToken = await getValidAccessToken(user);
  const data = await fetchNormalizedData(accessToken, config.timezone);
  const text = await generateExplanation(data, user.language);
  await saveDailySummary(Number(user.telegram_user_id), data.date, data, text);
  return { data, text };
}
