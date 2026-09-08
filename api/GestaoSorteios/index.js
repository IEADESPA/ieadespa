// GestaoSorteios (v4.4.1)
// Sorteio é um DERIVADO opcional de uma Campanha (uma campanha pode ter
// zero, um ou vários) — correção de rumo depois do feedback direto do
// usuário: os cupons são físicos (impressos em gráfica, vendidos pra
// qualquer pessoa, não só dizimista cadastrado), então o sistema não
// controla número individual de cupom nem faz o sorteio sozinho. O que
// diferencia um sorteio de uma arrecadação comum são os PRÊMIOS
// (SorteioPremios) — o resultado (quem ganhou cada prêmio) é registrado
// manualmente depois que o sorteio físico acontece (gráfica/evento, fora
// do sistema). Dinheiro arrecadado com a venda dos cupons continua
// entrando pela Tesouraria normal (lançamento com CampanhaId da campanha-
// mãe), sem vínculo a um número individual.
// Criar/editar sorteio e registrar prêmios/ganhadores é restrito a nível
// Global — mesmo princípio de RegistrarRepasseTesouraria/GestaoCampanhas.
// GET  /api/campanhas/{campanhaId}/sorteios -> lista dos sorteios da campanha
// GET  /api/campanhas/{campanhaId}/sorteios/{id} -> detalhe + prêmios
// POST /api/campanhas/{campanhaId}/sorteios -> { nome, descricao?, precoCupom?, dataSorteio?, premios: [descricao, ...] }
// PUT  /api/campanhas/{campanhaId}/sorteios/{id} -> { nome?, descricao?, precoCupom?, dataSorteio?, status?,
//        premios?: [{premioId?, descricao?, nomeGanhador?}] }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const STATUS = ["ATIVO", "REALIZADO", "CANCELADO"];

function exigirFinanceiroGlobal(req, context) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return null;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Criar ou editar um sorteio é restrito a papéis de nível Global." } };
    return null;
  }
  return usuario;
}

