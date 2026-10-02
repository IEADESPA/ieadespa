// GestaoCampanhas (v4.4; v4.4.1 remove o modelo de "Tipo=SORTEIO" com
// número individual vendido pelo sistema — ver GestaoSorteios)
// Campanhas de Arrecadação com Meta (ex: "Reforma do Templo"). Meta pode
// ser personalizada por congregação (CampanhaMetas: Congregação A
// R$1.000, Congregação B R$500) — a meta geral e o total arrecadado são
// sempre CALCULADOS NA LEITURA (soma das metas / soma dos
// LancamentosTesouraria vinculados via CampanhaId), nunca digitados à
// mão. Toda campanha nasce com fundo RESTRITO (CategoriasEntrada
// 'CAMPANHA', v4.2) — mesmo princípio de Revista/Congresso. Criar/
// encerrar/cancelar campanha é restrito ao nível GERAL (papel Global + escopo TODAS: é uma
// iniciativa que atravessa congregações — mesmo princípio de RegistrarRepasseTesouraria).
// Escopo da LEITURA: a campanha em si é institucional (todo tesoureiro precisa vê-la para
// vincular uma Saída/Entrada), mas as metas e a arrecadação são por CONGREGAÇÃO — quem não é
// geral recebe os números só das congregações do seu escopo (a lista e o detalhe trazem
// `agregadoDoEscopo: true`).
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
const { ehGeral, exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { idOpcional, numeroPositivo } = require("../shared/financeiro1Util");

const STATUS = ["ATIVA", "ENCERRADA", "CANCELADA"];
const META_MAXIMA = 99999999.99; // DECIMAL(10,2)
const arredondar = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// As congregações da lista precisam existir (antes um id inexistente dava 500 de chave estrangeira no meio da gravação). Os ids já são inteiros canônicos (auth.idDeRota).
async function todasExistem(pool, ids) {
  if (ids.length === 0) return true;
  const r = await pool.request().query(`SELECT CongregacaoId FROM Congregacoes WHERE CongregacaoId IN (${ids.join(",")})`);
  return r.recordset.length === new Set(ids).size;
}

module.exports = async function (context, req) {
  // Criar e editar campanha é do nível geral; ler é de todo tesoureiro (com os números filtrados pelo escopo).
  const escrita = req.method === "POST" || req.method === "PUT";
  const usuario = escrita ? exigirGeral(req, context, "financeiro") : auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const geral = ehGeral(usuario);
  // Id malformado recebe a mesma resposta de "não existe".
  const { tem: temId, id } = idOpcional(context.bindingData.id);
  if (temId && !id) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    if (geral) {
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
    // Quem não é geral vê todas as campanhas (precisa vincular Saída/Entrada a elas), mas as metas e a arrecadação somam só as congregações do seu escopo.
    const campanhas = await pool.request().query(`
      SELECT c.CampanhaId AS campanhaId, c.Nome AS nome, c.Descricao AS descricao,
             CONVERT(varchar(10), c.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), c.DataFim, 120) AS dataFim,
             c.Status AS status,
             (SELECT COUNT(*) FROM Sorteios WHERE CampanhaId = c.CampanhaId) AS totalSorteios
      FROM Campanhas c
      ORDER BY c.Status ASC, c.CriadoEm DESC
    `);
    const metas = await pool.request().query(`
      SELECT cm.CampanhaId AS campanhaId, co.Nome AS congregacaoNome, cm.MetaValor AS metaValor
      FROM CampanhaMetas cm JOIN Congregacoes co ON co.CongregacaoId = cm.CongregacaoId
    `);
    const arrecadado = await pool.request().query(`
      SELECT l.CampanhaId AS campanhaId, co.Nome AS congregacaoNome, SUM(l.Valor) AS total
      FROM LancamentosTesouraria l JOIN Congregacoes co ON co.CongregacaoId = l.CongregacaoId
      WHERE l.CampanhaId IS NOT NULL AND l.Status = 'ATIVO' AND l.StatusConfirmacao = 'CONFIRMADO'
      GROUP BY l.CampanhaId, co.Nome
    `);
    const somaDoEscopo = (linhas, campanhaId, campo) => arredondar(linhas
      .filter(l => l.campanhaId === campanhaId && auth.estaNoEscopo(usuario, l.congregacaoNome))
      .reduce((soma, l) => soma + Number(l[campo]), 0));
    const corpo = campanhas.recordset.map(c => Object.assign({}, c, {
      metaTotal: somaDoEscopo(metas.recordset, c.campanhaId, "metaValor"),
      totalArrecadado: somaDoEscopo(arrecadado.recordset, c.campanhaId, "total"),
      agregadoDoEscopo: true
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: corpo };
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
    const metasVisiveis = geral ? metas.recordset : metas.recordset.filter(m => auth.estaNoEscopo(usuario, m.congregacaoNome));
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, campanha.recordset[0], { metas: metasVisiveis, sorteios: sorteios.recordset }, geral ? {} : { agregadoDoEscopo: true })
    };
    return;
  }

  if (req.method === "POST") {
    const { nome, descricao, dataInicio, dataFim, metas } = req.body || {};
    if (typeof nome !== "string" || !nome.trim() || !dataInicio) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nome, dataInicio." } };
      return;
    }
    if (!Array.isArray(metas) || metas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma meta por congregação (metas: [{congregacaoId, metaValor}])." } };
      return;
    }
    const metasValidas = [];
    for (const m of metas) {
      const congregacaoId = m ? auth.idDeRota(m.congregacaoId) : null;
      const metaValor = m ? numeroPositivo(m.metaValor, META_MAXIMA) : null;
      if (!congregacaoId || metaValor === null) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada meta precisa de congregacaoId e metaValor maior que zero." } };
        return;
      }
      metasValidas.push({ congregacaoId, metaValor });
    }
    const congregacoesUnicas = new Set(metasValidas.map(m => m.congregacaoId));
    if (congregacoesUnicas.size !== metasValidas.length) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Não repita a mesma congregação em mais de uma meta." } };
      return;
    }
    if (!(await todasExistem(pool, metasValidas.map(m => m.congregacaoId)))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Alguma congregação das metas não existe." } };
      return;
    }

    // A campanha e as metas entram juntas ou não entram: antes uma meta com problema deixava a campanha criada sem as metas.
    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    await transaction.begin();
    let campanhaId;
    try {
      const criada = await r()
        .input("nome", sql.NVarChar(200), nome.trim())
        .input("descricao", sql.NVarChar(500), typeof descricao === "string" && descricao.trim() ? descricao.trim() : null)
        .input("dataInicio", sql.Date, dataInicio)
        .input("dataFim", sql.Date, dataFim || null)
        .input("criadoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO Campanhas (Nome, Descricao, DataInicio, DataFim, CriadoPor)
                OUTPUT INSERTED.CampanhaId
                VALUES (@nome, @descricao, @dataInicio, @dataFim, @criadoPor)`);
      campanhaId = criada.recordset[0].CampanhaId;
      for (const m of metasValidas) {
        await r().input("campanhaId", sql.Int, campanhaId).input("congregacaoId", sql.Int, m.congregacaoId).input("metaValor", sql.Decimal(10, 2), m.metaValor)
          .query(`INSERT INTO CampanhaMetas (CampanhaId, CongregacaoId, MetaValor) VALUES (@campanhaId, @congregacaoId, @metaValor)`);
      }
      await transaction.commit();
    } catch (erro) {
      try { await transaction.rollback(); } catch (e) { /* a transação já pode ter sido desfeita */ }
      context.log.error("Falha ao criar campanha:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Não foi possível criar a campanha — nada foi gravado. Tente de novo ou avise a equipe técnica." } };
      return;
    }

    await registrarAuditoria({
      tabela: "Campanhas", registroId: campanhaId, acao: "Criou campanha", usuarioId: usuario.membroId,
      dadosDepois: { nome, dataInicio, dataFim, metas: metasValidas }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Campanha criada.", campanhaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/campanhas/{id}" } };
      return;
    }
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
    if ((nome !== undefined && nome !== null && typeof nome !== "string") || (descricao !== undefined && descricao !== null && typeof descricao !== "string")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "nome e descricao devem ser texto." } };
      return;
    }
    if (registro.Status !== "ATIVA" && (nome || descricao !== undefined || dataFim !== undefined || (Array.isArray(metas) && metas.length > 0))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha encerrada ou cancelada — só é possível reabrir/fechar o status, não editar dados." } };
      return;
    }
    // Meta sem congregação ou sem valor válido continua sendo ignorada (comportamento de sempre); meta válida de congregação que não existe é recusada ANTES de gravar qualquer coisa.
    const metasValidas = [];
    if (Array.isArray(metas)) {
      for (const m of metas) {
        const congregacaoId = m ? auth.idDeRota(m.congregacaoId) : null;
        const metaValor = m ? numeroPositivo(m.metaValor, META_MAXIMA) : null;
        if (!congregacaoId || metaValor === null) continue;
        metasValidas.push({ congregacaoId, metaValor });
      }
      if (!(await todasExistem(pool, metasValidas.map(m => m.congregacaoId)))) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Alguma congregação das metas não existe." } };
        return;
      }
    }

    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    await transaction.begin();
    try {
      await r()
        .input("id", sql.Int, id)
        .input("nome", sql.NVarChar(200), nome ? nome.trim() : registro.Nome)
        .input("descricao", sql.NVarChar(500), descricao !== undefined ? (descricao ? descricao.trim() : null) : registro.Descricao)
        .input("dataFim", sql.Date, dataFim !== undefined ? (dataFim || null) : registro.DataFim)
        .input("status", sql.NVarChar(20), status || registro.Status)
        .query(`UPDATE Campanhas SET Nome = @nome, Descricao = @descricao, DataFim = @dataFim, Status = @status WHERE CampanhaId = @id`);
      for (const m of metasValidas) {
        await r().input("campanhaId", sql.Int, id).input("congregacaoId", sql.Int, m.congregacaoId).input("metaValor", sql.Decimal(10, 2), m.metaValor)
          .query(`MERGE CampanhaMetas AS destino
                  USING (SELECT @campanhaId AS CampanhaId, @congregacaoId AS CongregacaoId) AS origem
                  ON destino.CampanhaId = origem.CampanhaId AND destino.CongregacaoId = origem.CongregacaoId
                  WHEN MATCHED THEN UPDATE SET MetaValor = @metaValor
                  WHEN NOT MATCHED THEN INSERT (CampanhaId, CongregacaoId, MetaValor) VALUES (@campanhaId, @congregacaoId, @metaValor);`);
      }
      await transaction.commit();
    } catch (erro) {
      try { await transaction.rollback(); } catch (e) { /* a transação já pode ter sido desfeita */ }
      context.log.error("Falha ao atualizar campanha:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Não foi possível atualizar a campanha — nada foi alterado. Tente de novo ou avise a equipe técnica." } };
      return;
    }

    await registrarAuditoria({
      tabela: "Campanhas", registroId: id, acao: "Atualizou campanha", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { nome, descricao, dataFim, status, metas: metasValidas }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Campanha atualizada." } };
    return;
  }
};
