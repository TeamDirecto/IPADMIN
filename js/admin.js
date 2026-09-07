(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const PAGE_SIZE = 10;
  const REFRESH_MS = 30000;

  let token = sessionStorage.getItem("ipadmin_token") || "";
  let username = sessionStorage.getItem("ipadmin_user") || "IPADMIN";
  let allRows = [];
  let activePage = 1;
  let historyPage = 1;
  let refreshTimer = null;
  let pendingSnapshotInitialized = false;
  let seenPendingIds = new Set();
  let audioContext = null;

  const $ = (id) => document.getElementById(id);

  const loginView = $("loginView");
  const appView = $("appView");
  const loginForm = $("loginForm");
  const loginButton = $("loginButton");
  const loginError = $("loginError");
  const pendingBody = $("pendingBody");
  const activeBody = $("activeBody");
  const historyBody = $("historyBody");
  const selectAllPending = $("selectAllPending");
  const approveSelectedButton = $("approveSelectedButton");
  const activeSearch = $("activeSearch");
  const historySearch = $("historySearch");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function text(value, fallback = "-") {
    const v = String(value ?? "").trim();
    return v || fallback;
  }

  function nodeLabel(value) {
    const map = {
      vicidial43: "VICIDIAL 43",
      VicidialMED: "VICIDIAL MED",
      ALIADOS: "ALIADOS",
      GENERADORES: "GENERADORES",
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
    return map[value] || text(value);
  }

  function statusInfo(status) {
    const key = String(status || "").toUpperCase();
    const map = {
      PENDING: ["Pendiente", "pending"],
      APPLYING: ["Aplicando", "applying"],
      ACTIVE: ["Activa", "active"],
      REVOKING: ["Revocando", "revoking"],
      REVOKED: ["Revocada", "revoked"],
      EXPIRING: ["Expirando", "expiring"],
      EXPIRED: ["Expirada", "expired"],
      ERROR: ["Error", "error"]
    };
    return map[key] || [text(status), "error"];
  }

  function statusBadge(status) {
    const [label, cls] = statusInfo(status);
    return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
  }

  function formatDate(value) {
    if (!value) return "-";
    return String(value).replace("T", " ").replace(/Z$/, "");
  }

  function historyDate(row) {
    return formatDate(
      row.expired_at ||
      row.revoked_at ||
      row.approved_at ||
      row.created_at
    );
  }

  function historyRevokedBy(row) {
    const status = String(row.status || "").toUpperCase();
    if (status === "EXPIRED" || status === "EXPIRING") return "AUTOMÁTICO";
    return text(row.revoked_by);
  }

  function normalizedSearch(row) {
    return [
      row.id,
      row.ip,
      row.requester,
      row.requested_by,
      row.node_name,
      nodeLabel(row.node_name),
      row.status,
      statusInfo(row.status)[0],
      row.approved_by,
      row.revoked_by,
      row.expires_at,
      row.created_at
    ].join(" ").toLowerCase();
  }

  function showLogin(message = "") {
    clearInterval(refreshTimer);
    refreshTimer = null;
    appView.hidden = true;
    loginView.hidden = false;
    $("loginUser").value = username || "IPADMIN";
    $("loginPassword").value = "";
    loginError.hidden = !message;
    loginError.textContent = message;
    setTimeout(() => $("loginPassword").focus(), 50);
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    $("sessionUser").textContent = username;
  }

  function setSession(newToken, newUser) {
    token = newToken || "";
    username = newUser || "IPADMIN";
    if (token) {
      sessionStorage.setItem("ipadmin_token", token);
      sessionStorage.setItem("ipadmin_user", username);
    } else {
      sessionStorage.removeItem("ipadmin_token");
      sessionStorage.removeItem("ipadmin_user");
    }
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401 && path !== "/auth/login") {
      setSession("", "IPADMIN");
      showLogin("La sesión expiró. Inicia sesión nuevamente.");
      throw new Error("Sesión expirada");
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.detail || `HTTP ${response.status}`);
    }

    return data;
  }

  function toast(message, type = "success") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    $("toastHost").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  async function unlockAudio() {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === "suspended") await audioContext.resume();
    } catch (_) {}
  }

  function playPendingTone() {
    try {
      if (!audioContext || audioContext.state !== "running") return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.setValueAtTime(880, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.25);
    } catch (_) {}
  }

  function processPendingNotifications(pending) {
    const ids = new Set(pending.map((row) => String(row.id)));
    if (!pendingSnapshotInitialized) {
      seenPendingIds = ids;
      pendingSnapshotInitialized = true;
      return;
    }

    const newIds = [...ids].filter((id) => !seenPendingIds.has(id));
    if (newIds.length) {
      playPendingTone();
      toast(`${newIds.length} nueva(s) solicitud(es) pendiente(s).`);
    }
    seenPendingIds = ids;
  }

  function rowEmpty(colspan, message) {
    return `<tr class="empty-row"><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
  }

  function renderPending(rows) {
    pendingBody.innerHTML = rows.length ? rows.map((row) => `
      <tr>
        <td><input class="row-check pending-check" type="checkbox" data-id="${escapeHtml(row.id)}"></td>
        <td>${escapeHtml(row.id)}</td>
        <td class="ip-cell">${escapeHtml(text(row.ip))}</td>
        <td>${escapeHtml(text(row.requester))}</td>
        <td>${escapeHtml(text(row.requested_by))}</td>
        <td>${escapeHtml(nodeLabel(row.node_name))}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(formatDate(row.created_at))}</td>
        <td><button class="btn btn-success btn-sm approve-one" data-id="${escapeHtml(row.id)}">Aprobar</button></td>
      </tr>
    `).join("") : rowEmpty(9, "No hay solicitudes pendientes.");

    $("pendingCountText").textContent = `${rows.length} solicitud${rows.length === 1 ? "" : "es"}`;
    selectAllPending.checked = false;
    selectAllPending.indeterminate = false;
    approveSelectedButton.disabled = true;

    document.querySelectorAll(".pending-check").forEach((box) => {
      box.addEventListener("change", updatePendingSelectionState);
    });
    document.querySelectorAll(".approve-one").forEach((button) => {
      button.addEventListener("click", () => approveIds([button.dataset.id]));
    });
  }

  function filterRows(rows, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => normalizedSearch(row).includes(q));
  }

  function renderPager(host, totalItems, page, onPage) {
    host.innerHTML = "";
    const pages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pages);

    const make = (label, target, active = false, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `page-button${active ? " active" : ""}`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", () => onPage(target));
      host.appendChild(button);
    };

    make("‹", current - 1, false, current === 1);
    const start = Math.max(1, current - 2);
    const end = Math.min(pages, start + 4);
    for (let p = start; p <= end; p++) make(String(p), p, p === current);
    make("›", current + 1, false, current === pages);
  }

  function renderActive() {
    const rows = filterRows(
      allRows.filter((row) => String(row.status || "").toUpperCase() === "ACTIVE"),
      activeSearch.value
    );
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    activePage = Math.min(activePage, pages);
    const start = (activePage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    activeBody.innerHTML = pageRows.length ? pageRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td class="ip-cell">${escapeHtml(text(row.ip))}</td>
        <td>${escapeHtml(text(row.requester))}</td>
        <td>${escapeHtml(text(row.requested_by))}</td>
        <td>${escapeHtml(nodeLabel(row.node_name))}</td>
        <td>${escapeHtml(formatDate(row.expires_at))}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(text(row.approved_by))}</td>
        <td>${escapeHtml(formatDate(row.approved_at || row.created_at))}</td>
        <td><button class="btn btn-danger btn-sm revoke-one" data-id="${escapeHtml(row.id)}">Revocar</button></td>
      </tr>
    `).join("") : rowEmpty(10, "No hay IPs activas que coincidan con la búsqueda.");

    const shownFrom = rows.length ? start + 1 : 0;
    const shownTo = Math.min(start + PAGE_SIZE, rows.length);
    $("activeCountText").textContent = `Mostrando ${shownFrom}–${shownTo} de ${rows.length}`;
    renderPager($("activePager"), rows.length, activePage, (page) => {
      activePage = page;
      renderActive();
    });

    document.querySelectorAll(".revoke-one").forEach((button) => {
      button.addEventListener("click", () => revokeId(button.dataset.id));
    });
  }

  function renderHistory() {
    const historyStatuses = new Set(["APPLYING", "REVOKING", "REVOKED", "EXPIRING", "EXPIRED", "ERROR"]);
    const rows = filterRows(
      allRows.filter((row) => historyStatuses.has(String(row.status || "").toUpperCase())),
      historySearch.value
    );
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    historyPage = Math.min(historyPage, pages);
    const start = (historyPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    historyBody.innerHTML = pageRows.length ? pageRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td class="ip-cell">${escapeHtml(text(row.ip))}</td>
        <td>${escapeHtml(text(row.requester))}</td>
        <td>${escapeHtml(text(row.requested_by))}</td>
        <td>${escapeHtml(nodeLabel(row.node_name))}</td>
        <td>${escapeHtml(formatDate(row.expires_at))}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(text(row.approved_by))}</td>
        <td>${escapeHtml(historyRevokedBy(row))}</td>
        <td>${escapeHtml(historyDate(row))}</td>
      </tr>
    `).join("") : rowEmpty(10, "No hay registros que coincidan con la búsqueda.");

    const shownFrom = rows.length ? start + 1 : 0;
    const shownTo = Math.min(start + PAGE_SIZE, rows.length);
    $("historyCountText").textContent = `Mostrando ${shownFrom}–${shownTo} de ${rows.length}`;
    renderPager($("historyPager"), rows.length, historyPage, (page) => {
      historyPage = page;
      renderHistory();
    });
  }

  function renderMetrics() {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const pending = allRows.filter((r) => String(r.status || "").toUpperCase() === "PENDING");
    const active = allRows.filter((r) => String(r.status || "").toUpperCase() === "ACTIVE");
    const expiring = active.filter((r) => {
      if (!r.expires_at) return false;
      const ts = new Date(String(r.expires_at).replace(" ", "T")).getTime();
      return Number.isFinite(ts) && ts >= now && ts <= now + sevenDays;
    });
    const expired = allRows.filter((r) => String(r.status || "").toUpperCase() === "EXPIRED");

    $("metricPending").textContent = pending.length;
    $("metricActive").textContent = active.length;
    $("metricExpiring").textContent = expiring.length;
    $("metricExpired").textContent = expired.length;
  }

  function updatePendingSelectionState() {
    const boxes = [...document.querySelectorAll(".pending-check")];
    const selected = boxes.filter((box) => box.checked);
    const all = boxes.length > 0 && selected.length === boxes.length;
    selectAllPending.checked = all;
    selectAllPending.indeterminate = selected.length > 0 && !all;
    approveSelectedButton.disabled = selected.length === 0;
  }

  selectAllPending.addEventListener("change", () => {
    document.querySelectorAll(".pending-check").forEach((box) => {
      box.checked = selectAllPending.checked;
    });
    updatePendingSelectionState();
  });

  approveSelectedButton.addEventListener("click", () => {
    const ids = [...document.querySelectorAll(".pending-check:checked")].map((box) => box.dataset.id);
    approveIds(ids);
  });

  async function approveIds(ids) {
    if (!ids.length) return;
    const message = ids.length === 1
      ? `¿Aprobar la solicitud #${ids[0]}?`
      : `¿Aprobar ${ids.length} solicitudes seleccionadas?`;
    if (!confirm(message)) return;

    approveSelectedButton.disabled = true;
    const failures = [];
    let approved = 0;

    for (const id of ids) {
      try {
        await api(`/requests/${encodeURIComponent(id)}/approve`, { method: "POST" });
        approved++;
      } catch (error) {
        failures.push(`#${id}: ${error.message}`);
      }
    }

    if (approved) toast(`${approved} solicitud(es) aprobada(s).`);
    if (failures.length) toast(failures.join(" | "), "error");
    await loadRequests();
  }

  async function revokeId(id) {
    if (!confirm(`¿Revocar el acceso de la solicitud #${id}?`)) return;
    try {
      await api(`/requests/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      toast(`Solicitud #${id} enviada a revocación.`);
      await loadRequests();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadRequests() {
    try {
      const rows = await api("/requests");
      allRows = Array.isArray(rows) ? rows : [];
      allRows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

      const pending = allRows.filter((row) => String(row.status || "").toUpperCase() === "PENDING");
      processPendingNotifications(pending);
      renderPending(pending);
      renderActive();
      renderHistory();
      renderMetrics();

      $("systemDot").className = "status-dot online";
      $("systemStateText").textContent = "Sistema en línea";
      $("lastUpdateText").textContent = `Actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    } catch (error) {
      if (!token) return;
      $("systemDot").className = "status-dot offline";
      $("systemStateText").textContent = "Sin conexión";
      $("lastUpdateText").textContent = error.message;
      toast(`No se pudo actualizar: ${error.message}`, "error");
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await unlockAudio();
    loginButton.disabled = true;
    loginButton.textContent = "Validando...";
    loginError.hidden = true;

    try {
      const data = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: $("loginUser").value.trim(),
          password: $("loginPassword").value
        })
      }).then(async (response) => {
        let body = null;
        try { body = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
        return body;
      });

      setSession(data.access_token, data.username || "IPADMIN");
      pendingSnapshotInitialized = false;
      seenPendingIds = new Set();
      showApp();
      await loadRequests();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(loadRequests, REFRESH_MS);
    } catch (error) {
      showLogin(error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Iniciar sesión";
    }
  });

  $("logoutButton").addEventListener("click", () => {
    setSession("", "IPADMIN");
    pendingSnapshotInitialized = false;
    seenPendingIds = new Set();
    showLogin();
  });

  $("refreshButton").addEventListener("click", async () => {
    await unlockAudio();
    await loadRequests();
  });

  activeSearch.addEventListener("input", () => {
    activePage = 1;
    renderActive();
  });

  historySearch.addEventListener("input", () => {
    historyPage = 1;
    renderHistory();
  });

  document.addEventListener("pointerdown", unlockAudio, { once: true });

  if (token) {
    showApp();
    loadRequests();
    refreshTimer = setInterval(loadRequests, REFRESH_MS);
  } else {
    showLogin();
  }
})();
