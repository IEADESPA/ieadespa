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
// GET  /api/enquetes?paraVotar=1     -> (v7.14, Meu Painel → Votações) só as ABERTAS em que a pessoa da sessão está no público: perguntas e opções, sem contagem, e se ela já
//                                       respondeu. Qualquer login (inclusive PIN).
// POST /api/enquetes                 -> cria (exige permissão reunioes/assembleia); `dataFechamentoPrevista` opcional ("AAAA-MM-DDTHH:MM", horário de Brasília): fecha sozinha
// POST /api/enquetes/{id}/votar      -> body: { respostas: [{perguntaId, opcaoId?|textoResposta?}] } — exige sessão; o voto é SEMPRE da matrícula da sessão
//                                       (fecho da v7.5: antes bastava informar uma matrícula no corpo e qualquer um votava em nome de qualquer pessoa)
// POST /api/enquetes/{id}/encerrar   -> fecha; se Vinculante, calcula ResultadoAprovado
//
// ESCOPO (02/10/2026):
//  - criar enquete VINCULANTE, para TODOS os ativos ou de órgão central é ato da igreja inteira: só o nível GERAL (papel Global com escopo "TODAS"). O papel local
//    (Dirigente, Membro da JAI...) cria só enquete de PÚBLICO CUSTOM, e cada matrícula da lista precisa estar no escopo dele; a sessão vinculada, se houver, tem de ser de um
//    órgão local do qual ele faz parte;
//  - ENCERRAR: o criador da enquete ou o GERAL (encerrar fixa o resultado de uma enquete vinculante);
//  - GET: quem não tem "reunioes"/"assembleia" só vê as enquetes em que está no público e, nelas, só a própria participação; a mesa local vê participantes e respostas
//    só de pessoas do seu escopo (e o total de votos por opção, que é agregado, continua inteiro).
//
// v7.14 (Identidade Visual): (1) a enquete pode fechar sozinha (DataFechamentoPrevista): passado o instante, a leitura já a mostra ENCERRADA e o voto é recusado — conferido
// no próprio INSERT, pela hora do banco —, e a rotina diária a encerra de vez; (2) o voto confere o público só da pessoa (não relê o cadastro inteiro a cada voto) e, com
// dois envios ao mesmo tempo, o segundo esbarra na chave única (uma resposta por pergunta e pessoa) e recebe "já respondeu" — antes, um erro 500; (3) a votação do tema da
// Identidade Visual não se encerra à mão: ela fecha sozinha no fim do dia 30/11 e o ciclo apura.
const auth = require("../shared/auth");
const { ehGeral, noEscopoDaPessoa } = require("../shared/escopoRotas");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { membrosElegiveis, membroElegivel, passouDoFechamento, encerrarEnquete, recuperarResultado } = require("../shared/enquetes");
// O INSERT do voto: a enquete lida COM TRAVA (UPDLOCK, REPEATABLEREAD — uma leitura com trava mesmo com o banco em READ_COMMITTED_SNAPSHOT), aberta e antes do instante
// marcado pela hora do banco. Exportado para o roteiro ponta a ponta provar a corrida com o encerramento (tools/e2e-localdb/e2e-39).
const SQL_INSERIR_RESPOSTA = `INSERT INTO RespostasEnquete (PerguntaId, MembroId, OpcaoId, TextoResposta)
                  SELECT @perguntaId, @membroId, @opcaoId, @textoResposta
                  WHERE EXISTS (SELECT 1 FROM Enquetes WITH (UPDLOCK, REPEATABLEREAD) WHERE EnqueteId = @enqueteId AND Status = 'ABERTA'
                                AND (DataFechamentoPrevista IS NULL OR DataFechamentoPrevista > SYSUTCDATETIME()))`;

