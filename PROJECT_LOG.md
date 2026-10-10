# 📝 Project Log: Architecture, Security Audit & Changelog

**Project**: Universal White-Label Shipment & Airway Bill Tracker  
**Configured Brand**: B.S. International  
**Stack**: Node.js, Express, Vanilla JavaScript, Tailwind CSS  
**Target Hosting Cost**: $0 / month (Vercel / Render Free Tier)  
**Location**: `/home/r-linux/Documents/Github/Tracking_System`  

---

## 1. Project Overview & Multi-Carrier Capabilities

This project is a white-label shipment tracking service that connects multiple real-world logistics APIs and presents a unified, branded tracking interface to customers.

### Integrated Courier APIs:
1. **FlightGo Express**:
   - Live parcel tracking using AWB numbers (e.g. `658504`, `27092730`).
   - Authenticated via `FLIGHTGO_API_KEY` (and optional Basic Auth).
2. **Air Cargo Logistics (Bearer Token)**:
   - Live airway bill tracking via `GET {base_url}/tracking?airway_bill={awb}`.
   - Authenticated via `Authorization: Bearer <token>`.
   - Supports checkpoints with dates, times, locations, and remarks (e.g. `DK00001`).
3. **QuickShip Express**:
   - Live order tracking via `GET https://qsapi.quickshipnow.com/public/v1/track/order?awb={awb}`.
   - Authenticated via `x-api-key` and `Authorization: Bearer <key>` headers.
   - Auto-detected for `QS`-prefixed AWBs (e.g. `QS20000319`, `QS2109880`).
   - eventDate format: `"DD-MM-YYYY hh:mm AM/PM"` — handled by enhanced timestamp parser.
4. **Demo / Mock Fixtures**:
   - Strictly isolated behind `ENABLE_MOCK=true`.
   - Nonexistent tracking numbers return a clean `404 Not Found` in production.

---

## 2. Security Audit & ChatGPT Code Review Resolutions

A code audit conducted on the repository identified several areas for hardening. Below is a record of each finding and how it was addressed:

| Finding | Severity | Resolution Implemented |
| :--- | :--- | :--- |
| **Hardcoded API Key in Code & README** | High | Removed `17d734f482` fallback from `adapters/flightgo.js` and `README.md`. Credentials are now strictly enforced via `process.env.FLIGHTGO_API_KEY`. If missing, the server logs a configuration error rather than falling back to an exposed secret. Added `.gitignore` to prevent `.env` from ever being pushed to Git. |
| **Fabricated Results for Unknown Numbers** | High | Deleted sha256 hash generation from `adapters/mock.js`. In production (`ENABLE_MOCK=false`), unknown or invalid tracking numbers always return a clean `404 Not Found` with a clear message (`"Shipment not found for AWB: ..."`). |
| **Carrier Detection & Ambiguity** | Medium | Built explicit carrier resolution (`adapters/index.js`). Supports `carrier=flightgo`, `carrier=cargo`, and `carrier=auto`. Documented AWB patterns auto-route cleanly; invalid carriers are rejected with `400 Bad Request`. |
| **Tracking History & Milestone Overwriting** | Medium | Built `adapters/utils.js`. Past checkpoints no longer inherit the top-level shipment milestone. Each event calculates its own milestone (`inferMilestone`) from its actual scan remark. Checkpoints are sorted chronologically (newest first for display). Full message descriptions are preserved. |
| **Lack of Rate Limiting & Input Validation** | Medium | Added in-memory sliding-window rate limiter in `server.js` (60 req/min per IP) returning `429 Too Many Requests`. Added input validation enforcing 3–50 alphanumeric characters and rejecting script injection attempts. |
| **Vercel Serverless Export Conflict** | Low | Updated `server.js` to only run `app.listen` when executed standalone (`if (require.main === module)`), and export `module.exports = app` for Vercel's serverless runtime. |

---

## 3. Architecture Overview

