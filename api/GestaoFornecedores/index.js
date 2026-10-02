// GestaoFornecedores (v4.5)
// Cadastro de Fornecedores — pré-requisito pra pagar qualquer um
// (SaidasTesouraria exige FornecedorId). Compartilhado entre todas as
// congregações (fornecedor não pertence a uma congregação específica):
// dado INSTITUCIONAL, e o pastor prebendado é um fornecedor PF (Prebendados.FornecedorId).
// Escopo: o tesoureiro local precisa da LISTA para escolher o fornecedor de uma Saída, então
// ele lê só o mínimo (id, nome, tipo, ativo e se os dados bancários estão confirmados) — sem
// CPF/CNPJ, telefone, e-mail nem banco/agência/conta/PIX — e nunca vê os prebendados. Ele pode
// CADASTRAR fornecedor, mas ALTERAR dado bancário é só do nível GERAL (papel Global + escopo
// TODAS); quem cadastra com dado bancário deixa o fornecedor pendente de confirmação.
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
// PUT  /api/fornecedores/{id} -> mesmos campos (mudar dado bancário desconfirma; só o geral muda dado bancário)
const auth = require("../shared/auth");
const { ehGeral, MSG_GERAL } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const prebenda = require("../shared/prebenda");
const { fornecedorParaAuditoria, idOpcional } = require("../shared/financeiro1Util");

const TIPOS = ["PF", "PJ"];
const CAMPOS_BANCARIOS = ["banco", "agencia", "conta", "tipoConta", "chavePix"];
const NAO_ENCONTRADO = { sucesso: false, mensagem: "Fornecedor não encontrado." };

function linhaParaJson(l) {
  return {
    fornecedorId: l.FornecedorId, nome: l.Nome, cpfCnpj: l.CpfCnpj, tipo: l.Tipo,
    telefone: l.Telefone, email: l.Email, banco: l.Banco, agencia: l.Agencia, conta: l.Conta,
    tipoConta: l.TipoConta, chavePix: l.ChavePix, dadosBancariosConfirmados: l.DadosBancariosConfirmados,
    ativo: l.Ativo
  };
}

// O que o tesoureiro local enxerga: o suficiente para escolher o fornecedor numa Saída.
function linhaMinima(l) {
  return { fornecedorId: l.FornecedorId, nome: l.Nome, tipo: l.Tipo, ativo: l.Ativo, dadosBancariosConfirmados: l.DadosBancariosConfirmados };
}

