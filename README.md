# 📦 White-Label Parcel & AWB Tracker (Node.js & Express)

A sleek, fast, and customizable shipment tracking web application powered by **Node.js** and **Express**. Built with **white-label branding** and **stealth mode** so customers only see your company's name.

---

## ✨ Features

- **White-Label Branding via `.env`**:
  - Configure `BRAND_NAME="B.S. International"`, taglines, and support emails without editing code.
- **Stealth Mode (`HIDE_CARRIER_PROVIDER=true`)**:
  - Completely hides which underlying carrier or API is being queried (FlightGo, Ship24, etc.).
  - Removes carrier dropdowns; users simply enter their tracking / AWB number.
  - Automatically stamps results with your brand name and custom service tiers.
- **Pre-Configured Courier Integrations**:
  - **FlightGo Express**: Integrated for real-time tracking (supports AWB numbers like `658504`).
  - **Mock Engine**: Instant simulation for offline testing and demos.
- **Modern Responsive UI**:
  - Real-time progress bar (Order Created ➔ In Transit ➔ Out for Delivery ➔ Delivered).
  - Clean vertical checkpoint timeline with scan locations and timestamps.
  - 1-click clipboard copy and shareable URL tracking links (`?tracking=658504`).
  - Recent searches history saved in browser `localStorage`.
- **Zero-Cost Hosting ($0/mo)**:
  - 1-click deploy to Vercel or Render.

---

## 🚀 Quick Start (Local Setup)

### 1. Install Node.js
If you haven't installed Node.js on Fedora Linux:
```bash
sudo dnf install -y nodejs
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Your Brand (`.env`)
Edit `.env` to set your company name and API keys:
```env
BRAND_NAME="B.S. International"
BRAND_TAGLINE="Global Express Courier & Cargo"
HIDE_CARRIER_PROVIDER=true

FLIGHTGO_API_KEY="17d734f482"
```

### 4. Start the Application
```bash
npm start
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

---

## ☁️ Free Hosting ($0/Month)

### Deploy to Vercel
1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository (Vercel automatically detects `vercel.json`).
4. In Environment Variables, set your `BRAND_NAME` and `FLIGHTGO_API_KEY`.
5. Click **Deploy**. Your site is live with free HTTPS and zero monthly cost!

---

## 📂 Project Structure

```
parcel-tracker/
├── .env                       # Brand name and API credentials
├── .env.example               # Template for client deployments
├── package.json               # Node.js dependencies (express, cors, dotenv)
├── server.js                  # Main Express backend server
├── adapters/
│   ├── index.js               # Central dispatcher + white-label masking
│   ├── flightgo.js            # FlightGo Express integration
│   └── mock.js                # Built-in simulator
├── public/
│   ├── index.html             # Responsive tracking UI
│   ├── app.js                 # Frontend logic (dynamic branding)
│   └── style.css              # Custom styling
├── Dockerfile                 # Node 20 container specification
└── vercel.json                # Vercel deployment specification
```
