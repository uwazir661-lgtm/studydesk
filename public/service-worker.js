const CACHE_NAME = "studydesk-shell-v16";
const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/studydesk-192.png",
  "/icons/studydesk-512.png",
  "/style.css",
  "/api.js",
  "/offline-cache.js",
  "/theme.js",
  "/script.js",
  "/notes.js",
  "/auth.js",
  "/weather.js",
  "/assignments.js",
  "/pomodoro.js",
  "/budget.js",
  "/dashboard.js",
  "/agent.js",
  "/calendar.js",
  "/studyplan.js",
  "/exams.js",
  "/syllabus.js",
  "/flashcards.js",
  "/quizzes.js",
  "/reminders.js",
  "/grades.js",
  "/classes.js",
  "/analytics.js",
  "/pwa.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          return key.startsWith("studydesk-shell-") && key !== CACHE_NAME;
        }).map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request).then(function (response) {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(async function () {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match("/index.html")) || (await caches.match("/"));
      }
      return Response.error();
    })
  );
});
