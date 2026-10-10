/**
 * TrackFlow Frontend Client Logic
 * Handles tracking lookups, UI state, timeline rendering, history, and API config modal.
 */

let currentTrackingData = null;
let timelineOrderNewestFirst = true;
let appConfig = null;
let availableProviders = [];

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  loadBranding();
  loadConfigAndProviders();
  loadRecentHistory();
  checkUrlParams();
});

let currentBranding = null;

// Fetch white-label branding from .env backend
async function loadBranding() {
  try {
    const res = await fetch("/api/branding");
    if (!res.ok) return;
    const branding = await res.json();
    currentBranding = branding;

    // Apply Brand Name
    if (branding.brandName) {
      document.title = `${branding.brandName} — Shipment Tracking Portal`;
      const brandEl = document.getElementById("brandNameText");
      if (brandEl) brandEl.textContent = branding.brandName;

      const heroTitle = document.getElementById("heroTitle");
      if (heroTitle) heroTitle.textContent = `Track Your ${branding.brandName} Shipment`;
    }

    if (branding.tagline) {
      const heroTag = document.getElementById("heroTagline");
      if (heroTag) heroTag.textContent = branding.tagline;
    }

    // STEALTH MODE: Hide which API is being used
    if (branding.hideProvider) {
      // 1. Hide Admin / Provider UI elements
      const pill = document.getElementById("activeProviderPill");
      if (pill) pill.classList.add("!hidden");

      const settingsBtn = document.getElementById("openSettingsBtn");
      if (settingsBtn) settingsBtn.classList.add("!hidden");

      // 2. Hide Carrier Dropdown so user only sees clean tracking input
      const carrierContainer = document.getElementById("carrierSelectContainer");
      if (carrierContainer) carrierContainer.classList.add("!hidden");

      // 3. Make input placeholder friendly
      const input = document.getElementById("trackingInput");
      if (input) input.placeholder = "Enter your Tracking / AWB number (e.g. 658504)...";

      // 4. Hide Provider Badge in results
      const providerBadge = document.getElementById("providerBadge");
      if (providerBadge) providerBadge.classList.add("!hidden");
    }
  } catch (err) {
    console.warn("Could not load branding, using defaults", err);
  }
}

// Check URL query parameters for direct tracking links (e.g. ?tracking=658504)
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const trackNum = params.get("tracking") || params.get("number");
  const carrier = params.get("carrier") || "auto";

  if (trackNum) {
    document.getElementById("trackingInput").value = trackNum;
    if (carrier) {
      document.getElementById("carrierSelect").value = carrier;
    }
    executeTrack(trackNum, carrier);
  }
}

// Fetch engine configuration and available providers
async function loadConfigAndProviders() {
  try {
    const [provRes, cfgRes] = await Promise.all([
      fetch("/api/providers").then(r => r.ok ? r.json() : { providers: [] }),
      fetch("/api/config").then(r => r.ok ? r.json() : {})
    ]);

    availableProviders = provRes.providers || [];
    appConfig = cfgRes;

    const activeProvider = provRes.active_provider || "mock";
    const activeObj = availableProviders.find(p => p.id === activeProvider);
    const activeName = activeObj ? activeObj.name.split(" ")[0] : "Active";
    
    const providerEl = document.getElementById("activeProviderName");
    if (providerEl) providerEl.textContent = activeName;
    if (typeof renderProviderCards === "function") renderProviderCards(activeProvider);
    if (typeof populateConfigFields === "function") populateConfigFields(cfgRes);
  } catch (err) {
    // Normal in stealth mode
  }
}

// Quick Fill helper for test buttons
function quickFill(number, carrier = "auto") {
  document.getElementById("trackingInput").value = number;
  const carrierSelect = document.getElementById("carrierSelect");
  if (carrierSelect) carrierSelect.value = carrier || "auto";
  executeTrack(number, carrier || "auto");
}

// Form submit handler
function handleTrack(e) {
  e.preventDefault();
  const number = document.getElementById("trackingInput").value.trim();
  const carrier = document.getElementById("carrierSelect").value;
  if (!number) return;
  executeTrack(number, carrier);
}