const TIPOS_VALIDOS = ["OPCOES", "TEXTO_LIVRE"];
const VISIBILIDADES_VALIDAS = ["PUBLICA", "SECRETA"];
const PUBLICOS_VALIDOS = ["TODOS_ATIVOS", "LISTA_CUSTOM"];
const QUORUM_TIPOS_VALIDOS = ["MAIORIA_SIMPLES", "DOIS_TERCOS", "NOVENTA_POR_CENTO"];
const MAX_PERGUNTAS = 50;
const MAX_OPCOES = 50;
const MAX_PUBLICO_CUSTOM = 5000;
const MSG_SO_GERAL = "Enquete vinculante, para todos os membros ou de órgão central é da administração geral da igreja. Crie uma enquete de público específico, só com membros do seu escopo.";
const MSG_PUBLICO_FORA = "Há matrícula inexistente ou fora do seu escopo no público da enquete.";

// A enquete (só a linha). Passado o instante marcado, a enquete é ENCERRADA DE VERDADE aqui, uma vez (o mesmo encerramento da rotina, com o resultado da vinculante
// gravado e a trilha) — não só para quem lê: até a rotina das 7h, a vinculante aparecia "Não aprovado" e a minuta da ata, "em andamento" (revisão de 23/10/2026).
async function lerEnquete(pool, enqueteId) {
  const enqueteResult = await pool.request().input("id", sql.Int, enqueteId).query(`
    SELECT EnqueteId AS enqueteId, Titulo AS titulo, Descricao AS descricao,
           Visibilidade AS visibilidade, PublicoTipo AS publicoTipo, Vinculante AS vinculante,
           QuorumTipo AS quorumTipo, Status AS status, ResultadoAprovado AS resultadoAprovado, CriadoPor AS criadoPor,
           CONVERT(varchar(33), DataAbertura, 126) AS dataAbertura,
           CONVERT(varchar(33), DataFechamento, 126) AS dataFechamento,
           CONVERT(varchar(33), DataFechamentoPrevista, 126) AS dataFechamentoPrevista
    FROM Enquetes WHERE EnqueteId = @id
  `);
  const enquete = enqueteResult.recordset[0];
  if (!enquete) return null;
  if (enquete.dataFechamentoPrevista === undefined) enquete.dataFechamentoPrevista = null;
  if (enquete.status === "ABERTA" && passouDoFechamento(enquete)) {
    const fechou = await encerrarEnquete(pool, enqueteId, { agendada: true, enquete });
    if (fechou.encerrada) { enquete.status = "ENCERRADA"; enquete.resultadoAprovado = fechou.resultadoAprovado; }
    else {
      // outra chamada fechou no meio, ou o relógio do banco ainda não chegou ao instante: relê a situação gravada
      const atual = (await pool.request().input("id", sql.Int, enqueteId).query(`SELECT Status AS status, ResultadoAprovado AS resultadoAprovado FROM Enquetes WHERE EnqueteId = @id`)).recordset[0] || {};
      if (atual.status === "ENCERRADA") { enquete.status = "ENCERRADA"; enquete.resultadoAprovado = atual.resultadoAprovado; }
      else enquete.status = "ENCERRADA";           // para quem lê, já passou da hora (o voto também é recusado pela hora do banco)
    }
  }
  await recuperarResultado(pool, enquete, { sql });
  return enquete;
}
// As perguntas e as opções (sem respostas): o que o voto precisa conferir.
async function lerPerguntas(pool, enqueteId) {
  const perguntasResult = await pool.request().input("id", sql.Int, enqueteId)
    .query(`SELECT PerguntaId AS perguntaId, Ordem AS ordem, Titulo AS titulo, Tipo AS tipo
            FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem`);
  const perguntas = [];
  for (const pergunta of perguntasResult.recordset) {
    const opcoesResult = await pool.request().input("id", sql.Int, pergunta.perguntaId)
      .query(`SELECT OpcaoId AS opcaoId, Texto AS texto FROM OpcoesEnquete WHERE PerguntaId = @id`);
    perguntas.push(Object.assign({}, pergunta, { opcoes: opcoesResult.recordset }));
  }
  return perguntas;
}

