/**
 * Normalization utilities for carrier milestones, dates, and progress.
 */

/**
 * Infer milestone for an individual checkpoint event based on its text/status.
 * Prevents past pickup/transit events from incorrectly inheriting a "delivered" milestone.
 */
function inferMilestone(text) {
  if (!text) return "in_transit";
  const s = String(text).toLowerCase().replace(/[\-_]/g, " ");

  if (s.includes("delivered") || s.includes("neighbour") || s.includes("received by") || s.includes("signed by")) {
    return "delivered";
  }
  if (s.includes("out for delivery") || s.includes("with you today") || s.includes("delivery vehicle") || s.includes("on courier") || s.includes("out for")) {
    return "out_for_delivery";
  }
  if (s.includes("departed") || s.includes("in transit") || s.includes("transit") || s.includes("depot") || s.includes("hub") || s.includes("facility") || s.includes("customs") || s.includes("flight")) {
    return "in_transit";
  }
  if (s.includes("label created") || s.includes("order details") || s.includes("information received") || s.includes("manifest created") || s.includes("electronic info")) {
    return "pre_transit";
  }
  if (s.includes("picked up") || s.includes("pickup") || s.includes("package received") || s.includes("received at facility") || s.includes("collected") || s.includes("booked") || s.includes("accepted")) {
    return "pickup";
  }
  if (s.includes("fail") || s.includes("exception") || s.includes("delay") || s.includes("hold") || s.includes("cancelled") || s.includes("returned")) {
    return "exception";
  }

  return "in_transit";
}

/**
 * Infer overall shipment status from raw text or latest event.
 */
function normalizeShipmentStatus(statusRaw) {
  if (!statusRaw) return "in_transit";
  const s = String(statusRaw).toLowerCase().replace(/[\-_]/g, " ");

  if (s.includes("delivered") || s === "delivery") return "delivered";
  if (s.includes("out for delivery") || s.includes("out for")) return "out_for_delivery";
  if (s.includes("in transit") || s.includes("transit") || s.includes("departed")) return "in_transit";
  if (s.includes("picked up") || s.includes("pickup") || s.includes("collected")) return "pickup";
  if (s.includes("pre transit") || s.includes("label") || s.includes("created") || s.includes("received")) return "pre_transit";
  if (s.includes("return") || s.includes("hold") || s.includes("fail") || s.includes("exception")) return "exception";

  return "in_transit";
}

/**
 * Calculate progress percentage from normalized shipment status.
 */
function calculateProgress(status) {
  switch (status) {
    case "pre_transit": return 15;
    case "pickup": return 35;
    case "in_transit": return 65;
    case "out_for_delivery": return 85;
    case "delivered": return 100;
    case "exception": return 70;
    default: return 50;
  }
}

/**
 * Parse date and time into a sortable timestamp and formatted display.
 */
function parseEventTimestamp(dateStr, timeStr = "") {
  if (!dateStr) return { iso: "", display: "Recent" };

  // If already combined e.g. "2024-03-02 06:47:00"
  let combined = dateStr.trim();
  if (timeStr && timeStr.trim()) {
    combined = `${combined} ${timeStr.trim()}`;
  }

  // Handle DD-MM-YYYY vs YYYY-MM-DD
  let parsedDate;
  if (/^\d{2}-\d{2}-\d{4}/.test(combined)) {
    // DD-MM-YYYY format
    const parts = combined.split(" ")[0].split("-");
    const timePart = combined.split(" ")[1] || "00:00:00";
    parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${timePart}`);
  } else {
    parsedDate = new Date(combined.replace(" ", "T"));
  }

  const isValid = !isNaN(parsedDate.getTime());
  return {
    date: isValid ? parsedDate : new Date(0),
    display: combined,
    iso: isValid ? parsedDate.toISOString() : combined
  };
}

module.exports = {
  inferMilestone,
  normalizeShipmentStatus,
  calculateProgress,
  parseEventTimestamp
};
