// GestaoPrebendados (v4.10, segunda parte — item 1)
// Cadastro do prebendado: dados do ministro (MembroReferencia), CPF,
// valor mensal de referência e o fornecedor PF por onde o pagamento sai
// (remessa bancária, v4.7). O valor NÃO é auto-atribuído — deve vir de um
// Ato de Designação (ata de órgão colegiado), aqui apenas vinculado.
// Restrito a nível Global (Reg. Art. 134 §5º).
// GET  /api/prebendados -> lista
// GET  /api/prebendados/{id} -> detalhe
// POST /api/prebendados -> { membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio, atoDesignacaoId?, observacao? }
// PUT  /api/prebendados/{id} -> { acao: 'SUSPENDER'|'ENCERRAR'|'REATIVAR', valorMensalReferencia?, observacao? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ACOES = ["SUSPENDER", "ENCERRAR", "REATIVAR"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Prebenda é matéria da Tesouraria Geral — restrito a papéis de nível Global." } };
    return;
  }
  const pool = await getPool();

  const SELECT_BASE = `
    SELECT p.PrebendadoId AS prebendadoId, p.MembroId AS membroId, m.Nome AS nome, p.FornecedorId AS fornecedorId,
           f.Nome AS fornecedorNome, f.Tipo AS fornecedorTipo, p.Cpf AS cpf, p.ValorMensalReferencia AS valorMensalReferencia,
           CONVERT(varchar(10), p.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), p.DataFim, 120) AS dataFim,
           p.Status AS status, p.AtoDesignacaoId AS atoDesignacaoId, a.NumeroAto AS numeroAto, p.Observacao AS observacao
    FROM Prebendados p
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    JOIN Fornecedores f ON f.FornecedorId = p.FornecedorId
    LEFT JOIN AtosDesignacao a ON a.AtoDesignacaoId = p.AtoDesignacaoId
  `;

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY p.Status, m.Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE p.PrebendadoId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebendado não encontrado." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  if (req.method === "POST") {
    const { membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio, atoDesignacaoId, observacao } = req.body || {};
    if (!membroId || !fornecedorId || !cpf || !cpf.trim() || !valorMensalReferencia || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio." } };
      return;
    }
    if (Number(valorMensalReferencia) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensalReferencia deve ser maior que zero." } };
      return;
    }

    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Membro (ministro) não encontrado. Cadastre a pessoa antes." } };
      return;
    }

    // Vedação à "pejotização" (item 5): o ministro não recebe prebenda via
    // fornecedor PJ — a relação é eclesiástica, regida pela ata de posse,
    // nunca por Pessoa Jurídica prestando serviço ministerial.
    const fornecedor = await pool.request().input("id", sql.Int, fornecedorId).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
    if (fornecedor.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
      return;
    }
    if (fornecedor.recordset[0].Tipo !== "PF") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebenda é paga a pessoa física (natureza alimentar, sem vínculo CLT). Cadastrar ministro como fornecedor PJ é vedado (Art. 134-A §1º, pejotização) — use um fornecedor PF." } };
      return;
    }

    const existenteCpf = await pool.request().input("cpf", sql.VarChar(14), cpf.trim()).query(`SELECT PrebendadoId FROM Prebendados WHERE Cpf = @cpf`);
    if (existenteCpf.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe prebendado com esse CPF." } };
      return;
    }

    if (atoDesignacaoId) {
      const ato = await pool.request().input("id", sql.Int, atoDesignacaoId).query(`SELECT AtoDesignacaoId, MembroId, ValorMensal FROM AtosDesignacao WHERE AtoDesignacaoId = @id`);
      if (ato.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Ato de designação não encontrado." } };
        return;
      }
      if (ato.recordset[0].MembroId !== Number(membroId)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O ato de designação pertence a outro ministro." } };
        return;
      }
    }

    const criado = await pool.request()
      .input("membroId", sql.Int, membroId).input("fornecedorId", sql.Int, fornecedorId)
      .input("cpf", sql.VarChar(14), cpf.trim()).input("valor", sql.Decimal(10, 2), valorMensalReferencia)
      .input("dataInicio", sql.Date, dataInicio).input("atoDesignacaoId", sql.Int, atoDesignacaoId || null)
      .input("observacao", sql.NVarChar(300), observacao || null).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO Prebendados (MembroId, FornecedorId, Cpf, ValorMensalReferencia, DataInicio, AtoDesignacaoId, Observacao, CriadoPor)
              OUTPUT INSERTED.PrebendadoId VALUES (@membroId, @fornecedorId, @cpf, @valor, @dataInicio, @atoDesignacaoId, @observacao, @criadoPor)`);
    const prebendadoId = criado.recordset[0].PrebendadoId;

    await registrarAuditoria({
      tabela: "Prebendados", registroId: prebendadoId, acao: "Cadastrou prebendado", usuarioId: usuario.membroId,
      dadosDepois: { membroId, fornecedorId, cpf: cpf.trim(), valorMensalReferencia, dataInicio, atoDesignacaoId: atoDesignacaoId || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Prebendado cadastrado.", prebendadoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/prebendados/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Prebendados WHERE PrebendadoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebendado não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, valorMensalReferencia, observacao } = req.body || {};

    if (acao && !ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    const novoValor = valorMensalReferencia !== undefined ? valorMensalReferencia : registro.ValorMensalReferencia;
    if (Number(novoValor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensalReferencia deve ser maior que zero." } };
      return;
    }
    let novoStatus = registro.Status;
    let dataFim = registro.DataFim;
    if (acao === "SUSPENDER") novoStatus = "SUSPENSO";
    if (acao === "ENCERRAR") { novoStatus = "ENCERRADO"; dataFim = dataFim || new Date().toISOString().slice(0, 10); }
    if (acao === "REATIVAR") { novoStatus = "ATIVO"; dataFim = null; }

    await pool.request().input("id", sql.Int, id)
      .input("valor", sql.Decimal(10, 2), novoValor).input("status", sql.NVarChar(20), novoStatus)
      .input("dataFim", sql.Date, dataFim).input("observacao", sql.NVarChar(300), observacao !== undefined ? (observacao || null) : registro.Observacao)
      .query(`UPDATE Prebendados SET ValorMensalReferencia = @valor, Status = @status, DataFim = @dataFim, Observacao = @observacao WHERE PrebendadoId = @id`);

    await registrarAuditoria({
      tabela: "Prebendados", registroId: Number(id), acao: acao ? `Atualizou prebendado (${acao})` : "Atualizou prebendado",
      usuarioId: usuario.membroId, dadosAntes: registro, dadosDepois: { valorMensalReferencia: novoValor, status: novoStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Prebendado atualizado." } };
    return;
  }
};
