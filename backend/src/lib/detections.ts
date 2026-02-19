import { AlertRecord, StoredLog } from "../types/models";
import { queryRecentActorEvents } from "./store";

const BRUTE_FORCE_WINDOW_MINUTES = 10;
const BRUTE_FORCE_ATTEMPTS_THRESHOLD = 5;
const API_ABUSE_WINDOW_SECONDS = 60;
const API_ABUSE_REQUESTS_THRESHOLD = 120;
const MOUSE_ERROR_THRESHOLD = 0.35;

function sinceIso(minutesOrSecondsAgo: number, inSeconds = false): string {
  const now = Date.now();
  const deltaMs = inSeconds ? minutesOrSecondsAgo * 1000 : minutesOrSecondsAgo * 60_000;
  return new Date(now - deltaMs).toISOString();
}

async function detectBruteForce(log: StoredLog): Promise<Omit<AlertRecord, "alertId" | "timestamp"> | null> {
  if (log.eventType !== "auth" || log.success !== false || !log.userId) return null;

  const actorKey = `AUTH_USER#${log.userId}`;
  const attempts = await queryRecentActorEvents(actorKey, sinceIso(BRUTE_FORCE_WINDOW_MINUTES));
  const failed = attempts.filter((item) => item.eventType === "auth" && item.success === false).length;

  if (failed < BRUTE_FORCE_ATTEMPTS_THRESHOLD) return null;
  return {
    severity: "high",
    type: "BRUTE_FORCE",
    sourceKey: actorKey,
    description: `Detected ${failed} failed login attempts in ${BRUTE_FORCE_WINDOW_MINUTES} minutes`,
    context: { userId: log.userId, ipAddress: log.ipAddress, failedAttempts: failed }
  };
}

function detectMouseAnomaly(log: StoredLog): Omit<AlertRecord, "alertId" | "timestamp"> | null {
  if (log.eventType !== "mouse") return null;
  if (!log.expectedPathDistance || !log.mousePathDistance) return null;

  const errorRatio = Math.abs(log.expectedPathDistance - log.mousePathDistance) / log.expectedPathDistance;
  if (errorRatio < MOUSE_ERROR_THRESHOLD) return null;

  return {
    severity: "medium",
    type: "MOUSE_ANOMALY",
    sourceKey: `IP#${log.ipAddress}`,
    description: `Mouse path variance ${Math.round(errorRatio * 100)}% exceeds threshold`,
    context: {
      ipAddress: log.ipAddress,
      expectedPathDistance: log.expectedPathDistance,
      mousePathDistance: log.mousePathDistance,
      errorRatio
    }
  };
}

async function detectApiAbuse(log: StoredLog): Promise<Omit<AlertRecord, "alertId" | "timestamp"> | null> {
  if (log.eventType !== "api") return null;

  const key = log.apiKeyId ? `API_KEY#${log.apiKeyId}` : `IP#${log.ipAddress}`;
  const requests = await queryRecentActorEvents(key, sinceIso(API_ABUSE_WINDOW_SECONDS, true));
  const apiHits = requests.filter((item) => item.eventType === "api").length;

  if (apiHits < API_ABUSE_REQUESTS_THRESHOLD) return null;

  return {
    severity: "high",
    type: "API_ABUSE",
    sourceKey: key,
    description: `Detected ${apiHits} API calls in ${API_ABUSE_WINDOW_SECONDS}s`,
    context: { key, endpoint: log.endpoint, requests: apiHits }
  };
}

export async function runDetections(log: StoredLog): Promise<Array<Omit<AlertRecord, "alertId" | "timestamp">>> {
  const alerts = await Promise.all([detectBruteForce(log), Promise.resolve(detectMouseAnomaly(log)), detectApiAbuse(log)]);
  return alerts.filter((alert): alert is Omit<AlertRecord, "alertId" | "timestamp"> => Boolean(alert));
}
