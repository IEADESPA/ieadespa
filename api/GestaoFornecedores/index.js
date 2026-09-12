// GestaoFornecedores (v4.5)
// Cadastro de Fornecedores — pré-requisito pra pagar qualquer um
// (SaidasTesouraria exige FornecedorId). Compartilhado entre todas as
// congregações (fornecedor não pertence a uma congregação específica).
// Proteção contra o vetor de fraude nº1 apontado pela pesquisa de mercado:
// mudar os dados bancários de um fornecedor (o golpe clássico é trocar a
// chave PIX/conta de um fornecedor real pra desviar um pagamento já
// aprovado) DESCONFIRMA os dados automaticamente — nenhum pagamento sai
// pra esse fornecedor até outra pessoa (nunca quem alterou — segregação
// de funções) confirmar que a mudança é legítima
// (ver ConfirmarDadosBancariosFornecedor).
// GET  /api/fornecedores -> lista
// GET  /api/fornecedores/{id} -> detalhe
// POST /api/fornecedores -> { nome, cpfCnpj, tipo, telefone?, email?, banco?, agencia?, conta?, tipoConta?, chavePix? }
// PUT  /api/fornecedores/{id} -> mesmos campos (mudar dado bancário desconfirma)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const prebenda = require("../shared/prebenda");

const TIPOS = ["PF", "PJ"];
const CAMPOS_BANCARIOS = ["banco", "agencia", "conta", "tipoConta", "chavePix"];

