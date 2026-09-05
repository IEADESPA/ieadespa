// SolicitarEdicaoPessoa (v1.11 — público, autoatendimento por matrícula)
// Campos "sujeitos a aprovação" (ver shared/camposEdicaoPessoa.js): o membro
// propõe, a Secretaria decide campo a campo na Fila de Aprovações
// (GestaoFilaAprovacoes) antes de valer em MembroReferencia.
// GET  /api/solicitacoes-edicao/{matricula} -> próprias solicitações (com os campos aninhados)
// POST /api/solicitacoes-edicao/{matricula} -> body: { campos: { dataNascimento?, ... } }
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const { CAMPOS_APROVACAO } = require("../shared/camposEdicaoPessoa");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().input("mat", sql.Int, matricula).query(`
      SELECT s.SolicitacaoId AS solicitacaoId, CONVERT(varchar(33), s.DataSolicitacao, 126) AS dataSolicitacao, s.Status AS status,
             c.CampoId AS campoId, c.NomeCampo AS nomeCampo, c.ValorAnterior AS valorAnterior, c.ValorProposto AS valorProposto, c.Status AS statusCampo
      FROM SolicitacoesEdicaoPessoa s
      JOIN SolicitacoesEdicaoCampos c ON c.SolicitacaoId = s.SolicitacaoId
      WHERE s.MembroId = @mat
      ORDER BY s.DataSolicitacao DESC, c.CampoId`);

    const porSolicitacao = {};
    result.recordset.forEach(r => {
      if (!porSolicitacao[r.solicitacaoId]) {
        porSolicitacao[r.solicitacaoId] = { solicitacaoId: r.solicitacaoId, dataSolicitacao: r.dataSolicitacao, status: r.status, campos: [] };
      }
      porSolicitacao[r.solicitacaoId].campos.push({
        campoId: r.campoId, nomeCampo: r.nomeCampo, valorAnterior: r.valorAnterior, valorProposto: r.valorProposto, status: r.statusCampo
      });
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.values(porSolicitacao) };
    return;
  }

  if (req.method === "POST") {
    const camposBody = (req.body || {}).campos || {};
    const chavesValidas = Object.keys(camposBody).filter(k => CAMPOS_APROVACAO[k] && String(camposBody[k] ?? "").trim());
    if (chavesValidas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos um campo válido pra solicitar mudança." } };
      return;
    }

    const colunasSelect = Object.values(CAMPOS_APROVACAO).map(c => c.coluna).join(", ");
    const membro = await pool.request().input("id", sql.Int, matricula).query(`SELECT MembroId, ${colunasSelect} FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const atual = membro.recordset[0];

    const camposParaCriar = chavesValidas
      .map(chave => {
        const config = CAMPOS_APROVACAO[chave];
        const bruto = atual[config.coluna];
        const valorAnterior = config.tipoData && bruto ? new Date(bruto).toISOString().slice(0, 10) : (bruto || null);
        const valorProposto = String(camposBody[chave]).trim();
        return { chave, valorAnterior, valorProposto };
      })
      .filter(c => String(c.valorAnterior || "") !== c.valorProposto); // só o que realmente muda

    if (camposParaCriar.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhum dos valores enviados é diferente do que já está cadastrado." } };
      return;
    }

    const criarSolicitacao = await pool.request().input("mat", sql.Int, matricula)
      .query(`INSERT INTO SolicitacoesEdicaoPessoa (MembroId) OUTPUT INSERTED.SolicitacaoId VALUES (@mat)`);
    const solicitacaoId = criarSolicitacao.recordset[0].SolicitacaoId;

    for (const c of camposParaCriar) {
      await pool.request()
        .input("sol", sql.Int, solicitacaoId)
        .input("nome", sql.NVarChar(50), c.chave)
        .input("antes", sql.NVarChar(300), c.valorAnterior)
        .input("depois", sql.NVarChar(300), c.valorProposto)
        .query(`INSERT INTO SolicitacoesEdicaoCampos (SolicitacaoId, NomeCampo, ValorAnterior, ValorProposto) VALUES (@sol, @nome, @antes, @depois)`);
    }

    await registrarAuditoria({
      tabela: "SolicitacoesEdicaoPessoa",
      registroId: solicitacaoId,
      acao: "Solicitou edição de dados (aguardando aprovação)",
      usuarioId: Number(matricula),
      dadosDepois: { campos: camposParaCriar }
    });

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: `✅ Pedido enviado — ${camposParaCriar.length} campo(s) aguardando aprovação da Secretaria.`, solicitacaoId }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
