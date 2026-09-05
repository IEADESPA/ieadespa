// MeusDadosLGPD (público — "Meu Painel", auto-atendimento por matrícula)
// Direito de acesso e portabilidade (LGPD Art. 18, I e V): devolve, num único
// pacote, todos os dados pessoais que o sistema guarda daquela matrícula.
// v1.9: travado atrás do consentimento DADOS_CONTATO (generalizado — hoje cobre
// "dados sensíveis" em geral, não só contato/foto) — mesmo padrão de trava real
// já usado em UploadFotoMembro, adaptado pra leitura.
// GET /api/lgpd/meus-dados/{matricula}
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const membroResult = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, m.Funcao AS funcao, c.Nome AS congregacao,
           m.Status AS status, CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
           CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
           CONVERT(varchar(10), m.DataBatismo, 120) AS dataBatismo,
           m.FormaAdmissao AS formaAdmissao, m.Origem AS origem, m.IgrejaAnterior AS igrejaAnterior,
           CONVERT(varchar(10), m.DataRitoRecebimento, 120) AS dataRitoRecebimento,
           m.NomeLidoRito AS nomeLidoRito, m.MinistranteRito AS ministranteRito,
           m.DizimistaFiel AS dizimistaFiel,
           m.SituacaoMembro AS situacaoMembro, d.Nome AS departamento, m.CargoMinisterial AS cargoMinisterial,
           m.Telefone AS telefone, m.Email AS email, m.Endereco AS endereco, e.Nome AS extensao,
           m.FotoUrl AS fotoUrl,
           CONVERT(varchar(33), m.CriadoEm, 126) AS criadoEm
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN Departamentos d ON d.DepartamentoId = m.DepartamentoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @mat`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  // Trava real (v1.9), mesmo espírito da trava de Foto (v1.7): só o consentimento
  // mais recente conta (registro append-only — uma revogação depois de um "sim"
  // tem que valer). Sem consentimento concedido, nem o cadastro básico sai daqui.
  const consentimentoAtual = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT TOP 1 Concedido FROM ConsentimentosLGPD WHERE MembroId = @mat AND Tipo = 'DADOS_CONTATO' ORDER BY ConsentimentoId DESC
  `);
  if (!consentimentoAtual.recordset[0] || !consentimentoAtual.recordset[0].Concedido) {
    context.res = {
      status: 200,
      body: { sucesso: false, precisaConsentimento: true, mensagem: "Conceda o consentimento acima antes de visualizar seus dados completos." }
    };
    return;
  }

  const [lideranca, assentos, processos, vinculos, consentimentos, solicitacoes, casamentos, licencasCandidatura] = await Promise.all([
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT p.Nome AS papel, l.EscopoTipo AS escopoTipo, CONVERT(varchar(33), l.CriadoEm, 126) AS desde
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = @mat`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT o.Nome AS orgao, a.CargoOuFuncao AS cargoOuFuncao, CONVERT(varchar(10), a.DataInicio, 120) AS dataInicio,
             CONVERT(varchar(10), a.DataFim, 120) AS dataFim
      FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE a.MembroId = @mat`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT o.Nome AS orgaoResponsavel, p.Motivo AS motivo, CONVERT(varchar(10), p.DataAbertura, 120) AS dataAbertura,
             p.Status AS status, p.Resultado AS resultado, p.DiasSancao AS diasSancao,
             CONVERT(varchar(10), p.DataTerminoPrevisao, 120) AS dataTerminoPrevisao
      FROM ProcessosDisciplinares p JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId WHERE p.MembroId = @mat`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT m2.Nome AS parente, t.RotuloDireto AS vinculo, v.ResponsavelLegal AS responsavelLegal
      FROM VinculosFamiliares v
      JOIN MembroReferencia m2 ON m2.MembroId = v.MembroParenteId
      JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
      WHERE v.MembroId = @mat`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT Tipo AS tipo, Concedido AS concedido, BaseLegal AS baseLegal, CONVERT(varchar(33), DataRegistro, 126) AS dataRegistro
      FROM ConsentimentosLGPD WHERE MembroId = @mat ORDER BY DataRegistro DESC`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT Tipo AS tipo, Status AS status, CONVERT(varchar(33), DataSolicitacao, 126) AS dataSolicitacao
      FROM SolicitacoesTitularLGPD WHERE MembroId = @mat ORDER BY DataSolicitacao DESC`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT c.CasamentoId AS casamentoId, COALESCE(mc.Nome, c.NomeConjuge) AS conjuge, c.Modalidade AS modalidade,
             c.Celebrante AS celebrante, CONVERT(varchar(10), c.DataCasamento, 120) AS dataCasamento,
             c.RegistradoCartorio AS registradoCartorio
      FROM Casamentos c LEFT JOIN MembroReferencia mc ON mc.MembroId = c.MembroConjugeId
      WHERE c.MembroId = @mat ORDER BY c.DataCasamento DESC`),
    pool.request().input("mat", sql.Int, matricula).query(`
      SELECT LicencaId AS licencaId, CONVERT(varchar(10), DataPleito, 120) AS dataPleito,
             CONVERT(varchar(10), DataInicioLicenca, 120) AS dataInicioLicenca, Status AS status
      FROM LicencasCandidatura WHERE MembroId = @mat ORDER BY DataPleito DESC`)
  ]);

  await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(matricula), acao: "Acessou os próprios dados (LGPD)", usuarioId: Number(matricula) });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      geradoEm: new Date().toISOString(),
      membro,
      liderancas: lideranca.recordset,
      assentos: assentos.recordset,
      processosDisciplinares: processos.recordset,
      vinculosFamiliares: vinculos.recordset,
      consentimentos: consentimentos.recordset,
      solicitacoesLgpd: solicitacoes.recordset,
      casamentos: casamentos.recordset,
      licencasCandidatura: licencasCandidatura.recordset
    }
  };
};
