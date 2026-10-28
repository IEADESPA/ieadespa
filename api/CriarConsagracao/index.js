// CriarConsagracao
// Um líder (Dirigente/Pastor de Área) protocola um processo. Entra sempre
// com status inicial PROTOCOLADO. Exige a permissão "consagracoes".
//
// Auditoria de escopo (02/10/2026):
//  - só protocola para membro DENTRO do escopo de quem chama; fora do escopo responde igual a "matrícula não encontrada";
//  - o proponente é quem está protocolando: só o nível GERAL (a Secretaria) protocola em nome de outra pessoa — antes qualquer matrícula servia de "proponente" e dava
//    para forjar quem propôs o processo.
//
// v8.2 — Escada ministerial (Regimento Art. 66 §§3º–5º, 67, 71 a 74; regra em shared/escada.js). Quando o tipo leva a um cargo da escada, os requisitos são conferidos
// AQUI e o processo nem nasce se faltar algum (a resposta traz a lista). Modalidade: INDICACAO (o comum), NOMEACAO_PRESIDENCIAL (Art. 66 §4º) e OUTRA_CONVENCAO (Art. 71) —
// as duas últimas só o nível geral registra, com a referência do ato ou a convenção de origem. Um processo em andamento por pessoa (índice único do banco → 409). Ninguém
// protocola a própria consagração. Disciplina e carta de mudança só são conferidas aqui para quem tem a permissão "disciplina" sobre a pessoa (sem ela, o protocolo segue e
// o avanço, do nível geral, confere) — a lista não pode dizer a um Dirigente quem está sob disciplina.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const escada = require("../shared/escada");
const escadaDb = require("../shared/escadaDb");
const afm = require("../shared/afm");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { violouUnicidade } = require("../shared/violacaoUnica");
const { ehGeral, pessoaAlcancavel, carregarPessoa } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const { membroId: membroInformado, cargoAtual, assunto, proponenteMembroId, modalidade: modalidadeInformada, atoReferencia } = req.body || {};

  if (!membroInformado || !assunto || !proponenteMembroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, assunto, proponenteMembroId." } };
    return;
  }
  if (typeof assunto !== "string" || assunto.length > 100) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Assunto inválido." } };
    return;
  }
  const modalidade = modalidadeInformada == null || modalidadeInformada === "" ? "INDICACAO" : modalidadeInformada;
  if (typeof modalidade !== "string" || !Object.prototype.hasOwnProperty.call(escada.MODALIDADES, modalidade)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Modalidade inválida: indicação, nomeação direta do Pastor Presidente ou ministro de outra convenção." } };
    return;
  }
  let referencia = null;
  if (modalidade !== "INDICACAO") {
    if (!ehGeral(usuario)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "A nomeação direta do Pastor Presidente e a recepção de ministro de outra convenção são registradas só pela administração geral." } };
      return;
    }
    const ref = afm.textoObrigatorio(atoReferencia, { minimo: 3, maximo: 200, rotulo: escada.MODALIDADES[modalidade].referencia.replace(/^a /, "A ") });
    if (!ref.valido) {
      context.res = { status: 400, body: { sucesso: false, mensagem: ref.mensagem } };
      return;
    }
    referencia = ref.texto;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroInformado);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }
  const membroId = pessoa.membroId;
  if (Number(membroId) === Number(usuario.membroId)) {
    context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém protocola a própria consagração." } };
    return;
  }

  // Proponente: o próprio usuário; só o geral indica outra pessoa (e ela precisa existir).
  let proponenteId = auth.idDeRota(proponenteMembroId);
  if (!ehGeral(usuario)) {
    if (proponenteId !== Number(usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "O proponente é quem protocola o processo. Só a administração geral protocola em nome de outra pessoa." } };
      return;
    }
  } else if (!proponenteId || !(await carregarPessoa(pool, proponenteId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Proponente não encontrado." } };
    return;
  }

  const membroResult = await pool.request().input("id", sql.Int, membroId).query(`SELECT Funcao FROM MembroReferencia WHERE MembroId = @id`);
  if (membroResult.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }

  // v8.2 — a escada: só vale para tipo que leva a um cargo; a nomeação e a outra convenção não fazem sentido sem cargo de destino.
  const veDisciplina = escadaDb.veDisciplinaDe(usuario, pessoa);
  const conferencia = await escadaDb.avaliar(pool, { membroId, assunto, modalidade, veDisciplina });
  if (!conferencia.alvo && modalidade !== "INDICACAO") {
    context.res = { status: 422, body: { sucesso: false, mensagem: "Este tipo de consagração não leva a um cargo da escada: registre-o como indicação." } };
    return;
  }
  if (conferencia.avaliacao && conferencia.avaliacao.bloqueado) {
    context.res = { status: 200, body: { sucesso: false, mensagem: conferencia.avaliacao.mensagemBloqueio, requisitos: conferencia.avaliacao } };
    return;
  }

  // v6.9 — formação exigida para este tipo de consagração (TrilhaRequisitos,
  // contexto CONSAGRACAO, alvo = o "Assunto"). Sem requisito configurado,
  // nada muda; com requisito BLOQUEIA, o processo nem é protocolado.
  const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: assunto, membroId });
  if (formacao.bloqueado) {
    context.res = { status: 200, body: { sucesso: false, mensagem: formacao.mensagemBloqueio, formacao } };
    return;
  }

  let result;
  try {
    result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("cargoAtual", sql.NVarChar(100), (typeof cargoAtual === "string" ? cargoAtual.slice(0, 100) : null) || membroResult.recordset[0].Funcao || null)
      .input("assunto", sql.NVarChar(100), assunto)
      .input("proponenteMembroId", sql.Int, proponenteId)
      .input("cargoAlvo", sql.NVarChar(30), conferencia.alvo)
      .input("modalidade", sql.NVarChar(24), modalidade)
      .input("ato", sql.NVarChar(200), referencia)
      .input("retrato", sql.NVarChar(4000), conferencia.avaliacao ? escada.retrato(conferencia.avaliacao, hojeBrasilia()) : null)
      .query(`
        INSERT INTO Consagracoes (MembroId, CargoAtual, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade, AtoReferencia, RequisitosRetrato)
        OUTPUT INSERTED.ConsagracaoId
        VALUES (@membroId, @cargoAtual, @assunto, @proponenteMembroId, 'PROTOCOLADO', @cargoAlvo, @modalidade, @ato, @retrato)
      `);
  } catch (erro) {
    if (!violouUnicidade(erro)) throw erro;
    context.res = { status: 409, body: { sucesso: false, mensagem: "Esta pessoa já tem um processo de consagração em andamento. Conclua ou reprove o atual antes." } };
    return;
  }
  const consagracaoId = result.recordset[0].ConsagracaoId;

  const consagracaoResult = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).query(`
    SELECT c.ConsagracaoId AS consagracaoId, c.MembroId AS membroId, m.Nome AS nome,
           c.CargoAtual AS cargoAtual, c.Assunto AS assunto, p.Nome AS proponente,
           c.Status AS status, CONVERT(varchar(10), c.DataProtocolo, 120) AS dataProtocolo,
           c.CargoAlvo AS cargoAlvo, c.Modalidade AS modalidade
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    WHERE c.ConsagracaoId = @id`);
  const consagracao = consagracaoResult.recordset[0];

  await registrarAuditoria({
    tabela: "Consagracoes",
    registroId: Number(membroId),
    acao: "Protocolou processo",
    usuarioId: usuario.membroId,
    dadosDepois: { assunto, cargoAtual, proponenteMembroId: proponenteId, cargoAlvo: conferencia.alvo, modalidade, atoReferencia: referencia }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo protocolado e enviado para a Secretaria.", consagracao, alertasFormacao: formacao.alertas, requisitos: conferencia.avaliacao }
  };
};
