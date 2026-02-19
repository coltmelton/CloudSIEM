import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { queryRecentLogs } from "../lib/store";
import { TimeBucket } from "../types/models";

function response(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}

function buildAdaptiveBuckets(windowMinutes: number): { bucketMs: number; maxPoints: number } {
  const windowMs = windowMinutes * 60_000;
  const maxPoints = 30;
  return { bucketMs: Math.max(Math.floor(windowMs / maxPoints), 15_000), maxPoints };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const windowMinutes = Number(event.queryStringParameters?.windowMinutes || "60");
    const clampedWindow = Math.min(Math.max(windowMinutes, 5), 24 * 60);
    const now = Date.now();
    const since = now - clampedWindow * 60_000;
    const { bucketMs } = buildAdaptiveBuckets(clampedWindow);

    const logs = await queryRecentLogs(1000);
    const recent = logs.filter((log) => new Date(log.timestamp).getTime() >= since);

    const bucketMap = new Map<number, number>();
    for (const log of recent) {
      const ts = new Date(log.timestamp).getTime();
      const bucketStart = Math.floor((ts - since) / bucketMs) * bucketMs + since;
      bucketMap.set(bucketStart, (bucketMap.get(bucketStart) || 0) + 1);
    }

    const buckets: TimeBucket[] = [];
    for (let t = since; t <= now; t += bucketMs) {
      buckets.push({ startIso: new Date(t).toISOString(), count: bucketMap.get(t) || 0 });
    }

    return response(200, {
      windowMinutes: clampedWindow,
      bucketSeconds: Math.floor(bucketMs / 1000),
      totalLogs: recent.length,
      buckets
    });
  } catch (error) {
    console.error("stats_error", error);
    return response(500, { error: "Internal server error" });
  }
};
