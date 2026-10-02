// GestaoPrebendados (v4.10, segunda parte — item 1)
// Cadastro do prebendado: dados do ministro (MembroReferencia), CPF,
// valor mensal de referência e o fornecedor PF por onde o pagamento sai
// (remessa bancária, v4.7). O valor NÃO é auto-atribuído — deve vir de um
// Ato de Designação (ata de órgão colegiado): o valor de referência nunca
// passa do ValorMensal do ato vinculado (conferido no cadastro, na troca de
// valor e de novo na geração da folha), e o CPF do prebendado é o CPF do
// fornecedor PF que recebe (a prebenda de um ministro não sai para a conta de outra pessoa).
// Matéria da Tesouraria Geral — só o nível GERAL (papel Global com escopo de todas
// as congregações; Reg. Art. 134 §5º), nunca um tesoureiro local.
// GET  /api/prebendados -> lista
// GET  /api/prebendados/{id} -> detalhe
// POST /api/prebendados -> { membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio, atoDesignacaoId?, observacao? }
// PUT  /api/prebendados/{id} -> { acao: 'SUSPENDER'|'ENCERRAR'|'REATIVAR', valorMensalReferencia?, observacao? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { soDigitos, mascararCpf, dataIsoValida, idOpcional } = require("../shared/financeiroSeguro");

