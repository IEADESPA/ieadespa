// EvoluirProcedimentoAbandono
// Três ações sobre um procedimento de Abandono (Material ou Digital) já aberto (Reg. Art. 11):
//   HOMOLOGAR -> só depois de vencido o prazo de defesa (15 dias da notificação); a CLI
//                homologa a constatação e a perda de membresia passa a valer de verdade
//                (Status='DESLIGADO', vacância automática — shared/vacancia.js).
//   ARQUIVAR  -> o membro voltou a comparecer antes da homologação; encerra sem perda.
//   RECURSO   -> registra o Recurso à Assembleia (30 dias da homologação, sem efeito
//                suspensivo — a perda já vale). O resultado da Assembleia é lançado
//                manualmente aqui depois (não integra com o módulo de votação ainda).
// Exige a permissão "disciplina". POST /api/procedimentos-abandono/{procedimentoId}/evoluir
//
// Auditoria de escopo (02/10/2026):
//  - qualquer ação só vale para procedimento de membro DENTRO do escopo de quem chama; fora do escopo responde igual a "procedimento não encontrado";
//  - HOMOLOGAR (desliga o membro e encerra assentos, liderança e cargo) e RECURSO são decisão da CLI: só o nível GERAL. Um membro da JAI/JEA/TER/CDE, mesmo com
//    "disciplina", só arquiva dentro do próprio escopo;
//  - a homologação só grava se o procedimento AINDA está NOTIFICADO (WHERE com o estado: clique duplo ou duas pessoas ao mesmo tempo não encerram duas vezes a
//    membresia) e recusa membro que já está desligado ou falecido.
// Fecho dos itens em aberto (03/10/2026):
//  - HOMOLOGAR é UMA transação (procedimento, membro, vacância e trilha de auditoria): erro no meio desfaz tudo — antes o membro podia ficar desligado com o
//    procedimento ainda "notificado", ou o procedimento homologado com assentos e liderança ainda ativos. A linha é relida com UPDLOCK, HOLDLOCK dentro dela;
//  - regra dos dois olhos: quem ABRIU (AbertoPor, migração 134) não homologa; a recusa diz quem pode. Procedimento antigo, sem AbertoPor, segue como estava;
//  - o prazo de defesa conta do último marco entre a notificação, a abertura do procedimento e o edital (shared/abandonoDigital.js::inicioPrazoDefesa).
const auth = require("../shared/auth");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const abandonoDigital = require("../shared/abandonoDigital");
const vacancia = require("../shared/vacancia");
const { exigirGeral, pessoaAlcancavel } = require("../shared/escopoRotas");

const RESULTADOS_RECURSO_VALIDOS = ["PENDENTE", "MANTIDO", "REVERTIDO"];
const ACOES_DA_CLI = ["HOMOLOGAR", "RECURSO"];
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];

const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;