// Perform tracking request
async function executeTrack(number, carrier) {
  const submitBtn = document.getElementById("trackSubmitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const errorAlert = document.getElementById("errorAlert");
  const resultsContainer = document.getElementById("resultsContainer");

  // Show Loading state
  submitBtn.disabled = true;
  btnText.textContent = "Tracking...";
  btnSpinner.classList.remove("hidden");
  errorAlert.classList.add("hidden");

  try {
    const url = `/api/track?number=${encodeURIComponent(number)}&carrier=${encodeURIComponent(carrier)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Unable to fetch tracking data.");
    }

    currentTrackingData = data.data;
    renderTrackingResults(currentTrackingData);
    saveToHistory(currentTrackingData);

    // Update URL query string without reloading
    const newUrl = `${window.location.pathname}?tracking=${encodeURIComponent(number)}&carrier=${encodeURIComponent(carrier)}`;
    window.history.replaceState({}, "", newUrl);

    // Smooth scroll down to results
    resultsContainer.classList.remove("hidden");
    resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (err) {
    document.getElementById("errorMessage").textContent = err.message;
    errorAlert.classList.remove("hidden");
    resultsContainer.classList.add("hidden");
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = "Track Package";
    btnSpinner.classList.add("hidden");
  }
}

// Render the tracking result in the UI
function renderTrackingResults(data) {
  // Carrier & Provider badges
  document.getElementById("carrierBadge").textContent = data.carrier;
  document.getElementById("providerBadge").textContent = `Engine: ${data.provider.toUpperCase()}`;
  document.getElementById("trackingNumberDisplay").textContent = data.tracking_number;

  // Status Badge with Color Coding
  const statusBadge = document.getElementById("statusBadge");
  const statusBadgeText = document.getElementById("statusBadgeText");
  statusBadgeText.textContent = data.status_text;

  // Colors based on normalized status
  statusBadge.className = "px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2 shadow-sm border";
  if (data.status === "delivered") {
    statusBadge.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
    statusBadge.querySelector("span").className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
  } else if (data.status === "out_for_delivery") {
    statusBadge.classList.add("bg-amber-50", "text-amber-700", "border-amber-200");
    statusBadge.querySelector("span").className = "w-2.5 h-2.5 rounded-full bg-amber-500";
  } else if (data.status === "exception") {
    statusBadge.classList.add("bg-rose-50", "text-rose-700", "border-rose-200");
    statusBadge.querySelector("span").className = "w-2.5 h-2.5 rounded-full bg-rose-500";
  } else {
    // In transit / pre-transit
    statusBadge.classList.add("bg-blue-50", "text-blue-700", "border-blue-200");
    statusBadge.querySelector("span").className = "w-2.5 h-2.5 rounded-full bg-blue-500";
  }

  // Progress Bar & Percentage
  const progress = data.progress_percentage || 20;
  document.getElementById("progressBar").style.width = `${progress}%`;
  document.getElementById("progressPercentText").textContent = `${progress}%`;

  // Milestone Step styling
  updateMilestoneSteps(data.status);

  // Key Highlights
  document.getElementById("estDeliveryDisplay").textContent = data.estimated_delivery || "Pending carrier update";
  document.getElementById("originDisplay").textContent = data.origin || "Origin Facility";
  document.getElementById("destDisplay").textContent = data.destination || "Destination Facility";
  document.getElementById("serviceDisplay").textContent = data.service || "Standard Shipping";

  // Checkpoints Timeline
  renderTimeline(data.checkpoints);
}

// Update milestone stepper states
function updateMilestoneSteps(status) {
  const steps = [
    { id: "stepInfo", done: true },
    { id: "stepPickup", done: ["pickup", "in_transit", "out_for_delivery", "delivered"].includes(status) },
    { id: "stepTransit", done: ["in_transit", "out_for_delivery", "delivered"].includes(status) },
    { id: "stepDelivered", done: status === "delivered" }
  ];

  steps.forEach(st => {
    const el = document.getElementById(st.id);
    if (!el) return;
    const badge = el.querySelector("div");
    const label = el.querySelector("p");

    if (st.done) {
      badge.className = "w-6 h-6 mx-auto rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow";
      badge.textContent = "✓";
      label.className = "font-semibold text-slate-900";
    } else {
      badge.className = "w-6 h-6 mx-auto rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs";
      label.className = "font-medium text-slate-400";
    }
  });
}

// Render checkpoint items into timeline
function renderTimeline(checkpoints) {
  const container = document.getElementById("timelineContainer");
  container.innerHTML = "";

  if (!checkpoints || checkpoints.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 py-4">No checkpoint scans recorded yet.</p>`;
    return;
  }

  // Sort checkpoints
  const list = [...checkpoints];
  if (!timelineOrderNewestFirst) {
    list.reverse();
  }

  list.forEach((cp, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === list.length - 1;

    const itemEl = document.createElement("div");
    itemEl.className = "relative flex items-start space-x-4";

    // Indicator Dot / Icon
    let dotColor = isFirst ? "bg-blue-600 ring-4 ring-blue-100 text-white" : "bg-slate-300 text-slate-600";
    if (cp.milestone === "delivered") dotColor = "bg-emerald-500 ring-4 ring-emerald-100 text-white";
    if (cp.milestone === "exception") dotColor = "bg-rose-500 ring-4 ring-rose-100 text-white";

    const stemHtml = !isLast ? `<div class="timeline-stem"></div>` : "";

    itemEl.innerHTML = `
      ${stemHtml}
      <div class="relative z-10 w-6 h-6 rounded-full ${dotColor} flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
        ${isFirst ? "●" : "○"}
      </div>
      <div class="flex-1 pb-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h4 class="text-sm font-bold text-slate-900">${escapeHtml(cp.status)}</h4>
          <span class="text-xs font-mono text-slate-500">${escapeHtml(cp.timestamp || "Time N/A")}</span>
        </div>
        <p class="text-xs font-semibold text-blue-600 mt-0.5 flex items-center space-x-1">
          <svg class="w-3.5 h-3.5 inline text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span>${escapeHtml(cp.location || "In Transit")}</span>
        </p>
        ${cp.description && cp.description !== cp.status ? `<p class="text-xs text-slate-600 mt-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">${escapeHtml(cp.description)}</p>` : ""}
      </div>
    `;

    container.appendChild(itemEl);
  });
}

function toggleTimelineSort() {
  timelineOrderNewestFirst = !timelineOrderNewestFirst;
  const btn = document.getElementById("sortToggleBtn");
  btn.querySelector("span").textContent = timelineOrderNewestFirst ? "Newest first" : "Oldest first";
  if (currentTrackingData) {
    renderTimeline(currentTrackingData.checkpoints);
  }
}

// Copy tracking number to clipboard
function copyTrackingNumber() {
  if (!currentTrackingData) return;
  navigator.clipboard.writeText(currentTrackingData.tracking_number).then(() => {
    const feedback = document.getElementById("copyFeedback");
    const icon = document.getElementById("copyIcon");
    icon.classList.add("hidden");
    feedback.classList.remove("hidden");
    setTimeout(() => {
      feedback.classList.add("hidden");
      icon.classList.remove("hidden");
    }, 2000);
  });
}

// Share tracking link
function shareTrackingLink() {
  if (navigator.share) {
    navigator.share({
      title: `Tracking ${currentTrackingData.tracking_number}`,
      url: window.location.href
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert("Tracking link copied to clipboard!");
    });
  }
}

function dismissError() {
  document.getElementById("errorAlert").classList.add("hidden");
}

// Recent History in LocalStorage
function saveToHistory(item) {
  let history = JSON.parse(localStorage.getItem("trackflow_history") || "[]");
  history = history.filter(h => h.tracking_number !== item.tracking_number);
  history.unshift({
    tracking_number: item.tracking_number,
    carrier: item.carrier,
    carrier_code: item.carrier_code,
    status: item.status,
    status_text: item.status_text,
    timestamp: new Date().toLocaleDateString()
  });
  if (history.length > 6) history = history.slice(0, 6);
  localStorage.setItem("trackflow_history", JSON.stringify(history));
  loadRecentHistory();
}

function loadRecentHistory() {
  const container = document.getElementById("recentHistoryList");
  const section = document.getElementById("recentHistorySection");
  const history = JSON.parse(localStorage.getItem("trackflow_history") || "[]");

  if (history.length === 0) {
    container.innerHTML = `<p class="col-span-full text-xs text-slate-400 py-2">No recent searches yet. Search a tracking number above to see it here.</p>`;
    return;
  }

  container.innerHTML = "";
  history.forEach(item => {
    const card = document.createElement("div");
    card.className = "p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition cursor-pointer flex items-center justify-between";
    card.onclick = () => {
      document.getElementById("trackingInput").value = item.tracking_number;
      document.getElementById("carrierSelect").value = item.carrier_code || "auto";
      executeTrack(item.tracking_number, item.carrier_code || "auto");
    };

    card.innerHTML = `
      <div>
        <div class="flex items-center space-x-1.5">
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 uppercase">${item.carrier}</span>
          <span class="text-xs font-mono font-bold text-slate-900">${item.tracking_number}</span>
        </div>
        <p class="text-[11px] text-slate-500 mt-1">${item.status_text}</p>
      </div>
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    `;
    container.appendChild(card);
  });
}

function clearHistory() {
  localStorage.removeItem("trackflow_history");
  loadRecentHistory();
}

// ----------------------------------------------------
// SETTINGS & API CONNECTOR MODAL
// ----------------------------------------------------

function openSettingsModal() {
  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
  document.getElementById("saveStatusMsg").textContent = "";
}

function switchSettingsTab(tabId) {
  ["providersTab", "keysTab", "customTab"].forEach(t => {
    document.getElementById(t).classList.add("hidden");
    const tabBtn = document.getElementById(`tabBtn-${t}`);
    tabBtn.className = "pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800";
  });

  document.getElementById(tabId).classList.remove("hidden");
  const activeBtn = document.getElementById(`tabBtn-${tabId}`);
  activeBtn.className = "pb-3 border-b-2 border-blue-600 text-blue-600 font-bold";
}

function renderProviderCards(activeId) {
  const grid = document.getElementById("providerCardsGrid");
  grid.innerHTML = "";

  availableProviders.forEach(p => {
    const isSelected = p.id === activeId;
    const card = document.createElement("div");
    card.className = `p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
      isSelected 
        ? "bg-blue-50/50 border-blue-500 ring-2 ring-blue-500/20" 
        : "bg-white border-slate-200 hover:border-slate-300"
    }`;
    card.onclick = () => selectProvider(p.id);

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <h4 class="font-bold text-sm text-slate-900">${p.name}</h4>
          <span class="text-[11px] ${p.configured ? "text-emerald-600 font-semibold" : "text-amber-600"}">
            ${p.configured ? "● Ready / Configured" : "○ Needs API Key"}
          </span>
        </div>
        <div class="w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300"}">
          ${isSelected ? '<div class="w-1.5 h-1.5 rounded-full bg-white"></div>' : ""}
        </div>
      </div>
      <p class="text-[11px] text-slate-500 mt-2">
        ${p.id === "mock" ? "Instant out-of-the-box realistic simulation." : ""}
        ${p.id === "ship24" ? "Global 1,200+ couriers unified via Ship24." : ""}
        ${p.id === "17track" ? "Universal multi-carrier via 17TRACK." : ""}
        ${p.id === "aftership" ? "E-commerce & parcel tracking via AfterShip." : ""}
        ${p.id === "custom" ? "Connect any custom REST JSON endpoint." : ""}
      </p>
    `;
    grid.appendChild(card);
  });
}

function selectProvider(providerId) {
  if (appConfig) {
    appConfig.active_provider = providerId;
  }
  renderProviderCards(providerId);
}

function populateConfigFields(cfg) {
  const p = cfg.providers || {};
  if (p.ship24 && p.ship24.has_key) {
    document.getElementById("ship24KeyInput").placeholder = `Configured: ${p.ship24.api_key_masked}`;
  }
  if (p["17track"] && p["17track"].has_key) {
    document.getElementById("seventeenTrackKeyInput").placeholder = `Configured: ${p["17track"].api_key_masked}`;
  }
  if (p.aftership && p.aftership.has_key) {
    document.getElementById("aftershipKeyInput").placeholder = `Configured: ${p.aftership.api_key_masked}`;
  }

  // Custom API fields
  const custom = p.custom || {};
  document.getElementById("customUrlInput").value = custom.endpoint_url || "";
  document.getElementById("customMethodSelect").value = custom.method || "GET";
  
  if (custom.headers && custom.headers.Authorization) {
    document.getElementById("customAuthHeaderInput").value = custom.headers.Authorization;
  }

  const map = custom.mappings || {};
  if (map.status_path) document.getElementById("mapStatusPath").value = map.status_path;
  if (map.carrier_path) document.getElementById("mapCarrierPath").value = map.carrier_path;
  if (map.origin_path) document.getElementById("mapOriginPath").value = map.origin_path;
  if (map.destination_path) document.getElementById("mapDestPath").value = map.destination_path;
  if (map.checkpoints_path) document.getElementById("mapCheckpointsPath").value = map.checkpoints_path;
  if (map.estimated_delivery_path) document.getElementById("mapEstDeliveryPath").value = map.estimated_delivery_path;
}

async function saveSettings() {
  const saveMsg = document.getElementById("saveStatusMsg");
  saveMsg.className = "text-xs font-medium text-blue-600";
  saveMsg.textContent = "Saving...";

  const payload = {
    active_provider: appConfig.active_provider || "mock",
    providers: {
      mock: { enabled: true },
      ship24: {},
      "17track": {},
      aftership: {},
      custom: {
        endpoint_url: document.getElementById("customUrlInput").value.trim(),
        method: document.getElementById("customMethodSelect").value,
        headers: {},
        mappings: {
          status_path: document.getElementById("mapStatusPath").value.trim(),
          carrier_path: document.getElementById("mapCarrierPath").value.trim(),
          origin_path: document.getElementById("mapOriginPath").value.trim(),
          destination_path: document.getElementById("mapDestPath").value.trim(),
          checkpoints_path: document.getElementById("mapCheckpointsPath").value.trim(),
          estimated_delivery_path: document.getElementById("mapEstDeliveryPath").value.trim()
        }
      }
    }
  };

  const ship24Key = document.getElementById("ship24KeyInput").value.trim();
  if (ship24Key) payload.providers.ship24.api_key = ship24Key;

  const seventeenTrackKey = document.getElementById("seventeenTrackKeyInput").value.trim();
  if (seventeenTrackKey) payload.providers["17track"].api_key = seventeenTrackKey;

  const aftershipKey = document.getElementById("aftershipKeyInput").value.trim();
  if (aftershipKey) payload.providers.aftership.api_key = aftershipKey;

  const customAuth = document.getElementById("customAuthHeaderInput").value.trim();
  if (customAuth) payload.providers.custom.headers["Authorization"] = customAuth;

  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to save");

    saveMsg.className = "text-xs font-medium text-emerald-600";
    saveMsg.textContent = "✓ Saved successfully!";
    setTimeout(() => {
      closeSettingsModal();
      loadConfigAndProviders();
    }, 800);
  } catch (err) {
    saveMsg.className = "text-xs font-medium text-rose-600";
    saveMsg.textContent = "Error: " + err.message;
  }
}

// Live Test Custom API endpoint
async function testCustomApi() {
  const resultEl = document.getElementById("testCustomResult");
  resultEl.className = "text-xs text-blue-600";
  resultEl.textContent = "Connecting to endpoint...";

  const customCfg = {
    endpoint_url: document.getElementById("customUrlInput").value.trim(),
    method: document.getElementById("customMethodSelect").value,
    headers: {},
    mappings: {
      status_path: document.getElementById("mapStatusPath").value.trim(),
      carrier_path: document.getElementById("mapCarrierPath").value.trim(),
      origin_path: document.getElementById("mapOriginPath").value.trim(),
      destination_path: document.getElementById("mapDestPath").value.trim(),
      checkpoints_path: document.getElementById("mapCheckpointsPath").value.trim(),
      estimated_delivery_path: document.getElementById("mapEstDeliveryPath").value.trim()
    }
  };

  const authHeader = document.getElementById("customAuthHeaderInput").value.trim();
  if (authHeader) customCfg.headers["Authorization"] = authHeader;

  if (!customCfg.endpoint_url) {
    resultEl.className = "text-xs text-rose-600";
    resultEl.textContent = "Please enter an Endpoint URL first.";
    return;
  }

  try {
    const res = await fetch("/api/test-custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: customCfg,
        tracking_number: "TEST-TRACK-001"
      })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Test request failed");

    resultEl.className = "text-xs text-emerald-600";
    resultEl.textContent = `✓ Success! Status parsed: "${data.normalized.status_text}" (${data.normalized.checkpoints.length} events)`;
  } catch (err) {
    resultEl.className = "text-xs text-rose-600";
    resultEl.textContent = "✕ Error: " + err.message;
  }
}

// Helper to escape HTML and prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
