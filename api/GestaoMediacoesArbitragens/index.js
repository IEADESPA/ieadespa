// GestaoMediacoesArbitragens (vB.16 — Mediação e Arbitragem Eclesiástica, Reg. Art. 161-A)
// Disputa patrimonial/administrativa ENTRE PARTES — via distinta do
// processo disciplinar (FASE 3). Sequência travada pelo sistema: arbitragem
// só abre depois da mediação encerrar SEM acordo.
// GET  /api/mediacoes                 -> lista (permissão "mediacao")
// GET  /api/mediacoes/{id}            -> detalhe + sessões + prazo calculado
// POST /api/mediacoes                 -> instaura (qualquer pessoa logada — qualquer parte pode abrir)
// POST /api/mediacoes/{id}/sessoes    -> registra sessão de mediação (comparecimento)
// PUT  /api/mediacoes/{id}            -> { acao, ... }
//      DESIGNAR_MEDIADOR { mediadorId } | REGISTRAR_ACORDO (= PROPOR_ACORDO) { resumoAcordo, saidaVinculadaId? }  — só PROPÕE o texto (ver abaixo)
//      MEDIACAO_SEM_ACORDO { motivo } | DESIGNAR_ARBITRO { arbitroId }
//      REGISTRAR_COMPROMISSO_ARBITRAL (= PROPOR_COMPROMISSO_ARBITRAL) {} — só PROPÕE | REGISTRAR_SENTENCA { sentencaBase64, mimeType }
//      BIFURCAR_DISCIPLINAR { orgaoResponsavelId?, orgaoLocalId?, infracoesIds }
//
// ESCOPO (02/10/2026): abrir caso — qualquer sessão de pessoa logada, mas só como PARTE do caso (a matrícula da sessão é a Parte A ou a Parte B), a não ser que tenha a
// permissão "mediacao"; as matrículas das partes precisam existir. BIFURCAR_DISCIPLINAR abre um processo disciplinar (sigiloso, tira a pessoa do universo de votantes),
// então exige TAMBÉM a permissão "disciplina" e a pessoa dentro do escopo de quem pede (e o órgão territorial, se informado, tem de ser um do qual ele faz parte) — a mesma
// regra de AbrirProcessoDisciplinar; fora do escopo = a mesma resposta de "matrícula não encontrada".
//
// ACEITE SÓ POR ATO DA PARTE (fecho dos itens em aberto, 03/10/2026; migração 132). Antes REGISTRAR_ACORDO e REGISTRAR_COMPROMISSO_ARBITRAL gravavam um aceite
// em nome de cada parte, sem ato dela. Agora essas duas ações só PROPÕEM o texto, e a decisão (aceite ou recusa) de cada parte nasce de um destes caminhos:
// GET  /api/mediacoes/minhas                  -> os casos em que EU sou parte, com o texto proposto e a situação de cada parte (login)
// POST /api/mediacoes/{id}/decisao            -> { instrumento: ACORDO|COMPROMISSO, decisao: ACEITE|RECUSA, hashTexto }  a PRÓPRIA parte, com a sessão dela (login;
//                                                o mediador/árbitro não decide pela parte por aqui: a matrícula da sessão tem de ser a da parte)
// POST /api/mediacoes/{id}/decisao-presencial -> { instrumento, parte: A|B, decisao, hashTexto, dataAssinatura, documentoBase64, mimeType, nomeArquivo, observacao? }
//                                                o documento assinado em papel, registrado pelo mediador (acordo) ou árbitro (compromisso) do caso ou pela Câmara
//                                                ("mediacao"); o anexo é OBRIGATÓRIO e quem registra não pode ser parte. Canal PRESENCIAL_ANEXO, com quem e quando.
// O acordo só é firmado (MEDIACAO_ACORDO) quando as DUAS partes aceitaram o MESMO texto (hash); o compromisso, idem (CompromissoFirmadoEm). Recusa fica
// registrada. Tudo numa transação com a linha do caso travada: duas decisões ao mesmo tempo não firmam (nem deixam de firmar) por corrida.
const auth = require("../shared/auth");
const { pessoaAlcancavel } = require("../shared/escopoRotas");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");
const { validarOrgaoProcesso } = require("../shared/disciplinar");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const mediacaoArbitragem = require("../shared/mediacaoArbitragem");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { notificarAgora } = require("../shared/canaisDb");

const SELECT_ACEITES = `
  SELECT a.AceiteMediacaoId AS aceiteMediacaoId, a.Instrumento AS instrumento, a.Parte AS parte, a.ParteMembroId AS parteMembroId, a.Decisao AS decisao,
         a.Canal AS canal, a.HashTexto AS hashTexto, a.TermoAssinadoId AS termoAssinadoId, a.RegistradoPorMembroId AS registradoPorMembroId,
         r.Nome AS registradoPorNome, CONVERT(varchar(33), a.RegistradoEm, 126) AS registradoEm,
         CONVERT(varchar(10), a.DataAssinaturaPresencial, 120) AS dataAssinaturaPresencial, a.AnexoUrl AS anexoUrl, a.AnexoHash AS anexoHash,
         a.AnexoNome AS anexoNome, a.Observacao AS observacao
  FROM AceitesMediacao a LEFT JOIN MembroReferencia r ON r.MembroId = a.RegistradoPorMembroId
  WHERE a.MediacaoId = @id ORDER BY a.AceiteMediacaoId`;

async function carregarAceites(request, mediacaoId) {
  const linhas = (await request.input("id", sql.Int, mediacaoId).query(SELECT_ACEITES)).recordset;
  return linhas.map(a => ({ ...a, parte: String(a.parte || "").trim(), rotuloCanal: mediacaoArbitragem.ROTULO_CANAL[a.canal] || a.canal }));
}

