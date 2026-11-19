// PreCadastroSite (FASE 10, v10.1b passo 4, 17/11/2026) — o "Quero me cadastrar" do SITE: a própria pessoa manda o pré-cadastro, que cai na mesma fila da secretaria.
// POST /api/pre-cadastro-site   body:{ nome, cpf, email, telefone?, dataNascimento, sexo, estadoCivil, congregacaoId, consentimento:{ aceito:true, versao }, origemVisitante? }
// GET  /api/pre-cadastro-site   -> { congregacoes: [{ congregacaoId, nome, area }], consentimento: { versao } } — o que a página "Quero me cadastrar" do site precisa
//                                  para montar o formulário (FASE 10, as sobras): só as congregações ativas, sem gente nenhuma; a mesma chave do site
//       cabeçalho x-site-key = CHAVE_SITE_SISTEMA (a mesma nos dois aplicativos do Azure)
//
// Chamada pelo site, SERVIDOR A SERVIDOR (o navegador do visitante fala só com o site). Como o mural de oração (CuidadoPastoralSite), FALHA FECHADA: sem a chave
// combinada configurada, ninguém entra (401). Regras (decisões do responsável):
//  - só o essencial, tudo obrigatório menos o telefone; o departamento NÃO é pedido; consentimento LGPD registrado (base legal e versão do texto);
//  - a resposta é SEMPRE a mesma para um envio válido ("recebemos…"), quer o CPF já exista numa ficha, quer não: o formulário público nunca revela se alguém já é da
//    Igreja (filiação religiosa é dado sensível). A repetição é tratada na fila: o pré-cadastro não entra e vai para CORREÇÃO com o cadastro mais antigo;
//  - limites: por servidor do site (memória, por instância), por visitante (o site manda um identificador; aqui fica só o hash — 3 por hora) e no total
//    (200 por hora, contados no banco: vale para todas as instâncias). O erro de formato (campo que falta ou inválido) é só de forma, nunca do banco;
//  - o TEMPO da resposta também não pode revelar: o aceite automático (a ficha nova) demora mais que a correção, por isso a resposta de um envio válido sai
//    sempre depois de um tempo mínimo igual (PRE_CADASTRO_SITE_MIN_MS, padrão 1.500 ms; os testes usam 0).
const { getPool } = require("../shared/db");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const { conferirChaveDoSite } = require("../shared/chaveSiteSistema");
const regras = require("../shared/preCadastro");
const pdb = require("../shared/preCadastroDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });
const POR_VISITANTE_HORA = 3;
const TOTAL_HORA = 200;
const tempoMinimo = () => { const v = Number(process.env.PRE_CADASTRO_SITE_MIN_MS); return Number.isFinite(v) && v >= 0 ? Math.min(v, 10000) : 1500; };

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
        WHERE ISNULL(c.Ativa, 1) = 1 ORDER BY c.Nome`);
      return res(200, { sucesso: true, consentimento: { versao: regras.CONSENTIMENTO.versao },
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

  try {
    const pool = await getPool();
    const cong = await pdb.lerCongregacao(() => pool.request(), lido.dados.congregacaoId);
    if (!cong || !cong.ativa) return res(400, { sucesso: false, mensagem: "Escolha uma congregação da lista." });
    const hash = pdb.hashOrigem(corpo.origemVisitante);
    const cont = await pdb.contagemDoSite(pool, hash);
    if (cont.total >= TOTAL_HORA || (hash && cont.daOrigem >= POR_VISITANTE_HORA)) {
      return res(429, { sucesso: false, mensagem: "Recebemos muitos cadastros agora. Tente de novo daqui a pouco." }, { "Retry-After": "600" });
    }
    const id = await pdb.inserir(pool, lido.dados, { origem: "SITE", consentimento: regras.CONSENTIMENTO, origemHash: hash });
    // o processamento (o aceite automático ou a fila) não muda a resposta; se falhar, o pré-cadastro já está gravado e a fila o mostra como pendente
    try { await pdb.processar(pool, id); } catch (e) { context.log.error("[PreCadastroSite] processar:", e.message); }
    const falta = inicio + tempoMinimo() - Date.now();
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    return res(200, { sucesso: true, mensagem: regras.MSG.RECEBIDO });
  } catch (e) {
    context.log.error("[PreCadastroSite] erro:", e.message);
    return res(500, { sucesso: false, mensagem: "Erro interno." });
  }
};
