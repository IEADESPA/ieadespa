// service-worker.js (vB.5 — PWA instalável)
// Cache do "app shell" (HTML/JS/CSS/ícones) pra abrir mesmo em conexão
// ruim/offline — o CONTEÚDO (dado real) sempre vem de /api/*, isso aqui
// nunca cacheia API. A única coisa que funciona sem rede além da casca é a
// chamada da EBD (v6.10), e ela não passa por aqui: o próprio script.js
// guarda o pacote da turma e a fila de marcações no localStorage. Também recebe evento de push (shared/notificacaoPush.js
// no back-end) e mostra a notificação do sistema operacional.
// v3 (03/10/2026): a biblioteca de planilhas (SheetJS 0.20.3) passou a ser servida daqui (/vendor), não mais de um CDN de terceiros; subir a versão do cache refaz a instalação.
const CACHE_NOME = "ieadespa-app-shell-v3";
const ARQUIVOS_SHELL = ["/", "/index.html", "/script.js", "/style.css", "/manifest.json", "/vendor/xlsx.full.min.js"];

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
  // v6.9 — a página pública de verificação de certificado nunca passa pelo
  // cache: a URL carrega o código do certificado, e o cache do aparelho (às
  // vezes compartilhado) não deve guardá-lo. Também nunca cai no index.html
  // quando offline: melhor o erro do navegador do que o app no lugar dela.
  if (url.pathname === "/verificar.html") return;

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      // v6.10 — só uma NAVEGAÇÃO cai no index.html quando offline; um script ou
      // folha de estilo de fora (CDN, fontes) sem cache falha de verdade, em vez
      // de receber HTML no lugar (que virava erro de sintaxe no console).
      .catch(() => caches.match(evento.request).then((r) => r || (evento.request.mode === "navigate" ? caches.match("/index.html") : Response.error())))
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
