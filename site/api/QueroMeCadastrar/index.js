const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

/*
 * FASE 10 (20/11/2026) — o "Quero me cadastrar" do site (desenho aprovado r10-site, "Formulário ao lado do convite").
 *
 * O navegador do visitante fala só com o site; esta função repassa ao sistema, SERVIDOR A SERVIDOR, com a chave combinada
 * CHAVE_SITE_SISTEMA no cabeçalho x-site-key (o mesmo padrão do mural de oração):
 *   GET  /api/quero-me-cadastrar  -> as congregações ativas e a versão do consentimento (guardadas 10 minutos aqui, para não gastar o
 *                                   limite do sistema, que conta por servidor do site);
 *   POST /api/quero-me-cadastrar  -> o pré-cadastro, que cai na mesma esteira da secretaria (o sistema confere tudo; aqui só o formato).
 *
 * PARA ONDE VAI: o site de produção fala com o sistema de produção; a PRÉVIA do site (o preview de um pull request) fala com a
 * homologação do sistema. Se o endereço não for nenhum dos dois conhecidos, FALHA FECHADA (503): uma prévia nunca grava gente na
 * produção por engano.
 * A resposta de um envio válido é sempre a mesma ("recebemos"), quer a pessoa já tenha ficha, quer não (o sistema garante isso).
 */
const SISTEMA = {
  producao: "https://app.ieadespa.org.br/api",
  homologacao: "https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net/api",
};
const CAMPOS = ["nome", "cpf", "email", "telefone", "dataNascimento", "sexo", "estadoCivil"];
const GUARDA_MS = 10 * 60 * 1000;
let guardado = { em: 0, alvo: null, dados: null };

function cabecalho(req, nome) {
  const h = req.headers || {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === nome);
  const v = k ? h[k] : null;
  return v == null ? "" : String(Array.isArray(v) ? v[0] : v);
}

