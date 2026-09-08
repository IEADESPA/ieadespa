// GestaoCampanhas (v4.4; v4.4.1 remove o modelo de "Tipo=SORTEIO" com
// número individual vendido pelo sistema — ver GestaoSorteios)
// Campanhas de Arrecadação com Meta (ex: "Reforma do Templo"). Meta pode
// ser personalizada por congregação (CampanhaMetas: Congregação A
// R$1.000, Congregação B R$500) — a meta geral e o total arrecadado são
// sempre CALCULADOS NA LEITURA (soma das metas / soma dos
// LancamentosTesouraria vinculados via CampanhaId), nunca digitados à
// mão. Toda campanha nasce com fundo RESTRITO (CategoriasEntrada
// 'CAMPANHA', v4.2) — mesmo princípio de Revista/Congresso. Criar/
// encerrar/cancelar campanha é restrito a nível GLOBAL (é uma iniciativa
// que atravessa congregações — mesmo princípio de RegistrarRepasseTesouraria).
// Um Sorteio (GestaoSorteios) é um derivado opcional de uma campanha —
// não um Tipo dela: os cupons são físicos (impressos em gráfica, vendidos
// a qualquer pessoa, não só dizimista cadastrado), o sistema não controla
// número individual, só os prêmios e o resultado (registrado manualmente
// depois do sorteio físico acontecer).
// Cancelamento nunca é exclusão (mesmo princípio de v4.1.1): uma campanha
// vira Status=CANCELADA, nunca é apagada — quem já contribuiu continua
// com o lançamento preservado.
// GET  /api/campanhas -> lista com progresso calculado
// GET  /api/campanhas/{id} -> detalhe (metas por congregação + sorteios derivados)
// POST /api/campanhas -> { nome, descricao?, dataInicio, dataFim?, metas: [{congregacaoId, metaValor}] }
// PUT  /api/campanhas/{id} -> { nome?, descricao?, dataFim?, status?, metas? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const STATUS = ["ATIVA", "ENCERRADA", "CANCELADA"];

