const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

/*
 * FASE 10 (20/11/2026) — o "Quero me cadastrar" do site (desenho aprovado r10-site, "Formulário ao lado do convite").
 *
 * O navegador do visitante fala só com o site; esta função repassa ao sistema, SERVIDOR A SERVIDOR, com a chave combinada
 * CHAVE_SITE_SISTEMA no cabeçalho x-site-key (o mesmo padrão do mural de oração):
 *   GET  /api/quero-me-cadastrar  -> as congregações ativas e o consentimento — o TEXTO que a página mostra e a VERSÃO que ela devolve, os dois vindos do
 *                                   sistema (21/11/2026: antes o texto morava na página) — guardados 10 minutos aqui, para não gastar o limite do sistema,
 *                                   que conta por servidor do site;
 *   POST /api/quero-me-cadastrar  -> o pré-cadastro, que cai na mesma esteira da secretaria (o sistema confere tudo; aqui só o formato). A página manda o
 *                                   identificador do envio (`envio`, 32 letras hexadecimais ao acaso, o mesmo enquanto os dados não mudam): o envio repetido
 *                                   depois de um prazo esgotado não grava dois pré-cadastros (o sistema devolve o mesmo resultado).
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
const ENVIO = /^[0-9a-f]{32}$/;
const TEXTO_MAX = 600;   // o texto do consentimento (hoje, ~100 letras)
// a trava das matrículas (409) para o VISITANTE (revisão de 23/11/2026, M3): a mensagem do sistema fala de "importação do sistema pago", palavra de dentro
const MSG_AINDA_FECHADO = "O cadastro pelo site abre em breve. Por enquanto, procure a secretaria da sua congregação.";
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
  // só o que a plataforma põe (o x-forwarded-host o visitante inventa)
  const hosts = [cabecalho(req, "x-ms-original-url"), cabecalho(req, "host")]
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
    headers: { "Content-Type": "application/json", "x-site-key": String(process.env.CHAVE_SITE_SISTEMA).trim() },
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

  if (!String(process.env.CHAVE_SITE_SISTEMA || "").trim()) { context.log.error("[QueroMeCadastrar] CHAVE_SITE_SISTEMA ausente: o cadastro do site está desligado."); return foraDoAr(); }
  const alvo = ambienteDoPedido(req);
  if (!alvo) {
    context.log.error(`[QueroMeCadastrar] endereço desconhecido, não repassa (falha fechada): x-ms-original-url=${cabecalho(req, "x-ms-original-url").slice(0, 120)} host=${cabecalho(req, "host").slice(0, 80)}`);
    return foraDoAr();
  }
  const ip = ipDoPedido(req);

  if (req.method === "GET") {
    // a cópia guardada não custa nada ao sistema: o limite só vale para quem faria o site perguntar de novo
    if (guardado.dados && guardado.alvo === alvo && Date.now() - guardado.em < GUARDA_MS) return responder(200, { ...guardado.dados, ambiente: alvo });
    if (!permitir(`cadastro-lista:${ip}`, 30)) return responder(429, { sucesso: false, mensagem: "Muita gente abrindo por esta mesma internet agora. Espere 5 minutos." });
    try {
      const s = await chamarSistema(alvo, "GET", null, 30000);
      const c = s.dados && s.dados.consentimento;
      // sem o texto e a versão do consentimento, a página não tem o que a pessoa autoriza: não monta o formulário (falha fechada)
      const consentimentoOk = c && typeof c.versao === "string" && c.versao.trim() && typeof c.texto === "string" && c.texto.trim() && c.texto.length <= TEXTO_MAX;
      if (s.status !== 200 || !s.dados || !Array.isArray(s.dados.congregacoes) || !consentimentoOk) {
        context.log.warn(`[QueroMeCadastrar] o sistema respondeu ${s.status} à lista de congregações${s.status === 200 ? " sem o consentimento completo" : ""}.`);
        return foraDoAr();
      }
      const dados = {
        sucesso: true,
        consentimento: { versao: c.versao.trim().slice(0, 20), texto: c.texto.trim() },
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
  // 20 por 5 minutos por IP: num culto, muita gente manda pelo mesmo Wi-Fi da igreja
  if (!permitir(`cadastro:${ip}`, 20)) return responder(429, { sucesso: false, mensagem: "Muita gente enviando por esta mesma internet agora. Espere 5 minutos e envie de novo." });
  const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  // armadilha para robô: campo escondido preenchido = finge que deu certo e não manda nada
  if (typeof b.site === "string" && b.site.trim() !== "") { context.log.warn("[QueroMeCadastrar] a isca de robô veio preenchida: não repassado."); return responder(200, { sucesso: true, mensagem: "Recebemos o seu cadastro. A secretaria da congregação vai conferir e falar com você." }); }

  // o visitante = o IP + o identificador do navegador (o sistema limita 3 por hora por visitante; pelo IP só, o Wi-Fi da igreja travaria no 4º)
  const navegador = typeof b.visitante === "string" && /^[A-Za-z0-9-]{8,64}$/.test(b.visitante) ? b.visitante : "";
  const corpo = { origemVisitante: `${ip}|${navegador}`.slice(0, 128) };
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
  // o identificador do envio (a página antiga, sem ele, precisa ser recarregada)
  if (typeof b.envio !== "string" || !ENVIO.test(b.envio)) return responder(400, { sucesso: false, mensagem: "A página está desatualizada: recarregue-a e envie de novo." });
  corpo.envioId = b.envio;

  try {
    const s = await chamarSistema(alvo, "POST", corpo, 40000);
    const mensagem = s.dados && typeof s.dados.mensagem === "string" ? s.dados.mensagem : null;
    // 200 (recebido), 400 (só formato: o que falta ou está errado), 409 (a trava das matrículas: ninguém se cadastra antes da importação do sistema pago,
    // decisão do responsável de 23/11/2026) e 429 (muitos agora) vão como o sistema disse (o 409 com a mensagem do visitante); o resto é "fora do ar"
    if ((s.status === 200 || s.status === 400 || s.status === 409 || s.status === 429) && mensagem) {
      // versão do consentimento trocada no sistema: a próxima leitura da página busca a nova (sem esperar os 10 minutos)
      if (s.status === 400 && /consentimento/i.test(mensagem)) guardado = { em: 0, alvo: null, dados: null };
      return responder(s.status, { sucesso: s.status === 200, mensagem: s.status === 409 ? MSG_AINDA_FECHADO : mensagem });
    }
    if (s.status === 401) context.log.error("[QueroMeCadastrar] o sistema recusou a chave do site (CHAVE_SITE_SISTEMA diferente nos dois aplicativos, ou ausente no sistema).");
    else context.log.warn(`[QueroMeCadastrar] o sistema respondeu ${s.status} ao cadastro.`);
    return foraDoAr();
  } catch (e) {
    // o prazo esgotado não quer dizer que não chegou: o sistema pode ter gravado e só demorado a responder
    if (e && e.name === "TimeoutError") { context.log.warn("[QueroMeCadastrar] envio: o sistema demorou mais de 40 s."); return foraDoAr("Pode ser que tenha chegado. Espere 1 minuto antes de enviar de novo."); }
    context.log.error("[QueroMeCadastrar] envio:", e && e.stack ? e.stack : e);
    return foraDoAr();
  }
};

module.exports.ambienteDoPedido = ambienteDoPedido;
