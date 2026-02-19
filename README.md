# Mini Cloud Operated SIEM for Cybersecurity Monitoring

This project implements a cloud-native mini SIEM on AWS with:
- Log ingestion via API Gateway + Lambda
- Storage in DynamoDB
- Security detections for brute-force login attempts, mouse anomalies, and API abuse
- Alerts via SNS + CloudWatch metrics
- Frontend dashboard (TypeScript/HTML/CSS) deployable to S3 static hosting

## Architecture
- `POST /logs` -> Lambda `IngestFunction` -> DynamoDB + detections + SNS/CloudWatch
- `GET /logs` -> recent logs
- `GET /alerts` -> recent alerts
- `GET /stats` -> adaptive bucketed time-series for charting

## Detection Rules
- `BRUTE_FORCE`: >= 5 failed auth attempts for same user in 10 minutes
- `MOUSE_ANOMALY`: mouse path error ratio >= 35%
- `API_ABUSE`: >= 120 API events from same key/IP in 60 seconds

## Project Structure
- `backend/` TypeScript Lambda code
- `frontend/` static dashboard app
- `template.yaml` AWS SAM infrastructure template
- `Main.py` small load/test script for generating simulated events

## Deploy (AWS SAM)
1. Install prerequisites: AWS CLI, SAM CLI, Node.js 20+
2. Build frontend:
   - `cd frontend && npm install && npm run build`
3. Build and deploy stack:
   - `cd ..`
   - `sam build`
   - `sam deploy --guided`
4. Upload frontend assets to S3 bucket from stack output:
   - `aws s3 sync frontend/dist s3://<FrontendBucketName> --delete`

## Dashboard Usage
1. Open the S3 website URL from stack outputs.
2. Paste API base URL (from output `ApiBaseUrl`) into the dashboard.
3. Click `Connect` to start real-time polling.

## Test Log Generation
- Run `python3 Main.py --api-base <ApiBaseUrl> --events 200`
- This sends mixed `auth`, `mouse`, and `api` logs to trigger detections.

## Notes
- For production hardening, replace open CORS/public bucket with restricted settings and CloudFront.
- Add CloudWatch alarms on metric `SecurityAlerts` and subscribe responders to SNS.
