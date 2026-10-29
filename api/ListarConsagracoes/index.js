// ListarConsagracoes
// Adaptado de listarConsagracoesAdminApp(). Traz apenas processos ainda não
// concluídos/reprovados (a "esteira" ativa). Exige a permissão "consagracoes".
// Auditoria de escopo (02/10/2026): só os processos de membros DENTRO do escopo de quem consulta (o geral vê todos). Os campos `congregacao`/`extensao` servem à tela
// e à conferência de escopo.
// v8.2: cada processo traz o cargo de destino e a modalidade (indicação, nomeação direta do Pastor Presidente, outra convenção). O processo vetado pela AFM fica na lista
// por 60 dias depois do veto, com o motivo, para quem indicou saber o que houve (sem botões: o veto encerra a indicação).
// v8.3: o número do processo (os documentos da indicação são anexos dele), a foto e quantos documentos já há, o resultado do parecer do CEI (sem a fundamentação, que é
// sigilosa), a homologação, a taxa, a cerimônia e o diploma. Os encerrados (consagrados, inaptos, ausentes e vetados) ficam na lista por 60 dias, com o motivo.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { filtrarPorEscopo, ehGeral } = require("../shared/escopoRotas");
const escada = require("../shared/escada");
const regra = require("../shared/consagracao");

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
           CONVERT(varchar(10), c.VetoAFMEm, 120) AS vetoAFMEm, c.VetoAFMMotivo AS vetoAFMMotivo,
           c.Numero AS numero, ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) AS cargoDoTipo,
           CASE WHEN m.FotoUrl IS NULL OR m.FotoUrl = N'' THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS temFoto,
           (SELECT COUNT(*) FROM AnexosGenericos a WHERE a.Tabela = N'Consagracoes' AND a.RegistroId = c.Numero) AS documentos,
           pc.Resultado AS parecerCEI, CONVERT(varchar(10), pc.SabatinaEm, 120) AS parecerEm,
           CONVERT(varchar(10), c.HomologadoEm, 120) AS homologadoEm, c.HomologacaoSessaoId AS homologacaoSessaoId, c.HomologacaoAto AS homologacaoAto,
           CONVERT(varchar(10), c.TaxaPagaEm, 120) AS taxaPagaEm, c.TaxaValor AS taxaValor, c.TaxaForma AS taxaForma,
           c.CerimoniaId AS cerimoniaId, CONVERT(varchar(10), ce.DataCerimonia, 120) AS cerimoniaData, ce.ValorTaxa AS cerimoniaValorTaxa,
           CONVERT(varchar(10), c.ConvencaoHomologadaEm, 120) AS convencaoHomologadaEm, c.ConvencaoAto AS convencaoAto,
           CONVERT(varchar(10), c.DataConclusao, 120) AS dataConclusao, c.MotivoEncerramento AS motivoEncerramento, c.DiplomaCertificadoId AS diplomaCertificadoId
    FROM Consagracoes c
    LEFT JOIN TiposConsagracao t ON t.Nome = c.Assunto
    LEFT JOIN PareceresCEIConsagracao pc ON pc.ConsagracaoId = c.ConsagracaoId
    LEFT JOIN CerimoniasConsagracao ce ON ce.CerimoniaId = c.CerimoniaId
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
    WHERE c.Status NOT IN ('CONCLUIDO', 'REPROVADO')
       OR (c.VetoAFMEm IS NOT NULL AND c.VetoAFMEm >= DATEADD(day, -60, SYSUTCDATETIME()))
       OR (c.DataConclusao IS NOT NULL AND c.DataConclusao >= DATEADD(day, -60, CAST(SYSUTCDATETIME() AS date)))
    ORDER BY CASE WHEN c.Status IN ('CONCLUIDO', 'REPROVADO') THEN 1 ELSE 0 END, c.DataProtocolo ASC
  `);
  const geral = ehGeral(usuario);
  const doEscopo = filtrarPorEscopo(usuario, result.recordset, (c) => c.congregacao, (c) => c.extensao).map(({ cargoDoTipo, ...c }) => ({
    ...c,
    // o cargo de destino (do tipo, para o processo de antes da v8.2) diz se o processo passa pelo CEI, pela homologação e pela cerimônia
    cargoAlvo: c.cargoAlvo || (escada.ESCADA.includes(cargoDoTipo) && cargoDoTipo !== "MEMBRO" ? cargoDoTipo : null),
    // Trava 8-A (revisão): quem não é do nível geral vê "vacância" — não fica sabendo que houve decisão disciplinar
    motivoEncerramento: c.motivoEncerramento === "DISCIPLINA" && !geral ? "VACANCIA" : c.motivoEncerramento,
    taxaValor: c.taxaValor == null ? null : Number(c.taxaValor),
    cerimoniaValorTaxa: c.cerimoniaValorTaxa == null ? null : Number(c.cerimoniaValorTaxa),
    homologacaoPelaCLI: regra.homologacaoPelaCLI(c.cargoAlvo || cargoDoTipo),
    precisaConvencao: regra.precisaConvencao(c.cargoAlvo || cargoDoTipo, c.modalidade || "INDICACAO"),   // Trava 8-A: CIADSETA (Art. 72, V, a)
    taxaEmDia: c.cerimoniaId ? regra.situacaoDaTaxa(c, { dataCerimonia: c.cerimoniaData, valorTaxa: c.cerimoniaValorTaxa }).emDia : null
  }));
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: doEscopo };
};
