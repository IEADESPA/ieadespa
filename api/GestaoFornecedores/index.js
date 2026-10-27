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
// GET  /api/fornecedores?buscaMembro=texto -> { membros:[{ membroId, nome, congregacaoNome }] } (Trava 7-C) a busca do membro, no território de quem cadastra, para ligar o
//      fornecedor pessoa física à matrícula (`membroId` no POST e no PUT; null desliga). Só pessoa física e uma matrícula por fornecedor. A ligação serve aos avisos das regras
//      de dinheiro do voluntário ao lançar a saída (shared/voluntarioPagamento.js: voluntário ativo, pagamento habitual, cachê/comissão — decisão de 23/10/2026: só avisar).
const auth = require("../shared/auth");
const { ehGeral, MSG_GERAL } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const prebenda = require("../shared/prebenda");
const { fornecedorParaAuditoria, idOpcional } = require("../shared/financeiro1Util");
const { comConflito } = require("../shared/violacaoUnica");
const { pessoaAlcancavel } = require("../shared/escopoRotas");
const vpDb = require("../shared/voluntarioPagamentoDb");

const TIPOS = ["PF", "PJ"];
const CAMPOS_BANCARIOS = ["banco", "agencia", "conta", "tipoConta", "chavePix"];
const NAO_ENCONTRADO = { sucesso: false, mensagem: "Fornecedor não encontrado." };

function linhaParaJson(l) {
  return {
    fornecedorId: l.FornecedorId, nome: l.Nome, cpfCnpj: l.CpfCnpj, tipo: l.Tipo,
    telefone: l.Telefone, email: l.Email, banco: l.Banco, agencia: l.Agencia, conta: l.Conta,
    tipoConta: l.TipoConta, chavePix: l.ChavePix, dadosBancariosConfirmados: l.DadosBancariosConfirmados,
    ativo: l.Ativo, membroId: l.MembroId || null, membroNome: l.MembroNome || null
  };
}

// O que o tesoureiro local enxerga: o suficiente para escolher o fornecedor numa Saída.
function linhaMinima(l) {
  return { fornecedorId: l.FornecedorId, nome: l.Nome, tipo: l.Tipo, ativo: l.Ativo, dadosBancariosConfirmados: l.DadosBancariosConfirmados, membroVinculado: !!l.MembroId };
}

// (Trava 7-C) A matrícula que chega para ligar ao fornecedor: undefined = não mexe; null/"" = desliga; senão tem de ser o id de uma pessoa do território de quem
// cadastra (a mesma resposta para "não existe" e "fora do território"). Devolve { valor } ou { erro: { status, mensagem } }.
async function membroDoCorpo(pool, usuario, bruto, tipo) {
  if (bruto === undefined) return { valor: undefined };
  if (bruto === null || bruto === "") return { valor: null };
  const id = typeof bruto === "number" || typeof bruto === "string" ? auth.idDeRota(bruto) : null;
  if (!id) return { erro: { status: 400, mensagem: "membroId inválido." } };
  if (tipo !== "PF") return { erro: { status: 400, mensagem: "Só o fornecedor pessoa física se liga a uma matrícula de membro." } };
  if (!(await pessoaAlcancavel(pool, usuario, id))) return { erro: { status: 200, mensagem: "Membro não encontrado no seu território." } };
  return { valor: id };
}
const MSG_MEMBRO_JA_LIGADO = "Esta matrícula já está ligada a outro fornecedor.";

// Fornecedor que é prebendado (pastor): fora da vista de quem não é geral.
const SEM_PREBENDADOS = `NOT EXISTS (SELECT 1 FROM Prebendados pb WHERE pb.FornecedorId = f.FornecedorId)`;

