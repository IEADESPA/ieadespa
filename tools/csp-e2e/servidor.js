// Servidor de teste (node puro, sem dependências): serve uma pasta app/ e responde /api/* com uma API SIMULADA determinística.
// - Opcional: cabeçalho Content-Security-Policy (a política final do projeto) em todas as respostas.
// - Registra TODA chamada a /api (método, rota, corpo normalizado), separada pelo cabeçalho x-acao que o cobertor põe em cada aba.
// - Respostas: login (auth/login = líder GERAL com todas as permissões; membro/entrar = membro por PIN) e verificação de certificado têm JSON
//   explícito; as demais rotas respondem {"sucesso":true} com o cabeçalho "x-simulado: universal" — o instrumento da página troca o corpo por um
//   registro "universal" montado a partir do modelo (modelo-respostas.json: todos os campos que o front lê, listas com 2 itens, textos simples).
//   Assim as ~590 chamadas do front recebem o formato que esperam sem escrever 590 respostas à mão, e as duas versões recebem exatamente o mesmo.
// Uso direto: node servidor.js <pastaApp> <porta> [--csp]
const http = require("http");
const fs = require("fs");
const path = require("path");

const CSP_FINAL = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://ieadespaarmazenamento.blob.core.windows.net; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

function hashTexto(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

// corpo normalizado: JSON com chaves em ordem, base64 longo vira hash; origem (porta) trocada por ORIGEM
function normalizarValor(v, origem) {
  if (Array.isArray(v)) return v.map(x => normalizarValor(x, origem));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = /base64/i.test(k) && typeof v[k] === "string" ? `b64:${hashTexto(v[k])}:${v[k].length}` : normalizarValor(v[k], origem); return o; }
  if (typeof v === "string") return origem ? v.split(origem).join("ORIGEM") : v;
  return v;
}
function normalizarCorpo(bruto, origem) {
  if (!bruto) return "";
  try { return JSON.stringify(normalizarValor(JSON.parse(bruto), origem)); } catch (_) { return "texto:" + hashTexto(bruto) + ":" + bruto.length; }
}

const LOGIN_GERAL = (permissoes) => ({ sucesso: true, token: "tok-geral-simulado", nome: "Líder Geral Teste", permissoes, nivel: "GLOBAL", escopo: "TODAS", geral: true, termosPendentes: [] });
const LOGIN_MEMBRO = { sucesso: true, token: "tok-membro-simulado", nome: "Membro Teste", permissoes: [], nivel: null, escopo: null, geral: false, termosPendentes: [] };

function respostaVerificacao(codigo) {
  const base = { nome: "Maria da Silva Teste", titulo: "concluiu a trilha Formação de Professores", protocolo: "CERT-2026-000101", dataEmissao: "2026-03-10", validoAte: "2028-03-10" };
  const c = String(codigo).toUpperCase();
  if (c.startsWith("VALI")) return Object.assign({ situacao: "VALIDO" }, base);
  if (c.startsWith("VENC")) return Object.assign({ situacao: "VENCIDO" }, base, { validoAte: "2026-01-10" });
  if (c.startsWith("REVO")) return Object.assign({ situacao: "REVOGADO", revogadoEm: "2026-06-01" }, base);
  if (c.startsWith("INTE")) return { situacao: "INTEGRIDADE_FALHOU", mensagem: "O registro deste certificado não confere com a assinatura guardada." };
  return { situacao: "NAO_ENCONTRADO" };
}

