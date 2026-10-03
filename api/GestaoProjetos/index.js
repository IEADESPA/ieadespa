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
// ESCOPO (02/10/2026): projeto é INSTITUCIONAL. Marcar regime de urgência (que dispensa o parecer das comissões) é só do nível GERAL (papel Global com escopo "TODAS") e só
// vale para projeto ainda em parecer; protocolar projeto: o autor é quem está logado (só o GERAL protocola em nome de outra pessoa); o parecer só se emite uma vez e com o
// projeto em parecer.
const auth = require("../shared/auth");
const { exigirGeral, ehGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const { composicaoCCJ, composicaoCFO, composicaoCEP } = require("../shared/comissoes");
const { gerarProtocolo } = require("../shared/protocolo");

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
    const projetoId = auth.idDeRota(id);
    const siglaComissao = String(sigla);
    const ehDaComissao = await membroEhDaComissao(pool, siglaComissao, usuario.membroId);
    if (!ehDaComissao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Você não é membro da comissão ${siglaComissao}.` } };
      return;
    }
    if (!projetoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Parecer não encontrado pra essa comissão/projeto." } };
      return;
    }
    // O parecer se emite UMA vez e só com o projeto ainda em parecer (antes qualquer membro da comissão reescrevia o parecer a qualquer momento, até depois de apto à votação).
    const upd = await pool.request()
      .input("projetoId", sql.Int, projetoId).input("sigla", sql.NVarChar(10), siglaComissao)
      .input("parecer", sql.NVarChar(20), parecer)
      .query(`UPDATE PareceresComissao SET Parecer = @parecer, DataEmissao = CAST(SYSUTCDATETIME() AS DATE)
              WHERE ProjetoId = @projetoId AND Sigla = @sigla AND Parecer IS NULL
                AND EXISTS (SELECT 1 FROM Projetos WHERE ProjetoId = @projetoId AND Status = 'EM_PARECER')`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Parecer não encontrado pra essa comissão/projeto, já emitido, ou projeto fora de parecer." } };
      return;
    }
    await atualizarStatusSeCompleto(pool, projetoId);
    await registrarAuditoria({
      tabela: "PareceresComissao", registroId: projetoId, acao: `Emitiu parecer ${siglaComissao}: ${parecer}`, usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer registrado." } };
    return;
  }

  // ---- POST /projetos/{id}/urgencia ----
  if (req.method === "POST" && id && acao === "urgencia") {
    const usuario = exigirGeral(req, context, ["reunioes", "cli"]);
    if (!usuario) return;
    const projetoId = auth.idDeRota(id);
    // Só projeto ainda em parecer: urgência não ressuscita projeto arquivado nem refaz um já apto à votação.
    const marcado = projetoId
      ? await pool.request().input("id", sql.Int, projetoId)
        .query(`UPDATE Projetos SET RegimeUrgencia = 1, Status = 'APTO_VOTACAO' WHERE ProjetoId = @id AND Status = 'EM_PARECER'`)
      : { rowsAffected: [0] };
    if (marcado.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Projeto não encontrado ou não está mais em parecer." } };
      return;
    }
    await registrarAuditoria({
      tabela: "Projetos", registroId: projetoId,
      acao: "Marcou regime de urgência (Art. 24 §2º — 2/3 do Plenário, registrado fisicamente)",
      usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Regime de urgência registrado." } };
    return;
  }

  // ---- GET: lista ----
  if (req.method === "GET" && !id) {
    // fecho da v7.5 — a lista (autor, texto e pareceres dos projetos) era aberta a qualquer pessoa da internet; agora exige sessão (a tela já só chamava logada).
    if (!auth.exigirLoginIgnorandoTermos(req, context)) return;
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
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { titulo, texto, comissaoTematica } = corpo;
    if (!corpo.autorMembroId || !titulo || !texto || !comissaoTematica) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: autorMembroId, titulo, texto, comissaoTematica." } };
      return;
    }
    if (typeof titulo !== "string" || titulo.length > 200 || typeof texto !== "string") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Título (até 200 caracteres) e texto precisam ser texto." } };
      return;
    }
    if (!COMISSOES_TEMATICAS_VALIDAS.includes(comissaoTematica)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Comissão temática inválida (use CFO ou CEP)." } };
      return;
    }
    // O autor é quem protocola: só o GERAL protocola em nome de outra pessoa (antes o papel local punha qualquer matrícula como autora).
    const autorMembroId = auth.idDeRota(corpo.autorMembroId);
    if (!ehGeral(usuario) && autorMembroId !== Number(usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Você só pode protocolar projeto em seu próprio nome." } };
      return;
    }
    const membro = autorMembroId
      ? await pool.request().input("id", sql.Int, autorMembroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`)
      : { recordset: [] };
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula do autor não encontrada." } };
      return;
    }

    // vB.4: máscara única (PROJ-AAAA-NNNN), gerada pelo sequenciador atômico
    // central em vez do `SELECT COUNT(*) ... WHERE Protocolo LIKE prefixo%`
    // que tinha corrida real (dois projetos protocolados ao mesmo tempo
    // podiam calcular o mesmo COUNT). Protocolos já emitidos no formato
    // antigo (AAAA/NNN) continuam válidos, gravados como estão.
    const protocolo = await gerarProtocolo(pool, "PROJ");

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

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
