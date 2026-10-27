/* Service Worker — Tres en Raya online by Belgra_77_Soft */
const CACHE = "belgra77-trr-v2";
const ASSETS = ["./", "./index.html", "./style.css", "./manifest.json", "./js/audio.js", "./js/app.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isAppShell = e.request.destination === "document";
  // Documentos: network-first. Assets estáticos (css/js): network-first con
  // respaldo de caché para que las ediciones se vean al recargar sin F5 forzado.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
