export type EventType = "auth" | "mouse" | "api" | "system";

export interface IncomingLog {
  userId?: string;
  ipAddress: string;
  apiKeyId?: string;
  endpoint?: string;
  action: string;
  success?: boolean;
  timestamp?: string;
  eventType: EventType;
  metadata?: Record<string, unknown>;
  mousePathDistance?: number;
  expectedPathDistance?: number;
}

export interface StoredLog extends IncomingLog {
  logId: string;
  timestamp: string;
}

export interface AlertRecord {
  alertId: string;
  timestamp: string;
  severity: "low" | "medium" | "high";
  type: "BRUTE_FORCE" | "MOUSE_ANOMALY" | "API_ABUSE";
  sourceKey: string;
  description: string;
  context?: Record<string, unknown>;
}

export interface TimeBucket {
  startIso: string;
  count: number;
}
