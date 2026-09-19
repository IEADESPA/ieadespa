// GestaoConsolidadoDepartamental (v5.5.1 — Consolidado de Campo; v5.8 —
// Região/Quadrante/Distrito, série histórica por campo, comparativo por porte)
// O relatório mensal (v5.2/v5.3) responde "como foi o mês do UCADESPA na
// Congregação X"; este endpoint responde a pergunta inversa: "como está a
// Congregação X (ou a Área Y, Região, Quadrante, Distrito ou o Campo
// inteiro) neste mês, olhando os 8 departamentos juntos?" — o retrato
// eclesiástico que o Regimento pede.
// GET /api/consolidado-departamentos?nivel=congregacao|area|regiao|quadrante|distrito|campo&id=&mes=&ano=&historico=N
//   &campo=nomeCampo&departamentoId=&historicoCampo=N  -> série histórica de UM campo do formulário (v5.8)
//   &porte=1                                            -> comparativo entre congregações do mesmo porte (v5.8)
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const cd = require("../shared/consolidadoDepartamental");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "relatorios_departamentais");
  if (!usuario) return;

  const { nivel, id, mes, ano, historico, campo, departamentoId, historicoCampo, porte } = req.query || {};
  if (!cd.NIVEIS_VALIDOS.includes(nivel)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Informe nivel: ${cd.NIVEIS_VALIDOS.join("|")}.` } };
    return;
  }
  if (nivel !== "campo" && !id) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe id (congregacaoId, areaId, regiaoId, quadranteId ou distritoId) para este nível." } };
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

  // v5.8 (item 2) — série histórica de UM campo do formulário (não do total
  // agregado): exige departamentoId porque NomeCampo só é chave dentro de um
  // schema de departamento (o mesmo nome se repete com sentido diferente em
  // schemas diferentes — ver comentário do módulo).
  if (campo) {
    const depIdNum = Number(departamentoId);
    if (!depIdNum) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe departamentoId para série histórica por campo." } };
      return;
    }
    const quantidadeCampo = Math.min(Number(historicoCampo) || 12, 36);
    body.serieCampo = await cd.serieHistoricaCampo(pool, congregacaoIds, depIdNum, campo, quantidadeCampo);
  }

  // v5.8 (item 3) — comparativo entre congregações do mesmo porte, dentro do
  // escopo já resolvido acima (nunca extrapola pra fora do que o usuário
  // pode ver, mesma lista de congregacaoIds já filtrada por escopo).
  if (porte) {
    body.porPorte = await cd.compararPorPorte(pool, congregacaoIds, mesNum, anoNum);
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body };
};
