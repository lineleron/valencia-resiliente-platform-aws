(function () {
  "use strict";

  var session = null;
  var pollTimer = null;
  var polling = false;
  var lastDashboardSignature = "";
  var updateQueues = new Map();
  var updateRunning = new Set();
  var loginView = document.getElementById("login-view");
  var passwordView = document.getElementById("password-view");
  var operatorApp = document.getElementById("operator-app");
  var syncState = document.getElementById("sync-state");

  function icons() {
    if (window.lucide) window.lucide.createIcons({attrs: {width: 18, height: 18}});
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character];
    });
  }

  async function api(path, options) {
    var settings = Object.assign({credentials: "same-origin"}, options || {});
    settings.headers = Object.assign({}, settings.body ? {"Content-Type": "application/json"} : {}, settings.headers || {});
    var response = await fetch(path, settings);
    var data;
    try { data = await response.json(); }
    catch (error) { data = {message: "El servidor ha devuelto una respuesta no válida."}; }
    if (!response.ok) {
      var failure = new Error(data.message || "No se pudo completar la operación.");
      failure.status = response.status;
      failure.code = data.error;
      throw failure;
    }
    return data;
  }

  function setView(name) {
    loginView.hidden = name !== "login";
    passwordView.hidden = name !== "password";
    operatorApp.hidden = name !== "operator";
    icons();
    if (window.VT01I18n) window.VT01I18n.refresh(document.body);
    if (name === "operator" && window.VT01Central && window.VT01Central.invalidateMap) {
      window.requestAnimationFrame(function () { window.VT01Central.invalidateMap(); });
    }
  }

  function showLogin(message) {
    window.clearTimeout(pollTimer);
    session = null;
    document.getElementById("login-error").textContent = message || "";
    setView("login");
  }

  function showPasswordChange() {
    document.getElementById("password-error").textContent = "";
    setView("password");
    document.getElementById("current-password").focus();
  }

  function showOperator() {
    document.getElementById("session-name").textContent = session.displayName;
    document.getElementById("session-role").textContent = session.role === "SuperAdmin" ? "Superadministrador" : "Operador";
    document.getElementById("manage-admins").hidden = session.role !== "SuperAdmin";
    setView("operator");
    pollDashboard(true);
  }

  async function loadSession() {
    try {
      var result = await api("/api/auth/session");
      session = result.admin;
      if (session.mustChangePassword) showPasswordChange(); else showOperator();
    } catch (error) {
      showLogin("");
    }
  }

  document.getElementById("login-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = document.getElementById("login-submit");
    var errorNode = document.getElementById("login-error");
    button.disabled = true; errorNode.textContent = "";
    try {
      var result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({username: document.getElementById("login-username").value.trim(), password: document.getElementById("login-password").value})
      });
      session = result.admin;
      document.getElementById("login-password").value = "";
      if (session.mustChangePassword) showPasswordChange(); else showOperator();
    } catch (error) {
      errorNode.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("password-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var current = document.getElementById("current-password").value;
    var next = document.getElementById("new-password").value;
    var repeat = document.getElementById("repeat-password").value;
    var errorNode = document.getElementById("password-error");
    errorNode.textContent = "";
    if (next !== repeat) { errorNode.textContent = "Las contraseñas nuevas no coinciden."; return; }
    try {
      await api("/api/auth/change-password", {method: "POST", headers: {"X-CSRF-Token": session.csrfToken}, body: JSON.stringify({currentPassword: current, newPassword: next})});
      ["current-password","new-password","repeat-password"].forEach(function (id) { document.getElementById(id).value = ""; });
      await loadSession();
    } catch (error) { errorNode.textContent = error.message; }
  });

  async function pollDashboard(immediate) {
    window.clearTimeout(pollTimer);
    if (!session || polling) return;
    polling = true;
    if (immediate) syncState.textContent = "Sincronizando…";
    try {
      var result = await api("/api/admin/dashboard");
      var queuedIds = new Set(Array.from(updateQueues.keys()).concat(Array.from(updateRunning.values())));
      result.incidents = result.incidents.filter(function (item) { return !queuedIds.has(item.id); });
      var signature = JSON.stringify([result.incidents, result.checkinAggregates, result.publicAlerts, result.zoneCriticalities, result.heatmapFeed, result.media]);
      if (signature !== lastDashboardSignature && window.VT01Central) {
        lastDashboardSignature = signature;
        window.VT01Central.ingestDashboard(result);
        document.dispatchEvent(new CustomEvent("vt01:dashboard-updated", {detail: result}));
      }
      var time = new Date(result.serverTime);
      syncState.textContent = "Sincronizado · " + time.toLocaleTimeString("es-ES", {hour: "2-digit", minute: "2-digit", second: "2-digit"});
    } catch (error) {
      if (error.status === 401) { showLogin("La sesión ha caducado. Vuelve a iniciar sesión."); return; }
      if (error.code === "password_change_required") { session.mustChangePassword = true; showPasswordChange(); return; }
      syncState.textContent = "Sin conexión · reintentando";
    } finally {
      polling = false;
      if (session) pollTimer = window.setTimeout(function () { pollDashboard(false); }, 2500);
    }
  }

  document.addEventListener("vt01:incident-update", function (event) {
    var detail = event.detail || {};
    if (!detail.id) return;
    updateQueues.set(detail.id, detail);
    flushUpdate(detail.id);
  });

  async function flushUpdate(id) {
    if (updateRunning.has(id) || !session) return;
    var payload = updateQueues.get(id);
    if (!payload) return;
    updateQueues.delete(id); updateRunning.add(id);
    syncState.textContent = "Guardando " + id + "…";
    try {
      var result = await api("/api/admin/incidents/" + encodeURIComponent(id), {method: "PATCH", headers: {"X-CSRF-Token": session.csrfToken}, body: JSON.stringify(payload)});
      if (window.VT01Central) window.VT01Central.upsertIncident(result.incident);
      var next = updateQueues.get(id);
      if (next) { next.version = result.incident.version; updateQueues.set(id, next); }
      syncState.textContent = "Cambio guardado";
    } catch (error) {
      syncState.textContent = error.status === 409 ? "Actualizando por cambio concurrente…" : "No se pudo guardar · reintentando";
      if (error.status === 401) { showLogin("La sesión ha caducado. Vuelve a iniciar sesión."); }
      else window.setTimeout(function () { pollDashboard(true); }, 500);
    } finally {
      updateRunning.delete(id);
      if (updateQueues.has(id)) flushUpdate(id);
    }
  }

  document.getElementById("logout").addEventListener("click", async function () {
    try { await api("/api/auth/logout", {method: "POST", headers: {"X-CSRF-Token": session.csrfToken}, body: "{}"}); }
    catch (error) {}
    showLogin("");
  });

  var adminModal = document.getElementById("admin-modal");
  var adminReturnFocus = null;
  function adminFocusable() {
    return Array.prototype.slice.call(adminModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(function (element) {
      return !element.hidden && element.getClientRects().length > 0;
    });
  }
  function closeAdmins() {
    adminModal.hidden = true;
    operatorApp.inert = false;
    var target = adminReturnFocus && document.contains(adminReturnFocus) ? adminReturnFocus : document.getElementById("manage-admins");
    adminReturnFocus = null;
    if (target && !target.hidden) target.focus();
  }
  document.getElementById("manage-admins").addEventListener("click", openAdmins);
  document.getElementById("admin-close").addEventListener("click", closeAdmins);
  adminModal.addEventListener("click", function (event) { if (event.target === adminModal) closeAdmins(); });
  document.addEventListener("keydown", function (event) {
    if (adminModal.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeAdmins(); return; }
    if (event.key !== "Tab") return;
    var focusable = adminFocusable();
    if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  async function openAdmins() {
    if (adminModal.hidden) adminReturnFocus = document.activeElement;
    adminModal.hidden = false;
    operatorApp.inert = true;
    document.getElementById("temp-credential").hidden = true;
    document.getElementById("admin-error").textContent = "";
    document.getElementById("admin-list").innerHTML = "<p>Cargando usuarios…</p>";
    icons(); document.getElementById("admin-close").focus();
    try {
      var result = await api("/api/admins");
      document.getElementById("admin-list").innerHTML = result.admins.map(function (admin) {
        return '<div class="admin-row"><div><strong>' + escapeHTML(admin.displayName) + '</strong><span>@' + escapeHTML(admin.username) + '</span></div><div><strong>' + escapeHTML(admin.role === "SuperAdmin" ? "Superadministrador" : "Operador") + '</strong><span>' + (admin.mustChangePassword ? "Cambio de contraseña pendiente" : admin.active ? "Activo" : "Inactivo") + '</span></div></div>';
      }).join("") || "<p>No hay usuarios.</p>";
    } catch (error) { document.getElementById("admin-list").innerHTML = '<p class="auth-error">' + escapeHTML(error.message) + '</p>'; }
  }

  document.getElementById("admin-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var errorNode = document.getElementById("admin-error");
    errorNode.textContent = "";
    try {
      var result = await api("/api/admins", {method: "POST", headers: {"X-CSRF-Token": session.csrfToken}, body: JSON.stringify({
        displayName: document.getElementById("admin-display").value.trim(),
        username: document.getElementById("admin-username").value.trim(),
        role: document.getElementById("admin-role").value
      })});
      document.getElementById("temp-password").textContent = result.admin.temporaryPassword;
      document.getElementById("temp-credential").hidden = false;
      document.getElementById("admin-display").value = ""; document.getElementById("admin-username").value = "";
      await openAdmins();
      document.getElementById("temp-password").textContent = result.admin.temporaryPassword;
      document.getElementById("temp-credential").hidden = false;
    } catch (error) { errorNode.textContent = error.message; }
  });

  document.getElementById("copy-password").addEventListener("click", async function () {
    var value = document.getElementById("temp-password").textContent;
    try { await navigator.clipboard.writeText(value); this.textContent = "Copiada"; }
    catch (error) { this.textContent = "Selecciona y copia la contraseña"; }
  });

  window.VT01OperatorAPI = {
    reviewMedia: async function (mediaId, payload) {
      if (!session) throw new Error("La sesión no está activa.");
      var result = await api("/api/admin/media/" + encodeURIComponent(mediaId) + "/review", {
        method: "PATCH", headers: {"X-CSRF-Token": session.csrfToken}, body: JSON.stringify(payload)
      });
      pollDashboard(true);
      return result.media;
    },
    refresh: function () { return pollDashboard(true); }
  };

  icons();
  loadSession();
})();
