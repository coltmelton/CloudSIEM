import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { PublishCommand } from "@aws-sdk/client-sns";
import { cloudWatch, sns } from "./awsClients";
import { ENV } from "./env";
import { AlertRecord } from "../types/models";

export async function publishLogMetric(eventType: string): Promise<void> {
  await cloudWatch.send(
    new PutMetricDataCommand({
      Namespace: ENV.metricNamespace,
      MetricData: [
        {
          MetricName: "LogIngested",
          Value: 1,
          Unit: "Count",
          Dimensions: [{ Name: "EventType", Value: eventType }]
        }
      ]
    })
  );
}

export async function publishAlert(alert: AlertRecord): Promise<void> {
  await cloudWatch.send(
    new PutMetricDataCommand({
      Namespace: ENV.metricNamespace,
      MetricData: [
        {
          MetricName: "SecurityAlerts",
          Value: 1,
          Unit: "Count",
          Dimensions: [
            { Name: "AlertType", Value: alert.type },
            { Name: "Severity", Value: alert.severity }
          ]
        }
      ]
    })
  );

  if (!ENV.snsTopicArn) return;

  await sns.send(
    new PublishCommand({
      TopicArn: ENV.snsTopicArn,
      Subject: `[CloudSEIM] ${alert.type} (${alert.severity})`,
      Message: JSON.stringify(alert, null, 2)
    })
  );
}
