// ListarConsagracoes
// Adaptado de listarConsagracoesAdminApp(). Traz apenas processos ainda não
// concluídos/reprovados (a "esteira" ativa). Exige a permissão "consagracoes".
// Auditoria de escopo (02/10/2026): só os processos de membros DENTRO do escopo de quem consulta (o geral vê todos). Os campos `congregacao`/`extensao` servem à tela
// e à conferência de escopo.
// v8.2: cada processo traz o cargo de destino e a modalidade (indicação, nomeação direta do Pastor Presidente, outra convenção). O processo vetado pela AFM fica na lista
// por 60 dias depois do veto, com o motivo, para quem indicou saber o que houve (sem botões: o veto encerra a indicação).
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
           cg.Nome AS congregacao, ex.Nome AS extensao,
           c.CargoAlvo AS cargoAlvo, c.Modalidade AS modalidade, c.AtoReferencia AS atoReferencia,
           CONVERT(varchar(10), c.VetoAFMEm, 120) AS vetoAFMEm, c.VetoAFMMotivo AS vetoAFMMotivo
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
    WHERE c.Status NOT IN ('CONCLUIDO', 'REPROVADO')
       OR (c.VetoAFMEm IS NOT NULL AND c.VetoAFMEm >= DATEADD(day, -60, SYSUTCDATETIME()))
    ORDER BY CASE WHEN c.VetoAFMEm IS NULL THEN 0 ELSE 1 END, c.DataProtocolo ASC
  `);
  const doEscopo = filtrarPorEscopo(usuario, result.recordset, (c) => c.congregacao, (c) => c.extensao);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: doEscopo };
};
