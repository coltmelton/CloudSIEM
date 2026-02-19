import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ddbDoc } from "./awsClients";
import { ENV } from "./env";
import { AlertRecord, StoredLog } from "../types/models";

const LOG_PK = "LOG";
const ALERT_PK = "ALERT";

function logActorKey(log: StoredLog): string {
  if (log.eventType === "auth" && log.userId) return `AUTH_USER#${log.userId}`;
  if (log.eventType === "api" && log.apiKeyId) return `API_KEY#${log.apiKeyId}`;
  return `IP#${log.ipAddress}`;
}

export async function putLog(log: StoredLog): Promise<void> {
  const actorKey = logActorKey(log);
  await ddbDoc.send(
    new PutCommand({
      TableName: ENV.tableName,
      Item: {
        pk: LOG_PK,
        sk: `${log.timestamp}#${log.logId}`,
        entityType: "LOG",
        actorKey,
        gsi1pk: "ACTOR",
        gsi1sk: `${actorKey}#${log.timestamp}`,
        ...log
      }
    })
  );
}

export async function putAlert(alert: Omit<AlertRecord, "alertId" | "timestamp">): Promise<AlertRecord> {
  const fullAlert: AlertRecord = {
    alertId: uuidv4(),
    timestamp: new Date().toISOString(),
    ...alert
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ENV.tableName,
      Item: {
        pk: ALERT_PK,
        sk: `${fullAlert.timestamp}#${fullAlert.alertId}`,
        entityType: "ALERT",
        gsi1pk: "ALERT",
        gsi1sk: fullAlert.timestamp,
        ...fullAlert
      }
    })
  );

  return fullAlert;
}

export async function queryRecentActorEvents(actorKey: string, sinceIso: string): Promise<StoredLog[]> {
  const data = await ddbDoc.send(
    new QueryCommand({
      TableName: ENV.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "gsi1pk = :pk and gsi1sk >= :sk",
      ExpressionAttributeValues: {
        ":pk": "ACTOR",
        ":sk": `${actorKey}#${sinceIso}`
      }
    })
  );

  return (data.Items || []).filter((item) => item.actorKey === actorKey) as StoredLog[];
}

export async function queryRecentLogs(limit = 100): Promise<StoredLog[]> {
  const data = await ddbDoc.send(
    new QueryCommand({
      TableName: ENV.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": LOG_PK },
      ScanIndexForward: false,
      Limit: limit
    })
  );
  return (data.Items || []) as StoredLog[];
}

export async function queryRecentAlerts(limit = 100): Promise<AlertRecord[]> {
  const data = await ddbDoc.send(
    new QueryCommand({
      TableName: ENV.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": ALERT_PK },
      ScanIndexForward: false,
      Limit: limit
    })
  );
  return (data.Items || []) as AlertRecord[];
}

export function buildStoredLog(input: Omit<StoredLog, "logId" | "timestamp"> & { timestamp?: string }): StoredLog {
  return {
    ...input,
    logId: uuidv4(),
    timestamp: input.timestamp || new Date().toISOString()
  };
}
