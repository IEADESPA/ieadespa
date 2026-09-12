// GestaoBensPatrimoniais (v4.11 — itens 1 e 5)
// Inventário de bens patrimoniais (Reg. Art. 58 do Estatuto: tudo em nome
// da Matriz). Cada bem tem vida útil e valor residual pra depreciação
// LINEAR, calculada na leitura (shared/patrimonio.js) e que alimenta o
// Balanço Patrimonial (v4.9). Registrado com escopo por congregação.
// GET  /api/bens-patrimoniais?congregacaoId=&tipo= -> lista
// GET  /api/bens-patrimoniais/{id} -> detalhe (depreciação + valor líquido)
// POST /api/bens-patrimoniais -> { congregacaoId?, tipo, descricao, valorAquisicao, dataAquisicao, vidaUtilMeses?, valorResidual?, ehTemploSede? }
// PUT  /api/bens-patrimoniais/{id} -> { acao?: 'BAIXAR', ...campos }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const patrimonio = require("../shared/patrimonio");

const TIPOS = ["IMOVEL", "VEICULO", "EQUIPAMENTO", "MOVEL", "CASA_PASTORAL", "OUTROS"];

function linhaParaJson(b, dataCorte) {
  return {
    bemId: b.BemId, congregacaoId: b.CongregacaoId, congregacaoNome: b.congregacaoNome,
    tipo: b.Tipo, descricao: b.Descricao, valorAquisicao: b.ValorAquisicao,
    dataAquisicao: b.DataAquisicao, vidaUtilMeses: b.VidaUtilMeses, valorResidual: b.ValorResidual,
    ehTemploSede: b.EhTemploSede, status: b.Status,
    depreciacaoAcumulada: patrimonio.depreciacaoAcumulada(b, dataCorte),
    valorContabilLiquido: patrimonio.valorContabilLiquido(b, dataCorte)
  };
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const dataCorte = new Date();

  if (req.method === "GET" && !id) {
    const { congregacaoId, tipo } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND b.CongregacaoId = @congregacaoId"; }
    if (tipo) { request.input("tipo", sql.NVarChar(30), tipo); where += " AND b.Tipo = @tipo"; }
    const result = await request.query(`
      SELECT b.*, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE ${where} ORDER BY b.Status, b.Descricao
    `);
    const bens = result.recordset.filter(b => auth.estaNoEscopo(usuario, b.congregacaoNome)).map(b => linhaParaJson(b, dataCorte));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: bens };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT b.*, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId WHERE b.BemId = @id
    `);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Bem não encontrado." } };
      return;
    }
    const bem = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, bem.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhaParaJson(bem, dataCorte) };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, tipo, descricao, valorAquisicao, dataAquisicao, vidaUtilMeses, valorResidual, ehTemploSede } = req.body || {};
    if (!tipo || !descricao || !descricao.trim() || !valorAquisicao || !dataAquisicao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, descricao, valorAquisicao, dataAquisicao." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (Number(valorAquisicao) < 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorAquisicao não pode ser negativo." } };
      return;
    }
    if (congregacaoId) {
      const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
      if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
        return;
      }
    }

    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId || null).input("tipo", sql.NVarChar(30), tipo)
      .input("descricao", sql.NVarChar(300), descricao.trim()).input("valorAquisicao", sql.Decimal(12, 2), valorAquisicao)
      .input("dataAquisicao", sql.Date, dataAquisicao).input("vidaUtilMeses", sql.Int, vidaUtilMeses || null)
      .input("valorResidual", sql.Decimal(12, 2), valorResidual || null).input("ehTemploSede", sql.Bit, ehTemploSede ? 1 : 0)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO BensPatrimoniais (CongregacaoId, Tipo, Descricao, ValorAquisicao, DataAquisicao, VidaUtilMeses, ValorResidual, EhTemploSede, RegistradoPor)
              OUTPUT INSERTED.BemId VALUES (@congregacaoId, @tipo, @descricao, @valorAquisicao, @dataAquisicao, @vidaUtilMeses, @valorResidual, @ehTemploSede, @registradoPor)`);
    await registrarAuditoria({
      tabela: "BensPatrimoniais", registroId: criado.recordset[0].BemId, acao: "Cadastrou bem patrimonial", usuarioId: usuario.membroId,
      dadosDepois: { tipo, descricao, valorAquisicao, dataAquisicao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Bem patrimonial cadastrado.", bemId: criado.recordset[0].BemId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/bens-patrimoniais/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM BensPatrimoniais WHERE BemId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Bem não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, descricao, valorAquisicao, vidaUtilMeses, valorResidual } = req.body || {};
    const novoStatus = acao === "BAIXAR" ? "BAIXADO" : registro.Status;
    const novaDescricao = descricao !== undefined ? descricao.trim() : registro.Descricao;
    const novoValor = valorAquisicao !== undefined ? valorAquisicao : registro.ValorAquisicao;
    const novaVida = vidaUtilMeses !== undefined ? (vidaUtilMeses || null) : registro.VidaUtilMeses;
    const novoResidual = valorResidual !== undefined ? (valorResidual || null) : registro.ValorResidual;

    await pool.request().input("id", sql.Int, id)
      .input("descricao", sql.NVarChar(300), novaDescricao).input("valorAquisicao", sql.Decimal(12, 2), novoValor)
      .input("vidaUtilMeses", sql.Int, novaVida).input("valorResidual", sql.Decimal(12, 2), novoResidual)
      .input("status", sql.NVarChar(20), novoStatus)
      .query(`UPDATE BensPatrimoniais SET Descricao = @descricao, ValorAquisicao = @valorAquisicao, VidaUtilMeses = @vidaUtilMeses, ValorResidual = @valorResidual, Status = @status WHERE BemId = @id`);

    await registrarAuditoria({
      tabela: "BensPatrimoniais", registroId: Number(id), acao: acao === "BAIXAR" ? "Baixou bem patrimonial" : "Atualizou bem patrimonial",
      usuarioId: usuario.membroId, dadosAntes: registro, dadosDepois: { descricao: novaDescricao, status: novoStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Bem patrimonial atualizado." } };
    return;
  }
};

