// GestaoApresentacaoCriancas (vB.12 — Apresentação de Crianças, Reg. Art. 82)
// Mesmo lugar de Casamentos na FASE 1 original — retrofit, não reabertura
// (a FASE 1 já está fechada). Exige a permissão "pessoas", mesmo esqueleto
// de GestaoCasamentos. Aptidão (Art. 82 §2º/§3º) SEMPRE recalculada na
// leitura (shared/apresentacaoCriancas.js) — nunca um booleano digitado.
// GET    /api/apresentacoes-crianca?pai=&mae=  -> lista, com aptidão calculada
// POST   /api/apresentacoes-crianca            -> body: { nomeCrianca, dataNascimento,
//                                                          membroIdPai?, membroIdMae?,
//                                                          oficiante?, modalidade,
//                                                          dataApresentacao, congregacaoId? }
// DELETE /api/apresentacoes-crianca/{id}
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { modalidadeValida, geraCertificado, calcularAptidaoApresentacao, MODALIDADES } = require("../shared/apresentacaoCriancas");

const SELECT_APRESENTACAO = `
  SELECT a.ApresentacaoId AS apresentacaoId, a.NomeCrianca AS nomeCrianca,
         CONVERT(varchar(10), a.DataNascimento, 120) AS dataNascimento,
         a.MembroIdPai AS membroIdPai, pai.Nome AS nomePai, pai.EstadoCivil AS estadoCivilPai,
         a.MembroIdMae AS membroIdMae, mae.Nome AS nomeMae, mae.EstadoCivil AS estadoCivilMae,
         a.Oficiante AS oficiante, a.Modalidade AS modalidade,
         CONVERT(varchar(10), a.DataApresentacao, 120) AS dataApresentacao,
         a.CongregacaoId AS congregacaoId, a.Protocolo AS protocolo
  FROM ApresentacoesCrianca a
  LEFT JOIN MembroReferencia pai ON pai.MembroId = a.MembroIdPai
  LEFT JOIN MembroReferencia mae ON mae.MembroId = a.MembroIdMae`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: listar (com aptidão calculada) ----
  if (method === "GET") {
    const { pai, mae, membroId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (pai) { request.input("pai", sql.Int, pai); where += " AND a.MembroIdPai = @pai"; }
    if (mae) { request.input("mae", sql.Int, mae); where += " AND a.MembroIdMae = @mae"; }
    if (membroId) { request.input("membroId", sql.Int, membroId); where += " AND (a.MembroIdPai = @membroId OR a.MembroIdMae = @membroId)"; }
    const apresentacoes = (await request.query(`${SELECT_APRESENTACAO} WHERE ${where} ORDER BY a.DataApresentacao DESC`)).recordset;

    for (const item of apresentacoes) {
      const candidato = {
        dataNascimento: item.dataNascimento,
        pai: item.membroIdPai ? { membroId: item.membroIdPai, estadoCivil: item.estadoCivilPai } : null,
        mae: item.membroIdMae ? { membroId: item.membroIdMae, estadoCivil: item.estadoCivilMae } : null
      };
      item.aptidao = await calcularAptidaoApresentacao(pool, candidato);
      item.geraCertificado = geraCertificado(item.modalidade);
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: apresentacoes };
    return;
  }

  // ---- POST: registrar ----
  if (method === "POST") {
    const {
      nomeCrianca, dataNascimento, membroIdPai, membroIdMae, oficiante, modalidade, dataApresentacao, congregacaoId
    } = req.body || {};

    if (!nomeCrianca || !String(nomeCrianca).trim() || !dataNascimento || !modalidade || !dataApresentacao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nomeCrianca, dataNascimento, modalidade, dataApresentacao." } };
      return;
    }
    if (!modalidadeValida(modalidade)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Modalidade inválida. Use uma de: ${MODALIDADES.join(", ")}.` } };
      return;
    }
    if (!membroIdPai && !membroIdMae) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe ao menos um dos pais (matrícula do pai ou da mãe)." } };
      return;
    }

    for (const [rotulo, id] of [["pai", membroIdPai], ["mãe", membroIdMae]]) {
      if (!id) continue;
      const encontrado = await pool.request().input("id", sql.Int, id).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
      if (encontrado.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Matrícula do(a) ${rotulo} não encontrada.` } };
        return;
      }
    }

    // Aptidão calculada ANTES de registrar — o sistema não deixa registrar
    // uma apresentação já vedada por idade ou por impedimento dos pais
    // (Art. 82 §2º I / §3º II), mesmo que só a Secretaria a esteja lançando.
    const pai = membroIdPai ? (await pool.request().input("id", sql.Int, membroIdPai).query(`SELECT EstadoCivil FROM MembroReferencia WHERE MembroId = @id`)).recordset[0] : null;
    const mae = membroIdMae ? (await pool.request().input("id", sql.Int, membroIdMae).query(`SELECT EstadoCivil FROM MembroReferencia WHERE MembroId = @id`)).recordset[0] : null;
    const aptidao = await calcularAptidaoApresentacao(pool, {
      dataNascimento,
      pai: pai ? { membroId: Number(membroIdPai), estadoCivil: pai.EstadoCivil } : null,
      mae: mae ? { membroId: Number(membroIdMae), estadoCivil: mae.EstadoCivil } : null
    });
    if (!aptidao.apto) {
      const pendencias = Object.entries(aptidao.itens).filter(([, v]) => !v.ok).map(([, v]) => v.detalhe);
      context.res = { status: 200, body: { sucesso: false, mensagem: `Apresentação não permitida: ${pendencias.join("; ")}.` } };
      return;
    }

    const result = await pool.request()
      .input("nomeCrianca", sql.NVarChar(200), String(nomeCrianca).trim())
      .input("dataNascimento", sql.Date, dataNascimento)
      .input("membroIdPai", sql.Int, membroIdPai || null)
      .input("membroIdMae", sql.Int, membroIdMae || null)
      .input("oficiante", sql.NVarChar(200), String(oficiante || "").trim() || null)
      .input("modalidade", sql.NVarChar(20), String(modalidade).toUpperCase())
      .input("dataApresentacao", sql.Date, dataApresentacao)
      .input("congregacaoId", sql.Int, congregacaoId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO ApresentacoesCrianca (NomeCrianca, DataNascimento, MembroIdPai, MembroIdMae, Oficiante, Modalidade, DataApresentacao, CongregacaoId, CriadoPor)
        OUTPUT INSERTED.ApresentacaoId
        VALUES (@nomeCrianca, @dataNascimento, @membroIdPai, @membroIdMae, @oficiante, @modalidade, @dataApresentacao, @congregacaoId, @criadoPor)`);
    const apresentacaoId = result.recordset[0].ApresentacaoId;

    await registrarAuditoria({
      tabela: "ApresentacoesCrianca",
      registroId: apresentacaoId,
      acao: `Registrou apresentação de criança (${modalidade})`,
      usuarioId: usuario.membroId,
      dadosDepois: { nomeCrianca, dataNascimento, membroIdPai, membroIdMae, modalidade, dataApresentacao }
    });

    const semCertificado = !geraCertificado(modalidade);
    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: "✅ Apresentação registrada." + (aptidao.avisoForaJanelaPreferencial ? ` ${aptidao.avisoForaJanelaPreferencial}` : "") +
          (semCertificado ? " Ato reservado: não gera certificado (Art. 82 §2º, II 'b')." : ""),
        apresentacaoId,
        aviso: aptidao.avisoForaJanelaPreferencial
      }
    };
    return;
  }

  // ---- DELETE: remover (correção de lançamento) ----
  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/apresentacoes-crianca/{id}" } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, idRota).query(`SELECT NomeCrianca, DataApresentacao FROM ApresentacoesCrianca WHERE ApresentacaoId = @id`);
    const del = await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM ApresentacoesCrianca WHERE ApresentacaoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
      return;
    }
    await registrarAuditoria({ tabela: "ApresentacoesCrianca", registroId: Number(idRota), acao: "Removeu registro de apresentação de criança", usuarioId: usuario.membroId, dadosAntes: antes.recordset[0] });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro removido." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
