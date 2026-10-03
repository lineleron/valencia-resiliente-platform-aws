(function () {
  "use strict";

  var mount = document.getElementById("v-v2-intelligence");
  if (!mount) return;
  var latest = {zoneCriticalities: [], media: [], publicAlerts: []};
  var order = {unknown: 0, low: 1, medium: 2, high: 3, critical: 4};
  var labels = {
    es: {title: "Criticidad territorial", subtitle: "Alerta oficial y necesidad operativa se muestran por separado.", critical: "Crítica", high: "Alta", medium: "Media", low: "Baja", unknown: "Información insuficiente", official: "Alerta oficial", operational: "Necesidad operativa", responses: "respuestas", help: "necesitan ayuda", media: "Bandeja multimedia", mediaSub: "La sugerencia automática apoya la revisión; nunca ordena un despacho.", aiNote: "IA → sugerencia · persona → decisión", empty: "Todavía no se han recibido archivos reales desde la aplicación ciudadana.", simulated: "SIMULACIÓN", real: "ANÁLISIS REAL", suggested: "Sugerencia", confidence: "Confianza de etiqueta", pending: "Pendiente de revisión humana", confirm: "Confirmar sugerencia", override: "Cambiar prioridad", reject: "Rechazar análisis", reason: "Motivo obligatorio al cambiar o rechazar", priority: "Prioridad humana", saved: "Revisión guardada", failed: "No se pudo guardar la revisión", model: "Modelo", source: "Fuente", age: "Recibido", original: "Abrir evidencia", noConfidence: "No calculada", signalReceived: "Archivo recibido", signalValidated: "Firma y tamaño validados", reasonPriority: "Prioridad provisional basada en la respuesta ciudadana del caso.", reasonSimulation: "SIMULACIÓN: el análisis cloud de contenido todavía no está conectado en la demo local."},
    val: {title: "Criticitat territorial", subtitle: "L'alerta oficial i la necessitat operativa es mostren per separat.", critical: "Crítica", high: "Alta", medium: "Mitjana", low: "Baixa", unknown: "Informació insuficient", official: "Alerta oficial", operational: "Necessitat operativa", responses: "respostes", help: "necessiten ajuda", media: "Safata multimèdia", mediaSub: "El suggeriment automàtic ajuda a revisar; mai ordena un despatx.", aiNote: "IA → suggeriment · persona → decisió", empty: "Encara no s'han rebut arxius reals des de l'aplicació ciutadana.", simulated: "SIMULACIÓ", real: "ANÀLISI REAL", suggested: "Suggeriment", confidence: "Confiança d'etiqueta", pending: "Pendent de revisió humana", confirm: "Confirmar suggeriment", override: "Canviar prioritat", reject: "Rebutjar anàlisi", reason: "Motiu obligatori en canviar o rebutjar", priority: "Prioritat humana", saved: "Revisió guardada", failed: "No s'ha pogut guardar la revisió", model: "Model", source: "Font", age: "Rebut", original: "Obrir evidència", noConfidence: "No calculada", signalReceived: "Arxiu rebut", signalValidated: "Firma i mida validades", reasonPriority: "Prioritat provisional basada en la resposta ciutadana del cas.", reasonSimulation: "SIMULACIÓ: l'anàlisi cloud del contingut encara no està connectada en la demo local."},
    en: {title: "Area criticality", subtitle: "Official alert severity and operational need are shown separately.", critical: "Critical", high: "High", medium: "Medium", low: "Low", unknown: "Insufficient information", official: "Official alert", operational: "Operational need", responses: "responses", help: "need help", media: "Multimedia inbox", mediaSub: "The automated suggestion supports review and never dispatches resources.", aiNote: "AI → suggestion · person → decision", empty: "No real files have been received from the citizen application yet.", simulated: "SIMULATION", real: "REAL ANALYSIS", suggested: "Suggestion", confidence: "Label confidence", pending: "Awaiting human review", confirm: "Confirm suggestion", override: "Change priority", reject: "Reject analysis", reason: "Reason required for an override or rejection", priority: "Human priority", saved: "Review saved", failed: "The review could not be saved", model: "Model", source: "Source", age: "Received", original: "Open evidence", noConfidence: "Not calculated", signalReceived: "File received", signalValidated: "Signature and size validated", reasonPriority: "Provisional priority based on the citizen response linked to the case.", reasonSimulation: "SIMULATION: cloud content analysis is not connected in the local demo yet."}
  };

  function language() { return window.VT01I18n && window.VT01I18n.getLanguage ? window.VT01I18n.getLanguage() : "es"; }
  function tr(key) { return (labels[language()] && labels[language()][key]) || labels.es[key] || key; }
  function local(value) { return value && (value[language()] || value.es || value.val || value.en) || ""; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[character]; }); }
  function severity(level) { return Object.prototype.hasOwnProperty.call(order, level) ? level : "unknown"; }
  function zoneName(item) { return local(item.names) || item.zoneCode || item.zoneId; }
  function formatTime(value) { var date = new Date(value || ""); return Number.isFinite(date.getTime()) ? date.toLocaleTimeString(language() === "en" ? "en-GB" : "es-ES", {hour: "2-digit", minute: "2-digit"}) : "—"; }
  function kindIcon(kind) { return {image: "image", audio: "audio-lines", video: "video"}[kind] || "paperclip"; }
  function systemMessage(value) {
    var keys = {
      "Archivo recibido": "signalReceived",
      "Firma y tamaño validados": "signalValidated",
      "Prioridad provisional basada en la respuesta ciudadana del caso.": "reasonPriority",
      "SIMULACIÓN: el análisis cloud de contenido todavía no está conectado en la demo local.": "reasonSimulation"
    };
    return keys[value] ? tr(keys[value]) : value;
  }

  function render() {
    var zones = (latest.zoneCriticalities || []).slice().sort(function (a, b) { return order[severity(b.priorityLevel)] - order[severity(a.priorityLevel)] || zoneName(a).localeCompare(zoneName(b)); });
    var media = latest.media || [];
    mount.innerHTML = '<section class="v-v2-panel" aria-labelledby="v-v2-zone-title"><div class="v-v2-heading"><div><h2 id="v-v2-zone-title">' + esc(tr("title")) + '</h2><p>' + esc(tr("subtitle")) + '</p></div><div class="v-v2-note">' + esc(tr("unknown")) + ' ≠ ' + esc(tr("low")) + '</div></div><div class="v-v2-zone-grid" id="v-v2-map-alternative">' + zones.map(renderZone).join("") + '</div></section>' +
      '<section class="v-v2-panel" aria-labelledby="v-v2-media-title"><div class="v-v2-heading"><div><h2 id="v-v2-media-title">' + esc(tr("media")) + '</h2><p>' + esc(tr("mediaSub")) + '</p></div><div class="v-v2-note">' + esc(tr("aiNote")) + '</div></div><div class="v-v2-media-list">' + (media.length ? media.map(renderMedia).join("") : '<p class="v-v2-empty">' + esc(tr("empty")) + '</p>') + '</div><p class="v-v2-live" id="v-v2-live" role="status" aria-live="polite"></p></section>';
    bindReviews();
    var map = document.getElementById("v-street-map"); if (map) map.setAttribute("aria-describedby", "v-v2-map-alternative");
    if (window.lucide) window.lucide.createIcons({attrs: {width: 17, height: 17}});
    if (window.VT01I18n) window.VT01I18n.refresh(mount);
  }
  function renderZone(item) {
    var level = severity(item.priorityLevel), official = severity(item.officialSeverity), operational = severity(item.operationalNeed);
    return '<article class="v-v2-zone" data-level="' + level + '"><span class="v-v2-level">' + esc(tr(level)) + '</span><strong>' + esc(zoneName(item)) + '</strong><div class="v-v2-split"><span>' + esc(tr("official")) + '<b>' + esc(tr(official)) + '</b></span><span>' + esc(tr("operational")) + '<b>' + esc(tr(operational)) + '</b></span></div><small>' + Number(item.responses || 0) + ' ' + esc(tr("responses")) + ' · ' + Number(item.peopleNeedingHelp || 0) + ' ' + esc(tr("help")) + '</small></article>';
  }
  function renderPreview(item) {
    if (!item.contentUrl || item.status !== "ready") return '<i data-lucide="' + kindIcon(item.kind) + '" aria-hidden="true"></i>';
    if (item.kind === "image") return '<a href="' + esc(item.contentUrl) + '" target="_blank" rel="noopener"><img src="' + esc(item.contentUrl) + '" alt="' + esc(item.fileName || "Evidencia recibida") + '"></a>';
    if (item.kind === "audio") return '<audio controls preload="metadata" src="' + esc(item.contentUrl) + '"></audio>';
    return '<video controls preload="metadata" src="' + esc(item.contentUrl) + '"></video>';
  }
  function renderMedia(item) {
    var analysis = item.analysis || {}, mode = analysis.mode === "real" ? "real" : "simulated", suggested = severity(analysis.suggestedPriority);
    var confidence = analysis.confidence != null && Number.isFinite(Number(analysis.confidence)) ? Math.round(Number(analysis.confidence) * (Number(analysis.confidence) <= 1 ? 100 : 1)) + "%" : tr("noConfidence");
    var reviewed = analysis.humanStatus && analysis.humanStatus !== "pending";
    return '<article class="v-v2-media-card" data-media-id="' + esc(item.id) + '"><div class="v-v2-preview">' + renderPreview(item) + '</div><div class="v-v2-media-copy"><h3>' + esc(item.incidentId + ' · ' + (item.fileName || item.kind)) + '</h3><div class="v-v2-meta"><span class="v-v2-chip ' + (mode === "simulated" ? 'is-simulated' : '') + '">' + esc(mode === "simulated" ? tr("simulated") : tr("real")) + '</span><span class="v-v2-chip" data-level="' + suggested + '">' + esc(tr("suggested") + ': ' + tr(suggested)) + '</span><span class="v-v2-chip">' + esc(tr("confidence") + ': ' + confidence) + '</span><span class="v-v2-chip">' + esc(tr("age") + ': ' + formatTime(item.uploadedAt)) + '</span></div><div class="v-v2-meta">' + (analysis.signals || []).map(function (signal) { return '<span class="v-v2-chip">' + esc(systemMessage(signal)) + '</span>'; }).join("") + '</div><ul class="v-v2-reasons">' + (analysis.reasons || []).map(function (reason) { return '<li>' + esc(systemMessage(reason)) + '</li>'; }).join("") + '</ul><small>' + esc(tr("source") + ': ' + (analysis.provider || "—") + ' · ' + tr("model") + ': ' + (analysis.model || "—") + ' ' + (analysis.modelVersion || "")) + '</small></div><div class="v-v2-review"><strong>' + esc(reviewed ? tr("saved") : tr("pending")) + '</strong><label>' + esc(tr("priority")) + '<select data-review-priority><option value="critical"' + (suggested === "critical" ? ' selected' : '') + '>' + esc(tr("critical")) + '</option><option value="high"' + (suggested === "high" ? ' selected' : '') + '>' + esc(tr("high")) + '</option><option value="medium"' + (suggested === "medium" ? ' selected' : '') + '>' + esc(tr("medium")) + '</option><option value="low"' + (suggested === "low" ? ' selected' : '') + '>' + esc(tr("low")) + '</option></select></label><label>' + esc(tr("reason")) + '<input data-review-reason maxlength="280" value="' + esc(analysis.overrideReason || "") + '"></label><div class="v-v2-review-actions"><button class="is-primary" type="button" data-review-action="confirmed">' + esc(tr("confirm")) + '</button><button type="button" data-review-action="overridden">' + esc(tr("override")) + '</button><button type="button" data-review-action="rejected">' + esc(tr("reject")) + '</button></div></div></article>';
  }
  function bindReviews() {
    Array.prototype.forEach.call(mount.querySelectorAll("[data-review-action]"), function (button) {
      button.addEventListener("click", async function () {
        var card = button.closest("[data-media-id]"), action = button.getAttribute("data-review-action");
        var priority = card.querySelector("[data-review-priority]").value, reason = card.querySelector("[data-review-reason]").value.trim();
        var live = document.getElementById("v-v2-live");
        if ((action === "overridden" || action === "rejected") && !reason) { live.textContent = tr("reason"); card.querySelector("[data-review-reason]").focus(); return; }
        button.disabled = true; live.textContent = "…";
        try {
          var updated = await window.VT01OperatorAPI.reviewMedia(card.getAttribute("data-media-id"), {humanStatus: action, operatorPriority: action === "rejected" ? null : priority, reason: reason});
          latest.media = (latest.media || []).map(function (item) { return item.id === updated.id ? updated : item; });
          render(); document.getElementById("v-v2-live").textContent = tr("saved");
        } catch (error) { button.disabled = false; live.textContent = tr("failed") + ": " + error.message; }
      });
    });
  }

  function updateTabs(container) {
    Array.prototype.forEach.call(container.querySelectorAll('[role="tab"]'), function (tab) { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
  }
  document.addEventListener("keydown", function (event) {
    var tab = event.target.closest && event.target.closest('[role="tab"]'); if (!tab) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
    var list = Array.prototype.slice.call(tab.parentNode.querySelectorAll('[role="tab"]')); if (!list.length) return;
    var index = list.indexOf(tab);
    if (event.key === "Home") index = 0; else if (event.key === "End") index = list.length - 1; else index = (index + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
    event.preventDefault(); list[index].focus(); list[index].click();
  });
  new MutationObserver(function () { updateTabs(document); }).observe(document.getElementById("vt-dashboard"), {childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"]});
  document.addEventListener("vt01:dashboard-updated", function (event) { latest = event.detail || latest; render(); });
  window.addEventListener("vt01:languagechange", render);
  updateTabs(document); render();
})();
