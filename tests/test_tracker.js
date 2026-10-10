/**
 * Unit & Integration Test Suite for Tracking_System
 * Runs with Node.js built-in test runner: node --test
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { resolveCarrier, trackShipment, SUPPORTED_CARRIERS } = require("../adapters");
const { inferMilestone, normalizeShipmentStatus, calculateProgress, parseEventTimestamp } = require("../adapters/utils");
const { normalizeFlightGo } = require("../adapters/flightgo");
const { normalizeCargoResponse } = require("../adapters/cargo");
const { normalizeQuickShip } = require("../adapters/quickship");

describe("1. Carrier Resolution & Detection", () => {
  test("Resolves 6-8 digit numeric AWB to flightgo", () => {
    assert.equal(resolveCarrier("658504", "auto"), "flightgo");
    assert.equal(resolveCarrier("27092730", "auto"), "flightgo");
  });

  test("Resolves DK format or prefix to cargo", () => {
    assert.equal(resolveCarrier("DK00001", "auto"), "cargo");
    assert.equal(resolveCarrier("DK99999", "auto"), "cargo");
  });

  test("Resolves QS-prefixed AWB to quickship", () => {
    assert.equal(resolveCarrier("QS20000319", "auto"), "quickship");
    assert.equal(resolveCarrier("QS2109880", "auto"), "quickship");
    assert.equal(resolveCarrier("qs20000319", "auto"), "quickship"); // case-insensitive
  });

  test("Explicit carrier overrides auto-detection", () => {
    assert.equal(resolveCarrier("658504", "cargo"), "cargo");
    assert.equal(resolveCarrier("DK00001", "flightgo"), "flightgo");
    assert.equal(resolveCarrier("QS20000319", "flightgo"), "flightgo");
  });

  test("Rejects unsupported carrier with 400 error", () => {
    assert.throws(
      () => resolveCarrier("12345", "unsupported_carrier"),
      (err) => err.statusCode === 400 && err.message.includes("Unsupported carrier")
    );
  });
});

describe("2. Milestone & Event Normalization", () => {
  test("Infers individual event milestones accurately", () => {
    assert.equal(inferMilestone("Delivered to neighbour at 248"), "delivered");
    assert.equal(inferMilestone("Out for delivery on courier vehicle"), "out_for_delivery");
    assert.equal(inferMilestone("Shipment Departed sorting hub"), "in_transit");
    assert.equal(inferMilestone("Shipment Information Received"), "pre_transit");
    assert.equal(inferMilestone("Delivery attempt failed - recipient absent"), "exception");
  });

  test("Calculates progress based on status", () => {
    assert.equal(calculateProgress("delivered"), 100);
    assert.equal(calculateProgress("out_for_delivery"), 85);
    assert.equal(calculateProgress("in_transit"), 65);
    assert.equal(calculateProgress("pickup"), 35);
  });
});

describe("3. FlightGo Express Normalization", () => {
  test("Normalizes FlightGo response into unified contract", () => {
    const raw = {
      tracking_code: "658504",
      destination: "United Kingdom",
      status: "delivered",
      est_delivery_date: "02-03-2024",
      weight: "13.630",
      tracking_details: [
        { message: "Shipment Information Received", location: "Nadiad, India", timestamp: "2024-02-27 19:45:11" },
        { message: "Your parcel has been delivered to your neighbour", location: "DPD UK", timestamp: "2024-03-02 06:47:00" }
      ]
    };

    const res = normalizeFlightGo(raw);
    assert.equal(res.tracking_number, "658504");
    assert.equal(res.status, "delivered");
    assert.equal(res.destination, "United Kingdom");
    assert.equal(res.progress_percentage, 100);
    assert.equal(res.checkpoints.length, 2);

    // Verify chronological sort: newest first
    assert.equal(res.checkpoints[0].milestone, "delivered");
    assert.equal(res.checkpoints[1].milestone, "pre_transit"); // Was NOT overwritten by overall status!
  });
});

describe("4. Cargo Airway Bill Normalization", () => {
  test("Normalizes Cargo Bearer Token API into unified contract", () => {
    const rawEvents = [
      { airway_bill: "DK00001", event_date: "2025-05-08", event_time: "10:30", location: "Delhi", remark: "Picked up" },
      { airway_bill: "DK00001", event_date: "2025-05-09", event_time: "16:45", location: "Mumbai", remark: "Delivered to consignee" }
    ];

    const res = normalizeCargoResponse("DK00001", rawEvents);
    assert.equal(res.tracking_number, "DK00001");
    assert.equal(res.status, "delivered");
    assert.equal(res.origin, "Delhi");
    assert.equal(res.destination, "Mumbai");
    assert.equal(res.checkpoints[0].status, "Delivered to consignee");
    assert.equal(res.checkpoints[0].milestone, "delivered");
    assert.equal(res.checkpoints[1].milestone, "pickup");
  });
});

describe("5. No Fake Results for Unknown Numbers", () => {
  test("Rejects nonexistent numbers in production (no sha256 fakes!)", async () => {
    process.env.ENABLE_MOCK = "false";
    await assert.rejects(
      async () => trackShipment("RANDOM-UNKNOWN-99999", "mock"),
      (err) => err.statusCode === 403 || err.statusCode === 404
    );
  });
});

describe("6. Express Server API Validation & Security", () => {
  const app = require("../server");
  let server;
  let baseUrl;

  test("Starts test server and validates endpoints", async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    try {
      // 1. Health endpoint
      const healthRes = await fetch(`${baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.status, "healthy");

      // 2. Branding endpoint
      const brandRes = await fetch(`${baseUrl}/api/branding`);
      assert.equal(brandRes.status, 200);
      const brandJson = await brandRes.json();
      assert.ok(brandJson.brandName);
      assert.ok(Array.isArray(brandJson.supportedCarriers));

      // 3. Reject empty tracking query
      const emptyRes = await fetch(`${baseUrl}/api/track`);
      assert.equal(emptyRes.status, 400);
      const emptyJson = await emptyRes.json();
      assert.equal(emptyJson.success, false);

      // 4. Reject dangerous/invalid tracking input characters
      const invalidRes = await fetch(`${baseUrl}/api/track?number=test%3Cscript%3E`);
      assert.equal(invalidRes.status, 400);

      // 5. Reject invalid carrier option
      const invalidCarrierRes = await fetch(`${baseUrl}/api/track?number=658504&carrier=nonexistent_courier`);
      assert.equal(invalidCarrierRes.status, 400);

    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("7. QuickShip Normalization & Date Parsing", () => {
  test("Normalizes QuickShip API response into unified contract", () => {
    const rawData = {
      awb: "QS20000319",
      lmAwb: null,
      status: "In Transit",
      events: [
        {
          location: null,
          statusCode: "101",
          statusRemark: "Booked",
          subStatusRemark: null,
          awb: "QS20000319",
          eventDate: "23-08-2025 09:48 AM"
        },
        {
          location: "Delhi Hub",
          statusCode: "201",
          statusRemark: "Picked up from shipper",
          subStatusRemark: null,
          awb: "QS20000319",
          eventDate: "23-08-2025 02:15 PM"
        },
        {
          location: "Delhi Sorting Centre",
          statusCode: "205",
          statusRemark: "In Transit - Departed sorting hub",
          subStatusRemark: null,
          awb: "QS20000319",
          eventDate: "23-08-2025 08:30 PM"
        }
      ]
    };

    const res = normalizeQuickShip("QS20000319", rawData);
    assert.equal(res.tracking_number, "QS20000319");
    assert.equal(res.carrier_code, "quickship");
    assert.equal(res.status, "in_transit");
    assert.equal(res.checkpoints.length, 3);

    // Newest first: 08:30 PM > 02:15 PM > 09:48 AM
    assert.ok(res.checkpoints[0].status.toLowerCase().includes("transit"));
    assert.equal(res.checkpoints[2].milestone, "pickup"); // Booked = pickup

    // Progress should be in_transit percentage
    assert.equal(res.progress_percentage, 65);
  });

  test("Parses QuickShip AM/PM eventDate into valid ISO timestamp", () => {
    // The parser creates a local-time Date. ISO output is UTC, so we verify using Date methods.
    const morning = parseEventTimestamp("23-08-2025 09:48 AM");
    assert.ok(!isNaN(morning.date.getTime()), "09:48 AM date should be valid");
    assert.equal(morning.date.getFullYear(), 2025, "Year should be 2025");
    assert.equal(morning.date.getMonth(), 7, "Month should be August (0-indexed)");
    assert.equal(morning.date.getDate(), 23, "Day should be 23");
    assert.equal(morning.date.getHours(), 9, "09:48 AM → hour 9");
    assert.equal(morning.date.getMinutes(), 48, "09:48 AM → minute 48");

    const afternoon = parseEventTimestamp("23-08-2025 02:15 PM");
    assert.ok(!isNaN(afternoon.date.getTime()), "02:15 PM date should be valid");
    assert.equal(afternoon.date.getHours(), 14, "02:15 PM → hour 14 (24h)");
    assert.equal(afternoon.date.getMinutes(), 15, "02:15 PM → minute 15");

    const midnight = parseEventTimestamp("01-01-2025 12:00 AM");
    assert.ok(!isNaN(midnight.date.getTime()), "12:00 AM date should be valid");
    assert.equal(midnight.date.getHours(), 0, "12:00 AM → hour 0 (midnight)");

    const noon = parseEventTimestamp("01-01-2025 12:00 PM");
    assert.ok(!isNaN(noon.date.getTime()), "12:00 PM date should be valid");
    assert.equal(noon.date.getHours(), 12, "12:00 PM → hour 12 (noon)");
  });

  test("Legacy 24-hour DD-MM-YYYY + separate timeStr still works (Cargo format)", () => {
    const ts = parseEventTimestamp("2025-05-08", "10:30");
    assert.ok(!isNaN(ts.date.getTime()), "Cargo date should be valid");
    assert.equal(ts.date.getFullYear(), 2025, "Year 2025");
    assert.equal(ts.date.getMonth(), 4, "Month May (0-indexed = 4)");
    assert.equal(ts.date.getDate(), 8, "Day 8");
    assert.equal(ts.date.getHours(), 10, "Hour 10");
    assert.equal(ts.date.getMinutes(), 30, "Minute 30");
  });
});
