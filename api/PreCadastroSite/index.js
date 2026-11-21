// PreCadastroSite (FASE 10, v10.1b passo 4, 17/11/2026) — o "Quero me cadastrar" do SITE: a própria pessoa manda o pré-cadastro, que cai na mesma fila da secretaria.
// POST /api/pre-cadastro-site   body:{ nome, cpf, email, telefone?, dataNascimento, sexo, estadoCivil, congregacaoId, consentimento:{ aceito:true, versao }, envioId,
//                                      origemVisitante? }
// GET  /api/pre-cadastro-site   -> { congregacoes: [{ congregacaoId, nome, area }], consentimento: { versao, texto } } — o que a página "Quero me cadastrar" do site
//                                  precisa para montar o formulário (FASE 10, as sobras): só as congregações ativas, sem gente nenhuma, e o texto do consentimento
//       cabeçalho x-site-key = CHAVE_SITE_SISTEMA (a mesma nos dois aplicativos do Azure)
//
// Chamada pelo site, SERVIDOR A SERVIDOR (o navegador do visitante fala só com o site). Como o mural de oração (CuidadoPastoralSite), FALHA FECHADA: sem a chave
// combinada configurada, ninguém entra (401). Regras (decisões do responsável):
//  - só o essencial, tudo obrigatório menos o telefone; o departamento NÃO é pedido; consentimento LGPD registrado (base legal e versão do texto). O TEXTO e a
//    VERSÃO saem do mesmo lugar (shared/preCadastro.js): a página mostra o texto que este GET serve e devolve a versão; só a versão atual é aceita;
//  - a resposta é SEMPRE a mesma para um envio válido ("recebemos…"), quer o CPF já exista numa ficha, quer não: o formulário público nunca revela se alguém já é da
//    Igreja (filiação religiosa é dado sensível). A repetição é tratada na fila: o pré-cadastro não entra e vai para CORREÇÃO com o cadastro mais antigo;
//  - limites: por servidor do site (memória, por instância), por visitante (o site manda um identificador; aqui fica só o hash — 3 por hora) e no total
//    (200 por hora, contados no banco: vale para todas as instâncias). A contagem e a gravação andam na MESMA transação, debaixo da trava do formulário
//    (revisão de 20/11/2026: separadas, uma rajada passava do limite). O erro de formato (campo que falta ou inválido) é só de forma, nunca do banco;
//  - o MESMO envio (envioId, gerado pela página) repetido devolve o mesmo resultado sem gravar de novo (revisão de 20/11/2026: o reenvio depois de um prazo
//    esgotado gravava dois pré-cadastros). Se o primeiro ficou sem avaliar, o reenvio avalia;
//  - o TEMPO da resposta também não pode revelar (revisão de 20/11/2026): o aceite automático (a ficha nova) demora mais que a correção. Toda resposta "recebemos"
//    sai num TEMPO FIXO contado da chegada (PRE_CADASTRO_SITE_MIN_MS, padrão 3.000 ms — bem acima do pior caso medido; os testes usam 0), com o processamento
//    DENTRO da chamada (no Azure Functions, trabalho deixado para depois da resposta não tem garantia de terminar). A espera pela trava do CPF tem teto no que
//    sobra desse tempo; se ainda assim o processamento passar do tempo fixo, a resposta sai no próximo múltiplo dele (nunca no tempo exato do processamento)
//    e fica um aviso no registro.
const { getPool } = require("../shared/db");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const { conferirChaveDoSite } = require("../shared/chaveSiteSistema");
const regras = require("../shared/preCadastro");
const pdb = require("../shared/preCadastroDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });
const POR_VISITANTE_HORA = 3;
const TOTAL_HORA = 200;
const FOLGA_MS = 300;   // o que se reserva, dentro do tempo fixo, para gravar o fim do processamento e responder
const tempoFixo = () => { const v = Number(process.env.PRE_CADASTRO_SITE_MIN_MS); return Number.isFinite(v) && v >= 0 ? Math.min(v, 20000) : 3000; };

// Espera até o tempo fixo (ou, se já passou, até o próximo múltiplo dele). Devolve quanto o trabalho levou e quando a resposta sai.
async function esperarOTempoFixo(inicio, fixo) {
  const passou = Date.now() - inicio;
  const alvo = fixo > 0 ? Math.max(1, Math.ceil(passou / fixo)) * fixo : 0;
  if (alvo > passou) await new Promise((r) => setTimeout(r, alvo - passou));
  return { passou, alvo };
}

module.exports = async function (context, req) {
  const inicio = Date.now();
  const res = (status, body, extra = {}) => { context.res = { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json", ...extra }, body }; };
  const chave = conferirChaveDoSite(req);
  if (!chave.exigida || !chave.ok) return res(401, { sucesso: false, mensagem: "Não autorizado." });
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) return res(429, { sucesso: false, mensagem: "Muitas chamadas seguidas." }, { "Retry-After": String(limite.retryAposSegundos) });
  if (req.method === "GET") {
    try {
      const pool = await getPool();
      const r = await pool.request().query(`SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId
        WHERE c.Ativa = 1 ORDER BY c.Nome`);
      return res(200, { sucesso: true, consentimento: { versao: regras.CONSENTIMENTO.versao, texto: regras.CONSENTIMENTO.texto },
        congregacoes: r.recordset.map((l) => ({ congregacaoId: Number(l.CongregacaoId), nome: l.Nome, area: l.Area || null })) }, { "Cache-Control": "public, max-age=600" });
    } catch (e) {
      context.log.error("[PreCadastroSite] lista:", e.message);
      return res(500, { sucesso: false, mensagem: "Erro interno." });
    }
  }
  if (req.method !== "POST") return res(405, { sucesso: false, mensagem: "Método não suportado." });
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  const lido = regras.lerEntrada(corpo, { exigirTudo: true, hojeISO: hojeBrasilia() });
  if (!lido.ok) return res(400, { sucesso: false, mensagem: lido.mensagem });
  const cons = corpo.consentimento;
  if (!cons || typeof cons !== "object" || cons.aceito !== true) return res(400, { sucesso: false, mensagem: "Para enviar, marque que você concorda com o uso dos seus dados pela Igreja." });
  if (cons.versao !== regras.CONSENTIMENTO.versao) return res(400, { sucesso: false, mensagem: "O texto do consentimento foi atualizado: recarregue a página e envie de novo." });
  if (corpo.origemVisitante != null && (typeof corpo.origemVisitante !== "string" || corpo.origemVisitante.length > 128)) return res(400, { sucesso: false, mensagem: "Envio inválido." });
  if (typeof corpo.envioId !== "string" || !pdb.ENVIO_ID.test(corpo.envioId)) return res(400, { sucesso: false, mensagem: "Envio inválido: recarregue a página e envie de novo." });

  try {
    const pool = await getPool();
    const cong = await pdb.lerCongregacao(() => pool.request(), lido.dados.congregacaoId);
    if (!cong || !cong.ativa) return res(400, { sucesso: false, mensagem: "Escolha uma congregação da lista." });
    const hash = pdb.hashOrigem(corpo.origemVisitante);
    const gravado = await pdb.inserirDoSite(pool, lido.dados, { envioId: corpo.envioId, consentimento: regras.CONSENTIMENTO, origemHash: hash,
      porVisitanteHora: POR_VISITANTE_HORA, totalHora: TOTAL_HORA });
    if (gravado.limite) return res(429, { sucesso: false, mensagem: "Recebemos muitos cadastros agora. Tente de novo daqui a pouco." }, { "Retry-After": "600" });
    const fixo = tempoFixo();
    if (!gravado.avaliado) {
      // o processamento (o aceite automático ou a fila) não muda a resposta; se falhar, o pré-cadastro já está gravado e a fila o mostra como pendente
      const esperaMaxMs = fixo > 0 ? Math.max(0, inicio + fixo - FOLGA_MS - Date.now()) : 20000;
      try { await pdb.processar(pool, gravado.id, { esperaMaxMs }); } catch (e) { context.log.error(`[PreCadastroSite] processar o pré-cadastro ${gravado.id}:`, e && e.stack ? e.stack : e); }
    }
    const { passou, alvo } = await esperarOTempoFixo(inicio, fixo);
    if (fixo > 0 && passou > fixo) context.log.warn(`[PreCadastroSite] o envio levou ${passou} ms, mais que o tempo fixo de ${fixo} ms: a resposta saiu em ${alvo} ms.`);
    return res(200, { sucesso: true, mensagem: regras.MSG.RECEBIDO });
  } catch (e) {
    context.log.error("[PreCadastroSite] erro:", e.message);
    return res(500, { sucesso: false, mensagem: "Erro interno." });
  }
};
