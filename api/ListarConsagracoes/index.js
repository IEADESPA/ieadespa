// ListarConsagracoes
// Adaptado de listarConsagracoesAdminApp(). Traz apenas processos ainda não
// concluídos/reprovados (a "esteira" ativa). Exige a permissão "consagracoes".
// Auditoria de escopo (02/10/2026): só os processos de membros DENTRO do escopo de quem consulta (o geral vê todos). Os campos `congregacao`/`extensao` servem à tela
// e à conferência de escopo.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { filtrarPorEscopo } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT c.ConsagracaoId AS consagracaoId, c.MembroId AS membroId, m.Nome AS nome,
           c.CargoAtual AS cargoAtual, c.Assunto AS assunto, p.Nome AS proponente,
           c.Status AS status, CONVERT(varchar(10), c.DataProtocolo, 120) AS dataProtocolo,
           cg.Nome AS congregacao, ex.Nome AS extensao
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
    WHERE c.Status NOT IN ('CONCLUIDO', 'REPROVADO')
    ORDER BY c.DataProtocolo ASC
  `);
  const doEscopo = filtrarPorEscopo(usuario, result.recordset, (c) => c.congregacao, (c) => c.extensao);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: doEscopo };
};