function criarServidor({ raiz, csp = false, porta = 0, permissoes = [] }) {
  const chamadas = new Map(); // x-acao -> [{seq, metodo, rota, corpo}]
  let seq = 0;
  const srv = http.createServer((req, res) => {
    const acao = req.headers["x-acao"] || "-";
    const url = new URL(req.url, "http://x");
    const cabecalhos = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (csp) cabecalhos["Content-Security-Policy"] = CSP_FINAL;
    if (url.pathname.startsWith("/api/")) {
      let bruto = "";
      req.on("data", (c) => { bruto += c; });
      req.on("end", () => {
        const origem = `http://${req.headers.host}`;
        const reg = { seq: ++seq, metodo: req.method, rota: url.pathname + url.search, corpo: normalizarCorpo(bruto, origem) };
        if (!chamadas.has(acao)) chamadas.set(acao, []);
        chamadas.get(acao).push(reg);
        let corpo, universal = false;
        const r = url.pathname;
        let dados = {}; try { dados = JSON.parse(bruto || "{}"); } catch (_) {}
        // só as credenciais de teste entram (qualquer outra combinação é recusada, como no servidor de verdade)
        if (req.method === "POST" && r === "/api/auth/login") corpo = (String(dados.matricula) === "5" && dados.senha === "senha-simulada-geral") ? LOGIN_GERAL(permissoes) : { sucesso: false, mensagem: "Matrícula ou senha incorretos." };
        else if (req.method === "POST" && r === "/api/membro/entrar") corpo = (String(dados.matricula) === "20" && dados.pin === "1234") ? LOGIN_MEMBRO : { sucesso: false, mensagem: "Matrícula ou PIN incorretos." };
        else if (req.method === "POST" && r === "/api/membro/solicitar-codigo") corpo = { sucesso: true, mensagem: "Se a matrícula tiver e-mail cadastrado, o código foi enviado." };
        else if (req.method === "POST" && r === "/api/membro/confirmar-codigo") corpo = Object.assign({}, LOGIN_MEMBRO, { matricula: String(dados.matricula || "20"), precisaCriarPin: true });
        else if (req.method === "POST" && r === "/api/membro/pin") corpo = { sucesso: true, token: "tok-membro-simulado-2", mensagem: "PIN salvo." };
        else if (r.startsWith("/api/verificacao-certificado/")) corpo = respostaVerificacao(decodeURIComponent(r.split("/").pop()));
        else { corpo = { sucesso: true }; universal = true; }
        const h = Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cabecalhos);
        if (universal) h["x-simulado"] = "universal";
        res.writeHead(200, h);
        res.end(JSON.stringify(corpo));
      });
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const arq = path.normalize(path.join(raiz, rel));
    if (!arq.startsWith(path.normalize(raiz))) { res.writeHead(403, cabecalhos); res.end(); return; }
    fs.readFile(arq, (err, dados) => {
      if (err) { res.writeHead(404, Object.assign({ "Content-Type": "text/plain" }, cabecalhos)); res.end("404"); return; }
      // arquivos estáticos podem ficar no cache do contexto do trabalhador (cada rodada cria contextos novos)
      res.writeHead(200, Object.assign({ "Content-Type": TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream" }, cabecalhos, { "Cache-Control": "max-age=3600" }));
      res.end(dados);
    });
  });
  // conexões reaproveitadas por bastante tempo (o servidor não fecha uma conexão ociosa que o navegador ainda vai usar) e fila de conexões grande
  srv.keepAliveTimeout = 120000;
  srv.headersTimeout = 125000;
  return new Promise((ok) => srv.listen(porta, "127.0.0.1", 4096, () => ok({
    srv,
    porta: srv.address().port,
    url: `http://127.0.0.1:${srv.address().port}`,
    marca: () => seq,
    chamadasDe: (acao, desde = 0) => (chamadas.get(acao) || []).filter(c => c.seq > desde).map(c => ({ metodo: c.metodo, rota: c.rota, corpo: c.corpo })),
    esquecer: (acao) => chamadas.delete(acao),
    fechar: () => new Promise(r => srv.close(r))
  })));
}

module.exports = { criarServidor, CSP_FINAL, hashTexto };

if (require.main === module) {
  const [raiz, porta] = process.argv.slice(2);
  const modelo = fs.existsSync(path.join(__dirname, "modelo-respostas.json")) ? require("./modelo-respostas.json") : { permissoes: [] };
  criarServidor({ raiz: path.resolve(raiz), porta: Number(porta) || 8080, csp: process.argv.includes("--csp"), permissoes: modelo.permissoes })
    .then(s => console.log(`servindo ${raiz} em ${s.url}${process.argv.includes("--csp") ? " (com CSP)" : ""}`));
}