// Fornecedor que é prebendado (pastor): fora da vista de quem não é geral.
const SEM_PREBENDADOS = `NOT EXISTS (SELECT 1 FROM Prebendados pb WHERE pb.FornecedorId = f.FornecedorId)`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const geral = ehGeral(usuario);
  const { tem: temId, id } = idOpcional(context.bindingData.id);
  if (temId && !id) {
    context.res = { status: 200, body: NAO_ENCONTRADO };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !temId) {
    const result = geral
      ? await pool.request().query(`SELECT * FROM Fornecedores ORDER BY Nome`)
      : await pool.request().query(`SELECT f.FornecedorId, f.Nome, f.Tipo, f.Ativo, f.DadosBancariosConfirmados FROM Fornecedores f WHERE ${SEM_PREBENDADOS} ORDER BY f.Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map(geral ? linhaParaJson : linhaMinima) };
    return;
  }

  if (req.method === "GET" && temId) {
    const result = geral
      ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`)
      : await pool.request().input("id", sql.Int, id).query(`SELECT f.FornecedorId, f.Nome, f.Tipo, f.Ativo, f.DadosBancariosConfirmados FROM Fornecedores f WHERE f.FornecedorId = @id AND ${SEM_PREBENDADOS}`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: (geral ? linhaParaJson : linhaMinima)(result.recordset[0]) };
    return;
  }

  if (req.method === "POST") {
    const { nome, cpfCnpj, tipo, telefone, email, banco, agencia, conta, tipoConta, chavePix } = req.body || {};
    if (typeof nome !== "string" || !nome.trim() || typeof cpfCnpj !== "string" || !cpfCnpj.trim() || !tipo) {
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
    // Quem não é geral recebe uma recusa que não diz quem é prebendado.
    if (tipo === "PJ") {
      const ministro = await prebenda.prebendadoComCpf(pool, sql, cpfCnpj);
      if (ministro) {
        const mensagem = geral
          ? "Vedação à pejotização (Reg. Art. 134-A §1º): este CPF pertence a um ministro com prebenda — ele não pode ser cadastrado como fornecedor PJ prestando serviço ministerial."
          : "Não foi possível cadastrar este CPF/CNPJ como fornecedor. Procure a administração geral.";
        context.res = { status: 200, body: { sucesso: false, mensagem } };
        return;
      }
    }
    const existente = await pool.request().input("cpfCnpj", sql.VarChar(18), cpfCnpj.trim()).query(`SELECT FornecedorId FROM Fornecedores WHERE CpfCnpj = @cpfCnpj`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um fornecedor cadastrado com esse CPF/CNPJ." } };
      return;
    }
    // O aviso de nome parecido não revela o nome de um prebendado a quem não é geral.
    const similar = await pool.request().input("nome", sql.NVarChar(200), `%${nome.trim()}%`)
      .query(`SELECT TOP 1 f.Nome FROM Fornecedores f WHERE f.Nome LIKE @nome${geral ? "" : ` AND ${SEM_PREBENDADOS}`}`);
    const avisoDuplicidade = similar.recordset.length > 0 ? ` Atenção: já existe um fornecedor com nome parecido ("${similar.recordset[0].Nome}") — confira antes de duplicar.` : "";

    // Qualquer dado bancário informado no cadastro nasce PENDENTE de confirmação de outra pessoa (antes nascia confirmado e pulava a segregação de funções).
    const temDadoBancario = CAMPOS_BANCARIOS.some(campo => !!(req.body || {})[campo]);
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
      .input("confirmados", sql.Bit, temDadoBancario ? 0 : 1)
      .input("alteradoPor", sql.Int, temDadoBancario ? usuario.membroId : null)
      .input("alteradoEm", sql.DateTime2, temDadoBancario ? new Date() : null)
      .query(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Telefone, Email, Banco, Agencia, Conta, TipoConta, ChavePix, CriadoPor, DadosBancariosConfirmados, DadosBancariosAlteradoPor, DadosBancariosAlteradoEm)
              OUTPUT INSERTED.FornecedorId
              VALUES (@nome, @cpfCnpj, @tipo, @telefone, @email, @banco, @agencia, @conta, @tipoConta, @chavePix, @criadoPor, @confirmados, @alteradoPor, @alteradoEm)`);
    const fornecedorId = criado.recordset[0].FornecedorId;

    await registrarAuditoria({
      tabela: "Fornecedores", registroId: fornecedorId, acao: temDadoBancario ? "Cadastrou fornecedor com dados bancários (aguardando confirmação)" : "Cadastrou fornecedor", usuarioId: usuario.membroId,
      dadosDepois: fornecedorParaAuditoria({ nome, cpfCnpj, tipo, comDadosBancarios: temDadoBancario })
    });
    const aviso = temDadoBancario ? " ⚠️ Dados bancários informados — pagamentos a este fornecedor ficam bloqueados até outra pessoa da Tesouraria confirmar." : "";
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Fornecedor cadastrado.${avisoDuplicidade}${aviso}`, fornecedorId } };
    return;
  }

  if (req.method === "PUT") {
    if (!temId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/fornecedores/{id}" } };
      return;
    }
    // Quem não é geral nem enxerga o prebendado: a mesma resposta de "não encontrado".
    const atual = geral
      ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`)
      : await pool.request().input("id", sql.Int, id).query(`SELECT f.* FROM Fornecedores f WHERE f.FornecedorId = @id AND ${SEM_PREBENDADOS}`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }
    const registro = atual.recordset[0];
    const dados = req.body || {};
    if (dados.nome !== undefined && (typeof dados.nome !== "string" || !dados.nome.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Nome inválido." } };
      return;
    }
    const camposBancariosAlterados = CAMPOS_BANCARIOS.filter(campo => dados[campo] !== undefined && dados[campo] !== registro[campo.charAt(0).toUpperCase() + campo.slice(1)]);
    const mudouDadoBancario = camposBancariosAlterados.length > 0;
    // Trocar banco/agência/conta/PIX é o vetor da fraude nº1: só o geral. A segregação continua — quem alterou não confirma.
    if (mudouDadoBancario && !geral) {
      context.res = { status: 403, body: { sucesso: false, mensagem: MSG_GERAL } };
      return;
    }

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

    // Trilha: o registro e o corpo entram com CPF/banco mascarados; os campos bancários que mudaram vão por nome.
    await registrarAuditoria({
      tabela: "Fornecedores", registroId: id, acao: mudouDadoBancario ? "Alterou dados bancários do fornecedor (aguardando confirmação)" : "Atualizou fornecedor",
      usuarioId: usuario.membroId, dadosAntes: fornecedorParaAuditoria(registro),
      dadosDepois: Object.assign(fornecedorParaAuditoria({ nome: dados.nome, telefone: dados.telefone, email: dados.email, banco: dados.banco, agencia: dados.agencia, conta: dados.conta, tipoConta: dados.tipoConta, chavePix: dados.chavePix, ativo: dados.ativo }), { camposBancariosAlterados })
    });
    const aviso = mudouDadoBancario ? " ⚠️ Dados bancários alterados — pagamentos a este fornecedor ficam bloqueados até outra pessoa confirmar a mudança." : "";
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Fornecedor atualizado.${aviso}` } };
    return;
  }
};
