/**
 * FlightGo Express Adapter
 * Connects to https://flightgoexpress.com/api/track
 * Requires FLIGHTGO_API_KEY from environment variables.
 */
const https = require("https");
const { AppError } = require("./errors");
const { inferMilestone, normalizeShipmentStatus, calculateProgress, parseEventTimestamp } = require("./utils");

// Offline demo fixtures (only active when ENABLE_MOCK=true)
const SAMPLE_FLIGHTGO = {
  "658504": {
    tracking_code: "658504",
    co_full_name: "TEJASKUMAR P MAMTORA",
    fwd_awb_no: "",
    number_of_box: "1",
    weight: "13.630",
    destination: "United Kingdom",
    created_at: "2024-02-27",
    status: "delivered",
    est_delivery_date: "02-03-2024",
    signed_by: "MINALIO",
    tracking_details: [
      {
        message: "Your parcel has been delivered to your neighbour at 248, 248 and received by MINALIO",
        location: "DPD  UK",
        timestamp: "2024-03-02 06:47:00"
      },
      {
        message: "Your parcel will be with you today",
        location: "DPD  UK",
        timestamp: "2024-03-02 01:59:00"
      },
      {
        message: "We have your parcel and it's on its way to our depot",
        location: "DPD  UK",
        timestamp: "2024-03-01 16:19:00"
      },
      {
        message: "We've received your order details, but have not yet received your parcel",
        location: "Universal London Limited  UK",
        timestamp: "2024-02-27 08:46:00"
      },
      {
        message: "Shipment Departed",
        location: "Delhi facility",
        timestamp: "2024-02-28 23:00:00"
      },
      {
        message: "Shipment Information Received",
        location: "Nadiad, India",
        timestamp: "2024-02-27 19:45:11"
      }
    ]
  },
  "27092730": {
    tracking_code: "27092730",
    co_full_name: "RAJESH PATEL",
    destination: "United States",
    created_at: "2026-10-08",
    status: "in_transit",
    est_delivery_date: "14-10-2026",
    weight: "8.500",
    tracking_details: [
      {
        message: "In transit to destination facility",
        location: "New York Hub",
        timestamp: "2026-10-10 11:30:00"
      },
      {
        message: "Customs clearance completed successfully",
        location: "JFK International Airport",
        timestamp: "2026-10-09 18:20:00"
      },
      {
        message: "Shipment Departed origin facility",
        location: "Mumbai facility",
        timestamp: "2026-10-08 22:15:00"
      }
    ]
  },
  "8472910": {
    tracking_code: "8472910",
    co_full_name: "PRIYA SHARMA",
    destination: "Canada",
    created_at: "2026-10-09",
    status: "out_for_delivery",
    est_delivery_date: "10-10-2026",
    weight: "3.200",
    tracking_details: [
      {
        message: "Out with local courier for final delivery",
        location: "Toronto, ON",
        timestamp: "2026-10-10 09:15:00"
      },
      {
        message: "Arrived at local distribution sorting center",
        location: "Toronto Hub",
        timestamp: "2026-10-10 05:40:00"
      }
    ]
  }
};

/**
 * Native HTTPS helper to allow sending payloads with method POST or GET without W3C fetch errors.
 */
function requestFlightGo(method, headers, payload) {
  return new Promise((resolve, reject) => {
    const dataString = payload ? JSON.stringify(payload) : "";

    const options = {
      hostname: "flightgoexpress.com",
      port: 443,
      path: "/api/track",
      method: method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataString),
        "User-Agent": "TrackFlow-FlightGoAdapter/1.0",
        "Accept": "application/json"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on("error", (err) => reject(new AppError(502, `Network failure connecting to FlightGo: ${err.message}`)));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new AppError(504, "FlightGo connection timed out after 12 seconds"));
    });

    if (dataString) {
      req.write(dataString);
    }
    req.end();
  });
}