function linhaParaJson(l) {
  return {
    fornecedorId: l.FornecedorId, nome: l.Nome, cpfCnpj: l.CpfCnpj, tipo: l.Tipo,
    telefone: l.Telefone, email: l.Email, banco: l.Banco, agencia: l.Agencia, conta: l.Conta,
    tipoConta: l.TipoConta, chavePix: l.ChavePix, dadosBancariosConfirmados: l.DadosBancariosConfirmados,
    ativo: l.Ativo
  };
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`SELECT * FROM Fornecedores ORDER BY Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map(linhaParaJson) };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhaParaJson(result.recordset[0]) };
    return;
  }

  if (req.method === "POST") {
    const { nome, cpfCnpj, tipo, telefone, email, banco, agencia, conta, tipoConta, chavePix } = req.body || {};
    if (!nome || !nome.trim() || !cpfCnpj || !cpfCnpj.trim() || !tipo) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nome, cpfCnpj, tipo." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    // Vedação à "pejotização" (v4.10 — item 5): ministro com prebenda não
    // pode ser cadastrado como fornecedor PJ prestando serviço ministerial.
    // A relação é eclesiástica, regida pela ata de posse (Reg. Art. 134-A §1º).
    if (tipo === "PJ") {
      const ministro = await prebenda.prebendadoComCpf(pool, sql, cpfCnpj);
      if (ministro) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Vedação à pejotização (Reg. Art. 134-A §1º): este CPF pertence a um ministro com prebenda — ele não pode ser cadastrado como fornecedor PJ prestando serviço ministerial." } };
        return;
      }
    }
    const existente = await pool.request().input("cpfCnpj", sql.VarChar(18), cpfCnpj.trim()).query(`SELECT FornecedorId FROM Fornecedores WHERE CpfCnpj = @cpfCnpj`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um fornecedor cadastrado com esse CPF/CNPJ." } };
      return;
    }
    const similar = await pool.request().input("nome", sql.NVarChar(200), `%${nome.trim()}%`).query(`SELECT TOP 1 Nome FROM Fornecedores WHERE Nome LIKE @nome`);
    const avisoDuplicidade = similar.recordset.length > 0 ? ` Atenção: já existe um fornecedor com nome parecido ("${similar.recordset[0].Nome}") — confira antes de duplicar.` : "";

    const criado = await pool.request()
      .input("nome", sql.NVarChar(200), nome.trim())
      .input("cpfCnpj", sql.VarChar(18), cpfCnpj.trim())
      .input("tipo", sql.NVarChar(2), tipo)
      .input("telefone", sql.NVarChar(20), telefone || null)
      .input("email", sql.NVarChar(200), email || null)
      .input("banco", sql.NVarChar(100), banco || null)
      .input("agencia", sql.NVarChar(20), agencia || null)
      .input("conta", sql.NVarChar(30), conta || null)
      .input("tipoConta", sql.NVarChar(20), tipoConta || null)
      .input("chavePix", sql.NVarChar(200), chavePix || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Telefone, Email, Banco, Agencia, Conta, TipoConta, ChavePix, CriadoPor)
              OUTPUT INSERTED.FornecedorId
              VALUES (@nome, @cpfCnpj, @tipo, @telefone, @email, @banco, @agencia, @conta, @tipoConta, @chavePix, @criadoPor)`);
    const fornecedorId = criado.recordset[0].FornecedorId;

    await registrarAuditoria({
      tabela: "Fornecedores", registroId: fornecedorId, acao: "Cadastrou fornecedor", usuarioId: usuario.membroId,
      dadosDepois: { nome, cpfCnpj, tipo }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Fornecedor cadastrado.${avisoDuplicidade}`, fornecedorId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/fornecedores/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const dados = req.body || {};
    const mudouDadoBancario = CAMPOS_BANCARIOS.some(campo => dados[campo] !== undefined && dados[campo] !== registro[campo.charAt(0).toUpperCase() + campo.slice(1)]);

    const request = pool.request().input("id", sql.Int, id)
      .input("nome", sql.NVarChar(200), dados.nome !== undefined ? dados.nome.trim() : registro.Nome)
      .input("telefone", sql.NVarChar(20), dados.telefone !== undefined ? (dados.telefone || null) : registro.Telefone)
      .input("email", sql.NVarChar(200), dados.email !== undefined ? (dados.email || null) : registro.Email)
      .input("banco", sql.NVarChar(100), dados.banco !== undefined ? (dados.banco || null) : registro.Banco)
      .input("agencia", sql.NVarChar(20), dados.agencia !== undefined ? (dados.agencia || null) : registro.Agencia)
      .input("conta", sql.NVarChar(30), dados.conta !== undefined ? (dados.conta || null) : registro.Conta)
      .input("tipoConta", sql.NVarChar(20), dados.tipoConta !== undefined ? (dados.tipoConta || null) : registro.TipoConta)
      .input("chavePix", sql.NVarChar(200), dados.chavePix !== undefined ? (dados.chavePix || null) : registro.ChavePix)
      .input("ativo", sql.Bit, dados.ativo !== undefined ? dados.ativo : registro.Ativo)
      .input("dadosBancariosConfirmados", sql.Bit, mudouDadoBancario ? 0 : registro.DadosBancariosConfirmados)
      .input("dadosBancariosAlteradoPor", sql.Int, mudouDadoBancario ? usuario.membroId : registro.DadosBancariosAlteradoPor)
      .input("dadosBancariosAlteradoEm", sql.DateTime2, mudouDadoBancario ? new Date() : registro.DadosBancariosAlteradoEm);

    await request.query(`UPDATE Fornecedores SET Nome = @nome, Telefone = @telefone, Email = @email, Banco = @banco, Agencia = @agencia,
        Conta = @conta, TipoConta = @tipoConta, ChavePix = @chavePix, Ativo = @ativo,
        DadosBancariosConfirmados = @dadosBancariosConfirmados, DadosBancariosAlteradoPor = @dadosBancariosAlteradoPor,
        DadosBancariosAlteradoEm = @dadosBancariosAlteradoEm
        ${mudouDadoBancario ? ", ConfirmadoPor = NULL, ConfirmadoEm = NULL" : ""}
      WHERE FornecedorId = @id`);

    await registrarAuditoria({
      tabela: "Fornecedores", registroId: Number(id), acao: mudouDadoBancario ? "Alterou dados bancários do fornecedor (aguardando confirmação)" : "Atualizou fornecedor",
      usuarioId: usuario.membroId, dadosAntes: registro, dadosDepois: dados
    });
    const aviso = mudouDadoBancario ? " ⚠️ Dados bancários alterados — pagamentos a este fornecedor ficam bloqueados até outra pessoa confirmar a mudança." : "";
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Fornecedor atualizado.${aviso}` } };
    return;
  }
};
