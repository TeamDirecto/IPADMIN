(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";
  const RemoteRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const NativeRecognition = window.SpeechRecognition || null;
  const LOCAL_LANGS = ["es-MX", "es-ES"];

  let recognition = null;
  let recognitionMode = "none";
  let recognitionLang = "es-MX";
  let listening = false;
  let pendingAction = null;
  let processing = false;
  let localChecked = false;
  let localAvailable = false;

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

  function $(id) {
    return document.getElementById(id);
  }

  function token() {
    return sessionStorage.getItem("ipadmin_token") || "";
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!,.;:#]/g, " ")
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
    return map[String(value || "").toUpperCase()] || value || "-";
  }

  function setStatus(message, type = "") {
    const el = $("voiceStatus");
    if (!el) return;
    el.className = `voice-status${type ? ` ${type}` : ""}`;
    el.textContent = message;
  }

  function setTranscript(message) {
    const el = $("voiceTranscript");
    if (el) el.textContent = message || "";
  }

  function openPanel() {
    const panel = $("voicePanel");
    if (panel) panel.hidden = false;
  }

  function closePanel() {
    const panel = $("voicePanel");
    if (panel) panel.hidden = true;
  }

  function hideConfirm() {
    const card = $("voiceConfirmCard");
    if (card) card.hidden = true;
  }

  function createUi() {
    if ($("voiceAssistantRoot")) return;

    const root = document.createElement("div");
    root.id = "voiceAssistantRoot";
    root.className = "voice-assistant-root";
    root.hidden = true;
    root.innerHTML = `
      <section id="voicePanel" class="voice-panel" hidden>
        <header class="voice-panel-header">
          <div class="voice-panel-title">
            <span class="voice-mini-bot">🤖</span>
            <div>
              <strong>IP Bot</strong>
              <small>Control por voz · Fase 1</small>
            </div>
          </div>
          <button id="voiceClose" class="voice-close" type="button" aria-label="Cerrar">×</button>
        </header>
        <div class="voice-panel-body">
          <div id="voiceStatus" class="voice-status">Pulsa Hablar y di un comando.</div>
          <div class="voice-examples">
            <span class="voice-chip">Permitir ID 42</span>
            <span class="voice-chip">Rechazar ID 42</span>
            <span class="voice-chip">Revocar ID 31</span>
            <span class="voice-chip">Consultar ID 31</span>
          </div>
          <button id="voiceListen" class="voice-listen-button" type="button">🎙 Hablar</button>

          <section id="voiceConfirmCard" class="voice-confirm-card" hidden>
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
          </section>

          <div id="voiceTranscript" class="voice-transcript"></div>
        </div>
      </section>

      <button id="voiceMascot" class="voice-mascot" type="button" aria-label="Abrir IP Bot">
        <span class="voice-bot-head"><span class="voice-bot-eye"></span><span class="voice-bot-eye"></span></span>
        <span class="voice-mascot-label">IP Bot 🎙</span>
      </button>
    `;

    document.body.appendChild(root);
  }

  function syncVisibility() {
    const root = $("voiceAssistantRoot");
    const app = $("appView");
    if (!root || !app) return;
    root.hidden = app.hidden;
    if (app.hidden) closePanel();
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const currentToken = token();
    if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);
    return data;
  }

  const SMALL = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
    veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30,
    cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
    noventa: 90
  };

  const HUNDREDS = {
    cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
    quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
    novecientos: 900
  };

  function spanishWordsToNumber(words) {
    const tokens = normalize(words).split(" ").filter(Boolean).filter((w) => w !== "y");
    if (!tokens.length) return null;

    let total = 0;
    let current = 0;
    let seen = false;

    for (const word of tokens) {
      if (Object.prototype.hasOwnProperty.call(SMALL, word)) {
        current += SMALL[word];
        seen = true;
      } else if (Object.prototype.hasOwnProperty.call(HUNDREDS, word)) {
        current += HUNDREDS[word];
        seen = true;
      } else if (word === "mil") {
        current = current || 1;
        total += current * 1000;
        current = 0;
        seen = true;
      } else {
        return null;
      }
    }

    return seen ? total + current : null;
  }

  function extractId(text) {
    const normalized = normalize(text);
    const numeric = normalized.match(/(?:\bid\b|\bsolicitud\b)?\s*(\d{1,9})\b/);
    if (numeric) return Number(numeric[1]);

    const anchor = normalized.match(/(?:\bid\b|\bsolicitud\b)\s+(.+)$/);
    if (anchor) {
      const value = spanishWordsToNumber(anchor[1]);
      if (Number.isInteger(value) && value > 0) return value;
    }

    return null;
  }

  function parseCommand(raw) {
    const text = normalize(raw);

    if (/^(confirmar|confirma|confirmo|si confirmar|si confirmo|adelante)$/.test(text)) {
      return { type: "confirm" };
    }

    if (/^(cancelar|cancela|no cancelar|no cancela)$/.test(text)) {
      return { type: "cancel" };
    }

    const id = extractId(text);
    if (!id) return { type: "unknown" };

    if (/\b(permitir|permite|aprobar|aprueba|autorizar|autoriza)\b/.test(text)) {
      return { type: "action", action: "approve", id };
    }
    if (/\b(rechazar|rechaza|denegar|deniega)\b/.test(text)) {
      return { type: "action", action: "reject", id };
    }
    if (/\b(revocar|revoca|retirar|retira)\b/.test(text)) {
      return { type: "action", action: "revoke", id };
    }
    if (/\b(consultar|consulta|mostrar|muestra|ver|revisar|revisa)\b/.test(text)) {
      return { type: "query", id };
    }

    return { type: "unknown" };
  }

  function fillRequest(row) {
    $("voiceReqId").textContent = row.id ?? "-";
    $("voiceReqIp").textContent = row.ip || "-";
    $("voiceReqCenter").textContent = row.requester || "-";
    $("voiceReqNode").textContent = nodeLabel(row.node_name);
    $("voiceReqStatus").textContent = statusLabel(row.status);
  }

  async function fetchRequest(id) {
    return api(`/requests/${encodeURIComponent(id)}`);
  }

  async function showQuery(id) {
    try {
      processing = true;
      setStatus(`Consultando solicitud #${id}...`);
      const row = await fetchRequest(id);
      fillRequest(row);
      $("voiceConfirmTitle").textContent = `Solicitud #${id}`;
      $("voiceConfirmAction").hidden = true;
      $("voiceCancelAction").textContent = "Cerrar";
      $("voiceConfirmCard").hidden = false;
      setStatus(`Solicitud #${id}: ${statusLabel(row.status)}.`);
      setTranscript("Consulta únicamente. No se realizó ninguna modificación.");
      pendingAction = null;
    } catch (error) {
      setStatus(error.message, "error");
      setTranscript("No se realizó ninguna modificación.");
    } finally {
      processing = false;
    }
  }

  async function prepareAction(action, id) {
    const cfg = ACTIONS[action];
    if (!cfg) return;

    try {
      processing = true;
      setStatus(`Validando solicitud #${id}...`);
      const row = await fetchRequest(id);
      const status = String(row.status || "").toUpperCase();

      if (status !== cfg.expectedStatus) {
        pendingAction = null;
        hideConfirm();
        setStatus(
          `No puedo ${cfg.label} #${id}: su estado actual es ${statusLabel(status)}.`,
          "error"
        );
        setTranscript("No se realizó ninguna modificación.");
        return;
      }

      pendingAction = { action, id, expectedStatus: cfg.expectedStatus };
      fillRequest(row);
      $("voiceConfirmTitle").textContent = cfg.title;
      $("voiceConfirmAction").hidden = false;
      $("voiceConfirmAction").textContent = `Confirmar ${cfg.label}`;
      $("voiceConfirmAction").className = `voice-action-button voice-confirm-action${action === "reject" ? " reject" : action === "revoke" ? " revoke" : ""}`;
      $("voiceCancelAction").textContent = "Cancelar";
      $("voiceConfirmCard").hidden = false;
      setStatus(`Comando reconocido: ${cfg.label} solicitud #${id}.`);
      setTranscript('Revisa los datos y pulsa Confirmar, o vuelve a hablar y di "Confirmar".');
    } catch (error) {
      pendingAction = null;
      hideConfirm();
      setStatus(error.message, "error");
      setTranscript("No se realizó ninguna modificación.");
    } finally {
      processing = false;
    }
  }

  async function executePending() {
    if (!pendingAction || processing) return;

    const current = { ...pendingAction };
    const cfg = ACTIONS[current.action];

    try {
      processing = true;
      setStatus(`Revalidando solicitud #${current.id}...`);
      const row = await fetchRequest(current.id);
      const status = String(row.status || "").toUpperCase();

      if (status !== current.expectedStatus) {
        throw new Error(`La solicitud cambió de estado a ${statusLabel(status)}. No se ejecutó la acción.`);
      }

      setStatus(`Ejecutando ${cfg.label} #${current.id}...`);
      await api(cfg.endpoint(current.id), { method: "POST" });
      pendingAction = null;
      hideConfirm();
      setStatus(cfg.success(current.id));
      setTranscript("Acción enviada al backend autenticado.");

      const refresh = $("refreshButton");
      if (refresh) refresh.click();
    } catch (error) {
      setStatus(error.message, "error");
      setTranscript("No se realizó una acción adicional.");
    } finally {
      processing = false;
    }
  }

  function cancelPending() {
    pendingAction = null;
    hideConfirm();
    setStatus("Acción cancelada.");
    setTranscript("No se realizó ninguna modificación.");
  }

  async function processTranscript(raw) {
    const parsed = parseCommand(raw);
    setTranscript(`Escuché: “${raw}”`);

    if (parsed.type === "confirm") {
      if (!pendingAction) {
        setStatus("No hay ninguna acción pendiente por confirmar.", "error");
        return;
      }
      await executePending();
      return;
    }

    if (parsed.type === "cancel") {
      cancelPending();
      return;
    }

    if (parsed.type === "query") {
      await showQuery(parsed.id);
      return;
    }

    if (parsed.type === "action") {
      await prepareAction(parsed.action, parsed.id);
      return;
    }

    setStatus("No entendí el comando.", "error");
    setTranscript('Prueba: “Permitir ID 42”, “Rechazar ID 42”, “Revocar ID 31” o “Consultar ID 31”.');
  }

  function bindRecognitionEvents(instance) {
    instance.onstart = () => {
      listening = true;
      $("voiceMascot").classList.add("listening");
      $("voiceListen").disabled = true;
      $("voiceListen").textContent = "🎙 Escuchando...";
      setStatus(`Te escucho... (${recognitionMode === "local" ? "modo local" : "servicio del navegador"})`, "listening");
    };

    instance.onresult = async (event) => {
      const alternatives = [];
      const result = event.results[event.resultIndex];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);

      let selected = alternatives[0] || "";
      for (const candidate of alternatives) {
        const parsed = parseCommand(candidate);
        if (["action", "query", "confirm", "cancel"].includes(parsed.type)) {
          selected = candidate;
          break;
        }
      }

      await processTranscript(selected);
    };

    instance.onerror = (event) => {
      const messages = {
        "not-allowed": "Permiso de micrófono denegado.",
        "service-not-allowed": "El servicio de reconocimiento de voz no está permitido.",
        "no-speech": "No escuché ningún comando.",
        "audio-capture": "No se encontró un micrófono disponible.",
        "language-not-supported": `El idioma ${recognitionLang} no está disponible para reconocimiento local.`,
        "language-unavailable": `El paquete de idioma ${recognitionLang} no está disponible.`,
        network: recognitionMode === "local"
          ? "El reconocimiento local tuvo un error al preparar el idioma."
          : "El servicio remoto de voz del navegador no pudo conectarse."
      };
      setStatus(messages[event.error] || `Error de voz: ${event.error}`, "error");
      if (event.error === "network" && recognitionMode !== "local") {
        setTranscript("El navegador intentó usar reconocimiento remoto. IP Bot volverá a intentar primero con reconocimiento local en la próxima escucha.");
        localChecked = false;
      } else {
        setTranscript("No se realizó ninguna modificación.");
      }
    };

    instance.onend = () => {
      listening = false;
      $("voiceMascot").classList.remove("listening");
      $("voiceListen").disabled = false;
      $("voiceListen").textContent = "🎙 Hablar";
    };
  }

  function buildRecognition(local, lang) {
    const Ctor = local ? NativeRecognition : RemoteRecognition;
    if (!Ctor) return null;

    const instance = new Ctor();
    instance.lang = lang;
    instance.continuous = false;
    instance.interimResults = false;
    instance.maxAlternatives = 3;

    if (local && "processLocally" in instance) {
      instance.processLocally = true;
    }

    recognitionMode = local ? "local" : "remote";
    recognitionLang = lang;
    bindRecognitionEvents(instance);
    return instance;
  }

  async function prepareLocalRecognition() {
    if (localChecked) return localAvailable;
    localChecked = true;
    localAvailable = false;

    if (
      !NativeRecognition ||
      typeof NativeRecognition.available !== "function" ||
      typeof NativeRecognition.install !== "function"
    ) {
      return false;
    }

    for (const lang of LOCAL_LANGS) {
      try {
        setStatus(`Comprobando reconocimiento local ${lang}...`);
        const availability = await NativeRecognition.available({
          langs: [lang],
          processLocally: true
        });

        if (availability === "available") {
          recognition = buildRecognition(true, lang);
          localAvailable = Boolean(recognition);
          return localAvailable;
        }

        if (availability === "downloadable" || availability === "downloading") {
          setStatus(`Preparando paquete de voz ${lang} en el navegador...`);
          const installed = await NativeRecognition.install({
            langs: [lang],
            processLocally: true
          });

          if (installed) {
            recognition = buildRecognition(true, lang);
            localAvailable = Boolean(recognition);
            return localAvailable;
          }
        }
      } catch (_) {
        // Probamos el siguiente idioma y, si ninguno funciona, usamos el modo remoto.
      }
    }

    return false;
  }

  async function ensureRecognition() {
    const localOk = await prepareLocalRecognition();
    if (localOk && recognition) return recognition;

    if (!RemoteRecognition) return null;

    recognition = buildRecognition(false, "es-MX");
    return recognition;
  }

  async function startListening() {
    openPanel();

    if (!token()) {
      setStatus("Primero inicia sesión como administrador.", "error");
      return;
    }

    if (listening || processing) return;

    $("voiceListen").disabled = true;
    $("voiceListen").textContent = "Preparando...";

    try {
      const instance = await ensureRecognition();
      if (!instance) {
        setStatus("Este navegador no ofrece reconocimiento de voz compatible.", "error");
        setTranscript("Los botones normales del administrador siguen disponibles.");
        return;
      }
      instance.start();
    } catch (error) {
      setStatus(`No pude iniciar el micrófono: ${error.message}`, "error");
      setTranscript("No se realizó ninguna modificación.");
      $("voiceListen").disabled = false;
      $("voiceListen").textContent = "🎙 Hablar";
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
    syncVisibility();

    if (!RemoteRecognition && !NativeRecognition) {
      $("voiceListen").disabled = true;
      setStatus("Este navegador no ofrece reconocimiento de voz compatible.", "error");
    } else if (
      NativeRecognition &&
      typeof NativeRecognition.available === "function" &&
      typeof NativeRecognition.install === "function"
    ) {
      setStatus("Listo. Al hablar, intentaré reconocimiento local primero.");
    } else {
      setStatus("Listo. Este navegador usará su servicio de reconocimiento de voz.");
    }

    const app = $("appView");
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
