// GestaoEnquetes (v2.8, Parte A)
// Enquetes que nascem e se resolvem FORA de uma sessão formal (Tema do Ano,
// camiseta de festa) — não é o mesmo problema já descartado no v2.3 pra
// deliberação de plenário (show de mãos, decidido na hora): aqui o voto
// acontece em outro momento/lugar, por isso faz sentido capturar no sistema.
// Vinculante é o modo usado quando uma eleição/reforma da Assembleia for
// contestada — QuorumTipo calcula a aprovação de verdade (estatuto.js).
//
// GET  /api/enquetes                 -> lista (participação/resultado, respeita Visibilidade)
// POST /api/enquetes                 -> cria (exige permissão reunioes/assembleia)
// POST /api/enquetes/{id}/votar      -> body: { membroId, opcaoId? | textoResposta? } — público, matrícula
// POST /api/enquetes/{id}/encerrar   -> fecha; se Vinculante, calcula ResultadoAprovado
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { membrosElegiveis } = require("../shared/enquetes");
const estatuto = require("../shared/estatuto");

const TIPOS_VALIDOS = ["OPCOES", "TEXTO_LIVRE"];
const VISIBILIDADES_VALIDAS = ["PUBLICA", "SECRETA"];
const PUBLICOS_VALIDOS = ["TODOS_ATIVOS", "LISTA_CUSTOM"];
const QUORUM_TIPOS_VALIDOS = ["MAIORIA_SIMPLES", "DOIS_TERCOS", "NOVENTA_POR_CENTO"];

async function montarEnqueteCompleta(pool, enqueteId) {
  const enqueteResult = await pool.request().input("id", sql.Int, enqueteId).query(`
    SELECT EnqueteId AS enqueteId, Titulo AS titulo, Descricao AS descricao, Tipo AS tipo,
           Visibilidade AS visibilidade, PublicoTipo AS publicoTipo, Vinculante AS vinculante,
           QuorumTipo AS quorumTipo, Status AS status, ResultadoAprovado AS resultadoAprovado,
           CONVERT(varchar(33), DataAbertura, 126) AS dataAbertura,
           CONVERT(varchar(33), DataFechamento, 126) AS dataFechamento
    FROM Enquetes WHERE EnqueteId = @id
  `);
  const enquete = enqueteResult.recordset[0];
  if (!enquete) return null;

  const opcoesResult = await pool.request().input("id", sql.Int, enqueteId)
    .query(`SELECT OpcaoId AS opcaoId, Texto AS texto FROM OpcoesEnquete WHERE EnqueteId = @id`);

  const votosResult = await pool.request().input("id", sql.Int, enqueteId).query(`
    SELECT v.MembroId AS membroId, m.Nome AS nome, v.OpcaoId AS opcaoId, v.TextoResposta AS textoResposta
    FROM VotosEnquete v JOIN MembroReferencia m ON m.MembroId = v.MembroId
    WHERE v.EnqueteId = @id
  `);

  const contagemPorOpcao = {};
  opcoesResult.recordset.forEach(o => { contagemPorOpcao[o.opcaoId] = 0; });
  votosResult.recordset.forEach(v => {
    if (v.opcaoId != null) contagemPorOpcao[v.opcaoId] = (contagemPorOpcao[v.opcaoId] || 0) + 1;
  });

  const opcoes = opcoesResult.recordset.map(o => Object.assign({}, o, { votos: contagemPorOpcao[o.opcaoId] || 0 }));
  const totalVotos = votosResult.recordset.length;
  const participantes = votosResult.recordset.map(v => ({ membroId: v.membroId, nome: v.nome }));

  const detalheVotos = enquete.visibilidade === "PUBLICA"
    ? votosResult.recordset.map(v => ({ membroId: v.membroId, nome: v.nome, opcaoId: v.opcaoId, textoResposta: v.textoResposta }))
    : undefined;
  const respostasTextoLivre = enquete.tipo === "TEXTO_LIVRE" && enquete.visibilidade === "PUBLICA"
    ? votosResult.recordset.map(v => ({ membroId: v.membroId, nome: v.nome, textoResposta: v.textoResposta }))
    : undefined;

  return Object.assign({}, enquete, {
    opcoes, totalVotos, participantes,
    votos: detalheVotos,
    respostas: respostasTextoLivre
  });
}

