// Nombre de la cache
const CACHE_NAME = 'js-encrypter-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Instalacion del Service Worker y almacenamiento de los archivos principales
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercepcion de las peticiones para servir desde cache si no hay red
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Devuelve el archivo de la cache si se encuentra
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});