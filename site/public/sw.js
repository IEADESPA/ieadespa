/*
 * Service worker: notificações push de eventos + um modo offline básico e
 * enxuto — só a página inicial, a programação e o contato, mais os
 * arquivos de estilo/script/fonte necessários pra elas renderizarem
 * (nada de fotos, PDFs, áudio ou outras páginas). De propósito pequeno:
 * o objetivo é dar acesso ao essencial numa queda de internet ou sinal
 * fraco, não guardar o site inteiro no celular da pessoa.
 */

const CACHE_NAME = "ieadespa-offline-v1";
const OFFLINE_FALLBACK = "/offline.html";
const OFFLINE_PAGES = ["/", "/contato/", "/eventos/"];
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "font"]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_FALLBACK)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("ieadespa-offline-") && key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isCacheablePage = isNavigation && OFFLINE_PAGES.includes(url.pathname);
  const isCacheableAsset = !isNavigation && CACHEABLE_DESTINATIONS.has(request.destination);

  if (isCacheablePage || isCacheableAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (isNavigation ? caches.match(OFFLINE_FALLBACK) : Response.error())),
    );
    return;
  }

  // Qualquer outra página (fora da lista curta acima) não fica em cache, mas
  // ainda ganha a tela de "sem conexão" em vez do erro feio do navegador.
  if (isNavigation) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_FALLBACK)));
  }

  // Fotos, PDFs, áudio, JSON etc.: passa direto pra rede, sem interceptar —
  // mantém o armazenamento pequeno.
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "IEADESPA", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "IEADESPA", {
      body: data.body || "",
      icon: "/favicon-192.png",
      badge: "/favicon-32.png",
      data: { url: data.url || "/eventos/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/eventos/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
