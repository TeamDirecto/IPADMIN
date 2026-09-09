(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const REFRESH_MS = 30000;
  const DEFAULT_STALE_AFTER = 180;
  const EVENTS_LIMIT = 200;

  const $ = (id) => document.getElementById(id);

  let loading = false;
  let timer = null;

  const nodeLabels = {
    vicidial43: "VICIDIAL 43",
    VicidialMED: "VICIDIAL MED",
    AliadosD1: "ALIADOS D1",
    AliadosD2: "ALIADOS D2",
    AliadosD3: "ALIADOS D3",
    AliadosD4: "ALIADOS D4",
    AliadosD5: "ALIADOS D5",
    "ViciIntelya-Dial1": "GENERADORES D1",
    generadoresmed2: "GENERADORES D2",
    "ViciMED-Dial3": "GENERADORES D3",
    "ViciIntelya-Dial4": "GENERADORES D4",
    "ViciMED-Dial5": "GENERADORES D5"
  };

  function nodeLabel(value) {
    return nodeLabels[value] || String(value || "-");
  }

  function parseDate(value) {
    if (!value) return NaN;
    const raw = String(value).trim();
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    return new Date(normalized).getTime();
  }

  function rowAge(row) {
    const backendAge = Number(row.age_seconds);
    if (Number.isFinite(backendAge) && backendAge >= 0) return backendAge;

    const ts = parseDate(row.last_seen);
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, Math.floor((Date.now() - ts) / 1000));
  }

  function ageLabel(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return "-";
    if (value < 60) return `${Math.floor(value)} s`;
    if (value < 3600) return `${Math.floor(value / 60)} min`;
    if (value < 86400) return `${Math.floor(value / 3600)} h`;
    return `${Math.floor(value / 86400)} d`;
  }

  function parseEventTime(value) {
    return parseDate(value);
  }

  function setCard(id, value, help, state = "") {
    const card = $(id);
    if (!card) return;

    const valueEl = card.querySelector(".tech-summary-value");
    const helpEl = card.querySelector(".tech-summary-help");

    if (valueEl) valueEl.textContent = value;
    if (helpEl) helpEl.textContent = help;

    card.classList.remove("ok", "warn", "error");
    if (state) card.classList.add(state);
  }

  function renderHealthSummary(rows, staleAfter) {
    const total = rows.length;

    const enriched = rows.map((row) => ({
      ...row,
      _age: rowAge(row),
      _state: String(row.state || "UNKNOWN").toUpperCase()
    }));

    const online = enriched.filter((row) =>
      row._age !== null && Number(row._age) <= staleAfter
    ).length;

    const unhealthy = enriched.filter((row) =>
      row._state === "DRIFT" || row._state === "STALE"
    ).length;

    setCard(
      "summaryOnline",
      total ? `${online} / ${total}` : "-",
      total
        ? unhealthy === 0
          ? "Todos los nodos reportan correctamente"
          : `${unhealthy} nodo${unhealthy === 1 ? "" : "s"} requiere${unhealthy === 1 ? "" : "n"} atención`
        : "Esperando Heartbeat V2...",
      total && online === total && unhealthy === 0 ? "ok" : total ? "warn" : ""
    );

    const withAge = enriched.filter((row) => Number.isFinite(Number(row._age)));

    if (!withAge.length) {
      setCard("summaryOldestHeartbeat", "-", "Sin telemetría disponible");
      return;
    }

    const oldest = withAge.reduce((max, row) =>
      Number(row._age) > Number(max._age) ? row : max
    );

    const age = Number(oldest._age);
    const state = age > staleAfter
      ? "error"
      : age > Math.floor(staleAfter * 0.66)
        ? "warn"
        : "ok";

    setCard(
      "summaryOldestHeartbeat",
      ageLabel(age),
      nodeLabel(oldest.node_name),
      state
    );
  }

  function renderEventSummary(events) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const errors24h = events.filter((item) => {
      if (String(item.status || "").toUpperCase() !== "ERROR") return false;
      const ts = parseEventTime(item.event_time || item.completed_at || item.created_at);
      return Number.isFinite(ts) && ts >= now - dayMs && ts <= now + 60000;
    }).length;

    const pending = events.filter((item) => {
      const status = String(item.status || "").toUpperCase();
      return status === "PENDING" || status === "RECEIVED";
    }).length;

    setCard(
      "summaryErrors",
      String(errors24h),
      "Acciones con ERROR en las últimas 24 h",
      errors24h === 0 ? "ok" : "error"
    );

    setCard(
      "summaryPending",
      String(pending),
      "PENDING / RECEIVED entre eventos cargados",
      pending === 0 ? "ok" : "warn"
    );
  }

  function renderUnavailable() {
    setCard("summaryOnline", "-", "Telemetría no disponible");
    setCard("summaryOldestHeartbeat", "-", "Telemetría no disponible");
    setCard("summaryErrors", "-", "Actividad no disponible");
    setCard("summaryPending", "-", "Actividad no disponible");
  }

  async function loadSummary() {
    if (loading) return;

    const token = sessionStorage.getItem("ipadmin_token") || "";
    const app = $("appView");

    if (!token || !app || app.hidden) return;

    loading = true;

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [healthResponse, eventsResponse] = await Promise.all([
        fetch(`${API}/nodes/health`, {
          method: "GET",
          cache: "no-store",
          headers
        }),
        fetch(`${API}/nodes/events?limit=${EVENTS_LIMIT}`, {
          method: "GET",
          cache: "no-store",
          headers
        })
      ]);

      let healthPayload = null;
      let eventsPayload = null;

      try { healthPayload = await healthResponse.json(); } catch (_) { healthPayload = null; }
      try { eventsPayload = await eventsResponse.json(); } catch (_) { eventsPayload = null; }

      if (!healthResponse.ok || !eventsResponse.ok) {
        throw new Error(
          healthPayload?.detail || eventsPayload?.detail ||
          `HTTP ${healthResponse.status}/${eventsResponse.status}`
        );
      }

      const rows = Array.isArray(healthPayload)
        ? healthPayload
        : Array.isArray(healthPayload?.nodes)
          ? healthPayload.nodes
          : [];

      const staleAfter = Number(healthPayload?.stale_after_seconds) > 0
        ? Number(healthPayload.stale_after_seconds)
        : DEFAULT_STALE_AFTER;

      const events = Array.isArray(eventsPayload?.events)
        ? eventsPayload.events
        : [];

      renderHealthSummary(rows, staleAfter);
      renderEventSummary(events);
    } catch (_) {
      renderUnavailable();
    } finally {
      loading = false;
    }
  }

  const refresh = $("refreshButton");
  if (refresh) refresh.addEventListener("click", loadSummary);

  const app = $("appView");
  if (app && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      if (!app.hidden) loadSummary();
    });
    observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  timer = setInterval(loadSummary, REFRESH_MS);
  loadSummary();
})();