module.exports = async function (context, req) {
  const campanhaId = context.bindingData.campanhaId;
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!campanhaId) {
    context.res = { status: 400, body: { erro: "Informe o campanhaId na rota." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().input("campanhaId", sql.Int, campanhaId).query(`
      SELECT SorteioId AS sorteioId, Nome AS nome, Descricao AS descricao, PrecoCupom AS precoCupom,
             CONVERT(varchar(10), DataSorteio, 120) AS dataSorteio, Status AS status,
             (SELECT COUNT(*) FROM SorteioPremios WHERE SorteioId = Sorteios.SorteioId) AS totalPremios,
             (SELECT COUNT(*) FROM SorteioPremios WHERE SorteioId = Sorteios.SorteioId AND NomeGanhador IS NOT NULL) AS premiosComGanhador
      FROM Sorteios WHERE CampanhaId = @campanhaId ORDER BY CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const sorteio = await pool.request().input("id", sql.Int, id).input("campanhaId", sql.Int, campanhaId).query(`
      SELECT SorteioId AS sorteioId, CampanhaId AS campanhaId, Nome AS nome, Descricao AS descricao, PrecoCupom AS precoCupom,
             CONVERT(varchar(10), DataSorteio, 120) AS dataSorteio, Status AS status
      FROM Sorteios WHERE SorteioId = @id AND CampanhaId = @campanhaId
    `);
    if (sorteio.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Sorteio não encontrado." } };
      return;
    }
    const premios = await pool.request().input("id", sql.Int, id).query(`
      SELECT SorteioPremioId AS premioId, Ordem AS ordem, Descricao AS descricao, NomeGanhador AS nomeGanhador,
             CONVERT(varchar(10), RegistradoEm, 120) AS registradoEm
      FROM SorteioPremios WHERE SorteioId = @id ORDER BY Ordem
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, sorteio.recordset[0], { premios: premios.recordset }) };
    return;
  }

  if (req.method === "POST") {
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const campanha = await pool.request().input("id", sql.Int, campanhaId).query(`SELECT Status FROM Campanhas WHERE CampanhaId = @id`);
    if (campanha.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
      return;
    }
    if (campanha.recordset[0].Status !== "ATIVA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível criar um sorteio numa campanha ativa." } };
      return;
    }
    const { nome, descricao, precoCupom, dataSorteio, premios } = req.body || {};
    if (!nome || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome do sorteio." } };
      return;
    }
    if (!Array.isArray(premios) || premios.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos um prêmio (premios: [\"descrição\", ...]) — é o que diferencia um sorteio de uma campanha comum." } };
      return;
    }

    const criado = await pool.request()
      .input("campanhaId", sql.Int, campanhaId)
      .input("nome", sql.NVarChar(200), nome.trim())
      .input("descricao", sql.NVarChar(500), descricao ? descricao.trim() : null)
      .input("precoCupom", sql.Decimal(10, 2), precoCupom || null)
      .input("dataSorteio", sql.Date, dataSorteio || null)
      .input("criadoPor", sql.Int, usuarioGlobal.membroId)
      .query(`INSERT INTO Sorteios (CampanhaId, Nome, Descricao, PrecoCupom, DataSorteio, CriadoPor)
              OUTPUT INSERTED.SorteioId
              VALUES (@campanhaId, @nome, @descricao, @precoCupom, @dataSorteio, @criadoPor)`);
    const sorteioId = criado.recordset[0].SorteioId;

    let ordem = 1;
    for (const descricaoPremio of premios) {
      if (!descricaoPremio || !String(descricaoPremio).trim()) continue;
      await pool.request().input("sorteioId", sql.Int, sorteioId).input("ordem", sql.Int, ordem).input("descricao", sql.NVarChar(300), String(descricaoPremio).trim())
        .query(`INSERT INTO SorteioPremios (SorteioId, Ordem, Descricao) VALUES (@sorteioId, @ordem, @descricao)`);
      ordem++;
    }

    await registrarAuditoria({
      tabela: "Sorteios", registroId: sorteioId, acao: "Criou sorteio derivado de campanha", usuarioId: usuarioGlobal.membroId,
      dadosDepois: { campanhaId, nome, precoCupom, dataSorteio, premios }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Sorteio criado.", sorteioId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/campanhas/{campanhaId}/sorteios/{id}" } };
      return;
    }
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const atual = await pool.request().input("id", sql.Int, id).input("campanhaId", sql.Int, campanhaId).query(`SELECT * FROM Sorteios WHERE SorteioId = @id AND CampanhaId = @campanhaId`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Sorteio não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { nome, descricao, precoCupom, dataSorteio, status, premios } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }

    await pool.request()
      .input("id", sql.Int, id)
      .input("nome", sql.NVarChar(200), nome ? nome.trim() : registro.Nome)
      .input("descricao", sql.NVarChar(500), descricao !== undefined ? (descricao ? descricao.trim() : null) : registro.Descricao)
      .input("precoCupom", sql.Decimal(10, 2), precoCupom !== undefined ? (precoCupom || null) : registro.PrecoCupom)
      .input("dataSorteio", sql.Date, dataSorteio !== undefined ? (dataSorteio || null) : registro.DataSorteio)
      .input("status", sql.NVarChar(20), status || registro.Status)
      .query(`UPDATE Sorteios SET Nome = @nome, Descricao = @descricao, PrecoCupom = @precoCupom, DataSorteio = @dataSorteio, Status = @status WHERE SorteioId = @id`);

    if (Array.isArray(premios)) {
      const maiorOrdem = await pool.request().input("id", sql.Int, id).query(`SELECT ISNULL(MAX(Ordem), 0) AS maior FROM SorteioPremios WHERE SorteioId = @id`);
      let proximaOrdem = maiorOrdem.recordset[0].maior + 1;
      for (const p of premios) {
        if (p.premioId) {
          const request = pool.request().input("id", sql.Int, p.premioId).input("sorteioId", sql.Int, id);
          const sets = [];
          if (p.descricao !== undefined) { request.input("descricao", sql.NVarChar(300), p.descricao); sets.push("Descricao = @descricao"); }
          if (p.nomeGanhador !== undefined) {
            request.input("nomeGanhador", sql.NVarChar(200), p.nomeGanhador || null);
            sets.push("NomeGanhador = @nomeGanhador", "RegistradoEm = " + (p.nomeGanhador ? "SYSUTCDATETIME()" : "NULL"));
          }
          if (sets.length > 0) {
            await request.query(`UPDATE SorteioPremios SET ${sets.join(", ")} WHERE SorteioPremioId = @id AND SorteioId = @sorteioId`);
          }
        } else if (p.descricao && p.descricao.trim()) {
          await pool.request().input("sorteioId", sql.Int, id).input("ordem", sql.Int, proximaOrdem).input("descricao", sql.NVarChar(300), p.descricao.trim())
            .query(`INSERT INTO SorteioPremios (SorteioId, Ordem, Descricao) VALUES (@sorteioId, @ordem, @descricao)`);
          proximaOrdem++;
        }
      }
    }

    await registrarAuditoria({
      tabela: "Sorteios", registroId: Number(id), acao: "Atualizou sorteio", usuarioId: usuarioGlobal.membroId,
      dadosAntes: registro, dadosDepois: { nome, descricao, precoCupom, dataSorteio, status, premios }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Sorteio atualizado." } };
    return;
  }
};
