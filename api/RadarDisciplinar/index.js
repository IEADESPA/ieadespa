// RadarDisciplinar
// Lista membros ativos com 3+ faltas NÃO justificadas num órgão, sinalizando
// risco de perda de assento (regra do Estatuto). Aceita ?orgaoId= para focar
// num órgão específico ou retorna todos se omitido.
//
// fecho da v7.5 — a rota estava aberta (sem login) e devolvia nome e faltas de todos os membros em risco. Agora exige a permissão "disciplina" (a mesma do
// RadarAbandono) e mostra só os membros das congregações do escopo de quem consulta.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const bruto = (req.query || {}).orgaoId;
  const orgaoId = bruto === undefined || bruto === null || bruto === "" ? null : auth.idDeRota(bruto);
  if (bruto !== undefined && bruto !== null && bruto !== "" && !orgaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "orgaoId inválido." } };
    return;
  }
  const pool = await getPool();
  const request = pool.request();
  request.input("orgaoId", sql.Int, orgaoId);

  const result = await request.query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
           COUNT(p.PresencaId) AS faltas
    FROM Presencas p
    JOIN Sessoes s ON s.SessaoId = p.SessaoId
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE p.Presente = 0 AND p.FaltaJustificada = 0
      AND (@orgaoId IS NULL OR s.OrgaoId = @orgaoId)
    GROUP BY m.MembroId, m.Nome, c.Nome
    HAVING COUNT(p.PresencaId) >= 3
    ORDER BY faltas DESC
  `);

  const membrosEmRisco = result.recordset
    .filter((r) => auth.estaNoEscopo(usuario, r.congregacao))
    .map((r) => ({
      ...r,
      alerta: "Elegível a perda automática de assento (Art. Estatuto — 3 faltas consecutivas)"
    }));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { orgaoId: orgaoId || "TODOS", membrosEmRisco }
  };
};
