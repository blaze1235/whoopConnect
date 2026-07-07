import { config } from "./config";
import { User, saveWhoopTokens, markDisconnected } from "./users";

// Overridable for tests; always the production host in normal use.
const WHOOP_HOST = process.env.WHOOP_API_HOST || "https://api.prod.whoop.com";
const OAUTH_AUTH_URL = `${WHOOP_HOST}/oauth/oauth2/auth`;
const OAUTH_TOKEN_URL = `${WHOOP_HOST}/oauth/oauth2/token`;
const API_BASE = `${WHOOP_HOST}/developer/v2`;

// "offline" is required by WHOOP to receive a refresh_token.
const SCOPES = [
  "offline",
  "read:recovery",
  "read:sleep",
  "read:workout",
  "read:cycles",
  "read:profile",
].join(" ");

/** Thrown when the user needs to reconnect WHOOP (refresh failed / revoked). */
export class WhoopAuthError extends Error {
  constructor(message = "WHOOP authorization expired") {
    super(message);
    this.name = "WhoopAuthError";
  }
}

/** Thrown when WHOOP data is not available yet (no records, still scoring). */
export class WhoopDataUnavailableError extends Error {
  constructor(message = "WHOOP data is not available yet") {
    super(message);
    this.name = "WhoopDataUnavailableError";
  }
}

export interface NormalizedWorkout {
  type: string;
  duration_minutes: number;
  strain: number | null;
}

export interface NormalizedWhoopData {
  date: string;
  recovery_score: number | null;
  sleep_performance: number | null;
  sleep_hours: number | null;
  strain: number | null;
  hrv: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  workouts: NormalizedWorkout[];
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.whoopClientId,
    redirect_uri: config.whoopRedirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    // Never log the request body: it contains secrets/tokens.
    throw new Error(`WHOOP token endpoint returned ${response.status}`);
  }
  return (await response.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.whoopClientId,
      client_secret: config.whoopClientSecret,
      redirect_uri: config.whoopRedirectUri,
    })
  );
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.whoopClientId,
      client_secret: config.whoopClientSecret,
      scope: "offline",
    })
  );
}

/**
 * Returns a valid access token for the user, refreshing it if it expires
 * within the next 2 minutes. If refreshing fails, the user is marked as
 * disconnected and WhoopAuthError is thrown so the bot can ask to reconnect.
 */
export async function getValidAccessToken(user: User): Promise<string> {
  if (!user.whoop_connected || !user.whoop_access_token) {
    throw new WhoopAuthError("WHOOP is not connected");
  }

  const expiresAt = user.whoop_token_expires_at
    ? new Date(user.whoop_token_expires_at).getTime()
    : 0;
  const stillValid = expiresAt - Date.now() > 2 * 60 * 1000;
  if (stillValid) {
    return user.whoop_access_token;
  }

  if (!user.whoop_refresh_token) {
    await markDisconnected(Number(user.telegram_user_id));
    throw new WhoopAuthError();
  }

  try {
    const tokens = await refreshTokens(user.whoop_refresh_token);
    await saveWhoopTokens(
      Number(user.telegram_user_id),
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );
    return tokens.access_token;
  } catch {
    await markDisconnected(Number(user.telegram_user_id));
    throw new WhoopAuthError();
  }
}

