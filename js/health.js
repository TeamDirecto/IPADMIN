(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const REFRESH_MS = 30000;
  const STALE_AFTER_SECONDS = 180;

  let timer = null;
  let loading = false;
  let latestRows = [];
  let selectedNode = "";

  const $ = (id) => document.getElementById(id);

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nodeLabel(value) {
    return nodeLabels[value] || String(value || "-");
  }

  function numberOrDash(value) {
    return value === null || value === undefined || value === ""
      ? "-"
      : String(value);
  }

  function formatDate(value) {
    if (!value) return "-";
    return String(value).replace("T", " ").replace(/Z$/, "");
  }

  function parseDate(value) {
    if (!value) return NaN;
    const raw = String(value).trim();
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    return new Date(normalized).getTime();
  }

  function ageSeconds(row) {
    const backendAge = Number(row.age_seconds);
    if (Number.isFinite(backendAge) && backendAge >= 0) return backendAge;

    const seen = parseDate(row.last_seen);
    if (!Number.isFinite(seen)) return null;
    return Math.max(0, Math.floor((Date.now() - seen) / 1000));
  }

  function ageLabel(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "sin edad";
    const value = Math.max(0, Number(seconds));
    if (value < 60) return `${Math.floor(value)} s`;
    if (value < 3600) return `${Math.floor(value / 60)} min`;
    if (value < 86400) return `${Math.floor(value / 3600)} h`;
    return `${Math.floor(value / 86400)} d`;
  }

  function sameHash(row) {
    const desired = String(row.desired_hash || "");
    const applied = String(row.applied_hash || "");
    return Boolean(desired && applied && desired === applied);
  }

  function stateFor(row, staleAfter) {
    const backendState = String(row.state || "").toUpperCase();
    const age = ageSeconds(row);

    if (backendState === "STALE") return "STALE";
    if (age !== null && age > staleAfter) return "STALE";

    const desired = Number(row.desired_count);
    const applied = Number(row.applied_count);
    const jumps = Number(row.jump_count);

    const metricsPresent =
      row.desired_count !== null && row.desired_count !== undefined &&
      row.applied_count !== null && row.applied_count !== undefined &&
      row.jump_count !== null && row.jump_count !== undefined &&
      row.desired_hash && row.applied_hash;

    if (!metricsPresent) return backendState || "UNKNOWN";
    if (desired === applied && sameHash(row) && jumps === 1) return "SYNCED";
    return "DRIFT";
  }

  function stateBadge(state) {
    const key = String(state || "UNKNOWN").toUpperCase();
    const labels = {
      SYNCED: "SYNCED",
      DRIFT: "DRIFT",
      STALE: "STALE",
      UNKNOWN: "SIN DATOS"
    };
    const cls = ["SYNCED", "DRIFT", "STALE"].includes(key) ? key.toLowerCase() : "unknown";
    return `<span class="health-badge ${cls}">${escapeHtml(labels[key] || key)}</span>`;
  }

  function hashStatus(row) {
    if (!row.desired_hash || !row.applied_hash) {
      return '<span class="health-hash na">-</span>';
    }
    if (sameHash(row)) {
      return `<span class="health-hash ok" title="${escapeHtml(row.desired_hash)}">OK · ${escapeHtml(String(row.desired_hash).slice(0, 10))}</span>`;
    }
    return `<span class="health-hash diff" title="Deseado: ${escapeHtml(row.desired_hash)} | Aplicado: ${escapeHtml(row.applied_hash)}">DIF</span>`;
  }

  function versionCell(version, sha) {
    const versionText = version || "-";
    const shaText = sha ? String(sha).slice(0, 12) : "-";
    const fullSha = sha || "";
    return `
      <span class="health-version">${escapeHtml(versionText)}</span>
      <span class="health-sha" title="${escapeHtml(fullSha)}">${escapeHtml(shaText)}</span>
    `;
  }

  function renderSummary(states) {
    const total = states.length;
    const synced = states.filter((s) => s === "SYNCED").length;
    const drift = states.filter((s) => s === "DRIFT").length;
    const stale = states.filter((s) => s === "STALE").length;

    $("healthTotal").textContent = total;
    $("healthSynced").textContent = synced;
    $("healthDrift").textContent = drift;
    $("healthStale").textContent = stale;
  }

  function emitHealth(staleAfter) {
    window.dispatchEvent(new CustomEvent("ipm:health", {
      detail: {
        rows: latestRows.slice(),
        staleAfter
      }
    }));
  }

  function closeNodeDetail() {
    selectedNode = "";
    const drawer = $("nodeDetailDrawer");
    const overlay = $("nodeDetailOverlay");
    if (drawer) drawer.hidden = true;
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function openNodeDetail(row) {
    if (!row || !$("nodeDetailDrawer")) return;

    selectedNode = row.node_name || "";
    const state = row._state || stateFor(row, STALE_AFTER_SECONDS);
    const age = row._age ?? ageSeconds(row);

    $("nodeDetailTitle").textContent = nodeLabel(row.node_name);
    $("nodeDetailState").innerHTML = stateBadge(state);
    $("detailLastSeen").textContent = formatDate(row.last_seen);
    $("detailAge").textContent = `hace ${ageLabel(age)}`;
    $("detailDesired").textContent = numberOrDash(row.desired_count);
    $("detailApplied").textContent = numberOrDash(row.applied_count);
    $("detailFirewall").textContent = `${numberOrDash(row.rule_count)} / ${numberOrDash(row.jump_count)}`;

    $("detailAgentVersion").textContent = row.agent_version || "-";
    $("detailAgentSha").textContent = row.agent_sha || "-";
    $("detailHelperVersion").textContent = row.helper_version || "-";
    $("detailHelperSha").textContent = row.helper_sha || "-";
    $("detailDesiredHash").textContent = row.desired_hash || "-";
    $("detailAppliedHash").textContent = row.applied_hash || "-";

    const hashResult = $("detailHashResult");
    if (!row.desired_hash || !row.applied_hash) {
      hashResult.className = "node-detail-result na";
      hashResult.textContent = "Sin información suficiente para comparar hashes.";
    } else if (sameHash(row)) {
      hashResult.className = "node-detail-result ok";
      hashResult.textContent = "Integridad OK: desired_hash y applied_hash coinciden.";
    } else {
      hashResult.className = "node-detail-result diff";
      hashResult.textContent = "DRIFT: desired_hash y applied_hash son diferentes.";
    }

    $("nodeDetailOverlay").hidden = false;
    $("nodeDetailDrawer").hidden = false;
    document.body.style.overflow = "hidden";
    $("nodeDetailClose")?.focus();
  }

  function bindRowDetails() {
    document.querySelectorAll("#nodeHealthBody tr.health-clickable").forEach((tr) => {
      const open = () => {
        const row = latestRows.find((item) => item.node_name === tr.dataset.node);
        if (row) openNodeDetail(row);
      };

      tr.addEventListener("click", open);
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function renderRows(rows, staleAfter) {
    const body = $("nodeHealthBody");
    if (!body) return;

    if (!rows.length) {
      latestRows = [];
      body.innerHTML = '<tr class="empty-row"><td colspan="10">No hay telemetría de nodos disponible.</td></tr>';
      renderSummary([]);
      emitHealth(staleAfter);
      closeNodeDetail();
      return;
    }

    const enriched = rows.map((row) => ({
      ...row,
      _state: stateFor(row, staleAfter),
      _age: ageSeconds(row)
    }));

    const order = {
      "AliadosD1": 10,
      "AliadosD2": 11,
      "AliadosD3": 12,
      "AliadosD4": 13,
      "AliadosD5": 14,
      "ViciIntelya-Dial1": 20,
      "generadoresmed2": 21,
      "ViciMED-Dial3": 22,
      "ViciIntelya-Dial4": 23,
      "ViciMED-Dial5": 24,
      "VicidialMED": 30,
      "vicidial43": 40
    };

    enriched.sort((a, b) => (order[a.node_name] ?? 999) - (order[b.node_name] ?? 999));
    latestRows = enriched;

    body.innerHTML = enriched.map((row) => {
      const countsMatch = Number(row.desired_count) === Number(row.applied_count);
      const countClass = countsMatch ? "match" : "mismatch";
      const stateClass = row._state === "DRIFT"
        ? "health-row-drift"
        : row._state === "STALE"
          ? "health-row-stale"
          : "";

      return `
        <tr class="health-clickable ${stateClass}" data-node="${escapeHtml(row.node_name)}" tabindex="0" aria-label="Abrir detalle de ${escapeHtml(nodeLabel(row.node_name))}">
          <td><strong>${escapeHtml(nodeLabel(row.node_name))}</strong></td>
          <td>${stateBadge(row._state)}</td>
          <td class="health-last-seen">
            ${escapeHtml(formatDate(row.last_seen))}
            <span class="health-age">hace ${escapeHtml(ageLabel(row._age))}</span>
          </td>
          <td class="health-count ${countClass}">${escapeHtml(numberOrDash(row.desired_count))}</td>
          <td class="health-count ${countClass}">${escapeHtml(numberOrDash(row.applied_count))}</td>
          <td class="health-count">${escapeHtml(numberOrDash(row.rule_count))}</td>
          <td class="health-count ${Number(row.jump_count) === 1 ? "match" : "mismatch"}">${escapeHtml(numberOrDash(row.jump_count))}</td>
          <td>${versionCell(row.agent_version, row.agent_sha)}</td>
          <td>${versionCell(row.helper_version, row.helper_sha)}</td>
          <td>${hashStatus(row)}</td>
        </tr>
      `;
    }).join("");

    renderSummary(enriched.map((row) => row._state));
    emitHealth(staleAfter);
    bindRowDetails();

    if (selectedNode) {
      const selected = latestRows.find((row) => row.node_name === selectedNode);
      if (selected) openNodeDetail(selected);
    }
  }

  function renderUnavailable(message) {
    const body = $("nodeHealthBody");
    if (!body) return;

    const active = window.IPMMaintenance?.currentWindow?.();

    if (active) {
      body.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">
            <div class="maintenance-api-note">
              Ventana programada activa: ${escapeHtml(active.label)}. La ausencia temporal de telemetría se considera esperada y no una falla de los nodos.
            </div>
          </td>
        </tr>
      `;
      const updated = $("healthUpdatedText");
      if (updated) updated.textContent = "Ventana programada activa";
      return;
    }

    body.innerHTML = `
      <tr class="empty-row">
        <td colspan="10" class="health-error">${escapeHtml(message)}</td>
      </tr>
    `;
    renderSummary([]);
    const updated = $("healthUpdatedText");
    if (updated) updated.textContent = "Telemetría no disponible";
  }

  async function loadHealth() {
    if (loading) return;

    const token = sessionStorage.getItem("ipadmin_token") || "";
    const app = $("appView");

    if (!token || !app || app.hidden) return;

    loading = true;

    try {
      const response = await fetch(`${API}/nodes/health`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }

      if (response.status === 401) {
        renderUnavailable("La sesión administrativa expiró.");
        return;
      }

      if (!response.ok) {
        throw new Error(data?.detail || `HTTP ${response.status}`);
      }

      const rows = Array.isArray(data) ? data : Array.isArray(data?.nodes) ? data.nodes : [];
      const staleAfter = Number(data?.stale_after_seconds) > 0
        ? Number(data.stale_after_seconds)
        : STALE_AFTER_SECONDS;

      renderRows(rows, staleAfter);

      const updated = $("healthUpdatedText");
      if (updated) {
        updated.textContent = `Actualizado ${new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })}`;
      }
    } catch (error) {
      renderUnavailable(`Salud de nodos no disponible: ${error.message}`);
    } finally {
      loading = false;
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(loadHealth, REFRESH_MS);
    loadHealth();
  }

  const app = $("appView");
  if (app && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      if (!app.hidden) loadHealth();
    });
    observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  const refresh = $("refreshButton");
  if (refresh) refresh.addEventListener("click", loadHealth);

  $("nodeDetailClose")?.addEventListener("click", closeNodeDetail);
  $("nodeDetailOverlay")?.addEventListener("click", closeNodeDetail);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedNode) closeNodeDetail();
  });

  start();
})();
