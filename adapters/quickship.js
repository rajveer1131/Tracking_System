/**
 * QuickShip API Adapter
 * Endpoint: GET https://qsapi.quickshipnow.com/public/v1/track/order?awb={awb}
 * Auth:     x-api-key header (or Authorization: Bearer <key>)
 * AWB fmt:  QS followed by digits, e.g. QS20000319, QS2109880
 */
const https = require("https");
const { AppError } = require("./errors");
const { inferMilestone, normalizeShipmentStatus, calculateProgress, parseEventTimestamp } = require("./utils");

// Default API base URL (overridable via env)
const DEFAULT_BASE_URL = "https://qsapi.quickshipnow.com";

// Demo fixture for offline development / testing
const SAMPLE_QUICKSHIP = {
  "QS20000319": {
    awb: "QS20000319",
    lmAwb: null,
    carrierName: "QuickShip Express",
    forwarder: "QuickShip Express",
    statusCode: "205",
    expectedDeliveryDate: null,
    pickupDate: "23-08-2025 09:00 AM",
    deliveryDate: null,
    status: "In Transit",
    events: [
      {
        location: null,
        statusCode: "101",
        subStatusCode: null,
        statusRemark: "Booked",
        subStatusRemark: null,
        awb: "QS20000319",
        lmAwb: null,
        eventDate: "23-08-2025 09:48 AM"
      },
      {
        location: "Delhi Hub",
        statusCode: "201",
        subStatusCode: null,
        statusRemark: "Picked up from shipper",
        subStatusRemark: null,
        awb: "QS20000319",
        lmAwb: null,
        eventDate: "23-08-2025 02:15 PM"
      },
      {
        location: "Delhi Sorting Centre",
        statusCode: "205",
        subStatusCode: null,
        statusRemark: "In Transit - Departed sorting hub",
        subStatusRemark: null,
        awb: "QS20000319",
        lmAwb: null,
        eventDate: "23-08-2025 08:30 PM"
      }
    ]
  }
};

/**
 * Make an HTTPS GET request to the QuickShip API.
 */
function fetchQuickShipApi(urlStr, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "User-Agent": "TrackFlow-QuickShipAdapter/1.0"
      }
    };

    const req = https.request(options, (res) => {
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

    req.on("error", (err) =>
      reject(new AppError(502, `Network error contacting QuickShip API: ${err.message}`))
    );
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new AppError(504, "QuickShip API connection timed out after 12 seconds"));
    });
    req.end();
  });
}

/**
 * Track a QuickShip AWB number.
 */
async function trackQuickShip(awbNumber, config = {}) {
  const cleanAwb = String(awbNumber).trim().toUpperCase();
  const baseUrl = config.baseUrl || process.env.QUICKSHIP_API_BASE_URL || DEFAULT_BASE_URL;
  const apiKey  = config.apiKey  || process.env.QUICKSHIP_API_KEY  || "";
  const isMockEnabled = process.env.ENABLE_MOCK === "true";

  // 1. Check demo fixture if mock mode is explicitly enabled
  if (isMockEnabled && SAMPLE_QUICKSHIP[cleanAwb]) {
    return normalizeQuickShip(cleanAwb, SAMPLE_QUICKSHIP[cleanAwb]);
  }

  // 2. Require API key in production
  if (!apiKey) {
    if (isMockEnabled) {
      // Mock mode but no fixture — return clean 404
      throw new AppError(404, `Shipment not found for AWB: ${cleanAwb}`);
    }
    throw new AppError(500, "QuickShip API key is not configured. Please set QUICKSHIP_API_KEY in .env.");
  }

  // 3. Make live GET request
  const sanitizedBase = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${sanitizedBase}/public/v1/track/order?awb=${encodeURIComponent(cleanAwb)}`;

  const res = await fetchQuickShipApi(targetUrl, apiKey);

  // 4. Handle HTTP error responses
  if (res.status === 400) {
    throw new AppError(400, `Invalid or missing AWB number: ${cleanAwb}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError(502, "Authentication failed with QuickShip API. Please verify QUICKSHIP_API_KEY.");
  }
  if (res.status === 404) {
    throw new AppError(404, `Shipment not found for AWB: ${cleanAwb}`);
  }
  if (res.status === 500 || !res.body) {
    throw new AppError(502, "QuickShip API returned an unexpected server error.");
  }
  if (res.status !== 200) {
    const msg = (res.body && res.body.message) || `QuickShip API responded with status ${res.status}`;
    throw new AppError(res.status >= 400 && res.status < 500 ? res.status : 502, msg);
  }

  // 5. Validate response shape
  const data = res.body && res.body.data;
  if (!data) {
    throw new AppError(502, "QuickShip API response is missing data field.");
  }

  const events = Array.isArray(data.events) ? data.events : [];
  if (events.length === 0) {
    throw new AppError(404, `No tracking events recorded for AWB: ${cleanAwb}`);
  }

  return normalizeQuickShip(cleanAwb, data);
}

/**
 * Normalize QuickShip API response into the unified TrackingResult contract.
 */
function normalizeQuickShip(awbNumber, data) {
  const events = Array.isArray(data.events) ? data.events : [];

  // Parse and enrich each event
  const parsedEvents = events.map((ev) => {
    // eventDate is a combined string: "DD-MM-YYYY hh:mm AM/PM"
    const parsedTime = parseEventTimestamp(ev.eventDate || "");
    const statusText = ev.statusRemark || ev.subStatusRemark || "Status Update";
    return {
      rawDate: parsedTime.date,
      timestamp: parsedTime.display,
      iso: parsedTime.iso,
      status: statusText,
      location: ev.location || "In Transit",
      description: [ev.statusRemark, ev.subStatusRemark].filter(Boolean).join(" — ") || "Scan recorded",
      milestone: inferMilestone(statusText)
    };
  });

  // Sort newest first
  parsedEvents.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

  // Derive overall shipment status
  const overallStatus = normalizeShipmentStatus(data.status || "");
  const latestEvent   = parsedEvents[0] || {};
  const oldestEvent   = parsedEvents[parsedEvents.length - 1] || {};

  const origin      = oldestEvent.location  || "Origin Facility";
  const destination = overallStatus === "delivered" ? latestEvent.location : (data.destinationCity || "Destination Facility");

  let estimatedDelivery = null;
  if (overallStatus === "delivered" && data.deliveryDate) {
    estimatedDelivery = `Delivered on ${data.deliveryDate}`;
  } else if (data.expectedDeliveryDate) {
    estimatedDelivery = `Expected by ${data.expectedDeliveryDate}`;
  }

  return {
    tracking_number: awbNumber,
    carrier: "QuickShip Express",
    carrier_code: "quickship",
    status: overallStatus,
    status_text: overallStatus.replace(/_/g, " ").toUpperCase(),
    origin,
    destination,
    estimated_delivery: estimatedDelivery,
    last_update: latestEvent.timestamp || "Recent",
    service: "QuickShip Priority Express",
    weight: null,
    progress_percentage: calculateProgress(overallStatus),
    checkpoints: parsedEvents.map((e) => ({
      timestamp: e.timestamp,
      status: e.status,
      location: e.location,
      description: e.description,
      milestone: e.milestone
    })),
    provider: "quickship"
  };
}

module.exports = { trackQuickShip, normalizeQuickShip };
