"use strict";

var CACHE_NAME = "vt01-shell-v9";
var SHELL = ["/ciudadano", "/assets/app-theme.css", "/assets/citizen-v2.css", "/assets/citizen-v2.js", "/assets/favicon-citizen.svg", "/assets/qr-ciudadano.svg"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin || new URL(event.request.url).pathname.indexOf("/api/") === 0) return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
    return response;
  }).catch(function () { return caches.match(event.request); }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({type: "window", includeUncontrolled: true}).then(function (windows) {
    for (var index = 0; index < windows.length; index += 1) {
      if ("focus" in windows[index]) return windows[index].focus();
    }
    return clients.openWindow ? clients.openWindow("/ciudadano") : undefined;
  }));
});