async function trackFlightGo(awbNumber, config = {}) {
  const cleanAwb = String(awbNumber).trim();
  const apiKey = config.apiKey || process.env.FLIGHTGO_API_KEY;
  const username = config.username || process.env.FLIGHTGO_USERNAME || "";
  const password = config.password || process.env.FLIGHTGO_PASSWORD || "";
  const isMockEnabled = process.env.ENABLE_MOCK === "true";

  // 1. If mock mode is explicitly enabled, return demo fixture if available
  if (isMockEnabled && SAMPLE_FLIGHTGO[cleanAwb]) {
    return normalizeFlightGo(SAMPLE_FLIGHTGO[cleanAwb]);
  }

  // 2. Validate API key presence (No hardcoded fallbacks!)
  if (!apiKey) {
    throw new AppError(
      500,
      "FlightGo API Key is not configured. Please set FLIGHTGO_API_KEY in your .env configuration."
    );
  }

  // 3. Prepare headers & payload
  const headers = {};
  if (username && password) {
    const authString = Buffer.from(`${username}:${password}`).toString("base64");
    headers["Authorization"] = `Basic ${authString}`;
  }

  const payload = {
    api_key: apiKey,
    awb_no: cleanAwb
  };

  // 4. Execute request with POST first, then GET fallback
  let res = await requestFlightGo("POST", headers, payload);
  if (res.status === 405 || (res.body && res.body.status !== "success" && !res.body.data)) {
    res = await requestFlightGo("GET", headers, payload);
  }

  // 5. Explicit HTTP and API Status Verification
  if (res.status === 401 || res.status === 403) {
    throw new AppError(502, "FlightGo authentication failed. Please verify FLIGHTGO_API_KEY and credentials.");
  }

  if (res.status === 404) {
    throw new AppError(404, `Shipment not found for AWB: ${cleanAwb}`);
  }

  if (!res.body || res.body.status !== "success" || !res.body.data) {
    const errorMsg = (res.body && res.body.message) || `Shipment not found for AWB: ${cleanAwb}`;
    throw new AppError(404, errorMsg);
  }

  return normalizeFlightGo(res.body.data);
}

function normalizeFlightGo(data) {
  const rawStatus = (data.status || "in_transit").toLowerCase();
  const status = normalizeShipmentStatus(rawStatus);

  // Parse and sort checkpoints chronologically
  const rawDetails = Array.isArray(data.tracking_details) ? data.tracking_details : [];
  
  const parsedCheckpoints = rawDetails.map((item) => {
    const parsedTime = parseEventTimestamp(item.timestamp || "");
    const msg = String(item.message || "Status update").trim();
    return {
      rawDate: parsedTime.date,
      timestamp: parsedTime.display,
      iso: parsedTime.iso,
      status: msg,
      location: item.location || "In Transit",
      description: msg,
      milestone: inferMilestone(msg) // Individual event milestone derived from its own message
    };
  });

  // Sort checkpoints newest first for timeline view
  parsedCheckpoints.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

  const latestScan = parsedCheckpoints[0] || {};

  return {
    tracking_number: data.tracking_code,
    carrier: "FlightGo Express",
    carrier_code: "flightgo",
    status,
    status_text: status.replace(/_/g, " ").toUpperCase(),
    origin: "Nadiad, India",
    destination: data.destination || "International",
    estimated_delivery: data.est_delivery_date || null,
    last_update: latestScan.timestamp || data.created_at || "Recent",
    service: "International Express Priority",
    weight: data.weight ? `${data.weight} kg` : null,
    progress_percentage: calculateProgress(status),
    checkpoints: parsedCheckpoints.map(c => ({
      timestamp: c.timestamp,
      status: c.status,
      location: c.location,
      description: c.description,
      milestone: c.milestone
    })),
    provider: "flightgo",
    meta: {
      consignee: data.co_full_name,
      signed_by: data.signed_by,
      boxes: data.number_of_box
    }
  };
}

module.exports = { trackFlightGo, normalizeFlightGo };