function exigirFinanceiroGlobal(req, context) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return null;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Criar, encerrar ou cancelar uma campanha é restrito a papéis de nível Global (atravessa congregações)." } };
    return null;
  }
  return usuario;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT c.CampanhaId AS campanhaId, c.Nome AS nome, c.Descricao AS descricao,
             CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), c.DataFim, 120) AS dataFim,
             c.Status AS status,
             ISNULL((SELECT SUM(MetaValor) FROM CampanhaMetas WHERE CampanhaId = c.CampanhaId), 0) AS metaTotal,
             ISNULL((SELECT SUM(Valor) FROM LancamentosTesouraria WHERE CampanhaId = c.CampanhaId AND Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'), 0) AS totalArrecadado,
             (SELECT COUNT(*) FROM Sorteios WHERE CampanhaId = c.CampanhaId) AS totalSorteios
      FROM Campanhas c
      ORDER BY c.Status ASC, c.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const campanha = await pool.request().input("id", sql.Int, id).query(`
      SELECT CampanhaId AS campanhaId, Nome AS nome, Descricao AS descricao,
             CONVERT(varchar(10), DataInicio, 120) AS dataInicio, CONVERT(varchar(10), DataFim, 120) AS dataFim,
             Status AS status
      FROM Campanhas WHERE CampanhaId = @id
    `);
    if (campanha.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
      return;
    }
    const metas = await pool.request().input("id", sql.Int, id).query(`
      SELECT cm.CongregacaoId AS congregacaoId, co.Nome AS congregacaoNome, cm.MetaValor AS metaValor,
             ISNULL((SELECT SUM(l.Valor) FROM LancamentosTesouraria l WHERE l.CampanhaId = cm.CampanhaId AND l.CongregacaoId = cm.CongregacaoId AND l.Status = 'ATIVO' AND l.StatusConfirmacao = 'CONFIRMADO'), 0) AS totalArrecadado
      FROM CampanhaMetas cm JOIN Congregacoes co ON co.CongregacaoId = cm.CongregacaoId
      WHERE cm.CampanhaId = @id
      ORDER BY co.Nome
    `);
    const sorteios = await pool.request().input("id", sql.Int, id).query(`
      SELECT SorteioId AS sorteioId, Nome AS nome, Descricao AS descricao, PrecoCupom AS precoCupom,
             CONVERT(varchar(10), DataSorteio, 120) AS dataSorteio, Status AS status
      FROM Sorteios WHERE CampanhaId = @id ORDER BY CriadoEm DESC
    `);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, campanha.recordset[0], { metas: metas.recordset, sorteios: sorteios.recordset })
    };
    return;
  }

  if (req.method === "POST") {
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const { nome, descricao, dataInicio, dataFim, metas } = req.body || {};
    if (!nome || !nome.trim() || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nome, dataInicio." } };
      return;
    }
    if (!Array.isArray(metas) || metas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma meta por congregação (metas: [{congregacaoId, metaValor}])." } };
      return;
    }
    for (const m of metas) {
      if (!m.congregacaoId || !m.metaValor || Number(m.metaValor) <= 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada meta precisa de congregacaoId e metaValor maior que zero." } };
        return;
      }
    }
    const congregacoesUnicas = new Set(metas.map(m => Number(m.congregacaoId)));
    if (congregacoesUnicas.size !== metas.length) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Não repita a mesma congregação em mais de uma meta." } };
      return;
    }

    const criada = await pool.request()
      .input("nome", sql.NVarChar(200), nome.trim())
      .input("descricao", sql.NVarChar(500), descricao ? descricao.trim() : null)
      .input("dataInicio", sql.Date, dataInicio)
      .input("dataFim", sql.Date, dataFim || null)
      .input("criadoPor", sql.Int, usuarioGlobal.membroId)
      .query(`INSERT INTO Campanhas (Nome, Descricao, DataInicio, DataFim, CriadoPor)
              OUTPUT INSERTED.CampanhaId
              VALUES (@nome, @descricao, @dataInicio, @dataFim, @criadoPor)`);
    const campanhaId = criada.recordset[0].CampanhaId;

    for (const m of metas) {
      await pool.request().input("campanhaId", sql.Int, campanhaId).input("congregacaoId", sql.Int, m.congregacaoId).input("metaValor", sql.Decimal(10, 2), m.metaValor)
        .query(`INSERT INTO CampanhaMetas (CampanhaId, CongregacaoId, MetaValor) VALUES (@campanhaId, @congregacaoId, @metaValor)`);
    }

    await registrarAuditoria({
      tabela: "Campanhas", registroId: campanhaId, acao: "Criou campanha", usuarioId: usuarioGlobal.membroId,
      dadosDepois: { nome, dataInicio, dataFim, metas }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Campanha criada.", campanhaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/campanhas/{id}" } };
      return;
    }
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Campanhas WHERE CampanhaId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    const { nome, descricao, dataFim, status, metas } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    if (registro.Status !== "ATIVA" && (nome || descricao !== undefined || dataFim !== undefined || (Array.isArray(metas) && metas.length > 0))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha encerrada ou cancelada — só é possível reabrir/fechar o status, não editar dados." } };
      return;
    }

    await pool.request()
      .input("id", sql.Int, id)
      .input("nome", sql.NVarChar(200), nome ? nome.trim() : registro.Nome)
      .input("descricao", sql.NVarChar(500), descricao !== undefined ? (descricao ? descricao.trim() : null) : registro.Descricao)
      .input("dataFim", sql.Date, dataFim !== undefined ? (dataFim || null) : registro.DataFim)
      .input("status", sql.NVarChar(20), status || registro.Status)
      .query(`UPDATE Campanhas SET Nome = @nome, Descricao = @descricao, DataFim = @dataFim, Status = @status WHERE CampanhaId = @id`);

    if (Array.isArray(metas)) {
      for (const m of metas) {
        if (!m.congregacaoId || !m.metaValor || Number(m.metaValor) <= 0) continue;
        await pool.request().input("campanhaId", sql.Int, id).input("congregacaoId", sql.Int, m.congregacaoId).input("metaValor", sql.Decimal(10, 2), m.metaValor)
          .query(`MERGE CampanhaMetas AS destino
                  USING (SELECT @campanhaId AS CampanhaId, @congregacaoId AS CongregacaoId) AS origem
                  ON destino.CampanhaId = origem.CampanhaId AND destino.CongregacaoId = origem.CongregacaoId
                  WHEN MATCHED THEN UPDATE SET MetaValor = @metaValor
                  WHEN NOT MATCHED THEN INSERT (CampanhaId, CongregacaoId, MetaValor) VALUES (@campanhaId, @congregacaoId, @metaValor);`);
      }
    }

    await registrarAuditoria({
      tabela: "Campanhas", registroId: Number(id), acao: "Atualizou campanha", usuarioId: usuarioGlobal.membroId,
      dadosAntes: registro, dadosDepois: { nome, descricao, dataFim, status, metas }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Campanha atualizada." } };
    return;
  }
};