// A situação dos dois instrumentos para a tela. `m`: a linha do caso (colunas do banco). `comAnexo`: a Câmara vê o link do documento; a parte não.
function situacaoDoCaso(m, aceites, { comAnexo = false } = {}) {
  const limpar = (a) => (a ? {
    aceiteMediacaoId: a.aceiteMediacaoId, parte: a.parte, decisao: a.decisao, canal: a.canal, rotuloCanal: a.rotuloCanal, registradoEm: a.registradoEm,
    registradoPorNome: a.canal === "PRESENCIAL_ANEXO" ? a.registradoPorNome : null, dataAssinaturaPresencial: a.dataAssinaturaPresencial,
    ...(comAnexo ? { anexoUrl: a.anexoUrl ? storage.urlDocumentoComSas(a.anexoUrl) : null, anexoNome: a.anexoNome, anexoHash: a.anexoHash, observacao: a.observacao } : {})
  } : null);
  const montar = (instrumento, texto, hash, propostoEm) => {
    const s = mediacaoArbitragem.situacaoInstrumento(aceites, { instrumento, hashAtual: hash });
    return {
      proposto: !!hash, texto: texto || null, hashTexto: hash || null, propostoEm: propostoEm ? new Date(propostoEm).toISOString() : null,
      firmado: s.firmado, recusadoPor: s.recusadoPor, partes: { A: limpar(s.partes.A), B: limpar(s.partes.B) }, legado: s.legado.map(limpar)
    };
  };
  const acordo = montar("ACORDO", m.AcordoTextoProposto, m.AcordoHashProposto, m.AcordoPropostoEm);
  // Caso encerrado com acordo pelo fluxo antigo: firmado de fato (o status fica), mas pelos aceites gravados sem ato da parte — a tela diz isso.
  if (m.Status === "MEDIACAO_ACORDO" && !acordo.firmado) acordo.firmadoAntesDaVerificacao = true;
  const compromisso = montar("COMPROMISSO", m.CompromissoTextoProposto, m.CompromissoHashProposto, m.CompromissoPropostoEm);
  compromisso.firmadoEm = m.CompromissoFirmadoEm ? new Date(m.CompromissoFirmadoEm).toISOString() : null;
  return { acordo, compromisso };
}

// O instrumento aguarda decisão das partes neste estado do caso?
function aguardaDecisao(m, instrumento) {
  if (instrumento === "ACORDO") return m.Status === "MEDIACAO_EM_CURSO" && !!m.AcordoHashProposto;
  return m.Status === "ARBITRAGEM_EM_CURSO" && !!m.CompromissoHashProposto && !m.CompromissoFirmadoEm;
}

// Grava a decisão e, se as duas partes aceitaram o mesmo texto, firma o instrumento — numa transação, com a linha do caso travada (UPDLOCK, HOLDLOCK).
// `partes`: ["A"] ou ["B"] (["A","B"] se a mesma matrícula ocupa as duas). Devolve { sucesso, mensagem, firmado }.
async function registrarDecisao(pool, { mediacaoId, instrumento, partes, decisao, hashTexto, canal, registradoPor, anexo = null, dataAssinatura = null, observacao = null }) {
  const transacao = new sql.Transaction(pool);
  await transacao.begin();
  const rq = () => new sql.Request(transacao);
  const desfazer = async () => { try { await transacao.rollback(); } catch { /* já encerrada */ } };
  try {
    const m = (await rq().input("id", sql.Int, mediacaoId).query(`SELECT * FROM MediacoesArbitragens WITH (UPDLOCK, HOLDLOCK) WHERE MediacaoId = @id`)).recordset[0];
    if (!m || !aguardaDecisao(m, instrumento)) {
      await desfazer();
      return { sucesso: false, mensagem: instrumento === "ACORDO" ? "Não há acordo proposto aguardando decisão neste caso (ou a mediação já foi encerrada)." : "Não há compromisso arbitral aguardando decisão neste caso (ou ele já foi firmado)." };
    }
    const hashAtual = instrumento === "ACORDO" ? m.AcordoHashProposto : m.CompromissoHashProposto;
    const textoAtual = instrumento === "ACORDO" ? m.AcordoTextoProposto : m.CompromissoTextoProposto;
    if (hashTexto !== hashAtual) {
      await desfazer();
      return { sucesso: false, textoMudou: true, mensagem: "O texto proposto mudou depois que foi aberto: leia a versão atual antes de decidir." };
    }
    for (const parte of partes) {
      const parteMembroId = parte === "A" ? m.ParteAId : m.ParteBId;
      // TermosAssinados só no aceite eletrônico da própria parte (é o ato dela no sistema); o presencial tem o papel assinado como prova.
      let termoId = null;
      if (canal === "PROPRIO" && decisao === "ACEITE") {
        termoId = instrumento === "ACORDO"
          ? await mediacaoArbitragem.registrarAceiteAcordoMediacao({ request: rq }, parteMembroId, textoAtual)
          : await mediacaoArbitragem.registrarCompromissoArbitral({ request: rq }, parteMembroId, textoAtual);
      }
      await rq().input("id", sql.Int, mediacaoId).input("inst", sql.NVarChar(12), instrumento).input("parte", sql.NChar(1), parte)
        .input("parteMembroId", sql.Int, parteMembroId || null).input("decisao", sql.NVarChar(8), decisao).input("canal", sql.NVarChar(24), canal)
        .input("hash", sql.NVarChar(64), hashAtual).input("termo", sql.Int, termoId).input("por", sql.Int, registradoPor)
        .input("dataAss", sql.Date, dataAssinatura).input("url", sql.NVarChar(500), anexo ? anexo.url : null).input("anexoHash", sql.NVarChar(64), anexo ? anexo.hash : null)
        .input("anexoNome", sql.NVarChar(255), anexo ? anexo.nome : null).input("anexoMime", sql.NVarChar(100), anexo ? anexo.mime : null)
        .input("obs", sql.NVarChar(500), observacao)
        .query(`INSERT INTO AceitesMediacao (MediacaoId, Instrumento, Parte, ParteMembroId, Decisao, Canal, HashTexto, TermoAssinadoId, RegistradoPorMembroId,
                                             DataAssinaturaPresencial, AnexoUrl, AnexoHash, AnexoNome, AnexoMime, Observacao)
                VALUES (@id, @inst, @parte, @parteMembroId, @decisao, @canal, @hash, @termo, @por, @dataAss, @url, @anexoHash, @anexoNome, @anexoMime, @obs)`);
    }
    const aceites = await carregarAceites(rq(), mediacaoId);
    const s = mediacaoArbitragem.situacaoInstrumento(aceites, { instrumento, hashAtual });
    if (s.firmado) {
      const termoDe = (p) => (s.partes[p] && s.partes[p].termoAssinadoId) || null;
      // Os ponteiros antigos (aceites gravados sem ato da parte) não são reescritos: só se preenchem os vazios.
      if (instrumento === "ACORDO") {
        await rq().input("id", sql.Int, mediacaoId).input("ta", sql.Int, termoDe("A")).input("tb", sql.Int, termoDe("B"))
          .query(`UPDATE MediacoesArbitragens SET Status = 'MEDIACAO_ACORDO', DataEncerramentoMediacao = CAST(SYSUTCDATETIME() AS DATE),
                         TermoAcordoParteAAssinadoId = COALESCE(TermoAcordoParteAAssinadoId, @ta), TermoAcordoParteBAssinadoId = COALESCE(TermoAcordoParteBAssinadoId, @tb),
                         SaidaVinculadaId = COALESCE(AcordoSaidaPropostaId, SaidaVinculadaId)
                  WHERE MediacaoId = @id AND Status = 'MEDIACAO_EM_CURSO'`);
      } else {
        await rq().input("id", sql.Int, mediacaoId).input("ta", sql.Int, termoDe("A")).input("tb", sql.Int, termoDe("B"))
          .query(`UPDATE MediacoesArbitragens SET CompromissoFirmadoEm = SYSUTCDATETIME(),
                         CompromissoArbitralParteAAssinadoId = COALESCE(CompromissoArbitralParteAAssinadoId, @ta), CompromissoArbitralParteBAssinadoId = COALESCE(CompromissoArbitralParteBAssinadoId, @tb)
                  WHERE MediacaoId = @id AND CompromissoFirmadoEm IS NULL`);
      }
    }
    await registrarAuditoriaNaTransacao(transacao, {
      tabela: "MediacoesArbitragens", registroId: Number(mediacaoId), usuarioId: registradoPor,
      acao: `${decisao === "ACEITE" ? "Aceite" : "Recusa"} da parte (${instrumento === "ACORDO" ? "acordo" : "compromisso arbitral"}) — ${canal === "PROPRIO" ? "pela própria parte" : "presencial com anexo"}`,
      dadosDepois: { instrumento, partes, decisao, canal, hashTexto: hashAtual, anexoHash: anexo ? anexo.hash : null, dataAssinatura, firmado: s.firmado }
    });
    await transacao.commit();
    return { sucesso: true, firmado: s.firmado, recusadoPor: s.recusadoPor };
  } catch (erro) {
    await desfazer();
    throw erro;
  }
}

