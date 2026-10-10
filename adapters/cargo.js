/**
 * Cargo / Airway Bill API Adapter (Bearer Token Auth)
 * Endpoint: GET {CARGO_API_BASE_URL}/tracking?airway_bill={airway_bill}
 */
const https = require("https");
const http = require("http");
const { AppError } = require("./errors");
const { inferMilestone, normalizeShipmentStatus, calculateProgress, parseEventTimestamp } = require("./utils");

// Demo fixture for offline development / testing
const SAMPLE_CARGO = {
  "DK00001": [
    {
      airway_bill: "DK00001",
      event_date: "2025-05-09",
      event_time: "16:45",
      location: "Mumbai Hub",
      remark: "Delivered to consignee reception"
    },
    {
      airway_bill: "DK00001",
      event_date: "2025-05-09",
      event_time: "09:15",
      location: "Mumbai",
      remark: "Out for delivery with courier van"
    },
    {
      airway_bill: "DK00001",
      event_date: "2025-05-08",
      event_time: "21:30",
      location: "Jaipur Sorting Facility",
      remark: "In transit departed sorting depot"
    },
    {
      airway_bill: "DK00001",
      event_date: "2025-05-08",
      event_time: "10:30",
      location: "Delhi",
      remark: "Picked up from shipper warehouse"
    }
  ]
};

function fetchCargoApi(urlStr, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === "http:" ? http : https;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "TrackFlow-CargoAdapter/1.0"
      }
    };

    const req = client.request(options, (res) => {
      let rawData = "";
      res.on("data", (chunk) => { rawData += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(rawData);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: rawData });
        }
      });
    });

    req.on("error", (err) => reject(new AppError(502, `Network error contacting Cargo API: ${err.message}`)));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new AppError(504, "Cargo API connection timed out after 12 seconds"));
    });
    req.end();
  });
}

async function trackCargo(awbNumber, config = {}) {
  const cleanAwb = String(awbNumber).trim().toUpperCase();
  const baseUrl = config.baseUrl || process.env.CARGO_API_BASE_URL || "";
  const token = config.token || process.env.CARGO_BEARER_TOKEN || "";
  const isMockEnabled = process.env.ENABLE_MOCK === "true";

  // 1. Check demo fixture if mock mode is explicitly enabled
  if (isMockEnabled && SAMPLE_CARGO[cleanAwb]) {
    return normalizeCargoResponse(cleanAwb, SAMPLE_CARGO[cleanAwb]);
  }

  // 2. Validate configuration in production
  if (!baseUrl) {
    if (isMockEnabled) {
      throw new AppError(404, `Shipment not found for AWB: ${cleanAwb}`);
    }
    throw new AppError(500, "Cargo API base URL is not configured. Please set CARGO_API_BASE_URL in .env.");
  }

  if (!token) {
    throw new AppError(500, "Cargo API Bearer Token is not configured. Please set CARGO_BEARER_TOKEN in .env.");
  }

  // 3. Make live GET request
  const sanitizedBase = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${sanitizedBase}/tracking?airway_bill=${encodeURIComponent(cleanAwb)}`;

  const res = await fetchCargoApi(targetUrl, token);

  // 4. Handle HTTP responses
  if (res.status === 401 || res.status === 403) {
    throw new AppError(502, "Authentication failed with Cargo API. Please verify CARGO_BEARER_TOKEN.");
  }

  if (res.status === 404) {
    throw new AppError(404, `Shipment not found for AWB: ${cleanAwb}`);
  }

  if (res.status !== 200 || !res.body) {
    const errorMsg = (res.body && res.body.message) || `Cargo API responded with status ${res.status}`;
    throw new AppError(res.status >= 400 && res.status < 500 ? res.status : 502, errorMsg);
  }

  const eventsArray = Array.isArray(res.body.data) ? res.body.data : [];
  if (eventsArray.length === 0) {
    throw new AppError(404, `No tracking events recorded for AWB: ${cleanAwb}`);
  }

  return normalizeCargoResponse(cleanAwb, eventsArray);
}

function normalizeCargoResponse(awbNumber, eventsArray) {
  // Parse and sort events chronologically (newest first for timeline)
  const parsedEvents = eventsArray.map((ev) => {
    const parsedTime = parseEventTimestamp(ev.event_date, ev.event_time);
    return {
      rawDate: parsedTime.date,
      timestamp: parsedTime.display,
      iso: parsedTime.iso,
      status: ev.remark || "Status Update",
      location: ev.location || "In Transit",
      description: ev.remark || "Scan recorded",
      milestone: inferMilestone(ev.remark)
    };
  });

  // Sort newest first
  parsedEvents.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

  // Derive overall shipment status from the most recent event
  const latestEvent = parsedEvents[0] || {};
  const status = normalizeShipmentStatus(latestEvent.status);

  // Derive origin from the oldest event and destination from newest/latest if available
  const oldestEvent = parsedEvents[parsedEvents.length - 1] || {};
  const origin = oldestEvent.location || "Origin Facility";
  const destination = status === "delivered" ? latestEvent.location : "Destination Facility";

  return {
    tracking_number: awbNumber,
    carrier: "Air Cargo Logistics",
    carrier_code: "cargo",
    status,
    status_text: status.replace(/_/g, " ").toUpperCase(),
    origin,
    destination,
    estimated_delivery: status === "delivered" ? `Delivered on ${latestEvent.timestamp.split(" ")[0]}` : null,
    last_update: latestEvent.timestamp || "Recent",
    service: "Airway Bill Cargo Express",
    weight: null,
    progress_percentage: calculateProgress(status),
    checkpoints: parsedEvents.map(e => ({
      timestamp: e.timestamp,
      status: e.status,
      location: e.location,
      description: e.description,
      milestone: e.milestone
    })),
    provider: "cargo"
  };
}

module.exports = { trackCargo, normalizeCargoResponse };
