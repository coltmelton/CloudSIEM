import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { queryRecentAlerts, queryRecentLogs } from "../lib/store";

function response(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}

export const logsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const limit = Number(event.queryStringParameters?.limit || "100");
    const logs = await queryRecentLogs(Math.min(Math.max(limit, 1), 500));
    return response(200, { logs });
  } catch (error) {
    console.error("query_logs_error", error);
    return response(500, { error: "Internal server error" });
  }
};

export const alertsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const limit = Number(event.queryStringParameters?.limit || "100");
    const alerts = await queryRecentAlerts(Math.min(Math.max(limit, 1), 500));
    return response(200, { alerts });
  } catch (error) {
    console.error("query_alerts_error", error);
    return response(500, { error: "Internal server error" });
  }
};
