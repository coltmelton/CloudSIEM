"use strict";

// ── Type definitions (JSDoc for IDE intellisense) ──────────────────────────
/**
 * @typedef {{ severity: string, type: string, description: string, timestamp: string, alertId?: string, source?: string, region?: string }} Alert
 * @typedef {{ eventType: string, action: string, success: boolean, ipAddress: string, timestamp: string, logId?: string, userId?: string, region?: string, service?: string, requestId?: string }} Log
 * @typedef {{ buckets: { timestamp: string, count: number }[], totalLogs: number, bucketSeconds: number }} Stats
 */

// ── DOM refs ───────────────────────────────────────────────────────────────
const apiInput         = /** @type {HTMLInputElement} */  (document.getElementById("apiBase"));
const refreshInput     = /** @type {HTMLInputElement} */  (document.getElementById("refreshInterval"));
const connectBtn       = /** @type {HTMLButtonElement} */ (document.getElementById("connectBtn"));
const alertsEl         = /** @type {HTMLElement} */       (document.getElementById("alerts"));
const logsEl           = /** @type {HTMLElement} */       (document.getElementById("logs"));
const alertCountEl     = /** @type {HTMLElement} */       (document.getElementById("alertCount"));
const logCountEl       = /** @type {HTMLElement} */       (document.getElementById("logCount"));
const alertFilterEl    = /** @type {HTMLSelectElement} */ (document.getElementById("alertSeverityFilter"));
const logTypeFilterEl  = /** @type {HTMLSelectElement} */ (document.getElementById("logTypeFilter"));
const logSortOrderEl   = /** @type {HTMLSelectElement} */ (document.getElementById("logSortOrder"));
const statTotalEl      = /** @type {HTMLElement} */       (document.getElementById("statTotalVal"));
const statCritEl       = /** @type {HTMLElement} */       (document.getElementById("statCriticalVal"));
const statWarnEl       = /** @type {HTMLElement} */       (document.getElementById("statWarnVal"));
const liveBadgeEl      = /** @type {HTMLElement} */       (document.getElementById("liveBadge"));
const awsServicesEl    = /** @type {HTMLElement} */       (document.getElementById("awsServices"));
const chartMetaEl      = /** @type {HTMLElement} */       (document.getElementById("chartMeta"));
const chartToggleBtn   = /** @type {HTMLButtonElement} */ (document.getElementById("chartToggleBtn"));
const modalBackdrop    = /** @type {HTMLElement} */       (document.getElementById("modalBackdrop"));
const modalTitle       = /** @type {HTMLElement} */       (document.getElementById("modalTitle"));
const modalBody        = /** @type {HTMLElement} */       (document.getElementById("modalBody"));
const modalClose       = /** @type {HTMLButtonElement} */ (document.getElementById("modalClose"));

// ── State ─────────────────────────────────────────────────────────────────
/** @type {Alert[]} */  let allAlerts = [];
/** @type {Log[]} */    let allLogs   = [];
let timer         = 0;
let chartType     = "line"; // "line" | "bar"
/** @type {import('chart.js').Chart | null} */
let chartInstance = null;

// ── AWS service mapping ───────────────────────────────────────────────────
const AWS_SERVICES = {
  lambda:     { label: "Lambda",     color: "#ff9900", glow: "#ff990030", url: "https://console.aws.amazon.com/lambda/home" },
  dynamodb:   { label: "DynamoDB",   color: "#4d90d9", glow: "#4d90d930", url: "https://console.aws.amazon.com/dynamodbv2/home" },
  sns:        { label: "SNS",        color: "#e7157b", glow: "#e7157b30", url: "https://console.aws.amazon.com/sns/v3/home" },
  cloudwatch: { label: "CloudWatch", color: "#e17000", glow: "#e1700030", url: "https://console.aws.amazon.com/cloudwatch/home" },
  s3:         { label: "S3",         color: "#5a9e3b", glow: "#5a9e3b30", url: "https://s3.console.aws.amazon.com/s3/home" },
  ec2:        { label: "EC2",        color: "#f5a623", glow: "#f5a62330", url: "https://console.aws.amazon.com/ec2/home" },
  iam:        { label: "IAM",        color: "#dd344c", glow: "#dd344c30", url: "https://console.aws.amazon.com/iamv2/home" },
};

