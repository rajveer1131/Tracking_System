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
 * Handles multiple formats:
 *   - ISO-like:              "2024-03-02 06:47:00"
 *   - DD-MM-YYYY + HH:MM:   "2025-05-08" + "10:30"
 *   - Combined AM/PM:        "23-08-2025 09:48 AM"  (QuickShip format)
 */
function parseEventTimestamp(dateStr, timeStr = "") {
  if (!dateStr) return { date: new Date(0), display: "Recent", iso: "" };

  // Combine with separate timeStr if provided (Cargo API passes date + time separately)
  let combined = dateStr.trim();
  if (timeStr && timeStr.trim()) {
    combined = `${combined} ${timeStr.trim()}`;
  }

  let parsedDate;

  // Case 1: DD-MM-YYYY format (with optional " hh:mm AM/PM" or "HH:MM:SS")
  if (/^\d{2}-\d{2}-\d{4}/.test(combined)) {
    const spaceIdx = combined.indexOf(" ");
    const datePart = combined.substring(0, spaceIdx === -1 ? combined.length : spaceIdx);
    const timePart = spaceIdx !== -1 ? combined.substring(spaceIdx + 1).trim() : "";
    const [dd, mm, yyyy] = datePart.split("-");

    if (timePart) {
      // Check for 12-hour AM/PM format: "09:48 AM" or "11:30 PM"
      const ampmMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = ampmMatch[2];
        const seconds = ampmMatch[3] || "00";
        const meridiem = ampmMatch[4].toUpperCase();
        if (meridiem === "AM" && hours === 12) hours = 0;
        if (meridiem === "PM" && hours !== 12) hours += 12;
        const hh = String(hours).padStart(2, "0");
        parsedDate = new Date(`${yyyy}-${mm}-${dd}T${hh}:${minutes}:${seconds}`);
      } else {
        // 24-hour format: "16:45" or "16:45:00"
        parsedDate = new Date(`${yyyy}-${mm}-${dd}T${timePart}`);
      }
    } else {
      parsedDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    }
  } else {
    // Case 2: ISO-like format "2024-03-02 06:47:00" or "2024-03-02T06:47:00Z"
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
