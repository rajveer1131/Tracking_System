/**
 * Unit & Integration Test Suite for Tracking_System
 * Runs with Node.js built-in test runner: node --test
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { resolveCarrier, trackShipment, SUPPORTED_CARRIERS } = require("../adapters");
const { inferMilestone, normalizeShipmentStatus, calculateProgress } = require("../adapters/utils");
const { normalizeFlightGo } = require("../adapters/flightgo");
const { normalizeCargoResponse } = require("../adapters/cargo");

describe("1. Carrier Resolution & Detection", () => {
  test("Resolves 6-8 digit numeric AWB to flightgo", () => {
    assert.equal(resolveCarrier("658504", "auto"), "flightgo");
    assert.equal(resolveCarrier("27092730", "auto"), "flightgo");
  });

  test("Resolves DK format or prefix to cargo", () => {
    assert.equal(resolveCarrier("DK00001", "auto"), "cargo");
    assert.equal(resolveCarrier("DK99999", "auto"), "cargo");
  });

  test("Explicit carrier overrides auto-detection", () => {
    assert.equal(resolveCarrier("658504", "cargo"), "cargo");
    assert.equal(resolveCarrier("DK00001", "flightgo"), "flightgo");
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