/** Detect AWS service from an event type or action string */
function detectService(str = "") {
  const s = str.toLowerCase();
  if (s.includes("lambda"))     return "lambda";
  if (s.includes("dynamo"))     return "dynamodb";
  if (s.includes("sns"))        return "sns";
  if (s.includes("cloudwatch")) return "cloudwatch";
  if (s.includes("s3"))         return "s3";
  if (s.includes("ec2"))        return "ec2";
  if (s.includes("iam") || s.includes("auth") || s.includes("login")) return "iam";
  return null;
}

/** Build an AWS service badge HTML string */
function awsBadge(serviceKey) {
  if (!serviceKey || !AWS_SERVICES[serviceKey]) {
    return `<span class="aws-badge default">AWS</span>`;
  }
  const svc = AWS_SERVICES[serviceKey];
  return `<span class="aws-badge ${serviceKey}" title="${svc.label}">${svc.label}</span>`;
}

// ── Mock data helpers (fill gaps when API doesn't return these fields) ────
const MOCK_REGIONS  = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];
const MOCK_SOURCES  = {
  high:   ["GuardDuty", "WAF", "CloudTrail", "SecurityHub"],
  medium: ["CloudWatch", "Config", "Inspector", "Macie"],
  low:    ["Trusted Advisor", "IAM Analyzer", "Health"],
};

function enrichAlert(a) {
  // Populate source & region from API data if present, otherwise derive a
  // plausible mock value so the modal never shows empty fields.
  return {
    ...a,
    source: a.source || MOCK_SOURCES[a.severity]?.[
      Math.abs(hashStr(a.alertId || a.timestamp)) % (MOCK_SOURCES[a.severity]?.length || 1)
    ] || "Unknown",
    region: a.region || MOCK_REGIONS[
      Math.abs(hashStr(a.timestamp)) % MOCK_REGIONS.length
    ],
  };
}

