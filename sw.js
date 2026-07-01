/*
 * sw.js — service worker for offline capability (Phase 27 B).
 *
 * Strategy (offline use WITHOUT the stale-version problem from Phase 21 J):
 *   - Navigations / HTML  -> network-first, fall back to the cached shell offline.
 *     So online you always get the newest index.html (referencing the newest ?v=N
 *     assets); offline you get the cached app.
 *   - Same-origin assets  -> cache-first, then network (and cache the result).
 *     Safe because every app asset is cache-busted with ?v=N — a new release is a
 *     new URL, so cache-first never serves stale code.
 *   - Cross-origin (Google Identity / Drive) -> not handled; hits the network and
 *     fails gracefully offline (cloud backup already degrades silently).
 *
 * Two caches:
 *   SHELL  — app shell + full metadata/vocab datasets. Versioned; wiped & rebuilt
 *            on each release (VERSION bump).
 *   STROKE — stroke-order JSON (data/kanji/<char>.json, ~3000 immutable files).
 *            Persistent across releases (the files never change), cached on demand
 *            as kanji are drawn plus a one-time background bulk-cache requested by
 *            the page, so a full study session works offline.
 */
var VERSION = "v33";
var SHELL = "kanji-shell-" + VERSION;
var STROKE = "kanji-strokes-v1";
var V = "?v=33"; // keep in sync with the ?v=N on index.html's asset links

var PRECACHE = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "icon-maskable.svg",
  "css/styles.css" + V,
  "vendor/hanzi-writer.min.js", "vendor/ts-fsrs.umd.js",
  "data/kanji-meta.js" + V,
  "data/kanji-gen-1.js" + V, "data/kanji-gen-2.js" + V,
  "data/kanji-gen-3.js" + V, "data/kanji-gen-4.js" + V,
  "data/kanji-components.js" + V,
  "js/store.js" + V, "js/scheduler.js" + V, "js/clouddrive.js" + V,
  "js/filters.js" + V, "js/drawscreen.js" + V, "js/app.js" + V,
];

function isStroke(url) { return url.pathname.indexOf("/data/kanji/") !== -1 && url.pathname.slice(-5) === ".json"; }

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // per-file (not addAll) so one missing file can't abort the whole precache
      return Promise.all(PRECACHE.map(function (url) {
        return fetch(url, { cache: "no-cache" }).then(function (r) { if (r.ok) return c.put(url, r.clone()); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // drop old shell caches; keep the persistent stroke cache
        if (k !== SHELL && k !== STROKE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isNavigation(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") && req.headers.get("accept").indexOf("text/html") !== -1);
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                 // never touch writes
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // cross-origin -> default network (GIS/Drive)
  if (url.pathname.slice(-6) === "/sw.js") return;  // never cache the worker itself (keeps updates working)

  if (isNavigation(req)) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(SHELL).then(function (c) { c.put("index.html", copy); });
        return r;
      }).catch(function () {
        return caches.match("index.html").then(function (m) { return m || caches.match("./"); });
      })
    );
    return;
  }

  var cacheName = isStroke(url) ? STROKE : SHELL;
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        if (r && r.ok) { var copy = r.clone(); caches.open(cacheName).then(function (c) { c.put(req, copy); }); }
        return r;
      });
    })
  );
});

// Background bulk-cache of stroke files, requested by the page (once, when online),
// in small throttled batches so it never floods the connection.
self.addEventListener("message", function (e) {
  var data = e.data || {};
  if (data.type === "cache-strokes" && Array.isArray(data.urls)) {
    e.waitUntil(cacheStrokes(data.urls).then(function (n) {
      if (e.source && e.source.postMessage) e.source.postMessage({ type: "strokes-cached", count: n });
    }));
  } else if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

function cacheStrokes(urls) {
  return caches.open(STROKE).then(function (c) {
    var i = 0, cached = 0, BATCH = 12;
    function next() {
      if (i >= urls.length) return Promise.resolve(cached);
      var slice = urls.slice(i, i + BATCH); i += BATCH;
      return Promise.all(slice.map(function (u) {
        return caches.match(u).then(function (hit) {
          if (hit) { cached++; return; }
          return fetch(u).then(function (r) { if (r && r.ok) { cached++; return c.put(u, r.clone()); } }).catch(function () {});
        });
      })).then(next);
    }
    return next();
  });
}
