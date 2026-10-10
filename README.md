# 📦 White-Label Shipment & Airway Bill Tracker

A robust, hardened parcel and cargo tracking web service built with **Node.js** and **Express**. Supports **FlightGo Express**, **Bearer Token Air Cargo APIs**, **white-label branding**, and **stealth mode** so customers only see your company's name.

---

## ✨ Features

- **Genuine Multi-Carrier Support**:
  - **FlightGo Express**: Real-time package tracking with AWB lookup.
  - **Air Cargo Logistics (Bearer Token)**: Real-time airway bill tracking via `GET /tracking?airway_bill={awb}` with Bearer token authentication.
  - **Carrier Selection**: Supports explicit carrier selection (`flightgo`, `cargo`) or auto-detection.
- **Production Hardened**:
  - **No Fake Data in Production**: Nonexistent tracking numbers return a clean `404 Not Found` rather than fabricated delivery statuses.
  - **Event Normalization**: Milestones are inferred per-event from actual scan remarks, and history is sorted chronologically.
  - **Security & Rate Limiting**: Built-in 60 req/min rate limiter and input validation (protects against script injection and quota exhaustion).
  - **Secure Credentials**: Zero hardcoded credentials in source code. All secrets are managed strictly via environment variables.
- **White-Label & Stealth Mode (`HIDE_CARRIER_PROVIDER=true`)**:
  - Override carrier and service display to your brand (e.g. *B.S. International*).
  - Hides underlying third-party API providers and internal courier names.
- **Modern Responsive UI**:
  - 5-stage shipment stepper (Created ➔ Picked Up ➔ In Transit ➔ Out for Delivery ➔ Delivered).
  - Vertical timeline with locations, scan remarks, and timestamps.
  - Shareable URL links (`?tracking=...&carrier=...`).
- **Free-Tier Hosting ($0/Month)**:
  - Ready for 1-click deployment to Vercel or Render.

---

## 🚀 Quick Start (Local Setup)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your brand and credentials in `.env`:
```env
PORT=8080
NODE_ENV=development

# White-Label Branding
BRAND_NAME="B.S. International"
BRAND_TAGLINE="Global Express Courier & Cargo"
HIDE_CARRIER_PROVIDER=true

# Carrier 1: FlightGo Express
FLIGHTGO_API_KEY="your_flightgo_api_key"
FLIGHTGO_USERNAME=""
FLIGHTGO_PASSWORD=""

# Carrier 2: Air Cargo Logistics (Bearer Token)
CARGO_API_BASE_URL="https://your-cargo-api.com"
CARGO_BEARER_TOKEN="your_bearer_token"

# Demo Mode (Set false in production)
ENABLE_MOCK=true
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Start the Application
```bash
npm start
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

---

## 📡 API Endpoints

### 1. `GET /api/track`
Tracks a shipment across integrated carriers.

**Query Parameters:**
- `number` (string, required): AWB or tracking number (3–50 alphanumeric characters).
- `carrier` (string, optional): `auto` (default), `flightgo`, or `cargo`.

**Example Request:**
```bash
curl "http://localhost:8080/api/track?number=658504&carrier=flightgo"
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tracking_number": "658504",
    "carrier": "B.S. International",
    "status": "delivered",
    "status_text": "DELIVERED",
    "destination": "United Kingdom",
    "progress_percentage": 100,
    "checkpoints": [
      {
        "timestamp": "2024-03-02 06:47:00",
        "status": "Your parcel has been delivered to your neighbour",
        "location": "DPD UK",
        "milestone": "delivered"
      }
    ]
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Shipment not found for AWB: 99999999"
}
```

### 2. `GET /api/branding`
Returns public branding information and supported carriers.

### 3. `GET /health`
Health check endpoint returning uptime and status.

---

## ☁️ Deployment ($0 Free Tier)

### Deploy to Vercel
1. Push this repository to GitHub.
2. In [Vercel.com](https://vercel.com), click **"Add New Project"** and select `Tracking_System`.
3. In Environment Variables, set:
   - `BRAND_NAME`
   - `HIDE_CARRIER_PROVIDER=true`
   - `FLIGHTGO_API_KEY`
   - `CARGO_API_BASE_URL` & `CARGO_BEARER_TOKEN`
   - `ENABLE_MOCK=false` (for production)
4. Click **Deploy**. Vercel will host your application with automatic HTTPS.

---

## 📂 Project Structure

```
Tracking_System/
├── .env.example               # Sanitized environment template
├── .gitignore                 # Prevents secrets and node_modules from being committed
├── package.json               # Node.js dependencies & npm test script
├── server.js                  # Hardened Express server with rate limiting
├── adapters/
│   ├── errors.js              # Central AppError class
│   ├── utils.js               # Event milestone & timestamp normalization
│   ├── index.js               # Central Provider Registry & carrier resolution
│   ├── flightgo.js            # FlightGo Express integration (no hardcoded keys)
│   ├── cargo.js               # Bearer Token Air Cargo API integration
│   └── mock.js                # Demo fixtures (no fake sha256 generation)
├── tests/
│   └── test_tracker.js        # Automated test suite (node --test)
├── public/
│   ├── index.html             # Responsive tracking portal
│   ├── app.js                 # Frontend client logic
│   └── style.css              # Custom styling
├── Dockerfile                 # Node 20 container specification
└── vercel.json                # Vercel serverless configuration
```
