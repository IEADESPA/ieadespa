// GestaoCampanhas (v4.4)
// Campanhas de Arrecadação com Meta (ex: "Reforma do Templo") e Sorteios
// integrados como um tipo de campanha (Tipo=SORTEIO) — mesma base de dados,
// mesmo cálculo de progresso. Meta pode ser personalizada por congregação
// (CampanhaMetas: Congregação A R$1.000, Congregação B R$500) — a meta
// geral e o total arrecadado são sempre CALCULADOS NA LEITURA (soma das
// metas / soma dos LancamentosTesouraria vinculados via CampanhaId),
// nunca digitados à mão. Toda campanha nasce com fundo RESTRITO
// (CategoriasEntrada 'CAMPANHA', v4.2) — mesmo princípio de Revista/
// Congresso. Criar/encerrar/cancelar campanha e sortear são restritos a
// nível GLOBAL (é uma iniciativa que atravessa congregações — mesmo
// princípio de RegistrarRepasseTesouraria).
// Cancelamento nunca é exclusão (mesmo princípio de v4.1.1): uma campanha
// vira Status=CANCELADA, nunca é apagada — quem já contribuiu continua
// com o lançamento e o número de sorteio preservados.
// GET  /api/campanhas -> lista com progresso calculado
// GET  /api/campanhas/{id} -> detalhe (metas por congregação + números de sorteio)
// POST /api/campanhas -> { nome, descricao?, tipo, dataInicio, dataFim?, precoNumeroSorteio?, metas: [{congregacaoId, metaValor}] }
// PUT  /api/campanhas/{id} -> { nome?, descricao?, dataFim?, status?, metas? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const TIPOS = ["ARRECADACAO", "SORTEIO"];
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
      SELECT c.CampanhaId AS campanhaId, c.Nome AS nome, c.Descricao AS descricao, c.Tipo AS tipo,
             CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), c.DataFim, 120) AS dataFim,
             c.Status AS status, c.PrecoNumeroSorteio AS precoNumeroSorteio, c.NumeroVencedor AS numeroVencedor,
             ISNULL((SELECT SUM(MetaValor) FROM CampanhaMetas WHERE CampanhaId = c.CampanhaId), 0) AS metaTotal,
             ISNULL((SELECT SUM(Valor) FROM LancamentosTesouraria WHERE CampanhaId = c.CampanhaId AND Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'), 0) AS totalArrecadado,
             (SELECT COUNT(*) FROM CampanhaSorteioNumeros WHERE CampanhaId = c.CampanhaId) AS numerosVendidos
      FROM Campanhas c
      ORDER BY c.Status ASC, c.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const campanha = await pool.request().input("id", sql.Int, id).query(`
      SELECT CampanhaId AS campanhaId, Nome AS nome, Descricao AS descricao, Tipo AS tipo,
             CONVERT(varchar(10), DataInicio, 120) AS dataInicio, CONVERT(varchar(10), DataFim, 120) AS dataFim,
             Status AS status, PrecoNumeroSorteio AS precoNumeroSorteio, NumeroVencedor AS numeroVencedor,
             CONVERT(varchar(33), SorteadoEm, 126) AS sorteadoEm
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
    const numeros = await pool.request().input("id", sql.Int, id).query(`
      SELECT n.Numero AS numero, n.Sorteado AS sorteado, ISNULL(d.Nome, n.NomeAvulso) AS nome, CONVERT(varchar(10), n.CriadoEm, 120) AS dataVenda
      FROM CampanhaSorteioNumeros n LEFT JOIN Dizimistas d ON d.DizimistaId = n.DizimistaId
      WHERE n.CampanhaId = @id
      ORDER BY n.Numero
    `);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, campanha.recordset[0], { metas: metas.recordset, numerosSorteio: numeros.recordset })
    };
    return;
  }

  if (req.method === "POST") {
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const { nome, descricao, tipo, dataInicio, dataFim, precoNumeroSorteio, metas } = req.body || {};
    if (!nome || !nome.trim() || !tipo || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nome, tipo, dataInicio." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (tipo === "SORTEIO" && (!precoNumeroSorteio || Number(precoNumeroSorteio) <= 0)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campanha de sorteio exige precoNumeroSorteio maior que zero." } };
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
      .input("tipo", sql.NVarChar(20), tipo)
      .input("dataInicio", sql.Date, dataInicio)
      .input("dataFim", sql.Date, dataFim || null)
      .input("precoNumeroSorteio", sql.Decimal(10, 2), tipo === "SORTEIO" ? precoNumeroSorteio : null)
      .input("criadoPor", sql.Int, usuarioGlobal.membroId)
      .query(`INSERT INTO Campanhas (Nome, Descricao, Tipo, DataInicio, DataFim, PrecoNumeroSorteio, CriadoPor)
              OUTPUT INSERTED.CampanhaId
              VALUES (@nome, @descricao, @tipo, @dataInicio, @dataFim, @precoNumeroSorteio, @criadoPor)`);
    const campanhaId = criada.recordset[0].CampanhaId;

    for (const m of metas) {
      await pool.request().input("campanhaId", sql.Int, campanhaId).input("congregacaoId", sql.Int, m.congregacaoId).input("metaValor", sql.Decimal(10, 2), m.metaValor)
        .query(`INSERT INTO CampanhaMetas (CampanhaId, CongregacaoId, MetaValor) VALUES (@campanhaId, @congregacaoId, @metaValor)`);
    }

    await registrarAuditoria({
      tabela: "Campanhas", registroId: campanhaId, acao: "Criou campanha", usuarioId: usuarioGlobal.membroId,
      dadosDepois: { nome, tipo, dataInicio, dataFim, precoNumeroSorteio, metas }
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
