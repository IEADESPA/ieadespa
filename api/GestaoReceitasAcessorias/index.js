// GestaoReceitasAcessorias (v4.21 — Receitas acessórias e imóveis, itens 1 e 3)
// Súmula Vinculante 52 / RE 578.562: a imunidade do imóvel cedido ou alugado a
// terceiros só se mantém SE o valor arrecadado for aplicado nas finalidades
// essenciais — o ônus da prova é da igreja. Por isso toda receita acessória
// (bazar, estacionamento, cessão de salão, cantina de evento) exige, já na
// criação, a descrição da aplicação finalística (AplicacaoFinalisticaDescricao)
// — nunca nasce como entrada de caixa solta. Quando a aplicação já virou uma
// Saída lançada (v4.5), pode ser vinculada (PUT) como comprovação formal.
// Conectada com a v4.18: GestaoCessoesTemplo gera automaticamente uma receita
// acessória (Tipo = CESSAO_SALAO) sempre que a cessão é onerosa.
// GET  /api/receitas-acessorias -> lista (?bemId=&tipo=)
// GET  /api/receitas-acessorias/relatorio-origem-destino -> agregado por imóvel/evento: origem (arrecadado) x destino (comprovado)
// POST /api/receitas-acessorias -> { congregacaoId?, tipo, bemId?, eventoDescricao?, valor, dataRecebimento, aplicacaoFinalisticaDescricao, saidaId? }
// PUT  /api/receitas-acessorias -> { id, saidaId } — vincula a Saída que comprova a aplicação declarada
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const TIPOS = ["BAZAR", "ESTACIONAMENTO", "CESSAO_SALAO", "CANTINA_EVENTO", "OUTROS"];

function linhaParaJson(r) {
  return {
    receitaAcessoriaId: r.ReceitaAcessoriaId, congregacaoId: r.CongregacaoId, congregacaoNome: r.congregacaoNome,
    tipo: r.Tipo, bemId: r.BemId, bemDescricao: r.bemDescricao, cessaoTemploId: r.CessaoTemploId,
    eventoDescricao: r.EventoDescricao, valor: r.Valor, dataRecebimento: r.DataRecebimento,
    aplicacaoFinalisticaDescricao: r.AplicacaoFinalisticaDescricao,
    saidaId: r.SaidaId, comprovada: r.SaidaId != null
  };
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && recurso === "relatorio-origem-destino") {
    const result = await pool.request().query(`
      SELECT r.*, b.Descricao AS bemDescricao FROM ReceitasAcessorias r
      LEFT JOIN BensPatrimoniais b ON b.BemId = r.BemId ORDER BY r.DataRecebimento DESC
    `);
    const grupos = {};
    result.recordset.forEach(r => {
      const chave = r.bemDescricao || r.EventoDescricao || "Sem imóvel/evento vinculado";
      if (!grupos[chave]) grupos[chave] = { origemDestino: chave, totalArrecadado: 0, totalComprovado: 0, totalPendente: 0, lancamentos: 0 };
      const g = grupos[chave];
      g.totalArrecadado += Number(r.Valor);
      g.lancamentos += 1;
      if (r.SaidaId != null) g.totalComprovado += Number(r.Valor); else g.totalPendente += Number(r.Valor);
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.values(grupos) };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const { bemId, tipo } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (bemId) { request.input("bemId", sql.Int, bemId); where += " AND r.BemId = @bemId"; }
    if (tipo) { request.input("tipo", sql.NVarChar(30), tipo); where += " AND r.Tipo = @tipo"; }
    const result = await request.query(`
      SELECT r.*, b.Descricao AS bemDescricao, c.Nome AS congregacaoNome FROM ReceitasAcessorias r
      LEFT JOIN BensPatrimoniais b ON b.BemId = r.BemId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = r.CongregacaoId
      WHERE ${where} ORDER BY r.DataRecebimento DESC
    `);
    const lista = result.recordset.filter(r => auth.estaNoEscopo(usuario, r.congregacaoNome)).map(linhaParaJson);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { congregacaoId, tipo, bemId, eventoDescricao, valor, dataRecebimento, aplicacaoFinalisticaDescricao, saidaId } = req.body || {};
    if (!tipo || !valor || !dataRecebimento || !aplicacaoFinalisticaDescricao || !aplicacaoFinalisticaDescricao.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, valor, dataRecebimento, aplicacaoFinalisticaDescricao (Súmula Vinculante 52 — toda receita acessória precisa declarar pra onde o valor é aplicado nas finalidades essenciais)." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valor deve ser maior que zero." } };
      return;
    }
    if (congregacaoId) {
      const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
      if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
        return;
      }
    }
    const criada = await pool.request()
      .input("cong", sql.Int, congregacaoId || null).input("tipo", sql.NVarChar(30), tipo).input("bemId", sql.Int, bemId || null)
      .input("evento", sql.NVarChar(300), eventoDescricao || null).input("valor", sql.Decimal(12, 2), valor)
      .input("data", sql.Date, dataRecebimento).input("aplicacao", sql.NVarChar(500), aplicacaoFinalisticaDescricao.trim())
      .input("saidaId", sql.Int, saidaId || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ReceitasAcessorias (CongregacaoId, Tipo, BemId, EventoDescricao, Valor, DataRecebimento, AplicacaoFinalisticaDescricao, SaidaId, RegistradoPor)
              OUTPUT INSERTED.ReceitaAcessoriaId VALUES (@cong, @tipo, @bemId, @evento, @valor, @data, @aplicacao, @saidaId, @por)`);
    await registrarAuditoria({
      tabela: "ReceitasAcessorias", registroId: criada.recordset[0].ReceitaAcessoriaId, acao: "Registrou receita acessória", usuarioId: usuario.membroId,
      dadosDepois: { tipo, bemId, valor, aplicacaoFinalisticaDescricao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Receita acessória registrada.", receitaAcessoriaId: criada.recordset[0].ReceitaAcessoriaId } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { id, saidaId } = req.body || {};
    if (!id || !saidaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe id e saidaId (a Saída que comprova a aplicação declarada)." } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM ReceitasAcessorias WHERE ReceitaAcessoriaId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Receita acessória não encontrada." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("saidaId", sql.Int, saidaId)
      .query(`UPDATE ReceitasAcessorias SET SaidaId = @saidaId WHERE ReceitaAcessoriaId = @id`);
    await registrarAuditoria({
      tabela: "ReceitasAcessorias", registroId: Number(id), acao: "Vinculou comprovação de aplicação finalística", usuarioId: usuario.membroId,
      dadosDepois: { saidaId }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Comprovação vinculada." } };
  }
};
