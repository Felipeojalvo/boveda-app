/* Service worker: la app abre sin conexión y sin quedarse colgada.
   Pide a la red, pero espera como máximo TIEMPO_MAX; si no llega, usa la copia guardada.
   Sin copia guardada (primera vez) espera a la red. */
const CACHE = 'boveda-v3';
const TIEMPO_MAX = 4000; // ms
const SHELL = [
  './', 'index.html', 'style.css', 'core.js', 'grafo.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' salta la caché HTTP del navegador: todos los archivos del shell son de la misma versión.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function responder(req) {
  const cache = await caches.open(CACHE);
  let guardada = await cache.match(req);
  if (!guardada && req.mode === 'navigate') guardada = await cache.match('index.html');

  // no-cache: revalida con el servidor en vez de usar la copia que el navegador tenga por su cuenta.
  const red = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    if (guardada) throw new Error('respuesta no válida');
    return res;
  });
  red.catch(() => { /* si perdimos la carrera, no dejar un error sin atender */ });

  if (!guardada) {
    try { return await red; } catch (_) { return Response.error(); }
  }
  let reloj;
  const limite = new Promise((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('lenta')), TIEMPO_MAX); });
  try {
    return await Promise.race([red, limite]);
  } catch (_) {
    return guardada; // sin red, red lenta o colgada: se abre con lo guardado (red sigue y actualiza la copia)
  } finally {
    clearTimeout(reloj);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos propios. Las llamadas a GitHub y Gemini nunca pasan por acá.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(responder(req));
});
