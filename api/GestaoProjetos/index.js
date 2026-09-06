// GestaoProjetos (v2.8, Parte B)
// Tramitação de Projetos e Parecer de Comissões (Regimento, Art. 24-25) —
// etapa que antecede uma Enquete vinculante: todo projeto protocolado vai
// pra CCJ + comissão temática, que têm 15 dias pra emitir parecer. Sem o
// parecer, não entra em votação — salvo regime de urgência (2/3 do
// Plenário), que aqui é só um REGISTRO do que já foi decidido fisicamente
// (mesmo racional do "descartado" no v2.3: o sistema não verifica votos de
// plenário ao vivo).
// GET  /api/projetos                        -> lista, com prazo de parecer calculado na leitura
// POST /api/projetos                        -> body: { autorMembroId, titulo, texto, comissaoTematica } -> protocola
// POST /api/projetos/{id}/parecer/{sigla}   -> body: { parecer: 'FAVORAVEL'|'CONTRARIO' } -> exige ser da comissão
// POST /api/projetos/{id}/urgencia          -> marca regime de urgência (dispensa parecer)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const { composicaoCCJ, composicaoCFO, composicaoCEP } = require("../shared/comissoes");

const DIAS_PARECER = 15; // Regimento, Art. 24 §2º
const COMISSOES_TEMATICAS_VALIDAS = ["CFO", "CEP"];

async function membroEhDaComissao(pool, sigla, membroId) {
  const composicao = sigla === "CCJ" ? await composicaoCCJ(pool)
    : sigla === "CFO" ? await composicaoCFO(pool)
    : sigla === "CEP" ? await composicaoCEP(pool)
    : [];
  return composicao.some(m => Number(m.membroId) === Number(membroId));
}

