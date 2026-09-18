// GestaoConsolidadoDepartamental (v5.5.1 — Consolidado de Campo)
// O relatório mensal (v5.2/v5.3) responde "como foi o mês do UCADESPA na
// Congregação X"; este endpoint responde a pergunta inversa: "como está a
// Congregação X (ou a Área Y, ou o Campo inteiro) neste mês, olhando os 8
// departamentos juntos?" — o retrato eclesiástico que o Regimento pede.
// GET /api/consolidado-departamentos?nivel=congregacao|area|campo&id=&mes=&ano=&historico=N
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const cd = require("../shared/consolidadoDepartamental");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "relatorios_departamentais");
  if (!usuario) return;

  const { nivel, id, mes, ano, historico } = req.query || {};
  if (!cd.NIVEIS_VALIDOS.includes(nivel)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Informe nivel: ${cd.NIVEIS_VALIDOS.join("|")}.` } };
    return;
  }
  if (nivel !== "campo" && !id) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe id (congregacaoId ou areaId) para este nível." } };
    return;
  }
  const mesNum = Number(mes), anoNum = Number(ano);
  if (!mesNum || !anoNum) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe mes e ano." } };
    return;
  }

  const pool = await getPool();

  // Escopo: campo é restrito a quem enxerga TODAS as congregações (GLOBAL);
  // congregação/área conferem que TODA congregação do escopo pedido está
  // dentro do que o usuário pode ver — nunca uma amostra "quase toda".
  if (nivel === "campo" && usuario.escopoCongregacoes !== "TODAS") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "O consolidado de Campo é restrito a quem enxerga todas as congregações (Presidente/Secretário Geral)." } };
    return;
  }
  const congregacaoIds = await cd.resolverCongregacoesDoNivel(pool, nivel, id);
  if (usuario.escopoCongregacoes !== "TODAS") {
    let nomes = [];
    if (congregacaoIds.length > 0) {
      const nomesRequest = pool.request();
      const placeholders = congregacaoIds.map((cid, i) => { nomesRequest.input(`id${i}`, sql.Int, cid); return `@id${i}`; }).join(",");
      const nomesResult = await nomesRequest.query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId IN (${placeholders})`);
      nomes = nomesResult.recordset;
    }
    const foraDoEscopo = nomes.some(c => !auth.estaNoEscopo(usuario, c.Nome));
    if (foraDoEscopo || congregacaoIds.length === 0) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
  }

  const consolidado = await cd.consolidarPorDepartamento(pool, congregacaoIds, mesNum, anoNum);
  const body = { nivel, id: id || null, mesReferencia: mesNum, anoReferencia: anoNum, ...consolidado };

  if (historico) {
    const quantidade = Math.min(Number(historico) || 12, 36);
    body.historico = await cd.historicoConsolidado(pool, congregacaoIds, quantidade);
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body };
};
