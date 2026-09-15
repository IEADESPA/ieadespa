// service-worker.js (vB.5 — PWA instalável)
// Cache do "app shell" (HTML/JS/CSS/ícones) pra abrir mesmo em conexão
// ruim/offline — o CONTEÚDO (dado real) sempre vem de /api/*, isso aqui
// nunca cacheia API: sem sincronização offline de dado, só a casca do app
// carrega sem rede. Também recebe evento de push (shared/notificacaoPush.js
// no back-end) e mostra a notificação do sistema operacional.
const CACHE_NOME = "ieadespa-app-shell-v1";
const ARQUIVOS_SHELL = ["/", "/index.html", "/script.js", "/style.css", "/manifest.json"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// Network-first pro shell (sempre pega a versão mais nova quando online),
// cache como fallback (offline ainda abre alguma coisa). Nunca intercepta
// /api/ — chamada à API sem rede precisa falhar de verdade (o script.js já
// trata isso com toast de erro), não devolver um cache velho de dado.
self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request).then((r) => r || caches.match("/index.html")))
  );
});

self.addEventListener("push", (evento) => {
  let dados = { titulo: "IEADESPA", mensagem: "Você tem uma notificação nova." };
  try { dados = evento.data.json(); } catch (e) { /* payload sem JSON — usa o padrão acima */ }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || "IEADESPA", {
      body: dados.mensagem || "",
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png"
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: "window" }).then((lista) => {
      const existente = lista.find((c) => "focus" in c);
      if (existente) return existente.focus();
      return self.clients.openWindow("/");
    })
  );
});
