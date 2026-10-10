/**
 * Central Provider Registry & Tracking Service
 */
const { AppError } = require("./errors");
const { trackFlightGo } = require("./flightgo");
const { trackCargo } = require("./cargo");
const { trackMock } = require("./mock");

// Registered carriers and their documented formats
const SUPPORTED_CARRIERS = {
  flightgo: {
    id: "flightgo",
    name: "FlightGo Express",
    supportsPattern: (tn) => /^\d{6,8}$/.test(tn) // 6 to 8 digits numeric AWB
  },
  cargo: {
    id: "cargo",
    name: "Air Cargo Logistics",
    supportsPattern: (tn) => /^DK\d{5,}$/i.test(tn) || /^[A-Z]{2,4}\d{4,}$/i.test(tn) // e.g. DK00001
  },
  mock: {
    id: "mock",
    name: "Demo / Mock Provider",
    supportsPattern: (tn) => tn.startsWith("MOCK-")
  }
};

/**
 * Resolve which carrier should handle the tracking number.
 */
function resolveCarrier(trackingNumber, requestedCarrier = "auto") {
  const req = String(requestedCarrier).trim().toLowerCase();
  const tn = String(trackingNumber).trim();

  // 1. Explicit carrier selection
  if (req && req !== "auto") {
    if (!SUPPORTED_CARRIERS[req]) {
      const valid = Object.keys(SUPPORTED_CARRIERS).join(", ");
      throw new AppError(400, `Unsupported carrier '${requestedCarrier}'. Available carriers: ${valid}, auto`);
    }
    return req;
  }

  // 2. Auto-detection rules based on documented courier patterns
  if (SUPPORTED_CARRIERS.mock.supportsPattern(tn)) {
    return "mock";
  }
  if (SUPPORTED_CARRIERS.cargo.supportsPattern(tn)) {
    return "cargo";
  }
  if (SUPPORTED_CARRIERS.flightgo.supportsPattern(tn)) {
    return "flightgo";
  }

  // 3. Fallback to DEFAULT_PROVIDER if configured, or fail with a clear prompt
  const defaultProvider = process.env.DEFAULT_PROVIDER;
  if (defaultProvider && SUPPORTED_CARRIERS[defaultProvider]) {
    return defaultProvider;
  }

  throw new AppError(
    400,
    `Unable to auto-detect carrier for tracking number '${tn}'. Please select the carrier explicitly.`
  );
}

/**
 * Central track function
 */
async function trackShipment(trackingNumber, requestedCarrier = "auto") {
  const tn = String(trackingNumber).trim();
  if (!tn) {
    throw new AppError(400, "Tracking number cannot be empty.");
  }

  const carrierId = resolveCarrier(tn, requestedCarrier);

  let result;
  switch (carrierId) {
    case "flightgo":
      result = await trackFlightGo(tn);
      break;
    case "cargo":
      result = await trackCargo(tn);
      break;
    case "mock":
      if (process.env.ENABLE_MOCK !== "true" && process.env.NODE_ENV === "production") {
        throw new AppError(403, "Mock provider is disabled in production.");
      }
      result = await trackMock(tn);
      break;
    default:
      throw new AppError(400, `No adapter available for carrier '${carrierId}'.`);
  }

  // White-label display masking
  const hideProvider = process.env.HIDE_CARRIER_PROVIDER === "true";
  const brandName = process.env.BRAND_NAME || "Express Logistics";

  if (hideProvider) {
    result.meta = {
      ...result.meta,
      upstream_provider: result.carrier
    };
    result.carrier = brandName;
    result.provider = "whitelabel";
    result.service = `${brandName} Priority Tracking`;
  }

  return result;
}

module.exports = {
  trackShipment,
  resolveCarrier,
  SUPPORTED_CARRIERS
};
