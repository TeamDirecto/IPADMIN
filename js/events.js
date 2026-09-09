(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const REFRESH_MS = 30000;

  let loading = false;
  let timer = null;

  const $ = (id) => document.getElementById(id);

  const labels = {
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

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nodeLabel(value) {
    return labels[value] || String(value || "-");
  }

  function fmt(value) {
    if (!value) return "-";
    return String(value).replace("T", " ").replace(/Z$/, "");
  }

  function stateBadge(state) {
    const s = String(state || "UNKNOWN").toUpperCase();
    const cls = s === "DRIFT" ? "drift" : s === "STALE" ? "stale" : "unknown";
    return `<span class="health-badge ${cls}">${esc(s)}</span>`;
  }

  function renderIncidents(items) {
    const host = $("incidentList");
    if (!host) return;

    const drift = items.filter((x) => String(x.state).toUpperCase() === "DRIFT").length;
    const stale = items.filter((x) => String(x.state).toUpperCase() === "STALE").length;

    $("incidentTotal").textContent = items.length;
    $("incidentDrift").textContent = drift;
    $("incidentStale").textContent = stale;

    if (!items.length) {
      host.innerHTML = '<div class="incident-empty">Sin incidencias activas. Los nodos reportan estado saludable.</div>';
      return;
    }

    host.innerHTML = items.map((item) => {
      const state = String(item.state || "UNKNOWN").toUpperCase();
      const detail = state === "STALE"
        ? `Último reporte: ${fmt(item.last_seen)} · ${item.age_seconds ?? "-"} s sin heartbeat`
        : `Deseado ${item.desired_count ?? "-"} / Aplicado ${item.applied_count ?? "-"} · Reglas ${item.rule_count ?? "-"} · Jumps ${item.jump_count ?? "-"}`;

      return `
        <div class="incident-item ${state.toLowerCase()}">
          <div class="incident-node">${esc(nodeLabel(item.node_name))}</div>
          <div>${stateBadge(state)}</div>
          <div class="incident-detail">${esc(detail)}</div>
        </div>
      `;
    }).join("");
  }

  function eventType(action, status) {
    const a = String(action || "").toUpperCase();
    const s = String(status || "").toUpperCase();
    if (s === "ERROR") return ["ERROR", "error"];
    if (a === "REMOVE") return ["REMOVE", "remove"];
    return [a || "EVENTO", "add"];
  }

  function renderEvents(items) {
    const body = $("eventBody");
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="8">No hay actividad reciente registrada.</td></tr>';
      $("eventCountText").textContent = "0 eventos";
      return;
    }

    body.innerHTML = items.map((item) => {
      const [typeLabel, typeClass] = eventType(item.action, item.status);
      const status = String(item.status || "-").toUpperCase();
      const statusClass = status === "ERROR" ? "error" : status === "COMPLETED" ? "completed" : "";
      const message = item.error_message || item.result || "-";

      return `
        <tr>
          <td>${esc(fmt(item.event_time))}</td>
          <td><strong>${esc(nodeLabel(item.node_name))}</strong></td>
          <td><span class="event-type ${typeClass}">${esc(typeLabel)}</span></td>
          <td class="event-ip">${esc(item.ip || "-")}</td>
          <td>${esc(item.requester || "-")}</td>
          <td><span class="event-status ${statusClass}">${esc(status)}</span></td>
          <td>${esc(item.request_id ?? "-")}</td>
          <td><div class="event-message" title="${esc(message)}">${esc(message)}</div></td>
        </tr>
      `;
    }).join("");

    $("eventCountText").textContent = `${items.length} evento${items.length === 1 ? "" : "s"}`;
  }

  function renderError(message) {
    const incidents = $("incidentList");
    const body = $("eventBody");
    if (incidents) incidents.innerHTML = `<div class="incident-empty health-error">${esc(message)}</div>`;
    if (body) body.innerHTML = `<tr class="empty-row"><td colspan="8" class="health-error">${esc(message)}</td></tr>`;
  }

  async function loadEvents() {
    if (loading) return;

    const token = sessionStorage.getItem("ipadmin_token") || "";
    const app = $("appView");
    if (!token || !app || app.hidden) return;

    loading = true;

    try {
      const response = await fetch(`${API}/nodes/events?limit=50`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });

      let payload = null;
      try { payload = await response.json(); } catch (_) { payload = null; }

      if (!response.ok) {
        throw new Error(payload?.detail || `HTTP ${response.status}`);
      }

      renderIncidents(Array.isArray(payload?.incidents) ? payload.incidents : []);
      renderEvents(Array.isArray(payload?.events) ? payload.events : []);

      const updated = $("eventsUpdatedText");
      if (updated) updated.textContent = `Actualizado ${new Date().toLocaleTimeString("es-MX")}`;
    } catch (error) {
      renderError(`Eventos no disponibles: ${error.message}`);
    } finally {
      loading = false;
    }
  }

  const refresh = $("refreshButton");
  if (refresh) refresh.addEventListener("click", loadEvents);

  const app = $("appView");
  if (app && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      if (!app.hidden) loadEvents();
    });
    observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  timer = setInterval(loadEvents, REFRESH_MS);
  loadEvents();
})();