```
                      ┌──────────────────────┐
                      │    Client Request    │
                      │ (Web UI or REST API) │
                      └──────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │   Express Middleware  │
                     │ • Rate Limiter (60/m) │
                     │ • Input Validation    │
                     │ • CORS & Body Parser  │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │   Provider Registry   │
                     │  (adapters/index.js)  │
                     └─────┬───────────┬─────┘
                           │           │
            ┌──────────────▼───┐   ┌───▼──────────────┐
            │ FlightGo Adapter │   │  Cargo Adapter   │
            │ (adapters/       │   │ (adapters/       │
            │  flightgo.js)    │   │  cargo.js)       │
            └──────────────┬───┘   └───┬──────────────┘
                           │           │
                     ┌─────▼───────────▼─────┐
                     │ Event Normalizer &    │
                     │ Milestone Inference   │
                     │ (adapters/utils.js)   │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │ White-Label Sanitizer │
                     │ (Masks carrier name   │
                     │ to B.S. International)│
                     └───────────┬───────────┘
                                 │
                      ┌──────────▼──────────┐
                      │ Unified 200/404 JSON│
                      └─────────────────────┘
```

---

## 4. Test Suite (`npm test`)

The project includes an automated test suite in `tests/test_tracker.js` using Node.js's built-in test runner (`node --test`).

**Coverage includes:**
1. **Carrier Resolution**: Validates pattern routing for numeric AWBs, DK prefixes, explicit carrier overrides, and 400 rejection for unsupported carriers.
2. **Milestone Inference**: Tests that scan remarks (pickup, departed, customs, out for delivery, delivered, failed) are accurately mapped to milestones.
3. **FlightGo Normalization**: Tests schema conversion, sorting, and preservation of past event milestones.
4. **Cargo Normalization**: Tests Bearer Token API array parsing, date/time combination, and origin/destination derivation.
5. **No Fake Results**: Confirms unknown tracking numbers are strictly rejected with 404 in production.
6. **Express Server Security**: Boots a dynamic port test server to verify `/health`, `/api/branding`, input validation, script injection rejection, and error responses.

Run tests anytime with:
```bash
npm test
```

---

## Changelog

### v1.3.0 — 2026-10-10 — QuickShip Express Integration

**New Features:**
- Added **`adapters/quickship.js`**: Full integration for the QuickShip Express API.
  - Endpoint: `GET https://qsapi.quickshipnow.com/public/v1/track/order?awb={awb}`
  - Auth: `x-api-key` + `Authorization: Bearer <key>` headers (dual header support).
  - Offline demo fixture for `QS20000319` (active when `ENABLE_MOCK=true`).
  - Correct HTTP error handling: 400, 401/403, 404, 500.
  - Normalizes `data.events[]` into unified `TrackingResult` contract (sorted newest-first).
- Enhanced **`adapters/utils.js`** timestamp parser:
  - Now handles `"DD-MM-YYYY hh:mm AM/PM"` format (QuickShip eventDate style).
  - Correctly converts 12-hour clock (12 AM → 0, 12 PM → 12) to 24-hour before Date parsing.
  - Legacy 24-hour and ISO formats remain fully supported.
- Registered QuickShip in **`adapters/index.js`**:
  - Added `quickship` to `SUPPORTED_CARRIERS` with auto-detect pattern `/^QS\d+$/i`.
  - Auto-detection runs before cargo check (more specific QS prefix takes priority).
  - Added `case "quickship"` to the central `trackShipment()` dispatch.
- Updated **`.env.example`**: Added `QUICKSHIP_API_BASE_URL` and `QUICKSHIP_API_KEY` credential slots.
- Updated **`public/index.html`**:
  - Added `🚀 QuickShip (QS...)` option to carrier dropdown.
  - Added `#QS20000319 • QuickShip In Transit` sample order pill (violet colour).
- Added **2 new test suites** in `tests/test_tracker.js`:
  - Suite 7 — QuickShip Normalization: schema contract, event sorting, milestone inference, progress.
  - Timestamp parser tests: AM/PM, midnight, noon, legacy 24h + separate timeStr.
- All **14 tests passing** (`npm test`).
