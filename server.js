/**
 * White-Label Parcel Tracker — Node.js Express Server
 */
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { trackShipment } = require("./adapters");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "public")));

// 1. Branding Endpoint (dynamically configures UI per user/.env)
app.get("/api/branding", (req, res) => {
  res.json({
    brandName: process.env.BRAND_NAME || "B.S. International",
    tagline: process.env.BRAND_TAGLINE || "Global Express Courier & Cargo",
    supportEmail: process.env.BRAND_SUPPORT_EMAIL || "support@bsinternational.com",
    hideProvider: process.env.HIDE_CARRIER_PROVIDER === "true"
  });
});

// 2. Track Shipment Endpoint
app.get("/api/track", async (req, res) => {
  const trackingNumber = (req.query.number || req.query.tracking || "").trim();
  const carrier = req.query.carrier || "auto";

  if (!trackingNumber) {
    return res.status(400).json({ success: false, error: "Tracking number or AWB is required." });
  }

  try {
    const data = await trackShipment(trackingNumber, carrier);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Fallback for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("==================================================");
  console.log(`🚀 ${process.env.BRAND_NAME || "Tracking Portal"} running at http://localhost:${PORT}`);
  console.log(`🔒 Stealth Mode (Hide Provider): ${process.env.HIDE_CARRIER_PROVIDER === "true" ? "ENABLED (White-label)" : "DISABLED"}`);
  console.log("==================================================");
});