module.exports = async function (context, req) {
  const method = req.method;
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- POST /enquetes/{id}/votar: público, autoatendimento por matrícula ----
  if (method === "POST" && id && acao === "votar") {
    const { membroId, opcaoId, textoResposta } = req.body || {};
    if (!membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula (membroId)." } };
      return;
    }
    const enquete = await montarEnqueteCompleta(pool, id);
    if (!enquete) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete não encontrada." } };
      return;
    }
    if (enquete.status !== "ABERTA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já foi encerrada." } };
      return;
    }
    const elegiveis = await membrosElegiveis(pool, sql, enquete);
    if (!elegiveis.has(Number(membroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula não está no público desta enquete." } };
      return;
    }
    if (enquete.tipo === "OPCOES" && !opcaoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Escolha uma opção." } };
      return;
    }
    if (enquete.tipo === "TEXTO_LIVRE" && !textoResposta) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe sua resposta." } };
      return;
    }
    try {
      await pool.request()
        .input("enqueteId", sql.Int, id)
        .input("membroId", sql.Int, membroId)
        .input("opcaoId", sql.Int, enquete.tipo === "OPCOES" ? opcaoId : null)
        .input("textoResposta", sql.NVarChar(500), enquete.tipo === "TEXTO_LIVRE" ? textoResposta : null)
        .query(`INSERT INTO VotosEnquete (EnqueteId, MembroId, OpcaoId, TextoResposta) VALUES (@enqueteId, @membroId, @opcaoId, @textoResposta)`);
    } catch (e) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula já votou nesta enquete." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Voto registrado." } };
    return;
  }

  // ---- POST /enquetes/{id}/encerrar ----
  if (method === "POST" && id && acao === "encerrar") {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]);
    if (!usuario) return;
    const enquete = await montarEnqueteCompleta(pool, id);
    if (!enquete) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete não encontrada." } };
      return;
    }
    if (enquete.status !== "ABERTA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já está encerrada." } };
      return;
    }
    let resultadoAprovado = null;
    if (enquete.vinculante) {
      const maisVotada = enquete.opcoes.reduce((max, o) => (o.votos > max ? o.votos : max), 0);
      const avaliacao = estatuto.avaliarAprovacaoEnquete(enquete.totalVotos, maisVotada, enquete.quorumTipo);
      resultadoAprovado = avaliacao.aprovado;
    }
    await pool.request().input("id", sql.Int, id).input("resultado", sql.Bit, resultadoAprovado)
      .query(`UPDATE Enquetes SET Status = 'ENCERRADA', DataFechamento = SYSUTCDATETIME(), ResultadoAprovado = @resultado WHERE EnqueteId = @id`);
    await registrarAuditoria({
      tabela: "Enquetes", registroId: Number(id), acao: "Encerrou enquete", usuarioId: usuario.membroId,
      dadosDepois: { resultadoAprovado }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Enquete encerrada.", resultadoAprovado } };
    return;
  }

  // ---- GET: lista (com detalhe conforme visibilidade) ----
  if (method === "GET" && !id) {
    const idsResult = await pool.request().query(`SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY DataAbertura DESC`);
    const enquetes = [];
    for (const row of idsResult.recordset) {
      enquetes.push(await montarEnqueteCompleta(pool, row.enqueteId));
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: enquetes };
    return;
  }

  // ---- POST: criar ----
  if (method === "POST" && !id) {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]);
    if (!usuario) return;
    const {
      titulo, descricao, tipo, visibilidade, publicoTipo, publicoMembroIds,
      vinculante, quorumTipo, opcoes, orgaoId, sessaoId
    } = req.body || {};

    if (!titulo) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o título." } };
      return;
    }
    const tipoFinal = tipo || "OPCOES";
    const visibilidadeFinal = visibilidade || "SECRETA";
    const publicoTipoFinal = publicoTipo || "TODOS_ATIVOS";
    if (!TIPOS_VALIDOS.includes(tipoFinal)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Tipo inválido." } };
      return;
    }
    if (!VISIBILIDADES_VALIDAS.includes(visibilidadeFinal)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Visibilidade inválida." } };
      return;
    }
    if (!PUBLICOS_VALIDOS.includes(publicoTipoFinal)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Tipo de público inválido." } };
      return;
    }
    if (tipoFinal === "OPCOES" && (!Array.isArray(opcoes) || opcoes.length < 2)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe ao menos 2 opções." } };
      return;
    }
    if (vinculante && (tipoFinal !== "OPCOES" || !QUORUM_TIPOS_VALIDOS.includes(quorumTipo))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete vinculante precisa ser do tipo Opções e ter um QuorumTipo válido." } };
      return;
    }
    if (publicoTipoFinal === "LISTA_CUSTOM" && (!Array.isArray(publicoMembroIds) || publicoMembroIds.length === 0)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe as matrículas do público customizado." } };
      return;
    }

    const criada = await pool.request()
      .input("titulo", sql.NVarChar(200), titulo)
      .input("descricao", sql.NVarChar(1000), descricao || null)
      .input("tipo", sql.NVarChar(20), tipoFinal)
      .input("visibilidade", sql.NVarChar(20), visibilidadeFinal)
      .input("publicoTipo", sql.NVarChar(20), publicoTipoFinal)
      .input("vinculante", sql.Bit, !!vinculante)
      .input("quorumTipo", sql.NVarChar(30), vinculante ? quorumTipo : null)
      .input("orgaoId", sql.Int, orgaoId || null)
      .input("sessaoId", sql.Int, sessaoId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO Enquetes (Titulo, Descricao, Tipo, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, OrgaoId, SessaoId, CriadoPor)
        OUTPUT INSERTED.EnqueteId
        VALUES (@titulo, @descricao, @tipo, @visibilidade, @publicoTipo, @vinculante, @quorumTipo, @orgaoId, @sessaoId, @criadoPor)
      `);
    const enqueteId = criada.recordset[0].EnqueteId;

    if (tipoFinal === "OPCOES") {
      for (const texto of opcoes) {
        await pool.request().input("enqueteId", sql.Int, enqueteId).input("texto", sql.NVarChar(300), texto)
          .query(`INSERT INTO OpcoesEnquete (EnqueteId, Texto) VALUES (@enqueteId, @texto)`);
      }
    }
    if (publicoTipoFinal === "LISTA_CUSTOM") {
      for (const membroIdItem of publicoMembroIds) {
        await pool.request().input("enqueteId", sql.Int, enqueteId).input("membroId", sql.Int, membroIdItem)
          .query(`INSERT INTO PublicoEnqueteCustom (EnqueteId, MembroId) VALUES (@enqueteId, @membroId)`);
      }
    }

    await registrarAuditoria({
      tabela: "Enquetes", registroId: enqueteId, acao: "Criou enquete", usuarioId: usuario.membroId,
      dadosDepois: { titulo, tipo: tipoFinal, visibilidade: visibilidadeFinal, vinculante: !!vinculante }
    });

    const enqueteCompleta = await montarEnqueteCompleta(pool, enqueteId);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Enquete criada.", enquete: enqueteCompleta } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
