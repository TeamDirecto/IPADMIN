(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const metrics = document.querySelector(".metrics");
  const expiringCard = document.querySelector(".metric-expiring");
  const expiredCard = document.querySelector(".metric-expired");

  if (!metrics || !expiringCard || !expiredCard) return;

  const style = document.createElement("style");
  style.textContent = `
    .metric-card.metric-drilldown {
      position: relative;
      cursor: pointer;
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
      user-select: none;
    }
    .metric-card.metric-drilldown:hover {
      transform: translateY(-2px);
      box-shadow: 0 9px 26px rgba(28,52,91,.10);
      border-color: #cbd8e8;
    }
    .metric-card.metric-drilldown:focus-visible {
      outline: 3px solid rgba(36,104,216,.22);
      outline-offset: 2px;
    }
    .metric-card.metric-drilldown::after {
      content: "⌄";
      position: absolute;
      right: 18px;
      top: 50%;
      transform: translateY(-50%);
      color: #71809a;
      font-size: 18px;
      font-weight: 800;
      transition: transform .18s ease;
    }
    .metric-card.metric-drilldown.metric-selected {
      border-color: #9fb8dc;
      box-shadow: 0 7px 24px rgba(28,52,91,.09);
    }
    .metric-card.metric-drilldown.metric-selected::after {
      transform: translateY(-50%) rotate(180deg);
    }
    .metric-detail-panel {
      grid-column: 1 / -1;
      overflow: hidden;
      margin-top: -2px;
      background: #fff;
      border: 1px solid #dfe7f1;
      border-radius: 14px;
      box-shadow: 0 8px 26px rgba(28,52,91,.055);
      animation: metricDetailIn .18s ease-out;
    }
    @keyframes metricDetailIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .metric-detail-head {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 13px 18px;
      border-bottom: 1px solid #edf1f6;
      background: #fbfcfe;
    }
    .metric-detail-head h3 {
      margin: 0;
      color: #183765;
      font-size: 15px;
    }
    .metric-detail-head p {
      margin: 3px 0 0;
      color: #71809a;
      font-size: 11px;
    }
    .metric-detail-close {
      width: 32px;
      height: 32px;
      border: 1px solid #d7e0eb;
      border-radius: 8px;
      background: #fff;
      color: #61728c;
      font-size: 18px;
      cursor: pointer;
    }
    .metric-detail-table-wrap { width: 100%; overflow-x: auto; }
    .metric-detail-table { width: 100%; border-collapse: collapse; }
    .metric-detail-table th {
      height: 36px;
      padding: 0 16px;
      text-align: left;
      white-space: nowrap;
      background: #f8fafc;
      border-bottom: 1px solid #e5ebf3;
      color: #53647f;
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
      letter-spacing: .035em;
    }
    .metric-detail-table td {
      height: 42px;
      padding: 0 16px;
      white-space: nowrap;
      border-bottom: 1px solid #edf1f5;
      color: #243653;
      font-size: 12px;
    }
    .metric-detail-table tr:last-child td { border-bottom: 0; }
    .metric-detail-ip { font-weight: 750; font-variant-numeric: tabular-nums; }
    .metric-detail-days {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 9px;
      border-radius: 999px;
      background: #fff2cf;
      color: #9a6500;
      font-size: 11px;
      font-weight: 800;
    }
    .metric-detail-empty,
    .metric-detail-loading,
    .metric-detail-error {
      padding: 25px 18px;
      text-align: center;
      color: #71809a;
      font-size: 12px;
    }
    .metric-detail-error { color: #b43131; background: #fff8f8; }
    @media (max-width: 760px) {
      .metric-detail-panel { grid-column: 1; }
      .metric-card.metric-drilldown::after { right: 13px; }
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "metric-detail-panel";
  panel.hidden = true;
  metrics.insertAdjacentElement("afterend", panel);

  let selected = null;

  function esc(value) {
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
      AliadosReplica: "ALIADOS REPLICA",
      "ViciIntelya-Dial1": "GENERADORES D1",
      generadoresmed2: "GENERADORES D2",
      "ViciMED-Dial3": "GENERADORES D3",
      "ViciIntelya-Dial4": "GENERADORES D4",
      "ViciMED-Dial5": "GENERADORES D5",
      GeneradoresReplica: "GENERADORES REPLICA"
    };
    return map[value] || text(value);
  }

  function parseDate(value) {
    if (!value) return NaN;
    return new Date(String(value).replace(" ", "T")).getTime();
  }

  function formatDate(value) {
    if (!value) return "-";
    const ts = parseDate(value);
    if (!Number.isFinite(ts)) return text(value);
    return new Date(ts).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function daysLeft(value) {
    const ts = parseDate(value);
    if (!Number.isFinite(ts)) return "-";
    const diff = ts - Date.now();
    if (diff <= 0) return "Hoy";
    const days = Math.ceil(diff / 86400000);
    return `${days} día${days === 1 ? "" : "s"}`;
  }

  async function getRows() {
    const token = sessionStorage.getItem("ipadmin_token") || "";
    if (!token) throw new Error("La sesión administrativa no está activa.");

    const response = await fetch(`${API}/requests`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      throw new Error(`No fue posible consultar las solicitudes (HTTP ${response.status}).`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  function closePanel() {
    selected = null;
    panel.hidden = true;
    panel.innerHTML = "";
    expiringCard.classList.remove("metric-selected");
    expiredCard.classList.remove("metric-selected");
    expiringCard.setAttribute("aria-expanded", "false");
    expiredCard.setAttribute("aria-expanded", "false");
  }

  function panelHead(title, subtitle) {
    return `
      <div class="metric-detail-head">
        <div>
          <h3>${esc(title)}</h3>
          <p>${esc(subtitle)}</p>
        </div>
        <button type="button" class="metric-detail-close" aria-label="Cerrar detalle">×</button>
      </div>
    `;
  }

  function renderExpiring(rows) {
    const now = Date.now();
    const limit = now + (7 * 86400000);
    const data = rows
      .filter(row => String(row.status || "").toUpperCase() === "ACTIVE")
      .filter(row => {
        const ts = parseDate(row.expires_at);
        return Number.isFinite(ts) && ts >= now && ts <= limit;
      })
      .sort((a, b) => parseDate(a.expires_at) - parseDate(b.expires_at));

    let html = panelHead("IPs por expirar", "Accesos activos cuyo vencimiento ocurre en los próximos 7 días.");

    if (!data.length) {
      html += '<div class="metric-detail-empty">No hay IPs próximas a expirar.</div>';
    } else {
      html += `
        <div class="metric-detail-table-wrap">
          <table class="metric-detail-table">
            <thead><tr><th>ID</th><th>IP</th><th>Nodo destino</th><th>Vence</th><th>Restan</th><th>Solicitado por</th></tr></thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td>#${esc(row.id)}</td>
                  <td class="metric-detail-ip">${esc(text(row.ip))}</td>
                  <td>${esc(nodeLabel(row.node_name))}</td>
                  <td>${esc(formatDate(row.expires_at))}</td>
                  <td><span class="metric-detail-days">${esc(daysLeft(row.expires_at))}</span></td>
                  <td>${esc(text(row.requested_by))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }
    panel.innerHTML = html;
  }

  function renderExpired(rows) {
    const data = rows
      .filter(row => String(row.status || "").toUpperCase() === "EXPIRED")
      .sort((a, b) => parseDate(b.expired_at || b.expires_at) - parseDate(a.expired_at || a.expires_at));

    let html = panelHead("IPs expiradas", "Histórico de accesos que llegaron a su fecha de vencimiento.");

    if (!data.length) {
      html += '<div class="metric-detail-empty">No hay IPs expiradas.</div>';
    } else {
      html += `
        <div class="metric-detail-table-wrap">
          <table class="metric-detail-table">
            <thead><tr><th>ID</th><th>IP</th><th>Nodo destino</th><th>Expiró</th><th>Aprobado por</th><th>Solicitado por</th></tr></thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td>#${esc(row.id)}</td>
                  <td class="metric-detail-ip">${esc(text(row.ip))}</td>
                  <td>${esc(nodeLabel(row.node_name))}</td>
                  <td>${esc(formatDate(row.expired_at || row.expires_at))}</td>
                  <td>${esc(text(row.approved_by))}</td>
                  <td>${esc(text(row.requested_by))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }
    panel.innerHTML = html;
  }

  async function openPanel(type) {
    if (selected === type && !panel.hidden) {
      closePanel();
      return;
    }

    selected = type;
    panel.hidden = false;
    expiringCard.classList.toggle("metric-selected", type === "expiring");
    expiredCard.classList.toggle("metric-selected", type === "expired");
    expiringCard.setAttribute("aria-expanded", String(type === "expiring"));
    expiredCard.setAttribute("aria-expanded", String(type === "expired"));

    panel.innerHTML = panelHead(type === "expiring" ? "IPs por expirar" : "IPs expiradas", "Consultando información actual...") + '<div class="metric-detail-loading">Cargando detalle...</div>';

    try {
      const rows = await getRows();
      if (selected !== type) return;
      if (type === "expiring") renderExpiring(rows);
      else renderExpired(rows);
    } catch (error) {
      panel.innerHTML = panelHead(type === "expiring" ? "IPs por expirar" : "IPs expiradas", "No fue posible cargar el detalle.") + `<div class="metric-detail-error">${esc(error.message)}</div>`;
    }
  }

  function makeInteractive(card, type, label) {
    card.classList.add("metric-drilldown");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("aria-label", label);
    card.addEventListener("click", () => openPanel(type));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPanel(type);
      }
    });
  }

  makeInteractive(expiringCard, "expiring", "Ver detalle de IPs por expirar");
  makeInteractive(expiredCard, "expired", "Ver detalle de IPs expiradas");

  panel.addEventListener("click", event => {
    if (event.target.closest(".metric-detail-close")) closePanel();
  });
})();