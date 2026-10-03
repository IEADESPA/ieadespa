// AbrirProcedimentoAbandono
// Abre o procedimento sumário de constatação de Abandono Eclesiástico — Material ou
// Digital (Estatuto Art. 11, IV/V e §3º: mesmo rito pros dois — notifica o membro,
// registro datado, sem envio real de e-mail/SMS — não há essa infraestrutura no
// projeto — e passa a contar o prazo de defesa de 15 dias antes de poder ser
// homologado (ver EvoluirProcedimentoAbandono). Exige a permissão "disciplina" (mesma
// CLI que já homologa processos disciplinares).
// POST /api/procedimentos-abandono -> body: { membroId, tipo? ('MATERIAL'|'DIGITAL'), dataEdital?, canalNotificacaoId? (obrigatório no DIGITAL) }
//
// Auditoria de escopo (02/10/2026):
//  - só abre contra membro DENTRO do escopo de quem chama; fora do escopo responde igual a "matrícula não encontrada" (não serve de sonda);
//  - a data da notificação NÃO vem do cliente: é o dia do registro.
// Fecho dos itens em aberto (03/10/2026):
//  - grava QUEM abriu (AbertoPor, migração 134): a homologação passa a exigir outra pessoa (regra dos dois olhos);
//  - Digital: abrir o procedimento É a notificação final do Art. 12 §2º ("incluída uma notificação final que reabra prazo de 15 dias"). Antes a notificação era
//    a ÚLTIMA tentativa de contato já registrada — que podia ter semanas — e o procedimento nascia com a defesa vencida. Agora quem abre informa o canal oficial
//    da notificação final; ela é gravada como tentativa de contato com a data do dia e o prazo conta dela. Os requisitos anteriores (2 canais distintos e 90 dias
//    desde a 1ª tentativa) continuam valendo ANTES (leitura que protege o membro: a notificação final vem depois deles, não os substitui);
//  - edital com data futura é recusado (o prazo também conta do edital: ver shared/abandonoDigital.js::inicioPrazoDefesa);
//  - tudo numa transação, com trava na linha do membro: dois cliques não abrem dois procedimentos, e procedimento sem a notificação final não existe.
const auth = require("../shared/auth");
const { registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const abandonoDigital = require("../shared/abandonoDigital");
const canais = require("../shared/canais");
const { pessoaAlcancavel } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const TIPOS = ["MATERIAL", "DIGITAL"];
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];
const TEXTO_NOTIFICACAO_FINAL = "Notificação final do procedimento sumário de Abandono Digital (Estatuto Art. 12 §2º e Art. 11 §3º, II): abre o prazo de 15 dias para o membro se manifestar.";

const SELECT_PROCEDIMENTO = `
  SELECT pa.ProcedimentoId AS procedimentoId, pa.MembroId AS membroId, m.Nome AS nome,
         pa.Tipo AS tipo, pa.Status AS status, CONVERT(varchar(10), pa.DataNotificacao, 120) AS dataNotificacao,
         CONVERT(varchar(10), pa.DataEdital, 120) AS dataEdital, pa.PrazoDias AS prazoDias,
         CONVERT(varchar(10), pa.DataHomologacao, 120) AS dataHomologacao,
         pa.RecursoInterposto AS recursoInterposto,
         CONVERT(varchar(10), pa.DataRecurso, 120) AS dataRecurso, pa.ResultadoRecurso AS resultadoRecurso,
         pa.AbertoPor AS abertoPor
  FROM ProcedimentosAbandono pa
  JOIN MembroReferencia m ON m.MembroId = pa.MembroId`;

