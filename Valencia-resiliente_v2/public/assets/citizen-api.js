(function () {
  "use strict";

  var bridge = window.VT01Citizen;
  var connection = document.getElementById("citizen-connection");
  var incidentInFlight = false;
  var checkinInFlight = false;
  var pollTimer = null;
  var caseKey = "vt01_current_case";

  if (!bridge) return;

  function connectionState(text, ok) {
    if (!connection) return;
    connection.textContent = text;
    connection.style.background = ok ? "#e2f3ef" : "#fff0df";
    connection.style.color = ok ? "#075b4f" : "#7a4800";
  }

  async function request(path, options) {
    var response = await fetch(path, Object.assign({
      credentials: "same-origin",
      headers: {"Content-Type": "application/json"}
    }, options || {}));
    var data;
    try { data = await response.json(); }
    catch (error) { data = {message: "Respuesta no válida del servidor."}; }
    if (!response.ok) {
      var failure = new Error(data.message || "No se pudo conectar con la central.");
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  function readCase() {
    try { return JSON.parse(window.sessionStorage.getItem(caseKey) || "null"); }
    catch (error) { return null; }
  }

  function saveCase(incident) {
    var current = {id: incident.id, token: incident.accessToken || (readCase() || {}).token || ""};
    try { window.sessionStorage.setItem(caseKey, JSON.stringify(current)); }
    catch (error) {}
    return current;
  }

  function startPolling() {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(pollCase, 1200);
  }

  async function submitIncident(payload) {
    if (incidentInFlight || !payload || !payload.clientRequestId) return;
    incidentInFlight = true;
    connectionState("Enviando aviso a la central…", false);
    try {
      var result = await request("/api/public/incidents", {method: "POST", body: JSON.stringify(payload)});
      saveCase(result.incident);
      bridge.incidentAcknowledged(result.incident);
      connectionState("Central conectada · aviso confirmado", true);
      startPolling();
    } catch (error) {
      bridge.incidentFailed(error.message);
      connectionState("Sin confirmación · el aviso queda pendiente para reintentar", false);
    } finally {
      incidentInFlight = false;
    }
  }

  async function pollCase() {
    var current = readCase();
    if (!current || !current.id || !current.token) return;
    try {
      var result = await request("/api/public/incidents/" + encodeURIComponent(current.id), {
        method: "GET",
        headers: {"X-Case-Token": current.token}
      });
      bridge.incidentAcknowledged(result.incident);
      connectionState("Central conectada · estado actualizado", true);
      if (result.incident.status !== "closed") pollTimer = window.setTimeout(pollCase, 2500);
    } catch (error) {
      connectionState("Conexión interrumpida · reintentando", false);
      pollTimer = window.setTimeout(pollCase, 5000);
    }
  }

  async function submitCheckin(payload) {
    if (checkinInFlight || !payload || !payload.clientRequestId) return;
    checkinInFlight = true;
    try {
      var result = await request("/api/public/checkins", {method: "POST", body: JSON.stringify(payload)});
      bridge.checkinAcknowledged(result.response);
      connectionState("Central conectada · respuesta confirmada", true);
    } catch (error) {
      bridge.checkinFailed(error.message);
      connectionState("Respuesta guardada en el dispositivo · reintentando", false);
    } finally {
      checkinInFlight = false;
    }
  }

  document.addEventListener("vt01:incident-submit", function (event) { submitIncident(event.detail); });
  document.addEventListener("vt01:checkin-submit", function (event) { submitCheckin(event.detail); });
  window.addEventListener("online", function () {
    var snapshot = bridge.snapshot();
    connectionState("Conexión recuperada · sincronizando…", false);
    if (snapshot.incident && snapshot.incident.clientRequestId) submitIncident(snapshot.incident);
    if (snapshot.publicSubmitted && snapshot.publicCheckin && snapshot.publicCheckin.clientRequestId) submitCheckin(snapshot.publicCheckin);
    pollCase();
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) pollCase(); });

  bridge.setConnected(true);
  connectionState(navigator.onLine ? "Central conectada · preparada para enviar" : "Sin conexión · se reintentará automáticamente", navigator.onLine);
  var initial = bridge.snapshot();
  var stored = readCase();
  if (stored && stored.id && stored.token) pollCase();
  else if (initial.incident && initial.incident.clientRequestId) submitIncident(initial.incident);
  if (initial.publicSubmitted && initial.publicCheckin && initial.publicCheckin.clientRequestId) submitCheckin(initial.publicCheckin);
})();