/** Simple deterministic hash so mocks stay stable across re-renders */
function hashStr(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Canonical severity label — always "WARNING" for medium, "CRITICAL" for high */
function sevLabel(severity) {
  if (severity === "high")   return "CRITICAL";
  if (severity === "medium") return "WARNING";
  return severity.toUpperCase();
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// ── Modal ─────────────────────────────────────────────────────────────────
function openModal(title, fields) {
  modalTitle.textContent = title;
  modalBody.innerHTML = fields
    .map(([key, val, full = false]) =>
      `<div class="modal-field ${full ? "full" : ""}">
        <span class="modal-key">${key}</span>
        <span class="modal-val">${val ?? "—"}</span>
      </div>`)
    .join("");
  modalBackdrop.classList.add("open");
}

function closeModal() { modalBackdrop.classList.remove("open"); }

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ── Alert rendering ───────────────────────────────────────────────────────
function renderAlerts(alerts) {
  const filterSev = alertFilterEl.value;
  // Enrich all alerts first so source/region are always populated
  const enriched  = alerts.map(enrichAlert);
  const filtered  = filterSev ? enriched.filter(a => a.severity === filterSev) : enriched;

  alertCountEl.textContent = String(filtered.length);

  if (!filtered.length) {
    alertsEl.innerHTML = emptyState("No alerts match the current filter");
    return;
  }

  alertsEl.innerHTML = filtered.map((a, i) => {
    const svcKey = detectService(a.type) || detectService(a.source || "");
    const sevCls = `sev-${a.severity}`;
    return `
    <div class="alert-row ${sevCls}" data-index="${i}" role="button" tabindex="0"
         style="animation-delay:${i * 0.04}s">
      <div class="alert-top">
        <span class="sev-badge ${a.severity}">${sevLabel(a.severity)}</span>
        ${svcKey ? awsBadge(svcKey) : ""}
        <span class="alert-type">${escHtml(a.type)}</span>
        <span class="expand-indicator">▸ details</span>
      </div>
      <div class="alert-desc">${escHtml(a.description)}</div>
      <div class="alert-meta">${new Date(a.timestamp).toLocaleString()}</div>
    </div>`;
  }).join("");

  // Attach click listeners
  alertsEl.querySelectorAll(".alert-row").forEach((el, i) => {
    el.addEventListener("click", () => {
      const a = filtered[i];
      openModal(`Alert: ${a.type}`, [
        ["Severity",    sevLabel(a.severity)],
        ["Type",        a.type],
        ["Timestamp",   new Date(a.timestamp).toLocaleString()],
        ["Source",      a.source],
        ["Region",      a.region],
        ["Alert ID",    a.alertId || "—"],
        ["Description", a.description, true],
      ]);
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") el.click(); });
  });
}

// ── Log rendering ─────────────────────────────────────────────────────────

/** Pull any extra service-specific fields from a log for the modal */
function logExtraFields(l) {
  const extras = [];
  if (l.functionName)  extras.push(["Function",    l.functionName]);
  if (l.tableName)     extras.push(["Table",        l.tableName]);
  if (l.topic)         extras.push(["Topic",        l.topic]);
  if (l.metricName)    extras.push(["Metric",       l.metricName]);
  if (l.bucket)        extras.push(["Bucket",       l.bucket]);
  if (l.instanceId)    extras.push(["Instance ID",  l.instanceId]);
  if (l.apiKeyId)      extras.push(["API Key",      l.apiKeyId]);
  if (l.endpoint)      extras.push(["Endpoint",     l.endpoint]);
  if (l.userId)        extras.push(["User ID",      l.userId]);
  if (l.requestId)     extras.push(["Request ID",   l.requestId]);
  if (l.region)        extras.push(["Region",       l.region]);
  return extras;
}

function renderLogs(logs) {
  const filterType = logTypeFilterEl.value;
  const sortOrder  = logSortOrderEl.value;

  let filtered = filterType
    ? logs.filter(l => l.eventType?.toLowerCase().includes(filterType))
    : [...logs];

  filtered.sort((a, b) => {
    const ta = parseTimestamp(a.timestamp);
    const tb = parseTimestamp(b.timestamp);
    return sortOrder === "asc" ? ta - tb : tb - ta;
  });

  logCountEl.textContent = String(filtered.length);

  if (!filtered.length) {
    logsEl.innerHTML = emptyState("No logs match the current filter");
    return;
  }

  logsEl.innerHTML = filtered.map((l, i) => {
    // eventType is the ground truth from the Python simulator — use it directly
    const eventType = l.eventType || "unknown";
    const action    = l.action    || "—";
    const svcKey    = detectService(eventType) || detectService(action);
    const isFail    = l.success === false;
    const timeStr   = formatTimestamp(l.timestamp);
    return `
    <div class="log-row ${isFail ? "fail-row" : ""}" data-index="${i}" role="button" tabindex="0"
         style="animation-delay:${i * 0.03}s">
      <div class="log-top">
        ${svcKey ? awsBadge(svcKey) : ""}
        <span class="log-event">${escHtml(eventType.toUpperCase())} · ${escHtml(action)}</span>
        ${isFail ? '<span class="fail-pill">✕ FAILED</span>' : ""}
        <span class="expand-indicator">▸ details</span>
      </div>
      <div class="log-meta">${escHtml(l.ipAddress || "—")} &nbsp;·&nbsp; ${timeStr}</div>
    </div>`;
  }).join("");

  logsEl.querySelectorAll(".log-row").forEach((el, i) => {
    el.addEventListener("click", () => {
      const l = filtered[i];
      const eventType = l.eventType || "unknown";
      const extras = logExtraFields(l);
      openModal(`Log: ${eventType} · ${l.action || "—"}`, [
        ["Event Type",  eventType],
        ["Action",      l.action      || "—"],
        ["Status",      l.success === false ? "FAILED" : "SUCCESS"],
        ["IP Address",  l.ipAddress   || "—"],
        ["Timestamp",   formatTimestamp(l.timestamp)],
        ...extras,
      ]);
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") el.click(); });
  });
}

// ── Header stats ──────────────────────────────────────────────────────────
function updateStats(alerts, stats) {
  const critical = alerts.filter(a => a.severity === "high").length;
  const warnings = alerts.filter(a => a.severity === "medium").length;

  statTotalEl.textContent  = String(stats.totalLogs ?? "—");
  statCritEl.textContent   = String(critical);
  statWarnEl.textContent   = String(warnings);
  liveBadgeEl.classList.add("active");
}

// ── AWS service activity tiles ────────────────────────────────────────────
function updateAwsTiles(logs) {
  /** @type {Record<string, number>} */
  const counts = {};
  logs.forEach(l => {
    const key = detectService(l.service || "") || detectService(l.eventType) || detectService(l.action);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });

  const keys = Object.keys(AWS_SERVICES);
  awsServicesEl.innerHTML = keys.map(key => {
    const svc   = AWS_SERVICES[key];
    const count = counts[key] || 0;
    return `
    <a class="aws-service-tile" href="${svc.url}" target="_blank" rel="noopener noreferrer"
       style="--tile-color:${svc.color};--tile-color-glow:${svc.glow}"
       title="Open ${svc.label} in AWS Console">
      <div class="aws-tile-name">${svc.label}</div>
      <div class="aws-tile-count">${count}</div>
      <div class="aws-tile-label">events</div>
    </a>`;
  }).join("");
}

// ── Timestamp helpers (fix "Invalid Date" from ISO 8601 / epoch variants) ─
/**
 * Parse a timestamp that may be an ISO string, Unix seconds, or Unix ms.
 * Returns a valid ms timestamp, or Date.now() as fallback.
 */
function parseTimestamp(ts) {
  if (!ts) return Date.now();
  // Numeric: distinguish seconds vs milliseconds
  if (typeof ts === "number") {
    return ts < 1e12 ? ts * 1000 : ts;
  }
  // String ISO: new Date handles it; also handle offset-naive by appending Z
  const s = String(ts);
  let d = new Date(s);
  if (isNaN(d.getTime()) && !s.endsWith("Z") && !s.includes("+")) {
    d = new Date(s + "Z");
  }
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

function formatTimestamp(ts) {
  return new Date(parseTimestamp(ts)).toLocaleTimeString();
}

function formatTimestampFull(ts) {
  return new Date(parseTimestamp(ts)).toLocaleString();
}


// ── Chart ─────────────────────────────────────────────────────────────────
function renderChart(data) {
  const buckets     = data.buckets || [];
  const bucketCount = buckets.length;
  const bucketSecs  = data.bucketSeconds || 60;

  // Build labels by spacing buckets evenly backwards from now.
  // This is necessary because the API often returns all buckets with the same
  // or very similar timestamps — we compute what the times *should* be based
  // on bucketSeconds so every x-axis tick and tooltip shows a distinct time.
  const nowMs = Date.now();
  const labels = buckets.map((_, i) => {
    const msAgo = (bucketCount - 1 - i) * bucketSecs * 1000;
    return new Date(nowMs - msAgo)
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  // Use unique seconds for tooltip so hovering different points shows different times
  const tooltipTimes = buckets.map((_, i) => {
    const msAgo = (bucketCount - 1 - i) * bucketSecs * 1000;
    return new Date(nowMs - msAgo)
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  });

  const counts = buckets.map(b => b.count);

  chartMetaEl.textContent = `${data.totalLogs.toLocaleString()} events · ${data.bucketSeconds}s buckets`;

  const isLine = chartType === "line";

  /** @type {import('chart.js').ChartData} */
  const chartData = {
    labels,
    datasets: [{
      label: "Log Volume",
      data: counts,
      borderColor: "#5bc0be",
      backgroundColor: isLine
        ? createGradient()
        : "rgba(91,192,190,0.5)",
      borderWidth: isLine ? 2 : 0,
      pointBackgroundColor: "#5bc0be",
      pointRadius: counts.length < 30 ? 3 : 0,
      pointHoverRadius: 5,
      tension: 0.4,
      fill: isLine,
    }],
  };

  /** @type {import('chart.js').ChartOptions} */
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: "easeInOutQuart" },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f1f35ee",
        borderColor: "#1e3556",
        borderWidth: 1,
        titleColor: "#5bc0be",
        bodyColor: "#c8dfe8",
        titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
        padding: 10,
        callbacks: {
          title: (items) => tooltipTimes[items[0].dataIndex] ?? items[0].label,
          label: (item) => ` ${item.formattedValue} events`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#6b8ba4", font: { family: "monospace", size: 10 }, maxTicksLimit: 12 },
        grid: { color: "#1e355630" },
        border: { color: "#1e3556" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#6b8ba4", font: { family: "monospace", size: 11 } },
        grid: { color: "#1e355640" },
        border: { color: "#1e3556" },
      },
    },
  };

  if (chartInstance) {
    chartInstance.data    = chartData;
    chartInstance.options = options;
    chartInstance.config.type = chartType;
    chartInstance.update("active");
  } else {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chart"));
    if (!canvas) return;
    chartInstance = new Chart(canvas, { type: chartType, data: chartData, options });
  }
}

function createGradient() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chart"));
  if (!canvas) return "rgba(91,192,190,0.2)";
  const ctx = canvas.getContext("2d");
  const h = canvas.offsetHeight || 260;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,   "rgba(91,192,190,0.35)");
  grad.addColorStop(1,   "rgba(91,192,190,0.01)");
  return grad;
}

// ── Filter / sort listeners ───────────────────────────────────────────────
alertFilterEl  .addEventListener("change", () => renderAlerts(allAlerts));
logTypeFilterEl.addEventListener("change", () => renderLogs(allLogs));
logSortOrderEl .addEventListener("change", () => renderLogs(allLogs));

// ── Chart type toggle ─────────────────────────────────────────────────────
const chartTypeLabelEl = /** @type {HTMLElement} */ (document.getElementById("chartTypeLabel"));

function updateToggleLabel() {
  // Button text is always fixed — the centered label inside the chart shows the active type
  chartToggleBtn.textContent = "Toggle Chart Type";
  if (chartTypeLabelEl) {
    chartTypeLabelEl.textContent = chartType === "line" ? "Line Graph" : "Bar Graph";
  }
}

chartToggleBtn.addEventListener("click", () => {
  chartType = chartType === "line" ? "bar" : "line";
  updateToggleLabel();
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (lastStats) renderChart(lastStats);
});

// Set initial label on page load
updateToggleLabel();

let lastStats = null;

// ── Main refresh ──────────────────────────────────────────────────────────
async function refresh() {
  const base = apiInput.value.trim().replace(/\/$/, "");
  if (!base) return;

  const [alertsRes, logsRes, stats] = await Promise.all([
    fetchJson(`${base}/alerts?limit=25`),
    fetchJson(`${base}/logs?limit=25`),
    fetchJson(`${base}/stats?windowMinutes=60`),
  ]);

  allAlerts  = alertsRes.alerts;
  allLogs    = logsRes.logs;
  lastStats  = stats;

  renderAlerts(allAlerts);
  renderLogs(allLogs);
  renderChart(stats);
  updateStats(allAlerts, stats);
  updateAwsTiles(allLogs);
}

// ── Connect ───────────────────────────────────────────────────────────────
connectBtn.addEventListener("click", () => {
  if (timer) clearInterval(timer);
  refresh().catch(console.error);
  const ms = Math.max(2, Number(refreshInput.value || "5")) * 1000;
  timer = window.setInterval(() => refresh().catch(console.error), ms);
});

// ── Helpers ───────────────────────────────────────────────────────────────
function escHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptyState(msg) {
  return `<div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    ${escHtml(msg)}
  </div>`;
}
