/**
 * Mock Tracker Adapter
 * Strictly for local development and UI testing.
 * Does NOT generate fake data for unknown numbers.
 */
const { AppError } = require("./errors");
const { inferMilestone, calculateProgress } = require("./utils");

const MOCK_SHIPMENTS = {
  "MOCK-DELIVERED-001": {
    carrier: "Express Demo Logistics",
    status: "delivered",
    status_text: "DELIVERED",
    origin: "Chicago, IL, US",
    destination: "New York, NY, US",
    estimated_delivery: "Delivered yesterday at 03:45 PM",
    service: "Standard Express Air",
    weight: "2.4 kg",
    checkpoints: [
      { timestamp: "2026-10-10 15:45", status: "Delivered to front door", location: "New York, NY, US", description: "Package delivered to front porch", milestone: "delivered" },
      { timestamp: "2026-10-10 08:30", status: "Out for delivery with courier", location: "New York Distribution", description: "Package loaded on courier van", milestone: "out_for_delivery" },
      { timestamp: "2026-10-09 20:15", status: "Arrived at regional sorting facility", location: "Newark Hub, NJ", description: "Sorting processed", milestone: "in_transit" },
      { timestamp: "2026-10-08 11:00", status: "Shipment picked up from sender", location: "Chicago, IL, US", description: "Package received", milestone: "pickup" }
    ]
  },
  "MOCK-TRANSIT-002": {
    carrier: "Express Demo Logistics",
    status: "in_transit",
    status_text: "IN TRANSIT - AT REGIONAL HUB",
    origin: "Memphis, TN, US",
    destination: "Seattle, WA, US",
    estimated_delivery: "Tomorrow by 05:00 PM",
    service: "Priority Overnight",
    weight: "4.1 kg",
    checkpoints: [
      { timestamp: "2026-10-10 14:15", status: "In Transit at sorting hub", location: "Denver Hub, CO", description: "Departed transit station", milestone: "in_transit" },
      { timestamp: "2026-10-09 21:00", status: "Picked up by courier", location: "Memphis, TN, US", description: "Package picked up from warehouse", milestone: "pickup" },
      { timestamp: "2026-10-09 16:30", status: "Shipping label created", location: "Memphis, TN, US", description: "Electronic info received", milestone: "pre_transit" }
    ]
  },
  "MOCK-OUT-003": {
    carrier: "Express Demo Logistics",
    status: "out_for_delivery",
    status_text: "OUT FOR DELIVERY",
    origin: "Austin, TX, US",
    destination: "San Francisco, CA, US",
    estimated_delivery: "Today by 07:00 PM",
    service: "Next Day Air",
    weight: "1.2 kg",
    checkpoints: [
      { timestamp: "2026-10-10 08:45", status: "Out for delivery", location: "San Francisco, CA, US", description: "Loaded onto delivery vehicle", milestone: "out_for_delivery" },
      { timestamp: "2026-10-10 05:15", status: "Arrived at delivery center", location: "San Francisco, CA, US", description: "Processing scan", milestone: "in_transit" },
      { timestamp: "2026-10-09 18:20", status: "Departed sorting facility", location: "Dallas Hub, TX", description: "In transit", milestone: "in_transit" }
    ]
  }
};

async function trackMock(trackingNumber) {
  const tn = String(trackingNumber).trim().toUpperCase();

  if (MOCK_SHIPMENTS[tn]) {
    const item = MOCK_SHIPMENTS[tn];
    return {
      tracking_number: tn,
      carrier: item.carrier,
      carrier_code: "mock",
      status: item.status,
      status_text: item.status_text,
      origin: item.origin,
      destination: item.destination,
      estimated_delivery: item.estimated_delivery,
      last_update: item.checkpoints[0].timestamp,
      service: item.service,
      weight: item.weight,
      progress_percentage: calculateProgress(item.status),
      checkpoints: item.checkpoints,
      provider: "mock"
    };
  }

  // Reject unknown tracking numbers with a clean 404 error (NO FAKE GENERATION!)
  throw new AppError(404, `Mock shipment not found for ID: ${tn}. Valid demo IDs: MOCK-DELIVERED-001, MOCK-TRANSIT-002, MOCK-OUT-003`);
}

module.exports = { trackMock };
