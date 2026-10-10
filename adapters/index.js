/**
 * Central Adapter Dispatcher & White-Label Sanitizer
 */
const { trackFlightGo } = require("./flightgo");
const { trackMock } = require("./mock");

function detectCarrier(trackingNumber) {
  const tn = String(trackingNumber).trim().toUpperCase();
  // 6 to 8 digits -> FlightGo AWB format (e.g. 658504)
  if (/^\d{6,8}$/.test(tn)) return "flightgo";
  if (tn.startsWith("1Z")) return "mock";
  if (tn.includes("FDX")) return "mock";
  return process.env.DEFAULT_PROVIDER || "flightgo";
}

async function trackShipment(trackingNumber, carrierOption = "auto") {
  const tn = String(trackingNumber).trim();
  const provider = (carrierOption && carrierOption !== "auto") ? carrierOption : detectCarrier(tn);

  let result;
  if (provider === "flightgo") {
    result = await trackFlightGo(tn);
  } else {
    result = await trackMock(tn);
  }

  // ========================================================
  // WHITE-LABEL STEALTH MODE (HIDE UNDERLYING CARRIER & API)
  // ========================================================
  const hideProvider = process.env.HIDE_CARRIER_PROVIDER === "true";
  const brandName = process.env.BRAND_NAME || "Express Logistics";

  if (hideProvider) {
    // Override the carrier name to the configured brand
    result.carrier = brandName;
    result.provider = "whitelabel";
    result.service = `${brandName} Priority Express`;
  }

  return result;
}

module.exports = { trackShipment };