async function whoopGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new WhoopAuthError();
  }
  if (!response.ok) {
    throw new Error(`WHOOP API ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

interface WhoopCollection<T> {
  records: T[];
}

interface RecoveryRecord {
  score_state: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
  };
}

interface SleepRecord {
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    respiratory_rate?: number;
    stage_summary?: {
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
  };
}

interface CycleRecord {
  score_state: string;
  score?: { strain?: number };
}

interface WorkoutRecord {
  start: string;
  end: string;
  sport_name?: string;
  sport_id?: number;
  score_state: string;
  score?: { strain?: number };
}

// Minimal fallback map for older records that only carry sport_id.
const SPORT_NAMES: Record<number, string> = {
  0: "running",
  1: "cycling",
  33: "swimming",
  44: "yoga",
  48: "functional fitness",
  52: "hiking",
  63: "walking",
  71: "meditation",
  96: "HIIT",
  123: "strength training",
};

function round(value: number | undefined | null, digits = 0): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function todayInTimezone(timezone: string): string {
  // en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/**
 * Fetches the latest recovery, sleep, cycle and last-24h workouts, and
 * normalizes them into a single flat object. Missing pieces become null
 * instead of failing, so the bot can still explain partial data.
 */
export async function fetchNormalizedData(
  accessToken: string,
  timezone: string
): Promise<NormalizedWhoopData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [recoveryRes, sleepRes, cycleRes, workoutRes] = await Promise.allSettled([
    whoopGet<WhoopCollection<RecoveryRecord>>("/recovery?limit=1", accessToken),
    whoopGet<WhoopCollection<SleepRecord>>("/activity/sleep?limit=5", accessToken),
    whoopGet<WhoopCollection<CycleRecord>>("/cycle?limit=1", accessToken),
    whoopGet<WhoopCollection<WorkoutRecord>>(
      `/activity/workout?limit=10&start=${encodeURIComponent(since)}`,
      accessToken
    ),
  ]);

  // If every call failed with an auth error, surface it so the bot can
  // ask the user to reconnect instead of replying "no data".
  const results = [recoveryRes, sleepRes, cycleRes, workoutRes];
  if (
    results.every(
      (r) => r.status === "rejected" && r.reason instanceof WhoopAuthError
    )
  ) {
    throw new WhoopAuthError();
  }

  const data: NormalizedWhoopData = {
    date: todayInTimezone(timezone),
    recovery_score: null,
    sleep_performance: null,
    sleep_hours: null,
    strain: null,
    hrv: null,
    resting_heart_rate: null,
    respiratory_rate: null,
    spo2: null,
    workouts: [],
  };

  if (recoveryRes.status === "fulfilled") {
    const record = recoveryRes.value.records.find((r) => r.score_state === "SCORED");
    if (record?.score) {
      data.recovery_score = round(record.score.recovery_score);
      data.resting_heart_rate = round(record.score.resting_heart_rate);
      data.hrv = round(record.score.hrv_rmssd_milli);
      data.spo2 = round(record.score.spo2_percentage, 1);
    }
  }

  if (sleepRes.status === "fulfilled") {
    const record = sleepRes.value.records.find(
      (r) => !r.nap && r.score_state === "SCORED"
    );
    if (record?.score) {
      data.sleep_performance = round(record.score.sleep_performance_percentage);
      data.respiratory_rate = round(record.score.respiratory_rate, 1);
      const stages = record.score.stage_summary;
      if (stages) {
        const totalMilli =
          (stages.total_light_sleep_time_milli ?? 0) +
          (stages.total_slow_wave_sleep_time_milli ?? 0) +
          (stages.total_rem_sleep_time_milli ?? 0);
        if (totalMilli > 0) {
          data.sleep_hours = round(totalMilli / 3_600_000, 1);
        }
      }
    }
  }

  if (cycleRes.status === "fulfilled") {
    const record = cycleRes.value.records.find((r) => r.score_state === "SCORED");
    if (record?.score) {
      data.strain = round(record.score.strain, 1);
    }
  }

  if (workoutRes.status === "fulfilled") {
    data.workouts = workoutRes.value.records
      .filter((w) => w.score_state === "SCORED")
      .map((w) => ({
        type:
          w.sport_name ??
          (w.sport_id !== undefined ? SPORT_NAMES[w.sport_id] : undefined) ??
          "activity",
        duration_minutes:
          round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000) ?? 0,
        strain: round(w.score?.strain, 1),
      }));
  }

  const hasAnyMetric =
    data.recovery_score !== null ||
    data.sleep_performance !== null ||
    data.sleep_hours !== null ||
    data.strain !== null ||
    data.workouts.length > 0;
  if (!hasAnyMetric) {
    throw new WhoopDataUnavailableError();
  }

  return data;
}
