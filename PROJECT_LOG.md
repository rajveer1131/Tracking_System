# 📝 Project Log: Design Decisions, Thoughts & Changelog

**Project**: Universal White-Label Shipment Tracker  
**Configured Brand**: B.S. International  
**Stack**: Node.js, Express, Vanilla JavaScript, Tailwind CSS  
**Target Hosting Cost**: $0 / month (Vercel / Render Free Tier)  

---

## 1. Project Motivation & Core Goals

The goal of this project was to build a clean, modern tracking website where an operator can attach external courier/cargo APIs (starting with FlightGo Express) and present a unified, beautiful tracking experience to their customers.

### Key Requirements:
1. **$0 / Minimal Cost Hosting**: Capable of running permanently on free-tier platforms without server maintenance overhead.
2. **Pluggable API Architecture**: Easy to connect different APIs (FlightGo, Ship24, internal custom REST APIs) without rewriting the frontend.
3. **White-Label Branding**: Configurable per user/client (e.g., *B.S. International*) via environment variables (`.env`).
4. **Stealth Mode**: Completely hiding which underlying API/courier is being used so end-users only see the company brand and the tracking updates.

---

## 2. Key Architecture Decisions & Technical Thoughts

### Decision 1: The Adapter Pattern
* **Problem**: Every courier API returns completely different JSON shapes:
  - FlightGo returns `{ data: { tracking_code, status, tracking_details: [{ message, location, timestamp }] } }`.
  - Ship24 returns `{ data: { trackings: [{ events: [...] }] } }`.
  - Other carriers return nested arrays with different milestone codes.
* **Solution**: Implemented the **Adapter Design Pattern** in `adapters/`.
  - Each courier has its own adapter (`adapters/flightgo.js`, `adapters/mock.js`).
  - Adapters normalize external responses into a single standard Data Transfer Object (DTO):
    ```javascript
    {
      tracking_number: "658504",
      carrier: "B.S. International",
      status: "delivered", // pre_transit, in_transit, out_for_delivery, delivered, exception
      status_text: "DELIVERED",
      destination: "United Kingdom",
      checkpoints: [...]
    }
    ```
  - **Result**: The UI (`app.js`) is 100% decoupled from courier APIs. Adding a new carrier requires writing only one 20-line adapter.

---

### Decision 2: Switching from Python to 100% Node.js / Express
* **Initial State**: Built with Python 3's built-in standard library to achieve zero-dependency execution.
* **Why We Switched**: 
  - The developer's primary background is in **Node.js** and **Spring Boot**.
  - Node.js provides a familiar mental model (`express`, `req`/`res`, async/await, npm packages).
  - Cleaned up all Python files (`server.py`, `test_suite.py`, `.py` adapters) to keep the repository unified and maintainable in a single language.

---

### Decision 3: Resolving Node.js Fetch "GET with Body" Limitation
* **Problem**: 
  FlightGo Express's API documentation specifies a `GET` request with a JSON body:
  ```bash
  curl --request GET 'https://flightgoexpress.com/api/track' --data '{"api_key": "...", "awb_no": "..."}'
  ```
  When calling `fetch(url, { method: "GET", body: ... })`, modern Node.js throws:
  ```
  TypeError: Request with GET/HEAD method cannot have body.
  ```
  (This is enforced by the W3C Fetch standard).
* **Solution**:
  - Replaced `fetch` with Node's native `https.request` module in `adapters/flightgo.js`.
  - Node's `https` module does not have the W3C restriction and allows writing to request streams.
  - Implemented automatic fallback: tries `POST` first (standard for JSON payloads), falls back to `GET` with body stream, and then fallback to URL query parameters (`?api_key=...&awb_no=...`).

---

### Decision 4: White-Labeling & Stealth Mode
* **Problem**: 
  When sharing the site or deploying for a client, the operator wanted:
  1. The ability to rename the portal to their company name (e.g., *B.S. International*).
  2. To hide that a third-party courier (FlightGo Express) is fulfilling the shipment.
* **Solution**:
  - Controlled via `.env`:
    ```env
    BRAND_NAME="B.S. International"
    BRAND_TAGLINE="Global Express Courier & Cargo"
    HIDE_CARRIER_PROVIDER=true
    ```
  - **Backend Layer**: If `HIDE_CARRIER_PROVIDER=true`, `adapters/index.js` automatically masks `result.carrier = process.env.BRAND_NAME` and `result.service = "${BRAND_NAME} Priority Express"`.
  - **Frontend Layer**: `public/app.js` pulls `/api/branding` and:
    - Sets page title, header logo, and hero banners to the custom brand.
    - Hides the carrier dropdown selector.
    - Hides all "Engine" and "API" badges.

---

### Decision 5: Clean Sample Order Pills
* **Problem**: 
  Initial demo pills showed external company logos (`FedEx In Transit`, `UPS Out for Delivery`, `FlightGo AWB 658504`). This broke white-label stealth mode.
* **Solution**:
  - Replaced all branded pills with neutral Order / AWB IDs:
    - `#658504 • Delivered`
    - `#27092730 • In Transit`
    - `#8472910 • Out for Delivery`
  - Clicking any pill auto-fills the input and executes the tracking pipeline under the *B.S. International* brand without exposing third-party services.

---

## 3. Changelog

### Version 1.0.0 — Initial Release
- Built modular tracking core with Base Tracker Adapter and Mock Generator.
- Created responsive UI with progress milestones, highlights cards, and vertical scan timeline.
- Added recent inquiries tracking in browser `localStorage`.
- Configured $0 free-tier deployment options (Vercel serverless, Render).

### Version 1.1.0 — FlightGo Express Integration
- Added dedicated `FlightGoAdapter` supporting AWB lookup with API keys and Basic Auth.
- Implemented historical audit log parsing (preserving 2024 checkpoint timestamps).
- Added multi-status normalization (`pre_transit`, `in_transit`, `out_for_delivery`, `delivered`, `exception`).

### Version 1.2.0 — Migration to Pure Node.js
- Removed all Python files (`server.py`, `test_suite.py`, `render.yaml`, `api/`).
- Built Express backend (`server.js`) with static asset routing and REST endpoints.
- Ported all adapters to pure JavaScript (`adapters/flightgo.js`, `adapters/mock.js`, `adapters/index.js`).
- Moved project to permanent GitHub directory: `/home/r-linux/Documents/Github/parcel-tracker`.

### Version 1.3.0 — White-Labeling & Stealth Mode
- Added `.env` configuration for custom brand names (`BRAND_NAME="B.S. International"`).
- Added `/api/branding` endpoint for dynamic UI customization.
- Enabled `HIDE_CARRIER_PROVIDER=true` to suppress third-party API exposure.
- Fixed Node.js `fetch` GET-body constraint by implementing native `https.request` fallback.
- Sanitized demo sample buttons to display Order IDs instead of courier brand names.
- Configured `.gitignore` to prevent secret API keys from leaking to GitHub.

---

## 4. How to Add a New Carrier in the Future

To connect an additional courier in the future:
1. Create a new file in `adapters/yourcarrier.js`.
2. Implement the `track(number)` function returning the unified format:
   ```javascript
   async function track(number) {
     const raw = await callApi(number);
     return {
       tracking_number: number,
       status: "in_transit",
       status_text: "IN TRANSIT",
       destination: "...",
       checkpoints: [...]
     };
   }
   module.exports = { track };
   ```
3. Register the adapter in `adapters/index.js`.
4. Done! The frontend will automatically display the new carrier's updates without any UI modifications.
