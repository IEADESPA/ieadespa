// LinhaDoTempoMembro (FASE 10, v10.1b passo 2, 17/11/2026) — a linha do tempo COMPLETA da pessoa, para a secretaria e a liderança (a ficha 360).
// GET /api/pessoas/{membroId}/linha-do-tempo?pagina=1&porPagina=50
// A regra e a leitura moram em shared/linhaDoTempo.js. A rota antiga (HistoricoMembro, /historico) continua igual para a tela de hoje até as telas novas
// (passo 7) trocarem por esta.
// ESCOPO: só abre quem alcança a congregação da pessoa (shared/escopoRotas.js); fora do escopo (ou matrícula malformada) a resposta é a mesma de
// "Matrícula não encontrada". Disciplina e abandono só para quem tem a permissão "disciplina" com a pessoa no escopo DESSA permissão.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel, noEscopoDaPessoa } = require("../shared/escopoRotas");
const linha = require("../shared/linhaDoTempo");

const NAO_ENCONTRADA = { sucesso: false, mensagem: "Matrícula não encontrada." };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const membroIdBruto = context.bindingData && context.bindingData.membroId;
  if (!membroIdBruto) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }
  const pool = await getPool();
  const alcancavel = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!alcancavel) {
    context.res = { status: 200, body: NAO_ENCONTRADA };
    return;
  }
  const vDisciplina = auth.visaoDaPermissao(usuario, "disciplina");
  const disciplina = !!(vDisciplina && noEscopoDaPessoa(vDisciplina, alcancavel.congregacaoNome, alcancavel.extensaoNome));
  const fontes = await linha.lerFontes(pool, sql, alcancavel.membroId, { disciplina });
  if (!fontes.membro) {
    context.res = { status: 200, body: NAO_ENCONTRADA };
    return;
  }
  const { vidaEspiritual, eventos } = linha.montarLinhaDoTempo(fontes, { disciplina });
  const pagina = linha.paginar(eventos, (req && req.query) || {});
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { sucesso: true, membroId: alcancavel.membroId, nome: fontes.membro.Nome, vidaEspiritual, eventos: pagina.itens, total: pagina.total, pagina: pagina.pagina, porPagina: pagina.porPagina }
  };
};