// Aviso às partes que são membros (Meu Painel e e-mail) de que há texto esperando a decisão delas. Falha de aviso não derruba a proposta (notificarAgora engole).
async function avisarPartes(pool, m, mensagem) {
  const ids = [m.ParteAId, m.ParteBId].filter(x => x != null);
  if (!ids.length) return;
  const destinatarios = [];
  for (const membroId of new Set(ids.map(Number))) {
    const d = (await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
    if (d) destinatarios.push({ membroId: d.MembroId, nome: d.Nome, email: d.Email });
  }
  await notificarAgora(pool, { regraChave: "MEDIACAO_DECISAO_PENDENTE", destinatarios, mensagem, referenciaId: m.MediacaoId, referenciaTabela: "MediacoesArbitragens" });
}

function mensagemDaDecisao(instrumento, decisao, r) {
  const nome = instrumento === "ACORDO" ? "acordo" : "compromisso arbitral";
  if (r.firmado) return instrumento === "ACORDO" ? "✅ Decisão registrada. As duas partes aceitaram: acordo firmado e mediação encerrada com acordo." : "✅ Decisão registrada. As duas partes aceitaram: compromisso arbitral firmado.";
  if (decisao === "RECUSA") return `Recusa registrada. O ${nome} não foi firmado; o mediador/a Câmara verá a recusa.`;
  return `✅ Aceite registrado. O ${nome} só é firmado quando a outra parte também aceitar.`;
}

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

const SELECT_MEDIACAO = `
  SELECT m.MediacaoId AS mediacaoId, m.Assunto AS assunto,
         m.ParteAId AS parteAId, pa.Nome AS parteANome, m.ParteADescricao AS parteADescricao,
         m.ParteBId AS parteBId, pb.Nome AS parteBNome, m.ParteBDescricao AS parteBDescricao,
         m.ValorEnvolvido AS valorEnvolvido, m.PrazoDiasEncerramento AS prazoDiasEncerramento,
         m.Status AS status, m.InstauradoPor AS instauradoPor,
         CONVERT(varchar(10), m.DataInstauracao, 120) AS dataInstauracao,
         m.MediadorId AS mediadorId, mediador.Nome AS mediadorNome,
         CONVERT(varchar(10), m.DataDesignacaoMediador, 120) AS dataDesignacaoMediador,
         CONVERT(varchar(10), m.DataEncerramentoMediacao, 120) AS dataEncerramentoMediacao,
         m.SaidaVinculadaId AS saidaVinculadaId,
         m.ArbitroId AS arbitroId, arbitro.Nome AS arbitroNome,
         CONVERT(varchar(10), m.DataDesignacaoArbitro, 120) AS dataDesignacaoArbitro,
         m.SentencaArbitralUrl AS sentencaArbitralUrl, CONVERT(varchar(10), m.DataSentencaArbitral, 120) AS dataSentencaArbitral,
         m.ProcessoDisciplinarBifurcadoId AS processoDisciplinarBifurcadoId
  FROM MediacoesArbitragens m
  LEFT JOIN MembroReferencia pa ON pa.MembroId = m.ParteAId
  LEFT JOIN MembroReferencia pb ON pb.MembroId = m.ParteBId
  LEFT JOIN MembroReferencia mediador ON mediador.MembroId = m.MediadorId
  LEFT JOIN MembroReferencia arbitro ON arbitro.MembroId = m.ArbitroId`;

function comPrazo(mediacao, hoje) {
  const prazo = mediacaoArbitragem.avaliarPrazoEncerramento(mediacao.dataInstauracao, mediacao.prazoDiasEncerramento, hoje);
  return Object.assign({}, mediacao, prazo);
}

async function candidatoHabilitado(pool, membroId, papelNecessario) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT Papel FROM CatalogoMediadoresArbitros WHERE MembroId = @id AND Ativo = 1
  `);
  const linha = r.recordset[0];
  return !!linha && (linha.Papel === papelNecessario || linha.Papel === "AMBOS");
}

async function uploadArquivo(base64, mimeType, context) {
  if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) return { erro: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` };
  let buffer;
  try { buffer = Buffer.from(base64, "base64"); } catch (e) { return { erro: "Arquivo inválido." }; }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) return { erro: "Arquivo vazio ou maior que 15 MB." };
  try {
    const url = await storage.salvarDocumento(buffer, mimeType);
    return { url };
  } catch (erro) {
    context.log.error("Falha ao salvar arquivo no Blob Storage:", erro.message);
    return { erro: "Falha ao salvar o arquivo. Avise a equipe técnica." };
  }
}

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();
  const hoje = new Date().toISOString().slice(0, 10);
  // O caso só vale na forma canônica de número (auth.idDeRota); o malformado cai na mesma resposta de "caso não encontrado".
  const temId = idBruto !== undefined && idBruto !== null && idBruto !== "";
  const id = temId ? auth.idDeRota(idBruto) : null;
  const CASO_NAO_ENCONTRADO = { status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } };

  if (req.method === "POST" && !temId) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { assunto, parteADescricao, parteBDescricao, valorEnvolvido, prazoDiasEncerramento } = corpo;
    if (!assunto || typeof assunto !== "string" || !assunto.trim() || !prazoDiasEncerramento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: assunto, prazoDiasEncerramento." } };
      return;
    }
    if (assunto.length > 500 || (parteADescricao != null && String(parteADescricao).length > 200) || (parteBDescricao != null && String(parteBDescricao).length > 200)
      || !Number.isInteger(Number(prazoDiasEncerramento)) || Number(prazoDiasEncerramento) < 1 || Number(prazoDiasEncerramento) > 3650
      || (valorEnvolvido != null && valorEnvolvido !== "" && (!Number.isFinite(Number(valorEnvolvido)) || Number(valorEnvolvido) < 0))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Assunto (até 500), descrições das partes (até 200), prazo (1 a 3650 dias) ou valor inválidos." } };
      return;
    }
    // As partes por matrícula: na forma canônica, existentes. Quem não tem a permissão "mediacao" só abre caso em que ele próprio é uma das partes.
    const parteAId = corpo.parteAId ? auth.idDeRota(corpo.parteAId) : null;
    const parteBId = corpo.parteBId ? auth.idDeRota(corpo.parteBId) : null;
    const ehDaCamara = auth.temPermissao(usuario, "mediacao");
    if (!ehDaCamara && Number(usuario.membroId) !== parteAId && Number(usuario.membroId) !== parteBId) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Só quem é parte do caso (ou a Câmara de Mediação) pode instaurá-lo." } };
      return;
    }
    for (const [informado, convertido] of [[corpo.parteAId, parteAId], [corpo.parteBId, parteBId]]) {
      if (!informado) continue;
      const existe = convertido && (await pool.request().input("id", sql.Int, convertido).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`)).recordset.length > 0;
      if (!existe) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
        return;
      }
    }
    if (!parteAId && !String(parteADescricao || "").trim()) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe a Parte A: matrícula (se for membro) ou descrição (ex: nome da congregação/departamento)." } };
      return;
    }
    if (!parteBId && !String(parteBDescricao || "").trim()) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe a Parte B: matrícula (se for membro) ou descrição." } };
      return;
    }
    const result = await pool.request()
      .input("assunto", sql.NVarChar(500), String(assunto).trim())
      .input("parteAId", sql.Int, parteAId || null).input("parteADescricao", sql.NVarChar(200), String(parteADescricao || "").trim() || null)
      .input("parteBId", sql.Int, parteBId || null).input("parteBDescricao", sql.NVarChar(200), String(parteBDescricao || "").trim() || null)
      .input("valorEnvolvido", sql.Decimal(12, 2), valorEnvolvido || null)
      .input("prazoDiasEncerramento", sql.Int, Number(prazoDiasEncerramento))
      .input("instauradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO MediacoesArbitragens (Assunto, ParteAId, ParteADescricao, ParteBId, ParteBDescricao, ValorEnvolvido, PrazoDiasEncerramento, InstauradoPor)
              OUTPUT INSERTED.MediacaoId
              VALUES (@assunto, @parteAId, @parteADescricao, @parteBId, @parteBDescricao, @valorEnvolvido, @prazoDiasEncerramento, @instauradoPor)`);
    const mediacaoId = result.recordset[0].MediacaoId;
    await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: mediacaoId, acao: "Instaurou mediação", usuarioId: usuario.membroId, dadosDepois: { assunto, valorEnvolvido: valorEnvolvido || null } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Mediação instaurada.", mediacaoId } };
    return;
  }

  // ---- Os casos em que EU sou parte (Meu Painel → Minhas Tarefas): o texto proposto e a situação de cada parte; sem os anexos. ----
  if (req.method === "GET" && idBruto === "minhas" && !acao) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const casos = (await pool.request().input("eu", sql.Int, usuario.membroId).query(`
      SELECT m.*, pa.Nome AS ParteANome, pb.Nome AS ParteBNome, md.Nome AS MediadorNome, ar.Nome AS ArbitroNome
      FROM MediacoesArbitragens m
      LEFT JOIN MembroReferencia pa ON pa.MembroId = m.ParteAId LEFT JOIN MembroReferencia pb ON pb.MembroId = m.ParteBId
      LEFT JOIN MembroReferencia md ON md.MembroId = m.MediadorId LEFT JOIN MembroReferencia ar ON ar.MembroId = m.ArbitroId
      WHERE m.ParteAId = @eu OR m.ParteBId = @eu ORDER BY m.MediacaoId DESC`)).recordset;
    const saida = [];
    for (const m of casos) {
      const situacao = situacaoDoCaso(m, await carregarAceites(pool.request(), m.MediacaoId));
      const minhasPartes = ["A", "B"].filter(p => Number(p === "A" ? m.ParteAId : m.ParteBId) === Number(usuario.membroId));
      saida.push({
        mediacaoId: m.MediacaoId, assunto: m.Assunto, status: m.Status, minhasPartes,
        parteA: m.ParteANome || m.ParteADescricao || null, parteB: m.ParteBNome || m.ParteBDescricao || null,
        mediadorNome: m.MediadorNome || null, arbitroNome: m.ArbitroNome || null,
        acordo: { ...situacao.acordo, aguardaMinhaDecisao: aguardaDecisao(m, "ACORDO") && minhasPartes.some(p => !situacao.acordo.partes[p]) },
        compromisso: { ...situacao.compromisso, aguardaMinhaDecisao: aguardaDecisao(m, "COMPROMISSO") && minhasPartes.some(p => !situacao.compromisso.partes[p]) },
        podeDecidirAcordo: aguardaDecisao(m, "ACORDO"), podeDecidirCompromisso: aguardaDecisao(m, "COMPROMISSO")
      });
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, casos: saida } };
    return;
  }

  // ---- Decisão da PRÓPRIA parte, com a sessão dela ----
  if (req.method === "POST" && temId && acao === "decisao") {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { instrumento, decisao, hashTexto } = corpo;
    if (!mediacaoArbitragem.INSTRUMENTOS.includes(instrumento) || !mediacaoArbitragem.DECISOES.includes(decisao) || typeof hashTexto !== "string" || !/^[0-9a-f]{64}$/.test(hashTexto)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe instrumento (ACORDO ou COMPROMISSO), decisao (ACEITE ou RECUSA) e o hashTexto do texto que você leu." } };
      return;
    }
    const m = id ? (await pool.request().input("id", sql.Int, id).query(`SELECT MediacaoId, ParteAId, ParteBId FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset[0] : null;
    // Só a parte decide por aqui. Quem não é parte (inclusive o mediador, o árbitro e a Câmara) recebe a MESMA resposta de caso inexistente.
    const minhasPartes = m ? ["A", "B"].filter(p => Number(p === "A" ? m.ParteAId : m.ParteBId) === Number(usuario.membroId)) : [];
    if (!m || minhasPartes.length === 0) { context.res = CASO_NAO_ENCONTRADO; return; }
    const r = await registrarDecisao(pool, { mediacaoId: id, instrumento, partes: minhasPartes, decisao, hashTexto, canal: "PROPRIO", registradoPor: Number(usuario.membroId) });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: r.sucesso ? { ...r, mensagem: mensagemDaDecisao(instrumento, decisao, r) } : r };
    return;
  }

  // ---- Decisão tomada em PAPEL, registrada com o documento assinado anexado (mediador/árbitro do caso ou a Câmara; nunca uma das partes) ----
  if (req.method === "POST" && temId && acao === "decisao-presencial") {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { instrumento, parte, decisao, hashTexto, dataAssinatura, documentoBase64, mimeType, nomeArquivo, observacao } = corpo;
    if (!mediacaoArbitragem.INSTRUMENTOS.includes(instrumento) || !["A", "B"].includes(parte) || !mediacaoArbitragem.DECISOES.includes(decisao)
      || typeof hashTexto !== "string" || !/^[0-9a-f]{64}$/.test(hashTexto)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe instrumento (ACORDO ou COMPROMISSO), parte (A ou B), decisao (ACEITE ou RECUSA) e o hashTexto do texto proposto." } };
      return;
    }
    if (typeof nomeArquivo !== "string" || !nomeArquivo.trim() || nomeArquivo.length > 255 || (observacao != null && (typeof observacao !== "string" || observacao.length > 500))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome do arquivo (até 255) e, se quiser, uma observação (até 500)." } };
      return;
    }
    const m = id ? (await pool.request().input("id", sql.Int, id).query(`SELECT MediacaoId, ParteAId, ParteBId, MediadorId, ArbitroId, AcordoPropostoEm, CompromissoPropostoEm FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset[0] : null;
    const designado = m && (instrumento === "ACORDO" ? m.MediadorId : m.ArbitroId);
    const autorizado = m && (auth.temPermissao(usuario, "mediacao") || (designado != null && Number(designado) === Number(usuario.membroId)));
    if (!m || !autorizado) { context.res = CASO_NAO_ENCONTRADO; return; }
    if ([m.ParteAId, m.ParteBId].some(p => p != null && Number(p) === Number(usuario.membroId))) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Quem é parte do caso não registra decisão presencial: a sua própria decisão é dada em Meu Painel → Minhas Tarefas, com a sua sessão." } };
      return;
    }
    const propostoEm = instrumento === "ACORDO" ? m.AcordoPropostoEm : m.CompromissoPropostoEm;
    const dataProposta = propostoEm ? new Date(new Date(propostoEm).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null;
    const dataOk = typeof dataAssinatura === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dataAssinatura) && !Number.isNaN(Date.parse(`${dataAssinatura}T00:00:00Z`))
      && new Date(`${dataAssinatura}T00:00:00Z`).toISOString().slice(0, 10) === dataAssinatura && dataAssinatura <= hojeBrasilia() && (!dataProposta || dataAssinatura >= dataProposta);
    if (!dataOk) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Informe a data em que a parte assinou (AAAA-MM-DD): não futura e não anterior à proposta do texto${dataProposta ? ` (${dataProposta})` : ""}.` } };
      return;
    }
    const conferido = mediacaoArbitragem.conferirAnexo(documentoBase64, mimeType);
    if (conferido.erro) { context.res = { status: 400, body: { sucesso: false, mensagem: conferido.erro } }; return; }
    let url;
    try {
      url = await storage.salvarDocumento(conferido.buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar o documento assinado no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o arquivo. Avise a equipe técnica." } };
      return;
    }
    let r;
    try {
      r = await registrarDecisao(pool, {
        mediacaoId: id, instrumento, partes: [parte], decisao, hashTexto, canal: "PRESENCIAL_ANEXO", registradoPor: Number(usuario.membroId),
        anexo: { url, hash: conferido.hash, nome: nomeArquivo.trim(), mime: mimeType }, dataAssinatura, observacao: observacao ? observacao.trim() || null : null
      });
    } catch (erro) {
      await storage.excluirDocumento(url);            // não deixa o arquivo órfão no armazenamento
      throw erro;
    }
    if (!r.sucesso) await storage.excluirDocumento(url);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: r.sucesso ? { ...r, mensagem: mensagemDaDecisao(instrumento, decisao, r) } : r };
    return;
  }

  if (req.method === "POST" && temId && acao === "sessoes") {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const { dataSessao, parteACompareceu, parteBCompareceu, observacoes } = req.body || {};
    if (!dataSessao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataSessao." } };
      return;
    }
    if (!id || (await pool.request().input("id", sql.Int, id).query(`SELECT MediacaoId FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset.length === 0) {
      context.res = CASO_NAO_ENCONTRADO;
      return;
    }
    const criada = await pool.request()
      .input("mediacaoId", sql.Int, id).input("dataSessao", sql.Date, dataSessao)
      .input("parteACompareceu", sql.Bit, parteACompareceu == null ? null : !!parteACompareceu)
      .input("parteBCompareceu", sql.Bit, parteBCompareceu == null ? null : !!parteBCompareceu)
      .input("observacoes", sql.NVarChar(500), observacoes || null)
      .query(`INSERT INTO SessoesMediacao (MediacaoId, DataSessao, ParteACompareceu, ParteBCompareceu, Observacoes)
              OUTPUT INSERTED.SessaoMediacaoId VALUES (@mediacaoId, @dataSessao, @parteACompareceu, @parteBCompareceu, @observacoes)`);
    await registrarAuditoria({ tabela: "SessoesMediacao", registroId: criada.recordset[0].SessaoMediacaoId, acao: "Registrou sessão de mediação", usuarioId: usuario.membroId, dadosDepois: { mediacaoId: Number(id), dataSessao } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Sessão registrada." } };
    return;
  }

  if (req.method === "GET" && !temId) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const result = await pool.request().query(`${SELECT_MEDIACAO} ORDER BY m.DataInstauracao DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map((m) => comPrazo(m, hoje)) };
    return;
  }

  if (req.method === "GET" && temId && !acao) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const mediacao = id ? (await pool.request().input("id", sql.Int, id).query(`${SELECT_MEDIACAO} WHERE m.MediacaoId = @id`)).recordset[0] : null;
    if (!mediacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } };
      return;
    }
    const sessoes = (await pool.request().input("id", sql.Int, id).query(`
      SELECT SessaoMediacaoId AS sessaoMediacaoId, CONVERT(varchar(10), DataSessao, 120) AS dataSessao,
             ParteACompareceu AS parteACompareceu, ParteBCompareceu AS parteBCompareceu, Observacoes AS observacoes
      FROM SessoesMediacao WHERE MediacaoId = @id ORDER BY DataSessao
    `)).recordset;
    // 03/10/2026: a situação do acordo e do compromisso (texto proposto, decisão de cada parte com o canal, quem registrou e o documento, e os aceites antigos
    // marcados "registrado antes da verificação por ato da parte").
    const linha = (await pool.request().input("id", sql.Int, id).query(`SELECT * FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset[0] || {};
    const aceites = await carregarAceites(pool.request(), id);
    const comSessoes = Object.assign(comPrazo(mediacao, hoje), { sessoes }, situacaoDoCaso(linha, aceites, { comAnexo: true }));
    if (comSessoes.sentencaArbitralUrl) comSessoes.sentencaArbitralUrl = storage.urlDocumentoComSas(comSessoes.sentencaArbitralUrl);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: comSessoes };
    return;
  }

  if (req.method === "PUT" && temId && !acao) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const mediacao = id ? (await pool.request().input("id", sql.Int, id).query(`SELECT * FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset[0] : null;
    if (!mediacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } };
      return;
    }
    const { acao: acaoPut } = req.body || {};
    const contexto = { mediacaoId: mediacao.MediacaoId, assunto: mediacao.Assunto, parteAId: mediacao.ParteAId, parteBId: mediacao.ParteBId };

    if (acaoPut === "DESIGNAR_MEDIADOR") {
      const { mediadorId } = req.body || {};
      if (!mediadorId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe mediadorId." } }; return; }
      if (!(await candidatoHabilitado(pool, mediadorId, "MEDIADOR"))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula não está no catálogo de mediadores ativos." } };
        return;
      }
      const impedimento = await mediacaoArbitragem.calcularImpedimento(pool, mediadorId, contexto);
      if (impedimento.impedido) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Mediador impedido: ${impedimento.motivo}` } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("mediadorId", sql.Int, mediadorId)
        .query(`UPDATE MediacoesArbitragens SET MediadorId = @mediadorId, DataDesignacaoMediador = CAST(SYSUTCDATETIME() AS DATE) WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Designou mediador", usuarioId: usuario.membroId, dadosDepois: { mediadorId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Mediador designado." } };
      return;
    }

    // 03/10/2026: "registrar acordo" PROPÕE o texto às partes; nenhum aceite é gravado aqui. A mediação só se encerra com acordo quando as duas partes
    // aceitarem este texto (rota /decisao ou /decisao-presencial). Propor um texto diferente substitui o anterior: as decisões já dadas valiam para o
    // texto antigo (outro hash) e deixam de contar — ficam na prova.
    if (acaoPut === "REGISTRAR_ACORDO" || acaoPut === "PROPOR_ACORDO") {
      if (mediacao.Status !== "MEDIACAO_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível propor acordo com a mediação em curso." } }; return; }
      if (!mediacao.MediadorId) { context.res = { status: 200, body: { sucesso: false, mensagem: "Designe um mediador antes de propor o acordo." } }; return; }
      const { resumoAcordo, saidaVinculadaId } = req.body || {};
      if (typeof resumoAcordo !== "string" || !resumoAcordo.trim() || resumoAcordo.trim().length > 1500) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe resumoAcordo (o texto do acordo, até 1500 caracteres)." } }; return; }
      const saidaId = saidaVinculadaId == null || saidaVinculadaId === "" ? null : auth.idDeRota(saidaVinculadaId);
      if (saidaVinculadaId != null && saidaVinculadaId !== "" && (!saidaId || (await pool.request().input("s", sql.Int, saidaId).query(`SELECT SaidaId FROM SaidasTesouraria WHERE SaidaId = @s`)).recordset.length === 0)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Saída vinculada não encontrada." } };
        return;
      }
      const texto = mediacaoArbitragem.textoAcordo({ mediacaoId: mediacao.MediacaoId, assunto: mediacao.Assunto, resumoAcordo });
      const hash = mediacaoArbitragem.hashTexto(texto);
      if (mediacao.AcordoHashProposto === hash && (mediacao.AcordoSaidaPropostaId || null) === saidaId) {
        context.res = { status: 200, body: { sucesso: true, hashTexto: hash, mensagem: "Este mesmo texto já está proposto às partes, aguardando a decisão delas." } };
        return;
      }
      const r = await pool.request().input("id", sql.Int, id).input("texto", sql.NVarChar(2000), texto).input("hash", sql.NVarChar(64), hash)
        .input("por", sql.Int, usuario.membroId).input("saidaId", sql.Int, saidaId)
        .query(`UPDATE MediacoesArbitragens SET AcordoTextoProposto = @texto, AcordoHashProposto = @hash, AcordoPropostoEm = SYSUTCDATETIME(), AcordoPropostoPor = @por,
                       AcordoSaidaPropostaId = @saidaId
                WHERE MediacaoId = @id AND Status = 'MEDIACAO_EM_CURSO'`);
      if (!r.rowsAffected || r.rowsAffected[0] !== 1) { context.res = { status: 200, body: { sucesso: false, mensagem: "A mediação mudou de situação enquanto o acordo era proposto. Abra o caso de novo." } }; return; }
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Propôs acordo de mediação às partes", usuarioId: usuario.membroId, dadosDepois: { hashTexto: hash, saidaVinculadaId: saidaId } });
      await avisarPartes(pool, mediacao, `Há um texto de acordo aguardando a sua decisão no caso de mediação nº ${mediacao.MediacaoId} (${mediacao.Assunto}). Leia e decida em Meu Painel → Minhas Tarefas.`);
      context.res = { status: 200, body: { sucesso: true, hashTexto: hash, mensagem: "✅ Acordo proposto às partes. A mediação só se encerra com acordo quando as DUAS aceitarem este texto (cada uma com a própria sessão, ou presencial com o termo assinado anexado)." } };
      return;
    }

    if (acaoPut === "MEDIACAO_SEM_ACORDO") {
      if (mediacao.Status !== "MEDIACAO_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível encerrar sem acordo uma mediação em curso." } }; return; }
      const { motivo } = req.body || {};
      if (!motivo || !String(motivo).trim()) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe motivo." } }; return; }
      await pool.request().input("id", sql.Int, id)
        .query(`UPDATE MediacoesArbitragens SET Status = 'MEDIACAO_SEM_ACORDO', DataEncerramentoMediacao = CAST(SYSUTCDATETIME() AS DATE) WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Encerrou mediação sem acordo", usuarioId: usuario.membroId, dadosDepois: { motivo: motivo.trim() } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "Mediação encerrada sem acordo — via de arbitragem liberada (Art. 161-A)." } };
      return;
    }

    if (acaoPut === "DESIGNAR_ARBITRO") {
      // Trava real: arbitragem só abre com mediação encerrada SEM acordo
      // (Art. 161-A e Lei 9.307/1996) — nunca pulando etapa.
      if (mediacao.Status !== "MEDIACAO_SEM_ACORDO") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível abrir arbitragem depois da mediação encerrar SEM acordo." } };
        return;
      }
      const { arbitroId } = req.body || {};
      if (!arbitroId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe arbitroId." } }; return; }
      if (!(await candidatoHabilitado(pool, arbitroId, "ARBITRO"))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula não está no catálogo de árbitros ativos." } };
        return;
      }
      const impedimento = await mediacaoArbitragem.calcularImpedimento(pool, arbitroId, contexto);
      if (impedimento.impedido) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Árbitro impedido: ${impedimento.motivo}` } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("arbitroId", sql.Int, arbitroId)
        .query(`UPDATE MediacoesArbitragens SET ArbitroId = @arbitroId, DataDesignacaoArbitro = CAST(SYSUTCDATETIME() AS DATE), Status = 'ARBITRAGEM_EM_CURSO' WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Designou árbitro", usuarioId: usuario.membroId, dadosDepois: { arbitroId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Árbitro designado — arbitragem em curso." } };
      return;
    }

    // 03/10/2026: abre o compromisso arbitral para a decisão das partes (texto com o assunto e o árbitro); nenhum aceite é gravado aqui.
    if (acaoPut === "REGISTRAR_COMPROMISSO_ARBITRAL" || acaoPut === "PROPOR_COMPROMISSO_ARBITRAL") {
      if (mediacao.Status !== "ARBITRAGEM_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível propor o compromisso arbitral com a arbitragem em curso." } }; return; }
      if (mediacao.CompromissoFirmadoEm) { context.res = { status: 200, body: { sucesso: false, mensagem: "O compromisso arbitral deste caso já foi firmado pelas duas partes." } }; return; }
      const arbitro = mediacao.ArbitroId ? (await pool.request().input("id", sql.Int, mediacao.ArbitroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @id`)).recordset[0] : null;
      const texto = mediacaoArbitragem.textoCompromisso({ mediacaoId: mediacao.MediacaoId, assunto: mediacao.Assunto, arbitroNome: arbitro ? arbitro.Nome : null });
      const hash = mediacaoArbitragem.hashTexto(texto);
      if (mediacao.CompromissoHashProposto === hash) { context.res = { status: 200, body: { sucesso: true, hashTexto: hash, mensagem: "O compromisso arbitral já está proposto às partes, aguardando a decisão delas." } }; return; }
      await pool.request().input("id", sql.Int, id).input("texto", sql.NVarChar(2000), texto).input("hash", sql.NVarChar(64), hash).input("por", sql.Int, usuario.membroId)
        .query(`UPDATE MediacoesArbitragens SET CompromissoTextoProposto = @texto, CompromissoHashProposto = @hash, CompromissoPropostoEm = SYSUTCDATETIME(), CompromissoPropostoPor = @por
                WHERE MediacaoId = @id AND Status = 'ARBITRAGEM_EM_CURSO' AND CompromissoFirmadoEm IS NULL`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Propôs compromisso arbitral às partes", usuarioId: usuario.membroId, dadosDepois: { hashTexto: hash } });
      await avisarPartes(pool, mediacao, `O compromisso arbitral do caso nº ${mediacao.MediacaoId} (${mediacao.Assunto}) aguarda a sua decisão. Leia e decida em Meu Painel → Minhas Tarefas.`);
      context.res = { status: 200, body: { sucesso: true, hashTexto: hash, mensagem: "✅ Compromisso arbitral proposto às partes. Ele só é firmado quando as DUAS aceitarem (cada uma com a própria sessão, ou presencial com o documento assinado anexado)." } };
      return;
    }

    if (acaoPut === "REGISTRAR_SENTENCA") {
      if (mediacao.Status !== "ARBITRAGEM_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível registrar sentença com a arbitragem em curso." } }; return; }
      // Sem compromisso arbitral firmado pelas DUAS partes (cada uma por ato próprio) não há convenção de arbitragem: a sentença seria nula (Lei 9.307/1996, arts. 4º a 10) e o
      // aceite por ato da parte viraria enfeite. Caso antigo em curso, com aceite registrado antes da verificação, propõe o compromisso de novo e colhe a decisão das partes.
      if (!mediacao.CompromissoFirmadoEm) { context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível registrar a sentença: o compromisso arbitral ainda não foi firmado pelas duas partes. Proponha o compromisso e aguarde a decisão de cada parte (ou o registro presencial com o documento assinado)." } }; return; }
      const { sentencaBase64, mimeType } = req.body || {};
      if (!sentencaBase64 || !mimeType) { context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe a sentença arbitral." } }; return; }
      const { erro, url } = await uploadArquivo(sentencaBase64, mimeType, context);
      if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }
      const gravada = await pool.request().input("id", sql.Int, id).input("url", sql.NVarChar(500), url)
        .query(`UPDATE MediacoesArbitragens SET SentencaArbitralUrl = @url, DataSentencaArbitral = CAST(SYSUTCDATETIME() AS DATE), Status = 'ARBITRAGEM_SENTENCA'
                WHERE MediacaoId = @id AND Status = 'ARBITRAGEM_EM_CURSO' AND CompromissoFirmadoEm IS NOT NULL`);
      if (!gravada.rowsAffected || gravada.rowsAffected[0] !== 1) { context.res = { status: 200, body: { sucesso: false, mensagem: "O caso mudou enquanto a sentença era enviada. Abra o caso de novo e confira o andamento." } }; return; }
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Registrou sentença arbitral", usuarioId: usuario.membroId });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Sentença arbitral registrada (Lei 9.307/1996, art. 18/31 — produz efeitos de sentença judicial, sem necessidade de homologação)." } };
      return;
    }

    if (acaoPut === "BIFURCAR_DISCIPLINAR") {
      const { orgaoResponsavelId, orgaoLocalId, infracoesIds, membroId: membroIdBruto } = req.body || {};
      if (!membroIdBruto) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId (quem responde ao processo disciplinar bifurcado)." } }; return; }
      // Abrir processo disciplinar é da "disciplina" (a "mediacao" sozinha não basta) e a pessoa tem de estar no escopo de quem abre.
      // v7.6 — a pessoa tem de estar no escopo da permissão "disciplina" (a visão só com as concessões que a têm), não no da "mediacao".
      const vDisciplina = auth.visaoDaPermissao(usuario, "disciplina");
      if (!vDisciplina) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Requer a permissão 'disciplina'." } };
        return;
      }
      const alvo = await pessoaAlcancavel(pool, vDisciplina, membroIdBruto);
      if (!alvo) { context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } }; return; }
      if (orgaoResponsavelId || orgaoLocalId) {
        const orgao = await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId, orgaoLocalId });
        if (!orgao.valido) { context.res = { status: 200, body: { sucesso: false, mensagem: orgao.mensagem } }; return; }
        if (orgao.orgaoLocalId && !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, orgao.orgaoLocalId))) {
          context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." } };
          return;
        }
      }
      const resultadoProcesso = await mediacaoArbitragem.bifurcarParaProcessoDisciplinar(pool, contexto, { membroId: alvo.membroId, orgaoResponsavelId, orgaoLocalId, infracoesIds }, usuario.membroId);
      if (!resultadoProcesso.sucesso) { context.res = { status: 200, body: resultadoProcesso }; return; }
      await pool.request().input("id", sql.Int, id).input("processoId", sql.Int, resultadoProcesso.processoId)
        .query(`UPDATE MediacoesArbitragens SET ProcessoDisciplinarBifurcadoId = @processoId WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Bifurcou pra processo disciplinar", usuarioId: usuario.membroId, dadosDepois: { processoId: resultadoProcesso.processoId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Bifurcado — processo disciplinar separado aberto, a mediação/arbitragem continua seu curso normalmente.", processoId: resultadoProcesso.processoId } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