// A MESMA resposta para matrícula inexistente, malformada e fora do escopo.
function matriculaNaoEncontrada(context) {
  context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId: membroInformado, dataEdital } = req.body || {};
  const tipo = req.body && req.body.tipo ? req.body.tipo : "MATERIAL";
  if (!membroInformado) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }
  if (!TIPOS.includes(tipo)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
    return;
  }
  const hoje = hojeBrasilia();
  if (dataEdital !== undefined && dataEdital !== null && dataEdital !== "" && (!abandonoDigital.dataIsoValida(dataEdital) || dataEdital > hoje)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "dataEdital inválida. Use o formato AAAA-MM-DD, com a data em que o edital foi de fato publicado (não futura)." } };
    return;
  }
  const canalNotificacaoId = tipo === "DIGITAL" ? auth.idDeRota(req.body && req.body.canalNotificacaoId) : null;
  if (tipo === "DIGITAL" && !canalNotificacaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o canal oficial pelo qual a notificação final está sendo enviada (canalNotificacaoId): é dela que conta o prazo de 15 dias (Estatuto Art. 12 §2º)." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroInformado);
  if (!pessoa) {
    matriculaNaoEncontrada(context);
    return;
  }
  const membroId = pessoa.membroId;
  if (STATUS_TERMINAIS.includes(pessoa.status)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este membro já não está com a membresia ativa (desligado ou falecido)." } };
    return;
  }

  const membroResult = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT MembroId, Nome, SituacaoMembro, CONVERT(varchar(10), DataAfastamento, 120) AS DataAfastamento
            FROM MembroReferencia WHERE MembroId = @id`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    matriculaNaoEncontrada(context);
    return;
  }

  if (tipo === "MATERIAL") {
    const elegivel = estatuto.elegivelAbandonoMaterial(
      { situacaoMembro: membro.SituacaoMembro, dataAfastamento: membro.DataAfastamento }
    );
    if (!elegivel) {
      context.res = {
        status: 200,
        body: { sucesso: false, mensagem: `Este membro ainda não completou os ${estatuto.DIAS_ABANDONO_MATERIAL} dias de afastamento (ou não está marcado Sem Comunhão com Data de Afastamento lançada).` }
      };
      return;
    }
  } else {
    // Digital (Art. 12 §2º): ≥2 tentativas de contato por canais distintos e 90 dias corridos desde a 1ª — e, agora, a notificação final pelo canal informado.
    const elegibilidade = await abandonoDigital.elegibilidadeAbandonoDigital(pool, sql, membroId);
    if (!elegibilidade.elegivel) {
      context.res = {
        status: 200,
        body: {
          sucesso: false,
          mensagem: `Faltam requisitos do Art. 12 §2º: ${elegibilidade.canaisDistintos}/${estatuto.MIN_TENTATIVAS_CONTATO_DIGITAL} canais distintos tentados` +
            (elegibilidade.diasDesdePrimeira !== null ? `, ${elegibilidade.diasDesdePrimeira}/${estatuto.DIAS_ABANDONO_DIGITAL} dias desde a 1ª tentativa.` : ", nenhuma tentativa registrada ainda.")
        }
      };
      return;
    }
    const canal = (await pool.request().input("id", sql.Int, canalNotificacaoId)
      .query(`SELECT CanalId, Ativo, Plataforma, Categoria FROM CanaisOficiaisComunicacao WHERE CanalId = @id`)).recordset[0];
    if (!canal || !canais.contaParaAbandono({ ativo: !!canal.Ativo, plataforma: canal.Plataforma, categoria: canal.Categoria })) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Canal da notificação final inválido, inativo ou que não serve para contato individual (grupos e redes sociais não notificam um membro)." } };
      return;
    }
  }

  const transacao = new sql.Transaction(pool);
  await transacao.begin();
  let procedimentoId, tentativaId = null;
  try {
    const rq = () => new sql.Request(transacao);
    // Trava a linha do membro: duas aberturas ao mesmo tempo esperam uma à outra e a segunda vê o procedimento da primeira.
    await rq().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @id`);
    const aberto = await rq().input("id", sql.Int, membroId).input("tipo", sql.NVarChar(20), tipo)
      .query(`SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @id AND Tipo = @tipo AND Status = 'NOTIFICADO'`);
    if (aberto.recordset.length > 0) {
      await transacao.rollback();
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um procedimento em aberto (notificado) para este membro." } };
      return;
    }
    if (tipo === "DIGITAL") {
      const t = await rq().input("membroId", sql.Int, membroId).input("canalId", sql.Int, canalNotificacaoId).input("dataTentativa", sql.Date, hoje)
        .input("observacao", sql.NVarChar(300), TEXTO_NOTIFICACAO_FINAL).input("registradoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO TentativasContatoAbandono (MembroId, CanalId, DataTentativa, Observacao, RegistradoPor)
                OUTPUT INSERTED.TentativaId VALUES (@membroId, @canalId, @dataTentativa, @observacao, @registradoPor)`);
      tentativaId = t.recordset[0].TentativaId;
    }
    const result = await rq()
      .input("membroId", sql.Int, membroId)
      .input("tipo", sql.NVarChar(20), tipo)
      .input("dataNotificacao", sql.Date, hoje)
      .input("dataEdital", sql.Date, dataEdital || null)
      .input("abertoPor", sql.Int, usuario.membroId)
      .input("tentativaId", sql.Int, tentativaId)
      .query(`
        INSERT INTO ProcedimentosAbandono (MembroId, Tipo, Status, DataNotificacao, DataEdital, AbertoPor, TentativaNotificacaoFinalId)
        OUTPUT INSERTED.ProcedimentoId
        VALUES (@membroId, @tipo, 'NOTIFICADO', @dataNotificacao, @dataEdital, @abertoPor, @tentativaId)
      `);
    procedimentoId = result.recordset[0].ProcedimentoId;
    await registrarAuditoriaNaTransacao(transacao, {
      tabela: "ProcedimentosAbandono",
      registroId: procedimentoId,
      acao: `Abriu procedimento de Abandono ${tipo === "DIGITAL" ? "Digital" : "Material"} (notificação)`,
      usuarioId: usuario.membroId,
      dadosDepois: { membroId, tipo, dataNotificacao: hoje, dataEdital: dataEdital || null, canalNotificacaoFinalId: canalNotificacaoId, tentativaNotificacaoFinalId: tentativaId }
    });
    await transacao.commit();
  } catch (erro) {
    try { await transacao.rollback(); } catch { /* já encerrada */ }
    throw erro;
  }

  const procedimentoResult = await pool.request().input("id", sql.Int, procedimentoId).query(`${SELECT_PROCEDIMENTO} WHERE pa.ProcedimentoId = @id`);
  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      mensagem: tipo === "DIGITAL"
        ? `✅ Procedimento aberto e notificação final registrada hoje. O prazo de defesa de 15 dias conta a partir de hoje (${hoje}); a homologação é de outra pessoa do nível geral.`
        : "✅ Procedimento aberto — membro notificado. A homologação é de outra pessoa do nível geral.",
      procedimento: procedimentoResult.recordset[0]
    }
  };
};
