function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const ENV = {
  tableName: requireEnv("TABLE_NAME"),
  snsTopicArn: process.env.SNS_TOPIC_ARN,
  metricNamespace: process.env.METRIC_NAMESPACE || "CloudSEIM"
};
