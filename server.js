/**
 * Production-Hardened Express Tracking Server
 */
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { trackShipment, SUPPORTED_CARRIERS } = require("./adapters");
const { AppError } = require("./adapters/errors");

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. CORS CONFIGURATION
// ==========================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new AppError(403, "CORS origin not allowed"));
  }
}));

app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// 2. SLIDING-WINDOW RATE LIMITER (Zero Dependency)
// ==========================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 60; // 60 requests per minute

function rateLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const now = Date.now();

  let userRequests = rateLimitMap.get(ip) || [];
  // Filter out timestamps outside the sliding window
  userRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (userRequests.length >= RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return next(new AppError(429, "Too many tracking requests. Please slow down and try again in a minute."));
  }

  userRequests.push(now);
  rateLimitMap.set(ip, userRequests);

  // Periodic cleanup of stale IPs every 5 minutes
  if (Math.random() < 0.05) {
    for (const [key, timestamps] of rateLimitMap.entries()) {
      if (timestamps.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(key);
      }
    }
  }

  next();
}

// ==========================================
// 3. INPUT VALIDATION MIDDLEWARE
// ==========================================
function validateTrackingInput(req, res, next) {
  const rawNumber = req.query.number || req.query.tracking || req.query.airway_bill;
  const rawCarrier = req.query.carrier || "auto";

  if (!rawNumber || typeof rawNumber !== "string" || !rawNumber.trim()) {
    return next(new AppError(400, "Tracking or Airway Bill number is required."));
  }

  const trackingNumber = rawNumber.trim();

  // Validate length
  if (trackingNumber.length < 3 || trackingNumber.length > 50) {
    return next(new AppError(400, "Tracking number must be between 3 and 50 characters in length."));
  }

  // Validate characters (alphanumeric, dashes, underscores, spaces)
  if (!/^[a-zA-Z0-9_\-\s]+$/.test(trackingNumber)) {
    return next(new AppError(400, "Tracking number contains invalid characters. Use letters, numbers, and dashes only."));
  }

  // Validate carrier allowlist
  const validCarriers = ["auto", ...Object.keys(SUPPORTED_CARRIERS)];
  if (!validCarriers.includes(String(rawCarrier).toLowerCase())) {
    return next(new AppError(400, `Unsupported carrier '${rawCarrier}'. Valid options: ${validCarriers.join(", ")}`));
  }

  req.validatedTrackingNumber = trackingNumber;
  req.validatedCarrier = String(rawCarrier).toLowerCase();
  next();
}

// ==========================================
// 4. API ROUTES
// ==========================================

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Branding & UI Config
app.get("/api/branding", (req, res) => {
  res.json({
    brandName: process.env.BRAND_NAME || "B.S. International",
    tagline: process.env.BRAND_TAGLINE || "Global Express Courier & Cargo",
    supportEmail: process.env.BRAND_SUPPORT_EMAIL || "support@bsinternational.com",
    hideProvider: process.env.HIDE_CARRIER_PROVIDER === "true",
    supportedCarriers: Object.values(SUPPORTED_CARRIERS)
      .filter(c => c.id !== "mock" || process.env.ENABLE_MOCK === "true")
      .map(c => ({ id: c.id, name: c.name }))
  });
});

// Track Shipment
app.get("/api/track", rateLimiter, validateTrackingInput, async (req, res, next) => {
  try {
    const data = await trackShipment(req.validatedTrackingNumber, req.validatedCarrier);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// SPA Fallback
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next(new AppError(404, `Endpoint ${req.path} not found`));
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==========================================
// 5. CENTRALIZED ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || (err.name === "AppError" ? err.statusCode : 500);
  const isProd = process.env.NODE_ENV === "production";

  // Log on server with timestamp
  console.error(`[${new Date().toISOString()}] Error ${statusCode}: ${err.message}`);
  if (statusCode >= 500 && !err.isOperational) {
    console.error(err.stack);
  }

  // Safe client response
  const clientMessage = err.isOperational || !isProd
    ? err.message
    : "An unexpected error occurred while processing your shipment. Please try again later.";

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    ...(isProd ? {} : { details: err.details })
  });
});

// ==========================================
// 6. SERVERLESS & STANDALONE COMPATIBILITY
// ==========================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`🚀 Tracking Portal running at http://localhost:${PORT}`);
    console.log(`🏢 Brand Name: ${process.env.BRAND_NAME || "B.S. International"}`);
    console.log(`🔒 Stealth Mode: ${process.env.HIDE_CARRIER_PROVIDER === "true" ? "ACTIVE" : "INACTIVE"}`);
    console.log(`🧪 Mock Engine: ${process.env.ENABLE_MOCK === "true" ? "ENABLED (Dev)" : "DISABLED (Prod)"}`);
    console.log("==================================================");
  });
}

module.exports = app;
