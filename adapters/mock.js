/**
 * Mock Tracker Adapter for Node.js
 */
const crypto = require("crypto");

const MOCK_SHIPMENTS = {
  "FDX-9283741029": {
    carrier: "FedEx",
    status: "in_transit",
    status_text: "IN TRANSIT - AT SORTING FACILITY",
    origin: "Memphis, TN, US",
    destination: "Seattle, WA, US",
    estimated_delivery: "Oct 13, 2026, 04:30 PM",
    service: "Priority Overnight",
    weight: "2.8 kg",
    progress_percentage: 65,
    checkpoints: [
      { timestamp: "2026-10-10 14:15", status: "In Transit", location: "Chicago, IL, US", description: "Arrived at sorting hub", milestone: "in_transit" },
      { timestamp: "2026-10-10 09:30", status: "Departed", location: "Indianapolis, IN, US", description: "Departed transit station", milestone: "in_transit" },
      { timestamp: "2026-10-09 21:00", status: "Picked Up", location: "Memphis, TN, US", description: "Package picked up by courier", milestone: "pickup" }
    ]
  },
  "UPS-1Z999999999": {
    carrier: "UPS",
    status: "out_for_delivery",
    status_text: "OUT FOR DELIVERY - ON VEHICLE",
    origin: "Austin, TX, US",
    destination: "San Francisco, CA, US",
    estimated_delivery: "Today by 07:00 PM",
    service: "Next Day Air",
    weight: "1.2 kg",
    progress_percentage: 85,
    checkpoints: [
      { timestamp: "2026-10-10 08:45", status: "Out for Delivery", location: "San Francisco, CA, US", description: "Package loaded on delivery van", milestone: "out_for_delivery" },
      { timestamp: "2026-10-09 23:15", status: "In Transit", location: "Louisville, KY, US", description: "Departed Worldport hub", milestone: "in_transit" }
    ]
  }
};

async function trackMock(trackingNumber) {
  const tn = String(trackingNumber).trim().toUpperCase();
  if (MOCK_SHIPMENTS[tn]) {
    return {
      tracking_number: tn,
      ...MOCK_SHIPMENTS[tn],
      provider: "mock"
    };
  }

  // Deterministic simulation
  const hash = crypto.createHash("sha256").update(tn).digest("hex");
  const isDelivered = hash.charCodeAt(0) % 2 === 0;
  const status = isDelivered ? "delivered" : "in_transit";

  return {
    tracking_number: tn,
    carrier: "Express Logistics",
    status,
    status_text: status === "delivered" ? "DELIVERED" : "IN TRANSIT",
    origin: "Origin Distribution Hub",
    destination: "Destination Center",
    estimated_delivery: isDelivered ? "Delivered" : "In 2 business days",
    service: "Standard Air Express",
    weight: "3.5 kg",
    progress_percentage: isDelivered ? 100 : 60,
    checkpoints: [
      { timestamp: "2026-10-10 11:00", status: status === "delivered" ? "Delivered to recipient" : "In Transit", location: "Local Facility", description: "Processing scan", milestone: status },
      { timestamp: "2026-10-09 14:00", status: "Package Received", location: "Central Hub", description: "Electronic manifest received", milestone: "pre_transit" }
    ],
    provider: "mock"
  };
}

module.exports = { trackMock };
