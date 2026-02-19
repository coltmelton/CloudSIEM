type AlertItem = {
  alertId: string;
  timestamp: string;
  severity: "low" | "medium" | "high";
  type: string;
  description: string;
};

type LogItem = {
  logId: string;
  timestamp: string;
  eventType: string;
  action: string;
  ipAddress: string;
  success?: boolean;
};

type StatsResponse = {
  totalLogs: number;
  bucketSeconds: number;
  buckets: Array<{ startIso: string; count: number }>;
};

const apiInput = document.getElementById("apiBase") as HTMLInputElement;
const refreshInput = document.getElementById("refreshInterval") as HTMLInputElement;
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const alertsEl = document.getElementById("alerts") as HTMLDivElement;
const logsEl = document.getElementById("logs") as HTMLDivElement;
const canvas = document.getElementById("chart") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");

let timer: number | undefined;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

function renderAlerts(alerts: AlertItem[]): void {
  alertsEl.innerHTML = alerts
    .map(
      (a) => `<div class="list-row"><span class="severity-${a.severity}">[${a.severity.toUpperCase()}]</span> ${a.type} - ${a.description}<br/><small>${new Date(a.timestamp).toLocaleString()}</small></div>`
    )
    .join("");
}

function renderLogs(logs: LogItem[]): void {
  logsEl.innerHTML = logs
    .map(
      (l) => `<div class="list-row">${l.eventType.toUpperCase()} ${l.action} ${l.success === false ? "(fail)" : ""}<br/><small>${l.ipAddress} | ${new Date(l.timestamp).toLocaleTimeString()}</small></div>`
    )
    .join("");
}

function renderChart(data: StatsResponse): void {
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 1000;
  const cssHeight = 260;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = cssWidth;
  const height = cssHeight;
  const pad = 30;
  ctx.clearRect(0, 0, width, height);

  const max = Math.max(1, ...data.buckets.map((b) => b.count));
  const stepX = (width - pad * 2) / Math.max(1, data.buckets.length - 1);

  ctx.strokeStyle = "#345";
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  ctx.strokeStyle = "#5bc0be";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.buckets.forEach((bucket, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (bucket.count / max) * (height - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#e0fbfc";
  ctx.font = "12px sans-serif";
  ctx.fillText(`Total Logs: ${data.totalLogs}`, pad, 18);
  ctx.fillText(`Bucket: ${data.bucketSeconds}s`, width - 130, 18);
}

async function refresh(): Promise<void> {
  const base = apiInput.value.trim().replace(/\/$/, "");
  if (!base) return;

  const [alertsRes, logsRes, stats] = await Promise.all([
    fetchJson<{ alerts: AlertItem[] }>(`${base}/alerts?limit=25`),
    fetchJson<{ logs: LogItem[] }>(`${base}/logs?limit=25`),
    fetchJson<StatsResponse>(`${base}/stats?windowMinutes=60`)
  ]);

  renderAlerts(alertsRes.alerts);
  renderLogs(logsRes.logs);
  renderChart(stats);
}

connectBtn.addEventListener("click", () => {
  if (timer) clearInterval(timer);
  refresh().catch((err) => console.error(err));
  const intervalMs = Math.max(2, Number(refreshInput.value || "5")) * 1000;
  timer = window.setInterval(() => refresh().catch((err) => console.error(err)), intervalMs);
});