const ACOES = ["SUSPENDER", "ENCERRAR", "REATIVAR"];
const NAO_ENCONTRADO = { sucesso: false, mensagem: "Prebendado não encontrado." };

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
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

  if (req.method === "GET" && !rota.presente) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY p.Status, m.Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && rota.presente) {
    if (!id) { context.res = { status: 200, body: NAO_ENCONTRADO }; return; }
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE p.PrebendadoId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  if (req.method === "POST") {
    const { membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio, atoDesignacaoId, observacao } = req.body || {};
    if (!membroId || !fornecedorId || typeof cpf !== "string" || !cpf.trim() || !valorMensalReferencia || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, fornecedorId, cpf, valorMensalReferencia, dataInicio." } };
      return;
    }
    const membroNum = auth.idDeRota(membroId);
    const fornecedorNum = auth.idDeRota(fornecedorId);
    const ato = idOpcional(atoDesignacaoId);
    if (!membroNum || !fornecedorNum || (ato.presente && !ato.id)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "membroId, fornecedorId e atoDesignacaoId devem ser números válidos." } };
      return;
    }
    if (!Number.isFinite(Number(valorMensalReferencia)) || Number(valorMensalReferencia) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensalReferencia deve ser maior que zero." } };
      return;
    }
    if (!dataIsoValida(dataInicio)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "dataInicio deve estar no formato AAAA-MM-DD." } };
      return;
    }
    const cpfLimpo = cpf.trim();

    const membro = await pool.request().input("id", sql.Int, membroNum).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Membro (ministro) não encontrado. Cadastre a pessoa antes." } };
      return;
    }

    // Vedação à "pejotização" (item 5): o ministro não recebe prebenda via
    // fornecedor PJ — a relação é eclesiástica, regida pela ata de posse,
    // nunca por Pessoa Jurídica prestando serviço ministerial.
    const fornecedor = await pool.request().input("id", sql.Int, fornecedorNum).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
    if (fornecedor.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
      return;
    }
    if (fornecedor.recordset[0].Tipo !== "PF") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prebenda é paga a pessoa física (natureza alimentar, sem vínculo CLT). Cadastrar ministro como fornecedor PJ é vedado (Art. 134-A §1º, pejotização) — use um fornecedor PF." } };
      return;
    }
    // A conta que recebe é a do próprio ministro: o CPF do fornecedor PF tem de ser o CPF informado (com ou sem máscara).
    if (soDigitos(fornecedor.recordset[0].CpfCnpj) !== soDigitos(cpfLimpo)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O CPF do fornecedor PF não confere com o CPF do prebendado — a prebenda só pode sair para a conta do próprio ministro." } };
      return;
    }

    const existenteCpf = await pool.request().input("cpf", sql.VarChar(14), cpfLimpo).query(`SELECT PrebendadoId FROM Prebendados WHERE Cpf = @cpf`);
    if (existenteCpf.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe prebendado com esse CPF." } };
      return;
    }

    if (ato.presente) {
      const atoRow = await pool.request().input("id", sql.Int, ato.id).query(`SELECT AtoDesignacaoId, MembroId, ValorMensal FROM AtosDesignacao WHERE AtoDesignacaoId = @id`);
      if (atoRow.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Ato de designação não encontrado." } };
        return;
      }
      if (atoRow.recordset[0].MembroId !== membroNum) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O ato de designação pertence a outro ministro." } };
        return;
      }
      // O valor vem do ato (ata de órgão colegiado): nunca acima do que foi deliberado.
      if (Number(valorMensalReferencia) > Number(atoRow.recordset[0].ValorMensal)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `O valor mensal de referência não pode passar do valor do Ato de Designação (R$ ${Number(atoRow.recordset[0].ValorMensal).toFixed(2)}).` } };
        return;
      }
    }

    const criado = await pool.request()
      .input("membroId", sql.Int, membroNum).input("fornecedorId", sql.Int, fornecedorNum)
      .input("cpf", sql.VarChar(14), cpfLimpo).input("valor", sql.Decimal(10, 2), valorMensalReferencia)
      .input("dataInicio", sql.Date, dataInicio).input("atoDesignacaoId", sql.Int, ato.id || null)
      .input("observacao", sql.NVarChar(300), observacao || null).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO Prebendados (MembroId, FornecedorId, Cpf, ValorMensalReferencia, DataInicio, AtoDesignacaoId, Observacao, CriadoPor)
              OUTPUT INSERTED.PrebendadoId VALUES (@membroId, @fornecedorId, @cpf, @valor, @dataInicio, @atoDesignacaoId, @observacao, @criadoPor)`);
    const prebendadoId = criado.recordset[0].PrebendadoId;

    // O CPF não vai inteiro para a trilha (só os 2 últimos dígitos): a trilha é lida por outros papéis (Encarregado de Dados, auditoria).
    await registrarAuditoria({
      tabela: "Prebendados", registroId: prebendadoId, acao: "Cadastrou prebendado", usuarioId: usuario.membroId,
      dadosDepois: { membroId: membroNum, fornecedorId: fornecedorNum, cpf: mascararCpf(cpfLimpo), valorMensalReferencia, dataInicio, atoDesignacaoId: ato.id || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Prebendado cadastrado.", prebendadoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!rota.presente) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/prebendados/{id}" } };
      return;
    }
    if (!id) { context.res = { status: 200, body: NAO_ENCONTRADO }; return; }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Prebendados WHERE PrebendadoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, valorMensalReferencia, observacao } = req.body || {};

    if (acao && !ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    const novoValor = valorMensalReferencia !== undefined ? valorMensalReferencia : registro.ValorMensalReferencia;
    if (!Number.isFinite(Number(novoValor)) || Number(novoValor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorMensalReferencia deve ser maior que zero." } };
      return;
    }
    // Trocar o valor de referência continua preso ao ato: com ato vinculado, o novo valor não passa do ValorMensal dele.
    if (valorMensalReferencia !== undefined && registro.AtoDesignacaoId) {
      const atoRow = await pool.request().input("id", sql.Int, registro.AtoDesignacaoId).query(`SELECT ValorMensal FROM AtosDesignacao WHERE AtoDesignacaoId = @id`);
      if (atoRow.recordset.length > 0 && Number(novoValor) > Number(atoRow.recordset[0].ValorMensal)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `O valor mensal de referência não pode passar do valor do Ato de Designação (R$ ${Number(atoRow.recordset[0].ValorMensal).toFixed(2)}).` } };
        return;
      }
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
      tabela: "Prebendados", registroId: id, acao: acao ? `Atualizou prebendado (${acao})` : "Atualizou prebendado",
      usuarioId: usuario.membroId, dadosAntes: Object.assign({}, registro, { Cpf: mascararCpf(registro.Cpf) }), dadosDepois: { valorMensalReferencia: novoValor, status: novoStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Prebendado atualizado." } };
    return;
  }
};
