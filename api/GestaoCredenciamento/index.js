// GestaoCredenciamento (vB.13 — Credenciamento de Assembleia, Reg. Art. 142-143)
// Mesa de credenciamento COM TRILHA — o auto-atendimento de RegistrarPresenca
// (v2.1) continua existindo do jeito que está; isto é o fluxo operado pela
// mesa, que hoje (Art. 142-143) não deixa rastro nenhum de recusa. Exige
// permissão (não é anônimo, ao contrário de RegistrarPresenca): a mesa
// precisa estar identificada pra a trilha valer alguma coisa.
// GET  /api/credenciamento/{sessaoId}            -> impedidos calculados + aviso de procuração + relatório (se já gerado)
// POST /api/credenciamento/{sessaoId}            -> { membroId } credencia/recusa um membro (mesa)
// POST /api/credenciamento/{sessaoId}/relatorio  -> gera (ou devolve, se já existir) o relatório congelado
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { AVISO_PROCURACAO, avaliarCredenciamento, listarImpedidosAssembleia, gerarOuObterRelatorioCredenciamento } = require("../shared/credenciamento");

async function carregarSessaoAssembleia(pool, sessaoId) {
  const sessao = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.SessaoId, s.Status, COALESCE(o.Sigla, ol.Sigla) AS orgaoSigla
    FROM Sessoes s
    LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = s.OrgaoLocalId
    WHERE s.SessaoId = @id
  `)).recordset[0];
  return sessao;
}

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["assembleia", "reunioes"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  const sessao = await carregarSessaoAssembleia(pool, sessaoId);
  if (!sessao) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Sessão não encontrada." } };
    return;
  }
  // Art. 142-143 é especificamente sobre a Assembleia Geral — as regras de
  // impedimento aqui calculadas (capacidade eleitoral, carta de mudança) não
  // se aplicam a CLI/reuniões territoriais, então este credenciamento formal
  // fica restrito à Assembleia (fora dela, RegistrarPresenca já resolve).
  if (sessao.orgaoSigla !== "ASSEMBLEIA_GERAL") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Credenciamento formal (Art. 142-143) aplica-se somente à Assembleia Geral." } };
    return;
  }

  if (req.method === "GET" && !acao) {
    const impedidos = await listarImpedidosAssembleia(pool);
    const credenciamentos = (await pool.request().input("id", sql.Int, sessaoId).query(`
      SELECT c.CredenciamentoId AS credenciamentoId, c.MembroId AS membroId, m.Nome AS nome,
             c.Resultado AS resultado, c.MotivoArtigo AS motivoArtigo, c.MotivoDetalhe AS motivoDetalhe,
             CONVERT(varchar(19), c.CriadoEm, 120) AS criadoEm
      FROM CredenciamentosAssembleia c JOIN MembroReferencia m ON m.MembroId = c.MembroId
      WHERE c.SessaoId = @id ORDER BY c.CriadoEm
    `)).recordset;
    const relatorio = (await pool.request().input("id", sql.Int, sessaoId)
      .query(`SELECT RelatorioId AS relatorioId, TotalCredenciados AS totalCredenciados, TotalImpedidos AS totalImpedidos,
                     CONVERT(varchar(19), GeradoEm, 120) AS geradoEm
              FROM RelatoriosCredenciamento WHERE SessaoId = @id`)).recordset[0] || null;

    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { avisoProcuracao: AVISO_PROCURACAO, impedidos, credenciamentos, relatorio }
    };
    return;
  }

  if (req.method === "POST" && !acao) {
    const { membroId } = req.body || {};
    if (!membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
      return;
    }
    const membro = (await pool.request().input("id", sql.Int, membroId).query(`
      SELECT MembroId AS membroId, SituacaoMembro AS situacaoMembro, Status AS status,
             CONVERT(varchar(10), DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), DataAdmissao, 120) AS dataAdmissao, DizimistaFiel AS dizimistaFiel
      FROM MembroReferencia WHERE MembroId = @id
    `)).recordset[0];
    if (!membro) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }

    const avaliacao = await avaliarCredenciamento(pool, membro);
    const resultado = avaliacao.credenciado ? "CREDENCIADO" : "RECUSADO";

    await pool.request()
      .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId)
      .input("resultado", sql.NVarChar(20), resultado).input("artigo", sql.NVarChar(20), avaliacao.artigo || null)
      .input("detalhe", sql.NVarChar(300), avaliacao.detalhe || null).input("operadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO CredenciamentosAssembleia (SessaoId, MembroId, Resultado, MotivoArtigo, MotivoDetalhe, OperadoPor)
              VALUES (@sessaoId, @membroId, @resultado, @artigo, @detalhe, @operadoPor)`);

    if (avaliacao.credenciado) {
      const jaTemPresenca = await pool.request().input("id", sql.Int, sessaoId).input("mat", sql.Int, membroId)
        .query(`SELECT 1 FROM Presencas WHERE SessaoId = @id AND MembroId = @mat`);
      if (jaTemPresenca.recordset.length === 0) {
        await pool.request().input("id", sql.Int, sessaoId).input("mat", sql.Int, membroId)
          .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@id, @mat, 1)`);
      }
    }

    await registrarAuditoria({
      tabela: "CredenciamentosAssembleia", registroId: Number(sessaoId), acao: `Credenciamento: ${resultado}${avaliacao.artigo ? ` (${avaliacao.artigo})` : ""} — matrícula ${membroId}`,
      usuarioId: usuario.membroId
    });

    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: avaliacao.credenciado ? "✅ Credenciado." : `🚫 Recusado — ${avaliacao.artigo}: ${avaliacao.detalhe}`,
        resultado
      }
    };
    return;
  }

  if (req.method === "POST" && acao === "relatorio") {
    const relatorio = await gerarOuObterRelatorioCredenciamento(pool, sessaoId, usuario.membroId);
    if (relatorio.novo) {
      await registrarAuditoria({
        tabela: "RelatoriosCredenciamento", registroId: relatorio.relatorioId,
        acao: `Gerou relatório de credenciamento (${relatorio.totalCredenciados} credenciados, ${relatorio.totalImpedidos} impedidos)`,
        usuarioId: usuario.membroId
      });
    }
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: relatorio.novo ? "✅ Relatório de credenciamento gerado e congelado." : "Relatório já havia sido gerado — devolvendo o congelado.", relatorio }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