async function atualizarStatusSeCompleto(pool, projetoId) {
  const pareceres = await pool.request().input("id", sql.Int, projetoId)
    .query(`SELECT Parecer FROM PareceresComissao WHERE ProjetoId = @id`);
  const todosEmitidos = pareceres.recordset.length > 0 && pareceres.recordset.every(p => p.Parecer);
  if (todosEmitidos) {
    await pool.request().input("id", sql.Int, projetoId)
      .query(`UPDATE Projetos SET Status = 'APTO_VOTACAO' WHERE ProjetoId = @id AND Status = 'EM_PARECER'`);
  }
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const sigla = context.bindingData.sigla;
  const pool = await getPool();

  // ---- POST /projetos/{id}/parecer/{sigla} ----
  if (req.method === "POST" && id && acao === "parecer" && sigla) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const { parecer } = req.body || {};
    if (!["FAVORAVEL", "CONTRARIO"].includes(parecer)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Parecer deve ser FAVORAVEL ou CONTRARIO." } };
      return;
    }
    const ehDaComissao = await membroEhDaComissao(pool, sigla, usuario.membroId);
    if (!ehDaComissao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Você não é membro da comissão ${sigla}.` } };
      return;
    }
    const upd = await pool.request()
      .input("projetoId", sql.Int, id).input("sigla", sql.NVarChar(10), sigla)
      .input("parecer", sql.NVarChar(20), parecer)
      .query(`UPDATE PareceresComissao SET Parecer = @parecer, DataEmissao = CAST(SYSUTCDATETIME() AS DATE)
              WHERE ProjetoId = @projetoId AND Sigla = @sigla`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Parecer não encontrado pra essa comissão/projeto." } };
      return;
    }
    await atualizarStatusSeCompleto(pool, id);
    await registrarAuditoria({
      tabela: "PareceresComissao", registroId: Number(id), acao: `Emitiu parecer ${sigla}: ${parecer}`, usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer registrado." } };
    return;
  }

  // ---- POST /projetos/{id}/urgencia ----
  if (req.method === "POST" && id && acao === "urgencia") {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "cli"]);
    if (!usuario) return;
    await pool.request().input("id", sql.Int, id)
      .query(`UPDATE Projetos SET RegimeUrgencia = 1, Status = 'APTO_VOTACAO' WHERE ProjetoId = @id`);
    await registrarAuditoria({
      tabela: "Projetos", registroId: Number(id),
      acao: "Marcou regime de urgência (Art. 24 §2º — 2/3 do Plenário, registrado fisicamente)",
      usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Regime de urgência registrado." } };
    return;
  }

  // ---- GET: lista ----
  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT p.ProjetoId AS projetoId, p.Protocolo AS protocolo, p.AutorMembroId AS autorMembroId,
             m.Nome AS autorNome, p.Titulo AS titulo, p.Texto AS texto, p.ComissaoTematica AS comissaoTematica,
             p.Status AS status, p.RegimeUrgencia AS regimeUrgencia,
             CONVERT(varchar(10), p.DataProtocolo, 120) AS dataProtocolo
      FROM Projetos p JOIN MembroReferencia m ON m.MembroId = p.AutorMembroId
      ORDER BY p.DataProtocolo DESC
    `);
    const hoje = new Date().toISOString().slice(0, 10);
    const projetos = [];
    for (const p of result.recordset) {
      const pareceresResult = await pool.request().input("id", sql.Int, p.projetoId)
        .query(`SELECT Sigla AS sigla, Parecer AS parecer, CONVERT(varchar(10), DataEmissao, 120) AS dataEmissao FROM PareceresComissao WHERE ProjetoId = @id`);
      const diasDesdeProtocolo = estatuto.diasDesde(p.dataProtocolo, hoje);
      const prazoVencido = !p.regimeUrgencia && p.status === "EM_PARECER" && diasDesdeProtocolo > DIAS_PARECER;
      projetos.push(Object.assign({}, p, {
        pareceres: pareceresResult.recordset,
        diasDesdeProtocolo, prazoVencido, diasPrazoParecer: DIAS_PARECER
      }));
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: projetos };
    return;
  }

  // ---- POST: protocolar ----
  if (req.method === "POST" && !id) {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "cli"]);
    if (!usuario) return;
    const { autorMembroId, titulo, texto, comissaoTematica } = req.body || {};
    if (!autorMembroId || !titulo || !texto || !comissaoTematica) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: autorMembroId, titulo, texto, comissaoTematica." } };
      return;
    }
    if (!COMISSOES_TEMATICAS_VALIDAS.includes(comissaoTematica)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Comissão temática inválida (use CFO ou CEP)." } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, autorMembroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula do autor não encontrada." } };
      return;
    }

    const ano = new Date().getFullYear();
    const seqResult = await pool.request().input("prefixo", sql.NVarChar(10), `${ano}/`)
      .query(`SELECT COUNT(*) AS total FROM Projetos WHERE Protocolo LIKE @prefixo + '%'`);
    const protocolo = `${ano}/${String(seqResult.recordset[0].total + 1).padStart(3, "0")}`;

    const criado = await pool.request()
      .input("protocolo", sql.NVarChar(30), protocolo)
      .input("autorMembroId", sql.Int, autorMembroId)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("texto", sql.NVarChar(sql.MAX), texto)
      .input("comissaoTematica", sql.NVarChar(10), comissaoTematica)
      .query(`INSERT INTO Projetos (Protocolo, AutorMembroId, Titulo, Texto, ComissaoTematica)
              OUTPUT INSERTED.ProjetoId VALUES (@protocolo, @autorMembroId, @titulo, @texto, @comissaoTematica)`);
    const projetoId = criado.recordset[0].ProjetoId;

    for (const siglaComissao of ["CCJ", comissaoTematica]) {
      await pool.request().input("projetoId", sql.Int, projetoId).input("sigla", sql.NVarChar(10), siglaComissao)
        .query(`INSERT INTO PareceresComissao (ProjetoId, Sigla) VALUES (@projetoId, @sigla)`);
    }

    await registrarAuditoria({
      tabela: "Projetos", registroId: projetoId, acao: "Protocolou projeto", usuarioId: usuario.membroId,
      dadosDepois: { protocolo, titulo, comissaoTematica }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Projeto protocolado (${protocolo}).`, protocolo } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
