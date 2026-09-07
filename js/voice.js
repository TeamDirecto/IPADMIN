(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let listening = false;
  let pendingAction = null;
  let processing = false;

  const ACTIONS = {
    approve: {
      label: "aprobar",
      title: "Confirmar aprobación",
      expectedStatus: "PENDING",
      endpoint: (id) => `/requests/${encodeURIComponent(id)}/approve`,
      success: (id) => `Solicitud #${id} aprobada correctamente.`
    },
    reject: {
      label: "rechazar",
      title: "Confirmar rechazo",
      expectedStatus: "PENDING",
      endpoint: (id) => `/requests/${encodeURIComponent(id)}/reject`,
      success: (id) => `Solicitud #${id} rechazada correctamente.`
    },
    revoke: {
      label: "revocar",
      title: "Confirmar revocación",
      expectedStatus: "ACTIVE",
      endpoint: (id) => `/requests/${encodeURIComponent(id)}/revoke`,
      success: (id) => `Solicitud #${id} enviada a revocación.`
    }
  };

  function token() {
    return sessionStorage.getItem("ipadmin_token") || "";
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!,.;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
    return map[value] || value || "-";
  }

  function statusLabel(value) {
    const map = {
      PENDING: "Pendiente",
      APPLYING: "Aplicando",
      ACTIVE: "Activa",
      REVOKING: "Revocando",
      REVOKED: "Revocada",
      REJECTED: "Rechazada",
      EXPIRING: "Expirando",
      EXPIRED: "Expirada",
      ERROR: "Error"
    };
    const key = String(value || "").toUpperCase();
    return map[key] || value || "-";
  }

  async function request(path, options = {}) {
    const accessToken = token();
    if (!accessToken) throw new Error("No hay una sesión administrativa activa.");

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (response.status === 401) {
      const logout = document.getElementById("logoutButton");
      if (logout) logout.click();
      throw new Error("La sesión expiró. Inicia sesión nuevamente.");
    }

    if (!response.ok) {
      throw new Error(data?.detail || `HTTP ${response.status}`);
    }

    return data;
  }

  function createUi() {
    if (document.getElementById("ipVoiceAssistant")) return;

    const root = document.createElement("div");
    root.id = "ipVoiceAssistant";
    root.className = "voice-assistant-root";
    root.hidden = true;
    root.innerHTML = `
      <section id="voicePanel" class="voice-panel" hidden aria-label="Asistente por voz">
        <div class="voice-panel-header">
          <div class="voice-panel-title">
            <span class="voice-mini-bot">⌁</span>
            <div>
              <strong>IP Bot · Voz</strong>
              <small>Fase 1 · comandos locales</small>
            </div>
          </div>
          <button id="voiceClose" class="voice-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="voice-panel-body">
          <div id="voiceStatus" class="voice-status">Pulsa el micrófono y di, por ejemplo: “Permitir ID 42”.</div>
          <div class="voice-examples">
            <span class="voice-chip">Permitir ID 42</span>
            <span class="voice-chip">Rechazar ID 42</span>
            <span class="voice-chip">Revocar ID 31</span>
            <span class="voice-chip">Consultar ID 31</span>
          </div>
          <button id="voiceListen" class="voice-listen-button" type="button">🎙 Hablar</button>
          <div id="voiceTranscript" class="voice-transcript">La confirmación siempre es obligatoria para cambios.</div>

          <div id="voiceConfirmCard" class="voice-confirm-card" hidden>
            <div id="voiceConfirmTitle" class="voice-confirm-title">Confirmar acción</div>
            <dl class="voice-request-grid">
              <dt>ID</dt><dd id="voiceReqId">-</dd>
              <dt>IP</dt><dd id="voiceReqIp">-</dd>
              <dt>Centro</dt><dd id="voiceReqCenter">-</dd>
              <dt>Destino</dt><dd id="voiceReqNode">-</dd>
              <dt>Estado</dt><dd id="voiceReqStatus">-</dd>
            </dl>
            <div class="voice-confirm-actions">
              <button id="voiceCancelAction" class="voice-action-button voice-cancel-action" type="button">Cancelar</button>
              <button id="voiceConfirmAction" class="voice-action-button voice-confirm-action" type="button">Confirmar</button>
            </div>
          </div>
        </div>
      </section>

      <button id="voiceMascot" class="voice-mascot" type="button" aria-label="Abrir asistente por voz" title="Asistente por voz">
        <span class="voice-bot-head" aria-hidden="true"><span class="voice-bot-eye"></span><span class="voice-bot-eye"></span></span>
        <span class="voice-mascot-label">🎙 IP Bot</span>
      </button>
    `;

    document.body.appendChild(root);
  }

  const $ = (id) => document.getElementById(id);

  function setStatus(message, type = "") {
    const el = $("voiceStatus");
    if (!el) return;
    el.textContent = message;
    el.className = `voice-status${type ? ` ${type}` : ""}`;
  }

  function setTranscript(message) {
    const el = $("voiceTranscript");
    if (el) el.textContent = message;
  }

  function openPanel() {
    const panel = $("voicePanel");
    if (panel) panel.hidden = false;
  }

  function closePanel() {
    const panel = $("voicePanel");
    if (panel) panel.hidden = true;
  }

  function syncVisibility() {
    const app = document.getElementById("appView");
    const root = $("ipVoiceAssistant");
    if (!root || !app) return;

    const authenticated = Boolean(token()) && !app.hidden;
    root.hidden = !authenticated;

    if (!authenticated) {
      pendingAction = null;
      closePanel();
      const card = $("voiceConfirmCard");
      if (card) card.hidden = true;
    }
  }

  function numberWordsToInt(words) {
    const direct = {
      cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
      cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
      once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
      dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
      veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22,
      veintitres: 23, veinticuatro: 24, veinticinco: 25,
      veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29
    };
    const tens = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
    const hundreds = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

    let total = 0;
    let recognized = false;
    for (const raw of words) {
      const word = normalize(raw);
      if (!word || word === "y" || word === "numero" || word === "numeral") continue;
      if (Object.prototype.hasOwnProperty.call(direct, word)) {
        total += direct[word];
        recognized = true;
      } else if (Object.prototype.hasOwnProperty.call(tens, word)) {
        total += tens[word];
        recognized = true;
      } else if (Object.prototype.hasOwnProperty.call(hundreds, word)) {
        total += hundreds[word];
        recognized = true;
      } else {
        break;
      }
    }
    return recognized ? total : null;
  }

  function extractId(text) {
    const normalized = normalize(text);

    const digitMatch = normalized.match(/\b(?:id|solicitud)\s*(?:numero|numeral)?\s*#?\s*(\d+)\b/);
    if (digitMatch) return Number(digitMatch[1]);

    const anyDigit = normalized.match(/\b(\d+)\b/);
    if (anyDigit) return Number(anyDigit[1]);

    const marker = normalized.match(/\b(?:id|solicitud)\s*(?:numero|numeral)?\s+(.+)$/);
    if (marker) {
      const parsed = numberWordsToInt(marker[1].split(" "));
      if (parsed !== null) return parsed;
    }

    return null;
  }

  function parseCommand(transcript) {
    const command = normalize(transcript);

    if (pendingAction && /\b(confirmar|confirmo|confirmado|adelante|ejecutar|si)\b/.test(command)) {
      return { type: "confirm" };
    }

    if (pendingAction && /\b(cancelar|cancela|cancelado|no)\b/.test(command)) {
      return { type: "cancel" };
    }

    let action = null;
    if (/\b(permitir|aprobar|aceptar|autorizar)\b/.test(command)) action = "approve";
    else if (/\b(rechazar|negar|denegar)\b/.test(command)) action = "reject";
    else if (/\b(revocar|retirar|quitar)\b/.test(command)) action = "revoke";
    else if (/\b(consultar|consulta|mostrar|ver)\b/.test(command)) action = "consult";

    if (!action) return { type: "unknown" };

    const id = extractId(command);
    if (!Number.isInteger(id) || id <= 0) return { type: "missing-id", action };

    return { type: "action", action, id };
  }

  function fillRequestCard(row, title, action = null) {
    $("voiceConfirmTitle").textContent = title;
    $("voiceReqId").textContent = row.id ?? "-";
    $("voiceReqIp").textContent = row.ip || "-";
    $("voiceReqCenter").textContent = row.requester || "-";
    $("voiceReqNode").textContent = nodeLabel(row.node_name);
    $("voiceReqStatus").textContent = statusLabel(row.status);

    const confirm = $("voiceConfirmAction");
    const cancel = $("voiceCancelAction");

    confirm.hidden = action === null;
    cancel.textContent = action === null ? "Cerrar" : "Cancelar";
    confirm.className = "voice-action-button voice-confirm-action";

    if (action === "reject") confirm.classList.add("reject");
    if (action === "revoke") confirm.classList.add("revoke");

    if (action) {
      confirm.textContent = action === "approve"
        ? "Confirmar aprobación"
        : action === "reject"
          ? "Confirmar rechazo"
          : "Confirmar revocación";
    }

    $("voiceConfirmCard").hidden = false;
  }

  async function prepareAction(action, id) {
    processing = true;
    try {
      setStatus(`Consultando la solicitud #${id}...`);
      const row = await request(`/requests/${encodeURIComponent(id)}`);

      if (action === "consult") {
        pendingAction = null;
        fillRequestCard(row, `Solicitud #${id}`, null);
        setStatus(`Solicitud #${id}: ${statusLabel(row.status)}.`);
        setTranscript("Consulta realizada. No se efectuó ningún cambio.");
        return;
      }

      const config = ACTIONS[action];
      const currentStatus = String(row.status || "").toUpperCase();
      if (currentStatus !== config.expectedStatus) {
        pendingAction = null;
        $("voiceConfirmCard").hidden = true;
        setStatus(
          `No puedo ${config.label} el ID ${id}: está en estado ${statusLabel(row.status)}.`,
          "error"
        );
        setTranscript("No se realizó ninguna modificación.");
        return;
      }

      pendingAction = { action, id, row };
      fillRequestCard(row, config.title, action);
      setStatus(
        `Comando reconocido: ${config.label} ID ${id}. Revisa los datos y confirma.`,
        ""
      );
      setTranscript("Para confirmar por voz, pulsa otra vez el micrófono y di “Confirmar”. También puedes usar el botón.");
    } catch (error) {
      pendingAction = null;
      $("voiceConfirmCard").hidden = true;
      setStatus(error.message, "error");
      setTranscript("No se realizó ninguna modificación.");
    } finally {
      processing = false;
    }
  }

  function cancelPending() {
    pendingAction = null;
    $("voiceConfirmCard").hidden = true;
    setStatus("Acción cancelada. No se realizó ningún cambio.");
    setTranscript("Puedes dar otro comando cuando quieras.");
  }

  async function executePending() {
    if (!pendingAction || processing) return;

    processing = true;
    const current = pendingAction;
    const config = ACTIONS[current.action];

    try {
      setStatus(`Validando nuevamente la solicitud #${current.id}...`);

      // Releer antes de ejecutar evita actuar con información vieja.
      const fresh = await request(`/requests/${encodeURIComponent(current.id)}`);
      const freshStatus = String(fresh.status || "").toUpperCase();

      if (freshStatus !== config.expectedStatus) {
        throw new Error(
          `La solicitud #${current.id} cambió a estado ${statusLabel(fresh.status)}. No se ejecutó la acción.`
        );
      }

      setStatus(`Ejecutando: ${config.label} ID ${current.id}...`);
      await request(config.endpoint(current.id), { method: "POST" });

      pendingAction = null;
      $("voiceConfirmCard").hidden = true;
      setStatus(config.success(current.id));
      setTranscript("Acción confirmada mediante el WebAdmin API.");

      const refresh = document.getElementById("refreshButton");
      if (refresh) refresh.click();
    } catch (error) {
      setStatus(error.message, "error");
      setTranscript("No se completó la acción.");
    } finally {
      processing = false;
    }
  }

  async function processTranscript(transcript) {
    setTranscript(`Escuché: “${transcript}”`);
    const parsed = parseCommand(transcript);

    if (parsed.type === "confirm") {
      await executePending();
      return;
    }

    if (parsed.type === "cancel") {
      cancelPending();
      return;
    }

    if (parsed.type === "missing-id") {
      setStatus("Entendí la acción, pero no pude identificar el ID.", "error");
      setTranscript("Prueba diciendo: “Permitir ID 42”.");
      return;
    }

    if (parsed.type === "unknown") {
      setStatus("No reconocí ese comando.", "error");
      setTranscript("Comandos disponibles: Permitir, Rechazar, Revocar o Consultar + ID.");
      return;
    }

    await prepareAction(parsed.action, parsed.id);
  }

  function configureRecognition() {
    if (!Recognition) {
      $("voiceListen").disabled = true;
      setStatus("Este navegador no ofrece reconocimiento de voz compatible.", "error");
      setTranscript("Puedes seguir usando los botones normales del administrador.");
      return;
    }

    recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      listening = true;
      $("voiceMascot").classList.add("listening");
      $("voiceListen").disabled = true;
      $("voiceListen").textContent = "🎙 Escuchando...";
      setStatus("Te escucho...", "listening");
    };

    recognition.onresult = async (event) => {
      const alternatives = [];
      const result = event.results[event.resultIndex];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);

      // Normalmente la primera alternativa es la mejor. Si no contiene un ID,
      // probamos las siguientes antes de descartarla.
      let selected = alternatives[0] || "";
      for (const candidate of alternatives) {
        const parsed = parseCommand(candidate);
        if (parsed.type === "action" || parsed.type === "confirm" || parsed.type === "cancel") {
          selected = candidate;
          break;
        }
      }

      await processTranscript(selected);
    };

    recognition.onerror = (event) => {
      const messages = {
        "not-allowed": "Permiso de micrófono denegado.",
        "service-not-allowed": "El servicio de reconocimiento de voz no está permitido.",
        "no-speech": "No escuché ningún comando.",
        "audio-capture": "No se encontró un micrófono disponible.",
        network: "El reconocimiento de voz no pudo conectarse."
      };
      setStatus(messages[event.error] || `Error de voz: ${event.error}`, "error");
      setTranscript("No se realizó ninguna modificación.");
    };

    recognition.onend = () => {
      listening = false;
      $("voiceMascot").classList.remove("listening");
      $("voiceListen").disabled = false;
      $("voiceListen").textContent = "🎙 Hablar";
    };
  }

  function startListening() {
    openPanel();

    if (!Recognition || !recognition) {
      setStatus("Reconocimiento de voz no disponible en este navegador.", "error");
      return;
    }

    if (!token()) {
      setStatus("Primero inicia sesión como administrador.", "error");
      return;
    }

    if (listening || processing) return;

    try {
      recognition.start();
    } catch (error) {
      setStatus(`No pude iniciar el micrófono: ${error.message}`, "error");
    }
  }

  function bindUi() {
    $("voiceMascot").addEventListener("click", () => {
      const panel = $("voicePanel");
      panel.hidden = !panel.hidden;
    });

    $("voiceClose").addEventListener("click", closePanel);
    $("voiceListen").addEventListener("click", startListening);
    $("voiceCancelAction").addEventListener("click", cancelPending);
    $("voiceConfirmAction").addEventListener("click", executePending);
  }

  function init() {
    createUi();
    bindUi();
    configureRecognition();
    syncVisibility();

    const app = document.getElementById("appView");
    if (app) {
      new MutationObserver(syncVisibility).observe(app, {
        attributes: true,
        attributeFilter: ["hidden"]
      });
    }

    window.addEventListener("storage", syncVisibility);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