async function montarEnqueteCompleta(pool, enqueteId) {
  const enquete = await lerEnquete(pool, enqueteId);
  if (!enquete) return null;
  const perguntas = [];
  const participantesPorId = {};

  for (const pergunta of await lerPerguntas(pool, enqueteId)) {
    const opcoesResult = { recordset: pergunta.opcoes };
    // congregacaoNome/extensaoNome só servem para filtrar a visão por escopo (visaoDaEnquete) e saem antes da resposta.
    const respostasResult = await pool.request().input("id", sql.Int, pergunta.perguntaId).query(`
      SELECT r.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome, r.OpcaoId AS opcaoId, r.TextoResposta AS textoResposta
      FROM RespostasEnquete r JOIN MembroReferencia m ON m.MembroId = r.MembroId
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
      WHERE r.PerguntaId = @id
    `);

    const contagemPorOpcao = {};
    opcoesResult.recordset.forEach(o => { contagemPorOpcao[o.opcaoId] = 0; });
    respostasResult.recordset.forEach(r => {
      if (r.opcaoId != null) contagemPorOpcao[r.opcaoId] = (contagemPorOpcao[r.opcaoId] || 0) + 1;
      participantesPorId[r.membroId] = { membroId: r.membroId, nome: r.nome, congregacaoNome: r.congregacaoNome || null, extensaoNome: r.extensaoNome || null };
    });

    const opcoes = opcoesResult.recordset.map(o => Object.assign({}, o, { votos: contagemPorOpcao[o.opcaoId] || 0 }));
    const detalheRespostas = enquete.visibilidade === "PUBLICA"
      ? respostasResult.recordset.map(r => ({ membroId: r.membroId, nome: r.nome, congregacaoNome: r.congregacaoNome || null, extensaoNome: r.extensaoNome || null, opcaoId: r.opcaoId, textoResposta: r.textoResposta }))
      : undefined;

    perguntas.push(Object.assign({}, pergunta, {
      opcoes, totalRespostas: respostasResult.recordset.length, respostas: detalheRespostas
    }));
  }

  const participantes = Object.values(participantesPorId);

  return Object.assign({}, enquete, { perguntas, totalVotos: participantes.length, participantes });
}

// O que quem pede pode ver da enquete: o geral vê tudo; os demais, só participantes/respostas de pessoas do próprio escopo (a mesa local) ou só as próprias (`soPropria`, para
// quem não é da mesa). Os totais (totalVotos, votos por opção, totalRespostas) são agregados e ficam inteiros. Tira os campos internos (criadoPor, congregação das pessoas).
function visaoDaEnquete(enquete, usuario, soPropria) {
  const geral = ehGeral(usuario);
  const pode = (p) => geral || Number(p.membroId) === Number(usuario.membroId) || (!soPropria && noEscopoDaPessoa(usuario, p.congregacaoNome, p.extensaoNome));
  const limpa = ({ congregacaoNome, extensaoNome, ...resto }) => resto;
  const { criadoPor, ...publica } = enquete;
  return Object.assign({}, publica, {
    participantes: (enquete.participantes || []).filter(pode).map(limpa),
    perguntas: (enquete.perguntas || []).map(p => Object.assign({}, p, {
      respostas: p.respostas === undefined ? undefined : p.respostas.filter(pode).map(limpa)
    }))
  });
}

