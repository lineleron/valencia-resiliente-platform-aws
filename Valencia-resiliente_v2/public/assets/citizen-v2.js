(function () {
  "use strict";

  var root = document.getElementById("vt-citizen-preview");
  var screen = document.getElementById("vc-screen");
  if (!root || !screen) return;

  var STORAGE_KEY = "vt01-citizen-v3";
  var OUTBOX_KEY = "vt01-quick-checkin-outbox";
  var SESSION_CASE_KEY = "vt01_current_case";
  var POLICY_CACHE_KEY = "vt01-escalation-policy";
  var CITIZEN_PUBLIC_URL = "https://valenciaresiliente.duckdns.org/ciudadano";
  var ALERT_POLL_MS = 3000;
  var DEMO_ES_ALERT = /(?:^|[?&])demo=(?:es-alert|1)(?:&|$)/.test(window.location.search);
  var severityRank = {unknown: 0, low: 1, medium: 2, high: 3, critical: 4};
  var severityColors = {unknown: "#56686b", low: "#087a65", medium: "#946200", high: "#b54e00", critical: "#a70f24"};
  var severityIcons = {unknown: "circle-help", low: "info", medium: "triangle-alert", high: "shield-alert", critical: "siren"};
  var copy = {
    es: {
      zone: "Tu zona", locate: "Detectar mi zona", local: "En tu zona", level: "Nivel", action: "Acción recomendada",
      listen: "Escuchar", stop: "Detener", respond: "Responder en 3 pasos", call: "Llamar al 112", callLabel: "Abrir el marcador para llamar al 112",
      other: "Resumen general y otras zonas", noAlert: "Sin alerta activa en tu zona", noAlertCopy: "Consulta el resumen general y mantén activados los canales oficiales.",
      noAlertAction: "Mantente informado por canales oficiales.", low: "Bajo", medium: "Medio", high: "Alto", critical: "Crítico", unknown: "Información insuficiente",
      report: "Compartir una situación", multimedia: "Añadir foto, audio o vídeo", alertsOn: "Activar avisos destacados", alertsReady: "Avisos destacados activados",
      source: "Fuente", updated: "Actualizada", loading: "Cargando alertas de tu zona…", loadError: "No se pudo actualizar; se muestra la última información disponible.",
      qTitle: "Respuesta rápida", later: "Ahora no", qReceived: "¿Has recibido esta alerta?", qUnderstood: "¿Has entendido qué debes hacer?",
      qDanger: "¿Estás en peligro inmediato o en la zona afectada?", qKnowsAction: "¿Sabes cómo actuar ante esta situación?", qHelp: "¿Necesitas ayuda para ti o para otra persona?", yes: "Sí", no: "No", question: "Pregunta",
      answerSending: "Enviando respuesta a la central…", answerSent: "Respuesta recibida por la central", answerQueued: "Respuesta guardada; se enviará al recuperar la conexión.", help112: "Si hay peligro inmediato, llama al 112.",
      sendingTitle: "Enviando respuesta", sendingCopy: "Estamos enviando tus respuestas a la central.", pendingTitle: "Envío pendiente", pendingCopy: "La respuesta está guardada en este dispositivo y se enviará cuando vuelva la conexión.",
      readQuestion: "Repetir pregunta", voiceStart: "Responder por voz", voiceStop: "Detener micrófono", voiceSpeaking: "El asistente está hablando…", voiceListening: "Escuchando. Di sí o no.", voiceAlternative: "También puedes pulsar Sí o No.", voiceUnavailable: "La respuesta por voz no está disponible en este navegador. Usa los botones.", voiceDenied: "No se pudo usar el micrófono. Usa los botones Sí o No.", voiceUnclear: "No se ha entendido la respuesta. Di sí o no, o pulsa un botón.",
      urgentTitle: "Incidencia prioritaria enviada", urgentCopy: "La central ya ha recibido el caso. Si hay peligro inmediato, abre el marcador y llama al 112.", callNow: "Llamar ahora al 112", callHint: "Un toque abre el marcador. La llamada solo comienza cuando tú la confirmas.",
      optionalTitle: "Respuesta enviada", optionalCopy: "Si es seguro hacerlo, puedes añadir una evidencia. Es opcional.", skipEvidence: "Finalizar sin adjuntar", mediaTitle: "Enviar evidencia", mediaIntro: "Selecciona el archivo y confirma el envío. Se vinculará automáticamente a esta alerta.",
      photo: "Foto", audio: "Audio", video: "Vídeo", consent: "Autorizo enviar este archivo a la central para gestionar esta emergencia.",
      upload: "Enviar archivo", close: "Cerrar", caseNeeded: "Primero envía una incidencia VT-01 para vincular el archivo.", openReport: "Abrir informe de incidencia",
      chooseFile: "Selecciona un archivo y confirma el consentimiento.", uploading: "Enviando de forma segura…", uploaded: "Archivo recibido. El análisis local aparece como SIMULACIÓN hasta conectar AWS.",
      uploadError: "No se pudo enviar el archivo. Puedes intentarlo de nuevo.", locationDenied: "No se pudo obtener la ubicación. Selecciona la zona manualmente.", backAlert: "← Volver a la alerta",
      settings: "Configuración", evidenceTitle: "Aporta evidencia", evidenceHint: "Opcional · llega directamente a la central", creatingCase: "Preparando el aviso…",
      caseSent: "Aviso enviado a la central", caseQueued: "Aviso pendiente; se enviará al recuperar la conexión.",
      language: "Idioma", textSize: "Tamaño de texto", smaller: "Reducir texto", larger: "Aumentar texto", narration: "Narración por voz",
      narrationOn: "Activada", narrationOff: "Desactivada", contrast: "Alto contraste", visualAlerts: "Avisos visuales y vibración",
      offline: "Disponibilidad sin conexión", cachedOnline: "Última información guardada en este dispositivo", cachedOffline: "Sin conexión · mostrando la última copia",
      cachedAt: "Copia local", privacy: "Cámara y ubicación solo se usan cuando tú las autorizas.", percent: "Tamaño actual",
      qrEyebrow: "Acceso ciudadano", qrTitle: "Abre este panel en tu móvil", qrCopy: "Escanea el código QR con la cámara de tu teléfono para acceder directamente al panel ciudadano.",
      qrLink: "Abrir enlace del panel ciudadano", qrAlt: "Código QR para abrir el panel ciudadano Valencia Resiliente"
    },
    val: {
      zone: "La teua zona", locate: "Detectar la meua zona", local: "En la teua zona", level: "Nivell", action: "Acció recomanada",
      listen: "Escoltar", stop: "Detindre", respond: "Respondre en 3 passos", call: "Telefonar al 112", callLabel: "Obrir el marcador per a telefonar al 112",
      other: "Resum general i altres zones", noAlert: "Sense alerta activa en la teua zona", noAlertCopy: "Consulta el resum general i mantín actius els canals oficials.",
      noAlertAction: "Mantín-te informat pels canals oficials.", low: "Baix", medium: "Mitjà", high: "Alt", critical: "Crític", unknown: "Informació insuficient",
      report: "Compartir una situació", multimedia: "Afegir foto, àudio o vídeo", alertsOn: "Activar avisos destacats", alertsReady: "Avisos destacats activats",
      source: "Font", updated: "Actualitzada", loading: "Carregant alertes de la teua zona…", loadError: "No s'ha pogut actualitzar; es mostra l'última informació disponible.",
      qTitle: "Resposta ràpida", later: "Ara no", qReceived: "Has rebut esta alerta?", qUnderstood: "Has entés què has de fer?",
      qDanger: "Estàs en perill immediat o en la zona afectada?", qKnowsAction: "Saps com actuar davant d'esta situació?", qHelp: "Necessites ajuda per a tu o per a una altra persona?", yes: "Sí", no: "No", question: "Pregunta",
      answerSending: "Enviant resposta a la central…", answerSent: "Resposta rebuda per la central", answerQueued: "Resposta guardada; s'enviarà quan torne la connexió.", help112: "Si hi ha perill immediat, telefona al 112.",
      sendingTitle: "Enviant resposta", sendingCopy: "Estem enviant les teues respostes a la central.", pendingTitle: "Enviament pendent", pendingCopy: "La resposta està guardada en este dispositiu i s'enviarà quan torne la connexió.",
      readQuestion: "Repetir pregunta", voiceStart: "Respondre per veu", voiceStop: "Detindre micròfon", voiceSpeaking: "L'assistent està parlant…", voiceListening: "Escoltant. Digues sí o no.", voiceAlternative: "També pots prémer Sí o No.", voiceUnavailable: "La resposta per veu no està disponible en este navegador. Usa els botons.", voiceDenied: "No s'ha pogut usar el micròfon. Usa els botons Sí o No.", voiceUnclear: "No s'ha entés la resposta. Digues sí o no, o prem un botó.",
      urgentTitle: "Incidència prioritària enviada", urgentCopy: "La central ja ha rebut el cas. Si hi ha perill immediat, obri el marcador i telefona al 112.", callNow: "Telefonar ara al 112", callHint: "Un toc obri el marcador. La telefonada només comença quan tu la confirmes.",
      optionalTitle: "Resposta enviada", optionalCopy: "Si és segur fer-ho, pots afegir una evidència. És opcional.", skipEvidence: "Finalitzar sense adjuntar", mediaTitle: "Enviar evidència", mediaIntro: "Selecciona l'arxiu i confirma l'enviament. Es vincularà automàticament a esta alerta.",
      photo: "Foto", audio: "Àudio", video: "Vídeo", consent: "Autoritze enviar este arxiu a la central per a gestionar esta emergència.",
      upload: "Enviar arxiu", close: "Tancar", caseNeeded: "Primer envia una incidència VT-01 per a vincular l'arxiu.", openReport: "Obrir informe d'incidència",
      chooseFile: "Selecciona un arxiu i confirma el consentiment.", uploading: "Enviant de manera segura…", uploaded: "Arxiu rebut. L'anàlisi local apareix com a SIMULACIÓ fins a connectar AWS.",
      uploadError: "No s'ha pogut enviar l'arxiu. Pots tornar-ho a intentar.", locationDenied: "No s'ha pogut obtindre la ubicació. Selecciona la zona manualment.", backAlert: "← Tornar a l'alerta",
      settings: "Configuració", evidenceTitle: "Aporta evidència", evidenceHint: "Opcional · arriba directament a la central", creatingCase: "Preparant l'avís…",
      caseSent: "Avís enviat a la central", caseQueued: "Avís pendent; s'enviarà quan torne la connexió.",
      language: "Idioma", textSize: "Grandària del text", smaller: "Reduir text", larger: "Augmentar text", narration: "Narració per veu",
      narrationOn: "Activada", narrationOff: "Desactivada", contrast: "Contrast alt", visualAlerts: "Avisos visuals i vibració",
      offline: "Disponibilitat sense connexió", cachedOnline: "Última informació guardada en este dispositiu", cachedOffline: "Sense connexió · mostrant l'última còpia",
      cachedAt: "Còpia local", privacy: "La càmera i la ubicació només s'usen quan tu les autoritzes.", percent: "Grandària actual",
      qrEyebrow: "Accés ciutadà", qrTitle: "Obri este panell en el teu mòbil", qrCopy: "Escaneja el codi QR amb la càmera del teu telèfon per a accedir directament al panell ciutadà.",
      qrLink: "Obrir l'enllaç del panell ciutadà", qrAlt: "Codi QR per a obrir el panell ciutadà València Resilient"
    },
    en: {
      zone: "Your area", locate: "Detect my area", local: "In your area", level: "Level", action: "Recommended action",
      listen: "Listen", stop: "Stop", respond: "Answer 3 questions", call: "Call 112", callLabel: "Open the dialler to call 112",
      other: "General summary and other areas", noAlert: "No active alert in your area", noAlertCopy: "Check the general summary and keep official channels enabled.",
      noAlertAction: "Keep informed through official channels.", low: "Low", medium: "Medium", high: "High", critical: "Critical", unknown: "Insufficient information",
      report: "Share a situation", multimedia: "Add photo, audio or video", alertsOn: "Enable prominent alerts", alertsReady: "Prominent alerts enabled",
      source: "Source", updated: "Updated", loading: "Loading alerts for your area…", loadError: "The update failed; the latest available information is shown.",
      qTitle: "Quick response", later: "Not now", qReceived: "Have you received this alert?", qUnderstood: "Do you understand what you should do?",
      qDanger: "Are you in immediate danger or in the affected area?", qKnowsAction: "Do you know what to do in this situation?", qHelp: "Do you need help for yourself or someone else?", yes: "Yes", no: "No", question: "Question",
      answerSending: "Sending response to the control centre…", answerSent: "The control centre received your response", answerQueued: "Response saved; it will be sent when the connection returns.", help112: "If anyone is in immediate danger, call 112.",
      sendingTitle: "Sending response", sendingCopy: "We are sending your answers to the control centre.", pendingTitle: "Sending pending", pendingCopy: "The response is saved on this device and will be sent when the connection returns.",
      readQuestion: "Repeat question", voiceStart: "Answer by voice", voiceStop: "Stop microphone", voiceSpeaking: "The assistant is speaking…", voiceListening: "Listening. Say yes or no.", voiceAlternative: "You can also press Yes or No.", voiceUnavailable: "Voice response is not available in this browser. Use the buttons.", voiceDenied: "The microphone could not be used. Use the Yes or No buttons.", voiceUnclear: "The answer was not understood. Say yes or no, or press a button.",
      urgentTitle: "Priority incident sent", urgentCopy: "The control centre has received the case. If there is immediate danger, open the dialler and call 112.", callNow: "Call 112 now", callHint: "One tap opens the dialler. The call only starts when you confirm it.",
      optionalTitle: "Response sent", optionalCopy: "If it is safe, you can add evidence. This is optional.", skipEvidence: "Finish without attaching", mediaTitle: "Send evidence", mediaIntro: "Choose the file and confirm. It will be linked to this alert automatically.",
      photo: "Photo", audio: "Audio", video: "Video", consent: "I authorise sending this file to the control centre to manage this emergency.",
      upload: "Send file", close: "Close", caseNeeded: "Send a VT-01 incident first so the file can be linked.", openReport: "Open incident report",
      chooseFile: "Select a file and confirm consent.", uploading: "Uploading securely…", uploaded: "File received. Local analysis is labelled SIMULATION until AWS is connected.",
      uploadError: "The file could not be uploaded. You can try again.", locationDenied: "Your location could not be obtained. Select the area manually.", backAlert: "← Back to the alert",
      settings: "Settings", evidenceTitle: "Add evidence", evidenceHint: "Optional · sent directly to the control centre", creatingCase: "Preparing the report…",
      caseSent: "Report sent to the control centre", caseQueued: "Report pending; it will be sent when the connection returns.",
      language: "Language", textSize: "Text size", smaller: "Reduce text", larger: "Increase text", narration: "Voice narration",
      narrationOn: "On", narrationOff: "Off", contrast: "High contrast", visualAlerts: "Visual alerts and vibration",
      offline: "Offline availability", cachedOnline: "Latest information saved on this device", cachedOffline: "Offline · showing the latest copy",
      cachedAt: "Local copy", privacy: "Camera and location are only used when you authorise them.", percent: "Current size",
      qrEyebrow: "Citizen access", qrTitle: "Open this panel on your phone", qrCopy: "Scan the QR code with your phone camera to open the citizen dashboard directly.",
      qrLink: "Open the citizen dashboard link", qrAlt: "QR code to open the Valencia Resiliente citizen dashboard"
    }
  };

  var fallbackZones = [
    {id: "poblats-maritims", code: "POBLATS MARITIMS", names: {es: "Poblats Marítims", val: "Poblats Marítims", en: "Maritime Districts"}, centroid: {latitude: 39.4688, longitude: -0.3318}},
    {id: "quatre-carreres", code: "QUATRE CARRERES", names: {es: "Quatre Carreres", val: "Quatre Carreres", en: "Quatre Carreres"}, centroid: {latitude: 39.4516, longitude: -0.3592}},
    {id: "campanar", code: "CAMPANAR", names: {es: "Campanar", val: "Campanar", en: "Campanar"}, centroid: {latitude: 39.4898, longitude: -0.4021}},
    {id: "ciutat-vella", code: "CIUTAT VELLA", names: {es: "Ciutat Vella", val: "Ciutat Vella", en: "Old Town"}, centroid: {latitude: 39.4742, longitude: -0.3773}},
    {id: "benimaclet", code: "BENIMACLET", names: {es: "Benimaclet", val: "Benimaclet", en: "Benimaclet"}, centroid: {latitude: 39.4875, longitude: -0.3597}},
    {id: "poblats-del-sud", code: "POBLATS DEL SUD", names: {es: "Poblats del Sud", val: "Poblats del Sud", en: "Southern Districts"}, centroid: {latitude: 39.3822, longitude: -0.3321}}
  ];
  var fallbackAlerts = [{
    id: "ALERT-DEMO-VALENCIA-01", version: 2, type: "flood", source: "VT-01 · SIMULACIÓN", issuedAt: "2026-09-25T07:30:00Z",
    title: {es: "Riesgo de inundación", val: "Risc d'inundació", en: "Flood risk"},
    summary: {es: "Lluvia intensa con riesgo en zonas bajas.", val: "Pluja intensa amb risc en zones baixes.", en: "Heavy rain with risk in low-lying areas."},
    recommendedAction: {es: "Evita desplazarte y sube a una planta superior si entra agua.", val: "Evita desplaçar-te i puja a una planta superior si entra aigua.", en: "Avoid travel and move to an upper floor if water enters."},
    zones: [
      {zoneId: "poblats-maritims", severity: "critical"}, {zoneId: "poblats-del-sud", severity: "high"},
      {zoneId: "quatre-carreres", severity: "medium"}, {zoneId: "ciutat-vella", severity: "low"}
    ]
  }];

  var CASE_OUTBOX_KEY = "vt01-alert-case-outbox";
  var SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var voiceRecognition = null;
  var voiceToken = 0;
  var quickFlowToken = 0;
  var quickTimer = null;
  var lastAutoSpokenKey = "";
  var state = {
    zones: fallbackZones, alerts: fallbackAlerts, zoneId: "poblats-maritims", source: "manual", loading: true, error: false,
    speaking: false, tactile: false, narration: true, narrationConfigured: false, contrast: false, textSize: 0, receipt: "", receiptStatus: "", cachedAt: "",
    quick: null, lastAnswers: null, pendingMediaKind: "", mediaKind: "", mediaAlert: null, selectedFile: null,
    alertSignature: "", demoPrompted: false, policy: loadCachedPolicy(), position: null
  };
  loadState();
  applyPreferences();

  var mount = document.createElement("section");
  mount.className = "vc-v2-shell";
  mount.id = "vc-v2-shell";
  mount.setAttribute("aria-label", "Alerta prioritaria de tu zona");
  screen.parentNode.insertBefore(mount, screen);
  var quickDialog = buildQuickDialog();
  var mediaDialog = buildMediaDialog();
  var settingsDialog = buildSettingsDialog();
  document.body.appendChild(quickDialog);
  document.body.appendChild(mediaDialog);
  document.body.appendChild(settingsDialog);

  function lang() {
    var value = (root.getAttribute("lang") || "es").toLowerCase();
    return value.indexOf("ca") === 0 || value.indexOf("val") === 0 ? "val" : value.indexOf("en") === 0 ? "en" : "es";
  }
  function tr(key) { return (copy[lang()] && copy[lang()][key]) || copy.es[key] || key; }
  function emergencyNumber(decision) {
    var value = String(decision && decision.emergencyNumber || state.policy && state.policy.emergencyNumber || "112");
    return /^[0-9]{3,6}$/.test(value) ? value : "112";
  }
  function emergencyText(key, decision) { return tr(key).replace(/112/g, emergencyNumber(decision)); }
  function local(value) { return value && (value[lang()] || value.es || value.val || value.en) || ""; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[character]; }); }
  function uid(prefix) {
    if (window.crypto && window.crypto.randomUUID) return prefix + "-" + window.crypto.randomUUID();
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
  function zone() { return state.zones.filter(function (item) { return item.id === state.zoneId; })[0] || state.zones[0]; }
  function zoneName(zoneItem) { return local(zoneItem && zoneItem.names); }
  function severityLabel(level) { return tr(severityRank[level] == null ? "unknown" : level); }
  function targetFor(alert, zoneId) { return (alert.zones || []).filter(function (item) { return item.zoneId === zoneId; })[0] || null; }
  function localAlerts() {
    return state.alerts.map(function (alert) {
      var target = targetFor(alert, state.zoneId);
      return {alert: alert, severity: target ? target.severity : null};
    }).filter(function (item) { return item.severity; }).sort(function (a, b) {
      return severityRank[b.severity] - severityRank[a.severity] || String(b.alert.issuedAt).localeCompare(String(a.alert.issuedAt));
    });
  }
  function alertsSignature(alerts) {
    return (alerts || []).map(function (alert) {
      return [alert.id, alert.version, alert.issuedAt, (alert.zones || []).map(function (item) { return item.zoneId + ":" + item.severity; }).join(",")].join("|");
    }).sort().join(";");
  }
  function policyConditionIsUsable(condition, depth) {
    if (!condition || typeof condition !== "object" || (depth || 0) > 4) return false;
    if (Array.isArray(condition.all)) return condition.all.length > 0 && condition.all.length <= 8 && condition.all.every(function (item) { return policyConditionIsUsable(item, (depth || 0) + 1); });
    if (Array.isArray(condition.any)) return condition.any.length > 0 && condition.any.length <= 8 && condition.any.every(function (item) { return policyConditionIsUsable(item, (depth || 0) + 1); });
    return ["danger", "knowsAction", "needsHelp"].indexOf(condition.field) >= 0 && typeof condition.equals === "boolean";
  }
  function policyIsUsable(policy) {
    if (!policy || typeof policy !== "object" || !Number.isFinite(Number(policy.version)) || !Array.isArray(policy.questions) || policy.questions.length !== 3 || !Array.isArray(policy.rules) || policy.rules.length > 20) return false;
    var ids = policy.questions.map(function (item) { return item && item.id; });
    var questionsValid = ids.every(function (id, index) {
      var question = policy.questions[index], text = question && question.text;
      return ["danger", "knowsAction", "needsHelp"].indexOf(id) >= 0 && ids.indexOf(id) === index && text && ["es", "val", "en"].every(function (language) { return typeof text[language] === "string" && text[language].trim().length > 0; });
    }) && ["danger", "knowsAction", "needsHelp"].every(function (id) { return ids.indexOf(id) >= 0; });
    var ruleIds = policy.rules.map(function (rule) { return rule && rule.id; });
    var rulesValid = policy.rules.every(function (rule, index) {
      return rule && typeof rule.id === "string" && rule.id.length > 0 && ruleIds.indexOf(rule.id) === index &&
        ["pending", "low", "medium", "high", "critical"].indexOf(rule.priority) >= 0 && policyConditionIsUsable(rule.when, 0);
    });
    return questionsValid && rulesValid;
  }
  function loadCachedPolicy() {
    try {
      var cached = JSON.parse(localStorage.getItem(POLICY_CACHE_KEY) || "null");
      return policyIsUsable(cached) ? cached : null;
    } catch (error) { return null; }
  }
  function savePolicy(policy) {
    if (!policyIsUsable(policy)) return;
    state.policy = policy;
    try { localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify(policy)); } catch (error) {}
  }
  function conditionMatches(condition, answers) {
    if (!condition || typeof condition !== "object") return false;
    if (Array.isArray(condition.all)) return condition.all.every(function (item) { return conditionMatches(item, answers); });
    if (Array.isArray(condition.any)) return condition.any.some(function (item) { return conditionMatches(item, answers); });
    return ["danger", "knowsAction", "needsHelp"].indexOf(condition.field) >= 0 && typeof condition.equals === "boolean" && answers[condition.field] === condition.equals;
  }
  function evaluatePolicy(answers) {
    var policy = state.policy;
    var fallback = {priority: "pending", createIncident: false, offerEmergencyCall: false, citizenState: "safe", need: "Respuesta a alerta pública"};
    var decision = Object.assign({}, policy && policy.defaultDecision || fallback, {
      matched: false, ruleId: "default", policyVersion: policy && policy.version || 0,
      callMode: "one_tap", emergencyNumber: policy && policy.emergencyNumber || "112", answers: Object.assign({}, answers)
    });
    if (!policy || !Array.isArray(policy.rules)) return decision;
    policy.rules.some(function (rule) {
      if (!conditionMatches(rule.when, answers)) return false;
      decision = Object.assign(decision, rule, {matched: true, ruleId: rule.id});
      delete decision.when;
      return true;
    });
    return decision;
  }
  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (typeof saved.zoneId === "string") state.zoneId = saved.zoneId;
      state.source = saved.source === "gps" ? "gps" : "manual";
      state.tactile = saved.tactile === true;
      state.narrationConfigured = saved.narrationConfigured === true;
      state.narration = state.narrationConfigured ? saved.narration === true : true;
      state.contrast = saved.contrast === true;
      state.textSize = Math.max(0, Math.min(2, Number(saved.textSize) || 0));
      state.receipt = typeof saved.receipt === "string" ? saved.receipt.slice(0, 160) : "";
      state.receiptStatus = ["pending", "confirmed"].indexOf(saved.receiptStatus) >= 0 ? saved.receiptStatus : "";
      state.cachedAt = typeof saved.cachedAt === "string" ? saved.cachedAt.slice(0, 80) : "";
      if (saved.lastAnswers && typeof saved.lastAnswers === "object") state.lastAnswers = saved.lastAnswers;
    } catch (error) {}
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({zoneId: state.zoneId, source: state.source, tactile: state.tactile, narration: state.narration, narrationConfigured: state.narrationConfigured, contrast: state.contrast, textSize: state.textSize, receipt: state.receipt, receiptStatus: state.receiptStatus, cachedAt: state.cachedAt, lastAnswers: state.lastAnswers})); } catch (error) {}
  }
  function applyPreferences() {
    root.classList.add("vc-v2-active");
    root.classList.toggle("vc-v2-contrast", state.contrast);
    root.setAttribute("data-v2-text-size", String(state.textSize));
    document.body.classList.toggle("vc-v2-contrast-mode", state.contrast);
    document.body.setAttribute("data-vc-v2-text-size", String(state.textSize));
  }
  async function jsonRequest(path, options) {
    var response = await fetch(path, Object.assign({credentials: "same-origin"}, options || {}));
    var data = await response.json().catch(function () { return {message: "Respuesta no válida"}; });
    if (!response.ok) throw new Error(data.message || "Error de conexión");
    return data;
  }
  async function loadData() {
    state.loading = true; state.error = false; render();
    try {
      var values = await Promise.all([
        jsonRequest("/api/public/zones"),
        jsonRequest("/api/public/alerts?scope=all"),
        jsonRequest("/api/public/escalation-policy").catch(function () { return null; })
      ]);
      if (Array.isArray(values[0].zones) && values[0].zones.length) state.zones = values[0].zones;
      if (Array.isArray(values[1].alerts)) state.alerts = values[1].alerts;
      if (values[2]) {
        if (policyIsUsable(values[2].policy)) savePolicy(values[2].policy);
        else {
          state.policy = null;
          try { localStorage.removeItem(POLICY_CACHE_KEY); } catch (error) {}
        }
      }
      state.alertSignature = alertsSignature(state.alerts);
      if (!state.zones.some(function (item) { return item.id === state.zoneId; })) state.zoneId = state.zones[0].id;
      state.cachedAt = new Date().toLocaleString(lang() === "en" ? "en-GB" : "es-ES", {dateStyle: "short", timeStyle: "short"});
    } catch (error) { state.error = true; }
    state.loading = false; saveState(); render(); maybePrompt(DEMO_ES_ALERT);
  }
  async function pollForESAlert() {
    if (document.hidden) return;
    try {
      var data = await jsonRequest("/api/public/alerts?scope=all");
      if (!Array.isArray(data.alerts)) return;
      var signature = alertsSignature(data.alerts);
      if (!signature || signature === state.alertSignature) return;
      state.alerts = data.alerts;
      state.alertSignature = signature;
      render();
      maybePrompt(false);
    } catch (error) {}
  }

  function render() {
    applyPreferences();
    var localItems = localAlerts();
    var primary = localItems[0];
    var alert = primary && primary.alert;
    var level = primary ? primary.severity : "unknown";
    var number = emergencyNumber();
    var other = state.alerts.filter(function (item) { return !alert || item.id !== alert.id; });
    var time = alert && alert.issuedAt ? new Date(alert.issuedAt).toLocaleTimeString(lang() === "en" ? "en-GB" : "es-ES", {hour: "2-digit", minute: "2-digit"}) : "";
    mount.innerHTML =
      '<div class="vc-v2-zonebar"><label>' + esc(tr("zone")) + '<select id="vc-v2-zone">' + state.zones.map(function (item) {
        return '<option value="' + esc(item.id) + '"' + (item.id === state.zoneId ? ' selected' : '') + '>' + esc(zoneName(item)) + '</option>';
      }).join("") + '</select></label><div class="vc-v2-utility"><button class="vc-v2-icon-button" id="vc-v2-locate" type="button" aria-label="' + esc(tr("locate")) + '" title="' + esc(tr("locate")) + '"><i data-lucide="locate-fixed" aria-hidden="true"></i></button><button class="vc-v2-settings-button" id="vc-v2-settings" type="button"><i data-lucide="settings" aria-hidden="true"></i><span>' + esc(tr("settings")) + '</span></button></div></div>' +
      '<article class="vc-v2-alert" data-severity="' + level + '" aria-labelledby="vc-v2-title"><div class="vc-v2-alert-head"><span class="vc-v2-level"><i data-lucide="' + severityIcons[level] + '" aria-hidden="true"></i>' + esc(severityLabel(level)) + '</span>' + (time ? '<time datetime="' + esc(alert.issuedAt) + '">' + esc(time) + '</time>' : '') + '</div>' +
      '<h2 id="vc-v2-title">' + esc(alert ? local(alert.title) : tr("noAlert")) + '</h2><p>' + esc(alert ? local(alert.summary) : tr("noAlertCopy")) + '</p>' +
      '<div class="vc-v2-action"><i data-lucide="route" aria-hidden="true"></i><div><strong>' + esc(tr("action")) + '</strong><span>' + esc(alert ? local(alert.recommendedAction) : tr("noAlertAction")) + '</span></div></div>' +
      '<div class="vc-v2-actions"><button id="vc-v2-listen" type="button"><i data-lucide="' + (state.speaking ? "square" : "volume-2") + '" aria-hidden="true"></i> ' + esc(state.speaking ? tr("stop") : tr("listen")) + '</button><button class="is-primary" id="vc-v2-respond" type="button"' + (alert ? '' : ' disabled') + '><i data-lucide="circle-check-big" aria-hidden="true"></i> ' + esc(tr("respond")) + '</button></div>' +
      '<a class="vc-v2-112" href="tel:' + esc(number) + '" aria-label="' + esc(emergencyText("callLabel")) + '"><i data-lucide="phone-call" aria-hidden="true"></i>' + esc(emergencyText("call")) + '</a></article>' +
      '<section class="vc-v2-evidence" aria-labelledby="vc-v2-evidence-title"><div class="vc-v2-evidence-head"><span class="vc-v2-evidence-icon" aria-hidden="true"><i data-lucide="scan-search"></i></span><div><h2 id="vc-v2-evidence-title">' + esc(tr("evidenceTitle")) + '</h2><p>' + esc(tr("evidenceHint")) + '</p></div></div><div class="vc-v2-evidence-grid">' +
      mediaAction("image", "camera", tr("photo"), !alert) + mediaAction("audio", "mic", tr("audio"), !alert) + mediaAction("video", "video", tr("video"), !alert) + '</div></section>' +
      '<div class="vc-v2-receipt is-' + esc(state.receiptStatus || "confirmed") + '" id="vc-v2-receipt" role="status" aria-live="polite"' + (state.receipt ? '' : ' hidden') + '><i data-lucide="' + (state.receiptStatus === "pending" ? "clock-3" : "badge-check") + '" aria-hidden="true"></i><span>' + esc(state.receipt) + '</span></div>' +
      '<details class="vc-v2-secondary"><summary>' + esc(tr("other")) + '</summary><div class="vc-v2-alert-list">' + (other.length ? other.map(renderMiniAlert).join("") : '<p class="vc-v2-status">' + esc(tr("noAlert")) + '</p>') + '</div></details>' +
      '<section class="vc-v2-access" aria-labelledby="vc-v2-access-title"><a class="vc-v2-qr" href="' + esc(CITIZEN_PUBLIC_URL) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(tr("qrLink")) + '"><img src="/assets/qr-ciudadano.svg" width="176" height="176" alt="' + esc(tr("qrAlt")) + '"></a><div class="vc-v2-access-copy"><span class="vc-v2-access-eyebrow"><i data-lucide="qr-code" aria-hidden="true"></i>' + esc(tr("qrEyebrow")) + '</span><h2 id="vc-v2-access-title">' + esc(tr("qrTitle")) + '</h2><p>' + esc(tr("qrCopy")) + '</p><a class="vc-v2-access-link" href="' + esc(CITIZEN_PUBLIC_URL) + '" target="_blank" rel="noopener noreferrer">' + esc(CITIZEN_PUBLIC_URL) + '<span class="vc-v2-visually-hidden"> · ' + esc(tr("qrLink")) + '</span></a></div></section>' +
      '<p class="vc-v2-status" role="status">' + esc(state.loading ? tr("loading") : state.error ? tr("loadError") : (tr("source") + ': ' + (alert ? alert.source : "VT-01") + (alert ? ' · ' + tr("updated") + ' ' + time : ''))) + '</p>';
    bindShell(alert);
    if (window.lucide) window.lucide.createIcons({attrs: {width: 20, height: 20}});
    syncVisibility();
  }
  function mediaAction(kind, icon, label, disabled) {
    return '<button class="vc-v2-evidence-button" type="button" data-media-action="' + kind + '"' + (disabled ? ' disabled' : '') + '><i data-lucide="' + icon + '" aria-hidden="true"></i><span>' + esc(label) + '</span></button>';
  }
  function updateShellReceipt() {
    var node = document.getElementById("vc-v2-receipt");
    if (!node) return;
    node.hidden = !state.receipt;
    node.classList.toggle("is-pending", state.receiptStatus === "pending");
    node.classList.toggle("is-confirmed", state.receiptStatus === "confirmed");
    var copyNode = node.querySelector("span"); if (copyNode) copyNode.textContent = state.receipt;
    var icon = node.querySelector("svg, i");
    if (icon) icon.outerHTML = '<i data-lucide="' + (state.receiptStatus === "pending" ? "clock-3" : "badge-check") + '" aria-hidden="true"></i>';
    if (window.lucide) window.lucide.createIcons({attrs: {width: 20, height: 20}});
  }
  function renderMiniAlert(alert) {
    var targets = alert.zones || [];
    var target = targets.slice().sort(function (a, b) { return severityRank[b.severity] - severityRank[a.severity]; })[0];
    var level = target ? target.severity : "unknown";
    var targetZone = target && state.zones.filter(function (item) { return item.id === target.zoneId; })[0];
    return '<article class="vc-v2-alert-mini" style="--mini-color:' + severityColors[level] + '"><strong>' + esc(severityLabel(level) + ' · ' + local(alert.title)) + '</strong><span>' + esc(targetZone ? zoneName(targetZone) : tr("other")) + '</span></article>';
  }
  function bindShell(alert) {
    document.getElementById("vc-v2-zone").addEventListener("change", function (event) { state.zoneId = event.target.value; state.source = "manual"; state.position = null; state.receipt = ""; state.receiptStatus = ""; state.lastAnswers = null; saveState(); render(); maybePrompt(); });
    document.getElementById("vc-v2-locate").addEventListener("click", locateZone);
    document.getElementById("vc-v2-settings").addEventListener("click", openSettings);
    document.getElementById("vc-v2-listen").addEventListener("click", function () {
      if (state.speaking) stopSpeech(); else speak(alert ? alertSpeech(alert) : tr("noAlertCopy"));
    });
    document.getElementById("vc-v2-respond").addEventListener("click", function () { if (alert) openQuick(alert, true, ""); });
    mount.querySelectorAll("[data-media-action]").forEach(function (button) {
      button.addEventListener("click", function () { requestMedia(button.getAttribute("data-media-action"), alert); });
    });
  }
  function syncVisibility() {
    root.classList.add("vc-v2-active");
    mount.hidden = false;
    screen.hidden = true;
    screen.setAttribute("aria-hidden", "true");
  }
  function locateZone() {
    if (!navigator.geolocation) { announce(tr("locationDenied")); return; }
    navigator.geolocation.getCurrentPosition(function (position) {
      var lat = position.coords.latitude, lon = position.coords.longitude;
      state.position = {latitude: lat, longitude: lon, accuracy: Number(position.coords.accuracy) || null};
      var nearest = state.zones.slice().sort(function (a, b) {
        function distance(item) { var dy = Number(item.centroid.latitude) - lat, dx = Number(item.centroid.longitude) - lon; return dy * dy + dx * dx; }
        return distance(a) - distance(b);
      })[0];
      if (nearest) { state.zoneId = nearest.id; state.source = "gps"; state.receipt = ""; state.receiptStatus = ""; state.lastAnswers = null; saveState(); render(); maybePrompt(); announce(zoneName(nearest)); }
    }, function () { announce(tr("locationDenied")); }, {enableHighAccuracy: false, timeout: 8000, maximumAge: 300000});
  }
  function announce(message) {
    var live = document.getElementById("vc-live");
    if (live) { live.textContent = ""; window.setTimeout(function () { live.textContent = message; }, 20); }
  }
  function alertSpeech(alert) { return local(alert.title) + ". " + local(alert.summary) + ". " + tr("action") + ": " + local(alert.recommendedAction); }
  function speak(message) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { announce(message); return; }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = lang() === "val" ? "ca-ES" : lang() === "en" ? "en-GB" : "es-ES";
    utterance.rate = 0.95;
    utterance.onend = utterance.onerror = function () { state.speaking = false; render(); };
    state.speaking = true; render(); window.speechSynthesis.speak(utterance);
  }
  function stopSpeech() { if (window.speechSynthesis) window.speechSynthesis.cancel(); state.speaking = false; render(); }

  function buildQuickDialog() {
    var dialog = document.createElement("dialog");
    dialog.className = "vc-v2-dialog";
    dialog.id = "vc-v2-quick-dialog";
    dialog.setAttribute("aria-labelledby", "vc-v2-quick-title");
    dialog.innerHTML = '<div class="vc-v2-dialog-inner"><div class="vc-v2-dialog-head"><div><h2 id="vc-v2-quick-title"></h2><p class="vc-v2-progress" id="vc-v2-progress"></p></div><button class="vc-v2-dialog-close" type="button" id="vc-v2-quick-close" aria-label="Cerrar">✕</button></div><div id="vc-v2-question-stage"><p class="vc-v2-question" id="vc-v2-question" aria-live="assertive" aria-atomic="true"></p><div class="vc-v2-voice-state" id="vc-v2-voice-state" role="status" aria-live="polite" aria-atomic="true"><i data-lucide="audio-lines" aria-hidden="true"></i><span id="vc-v2-voice-copy"></span></div><div class="vc-v2-answer-grid"><button type="button" id="vc-v2-yes"></button><button type="button" id="vc-v2-no"></button></div><div class="vc-v2-dialog-actions"><button type="button" id="vc-v2-read-question"></button><button type="button" id="vc-v2-voice-answer" aria-pressed="false"></button><button type="button" id="vc-v2-stop-assistant" hidden></button><button type="button" id="vc-v2-later"></button></div></div><section class="vc-v2-quick-result" id="vc-v2-quick-result" hidden></section><p class="vc-v2-dialog-status" id="vc-v2-quick-status" role="status" aria-live="polite" aria-atomic="true"></p></div>';
    dialog.querySelector("#vc-v2-quick-title").textContent = tr("qTitle");
    dialog.querySelector("#vc-v2-quick-close").setAttribute("aria-label", tr("close"));
    dialog.querySelector("#vc-v2-yes").textContent = tr("yes");
    dialog.querySelector("#vc-v2-no").textContent = tr("no");
    dialog.querySelector("#vc-v2-read-question").textContent = tr("readQuestion");
    dialog.querySelector("#vc-v2-voice-answer").textContent = tr("voiceStart");
    dialog.querySelector("#vc-v2-stop-assistant").textContent = tr("stop");
    dialog.querySelector("#vc-v2-later").textContent = tr("later");
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener("close", invalidateQuickFlow);
    return dialog;
  }
  function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
  function closeDialog(dialog) {
    if (dialog === quickDialog) invalidateQuickFlow();
    stopDialogSpeech();
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
  }
  function clearQuickTimer() {
    if (quickTimer !== null) { window.clearTimeout(quickTimer); quickTimer = null; }
  }
  function invalidateQuickFlow() {
    quickFlowToken += 1;
    lastAutoSpokenKey = "";
    clearQuickTimer();
    stopDialogSpeech();
  }
  function scheduleQuick(callback, delay, quick, step, flowToken) {
    clearQuickTimer();
    quickTimer = window.setTimeout(function () {
      quickTimer = null;
      if (flowToken !== quickFlowToken || state.quick !== quick || !quickDialog.open || quick.stage !== "questions" || quick.step !== step) return;
      callback();
    }, delay);
  }
  function stopDialogSpeech() {
    voiceToken += 1;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (voiceRecognition) { try { voiceRecognition.abort(); } catch (error) {} voiceRecognition = null; }
  }
  function questions() {
    if (state.policy && Array.isArray(state.policy.questions) && state.policy.questions.length === 3) {
      return state.policy.questions.map(function (item) { return {field: item.id, text: local(item.text)}; });
    }
    return [{field: "danger", text: tr("qDanger")}, {field: "knowsAction", text: tr("qKnowsAction")}, {field: "needsHelp", text: tr("qHelp")}];
  }
  function openQuick(alert, userInitiated, pendingMediaKind) {
    invalidateQuickFlow();
    quickFlowToken += 1;
    state.pendingMediaKind = pendingMediaKind || "";
    state.quick = {alert: alert, step: 0, answers: {}, sending: false, delivery: "idle", stage: "questions", answerLocked: false, decision: null, incident: null, flowToken: quickFlowToken};
    markPrompted(alert);
    renderQuick(); openDialog(quickDialog); document.getElementById("vc-v2-yes").focus();
    var quick = state.quick, step = quick.step, flowToken = quick.flowToken;
    if (state.narration) scheduleQuick(function () { speakCurrentQuestion(true, false); }, userInitiated ? 0 : 80, quick, step, flowToken);
  }
  function renderQuick() {
    if (!state.quick) return;
    if (state.quick.stage === "result") { renderQuickResult(); return; }
    var list = questions(), item = list[state.quick.step];
    document.getElementById("vc-v2-question-stage").hidden = false;
    document.getElementById("vc-v2-quick-result").hidden = true;
    document.getElementById("vc-v2-quick-title").textContent = tr("qTitle");
    document.getElementById("vc-v2-quick-close").setAttribute("aria-label", tr("close"));
    document.getElementById("vc-v2-progress").textContent = tr("question") + " " + (state.quick.step + 1) + " / " + list.length;
    document.getElementById("vc-v2-question").textContent = item.text;
    document.getElementById("vc-v2-yes").textContent = tr("yes"); document.getElementById("vc-v2-no").textContent = tr("no");
    document.getElementById("vc-v2-yes").disabled = state.quick.answerLocked; document.getElementById("vc-v2-no").disabled = state.quick.answerLocked;
    document.getElementById("vc-v2-read-question").textContent = tr("readQuestion"); document.getElementById("vc-v2-voice-answer").textContent = tr("voiceStart"); document.getElementById("vc-v2-stop-assistant").textContent = tr("stop"); document.getElementById("vc-v2-later").textContent = tr("later");
    document.getElementById("vc-v2-voice-copy").textContent = SpeechRecognitionConstructor ? tr("voiceAlternative") : tr("voiceUnavailable");
    document.getElementById("vc-v2-voice-answer").hidden = !SpeechRecognitionConstructor;
    document.getElementById("vc-v2-voice-answer").setAttribute("aria-pressed", "false");
    document.getElementById("vc-v2-stop-assistant").hidden = true;
    document.getElementById("vc-v2-quick-status").textContent = "";
    if (window.lucide) window.lucide.createIcons({attrs: {width: 20, height: 20}});
  }
  function answerQuick(value, source) {
    if (!state.quick || state.quick.sending || state.quick.answerLocked || state.quick.stage !== "questions") return;
    stopDialogSpeech(); state.quick.answerLocked = true;
    var quick = state.quick, item = questions()[quick.step]; quick.answers[item.field] = value;
    quick.step += 1;
    if (state.quick.step >= questions().length) submitQuick();
    else {
      renderQuick();
      var step = quick.step, flowToken = quick.flowToken;
      scheduleQuick(function () {
        quick.answerLocked = false; renderQuick(); document.getElementById("vc-v2-yes").focus();
        if (state.narration) speakCurrentQuestion(true, false);
      }, source === "voice" ? 180 : 80, quick, step, flowToken);
    }
  }
  async function submitQuick() {
    var quick = state.quick; if (!quick) return; quick.sending = true; quick.answerLocked = true;
    clearQuickTimer();
    quick.decision = evaluatePolicy(quick.answers); quick.delivery = "sending"; quick.stage = "result"; renderQuickResult();
    var payload = {
      clientRequestId: uid("checkin"), alertId: quick.alert.id, alertVersion: quick.alert.version, zoneId: state.zoneId,
      policyVersion: quick.decision.policyVersion, zone: state.zoneId, applicable: true, received: true,
      danger: quick.answers.danger, knowsAction: quick.answers.knowsAction,
      needsHelp: quick.answers.needsHelp, reasons: [], people: 1, precision: state.position ? "exact" : "zone",
      latitude: state.position && state.position.latitude, longitude: state.position && state.position.longitude,
      accuracyM: state.position && state.position.accuracy
    };
    state.lastAnswers = {
      alertId: quick.alert.id, alertVersion: quick.alert.version, zoneId: state.zoneId,
      danger: quick.answers.danger, knowsAction: quick.answers.knowsAction, needsHelp: quick.answers.needsHelp
    };
    try {
      var result = await jsonRequest("/api/public/checkins", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
      quick.decision = result.escalation || quick.decision;
      quick.incident = rememberIncident(result.incident, quick.alert);
      state.receipt = quick.incident ? tr("caseSent") + " · " + quick.incident.id : tr("answerSent") + " · " + result.response.id;
      state.receiptStatus = "confirmed";
      quick.delivery = "confirmed";
      clearOutbox();
    } catch (error) {
      saveOutbox(payload); state.receipt = quick.decision.createIncident ? tr("caseQueued") : tr("answerQueued");
      state.receiptStatus = "pending";
      quick.delivery = "pending";
    }
    var nextMedia = state.pendingMediaKind;
    state.pendingMediaKind = "";
    quick.sending = false; saveState(); markResponded(quick.alert); updateShellReceipt();
    var flowActive = state.quick === quick && quick.flowToken === quickFlowToken && quickDialog.open;
    if (!flowActive) return;
    updateQuickResultState();
    announce((quick.decision.offerEmergencyCall ? emergencyText("help112", quick.decision) + " " : "") + state.receipt);
    if (nextMedia && !quick.decision.offerEmergencyCall) {
      var alert = quick.alert;
      quickTimer = window.setTimeout(function () {
        quickTimer = null;
        if (state.quick !== quick || quick.flowToken !== quickFlowToken || !quickDialog.open) return;
        closeDialog(quickDialog); openMedia(nextMedia, alert);
      }, 120);
    }
  }
  document.getElementById("vc-v2-yes").addEventListener("click", function () { answerQuick(true, "tap"); });
  document.getElementById("vc-v2-no").addEventListener("click", function () { answerQuick(false, "tap"); });
  document.getElementById("vc-v2-quick-close").addEventListener("click", function () { state.pendingMediaKind = ""; closeDialog(quickDialog); });
  document.getElementById("vc-v2-later").addEventListener("click", function () { state.pendingMediaKind = ""; closeDialog(quickDialog); });
  document.getElementById("vc-v2-read-question").addEventListener("click", function () { speakCurrentQuestion(true, true); });
  document.getElementById("vc-v2-voice-answer").addEventListener("click", function () {
    if (voiceRecognition) { stopDialogSpeech(); setVoiceStatus(tr("voiceAlternative"), false); }
    else startVoiceRecognition(true);
  });
  document.getElementById("vc-v2-stop-assistant").addEventListener("click", function () {
    stopDialogSpeech(); this.hidden = true; setVoiceStatus(tr("voiceAlternative"), false);
  });

  function assistantLanguage() { return lang() === "val" ? "ca-ES" : lang() === "en" ? "en-GB" : "es-ES"; }
  function setVoiceStatus(message, active) {
    var copyNode = document.getElementById("vc-v2-voice-copy"), stateNode = document.getElementById("vc-v2-voice-state"), button = document.getElementById("vc-v2-voice-answer");
    if (copyNode) copyNode.textContent = message;
    if (stateNode) stateNode.classList.toggle("is-active", !!active);
    if (button) {
      button.textContent = voiceRecognition ? tr("voiceStop") : tr("voiceStart");
      button.setAttribute("aria-pressed", String(!!voiceRecognition));
    }
  }
  function speakCurrentQuestion(autoListen, manual) {
    if (!state.quick || state.quick.stage !== "questions") return;
    var quick = state.quick, step = quick.step, flowToken = quick.flowToken;
    if (flowToken !== quickFlowToken || !quickDialog.open) return;
    var spokenKey = flowToken + ":" + step;
    if (!manual && lastAutoSpokenKey === spokenKey) return;
    if (manual) clearQuickTimer();
    lastAutoSpokenKey = spokenKey;
    stopDialogSpeech();
    var token = voiceToken, item = questions()[step];
    var message = (step === 0 ? alertSpeech(quick.alert) + ". " : "") + item.text;
    var voiceConfig = state.policy && state.policy.voice || {};
    var maySpeak = !!manual || (state.narration && voiceConfig.autoSpeak !== false);
    var mayAutoListen = !!autoListen && voiceConfig.autoListen !== false && (!!manual || state.narration);
    if (!maySpeak || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      announce(item.text); if (mayAutoListen) startVoiceRecognition(false); return;
    }
    var utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = assistantLanguage(); utterance.rate = 0.92;
    utterance.onstart = function () {
      if (token !== voiceToken || flowToken !== quickFlowToken || state.quick !== quick || quick.step !== step || !quickDialog.open) return;
      setVoiceStatus(tr("voiceSpeaking"), true); document.getElementById("vc-v2-stop-assistant").hidden = false;
    };
    utterance.onend = function () {
      if (token !== voiceToken || flowToken !== quickFlowToken || state.quick !== quick || quick.step !== step || !quickDialog.open) return;
      document.getElementById("vc-v2-stop-assistant").hidden = true; setVoiceStatus(tr("voiceAlternative"), false);
      if (mayAutoListen) startVoiceRecognition(false);
    };
    utterance.onerror = function () {
      if (token !== voiceToken || flowToken !== quickFlowToken || state.quick !== quick || quick.step !== step || !quickDialog.open) return;
      document.getElementById("vc-v2-stop-assistant").hidden = true; setVoiceStatus(tr("voiceAlternative"), false);
    };
    window.speechSynthesis.speak(utterance);
  }
  function normaliseVoice(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").trim(); }
  function voiceAnswer(value) {
    var words = normaliseVoice(value).split(/\s+/).filter(Boolean);
    var yesWords = ["si", "yes", "afirmativo", "afirmativa", "correcto", "correcta", "confirmo", "yeah"];
    var noWords = ["no", "negativo", "negativa"];
    var yes = words.some(function (word) { return yesWords.indexOf(word) >= 0; });
    var no = words.some(function (word) { return noWords.indexOf(word) >= 0; });
    return yes === no ? null : yes;
  }
  function startVoiceRecognition(manual) {
    if (!state.quick || state.quick.stage !== "questions") return;
    if (!SpeechRecognitionConstructor) { setVoiceStatus(tr("voiceUnavailable"), false); return; }
    if (manual) { clearQuickTimer(); lastAutoSpokenKey = state.quick.flowToken + ":" + state.quick.step; }
    stopDialogSpeech();
    var token = voiceToken, recognition = new SpeechRecognitionConstructor();
    voiceRecognition = recognition; recognition.lang = assistantLanguage(); recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 3;
    recognition.onstart = function () { if (token === voiceToken) setVoiceStatus(tr("voiceListening"), true); };
    recognition.onresult = function (event) {
      if (token !== voiceToken || !event.results || !event.results[0]) return;
      var answer = null;
      for (var index = 0; index < event.results[0].length && answer === null; index += 1) answer = voiceAnswer(event.results[0][index].transcript);
      if (answer === null) { voiceRecognition = null; setVoiceStatus(tr("voiceUnclear"), false); return; }
      voiceRecognition = null; answerQuick(answer, "voice");
    };
    recognition.onerror = function (event) {
      if (token !== voiceToken || event.error === "aborted") return;
      voiceRecognition = null; setVoiceStatus(event.error === "not-allowed" || event.error === "service-not-allowed" ? tr("voiceDenied") : tr("voiceUnclear"), false);
    };
    recognition.onend = function () { if (voiceRecognition === recognition) { voiceRecognition = null; setVoiceStatus(manual ? tr("voiceUnclear") : tr("voiceAlternative"), false); } };
    try { recognition.start(); } catch (error) { voiceRecognition = null; setVoiceStatus(tr("voiceDenied"), false); }
  }
  function renderQuickResult() {
    var quick = state.quick; if (!quick) return;
    var result = document.getElementById("vc-v2-quick-result");
    document.getElementById("vc-v2-question-stage").hidden = true; result.hidden = false;
    result.innerHTML = '<div class="vc-v2-urgent" id="vc-v2-urgent-result" role="alert" hidden><i data-lucide="siren" aria-hidden="true"></i><p id="vc-v2-urgent-copy"></p><a class="vc-v2-call-now" id="vc-v2-call-now"><i data-lucide="phone-call" aria-hidden="true"></i><span></span></a><small id="vc-v2-call-hint"></small></div><p class="vc-v2-result-copy" id="vc-v2-result-copy"></p><div class="vc-v2-result-evidence"><button type="button" data-result-media="image"><i data-lucide="camera" aria-hidden="true"></i>' + esc(tr("photo")) + '</button><button type="button" data-result-media="audio"><i data-lucide="mic" aria-hidden="true"></i>' + esc(tr("audio")) + '</button><button type="button" data-result-media="video"><i data-lucide="video" aria-hidden="true"></i>' + esc(tr("video")) + '</button></div><button class="vc-v2-finish" id="vc-v2-finish" type="button">' + esc(tr("skipEvidence")) + '</button>';
    result.querySelectorAll("[data-result-media]").forEach(function (button) {
      button.addEventListener("click", function () { var kind = button.getAttribute("data-result-media"), alert = quick.alert; closeDialog(quickDialog); openMedia(kind, alert); });
    });
    document.getElementById("vc-v2-finish").addEventListener("click", function () { closeDialog(quickDialog); });
    updateQuickResultState();
    if (window.lucide) window.lucide.createIcons({attrs: {width: 22, height: 22}});
  }
  function updateQuickResultState() {
    var quick = state.quick, result = document.getElementById("vc-v2-quick-result");
    if (!quick || !result || quick.stage !== "result") return;
    var decision = quick.decision || evaluatePolicy(quick.answers), urgent = !!decision.offerEmergencyCall;
    var deliveryCopy = quick.delivery === "sending" ? tr("sendingCopy") : quick.delivery === "pending" ? tr("pendingCopy") : urgent ? emergencyText("urgentCopy", decision) : tr("optionalCopy");
    result.setAttribute("data-delivery", quick.delivery || "sending");
    document.getElementById("vc-v2-quick-title").textContent = quick.delivery === "sending" ? tr("sendingTitle") : quick.delivery === "pending" ? tr("pendingTitle") : urgent ? tr("urgentTitle") : tr("optionalTitle");
    document.getElementById("vc-v2-progress").textContent = decision.priority && decision.priority !== "pending" ? tr(decision.priority) : "";
    var urgentBox = document.getElementById("vc-v2-urgent-result"), normalCopy = document.getElementById("vc-v2-result-copy");
    if (urgentBox) urgentBox.hidden = !urgent;
    if (normalCopy) { normalCopy.hidden = urgent; normalCopy.textContent = deliveryCopy; }
    var urgentCopy = document.getElementById("vc-v2-urgent-copy"), call = document.getElementById("vc-v2-call-now"), callHint = document.getElementById("vc-v2-call-hint");
    if (urgentCopy) urgentCopy.textContent = deliveryCopy;
    if (call) {
      call.href = "tel:" + emergencyNumber(decision);
      call.querySelector("span").textContent = emergencyText("callNow", decision);
      call.setAttribute("aria-label", emergencyText("callNow", decision));
    }
    if (callHint) callHint.textContent = tr("callHint");
    result.querySelectorAll("[data-result-media]").forEach(function (button) { button.disabled = quick.sending; });
    var finish = document.getElementById("vc-v2-finish"); if (finish) finish.disabled = quick.sending;
    document.getElementById("vc-v2-quick-status").textContent = quick.delivery === "sending" ? tr("answerSending") : state.receipt;
  }

  function responseKey(alert) { return alert.id + ":" + alert.version + ":" + alert.issuedAt + ":" + state.zoneId; }
  function markPrompted(alert) { try { localStorage.setItem("vt01-prompted-" + responseKey(alert), "1"); } catch (error) {} }
  function markResponded(alert) { try { localStorage.setItem("vt01-responded-" + responseKey(alert), "1"); } catch (error) {} }
  function maybePrompt(forceDemo) {
    var primary = localAlerts()[0];
    if (!primary) return;
    if (forceDemo && state.demoPrompted) return;
    if (!forceDemo) {
      try { if (localStorage.getItem("vt01-prompted-" + responseKey(primary.alert)) || localStorage.getItem("vt01-responded-" + responseKey(primary.alert))) return; } catch (error) {}
    }
    if (quickDialog.open) return;
    if (settingsDialog.open) closeDialog(settingsDialog);
    if (mediaDialog.open) closeDialog(mediaDialog);
    state.demoPrompted = state.demoPrompted || !!forceDemo;
    openQuick(primary.alert, false, "");
  }
  function answersFor(alert) { return state.lastAnswers && state.lastAnswers.alertId === alert.id && String(state.lastAnswers.alertVersion) === String(alert.version) && state.lastAnswers.zoneId === state.zoneId ? state.lastAnswers : null; }
  function saveOutbox(payload) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(payload)); } catch (error) {} }
  function clearOutbox() { try { localStorage.removeItem(OUTBOX_KEY); } catch (error) {} }
  async function retryOutbox() {
    var payload; try { payload = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "null"); } catch (error) { return; }
    if (!payload) return;
    try {
      var result = await jsonRequest("/api/public/checkins", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
      var alert = state.alerts.filter(function (item) { return item.id === payload.alertId; })[0] || localAlerts()[0] && localAlerts()[0].alert;
      var current = rememberIncident(result.incident, alert);
      clearOutbox(); state.receipt = current ? tr("caseSent") + " · " + current.id : tr("answerSent") + " · " + result.response.id; state.receiptStatus = "confirmed"; saveState(); render();
    } catch (error) {}
  }

  function readCase() { try { return JSON.parse(sessionStorage.getItem(SESSION_CASE_KEY) || "null"); } catch (error) { return null; } }
  function rememberIncident(incident, alert) {
    if (!incident || !incident.id || !incident.accessToken || !alert) return null;
    var current = {id: incident.id, token: incident.accessToken, source: "v2-alert", alertId: alert.id, alertVersion: alert.version, zoneId: state.zoneId, clientRequestId: incident.clientRequestId};
    sessionStorage.setItem(SESSION_CASE_KEY, JSON.stringify(current));
    return current;
  }
  function matchingCase(alert) {
    var current = readCase();
    if (!current || !current.id || !current.token || current.source !== "v2-alert") return null;
    return current.alertId === alert.id && String(current.alertVersion) === String(alert.version) && current.zoneId === state.zoneId ? current : null;
  }
  function incidentType(alert) {
    if (alert.type === "flood" || alert.type === "dana") return "dana";
    if (alert.type === "rain") return "rain";
    if (alert.type === "fire") return "fire";
    return "other";
  }
  function buildCasePayload(alert, answers, clientRequestId) {
    var selectedZone = zone();
    return {
      clientRequestId: clientRequestId || uid("alert-case"), type: incidentType(alert), note: "",
      zone: selectedZone ? selectedZone.code : state.zoneId,
      latitude: state.position && state.position.latitude, longitude: state.position && state.position.longitude, accuracyM: state.position && state.position.accuracy, people: 1,
      need: answers && answers.needsHelp ? "Asistencia tras alerta" : "Evidencia vinculada a alerta",
      citizenState: answers && answers.needsHelp ? "help" : "safe", silent: false,
      triageAnswers: answers ? {danger: answers.danger, knowsAction: answers.knowsAction, needsHelp: answers.needsHelp} : null,
      automaticTriage: false
    };
  }
  function readCaseOutbox() { try { return JSON.parse(localStorage.getItem(CASE_OUTBOX_KEY) || "null"); } catch (error) { return null; } }
  function saveCaseOutbox(value) { try { localStorage.setItem(CASE_OUTBOX_KEY, JSON.stringify(value)); } catch (error) {} }
  function clearCaseOutbox() { try { localStorage.removeItem(CASE_OUTBOX_KEY); } catch (error) {} }
  async function ensureAlertCase(alert, answers) {
    var existing = matchingCase(alert);
    if (existing) return existing;
    var pending = readCaseOutbox();
    if (!pending || pending.alertId !== alert.id || String(pending.alertVersion) !== String(alert.version) || pending.zoneId !== state.zoneId) {
      pending = {alertId: alert.id, alertVersion: alert.version, zoneId: state.zoneId, payload: buildCasePayload(alert, answers)};
      saveCaseOutbox(pending);
    }
    var result = await jsonRequest("/api/public/incidents", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.payload)});
    var current = {id: result.incident.id, token: result.incident.accessToken, source: "v2-alert", alertId: alert.id, alertVersion: alert.version, zoneId: state.zoneId, clientRequestId: pending.payload.clientRequestId};
    sessionStorage.setItem(SESSION_CASE_KEY, JSON.stringify(current));
    clearCaseOutbox();
    return current;
  }
  async function retryCaseOutbox() {
    var pending = readCaseOutbox();
    if (!pending || !pending.payload) return;
    try {
      var result = await jsonRequest("/api/public/incidents", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.payload)});
      var current = {id: result.incident.id, token: result.incident.accessToken, source: "v2-alert", alertId: pending.alertId, alertVersion: pending.alertVersion, zoneId: pending.zoneId, clientRequestId: pending.payload.clientRequestId};
      sessionStorage.setItem(SESSION_CASE_KEY, JSON.stringify(current));
      clearCaseOutbox(); state.receipt = tr("caseSent") + " · " + current.id; state.receiptStatus = "confirmed"; saveState(); render();
    } catch (error) {}
  }
  function requestMedia(kind, alert) {
    if (!alert) return;
    if (!answersFor(alert) && !matchingCase(alert)) { openQuick(alert, true, kind); return; }
    openMedia(kind, alert);
  }

  function buildMediaDialog() {
    var dialog = document.createElement("dialog");
    dialog.className = "vc-v2-dialog"; dialog.id = "vc-v2-media-dialog"; dialog.setAttribute("aria-labelledby", "vc-v2-media-title");
    dialog.innerHTML = '<div class="vc-v2-dialog-inner"><div class="vc-v2-dialog-head"><div><h2 id="vc-v2-media-title"></h2><p id="vc-v2-media-intro"></p></div><button class="vc-v2-dialog-close" id="vc-v2-media-close" type="button" aria-label="Cerrar">✕</button></div><div class="vc-v2-media-grid"><label data-media-input="image"><span id="vc-v2-photo-label"></span><input type="file" id="vc-v2-photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment"></label><label data-media-input="audio"><span id="vc-v2-audio-label"></span><input type="file" id="vc-v2-audio" accept="audio/*" capture></label><label data-media-input="video"><span id="vc-v2-video-label"></span><input type="file" id="vc-v2-video" accept="video/webm,video/mp4,video/quicktime" capture="environment"></label><div id="vc-v2-preview"></div><label class="vc-v2-consent"><input type="checkbox" id="vc-v2-media-consent"><span id="vc-v2-consent-copy"></span></label><button class="vc-v2-upload" id="vc-v2-upload" type="button" aria-label="Enviar archivo" disabled>Enviar archivo</button></div><p class="vc-v2-dialog-status" id="vc-v2-media-status" role="status" aria-live="polite"></p></div>';
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDialog(dialog); });
    return dialog;
  }
  function openMedia(kind, alert) {
    state.mediaKind = kind; state.mediaAlert = alert;
    state.selectedFile = null;
    ["vc-v2-photo", "vc-v2-audio", "vc-v2-video"].forEach(function (id) { document.getElementById(id).value = ""; });
    document.getElementById("vc-v2-media-consent").checked = false; document.getElementById("vc-v2-upload").disabled = true; document.getElementById("vc-v2-preview").innerHTML = "";
    document.getElementById("vc-v2-media-title").textContent = tr("mediaTitle") + " · " + tr(kind === "image" ? "photo" : kind); document.getElementById("vc-v2-media-intro").textContent = tr("mediaIntro");
    document.getElementById("vc-v2-media-close").setAttribute("aria-label", tr("close"));
    document.getElementById("vc-v2-photo-label").textContent = tr("photo"); document.getElementById("vc-v2-audio-label").textContent = tr("audio"); document.getElementById("vc-v2-video-label").textContent = tr("video");
    document.getElementById("vc-v2-consent-copy").textContent = tr("consent"); document.getElementById("vc-v2-upload").textContent = tr("upload"); document.getElementById("vc-v2-upload").setAttribute("aria-label", tr("upload"));
    mediaDialog.querySelectorAll("[data-media-input]").forEach(function (label) { label.hidden = label.getAttribute("data-media-input") !== kind; });
    document.getElementById("vc-v2-media-status").textContent = ""; openDialog(mediaDialog);
    var input = document.getElementById(kind === "image" ? "vc-v2-photo" : kind === "audio" ? "vc-v2-audio" : "vc-v2-video");
    window.setTimeout(function () { input.focus(); }, 0);
  }
  function chooseMedia(file) {
    state.selectedFile = file || null;
    var preview = document.getElementById("vc-v2-preview"); preview.innerHTML = "";
    if (file) {
      var mediaUrl = URL.createObjectURL(file), media;
      if (file.type.indexOf("image/") === 0) { media = document.createElement("img"); media.alt = tr("photo"); }
      else if (file.type.indexOf("audio/") === 0) { media = document.createElement("audio"); media.controls = true; }
      else if (file.type.indexOf("video/") === 0) { media = document.createElement("video"); media.controls = true; }
      if (media) { media.className = "vc-v2-media-preview"; media.src = mediaUrl; preview.appendChild(media); }
    }
    document.getElementById("vc-v2-upload").disabled = !(state.selectedFile && document.getElementById("vc-v2-media-consent").checked);
  }
  ["vc-v2-photo", "vc-v2-audio", "vc-v2-video"].forEach(function (id) { document.getElementById(id).addEventListener("change", function (event) { ["vc-v2-photo", "vc-v2-audio", "vc-v2-video"].forEach(function (other) { if (other !== id) document.getElementById(other).value = ""; }); chooseMedia(event.target.files[0]); }); });
  document.getElementById("vc-v2-media-consent").addEventListener("change", function () { document.getElementById("vc-v2-upload").disabled = !(state.selectedFile && this.checked); });
  document.getElementById("vc-v2-media-close").addEventListener("click", function () { closeDialog(mediaDialog); });
  document.getElementById("vc-v2-upload").addEventListener("click", uploadMedia);
  async function uploadMedia() {
    var file = state.selectedFile, status = document.getElementById("vc-v2-media-status"), button = document.getElementById("vc-v2-upload");
    if (!file || !state.mediaAlert || !document.getElementById("vc-v2-media-consent").checked) { status.textContent = tr("chooseFile"); return; }
    var kind = file.type.indexOf("image/") === 0 ? "image" : file.type.indexOf("audio/") === 0 ? "audio" : file.type.indexOf("video/") === 0 ? "video" : "";
    if (!kind) { status.textContent = tr("chooseFile"); return; }
    button.disabled = true; status.textContent = tr("creatingCase");
    try {
      var current = await ensureAlertCase(state.mediaAlert, answersFor(state.mediaAlert));
      status.textContent = tr("uploading");
      var intent = await jsonRequest("/api/public/incidents/" + encodeURIComponent(current.id) + "/media-intents", {method: "POST", headers: {"Content-Type": "application/json", "X-Case-Token": current.token}, body: JSON.stringify({kind: kind, contentType: file.type, fileName: file.name, sizeBytes: file.size, consent: true})});
      var response = await fetch(intent.media.uploadUrl, {method: "PUT", credentials: "same-origin", headers: {"Content-Type": file.type, "X-Media-Token": intent.media.uploadToken}, body: file});
      var result = await response.json(); if (!response.ok) throw new Error(result.message || "upload_failed");
      status.textContent = tr("uploaded") + " · " + result.media.id; state.receipt = tr("caseSent") + " · " + current.id; state.receiptStatus = "confirmed"; saveState(); render(); announce(status.textContent); state.selectedFile = null;
    } catch (error) { status.textContent = tr("uploadError"); button.disabled = false; }
  }

  function buildSettingsDialog() {
    var dialog = document.createElement("dialog");
    dialog.className = "vc-v2-dialog vc-v2-settings-dialog";
    dialog.id = "vc-v2-settings-dialog";
    dialog.setAttribute("aria-labelledby", "vc-v2-settings-title");
    dialog.innerHTML = '<div class="vc-v2-dialog-inner"><div class="vc-v2-dialog-head"><h2 id="vc-v2-settings-title"></h2><button class="vc-v2-dialog-close" id="vc-v2-settings-close" type="button">✕</button></div><div class="vc-v2-setting-list"><label class="vc-v2-setting-row"><i data-lucide="languages" aria-hidden="true"></i><span id="vc-v2-language-label"></span><select id="vc-v2-language"><option value="es">ES</option><option value="val">VAL</option><option value="en">EN</option></select></label><div class="vc-v2-setting-row"><i data-lucide="type" aria-hidden="true"></i><span id="vc-v2-text-label"></span><div class="vc-v2-font-controls"><button id="vc-v2-font-minus" type="button">A−</button><output id="vc-v2-font-value"></output><button id="vc-v2-font-plus" type="button">A+</button></div></div><button class="vc-v2-setting-row vc-v2-setting-toggle" id="vc-v2-narration" type="button"><i data-lucide="audio-lines" aria-hidden="true"></i><span id="vc-v2-narration-label"></span><strong id="vc-v2-narration-state"></strong></button><button class="vc-v2-setting-row vc-v2-setting-toggle" id="vc-v2-contrast" type="button"><i data-lucide="contrast" aria-hidden="true"></i><span id="vc-v2-contrast-label"></span><strong id="vc-v2-contrast-state"></strong></button><button class="vc-v2-setting-row vc-v2-setting-toggle" id="vc-v2-visual-alerts" type="button"><i data-lucide="bell-ring" aria-hidden="true"></i><span id="vc-v2-visual-label"></span><strong id="vc-v2-visual-state"></strong></button></div><details class="vc-v2-settings-secondary"><summary id="vc-v2-offline-title"></summary><p id="vc-v2-offline-copy"></p><p id="vc-v2-privacy-copy"></p></details></div>';
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDialog(dialog); });
    return dialog;
  }
  function openSettings() { renderSettings(); openDialog(settingsDialog); document.getElementById("vc-v2-settings-close").focus(); }
  function renderSettings() {
    document.getElementById("vc-v2-settings-title").textContent = tr("settings");
    document.getElementById("vc-v2-settings-close").setAttribute("aria-label", tr("close"));
    document.getElementById("vc-v2-language-label").textContent = tr("language");
    document.getElementById("vc-v2-language").value = lang();
    document.getElementById("vc-v2-text-label").textContent = tr("textSize");
    document.getElementById("vc-v2-font-minus").setAttribute("aria-label", tr("smaller"));
    document.getElementById("vc-v2-font-plus").setAttribute("aria-label", tr("larger"));
    document.getElementById("vc-v2-font-minus").disabled = state.textSize === 0;
    document.getElementById("vc-v2-font-plus").disabled = state.textSize === 2;
    document.getElementById("vc-v2-font-value").textContent = ["100%", "115%", "130%"][state.textSize];
    document.getElementById("vc-v2-font-value").setAttribute("aria-label", tr("percent"));
    setSettingToggle("vc-v2-narration", "vc-v2-narration-label", "vc-v2-narration-state", tr("narration"), state.narration, tr("narrationOn"), tr("narrationOff"));
    setSettingToggle("vc-v2-contrast", "vc-v2-contrast-label", "vc-v2-contrast-state", tr("contrast"), state.contrast, tr("narrationOn"), tr("narrationOff"));
    setSettingToggle("vc-v2-visual-alerts", "vc-v2-visual-label", "vc-v2-visual-state", tr("visualAlerts"), state.tactile, tr("alertsReady"), tr("alertsOn"));
    document.getElementById("vc-v2-offline-title").textContent = tr("offline");
    document.getElementById("vc-v2-offline-copy").textContent = (navigator.onLine ? tr("cachedOnline") : tr("cachedOffline")) + (state.cachedAt ? " · " + tr("cachedAt") + ": " + state.cachedAt : "");
    document.getElementById("vc-v2-privacy-copy").textContent = tr("privacy");
    if (window.lucide) window.lucide.createIcons({attrs: {width: 20, height: 20}});
  }
  function setSettingToggle(buttonId, labelId, stateId, label, enabled, onCopy, offCopy) {
    document.getElementById(buttonId).setAttribute("aria-pressed", String(enabled));
    document.getElementById(labelId).textContent = label;
    document.getElementById(stateId).textContent = enabled ? onCopy : offCopy;
  }
  function setLanguage(value) {
    relocaliseReceipt(value);
    var legacy = document.getElementById("vc-language");
    if (legacy) { legacy.value = value; legacy.dispatchEvent(new Event("change", {bubbles: true})); }
    else root.setAttribute("lang", value === "val" ? "ca-valencia" : value);
    window.setTimeout(function () {
      render(); if (settingsDialog.open) renderSettings();
      if (quickDialog.open && state.quick) { stopDialogSpeech(); renderQuick(); if (state.quick.stage === "questions" && state.narration) speakCurrentQuestion(true, false); }
    }, 0);
  }
  function relocaliseReceipt(targetLanguage) {
    if (!state.receipt) return;
    ["answerSent", "answerQueued", "caseSent", "caseQueued"].some(function (key) {
      return ["es", "val", "en"].some(function (language) {
        var prefix = copy[language][key];
        if (prefix && state.receipt.indexOf(prefix) === 0) {
          state.receipt = copy[targetLanguage][key] + state.receipt.slice(prefix.length);
          saveState();
          return true;
        }
        return false;
      });
    });
  }
  document.getElementById("vc-v2-settings-close").addEventListener("click", function () { closeDialog(settingsDialog); });
  document.getElementById("vc-v2-language").addEventListener("change", function (event) { setLanguage(event.target.value); });
  document.getElementById("vc-v2-font-minus").addEventListener("click", function () { state.textSize = Math.max(0, state.textSize - 1); saveState(); applyPreferences(); renderSettings(); });
  document.getElementById("vc-v2-font-plus").addEventListener("click", function () { state.textSize = Math.min(2, state.textSize + 1); saveState(); applyPreferences(); renderSettings(); });
  document.getElementById("vc-v2-narration").addEventListener("click", function () {
    state.narration = !state.narration; state.narrationConfigured = true; saveState(); renderSettings();
    var alert = localAlerts()[0];
    if (state.narration && alert && (!state.policy || !state.policy.voice || state.policy.voice.autoSpeak !== false)) speak(alertSpeech(alert.alert)); else if (!state.narration) stopSpeech();
  });
  document.getElementById("vc-v2-contrast").addEventListener("click", function () { state.contrast = !state.contrast; saveState(); applyPreferences(); renderSettings(); });
  document.getElementById("vc-v2-visual-alerts").addEventListener("click", enableProminentAlerts);

  async function enableProminentAlerts() {
    if (state.tactile) { state.tactile = false; saveState(); renderSettings(); return; }
    state.tactile = true; saveState();
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    try {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
      if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      var primary = localAlerts()[0];
      if (primary && "Notification" in window && Notification.permission === "granted") {
        var registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
        var options = {body: local(primary.alert.recommendedAction), icon: "/assets/favicon-citizen.svg", tag: responseKey(primary.alert)};
        if (registration && registration.showNotification) registration.showNotification(local(primary.alert.title), options); else new Notification(local(primary.alert.title), options);
      }
    } catch (error) {}
    renderSettings(); announce(tr("alertsReady"));
  }

  var screenObserver = new MutationObserver(function () { syncVisibility(); });
  screenObserver.observe(screen, {childList: true, subtree: false});
  new MutationObserver(function () { render(); if (settingsDialog.open) renderSettings(); }).observe(root, {attributes: true, attributeFilter: ["lang"]});
  window.addEventListener("online", function () { retryOutbox(); retryCaseOutbox(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { loadData(); retryOutbox(); retryCaseOutbox(); } });
  document.addEventListener("vt01:es-alert-received", function (event) {
    var incoming = event.detail && event.detail.alert;
    if (incoming && incoming.id) {
      state.alerts = [incoming].concat(state.alerts.filter(function (item) { return item.id !== incoming.id; }));
      state.alertSignature = alertsSignature(state.alerts);
      render();
    }
    state.demoPrompted = false;
    maybePrompt(true);
  });
  document.addEventListener("vt01:open-quick-checkin", function () {
    var primary = localAlerts()[0];
    if (primary) openQuick(primary.alert, true, "");
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
  render(); loadData(); retryOutbox(); retryCaseOutbox();
  window.setInterval(pollForESAlert, ALERT_POLL_MS);
})();