/** "producao", "homologacao" ou null (desconhecido: não repassa). */
function ambienteDoPedido(req) {
  const hosts = [cabecalho(req, "x-ms-original-url"), cabecalho(req, "x-forwarded-host"), cabecalho(req, "host")]
    .map((v) => v.replace(/^https?:\/\//i, "").split(/[/:,\s]/)[0].toLowerCase())
    .filter(Boolean);
  // qualquer sinal de prévia vence: mandar à homologação por engano não faz mal; mandar à produção, sim
  if (hosts.some((h) => /^salmon-bay-0efd06d0f-\d+\.[a-z0-9]+\.\d+\.azurestaticapps\.net$/.test(h))) return "homologacao";
  if (hosts.some((h) => h === "ieadespa.org.br" || h === "www.ieadespa.org.br" || /^salmon-bay-0efd06d0f\.\d+\.azurestaticapps\.net$/.test(h))) return "producao";
  return null;
}

async function chamarSistema(alvo, metodo, corpo, prazoMs) {
  const r = await fetch(`${SISTEMA[alvo]}/pre-cadastro-site`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-site-key": process.env.CHAVE_SITE_SISTEMA },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(prazoMs),
  });
  let dados = null;
  try { dados = await r.json(); } catch { dados = null; }
  return { status: r.status, dados };
}

module.exports = async function (context, req) {
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
  const foraDoAr = (msg) => responder(503, { sucesso: false, mensagem: msg || "Não conseguimos falar com a secretaria agora. Tente de novo em alguns minutos." });

  if (!process.env.CHAVE_SITE_SISTEMA) { context.log.warn("[QueroMeCadastrar] CHAVE_SITE_SISTEMA ausente: o cadastro do site está desligado."); return foraDoAr(); }
  const alvo = ambienteDoPedido(req);
  if (!alvo) { context.log.warn("[QueroMeCadastrar] endereço desconhecido: não repassa (falha fechada)."); return foraDoAr(); }
  const ip = ipDoPedido(req);

  if (req.method === "GET") {
    if (!permitir(`cadastro-lista:${ip}`, 30)) return responder(429, { sucesso: false, mensagem: "Muitas tentativas. Aguarde um pouco." });
    if (guardado.dados && guardado.alvo === alvo && Date.now() - guardado.em < GUARDA_MS) return responder(200, { ...guardado.dados, ambiente: alvo });
    try {
      const s = await chamarSistema(alvo, "GET", null, 30000);
      if (s.status !== 200 || !s.dados || !Array.isArray(s.dados.congregacoes)) {
        context.log.warn(`[QueroMeCadastrar] o sistema respondeu ${s.status} à lista de congregações.`);
        return foraDoAr();
      }
      const dados = {
        sucesso: true,
        consentimento: { versao: String((s.dados.consentimento && s.dados.consentimento.versao) || "") },
        congregacoes: s.dados.congregacoes.map((c) => ({ congregacaoId: Number(c.congregacaoId), nome: String(c.nome || ""), area: c.area ? String(c.area) : null })),
      };
      guardado = { em: Date.now(), alvo, dados };
      return responder(200, { ...dados, ambiente: alvo });
    } catch (e) {
      context.log.warn("[QueroMeCadastrar] lista:", e.message);
      return foraDoAr("O cadastro está acordando. Tente de novo em 1 minuto.");
    }
  }

  if (req.method !== "POST") return responder(405, { sucesso: false, mensagem: "Método não suportado." });
  if (!permitir(`cadastro:${ip}`, 5)) return responder(429, { sucesso: false, mensagem: "Muitas tentativas. Aguarde um pouco." });
  const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  // armadilha para robô: campo escondido preenchido = finge que deu certo e não manda nada
  if (typeof b.site === "string" && b.site.trim() !== "") return responder(200, { sucesso: true, mensagem: "Recebemos o seu cadastro. A secretaria da congregação vai conferir e falar com você." });

  const corpo = { origemVisitante: ip.slice(0, 128) };
  for (const k of CAMPOS) {
    const v = b[k];
    if (v != null && typeof v !== "string") return responder(400, { sucesso: false, mensagem: "Envio inválido." });
    if (v != null && v.length > 200) return responder(400, { sucesso: false, mensagem: "Algum campo passou do tamanho." });
    if (v != null && v.trim() !== "") corpo[k] = v.trim();
  }
  const cong = Number(b.congregacaoId);
  if (!Number.isInteger(cong) || cong <= 0) return responder(400, { sucesso: false, mensagem: "Escolha a congregação que você frequenta." });
  corpo.congregacaoId = cong;
  const cons = b.consentimento;
  if (!cons || cons.aceito !== true || typeof cons.versao !== "string") return responder(400, { sucesso: false, mensagem: "Para enviar, marque que você concorda com o uso dos seus dados pela Igreja." });
  corpo.consentimento = { aceito: true, versao: cons.versao.slice(0, 20) };

  try {
    const s = await chamarSistema(alvo, "POST", corpo, 40000);
    const mensagem = s.dados && typeof s.dados.mensagem === "string" ? s.dados.mensagem : null;
    // 200 (recebido), 400 (só formato: o que falta ou está errado) e 429 (muitos agora) vão como o sistema disse; o resto é "fora do ar"
    if ((s.status === 200 || s.status === 400 || s.status === 429) && mensagem) return responder(s.status, { sucesso: s.status === 200, mensagem });
    if (s.status === 401) context.log.warn("[QueroMeCadastrar] o sistema recusou a chave do site (CHAVE_SITE_SISTEMA diferente nos dois aplicativos?).");
    else context.log.warn(`[QueroMeCadastrar] o sistema respondeu ${s.status} ao cadastro.`);
    return foraDoAr();
  } catch (e) {
    context.log.warn("[QueroMeCadastrar] envio:", e.message);
    return foraDoAr("O cadastro está acordando. Espere 1 minuto e envie de novo.");
  }
};

module.exports.ambienteDoPedido = ambienteDoPedido;
