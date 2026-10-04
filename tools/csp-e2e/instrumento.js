// Instrumento injetado em cada página ANTES de qualquer script dela (page.evaluateOnNewDocument — roda fora da CSP).
// Tudo aqui precisa ser autocontido: a função é serializada e executada dentro do navegador.
//  - determinismo: relógio parado (04/10/2026 12:00 de Brasília), Math.random/crypto com semente fixa, sem service worker;
//  - substitutos: window.open (janela falsa que guarda o HTML escrito e conta print()), alert/confirm/prompt, URL.createObjectURL, download por <a download>,
//    navigator.clipboard, Notification, navigator.share, window.print;
//  - registro: violações de CSP, erros, rejeições soltas, console.error, avisos (toasts), mutações do DOM, pedidos em andamento e temporizadores curtos;
//  - API simulada: resposta com "x-simulado: universal" vira o registro universal do modelo (mesmo para as duas versões);
//  - utilitários para o cobertor: lista de controles com manipulador, localizador estável, preenchimento de campos, ações, espera até acalmar, retrato da tela.
function instrumento(cfg) {
  if (window.__reg) return;
  const R = window.__reg = {};
  const agora = () => performance.now();
  const stOrig = window.setTimeout.bind(window), ctOrig = window.clearTimeout.bind(window);
  function hash(s) { s = String(s); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
  R.hash = hash;
  const norm = (s) => String(s == null ? "" : s).split(location.origin).join("ORIGEM");
  R.zerar = function () {
    R.dialogos = []; R.janelas = []; R.downloads = []; R.toasts = []; R.erros = []; R.csp = []; R.recursos = []; R.clip = []; R.notif = []; R.objetos = [];
    R.mutAdd = 0; R.mutRem = 0; R.stringTimers = 0;
  };
  R.zerar();
  R.fetchPend = 0; R.timers = new Set(); R.ultimaMut = agora(); R.ultimaAtiv = agora();

  // ---------- determinismo ----------
  const FIXO = Date.UTC(2026, 9, 4, 15, 0, 0);
  const DateOrig = Date;
  function DataFixa(...a) { if (!new.target) return new DateOrig(FIXO).toString(); return a.length ? new DateOrig(...a) : new DateOrig(FIXO); }
  DataFixa.prototype = DateOrig.prototype;
  DataFixa.now = () => FIXO; DataFixa.parse = DateOrig.parse; DataFixa.UTC = DateOrig.UTC;
  window.Date = DataFixa;
  function prng(semente) { let a = semente >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  Math.random = prng(12345);
  const rndCripto = prng(777);
  let uuidN = 0;
  try { crypto.randomUUID = function () { uuidN++; return "00000000-0000-4000-8000-" + uuidN.toString(16).padStart(12, "0"); }; } catch (_) {}
  try { crypto.getRandomValues = function (arr) { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < b.length; i++) b[i] = Math.floor(rndCripto() * 256); return arr; }; } catch (_) {}
  try { delete Navigator.prototype.serviceWorker; } catch (_) {}
  try { delete window.PushManager; } catch (_) {}

  // ---------- substitutos ----------
  window.alert = (m) => { R.dialogos.push("alert: " + norm(m)); };
  window.confirm = (m) => { R.dialogos.push("confirm: " + norm(m)); return true; };
  window.prompt = (m, v) => { R.dialogos.push("prompt: " + norm(m) + " | " + norm(v)); return "teste"; };
  window.print = () => { R.dialogos.push("print: pagina principal"); };
  window.open = function (url, alvo, recursos) {
    const j = { url: norm(url || ""), alvo: String(alvo || ""), html: "", impresso: 0, focado: 0, fechado: 0, docFechado: 0 };
    R.janelas.push(j);
    const doc = { write: (h) => { j.html += String(h); }, writeln: (h) => { j.html += String(h) + "\n"; }, close: () => { j.docFechado++; }, open: () => doc, title: "" };
    return { document: doc, focus: () => { j.focado++; }, print: () => { j.impresso++; }, close: () => { j.fechado++; }, closed: false, location: { href: "" }, opener: null };
  };
  let objN = 0;
  const objetosUrl = {};
  URL.createObjectURL = function (blob) {
    objN++;
    const id = "blob:simulado/" + objN;
    const reg = { id, tipo: blob && blob.type || "", tamanho: blob && blob.size || 0, hash: null };
    objetosUrl[id] = reg;
    R.objetos.push(reg);
    if (blob && blob.arrayBuffer) {
      R.fetchPend++;
      blob.arrayBuffer().then((buf) => { const b = new Uint8Array(buf); let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } reg.hash = h.toString(16); if (cfg.guardarBlobs) { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); reg.b64 = btoa(s); } })
        .catch(() => { reg.hash = "erro"; }).finally(() => { R.fetchPend--; R.ultimaAtiv = agora(); });
    }
    return id;
  };
  URL.revokeObjectURL = function () {};
  function registrarDownload(a) {
    if (a.__baixado) return; a.__baixado = 1;
    const href = a.getAttribute("href") || "";
    R.downloads.push({ nome: a.getAttribute("download") || "", href: href.startsWith("blob:") ? "blob" : norm(href), objeto: objetosUrl[href] || null });
  }
  const clickOrig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") || String(this.getAttribute("href") || "").startsWith("blob:")) { registrarDownload(this); return; }
    return clickOrig.call(this);
  };
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[download]") : null;
    if (a) { registrarDownload(a); e.preventDefault(); }
  }, true);
  try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { R.clip.push(norm(t)); }, readText: async () => "", write: async () => { R.clip.push("(write)"); } } }); } catch (_) {}
  try { navigator.share = async (d) => { R.dialogos.push("share: " + norm(JSON.stringify(d))); }; } catch (_) {}
  function NotificacaoFalsa(t, o) { R.notif.push(norm(t) + " | " + norm(o && o.body)); }
  NotificacaoFalsa.permission = "granted";
  NotificacaoFalsa.requestPermission = async () => "granted";
  window.Notification = NotificacaoFalsa;

  // ---------- registro ----------
  R.cspTotal = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    R.cspTotal.push(e.effectiveDirective + " " + norm(e.blockedURI) + " " + norm(e.sourceFile) + ":" + e.lineNumber);
    R.csp.push({ diretiva: e.effectiveDirective || e.violatedDirective, bloqueado: norm(e.blockedURI), amostra: String(e.sample || "").slice(0, 120), linha: e.lineNumber, fonte: norm(e.sourceFile) });
  }, true);
  window.addEventListener("error", (e) => {
    if (e instanceof ErrorEvent) R.erros.push("erro: " + norm(e.message).slice(0, 300));
    else if (e.target && e.target !== window) R.recursos.push((e.target.tagName || "?") + " " + norm(e.target.src || e.target.href || ""));
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    R.erros.push("rejeicao: " + norm(r && (r.message || r) || r).slice(0, 300));
  }, true);
  const ceOrig = console.error.bind(console);
  console.error = function (...a) {
    R.erros.push("console.error: " + norm(a.map(x => x && x.message ? x.message : (typeof x === "object" ? (() => { try { return JSON.stringify(x); } catch (_) { return String(x); } })() : String(x))).join(" ")).slice(0, 300));
    return ceOrig(...a);
  };
  const NAO_CONTA = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"]);
  const obs = new MutationObserver((lista) => {
    let conta = false;
    for (const m of lista) {
      // avisos (toasts) somem sozinhos 4,2 s depois: ficam fora da contagem e do "acalmou" (o texto deles é guardado à parte)
      if (m.target && (m.target.id === "toastContainer" || (m.target.closest && m.target.closest("#toastContainer")))) {
        for (const n of m.addedNodes) if (n.nodeType === 1 && m.target.id === "toastContainer") R.toasts.push((n.className || "").replace(/ ?toast-saindo/, "") + ": " + norm(n.textContent));
        continue;
      }
      // só elementos de conteúdo contam (script/style/link e nós de texto mudam de propósito quando o código sai do HTML para um arquivo)
      for (const n of m.addedNodes) if (n.nodeType === 1 && !NAO_CONTA.has(n.tagName)) R.mutAdd++;
      for (const n of m.removedNodes) if (n.nodeType === 1 && !NAO_CONTA.has(n.tagName)) R.mutRem++;
      conta = true;
    }
    if (conta) R.ultimaMut = agora();
  });
  obs.observe(document, { childList: true, subtree: true, characterData: true });

  // pedidos em andamento (fetch + leitura do corpo) e temporizadores curtos (até 1 s) — para saber quando a tela acalmou
  const fetchOrig = window.fetch;
  // falha de REDE no servidor de teste local (raríssima, mas com 12 abas acontece: "Failed to fetch") é do equipamento, não do app: repete o pedido
  // até 3 vezes antes de entregar o erro ao app (o servidor simulado nunca cai de propósito)
  R.retentativas = 0;
  function fetchComRetentativa(args, n) {
    return fetchOrig.apply(window, args).catch((e) => {
      if (n >= 3 || !(e instanceof TypeError)) throw e;
      R.retentativas++;
      return new Promise((ok) => stOrig(ok, 40 * (n + 1))).then(() => fetchComRetentativa(args, n + 1));
    });
  }
  window.fetch = function () {
    R.fetchPend++; R.ultimaAtiv = agora();
    const p = fetchComRetentativa(arguments, 0);
    p.then(() => {}, () => {}).then(() => { R.fetchPend--; R.ultimaAtiv = agora(); });
    return p;
  };
  function rastrear(p) { R.fetchPend++; return p.finally(() => { R.fetchPend--; R.ultimaAtiv = agora(); }); }
  const textOrig = Response.prototype.text, blobOrig = Response.prototype.blob, abOrig = Response.prototype.arrayBuffer, jsonOrig = Response.prototype.json;
  Response.prototype.text = function () { return rastrear(textOrig.call(this)); };
  Response.prototype.blob = function () { return rastrear(blobOrig.call(this)); };
  Response.prototype.arrayBuffer = function () { return rastrear(abOrig.call(this)); };
  Response.prototype.json = function () {
    if (this.headers.get("x-simulado") === "universal") { const u = this.url; return rastrear(textOrig.call(this).then(() => R.universal(u))); }
    return rastrear(jsonOrig.call(this));
  };
  // outras esperas assíncronas que a tela usa: leitura de arquivo (FileReader, Blob.arrayBuffer/text) e carga de imagem (recorte da foto)
  const blobAb = Blob.prototype.arrayBuffer, blobTxt = Blob.prototype.text;
  Blob.prototype.arrayBuffer = function () { return rastrear(blobAb.call(this)); };
  Blob.prototype.text = function () { return rastrear(blobTxt.call(this)); };
  for (const m of ["readAsDataURL", "readAsArrayBuffer", "readAsText", "readAsBinaryString"]) {
    const orig = FileReader.prototype[m];
    if (!orig) continue;
    FileReader.prototype[m] = function () {
      R.fetchPend++;
      this.addEventListener("loadend", () => { stOrig(() => { R.fetchPend--; R.ultimaAtiv = agora(); }, 0); }, { once: true });
      return orig.apply(this, arguments);
    };
  }
  const descSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true, enumerable: descSrc.enumerable, get: descSrc.get,
    set: function (v) {
      descSrc.set.call(this, v);
      if (this.isConnected || !this.complete) {
        if (this.complete) return;
        R.fetchPend++;
        let feito = false;
        const fim = () => { if (feito) return; feito = true; stOrig(() => { R.fetchPend--; R.ultimaAtiv = agora(); }, 0); };
        this.addEventListener("load", fim, { once: true });
        this.addEventListener("error", fim, { once: true });
        stOrig(fim, 3000); // imagem que nunca termina não segura a espera para sempre
      }
    }
  });
  window.setTimeout = function (fn, ms, ...a) {
    if (typeof fn !== "function") { R.stringTimers++; return stOrig(fn, ms, ...a); }
    let id;
    const curto = (Number(ms) || 0) <= 1000;
    const emb = function () { R.timers.delete(id); return fn.apply(this, arguments); };
    id = stOrig(emb, ms, ...a);
    if (curto) R.timers.add(id);
    return id;
  };
  window.clearTimeout = function (id) { R.timers.delete(id); return ctOrig(id); };

  // ---------- API simulada: registro universal ----------
  const M = cfg.modelo;
  const PROIBIDOS = new Set(["then", "catch", "finally", "constructor", "prototype", "__proto__", "toString", "toJSON", "valueOf", "toLocaleString", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "length", "json", "text", "blob", "clone", "ok", "status", "headers", "style", "classList", "innerHTML", "outerHTML", "textContent", "innerText", "value", "checked", "files", "dataset", "children", "parentElement", "parentNode", "firstChild", "lastChild", "nextSibling", "previousSibling", "nodeType", "tagName", "nodeName", "key", "target", "currentTarget", "options", "selectedIndex", "selectedOptions", "disabled", "hidden", "name", "type", "src", "href", "display", "readable", "message", "stack", "id"]);
  for (const nome of Object.getOwnPropertyNames(Array.prototype).concat(Object.getOwnPropertyNames(Object.prototype), Object.getOwnPropertyNames(String.prototype), Object.getOwnPropertyNames(Function.prototype), Object.getOwnPropertyNames(Promise.prototype))) PROIBIDOS.add(nome);
  // nomes que também são campos legítimos de resposta (status de uma saída, nome de uma pessoa...): entram no registro
  for (const nome of ["id", "name", "status", "type", "key", "value", "message", "target", "display", "src", "href", "options", "checked", "disabled", "hidden"]) PROIBIDOS.delete(nome);
  const LISTAS = new Set(M.listas);
  const OBJETOS = new Set(M.objetos || []);
  const NUMEROS = new Set(M.numeros || []);
  const ROTAS = (M.rotas || []).map(r => ({ re: new RegExp("^" + r.rota.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+") + "$"), literais: r.literais }));
  const RE_BOOL = /^(eh|tem|pode|precisa|ja|foi|esta|deve|possui|exige|is|has|bloqueia)[A-Z_]|^(lid[ao]|ativ[ao]|encerrad[ao]|atrasad[ao]|vencid[ao]|bloquead[ao]|aprovad[ao]|confirmad[ao]|cancelad[ao]|urgente|sigilos[ao]|secret[ao]|vinculante|habilitad[ao]|obrigatori[ao]|revogad[ao]|homologad[ao]|concluid[ao]|selecionad[ao]|marcad[ao]|presente|abert[ao]|fechad[ao]|valid[ao]|visivel|publicad[ao]|inativ[ao]|arquivad[ao]|excluid[ao]|lida|lido|sensivel|padrao|opcional|anonim[ao]|faltaJustificada|escalonadoNivel|automatic[ao])$/;
  const RE_DIA = /^(data|dt)([A-Z_]|$)|Data$|Nascimento$|^nascimento|Vencimento$|^vencimento|Validade$|^validade|^validoAte$|Ate$|^prazo$|Prazo$|^inicio$|^fim$|Inicio$|Fim$|^dia$/;
  const RE_MOMENTO = /(Em|At)$|^em$|^quando$|^momento|^instante|^timestamp/;
  const RE_HORA = /^hora|Hora$|^horario|Horario$/;
  const RE_NUM = /^(total|quantidade|qtd|saldo|percentual|score|posicao|dias|valor|pontos|ordem|numero|count|media|soma|vagas|limite|minimo|maximo|capacidade|idade|peso|nota|meta|taxa|indice|aliquota|km|consumo|preco|custo|superavit|deficit|progresso|duracao|semanas|meses|horas|minutos|parcelas|naoLidas|ano|mes|versao|nivelNumero|similaridade|frequencia|presentes|ausentes|faltas|inscritos|participantes|sequencia|rodada|turno|bruto|liquido|desconto|montante)/i;
  const RE_NUM_FIM = /(Total|Valor|Quantidade|Qtd|Percentual|Dias|Pontos|Numero|Saldo|Media|Count|Vagas|Idade|Nota|Ordem|Posicao|Meses|Horas|Ano|Mes|Bruto|Liquido|Pct|Porcentagem|Minimo|Maximo|Limite|Previsto|Realizado|Orcado|Gasto|Recebido|Pago|Devido)$/;
  const RE_URL = /url|Url|link|Link|href|Href|^caminho|Caminho$/;
  const tipo = {};
  for (const p of M.props) {
    if (PROIBIDOS.has(p)) continue;
    if (p === "sucesso") tipo[p] = ["fixo", true];
    else if (p === "mensagem") tipo[p] = ["fixo", "Operação simulada concluída."];
    else if (p === "token") tipo[p] = ["fixo", "tok-simulado"];
    else if (LISTAS.has(p)) tipo[p] = ["lista"];
    else if (M.literais[p] && M.literais[p].length) tipo[p] = ["literal", M.literais[p]];
    else if (/Ids$/.test(p)) tipo[p] = ["ids"];
    else if (/^id$|Id$|ID$/.test(p)) tipo[p] = ["id"];
    else if (OBJETOS.has(p) && !RE_DIA.test(p) && !RE_MOMENTO.test(p)) tipo[p] = ["objeto"];
    else if (NUMEROS.has(p)) tipo[p] = [/valor|saldo|preco|custo|montante|bruto|liquido|Valor|Saldo|liberado|Arrecadado|Recebido|Comprovado/.test(p) ? "dinheiro" : "num"];
    else if (RE_BOOL.test(p)) tipo[p] = ["bool"];
    else if (RE_HORA.test(p)) tipo[p] = ["hora"];
    else if (RE_MOMENTO.test(p) && !RE_NUM.test(p)) tipo[p] = ["momento"];
    else if (RE_DIA.test(p)) tipo[p] = ["dia"];
    else if (RE_URL.test(p)) tipo[p] = ["url"];
    else if (/email/i.test(p)) tipo[p] = ["email"];
    else if (/telefone|celular|whatsapp/i.test(p)) tipo[p] = ["telefone"];
    else if (/^cpf$|Cpf$/.test(p)) tipo[p] = ["fixo", "000.000.000-00"];
    else if (/^(ano)$/i.test(p) || /Ano$/.test(p)) tipo[p] = ["fixo", 2026];
    else if (/^(mes)$/i.test(p) || /Mes$/.test(p)) tipo[p] = ["fixo", 9];
    else if (RE_NUM.test(p) || RE_NUM_FIM.test(p)) tipo[p] = [/valor|saldo|preco|custo|montante|bruto|liquido|Valor|Saldo/.test(p) ? "dinheiro" : "num"];
    else if (OBJETOS.has(p)) tipo[p] = ["objeto"];
    else tipo[p] = ["texto"];
  }
  const ROT = (p, v) => p.charAt(0).toUpperCase() + p.slice(1) + " " + "ABCDE"[v];
  // campo lido ora como objeto (x.campo.sub), ora como texto/número (`${x.campo}`): herda os campos do registro de baixo e vira texto ao ser exibido/enviado
  function objetoCamaleao(base, p, v) {
    const o = Object.create(base);
    const rot = ROT(p, v);
    Object.defineProperty(o, "toString", { value: () => rot, enumerable: false });
    Object.defineProperty(o, "toJSON", { value: () => rot, enumerable: false });
    Object.defineProperty(o, Symbol.toPrimitive, { value: (dica) => (dica === "number" ? [3, 2, 5, 1][v] : rot), enumerable: false });
    return o;
  }
  function lista(itens) { return Object.assign(itens.slice(), itens[0]); }
  const NUM = [3, 2, 5, 1, 4], DIN = [1500.5, 80.25, 0, 12, 300];
  // v = variante 0..3 (a linha da lista); lit = textos comparados pela tela que chamou esta rota (senão, os do arquivo inteiro)
  function registro(v, L, filhos, lit) {
    const o = {};
    const par = v % 2;
    for (const p in tipo) {
      const t = tipo[p];
      switch (t[0]) {
        case "fixo": o[p] = t[1]; break;
        case "lista": o[p] = L || []; break;
        case "objeto": o[p] = filhos ? objetoCamaleao(filhos[v % filhos.length], p, v) : ROT(p, v); break;
        case "literal": { const l = (lit && lit[p]) || t[1]; o[p] = l[v % l.length]; break; }
        case "ids": o[p] = [101, 102]; break;
        case "id": o[p] = 101 + v; break;
        case "bool": o[p] = par === 0; break;
        case "hora": o[p] = par ? "08:00" : "19:30"; break;
        case "momento": o[p] = par ? "2026-09-16T11:00:00.000Z" : "2026-09-15T22:30:00.000Z"; break;
        case "dia": o[p] = par ? "2026-09-16" : "2026-09-15"; break;
        case "url": o[p] = "/api/simulado/arquivo-" + (101 + v) + ".pdf"; break;
        case "email": o[p] = "pessoa" + "abcde"[v] + "@exemplo.org"; break;
        case "telefone": o[p] = "(94) 99999-000" + v; break;
        case "dinheiro": o[p] = DIN[v]; break;
        case "num": o[p] = NUM[v]; break;
        default: o[p] = ROT(p, v);
      }
    }
    Object.defineProperty(o, "toString", { value: function () { return this.nome || this.titulo || "Registro " + "ABCDE"[v]; }, enumerable: false });
    return o;
  }
  // literais por rota (a tela que chama esta rota testa estes estados): junta os de todas as rotas do modelo que casam com o caminho
  function literaisDaRota(url) {
    let caminho = "";
    try { caminho = new URL(url, location.href).pathname.replace(/^\/api/, ""); } catch (_) { return null; }
    let lit = null;
    for (const r of ROTAS) if (r.re.test(caminho)) { lit = lit || {}; for (const [k, vs] of Object.entries(r.literais)) { lit[k] = lit[k] || []; for (const x of vs) if (!lit[k].includes(x)) lit[k].push(x); } }
    return lit;
  }
  R.universal = function (url) {
    // 3 níveis: a resposta é lista E objeto ao mesmo tempo (4 linhas, com os campos da 1ª no próprio array); listas internas com 3 e 2 linhas; a 3ª camada com listas vazias
    const lit = literaisDaRota(url || "");
    // tela de detalhe (/saidas/103): a linha 103 da lista vira o objeto da resposta — cada linha clicada abre o detalhe num estado diferente
    let k = 0;
    const m = /\/(10[1-5])(?:[/?]|$)/.exec(String(url || "").replace(/^[a-z]+:\/\/[^/]+/i, ""));
    if (m) k = Number(m[1]) - 101;
    const n2 = [0, 1].map(v => registro(v, null, null, lit));
    const L2 = lista(n2);
    const n1 = [0, 1, 2].map(v => registro(v, L2, n2, lit));
    const L1 = lista(n1);
    return lista([0, 1, 2, 3, 4].map(i => registro((i + k) % 5, L1, n1, lit)));
  };

  // ---------- utilitários do cobertor ----------
  const EVENTOS = ["click", "submit", "change", "input", "keydown", "keyup", "blur", "focus"];
  function rotulo(el) {
    if (el.id) return "#" + el.id;
    const t = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
    if (t) return t.slice(0, 60);
    if (el.tagName === "FORM") { const b = el.querySelector("button[type=submit],button:not([type]),input[type=submit]"); const ids = [...el.querySelectorAll("[id]")].slice(0, 2).map(x => x.id).join(","); return ("form[" + ids + "] " + (b ? (b.innerText || b.value || "") : "")).replace(/\s+/g, " ").trim().slice(0, 60); }
    if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return ((el.getAttribute("name") || el.getAttribute("placeholder") || "") + "|" + (el.type || "")).slice(0, 60);
    const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return txt.slice(0, 60) || ("(" + (el.className || "sem-texto") + ")").slice(0, 60);
  }
  function manipuladores(el) {
    const ev = {}; let fonte = null;
    for (const a of el.attributes) {
      const n = a.name;
      if (/^on[a-z]+$/.test(n)) { ev[n.slice(2)] = a.value; fonte = "attr"; }
      else if (/^data-on-[a-z]+$/.test(n)) { const e = n.slice(8); ev[e] = a.value + (el.hasAttribute("data-args-" + e) ? " " + el.getAttribute("data-args-" + e) : ""); fonte = fonte || "data"; }
    }
    // versão nova: data-stop / data-prevent sozinhos equivalem ao antigo onclick="event.stopPropagation()" / onsubmit="return false"
    for (const marca of ["data-stop", "data-prevent"]) {
      if (!el.hasAttribute(marca)) continue;
      for (const e of el.getAttribute(marca).split(/\s+/).filter(Boolean)) if (!(e in ev)) { ev[e] = "(" + marca + ")"; fonte = fonte || "data"; }
    }
    if (!fonte) for (const e of ["click", "change", "input", "submit", "keydown"]) if (typeof el["on" + e] === "function") { ev[e] = "(propriedade)"; fonte = "prop"; }
    return fonte ? { fonte, ev } : null;
  }
  function visivel(el) {
    if (el.tagName === "INPUT" && el.type === "file") return !!(el.parentElement && el.parentElement.checkVisibility && el.parentElement.checkVisibility({ checkVisibilityCSS: true }));
    if (!el.checkVisibility || !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false })) return false;
    return el.getClientRects().length > 0;
  }
  const INTERATIVOS = "button,a,input,select,textarea,form,[role=button],[tabindex]";
  // candidatos: elementos interativos por natureza OU com manipulador (de qualquer forma); visíveis; o ordinal conta entre iguais (tag + rótulo) na ordem do DOM
  function candidatos() {
    // blocos <details> recolhidos ("➕ Cadastrar turma"): abre todos, como quem clica no resumo — o conteúdo entra na exploração
    for (const d of document.querySelectorAll("details:not([open])")) d.open = true;
    const lista = [];
    const vistos = new Set();
    for (const el of document.querySelectorAll("*")) {
      const m = manipuladores(el);
      if (!m && !el.matches(INTERATIVOS)) continue;
      if (vistos.has(el)) continue; vistos.add(el);
      if (!visivel(el)) continue;
      lista.push({ el, m });
    }
    const cont = {};
    for (const c of lista) {
      c.tag = c.el.tagName.toLowerCase();
      c.rotulo = rotulo(c.el);
      const k = c.tag + "|" + c.rotulo;
      c.ord = cont[k] = (cont[k] === undefined ? 0 : cont[k] + 1);
    }
    return lista;
  }
  R.controles = function () {
    return candidatos().filter(c => c.m).map(c => ({
      tag: c.tag, rotulo: c.rotulo, ord: c.ord, fonte: c.m.fonte, eventos: Object.keys(c.m.ev).sort(), codigo: c.m.ev,
      tipo: c.el.type || "", desabilitado: !!(c.el.matches(":disabled") || c.el.getAttribute("aria-disabled") === "true")
    }));
  };
  R.localizar = function (alvo) {
    for (const c of candidatos()) if (c.tag === alvo.tag && c.rotulo === alvo.rotulo && c.ord === alvo.ord) return c.el;
    return null;
  };
  R.manipuladorDe = function (alvo) { const el = R.localizar(alvo); if (!el) return null; const m = manipuladores(el); return m ? { fonte: m.fonte, eventos: Object.keys(m.ev).sort() } : { fonte: "nenhum", eventos: [] }; };

  // valores de teste por tipo de campo
  function valorTeste(el) {
    const t = (el.type || "").toLowerCase();
    const nome = (el.id + " " + (el.getAttribute("name") || "") + " " + (el.getAttribute("placeholder") || "")).toLowerCase();
    if (t === "number") {
      const min = el.getAttribute("min"), max = el.getAttribute("max");
      let v = /ano/.test(nome) ? 2026 : /mes\b|mês/.test(nome) ? 10 : 12;
      if (min !== null && min !== "" && v < Number(min)) v = Number(min);
      if (max !== null && max !== "" && v > Number(max)) v = Number(max);
      return String(v);
    }
    if (t === "date") return "2026-10-04";
    if (t === "datetime-local") return "2026-10-04T19:30";
    if (t === "time") return "19:30";
    if (t === "month") return "2026-10";
    if (t === "week") return "2026-W40";
    if (t === "email") return "teste@exemplo.org";
    if (t === "tel") return "94999990000";
    if (t === "url") return "https://exemplo.org/teste";
    if (t === "color" || t === "range") return null;
    const ml = Number(el.getAttribute("maxlength")) || 0;
    if (t === "password") return ml === 4 || el.getAttribute("inputmode") === "numeric" ? "1234" : "Senha-simulada-1";
    let v;
    if (el.getAttribute("inputmode") === "numeric") v = ml === 6 ? "123456" : "1234";
    else if (/matr[ií]cula|membro|\bid\b|id$|numero|número/.test(nome)) v = "12";
    else if (/cpf/.test(nome)) v = "52998224725";
    else if (/cnpj/.test(nome)) v = "11222333000181";
    else if (/cep/.test(nome)) v = "68515000";
    else if (/e-?mail/.test(nome)) v = "teste@exemplo.org";
    else if (/telefone|celular|whats/.test(nome)) v = "94999990000";
    else if (/valor|pre[cç]o|quantia|montante|saldo/.test(nome)) v = "150";
    else if (/\bano\b|ano$/.test(nome)) v = "2026";
    else if (/hora/.test(nome)) v = "19:30";
    else if (/c[oó]digo/.test(nome)) v = "ABCD1234EFGH5678";
    else v = "Teste";
    if (ml && v.length > ml) v = v.slice(0, ml);
    return v;
  }
  function ajustarPadrao(el) {
    if (!el.getAttribute("pattern") || el.checkValidity()) return;
    for (const c of ["1234", "123456", "12", "2026", "Teste", "ABCD1234EFGH5678", "teste@exemplo.org", "12345678", "AB12"]) { el.value = c; if (el.checkValidity()) return; }
  }
  // preenche (sem disparar eventos) os campos visíveis e vazios; devolve os campos de arquivo vazios para o cobertor anexar um arquivo
  R.preencher = function () {
    for (const d of document.querySelectorAll("details:not([open])")) d.open = true;
    const arquivos = [];
    for (const el of document.querySelectorAll("input,select,textarea")) {
      if (!visivel(el) || el.disabled || el.readOnly) continue;
      const t = (el.type || "").toLowerCase();
      if (["checkbox", "radio", "button", "submit", "reset", "hidden", "image"].includes(t)) continue;
      if (t === "file") { if (!el.files || el.files.length === 0) { const c = candidatos().find(x => x.el === el); if (c) arquivos.push({ tag: c.tag, rotulo: c.rotulo, ord: c.ord, accept: el.getAttribute("accept") || "", id: el.id }); } continue; }
      if (el.tagName === "SELECT") {
        if (el.value === "" ) { const op = [...el.options].find(o => o.value !== "" && !o.disabled); if (op) el.value = op.value; }
        continue;
      }
      if (el.value !== "") continue;
      const v = valorTeste(el);
      if (v === null) continue;
      el.value = v;
      ajustarPadrao(el);
    }
    return arquivos;
  };
  function disparar(el, tipo) { el.dispatchEvent(new Event(tipo, { bubbles: true, cancelable: true })); }
  // executa a ação no alvo; arquivo é tratado pelo cobertor (uploadFile)
  R.agir = function (alvo, evento) {
    const el = R.localizar(alvo);
    if (!el) return { achado: false };
    const info = { achado: true };
    if (evento === "click") el.click();
    else if (evento === "submit") {
      const form = el.tagName === "FORM" ? el : el.closest("form");
      if (!form) { disparar(el, "submit"); return info; }
      info.valido = form.checkValidity();
      if (!info.valido) form.noValidate = true;
      form.requestSubmit();
    } else if (evento === "change" || evento === "input") {
      const t = (el.type || "").toLowerCase();
      if (t === "checkbox" || t === "radio") el.click();
      else if (el.tagName === "SELECT") {
        const ops = [...el.options];
        if (ops.length) {
          let i = (el.selectedIndex + 1) % ops.length;
          for (let k = 0; k < ops.length && (ops[i].disabled || (ops[i].value === "" && ops.length > 1)); k++) i = (i + 1) % ops.length;
          el.selectedIndex = i;
        }
        disparar(el, "input"); disparar(el, "change");
      } else {
        const v = valorTeste(el);
        el.value = v === null ? el.value : (el.value === v ? v + (el.type === "number" ? "" : "1") : v);
        ajustarPadrao(el);
        if (evento === "input") disparar(el, "input"); else { disparar(el, "input"); disparar(el, "change"); }
      }
    } else if (evento === "keydown" || evento === "keyup") {
      el.dispatchEvent(new KeyboardEvent(evento, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    } else if (evento === "blur" || evento === "focus") {
      disparar(el, evento);
    } else disparar(el, evento);
    return info;
  };
  // confirmação dentro do app (modal próprio com #modalConfirmar): preenche o texto pedido e confirma
  R.confirmarModal = function () {
    const ov = document.getElementById("modalOverlay");
    const bt = document.getElementById("modalConfirmar");
    if (!ov || ov.classList.contains("escondido") || !bt || !visivel(bt)) return null;
    const txt = document.getElementById("modalCaixa").innerText.replace(/\s+/g, " ").trim().slice(0, 300);
    const campo = document.getElementById("modalTexto");
    if (campo && !campo.value) campo.value = "Texto de teste";
    for (const cb of document.querySelectorAll("#modalCaixa input[type=checkbox]")) if (!cb.checked && cb.id === "checkTermoLido") { cb.click(); }
    if (bt.disabled) return null;
    bt.click();
    return norm(txt);
  };
  // espera a tela acalmar: nenhum pedido/leitura em andamento, nenhum temporizador curto pendente, DOM parado
  R.esperarCalmo = function (maxMs, quietoMs) {
    maxMs = maxMs || 8000; quietoMs = quietoMs || 100;
    const ini = agora();
    return new Promise((ok) => {
      (function checar() {
        const t = agora();
        // o início da espera conta como atividade: o observador de mutações só roda depois da tarefa atual (sem isso, um clique que acabou de
        // mexer no DOM pareceria "calmo" na primeira olhada)
        const calmo = document.readyState === "complete" && R.fetchPend <= 0 && R.timers.size === 0 && t - Math.max(R.ultimaMut, ini) >= quietoMs && t - R.ultimaAtiv >= 30;
        if (calmo) return ok({ ms: Math.round(t - ini), estavel: true });
        if (t - ini > maxMs) return ok({ ms: Math.round(t - ini), estavel: false, fetchPend: R.fetchPend, timers: R.timers.size });
        stOrig(checar, 10);
      })();
    });
  };
  // passo inteiro numa ida só (menos idas e voltas com o navegador): preenche, age, espera acalmar, confirma modais de confirmação
  // devolve { arquivos } sem agir quando há campo de arquivo vazio (o cobertor anexa e chama de novo com pularPreencher)
  R.passoInteiro = async function (alvo, evento, pularPreencher, maxMs) {
    if (!pularPreencher) { const arquivos = R.preencher(); if (arquivos.length) return { arquivos }; }
    const info = R.agir(alvo, evento);
    if (!info.achado) return info;
    let instavel = 0;
    if (!(await R.esperarCalmo(maxMs, 60)).estavel) instavel++;
    info.confirmacoes = [];
    for (let k = 0; k < 3; k++) {
      const t = R.confirmarModal();
      if (t === null) break;
      info.confirmacoes.push(t);
      if (!(await R.esperarCalmo(maxMs, 60)).estavel) instavel++;
    }
    info.instavel = instavel;
    return info;
  };
  // retrato da tela: texto visível (sem os avisos, que vêm à parte), modal, título, contagens
  R.retrato = function () {
    for (const d of document.querySelectorAll("details:not([open])")) d.open = true;
    const partes = [];
    // innerText de elemento escondido devolve o texto cru: só entram os blocos de topo visíveis
    for (const c of document.body.children) { if (c.id === "toastContainer" || c.tagName === "SCRIPT" || !visivel(c)) continue; partes.push(c.innerText || ""); }
    const texto = norm(partes.join("\n").replace(/[ \t]+/g, " ").replace(/ *\n[\s]*/g, "\n").trim());
    const ov = document.getElementById("modalOverlay");
    const modalAberto = !!(ov && !ov.classList.contains("escondido"));
    const modal = modalAberto ? norm(document.getElementById("modalCaixa").innerText.replace(/\s+/g, " ").trim()) : null;
    const tit = document.getElementById("tituloModulo");
    let comManip = 0;
    for (const el of document.querySelectorAll("*")) if (manipuladores(el) && visivel(el)) comManip++;
    return {
      texto, modal, titulo: tit ? tit.textContent : null, url: norm(location.href),
      contagens: { comManipulador: comManip, botoes: document.querySelectorAll("button").length, campos: document.querySelectorAll("input,select,textarea").length, linhas: document.querySelectorAll("tr").length, nos: document.querySelectorAll("body *:not(script):not(style):not(link):not(meta):not(noscript):not(template)").length }
    };
  };
  R.coletar = function () {
    return {
      dialogos: R.dialogos.slice(), toasts: R.toasts.slice(), erros: R.erros.slice(), csp: R.csp.slice(), recursos: R.recursos.slice(), clip: R.clip.slice(), notif: R.notif.slice(),
      janelas: R.janelas.map(j => ({ url: j.url, alvo: j.alvo, hash: hash(norm(j.html)), tamanho: j.html.length, impresso: j.impresso, docFechado: j.docFechado, temInline: /<script|\son[a-z]+\s*=/i.test(j.html), inicio: norm(j.html).replace(/\s+/g, " ").slice(0, 160) })),
      downloads: R.downloads.map(d => ({ nome: d.nome, href: d.href, tipo: d.objeto ? d.objeto.tipo : null, tamanho: d.objeto ? d.objeto.tamanho : null, hash: d.objeto ? d.objeto.hash : null })),
      objetos: R.objetos.map(o => (o.b64 ? { tipo: o.tipo, tamanho: o.tamanho, hash: o.hash, b64: o.b64 } : { tipo: o.tipo, tamanho: o.tamanho, hash: o.hash })),
      mutacoes: { adicionados: R.mutAdd, removidos: R.mutRem }, stringTimers: R.stringTimers, retentativas: R.retentativas
    };
  };
  R.htmlJanela = function (i) { return R.janelas[i] ? norm(R.janelas[i].html) : null; };
  // entrada pelo formulário de verdade (sem chamar função do app direto)
  R.passoLogin = function (etapa, matricula, segredo) {
    if (etapa === 1) { const a = [...document.querySelectorAll("a")].find(x => /Acessar meu Painel/.test(x.textContent) && visivel(x)); if (!a) return false; a.click(); return true; }
    const m = document.getElementById("matriculaPainel"), s = document.getElementById("senhaPainel");
    if (!m || !s || !visivel(m)) return false;
    m.value = matricula; s.value = segredo;
    m.closest("form").requestSubmit();
    return true;
  };
}
module.exports = { instrumento };
