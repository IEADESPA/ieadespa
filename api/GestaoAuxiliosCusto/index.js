// GestaoAuxiliosCusto (v4.10, segunda parte — item 7)
// Auxílios e ajudas de custo DISTINTOS da prebenda (moradia, transporte,
// saúde), cada um com sua natureza fiscal — antes tudo cairia na mesma
// rubrica. São benefícios não-salariais (Reg. Art. 134 §4º): instrumentos
// de trabalho e assistência, não integram remuneração pra reflexos legais.
// Restrito a nível Global.
// GET  /api/auxilios-custo -> lista
// GET  /api/auxilios-custo/{id} -> detalhe
// POST /api/auxilios-custo -> { prebendadoId, tipo, naturezaFiscal, valorMensal, observacao? }
// PUT  /api/auxilios-custo/{id} -> { tipo?, naturezaFiscal?, valorMensal?, acao?: 'ENCERRAR', observacao? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const prebenda = require("../shared/prebenda");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Auxílios e ajudas de custo são matéria da Tesouraria Geral — restrito a papéis de nível Global." } };
    return;
  }
  const pool = await getPool();

  const SELECT_BASE = `
    SELECT ax.AuxilioId AS auxilioId, ax.PrebendadoId AS prebendadoId, m.Nome AS nome,
           ax.Tipo AS tipo, ax.NaturezaFiscal AS naturezaFiscal, ax.ValorMensal AS valorMensal,
           ax.Status AS status, ax.Observacao AS observacao
    FROM AuxiliosAjudaCusto ax
    JOIN Prebendados p ON p.PrebendadoId = ax.PrebendadoId
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
  `;

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY ax.Status, m.Nome, ax.Tipo`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE ax.AuxilioId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Auxílio não encontrado." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  if (req.method === "POST") {
    const { prebendadoId, tipo, naturezaFiscal, valorMensal, observacao } = req.body || {};
    if (!prebendadoId || !tipo || !naturezaFiscal || !valorMensal) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: prebendadoId, tipo, naturezaFiscal, valorMensal." } };
      return;
    }
    if (!prebenda.TIPOS_AUXILIO.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipo inválido. Use um de: ${prebenda.TIPOS_AUXILIO.join(", ")}.` } };
      return;
    }
    if (!prebenda.NATUREZAS_FISCAIS_AUXILIO.includes(naturezaFiscal)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `naturezaFiscal inválida. Use uma de: ${prebenda.NATUREZAS_FISCAIS_AUXILIO.join(", ")}.` } };
      return;
    }
    if (Number(valorMensal) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensal deve ser maior que zero." } };
      return;
    }
    const alvo = await pool.request().input("id", sql.Int, prebendadoId).query(`SELECT PrebendadoId FROM Prebendados WHERE PrebendadoId = @id`);
    if (alvo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebendado não encontrado." } };
      return;
    }

    const criado = await pool.request()
      .input("prebendadoId", sql.Int, prebendadoId).input("tipo", sql.NVarChar(20), tipo)
      .input("naturezaFiscal", sql.NVarChar(20), naturezaFiscal).input("valor", sql.Decimal(10, 2), valorMensal)
      .input("observacao", sql.NVarChar(300), observacao || null).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO AuxiliosAjudaCusto (PrebendadoId, Tipo, NaturezaFiscal, ValorMensal, Observacao, CriadoPor)
              OUTPUT INSERTED.AuxilioId VALUES (@prebendadoId, @tipo, @naturezaFiscal, @valor, @observacao, @criadoPor)`);
    await registrarAuditoria({
      tabela: "AuxiliosAjudaCusto", registroId: criado.recordset[0].AuxilioId, acao: "Cadastrou auxílio/ajuda de custo", usuarioId: usuario.membroId,
      dadosDepois: { prebendadoId, tipo, naturezaFiscal, valorMensal }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Auxílio/ajuda de custo cadastrado.", auxilioId: criado.recordset[0].AuxilioId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/auxilios-custo/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM AuxiliosAjudaCusto WHERE AuxilioId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Auxílio não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { tipo, naturezaFiscal, valorMensal, acao, observacao } = req.body || {};

    if (tipo !== undefined && !prebenda.TIPOS_AUXILIO.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipo inválido. Use um de: ${prebenda.TIPOS_AUXILIO.join(", ")}.` } };
      return;
    }
    if (naturezaFiscal !== undefined && !prebenda.NATUREZAS_FISCAIS_AUXILIO.includes(naturezaFiscal)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `naturezaFiscal inválida. Use uma de: ${prebenda.NATUREZAS_FISCAIS_AUXILIO.join(", ")}.` } };
      return;
    }
    const novoTipo = tipo !== undefined ? tipo : registro.Tipo;
    const novaNatureza = naturezaFiscal !== undefined ? naturezaFiscal : registro.NaturezaFiscal;
    const novoValor = valorMensal !== undefined ? valorMensal : registro.ValorMensal;
    if (Number(novoValor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensal deve ser maior que zero." } };
      return;
    }
    const novoStatus = acao === "ENCERRAR" ? "ENCERRADO" : registro.Status;

    await pool.request().input("id", sql.Int, id)
      .input("tipo", sql.NVarChar(20), novoTipo).input("naturezaFiscal", sql.NVarChar(20), novaNatureza)
      .input("valor", sql.Decimal(10, 2), novoValor).input("status", sql.NVarChar(20), novoStatus)
      .input("observacao", sql.NVarChar(300), observacao !== undefined ? (observacao || null) : registro.Observacao)
      .query(`UPDATE AuxiliosAjudaCusto SET Tipo = @tipo, NaturezaFiscal = @naturezaFiscal, ValorMensal = @valor, Status = @status, Observacao = @observacao WHERE AuxilioId = @id`);

    await registrarAuditoria({
      tabela: "AuxiliosAjudaCusto", registroId: Number(id), acao: acao === "ENCERRAR" ? "Encerrou auxílio/ajuda de custo" : "Atualizou auxílio/ajuda de custo",
      usuarioId: usuario.membroId, dadosAntes: registro, dadosDepois: { tipo: novoTipo, naturezaFiscal: novaNatureza, valorMensal: novoValor, status: novoStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Auxílio/ajuda de custo atualizado." } };
    return;
  }
};

