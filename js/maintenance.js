(() => {
  "use strict";

  /*
   * Ventanas conocidas de mantenimiento.
   * Por seguridad no se asume recurrencia diaria/semanal sin configurarla.
   * La ventana confirmada del 8-9 Sep 2026 se conserva como evento one-off.
   */
  const WINDOWS = [
    {
      id: "apache-vici97-20260908",
      label: "Mantenimiento programado Apache vici97",
      classification: "EXPECTED DOWNTIME",
      start: "2026-09-08T23:00:00-06:00",
      end: "2026-09-09T04:30:00-06:00",
      graceAfterMinutes: 5,
      scope: "central",
      affected: "12/12 nodos",
      description: "Apache detenido de forma programada; el canal HTTPS de Heartbeat queda temporalmente no disponible."
    }
  ];

  const $ = (id) => document.getElementById(id);

  function parseBackendTimestamp(value) {
    if (!value) return NaN;
    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      return Date.parse(raw.replace(" ", "T") + "-06:00");
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return Date.parse(raw + "-06:00");
    }

    return Date.parse(raw);
  }

  function bounds(item) {
    const start = Date.parse(item.start);
    const end = Date.parse(item.end);
    const grace = Math.max(0, Number(item.graceAfterMinutes) || 0) * 60 * 1000;
    return { start, end, graceEnd: end + grace };
  }

  function matchTimestamp(value, includeGrace = true) {
    const ts = typeof value === "number" ? value : parseBackendTimestamp(value);
    if (!Number.isFinite(ts)) return null;

    return WINDOWS.find((item) => {
      const { start, end, graceEnd } = bounds(item);
      return ts >= start && ts <= (includeGrace ? graceEnd : end);
    }) || null;
  }

  function currentWindow() {
    return matchTimestamp(Date.now(), false);
  }

  function expectedHistoryEvent(item) {
    if (!item) return null;
    const state = String(item.new_state || "").toUpperCase();
    if (state !== "STALE" && state !== "SYNCED") return null;
    return matchTimestamp(item.detected_at, true);
  }

  function formatWindow(item) {
    if (!item) return "";
    const start = new Date(item.start);
    const end = new Date(item.end);

    const dateFmt = new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
      month: "short"
    });

    const timeFmt = new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    return `${dateFmt.format(start)} ${timeFmt.format(start)} → ${dateFmt.format(end)} ${timeFmt.format(end)}`;
  }

  function renderBanner() {
    const banner = $("maintenanceBanner");
    const title = $("maintenanceTitle");
    const detail = $("maintenanceDetail");
    const status = $("maintenanceStatus");

    if (!banner || !title || !detail || !status) return;

    const active = currentWindow();

    if (active) {
      banner.hidden = false;
      banner.className = "maintenance-banner active";
      title.textContent = active.label;
      detail.textContent = `${active.affected} · ${formatWindow(active)} · ${active.description}`;
      status.textContent = "VENTANA ACTIVA";
      return;
    }

    const latest = WINDOWS
      .slice()
      .sort((a, b) => Date.parse(b.end) - Date.parse(a.end))[0];

    if (!latest) {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;
    banner.className = "maintenance-banner historical";
    title.textContent = "Última ventana programada registrada";
    detail.textContent = `${formatWindow(latest)} · ${latest.label}`;
    status.textContent = "SIN VENTANA ACTIVA";
  }

  window.IPMMaintenance = {
    windows: WINDOWS.slice(),
    parseBackendTimestamp,
    matchTimestamp,
    currentWindow,
    expectedHistoryEvent,
    formatWindow
  };

  renderBanner();
  setInterval(renderBanner, 30000);
})();
