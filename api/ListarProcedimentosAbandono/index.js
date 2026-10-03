// ListarProcedimentosAbandono
// Exige a permissão "disciplina". GET /api/procedimentos-abandono?status=&membroId=&tipo=
// Auditoria de escopo (02/10/2026): só entram procedimentos de membros DENTRO do escopo de quem consulta (congregação/área/região... da liderança; o geral vê tudo).
// `?membroId=` de alguém de fora do escopo (ou inexistente, ou malformado) devolve lista vazia — igual a "sem procedimentos", não serve de sonda.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const abandonoDigital = require("../shared/abandonoDigital");
const { filtrarPorEscopo } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { status, membroId, tipo } = req.query || {};
  const responder = (lista) => { context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista }; };

  const pool = await getPool();
  const request = pool.request();
  const condicoes = [];
  if (status) { request.input("status", sql.NVarChar(30), String(status)); condicoes.push("pa.Status = @status"); }
  if (membroId) {
    const id = auth.idDeRota(membroId);
    if (!id) { responder([]); return; }
    request.input("membroId", sql.Int, id);
    condicoes.push("pa.MembroId = @membroId");
  }
  if (tipo) { request.input("tipo", sql.NVarChar(20), String(tipo)); condicoes.push("pa.Tipo = @tipo"); }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT pa.ProcedimentoId AS procedimentoId, pa.MembroId AS membroId, m.Nome AS nome,
           pa.Tipo AS tipo, pa.Status AS status, CONVERT(varchar(10), pa.DataNotificacao, 120) AS dataNotificacao,
           CONVERT(varchar(10), pa.DataEdital, 120) AS dataEdital, pa.PrazoDias AS prazoDias,
           CONVERT(varchar(10), pa.DataHomologacao, 120) AS dataHomologacao,
           pa.RecursoInterposto AS recursoInterposto,
           CONVERT(varchar(10), pa.DataRecurso, 120) AS dataRecurso, pa.ResultadoRecurso AS resultadoRecurso,
           pa.AbertoPor AS abertoPor, ab.Nome AS abertoPorNome, CONVERT(varchar(10), DATEADD(HOUR, -3, pa.CriadoEm), 120) AS abertoEmBrasilia,
           c.Nome AS congregacaoDaPessoa, ex.Nome AS extensaoDaPessoa
    FROM ProcedimentosAbandono pa
    JOIN MembroReferencia m ON m.MembroId = pa.MembroId
    LEFT JOIN MembroReferencia ab ON ab.MembroId = pa.AbertoPor
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
    ${where}
    ORDER BY pa.ProcedimentoId DESC
  `);

  // O prazo conta do último marco entre a notificação, a abertura e o edital (shared/abandonoDigital.js::inicioPrazoDefesa) — o mesmo cálculo da homologação.
  // `abertoPorMim`: a tela esconde o botão Homologar de quem abriu (regra dos dois olhos; a rota recusa de qualquer forma).
  const doEscopo = filtrarPorEscopo(usuario, result.recordset, (p) => p.congregacaoDaPessoa, (p) => p.extensaoDaPessoa);
  const procedimentos = doEscopo.map(({ congregacaoDaPessoa, extensaoDaPessoa, abertoEmBrasilia, ...p }) => {
    const prazo = abandonoDigital.situacaoPrazoDefesa({ dataNotificacao: p.dataNotificacao, abertoEmBrasilia, dataEdital: p.dataEdital, prazoDias: p.prazoDias });
    return {
      ...p,
      abertoPorMim: p.abertoPor != null && Number(p.abertoPor) === Number(usuario.membroId),
      inicioPrazo: prazo.inicioPrazo, prazoVenceEm: p.status === "NOTIFICADO" ? prazo.venceEm : null,
      prazoVencido: p.status === "NOTIFICADO" ? prazo.vencido : null
    };
  });

  responder(procedimentos);
};