module.exports = async function (context, req) {
  const acaoPedida = req.body && req.body.acao;
  const usuario = ACOES_DA_CLI.includes(acaoPedida)
    ? exigirGeral(req, context, "disciplina")
    : auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { acao } = req.body || {};
  if (!context.bindingData.procedimentoId || !acao) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe procedimentoId na rota e 'acao' no corpo (HOMOLOGAR, ARQUIVAR ou RECURSO)." } };
    return;
  }
  const naoEncontrado = () => { context.res = { status: 200, body: { sucesso: false, mensagem: "Procedimento não encontrado." } }; };
  const procedimentoId = auth.idDeRota(context.bindingData.procedimentoId);
  if (!procedimentoId) { naoEncontrado(); return; }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, procedimentoId)
    .query(`SELECT MembroId, Tipo, Status, DataNotificacao, PrazoDias, DataHomologacao, DataEdital, AbertoPor,
                   CONVERT(varchar(10), DATEADD(HOUR, -3, CriadoEm), 120) AS AbertoEmBrasilia
            FROM ProcedimentosAbandono WHERE ProcedimentoId = @id`);
  const atual = atualResult.recordset[0];
  // Procedimento de membro fora do escopo = "não existe".
  const pessoa = atual ? await pessoaAlcancavel(pool, usuario, atual.MembroId) : null;
  if (!atual || !pessoa) {
    naoEncontrado();
    return;
  }

  // ---- HOMOLOGAR: só depois de vencido o prazo de defesa, por pessoa diferente de quem abriu, numa transação só ----
  if (acao === "HOMOLOGAR") {
    if (atual.Status !== "NOTIFICADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Procedimento com status "${atual.Status}" não pode ser homologado.` } };
      return;
    }
    if (STATUS_TERMINAIS.includes(pessoa.status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este membro já está desligado (ou falecido): não há membresia a encerrar. Arquive o procedimento." } };
      return;
    }
    // Regra dos dois olhos (migração 134): quem abriu não homologa. Procedimento antigo (AbertoPor nulo) segue como estava.
    if (atual.AbertoPor != null && Number(atual.AbertoPor) === Number(usuario.membroId)) {
      const outros = await abandonoDigital.quemPodeHomologar(pool, sql, { excetoMembroId: usuario.membroId });
      context.res = { status: 200, body: { sucesso: false, mensagem: abandonoDigital.mensagemDoisOlhos(outros), quemPodeHomologar: outros.map(o => o.nome) } };
      return;
    }
    // O prazo conta do ÚLTIMO marco entre a notificação gravada, o dia em que o procedimento foi aberto e o edital (shared/abandonoDigital.js::inicioPrazoDefesa).
    const prazo = abandonoDigital.situacaoPrazoDefesa({ dataNotificacao: atual.DataNotificacao, abertoEmBrasilia: atual.AbertoEmBrasilia, dataEdital: atual.DataEdital, prazoDias: atual.PrazoDias });
    if (!prazo.vencido) {
      context.res = {
        status: 200,
        body: { sucesso: false, mensagem: `O prazo de defesa (${atual.PrazoDias} dias, contados de ${prazo.inicioPrazo || "a notificação"}) ainda não venceu${prazo.venceEm ? `: pode ser homologado a partir de ${prazo.venceEm}` : ""}.` }
      };
      return;
    }

    // Tudo numa transação só (procedimento, membro, vacância de assentos/liderança/cargo/EBD e a trilha): ou tudo vale, ou nada muda. A linha do procedimento é lida
    // DE NOVO com UPDLOCK, HOLDLOCK — duas homologações ao mesmo tempo: a segunda espera a primeira terminar e encontra o procedimento já HOMOLOGADO.
    const motivoSaida = atual.Tipo === "DIGITAL" ? "ABANDONO_DIGITAL" : "ABANDONO_MATERIAL";
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    const rq = () => new sql.Request(transacao);
    const desfazer = async () => { try { await transacao.rollback(); } catch { /* já encerrada */ } };
    try {
      const travado = (await rq().input("id", sql.Int, procedimentoId)
        .query(`SELECT Status, MembroId FROM ProcedimentosAbandono WITH (UPDLOCK, HOLDLOCK) WHERE ProcedimentoId = @id`)).recordset[0];
      const membroAgora = travado && (await rq().input("id", sql.Int, travado.MembroId)
        .query(`SELECT Status FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @id`)).recordset[0];
      if (!travado || travado.Status !== "NOTIFICADO" || !membroAgora || STATUS_TERMINAIS.includes(membroAgora.Status)) {
        await desfazer();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este procedimento já foi homologado ou arquivado por outra pessoa." } };
        return;
      }
      const homologou = await rq()
        .input("id", sql.Int, procedimentoId)
        .input("homologadoPor", sql.Int, usuario.membroId)
        .query(`UPDATE ProcedimentosAbandono SET Status = 'HOMOLOGADO', DataHomologacao = CAST(SYSUTCDATETIME() AS DATE), HomologadoPor = @homologadoPor
                WHERE ProcedimentoId = @id AND Status = 'NOTIFICADO'`);
      if (afetadas(homologou) !== 1) {
        await desfazer();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este procedimento já foi homologado ou arquivado por outra pessoa." } };
        return;
      }
      await rq()
        .input("id", sql.Int, atual.MembroId)
        .input("motivoSaida", sql.NVarChar(200), motivoSaida)
        .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
                MotivoSaida = @motivoSaida, DataSaida = CAST(SYSUTCDATETIME() AS DATE)
                WHERE MembroId = @id`);
      // vacancia.encerrarVinculos só usa pool.request(): recebe um "pool" que cria cada request DENTRO desta transação.
      await vacancia.encerrarVinculos({ request: rq }, sql, atual.MembroId, motivoSaida);
      await registrarAuditoriaNaTransacao(transacao, {
        tabela: "ProcedimentosAbandono",
        registroId: Number(procedimentoId),
        acao: `Homologou Abandono ${atual.Tipo === "DIGITAL" ? "Digital" : "Material"} — perda de membresia`,
        usuarioId: usuario.membroId,
        dadosDepois: { membroId: atual.MembroId, motivoSaida, abertoPor: atual.AbertoPor == null ? null : Number(atual.AbertoPor), inicioPrazo: prazo.inicioPrazo }
      });
      await transacao.commit();
    } catch (erro) {
      await desfazer();
      throw erro;
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Abandono homologado — membresia encerrada." } };
    return;
  }

  // ---- ARQUIVAR: membro voltou a comparecer, sem perda ----
  if (acao === "ARQUIVAR") {
    if (atual.Status !== "NOTIFICADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Procedimento com status "${atual.Status}" não pode ser arquivado.` } };
      return;
    }
    const arquivou = await pool.request().input("id", sql.Int, procedimentoId)
      .query(`UPDATE ProcedimentosAbandono SET Status = 'ARQUIVADO' WHERE ProcedimentoId = @id AND Status = 'NOTIFICADO'`);
    if (afetadas(arquivou) !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este procedimento já foi homologado ou arquivado por outra pessoa." } };
      return;
    }
    await registrarAuditoria({ tabela: "ProcedimentosAbandono", registroId: Number(procedimentoId), acao: `Arquivou procedimento de Abandono ${atual.Tipo === "DIGITAL" ? "Digital" : "Material"}`, usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Procedimento arquivado." } };
    return;
  }

  // ---- RECURSO: registra o Recurso à Assembleia (sem efeito suspensivo) ----
  if (acao === "RECURSO") {
    if (atual.Status !== "HOMOLOGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível recorrer de um procedimento já homologado." } };
      return;
    }
    // DATE chega do driver como objeto Date; estatuto.diasDesde só entende "AAAA-MM-DD" (com o Date dava null e o prazo de recurso nunca vencia).
    const dataHomologacao = atual.DataHomologacao instanceof Date ? atual.DataHomologacao.toISOString().slice(0, 10) : atual.DataHomologacao;
    const diasDesdeHomologacao = estatuto.diasDesde(dataHomologacao);
    if (diasDesdeHomologacao !== null && diasDesdeHomologacao > estatuto.DIAS_RECURSO_ASSEMBLEIA) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Prazo de recurso (${estatuto.DIAS_RECURSO_ASSEMBLEIA} dias da homologação) já venceu.` } };
      return;
    }
    const { resultadoRecurso } = req.body || {};
    if (resultadoRecurso && !RESULTADOS_RECURSO_VALIDOS.includes(resultadoRecurso)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `resultadoRecurso inválido. Use um de: ${RESULTADOS_RECURSO_VALIDOS.join(", ")}.` } };
      return;
    }

    await pool.request()
      .input("id", sql.Int, procedimentoId)
      .input("resultado", sql.NVarChar(30), resultadoRecurso || "PENDENTE")
      .query(`UPDATE ProcedimentosAbandono SET RecursoInterposto = 1, DataRecurso = CAST(SYSUTCDATETIME() AS DATE), ResultadoRecurso = @resultado
              WHERE ProcedimentoId = @id AND Status = 'HOMOLOGADO'`);

    await registrarAuditoria({
      tabela: "ProcedimentosAbandono",
      registroId: Number(procedimentoId),
      acao: "Registrou Recurso à Assembleia",
      usuarioId: usuario.membroId,
      dadosDepois: { resultadoRecurso: resultadoRecurso || "PENDENTE" }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Recurso registrado (sem efeito suspensivo — a perda de membresia já vale)." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use 'HOMOLOGAR', 'ARQUIVAR' ou 'RECURSO'." } };
};
