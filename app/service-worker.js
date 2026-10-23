// service-worker.js (vB.5 — PWA instalável)
// Cache do "app shell" (HTML/JS/CSS/ícones) pra abrir mesmo em conexão
// ruim/offline — o CONTEÚDO (dado real) sempre vem de /api/*, isso aqui
// nunca cacheia API. A única coisa que funciona sem rede além da casca é a
// chamada da EBD (v6.10), e ela não passa por aqui: o próprio script.js
// guarda o pacote da turma e a fila de marcações no localStorage. Também recebe evento de push (shared/notificacaoPush.js
// no back-end) e mostra a notificação do sistema operacional.
// v3 (03/10/2026): a biblioteca de planilhas (SheetJS 0.20.3) passou a ser servida daqui (/vendor), não mais de um CDN de terceiros; subir a versão do cache refaz a instalação.
// v4 (04/10/2026): CSP forte — os eventos saíram do HTML (onclick="...") para o despachante /eventos.js, que entra na casca; o index.html e o script.js
// novos só funcionam com ele, então a versão do cache sobe para a instalação baixar os três juntos.
// v5 (05/10/2026): com a CSP estrita, o `connect-src 'self'` vale TAMBÉM para o service worker: o fetch() dele para as fontes do Google era recusado e a página perdia a fonte
// (a página não vê essa recusa, só o console do service worker). Agora ele só trata pedidos do PRÓPRIO endereço; os de fora o navegador atende direto, sob as regras da página.
// v6 (07/10/2026): vD.2 — o script.js começou a ser dividido em módulos (app/modulos/*.js, carregados pelo index.html depois dele); cada módulo entra na
// casca, e a versão sobe para a instalação baixar o index.html novo junto com eles (v7: + voluntariado; v8: + eventos-congressos — nome longo para não confundir com o despachante eventos.js; v9: + canais; v10: + calendario; v11: + ebd; v12: + financeiro; v13: + ouvidoria; v14: + relatorios-departamentos; v15: + escalas; v16: + assistencia; v17: + disciplina; v18: + projetos-assembleia; v19: + pessoas; v20: + doacoes; v21: + permissoes; v22: + consagracoes; v23: + enquetes; v24: + arquivos; v25: + reunioes; v26: + catalogos-estrutura; v27: + meu-painel; v28: + meus-dados).
// v29 (07/10/2026): vD.4 — a biblioteca da chave de acesso (vendor/simplewebauthn-browser.js) entra na casca.
// v30 (08/10/2026): v7.6 — o módulo setores-tecnicos.js (Setores Técnicos e Vistoria de Antecedentes) entra na casca.
// v31 (09/10/2026): v7.7 — o módulo ministerio-menores.js (Habilitação para Ministério com Menores) entra na casca.
// v32 (09/10/2026): v7.8 — o módulo protecao.js (Incidentes, notificação obrigatória e escuta protegida; inclui a tela pública "Preciso de ajuda") entra na casca.
// v33 (13/10/2026): v7.8 — correções da revisão independente da tela da proteção (protecao.js, script.js, meus-dados.js, index.html e style.css mudaram): a casca nova baixa junto.
// v34 (15/10/2026): v7.10 — o módulo checkin-infantil.js (Check-in infantil com cadeia de custódia: tela da sala, etiqueta e recibo com o código de retirada) entra na casca; index.html, script.js, meus-dados.js e style.css mudaram junto.
// v35 (21/10/2026): v7.11 — cuidado pastoral: o módulo cuidado-pastoral.js (fila com responsável, prazo e escada; notas pastorais com sigilo; pedidos de oração com moderação e sinal de risco; boletim e painel) entra na casca; index.html, script.js, meus-dados.js e style.css mudaram junto.
// v36 (21/10/2026): v7.11.1 — o pedido do mural de oração do site aparece na aba Pedidos de oração do nível geral (cuidado-pastoral.js mudou): a casca nova baixa junto.
// v37 (22/10/2026): v7.12 — comunicação: o módulo comunicacao.js (Meu Painel → Comunicações e a aba Comunicados) entra na casca; index.html, script.js, meus-dados.js e style.css mudaram junto.
// v38 (23/10/2026): v7.14 — identidade visual: o módulo identidade-visual.js (Meu Painel → Identidade Visual e a aba Identidade Visual) entra na casca; Meu Painel ganhou
// Votações (enquetes.js); index.html, script.js, meus-dados.js e style.css mudaram junto.
const CACHE_NOME = "ieadespa-app-shell-v38";
const ARQUIVOS_SHELL = ["/", "/index.html", "/eventos.js", "/script.js", "/modulos/arquivos.js", "/modulos/assistencia.js", "/modulos/calendario.js", "/modulos/canais.js", "/modulos/catalogos-estrutura.js", "/modulos/checkin-infantil.js", "/modulos/comunicacao.js", "/modulos/consagracoes.js", "/modulos/cuidado-pastoral.js", "/modulos/disciplina.js", "/modulos/doacoes.js", "/modulos/ebd.js", "/modulos/enquetes.js", "/modulos/escalas.js", "/modulos/eventos-congressos.js", "/modulos/financeiro.js", "/modulos/identidade-visual.js", "/modulos/meu-painel.js", "/modulos/meus-dados.js", "/modulos/ministerio-menores.js", "/modulos/ouvidoria.js", "/modulos/permissoes.js", "/modulos/pessoas.js", "/modulos/projetos-assembleia.js", "/modulos/protecao.js", "/modulos/psc.js", "/modulos/relatorios-departamentos.js", "/modulos/reunioes.js", "/modulos/setores-tecnicos.js", "/modulos/voluntariado.js", "/style.css", "/manifest.json", "/vendor/xlsx.full.min.js", "/vendor/simplewebauthn-browser.js"];

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
  if (url.origin !== self.location.origin) return;   // fontes do Google etc.: o navegador busca direto (o fetch() do service worker cairia no connect-src 'self')
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
