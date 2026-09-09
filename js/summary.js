(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let healthRows = [];
  let staleAfter = 180;
  let events = [];

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

  function ageLabel(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return "-";
    if (value < 60) return `${Math.floor(value)} s`;
    if (value < 3600) return `${Math.floor(value / 60)} min`;
    if (value < 86400) return `${Math.floor(value / 3600)} h`;
    return `${Math.floor(value / 86400)} d`;
  }

  function parseEventTime(value) {
    if (!value) return NaN;
    const raw = String(value).trim();
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    return new Date(normalized).getTime();
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

  function renderHealthSummary() {
    const total = healthRows.length;

    const online = healthRows.filter((row) => {
      const age = Number(row._age);
      return Number.isFinite(age) && age <= staleAfter;
    }).length;

    const unhealthy = healthRows.filter((row) => {
      const state = String(row._state || "").toUpperCase();
      return state === "DRIFT" || state === "STALE";
    }).length;

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

    const withAge = healthRows.filter((row) => Number.isFinite(Number(row._age)));

    if (!withAge.length) {
      setCard("summaryOldestHeartbeat", "-", "Sin telemetría disponible");
      return;
    }

    const oldest = withAge.reduce((max, row) =>
      Number(row._age) > Number(max._age) ? row : max
    );

    const age = Number(oldest._age);
    const state = age > staleAfter ? "error" : age > Math.floor(staleAfter * 0.66) ? "warn" : "ok";

    setCard(
      "summaryOldestHeartbeat",
      ageLabel(age),
      nodeLabel(oldest.node_name),
      state
    );
  }

  function renderEventSummary() {
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

  window.addEventListener("ipm:health", (event) => {
    const detail = event.detail || {};
    healthRows = Array.isArray(detail.rows) ? detail.rows : [];
    staleAfter = Number(detail.staleAfter) > 0 ? Number(detail.staleAfter) : 180;
    renderHealthSummary();
  });

  window.addEventListener("ipm:events", (event) => {
    const detail = event.detail || {};
    events = Array.isArray(detail.events) ? detail.events : [];
    renderEventSummary();
  });
})();
