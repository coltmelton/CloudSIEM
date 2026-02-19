import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { IncomingLog } from "../types/models";
import { buildStoredLog, putAlert, putLog } from "../lib/store";
import { runDetections } from "../lib/detections";
import { publishAlert, publishLogMetric } from "../lib/metrics";

function response(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}

function validate(body: IncomingLog): string | null {
  if (!body) return "Missing request body";
  if (!body.ipAddress) return "ipAddress is required";
  if (!body.action) return "action is required";
  if (!body.eventType) return "eventType is required";
  return null;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const parsed = JSON.parse(event.body || "{}") as IncomingLog;
    const error = validate(parsed);
    if (error) return response(400, { error });

    const log = buildStoredLog(parsed);
    await putLog(log);
    await publishLogMetric(log.eventType);

    const candidateAlerts = await runDetections(log);
    const alerts = [];

    for (const alertInput of candidateAlerts) {
      const alert = await putAlert(alertInput);
      await publishAlert(alert);
      alerts.push(alert);
    }

    return response(201, { ok: true, logId: log.logId, alertsCreated: alerts.length, alerts });
  } catch (error) {
    console.error("ingest_error", error);
    return response(500, { error: "Internal server error" });
  }
};
