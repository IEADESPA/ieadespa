// GestaoEnquetes (v2.8, Parte A — reformulado: formulário com várias perguntas)
// Enquete = formulário; cada Pergunta tem seu próprio tipo (Opções/Texto
// livre). Submissão é atômica: responder = mandar as respostas de TODAS as
// perguntas do formulário numa chamada só — nada é gravado se faltar
// alguma. Não é o mesmo problema já descartado no v2.3 pra deliberação de
// plenário (show de mãos, decidido na hora): aqui o voto acontece em outro
// momento/lugar, por isso faz sentido capturar no sistema. Vinculante é o
// modo usado quando uma eleição/reforma da Assembleia for contestada —
// QuorumTipo calcula a aprovação de verdade (estatuto.js); só faz sentido
// pra formulário de 1 pergunta só, tipo Opções.
//
// GET  /api/enquetes                 -> lista (participação/resultado, respeita Visibilidade)
// POST /api/enquetes                 -> cria (exige permissão reunioes/assembleia)
// POST /api/enquetes/{id}/votar      -> body: { respostas: [{perguntaId, opcaoId?|textoResposta?}] } — exige sessão; o voto é SEMPRE da matrícula da sessão
//                                       (fecho da v7.5: antes bastava informar uma matrícula no corpo e qualquer um votava em nome de qualquer pessoa)
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
    SELECT EnqueteId AS enqueteId, Titulo AS titulo, Descricao AS descricao,
           Visibilidade AS visibilidade, PublicoTipo AS publicoTipo, Vinculante AS vinculante,
           QuorumTipo AS quorumTipo, Status AS status, ResultadoAprovado AS resultadoAprovado,
           CONVERT(varchar(33), DataAbertura, 126) AS dataAbertura,
           CONVERT(varchar(33), DataFechamento, 126) AS dataFechamento
    FROM Enquetes WHERE EnqueteId = @id
  `);
  const enquete = enqueteResult.recordset[0];
  if (!enquete) return null;

  const perguntasResult = await pool.request().input("id", sql.Int, enqueteId)
    .query(`SELECT PerguntaId AS perguntaId, Ordem AS ordem, Titulo AS titulo, Tipo AS tipo
            FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem`);

  const perguntas = [];
  const membroIdsParticipantes = new Set();
  const nomesPorMembroId = {};

  for (const pergunta of perguntasResult.recordset) {
    const opcoesResult = await pool.request().input("id", sql.Int, pergunta.perguntaId)
      .query(`SELECT OpcaoId AS opcaoId, Texto AS texto FROM OpcoesEnquete WHERE PerguntaId = @id`);
    const respostasResult = await pool.request().input("id", sql.Int, pergunta.perguntaId).query(`
      SELECT r.MembroId AS membroId, m.Nome AS nome, r.OpcaoId AS opcaoId, r.TextoResposta AS textoResposta
      FROM RespostasEnquete r JOIN MembroReferencia m ON m.MembroId = r.MembroId
      WHERE r.PerguntaId = @id
    `);

    const contagemPorOpcao = {};
    opcoesResult.recordset.forEach(o => { contagemPorOpcao[o.opcaoId] = 0; });
    respostasResult.recordset.forEach(r => {
      if (r.opcaoId != null) contagemPorOpcao[r.opcaoId] = (contagemPorOpcao[r.opcaoId] || 0) + 1;
      membroIdsParticipantes.add(r.membroId);
      nomesPorMembroId[r.membroId] = r.nome;
    });

    const opcoes = opcoesResult.recordset.map(o => Object.assign({}, o, { votos: contagemPorOpcao[o.opcaoId] || 0 }));
    const detalheRespostas = enquete.visibilidade === "PUBLICA"
      ? respostasResult.recordset.map(r => ({ membroId: r.membroId, nome: r.nome, opcaoId: r.opcaoId, textoResposta: r.textoResposta }))
      : undefined;

    perguntas.push(Object.assign({}, pergunta, {
      opcoes, totalRespostas: respostasResult.recordset.length, respostas: detalheRespostas
    }));
  }

  const participantes = Array.from(membroIdsParticipantes).map(id => ({ membroId: id, nome: nomesPorMembroId[id] }));

  return Object.assign({}, enquete, { perguntas, totalVotos: participantes.length, participantes });
}

module.exports = async function (context, req) {
  const method = req.method;
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- POST /enquetes/{id}/votar: exige sessão; vota a matrícula da sessão ----
  if (method === "POST" && id && acao === "votar") {
    const usuario = auth.exigirLoginIgnorandoTermos(req, context);
    if (!usuario) return;
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const enqueteId = auth.idDeRota(id);
    const membroId = auth.idDeRota(usuario.membroId);
    const { respostas } = corpo;
    if (!enqueteId || !membroId || !Array.isArray(respostas) || respostas.length === 0 || respostas.length > 50) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a enquete e as respostas." } };
      return;
    }
    // Cada pessoa vota só por si: uma matrícula no corpo que não seja a da sessão é recusada, não ignorada em silêncio.
    if (corpo.membroId !== undefined && corpo.membroId !== null && String(corpo.membroId) !== String(membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Cada pessoa vota só por si mesma." } };
      return;
    }
    // Resposta é objeto com identificador de pergunta válido; o texto é texto e cabe na coluna.
    for (const r of respostas) {
      if (!r || typeof r !== "object" || Array.isArray(r) || !auth.idDeRota(r.perguntaId)
        || (r.opcaoId != null && !auth.idDeRota(r.opcaoId))
        || (r.textoResposta != null && (typeof r.textoResposta !== "string" || r.textoResposta.length > 500))) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Respostas inválidas." } };
        return;
      }
    }
    const enquete = await montarEnqueteCompleta(pool, enqueteId);
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

    const perguntasPorId = {};
    enquete.perguntas.forEach(p => { perguntasPorId[p.perguntaId] = p; });
    const respostasPorPerguntaId = {};
    respostas.forEach(r => { respostasPorPerguntaId[Number(r.perguntaId)] = r; });

    for (const pergunta of enquete.perguntas) {
      const resposta = respostasPorPerguntaId[pergunta.perguntaId];
      if (!resposta) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Falta responder: "${pergunta.titulo}".` } };
        return;
      }
      if (pergunta.tipo === "OPCOES" && !resposta.opcaoId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Escolha uma opção pra: "${pergunta.titulo}".` } };
        return;
      }
      // A opção tem que ser DESTA pergunta (senão o voto contaria numa opção de outra e o resultado ficaria errado).
      if (pergunta.tipo === "OPCOES" && !(pergunta.opcoes || []).some(o => o.opcaoId === Number(resposta.opcaoId))) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `A opção escolhida não é de: "${pergunta.titulo}".` } };
        return;
      }
      if (pergunta.tipo === "TEXTO_LIVRE" && !resposta.textoResposta) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Informe uma resposta pra: "${pergunta.titulo}".` } };
        return;
      }
    }

    const jaRespondeu = await pool.request()
      .input("enqueteId", sql.Int, enqueteId).input("membroId", sql.Int, membroId)
      .query(`SELECT 1 FROM RespostasEnquete r JOIN PerguntasEnquete p ON p.PerguntaId = r.PerguntaId
              WHERE p.EnqueteId = @enqueteId AND r.MembroId = @membroId`);
    if (jaRespondeu.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula já respondeu este formulário." } };
      return;
    }

    for (const pergunta of enquete.perguntas) {
      const resposta = respostasPorPerguntaId[pergunta.perguntaId];
      await pool.request()
        .input("perguntaId", sql.Int, pergunta.perguntaId)
        .input("membroId", sql.Int, membroId)
        .input("opcaoId", sql.Int, pergunta.tipo === "OPCOES" ? resposta.opcaoId : null)
        .input("textoResposta", sql.NVarChar(500), pergunta.tipo === "TEXTO_LIVRE" ? resposta.textoResposta : null)
        .query(`INSERT INTO RespostasEnquete (PerguntaId, MembroId, OpcaoId, TextoResposta) VALUES (@perguntaId, @membroId, @opcaoId, @textoResposta)`);
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Respostas registradas." } };
    return;
  }

  // ---- POST /enquetes/{id}/encerrar ----
  if (method === "POST" && id && acao === "encerrar") {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]);
    if (!usuario) return;
    if (!auth.idDeRota(id)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Enquete inválida." } };
      return;
    }
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
      const pergunta = enquete.perguntas[0];
      const maisVotada = pergunta.opcoes.reduce((max, o) => (o.votos > max ? o.votos : max), 0);
      const avaliacao = estatuto.avaliarAprovacaoEnquete(pergunta.totalRespostas, maisVotada, enquete.quorumTipo);
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

  // ---- GET: lista (com detalhe conforme visibilidade) — exige sessão (antes qualquer um listava participantes e, nas públicas, quem votou em quê) ----
  if (method === "GET" && !id) {
    if (!auth.exigirLoginIgnorandoTermos(req, context)) return;
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
      titulo, descricao, visibilidade, publicoTipo, publicoMembroIds,
      vinculante, quorumTipo, perguntas, orgaoId, sessaoId
    } = req.body || {};

    if (!titulo) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o título." } };
      return;
    }
    if (!Array.isArray(perguntas) || perguntas.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe ao menos 1 pergunta." } };
      return;
    }
    const visibilidadeFinal = visibilidade || "SECRETA";
    const publicoTipoFinal = publicoTipo || "TODOS_ATIVOS";
    if (!VISIBILIDADES_VALIDAS.includes(visibilidadeFinal)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Visibilidade inválida." } };
      return;
    }
    if (!PUBLICOS_VALIDOS.includes(publicoTipoFinal)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Tipo de público inválido." } };
      return;
    }
    for (const pergunta of perguntas) {
      if (!pergunta.titulo) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Toda pergunta precisa de um título." } };
        return;
      }
      if (!TIPOS_VALIDOS.includes(pergunta.tipo)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Tipo de pergunta inválido: "${pergunta.titulo}".` } };
        return;
      }
      if (pergunta.tipo === "OPCOES" && (!Array.isArray(pergunta.opcoes) || pergunta.opcoes.length < 2)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `A pergunta "${pergunta.titulo}" precisa de ao menos 2 opções.` } };
        return;
      }
    }
    if (vinculante && (perguntas.length !== 1 || perguntas[0].tipo !== "OPCOES" || !QUORUM_TIPOS_VALIDOS.includes(quorumTipo))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete vinculante precisa ter exatamente 1 pergunta, do tipo Opções, com um QuorumTipo válido." } };
      return;
    }
    if (publicoTipoFinal === "LISTA_CUSTOM" && (!Array.isArray(publicoMembroIds) || publicoMembroIds.length === 0)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe as matrículas do público customizado." } };
      return;
    }

    const criada = await pool.request()
      .input("titulo", sql.NVarChar(200), titulo)
      .input("descricao", sql.NVarChar(1000), descricao || null)
      .input("visibilidade", sql.NVarChar(20), visibilidadeFinal)
      .input("publicoTipo", sql.NVarChar(20), publicoTipoFinal)
      .input("vinculante", sql.Bit, !!vinculante)
      .input("quorumTipo", sql.NVarChar(30), vinculante ? quorumTipo : null)
      .input("orgaoId", sql.Int, orgaoId || null)
      .input("sessaoId", sql.Int, sessaoId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO Enquetes (Titulo, Descricao, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, OrgaoId, SessaoId, CriadoPor)
        OUTPUT INSERTED.EnqueteId
        VALUES (@titulo, @descricao, @visibilidade, @publicoTipo, @vinculante, @quorumTipo, @orgaoId, @sessaoId, @criadoPor)
      `);
    const enqueteId = criada.recordset[0].EnqueteId;

    let ordem = 1;
    for (const pergunta of perguntas) {
      const perguntaCriada = await pool.request()
        .input("enqueteId", sql.Int, enqueteId).input("ordem", sql.Int, ordem++)
        .input("titulo", sql.NVarChar(300), pergunta.titulo).input("tipo", sql.NVarChar(20), pergunta.tipo)
        .query(`INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) OUTPUT INSERTED.PerguntaId VALUES (@enqueteId, @ordem, @titulo, @tipo)`);
      const perguntaId = perguntaCriada.recordset[0].PerguntaId;
      if (pergunta.tipo === "OPCOES") {
        for (const texto of pergunta.opcoes) {
          await pool.request().input("perguntaId", sql.Int, perguntaId).input("texto", sql.NVarChar(300), texto)
            .query(`INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@perguntaId, @texto)`);
        }
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
      dadosDepois: { titulo, totalPerguntas: perguntas.length, visibilidade: visibilidadeFinal, vinculante: !!vinculante }
    });

    const enqueteCompleta = await montarEnqueteCompleta(pool, enqueteId);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Enquete criada.", enquete: enqueteCompleta } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
