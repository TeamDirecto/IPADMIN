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
    const value = String(state || "UNKNOWN").toUpperCase();
    const cls = ["SYNCED", "DRIFT", "STALE"].includes(value)
      ? value.toLowerCase()
      : "unknown";
    return `<span class="health-badge ${cls}">${esc(value)}</span>`;
  }

  function transitionCell(item) {
    return `
      <div class="state-transition">
        ${stateBadge(item.previous_state)}
        <span class="state-transition-arrow">→</span>
        ${stateBadge(item.new_state)}
      </div>
    `;
  }

  function metricPair(item) {
    const desired = item.desired_count ?? "-";
    const applied = item.applied_count ?? "-";
    const cls = Number(desired) === Number(applied) ? "match" : "mismatch";
    return `<span class="health-count ${cls}">${esc(desired)} / ${esc(applied)}</span>`;
  }

  function firewallPair(item) {
    const rules = item.rule_count ?? "-";
    const jumps = item.jump_count ?? "-";
    return `<span class="history-firewall">${esc(rules)} reglas · ${esc(jumps)} jump${Number(jumps) === 1 ? "" : "s"}</span>`;
  }

  function render(items) {
    const body = $("stateHistoryBody");
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">Todavía no hay transiciones registradas. El monitor ya conserva el estado base y registrará el siguiente cambio real.</td></tr>';
      $("stateHistoryCount").textContent = "0 transiciones";
      return;
    }

    body.innerHTML = items.map((item) => `
      <tr>
        <td>${esc(fmt(item.detected_at))}</td>
        <td><strong>${esc(nodeLabel(item.node_name))}</strong></td>
        <td>${transitionCell(item)}</td>
        <td><div class="history-reason" title="${esc(item.reason || "-")}">${esc(item.reason || "-")}</div></td>
        <td>${metricPair(item)}</td>
        <td>${firewallPair(item)}</td>
        <td>${esc(fmt(item.last_seen))}</td>
      </tr>
    `).join("");

    $("stateHistoryCount").textContent = `${items.length} transición${items.length === 1 ? "" : "es"}`;
  }

  function renderError(message) {
    const body = $("stateHistoryBody");
    if (!body) return;
    body.innerHTML = `<tr class="empty-row"><td colspan="7" class="health-error">${esc(message)}</td></tr>`;
  }

  async function loadHistory() {
    if (loading) return;

    const token = sessionStorage.getItem("ipadmin_token") || "";
    const app = $("appView");
    if (!token || !app || app.hidden) return;

    loading = true;

    try {
      const response = await fetch(`${API}/nodes/history?limit=100`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });

      let payload = null;
      try { payload = await response.json(); } catch (_) { payload = null; }

      if (!response.ok) {
        throw new Error(payload?.detail || `HTTP ${response.status}`);
      }

      render(Array.isArray(payload?.history) ? payload.history : []);

      const updated = $("stateHistoryUpdated");
      if (updated) updated.textContent = `Actualizado ${new Date().toLocaleTimeString("es-MX")}`;
    } catch (error) {
      renderError(`Historial de estado no disponible: ${error.message}`);
    } finally {
      loading = false;
    }
  }

  const refresh = $("refreshButton");
  if (refresh) refresh.addEventListener("click", loadHistory);

  const app = $("appView");
  if (app && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      if (!app.hidden) loadHistory();
    });
    observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  timer = setInterval(loadHistory, REFRESH_MS);
  loadHistory();
})();