// O CPF/CNPJ do fornecedor é único também no banco (restrição UNIQUE desde a migração 052): dois cadastros ao mesmo tempo furam a conferência "já existe um fornecedor", e o
// perdedor recebe o 409 em vez de um 500.
module.exports = comConflito(async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const geral = ehGeral(usuario);
  const { tem: temId, id } = idOpcional(context.bindingData.id);
  if (temId && !id) {
    context.res = { status: 200, body: NAO_ENCONTRADO };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !temId && (req.query || {}).buscaMembro !== undefined) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, membros: await vpDb.buscarMembros(pool, usuario, String(req.query.buscaMembro)) } };
    return;
  }

  if (req.method === "GET" && !temId) {
    const result = geral
      ? await pool.request().query(`SELECT f.*, m.Nome AS MembroNome FROM Fornecedores f LEFT JOIN MembroReferencia m ON m.MembroId = f.MembroId ORDER BY f.Nome`)
      : await pool.request().query(`SELECT f.FornecedorId, f.Nome, f.Tipo, f.Ativo, f.DadosBancariosConfirmados, f.MembroId FROM Fornecedores f WHERE ${SEM_PREBENDADOS} ORDER BY f.Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map(geral ? linhaParaJson : linhaMinima) };
    return;
  }

  if (req.method === "GET" && temId) {
    const result = geral
      ? await pool.request().input("id", sql.Int, id).query(`SELECT f.*, m.Nome AS MembroNome FROM Fornecedores f LEFT JOIN MembroReferencia m ON m.MembroId = f.MembroId WHERE f.FornecedorId = @id`)
      : await pool.request().input("id", sql.Int, id).query(`SELECT f.FornecedorId, f.Nome, f.Tipo, f.Ativo, f.DadosBancariosConfirmados, f.MembroId FROM Fornecedores f WHERE f.FornecedorId = @id AND ${SEM_PREBENDADOS}`);
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
    const membro = await membroDoCorpo(pool, usuario, (req.body || {}).membroId, tipo);
    if (membro.erro) {
      context.res = { status: membro.erro.status, body: { sucesso: false, mensagem: membro.erro.mensagem } };
      return;
    }
    if (membro.valor) {
      const ligado = await pool.request().input("m", sql.Int, membro.valor).query(`SELECT TOP 1 FornecedorId FROM Fornecedores WHERE MembroId = @m`);
      if (ligado.recordset.length > 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: MSG_MEMBRO_JA_LIGADO } };
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
      .input("membroId", sql.Int, membro.valor || null)
      .query(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Telefone, Email, Banco, Agencia, Conta, TipoConta, ChavePix, CriadoPor, DadosBancariosConfirmados, DadosBancariosAlteradoPor, DadosBancariosAlteradoEm, MembroId)
              OUTPUT INSERTED.FornecedorId
              VALUES (@nome, @cpfCnpj, @tipo, @telefone, @email, @banco, @agencia, @conta, @tipoConta, @chavePix, @criadoPor, @confirmados, @alteradoPor, @alteradoEm, @membroId)`);
    const fornecedorId = criado.recordset[0].FornecedorId;

    await registrarAuditoria({
      tabela: "Fornecedores", registroId: fornecedorId, acao: temDadoBancario ? "Cadastrou fornecedor com dados bancários (aguardando confirmação)" : "Cadastrou fornecedor", usuarioId: usuario.membroId,
      dadosDepois: Object.assign(fornecedorParaAuditoria({ nome, cpfCnpj, tipo, comDadosBancarios: temDadoBancario }), { membroId: membro.valor || null })
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
    // (Trava 7-C) Ligar ou desligar a matrícula: só pessoa física, só pessoa do território; uma matrícula por fornecedor.
    const membro = await membroDoCorpo(pool, usuario, dados.membroId, registro.Tipo);
    if (membro.erro) {
      context.res = { status: membro.erro.status, body: { sucesso: false, mensagem: membro.erro.mensagem } };
      return;
    }
    const mudaMembro = membro.valor !== undefined && Number(membro.valor || 0) !== Number(registro.MembroId || 0);
    if (mudaMembro && membro.valor) {
      const ligado = await pool.request().input("m", sql.Int, membro.valor).input("id", sql.Int, id).query(`SELECT TOP 1 FornecedorId FROM Fornecedores WHERE MembroId = @m AND FornecedorId <> @id`);
      if (ligado.recordset.length > 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: MSG_MEMBRO_JA_LIGADO } };
        return;
      }
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
      .input("dadosBancariosAlteradoEm", sql.DateTime2, mudouDadoBancario ? new Date() : registro.DadosBancariosAlteradoEm)
      .input("membroId", sql.Int, mudaMembro ? (membro.valor || null) : (registro.MembroId || null));

    await request.query(`UPDATE Fornecedores SET Nome = @nome, Telefone = @telefone, Email = @email, Banco = @banco, Agencia = @agencia,
        Conta = @conta, TipoConta = @tipoConta, ChavePix = @chavePix, Ativo = @ativo, MembroId = @membroId,
        DadosBancariosConfirmados = @dadosBancariosConfirmados, DadosBancariosAlteradoPor = @dadosBancariosAlteradoPor,
        DadosBancariosAlteradoEm = @dadosBancariosAlteradoEm
        ${mudouDadoBancario ? ", ConfirmadoPor = NULL, ConfirmadoEm = NULL" : ""}
      WHERE FornecedorId = @id`);

    // Trilha: o registro e o corpo entram com CPF/banco mascarados; os campos bancários que mudaram vão por nome.
    await registrarAuditoria({
      tabela: "Fornecedores", registroId: id, acao: mudouDadoBancario ? "Alterou dados bancários do fornecedor (aguardando confirmação)" : "Atualizou fornecedor",
      usuarioId: usuario.membroId, dadosAntes: fornecedorParaAuditoria(registro),
      dadosDepois: Object.assign(fornecedorParaAuditoria({ nome: dados.nome, telefone: dados.telefone, email: dados.email, banco: dados.banco, agencia: dados.agencia, conta: dados.conta, tipoConta: dados.tipoConta, chavePix: dados.chavePix, ativo: dados.ativo }), { camposBancariosAlterados },
        mudaMembro ? { membroIdAntes: registro.MembroId || null, membroId: membro.valor || null } : {})
    });
    const aviso = mudouDadoBancario ? " ⚠️ Dados bancários alterados — pagamentos a este fornecedor ficam bloqueados até outra pessoa confirmar a mudança." : "";
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Fornecedor atualizado.${aviso}` } };
    return;
  }
}, (erro) => (/UX_Fornecedores_Membro/.test(String((erro && erro.message) || "")) ? MSG_MEMBRO_JA_LIGADO : "Já existe um fornecedor cadastrado com esse CPF/CNPJ."));