function texto(v, max) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
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
    // (revisão) só a enquete, as perguntas e as opções — o voto não relê as respostas de todo mundo
    const enquete = await lerEnquete(pool, enqueteId);
    if (!enquete) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete não encontrada." } };
      return;
    }
    if (enquete.status !== "ABERTA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já foi encerrada." } };
      return;
    }
    enquete.perguntas = await lerPerguntas(pool, enqueteId);
    if (!(await membroElegivel(pool, sql, enquete, Number(membroId)))) {
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

    // v7.14 — cada resposta só entra com a enquete ainda ABERTA e antes do instante marcado, na hora do BANCO, no mesmo comando (SQL_INSERIR_RESPOSTA). A enquete é
    // lida com trava (UPDLOCK): com o banco em READ_COMMITTED_SNAPSHOT (Azure SQL), o encerramento que estiver em curso termina antes — e o voto a encontra encerrada —, ou
    // espera este voto terminar e o conta (shared/enquetes.js, encerrarEnquete: fecha primeiro, conta depois).
    // Uma pergunta: um comando só (atômico); dois envios da mesma pessoa ao mesmo tempo: o segundo esbarra na chave única e recebe "já respondeu".
    // Várias perguntas: uma transação — ou todas as respostas entram, ou nenhuma (revisão: antes, se a enquete fechasse no meio, ficava gravada só a primeira e a
    // resposta dizia "registradas").
    const JA_RESPONDEU = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula já respondeu este formulário." } };
    const ENCERRADA = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já foi encerrada." } };
    const inserir = (rq, pergunta) => {
      const resposta = respostasPorPerguntaId[pergunta.perguntaId];
      return rq.input("enqueteId", sql.Int, enqueteId)
        .input("perguntaId", sql.Int, pergunta.perguntaId)
        .input("membroId", sql.Int, membroId)
        .input("opcaoId", sql.Int, pergunta.tipo === "OPCOES" ? resposta.opcaoId : null)
        .input("textoResposta", sql.NVarChar(500), pergunta.tipo === "TEXTO_LIVRE" ? resposta.textoResposta : null)
        .query(SQL_INSERIR_RESPOSTA);
    };
    const gravou = (r) => !!(r && r.rowsAffected && r.rowsAffected[0] > 0);
    if (enquete.perguntas.length === 1) {
      let r;
      try { r = await inserir(pool.request(), enquete.perguntas[0]); } catch (e) {
        if (e && (e.number === 2627 || e.number === 2601)) { context.res = JA_RESPONDEU; return; }
        throw e;
      }
      if (!gravou(r)) { context.res = ENCERRADA; return; }
    } else {
      const t = new sql.Transaction(pool);
      const rq = () => new sql.Request(t);
      let ok = false;
      try {
        await t.begin();
        // a resposta da primeira pergunta é lida com trava de intervalo: um segundo envio da mesma pessoa espera este terminar e então vê que já respondeu
        const ja = await rq().input("p", sql.Int, enquete.perguntas[0].perguntaId).input("m", sql.Int, membroId)
          .query(`SELECT 1 AS ja FROM RespostasEnquete WITH (UPDLOCK, HOLDLOCK) WHERE PerguntaId = @p AND MembroId = @m`);
        if (ja.recordset.length > 0) { context.res = JA_RESPONDEU; return; }
        for (const pergunta of enquete.perguntas) {
          if (!gravou(await inserir(rq(), pergunta))) { context.res = ENCERRADA; return; }
        }
        await t.commit();
        ok = true;
      } catch (e) {
        if (e && (e.number === 2627 || e.number === 2601)) { context.res = JA_RESPONDEU; return; }
        throw e;
      } finally {
        if (!ok) { try { await t.rollback(); } catch (_) { /* já desfeita */ } }
      }
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Respostas registradas." } };
    return;
  }

  // ---- POST /enquetes/{id}/encerrar ----
  if (method === "POST" && id && acao === "encerrar") {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]);
    if (!usuario) return;
    const enqueteId = auth.idDeRota(id);
    if (!enqueteId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Enquete inválida." } };
      return;
    }
    const enquete = await montarEnqueteCompleta(pool, enqueteId);
    // Quem não criou a enquete (e não é o geral) recebe a mesma resposta de "não existe".
    if (!enquete || !(ehGeral(usuario) || (enquete.criadoPor != null && Number(enquete.criadoPor) === Number(usuario.membroId)))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete não encontrada." } };
      return;
    }
    if (enquete.status !== "ABERTA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já está encerrada." } };
      return;
    }
    // v7.14 — a votação do tema da Identidade Visual segue o calendário do Art. 159: não se encerra à mão
    const daIdentidade = await pool.request().input("id", sql.Int, enqueteId).query(`SELECT AnoAlvo FROM IdentidadeCiclos WHERE EnqueteId = @id`);
    if (daIdentidade.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta é a votação do tema da Identidade Visual: ela fecha sozinha no fim do dia 30 de novembro (Regimento, Art. 159), e o sistema apura." } };
      return;
    }
    // (revisão) marca ENCERRADA primeiro e só então conta (shared/enquetes.js): um voto em curso termina antes e entra na conta; nenhum entra depois
    const fechada = await encerrarEnquete(pool, enqueteId, { enquete, usuarioId: usuario.membroId, acao: "Encerrou enquete" });
    if (!fechada.encerrada) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta enquete já está encerrada." } };
      return;
    }
    const resultadoAprovado = fechada.resultadoAprovado;
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Enquete encerrada.", resultadoAprovado } };
    return;
  }

  // ---- GET: lista (com detalhe conforme visibilidade) — exige sessão (antes qualquer um listava participantes e, nas públicas, quem votou em quê) ----
  // ---- GET ?paraVotar=1 (v7.14 — Meu Painel → Votações): as abertas em que a pessoa está no público, sem contagem ----
  if (method === "GET" && !id && req.query && String(req.query.paraVotar) === "1") {
    const usuario = auth.exigirLoginIgnorandoTermos(req, context);
    if (!usuario) return;
    const membroId = auth.idDeRota(usuario.membroId);
    if (!membroId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Sessão sem matrícula." } }; return; }
    const abertas = (await pool.request().query(`
      SELECT EnqueteId AS enqueteId, Titulo AS titulo, Descricao AS descricao, Visibilidade AS visibilidade, PublicoTipo AS publicoTipo,
             CONVERT(varchar(33), DataAbertura, 126) AS dataAbertura, CONVERT(varchar(33), DataFechamentoPrevista, 126) AS dataFechamentoPrevista
      FROM Enquetes WHERE Status = 'ABERTA' AND (DataFechamentoPrevista IS NULL OR DataFechamentoPrevista > SYSUTCDATETIME())
      ORDER BY DataAbertura DESC`)).recordset;
    let aptoTodos = null;   // "todos os ativos" é a mesma conta para todas as enquetes: confere uma vez
    const lista = [];
    for (const e of abertas) {
      let pode;
      if (e.publicoTipo === "LISTA_CUSTOM") pode = await membroElegivel(pool, sql, e, membroId);
      else { if (aptoTodos === null) aptoTodos = await membroElegivel(pool, sql, e, membroId); pode = aptoTodos; }
      if (!pode) continue;
      const perguntas = (await pool.request().input("id", sql.Int, e.enqueteId)
        .query(`SELECT PerguntaId AS perguntaId, Ordem AS ordem, Titulo AS titulo, Tipo AS tipo FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem`)).recordset;
      for (const p of perguntas) {
        p.opcoes = p.tipo === "OPCOES" ? (await pool.request().input("id", sql.Int, p.perguntaId)
          .query(`SELECT OpcaoId AS opcaoId, Texto AS texto FROM OpcoesEnquete WHERE PerguntaId = @id ORDER BY OpcaoId`)).recordset : [];
      }
      const ja = await pool.request().input("enqueteId", sql.Int, e.enqueteId).input("membroId", sql.Int, membroId)
        .query(`SELECT TOP 1 CONVERT(varchar(33), r.DataResposta, 126) AS em FROM RespostasEnquete r JOIN PerguntasEnquete p ON p.PerguntaId = r.PerguntaId
                WHERE p.EnqueteId = @enqueteId AND r.MembroId = @membroId`);
      const identidade = await pool.request().input("id", sql.Int, e.enqueteId).query(`SELECT AnoAlvo FROM IdentidadeCiclos WHERE EnqueteId = @id`);
      lista.push({ enqueteId: e.enqueteId, titulo: e.titulo, descricao: e.descricao, visibilidade: e.visibilidade, dataAbertura: e.dataAbertura,
        dataFechamentoPrevista: e.dataFechamentoPrevista || null, perguntas, jaRespondeu: ja.recordset.length > 0, respondidaEm: ja.recordset.length ? ja.recordset[0].em : null,
        identidadeVisual: identidade.recordset.length ? Number(identidade.recordset[0].AnoAlvo) : null });
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: true, enquetes: lista } };
    return;
  }

  if (method === "GET" && !id) {
    const usuario = auth.exigirLoginIgnorandoTermos(req, context);
    if (!usuario) return;
    // v7.6 — a mesa vê participantes do escopo das SUAS permissões (reunioes/assembleia), não do somado de outro cargo ou delegação.
    const vMesa = auth.visaoDaPermissao(usuario, ["reunioes", "assembleia"]);
    const ehMesa = !!vMesa;
    const meuId = Number(usuario.membroId);
    const idsResult = await pool.request().query(`SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY DataAbertura DESC`);
    const daIdentidade = new Set(((await pool.request().query(`SELECT EnqueteId FROM IdentidadeCiclos WHERE EnqueteId IS NOT NULL`)).recordset || []).map(x => Number(x.EnqueteId)));
    const enquetes = [];
    let publicoTodosAtivos = null; // o universo "todos os ativos" é igual para todas as enquetes: calcula uma vez
    for (const row of idsResult.recordset) {
      const enquete = await montarEnqueteCompleta(pool, row.enqueteId);
      if (!enquete) continue;
      if (!ehMesa && Number(enquete.criadoPor) !== meuId) {
        let elegiveis;
        if (enquete.publicoTipo === "LISTA_CUSTOM") elegiveis = await membrosElegiveis(pool, sql, enquete);
        else {
          if (!publicoTodosAtivos) publicoTodosAtivos = await membrosElegiveis(pool, sql, enquete);
          elegiveis = publicoTodosAtivos;
        }
        if (!elegiveis.has(meuId)) continue; // enquete de outro público: nem aparece
      }
      const visao = visaoDaEnquete(enquete, vMesa || usuario, !ehMesa);
      // v7.14 — a votação do tema da Identidade Visual é secreta até fechar: com ela aberta, ninguém (nem a mesa) vê a contagem por opção; a tela da identidade mostra só
      // quantos votaram, e a apuração sai depois da meia-noite do dia 30
      if (visao.status === "ABERTA" && daIdentidade.has(Number(visao.enqueteId))) {
        visao.perguntas = visao.perguntas.map(p => Object.assign({}, p, { opcoes: p.opcoes.map(({ votos, ...o }) => o), respostas: undefined }));
        visao.participantes = visao.participantes.filter(p => Number(p.membroId) === meuId);
      }
      enquetes.push(visao);
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: enquetes };
    return;
  }

  // ---- POST: criar ----
  if (method === "POST" && !id) {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]);
    if (!usuario) return;
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const {
      titulo, descricao, visibilidade, publicoTipo, publicoMembroIds,
      vinculante, quorumTipo, perguntas
    } = corpo;
    const orgaoId = corpo.orgaoId ? auth.idDeRota(corpo.orgaoId) : null;
    const sessaoId = corpo.sessaoId ? auth.idDeRota(corpo.sessaoId) : null;
    const geral = ehGeral(usuario);

    if (!texto(titulo, 200)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o título (até 200 caracteres)." } };
      return;
    }
    if (descricao != null && (typeof descricao !== "string" || descricao.length > 1000)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Descrição inválida (texto de até 1000 caracteres)." } };
      return;
    }
    if (!Array.isArray(perguntas) || perguntas.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe ao menos 1 pergunta." } };
      return;
    }
    if (perguntas.length > MAX_PERGUNTAS) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `No máximo ${MAX_PERGUNTAS} perguntas por formulário.` } };
      return;
    }
    if ((corpo.orgaoId && !orgaoId) || (corpo.sessaoId && !sessaoId)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Órgão ou sessão inválidos." } };
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
      if (!pergunta || typeof pergunta !== "object" || !texto(pergunta.titulo, 300)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Toda pergunta precisa de um título (até 300 caracteres)." } };
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
      if (pergunta.tipo === "OPCOES" && (pergunta.opcoes.length > MAX_OPCOES || !pergunta.opcoes.every(o => texto(o, 300)))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `As opções da pergunta "${pergunta.titulo}" precisam ser texto de até 300 caracteres (no máximo ${MAX_OPCOES}).` } };
        return;
      }
    }
    if (vinculante && (perguntas.length !== 1 || perguntas[0].tipo !== "OPCOES" || !QUORUM_TIPOS_VALIDOS.includes(quorumTipo))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Enquete vinculante precisa ter exatamente 1 pergunta, do tipo Opções, com um QuorumTipo válido." } };
      return;
    }
    // v7.14 — fecha sozinha: data e hora de Brasília (o campo datetime-local da tela), no futuro e em até 1 ano; guardada em UTC
    let previstaUtc = null;
    if (corpo.dataFechamentoPrevista !== undefined && corpo.dataFechamentoPrevista !== null && corpo.dataFechamentoPrevista !== "") {
      const v = corpo.dataFechamentoPrevista;
      const instante = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(`${v}:00-03:00`) : NaN;
      const agora = Date.now();
      if (!Number.isFinite(instante) || new Date(instante - 3 * 3600000).toISOString().slice(0, 16) !== v) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Data de fechamento inválida (use dia e hora)." } };
        return;
      }
      if (instante <= agora + 5 * 60000 || instante > agora + 366 * 86400000) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "A enquete precisa fechar no futuro (pelo menos 5 minutos a partir de agora) e em até 1 ano." } };
        return;
      }
      previstaUtc = new Date(instante).toISOString().slice(0, 19);
    }
    if (publicoTipoFinal === "LISTA_CUSTOM" && (!Array.isArray(publicoMembroIds) || publicoMembroIds.length === 0)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe as matrículas do público customizado." } };
      return;
    }

    // Só o geral cria enquete que vale para a igreja inteira (vinculante, todos os ativos) ou de órgão central.
    if (!geral && (vinculante || publicoTipoFinal === "TODOS_ATIVOS" || orgaoId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: MSG_SO_GERAL } };
      return;
    }

    // O público custom: matrículas na forma canônica, sem repetição, todas existentes e (fora o geral) todas do escopo de quem cria.
    let idsPublico = [];
    if (publicoTipoFinal === "LISTA_CUSTOM") {
      if (publicoMembroIds.length > MAX_PUBLICO_CUSTOM) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `O público customizado aceita no máximo ${MAX_PUBLICO_CUSTOM} matrículas.` } };
        return;
      }
      const convertidos = publicoMembroIds.map(auth.idDeRota);
      if (convertidos.some(n => !n)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Há matrícula inválida no público da enquete." } };
        return;
      }
      idsPublico = Array.from(new Set(convertidos));
      const pessoas = (await pool.request().query(`
        SELECT m.MembroId AS membroId, cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
        FROM MembroReferencia m
        LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
        LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
        WHERE m.MembroId IN (${idsPublico.join(",")})`)).recordset;
      // Inexistente e fora do escopo dão a mesma resposta.
      if (pessoas.length !== idsPublico.length || (!geral && pessoas.some(p => !noEscopoDaPessoa(usuario, p.congregacaoNome, p.extensaoNome)))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: MSG_PUBLICO_FORA } };
        return;
      }
    }
    if (orgaoId) {
      const orgao = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT OrgaoId FROM Orgaos WHERE OrgaoId = @id`);
      if (orgao.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
        return;
      }
    }
    if (sessaoId) {
      const sessao = (await pool.request().input("id", sql.Int, sessaoId).query(`SELECT SessaoId, OrgaoId, OrgaoLocalId FROM Sessoes WHERE SessaoId = @id`)).recordset[0];
      // A sessão de órgão local só serve a quem é do órgão; a de órgão central, só ao geral. Inexistente e fora do escopo dão a mesma resposta.
      const alcanca = !!sessao && (geral || (sessao.OrgaoLocalId != null && await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, sessao.OrgaoLocalId)));
      if (!alcanca) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Sessão não encontrada." } };
        return;
      }
    }

    const criada = await pool.request()
      .input("titulo", sql.NVarChar(200), titulo.trim())
      .input("descricao", sql.NVarChar(1000), descricao || null)
      .input("visibilidade", sql.NVarChar(20), visibilidadeFinal)
      .input("publicoTipo", sql.NVarChar(20), publicoTipoFinal)
      .input("vinculante", sql.Bit, !!vinculante)
      .input("quorumTipo", sql.NVarChar(30), vinculante ? quorumTipo : null)
      .input("orgaoId", sql.Int, orgaoId || null)
      .input("sessaoId", sql.Int, sessaoId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .input("prevista", sql.NVarChar(19), previstaUtc)
      .query(`
        INSERT INTO Enquetes (Titulo, Descricao, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, OrgaoId, SessaoId, CriadoPor, DataFechamentoPrevista)
        OUTPUT INSERTED.EnqueteId
        VALUES (@titulo, @descricao, @visibilidade, @publicoTipo, @vinculante, @quorumTipo, @orgaoId, @sessaoId, @criadoPor, CONVERT(datetime2, @prevista, 126))
      `);
    const enqueteId = criada.recordset[0].EnqueteId;

    // Sem transação no pool deste projeto: se algo falhar no meio, desfaz o que foi criado (a enquete pela metade ficaria ABERTA e visível para todos).
    try {
      let ordem = 1;
      for (const pergunta of perguntas) {
        const perguntaCriada = await pool.request()
          .input("enqueteId", sql.Int, enqueteId).input("ordem", sql.Int, ordem++)
          .input("titulo", sql.NVarChar(300), pergunta.titulo).input("tipo", sql.NVarChar(20), pergunta.tipo)
          .query(`INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) OUTPUT INSERTED.PerguntaId VALUES (@enqueteId, @ordem, @titulo, @tipo)`);
        const perguntaId = perguntaCriada.recordset[0].PerguntaId;
        if (pergunta.tipo === "OPCOES") {
          for (const textoOpcao of pergunta.opcoes) {
            await pool.request().input("perguntaId", sql.Int, perguntaId).input("texto", sql.NVarChar(300), textoOpcao)
              .query(`INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@perguntaId, @texto)`);
          }
        }
      }
      for (const membroIdItem of idsPublico) {
        await pool.request().input("enqueteId", sql.Int, enqueteId).input("membroId", sql.Int, membroIdItem)
          .query(`INSERT INTO PublicoEnqueteCustom (EnqueteId, MembroId) VALUES (@enqueteId, @membroId)`);
      }
    } catch (erro) {
      try {
        await pool.request().input("enqueteId", sql.Int, enqueteId).query(`
          DELETE FROM PublicoEnqueteCustom WHERE EnqueteId = @enqueteId;
          DELETE o FROM OpcoesEnquete o JOIN PerguntasEnquete p ON p.PerguntaId = o.PerguntaId WHERE p.EnqueteId = @enqueteId;
          DELETE FROM PerguntasEnquete WHERE EnqueteId = @enqueteId;
          DELETE FROM Enquetes WHERE EnqueteId = @enqueteId;`);
      } catch (e) {
        context.log.error("Falha ao desfazer enquete incompleta:", e.message);
      }
      throw erro;
    }

    await registrarAuditoria({
      tabela: "Enquetes", registroId: enqueteId, acao: "Criou enquete", usuarioId: usuario.membroId,
      dadosDepois: { titulo, totalPerguntas: perguntas.length, visibilidade: visibilidadeFinal, vinculante: !!vinculante, publicoTipo: publicoTipoFinal }
    });

    const enqueteCompleta = await montarEnqueteCompleta(pool, enqueteId);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Enquete criada.", enquete: visaoDaEnquete(enqueteCompleta, usuario, false) } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};

// Para o roteiro ponta a ponta (a corrida do voto com o encerramento). NÃO enumerável: o host precisa ver um export igual ao de um index.js comum (só a função).
Object.defineProperty(module.exports, "SQL_INSERIR_RESPOSTA", { value: SQL_INSERIR_RESPOSTA, enumerable: false });
