(() => {
  "use strict";
  const ENDPOINT = String(window.NEON_RUNNER_ANALYTICS_ENDPOINT || "").trim().replace(/\/$/, "");
  const CONSENT_KEY = "neonRunnerAnalyticsConsent";
  const VISITOR_KEY = "neonRunnerAnalyticsVisitor";
  const banner = document.getElementById("analyticsConsent");
  const message = document.getElementById("analyticsConsentMessage");
  const allowButton = document.getElementById("allowAnalytics");
  const rejectButton = document.getElementById("rejectAnalytics");
  const settingsButton = document.getElementById("privacySettingsBtn");
  let currentConsent = "";
  let openedManually = false;

  function storageGet(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { }
  }
  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      }
    } catch { }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }
  function visitorId() {
    let id = storageGet(VISITOR_KEY);
    if (!id) { id = randomId(); storageSet(VISITOR_KEY, id); }
    return id;
  }
  function doNotTrack() {
    return navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1";
  }
  function send(path, payload) {
    if (!ENDPOINT) return;
    const url = `${ENDPOINT}${path}`;
    const body = JSON.stringify(payload);
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
            credentials: "omit", referrerPolicy: "no-referrer"
          });
          if (response.ok || response.status < 500) return;
        } catch { }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    })();
  }
  function updateBanner() {
    if (!banner) return;
    const hasChoice = currentConsent === "yes" || currentConsent === "no";
    banner.hidden = !openedManually && (hasChoice || !ENDPOINT || doNotTrack());
    if (message) {
      message.textContent = ENDPOINT
        ? "A random ID saved in this browser helps count new and returning visitors. We send only game starts, play duration and score. The analytics database does not store names, emails, IP addresses, device details or browsing history. Cloudflare still processes network requests to deliver this service. You can decline and still play."
        : "Global statistics are not connected yet. The game works normally; statistics will start after the backend is configured.";
    }
    if (allowButton) allowButton.hidden = !ENDPOINT;
  }
  function setConsent(choice) {
    openedManually = false;
    if (choice === "yes" && ENDPOINT && !doNotTrack()) {
      currentConsent = "yes"; storageSet(CONSENT_KEY, "yes"); visitorId();
    } else {
      const oldId = storageGet(VISITOR_KEY);
      currentConsent = "no"; storageSet(CONSENT_KEY, "no"); storageRemove(VISITOR_KEY);
      if (oldId && ENDPOINT) send("/privacy/delete", { visitorId: oldId });
    }
    updateBanner();
  }
  currentConsent = storageGet(CONSENT_KEY);
  if (doNotTrack()) currentConsent = "no";
  updateBanner();
  if (allowButton) allowButton.addEventListener("click", () => setConsent("yes"));
  if (rejectButton) rejectButton.addEventListener("click", () => setConsent("no"));
  if (settingsButton) settingsButton.addEventListener("click", () => { openedManually = true; updateBanner(); });

  window.NeonRunnerAnalytics = Object.freeze({
    startRun() {
      if (!ENDPOINT || currentConsent !== "yes" || doNotTrack()) return null;
      const runId = randomId();
      send("/event", { event: "game_started", visitorId: visitorId(), runId });
      return runId;
    },
    gameOver(runId, durationSeconds, score) {
      if (!ENDPOINT || currentConsent !== "yes" || doNotTrack() || !runId) return;
      send("/event", {
        event: "game_over", visitorId: visitorId(), runId,
        durationSeconds: Math.max(0, Math.min(86400, Math.round(Number(durationSeconds) || 0))),
        score: Math.max(0, Math.min(1000000000, Math.floor(Number(score) || 0)))
      });
    }
  });
})();
