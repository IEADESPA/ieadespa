// EvoluirConsagracao
// Mesma esteira do sistema atual:
// PROTOCOLADO -> EM_ANALISE_CONSELHO -> AGUARDANDO_PLENARIO -> CONCLUIDO
// (ou REPROVAR em qualquer etapa, o que arquiva o processo). Exige a
// permissão "consagracoes".
//
// Auditoria de escopo (02/10/2026): AVANCAR e REPROVAR são os passos do Conselho e do Plenário — decisão da administração geral, não de uma congregação. Só o nível
// GERAL (papel Global com escopo "todas") executa; quem protocola e acompanha dentro do próprio escopo usa CriarConsagracao/ListarConsagracoes. Os UPDATE agora levam o
// estado atual no WHERE: duas pessoas avançando o mesmo processo ao mesmo tempo (ou um clique duplo) não aplicam o cargo duas vezes, e um processo já CONCLUIDO ou
// REPROVADO não pode mais ser reprovado.
//
// Quando chega em CONCLUIDO e o assunto não é "Integração"/"Reintegração":
// 1. Grava o Assunto em MembroReferencia.Funcao — texto histórico/descritivo,
//    igual ao sistema atual (não alimenta mais nenhum cálculo, ver ponto 2).
// 2. Se o Tipo de Consagração (catálogo `TiposConsagracao`) tiver um
//    CargoMinisterialResultante configurado (migração 013), atualiza também
//    MembroReferencia.CargoMinisterial — é ESSE campo que shared/universo.js
//    usa pra calcular composição por Ordenação (CLI, Art. 15). Sem essa
//    configuração no tipo, o Assunto não muda o Cargo Ministerial sozinho.
//
// v8.2 — Escada ministerial: os requisitos (shared/escada.js) são conferidos de novo a CADA avanço, como a formação da v6.9 — um requisito que deixou de valer no meio do
// caminho (disciplina aberta, matrícula inativa, CHM revogado) trava a etapa seguinte. Processo vetado pela AFM já está REPROVADO. A conclusão troca o cargo, a Função e o
// histórico de cargos (CargosMinisteriaisHistorico, com a data e a origem pela modalidade) numa só transação, sob a trava da pessoa.
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const escada = require("../shared/escada");
const escadaDb = require("../shared/escadaDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { exigirGeral, carregarPessoa } = require("../shared/escopoRotas");
const auth = require("../shared/auth");

const PROXIMA_ETAPA_CONSAGRACAO = {
  PROTOCOLADO: "EM_ANALISE_CONSELHO",
  EM_ANALISE_CONSELHO: "AGUARDANDO_PLENARIO",
  AGUARDANDO_PLENARIO: "CONCLUIDO"
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;
const SEM_CARGO = ["Integração", "Reintegração"];

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "consagracoes");
  if (!usuario) return;
  const sessao = auth.exigirLoginIgnorandoTermos(req, {}) || usuario;   // a sessão inteira (a de cima só tem o nível geral de "consagracoes"): para saber da permissão "disciplina"

  const consagracaoId = context.bindingData.consagracaoId;
  const { acao } = req.body || {};

  if (!consagracaoId || !acao) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe consagracaoId na rota e 'acao' no corpo (AVANCAR ou REPROVAR)." } };
    return;
  }
  if (typeof consagracaoId !== "string" || !GUID.test(consagracaoId)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
    .query(`SELECT MembroId AS membroId, Status AS status, Assunto AS assunto, CargoAlvo AS cargoAlvo, Modalidade AS modalidade FROM Consagracoes WHERE ConsagracaoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  if (acao === "REPROVAR") {
    const reprovou = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
      .input("hoje", sql.Date, hojeBrasilia())
      .query(`UPDATE Consagracoes SET Status = 'REPROVADO', DataConclusao = @hoje
              WHERE ConsagracaoId = @id AND Status NOT IN ('CONCLUIDO', 'REPROVADO')`);
    if (afetadas(reprovou) !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo já foi concluído ou reprovado." } };
      return;
    }

    await registrarAuditoria({ tabela: "Consagracoes", registroId: atual.membroId, acao: "Reprovou processo", usuarioId: usuario.membroId });

    context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Processo reprovado e arquivado." } };
    return;
  }

  if (acao === "AVANCAR") {
    const novoStatus = PROXIMA_ETAPA_CONSAGRACAO[atual.status];
    if (!novoStatus) {
      context.res = { status: 400, body: { sucesso: false, mensagem: atual.status === "REPROVADO" ? "Este processo foi reprovado." : "Este processo já está em CONCLUIDO." } };
      return;
    }
    if (Number(atual.membroId) === Number(usuario.membroId)) {
      context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém avança o próprio processo de consagração." } };
      return;
    }

    // v8.2 — a escada, conferida de novo. Processo de antes da v8.2 (sem cargo de destino gravado) usa o cargo do tipo.
    const modalidade = atual.modalidade || "INDICACAO";
    const pessoa = await carregarPessoa(pool, atual.membroId);
    const veDisciplina = escadaDb.veDisciplinaDe(sessao, pessoa);
    const mostrar = (av) => (veDisciplina ? av : escada.mascararParaEscopo(av));
    const conferencia = await escadaDb.avaliar(pool, { membroId: atual.membroId, assunto: atual.assunto, modalidade, alvo: atual.cargoAlvo || null });
    if (conferencia.avaliacao && conferencia.avaliacao.bloqueado) {
      context.res = { status: 200, body: { sucesso: false, mensagem: conferencia.avaliacao.mensagemBloqueio, requisitos: mostrar(conferencia.avaliacao) } };
      return;
    }

    // v6.9 — a formação exigida é reavaliada a CADA avanço, não só no
    // protocolo: um certificado que venceu ou foi revogado no meio do
    // processo trava a etapa seguinte. REPROVAR (acima) nunca é bloqueado.
    const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: atual.assunto, membroId: atual.membroId });
    if (formacao.bloqueado) {
      context.res = { status: 200, body: { sucesso: false, mensagem: formacao.mensagemBloqueio, formacao } };
      return;
    }
    const retrato = conferencia.avaliacao ? escada.retrato(conferencia.avaliacao, hojeBrasilia()) : null;

    if (novoStatus !== "CONCLUIDO") {
      // A etapa só muda se o processo AINDA está na etapa que lemos acima.
      const avancou = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("status", sql.NVarChar(30), novoStatus).input("etapaAtual", sql.NVarChar(30), atual.status)
        .input("retrato", sql.NVarChar(4000), retrato)
        .query(`UPDATE Consagracoes SET Status = @status, RequisitosRetrato = ISNULL(@retrato, RequisitosRetrato) WHERE ConsagracaoId = @id AND Status = @etapaAtual`);   // etapa intermediária
      if (afetadas(avancou) !== 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo mudou de etapa enquanto você olhava. Atualize a lista." } };
        return;
      }
    } else {
      // A conclusão: etapa, Função, cargo e histórico juntos (ou nada). A conferência é REFEITA dentro da trava (revisão independente, 28/10/2026): um CHM revogado ou uma
      // disciplina aberta entre a conferência de cima e este ponto não deixam o cargo mudar.
      const hoje = hojeBrasilia();
      const r = await escadaDb.comTravaDaPessoa(pool, atual.membroId, async (t) => {
        let retratoFinal = retrato;
        if (conferencia.alvo) {
          const dentro = await escadaDb.avaliar(t, { membroId: atual.membroId, assunto: atual.assunto, modalidade, alvo: conferencia.alvo });
          if (dentro.avaliacao.bloqueado) return { sucesso: false, requisitos: dentro.avaliacao, mensagem: dentro.avaliacao.mensagemBloqueio };
          retratoFinal = escada.retrato(dentro.avaliacao, hoje);
        }
        const avancou = await new sql.Request(t).input("id", sql.UniqueIdentifier, consagracaoId).input("etapaAtual", sql.NVarChar(30), atual.status).input("retrato", sql.NVarChar(4000), retratoFinal)
          .input("hoje", sql.Date, hoje)
          .query(`UPDATE Consagracoes SET Status = 'CONCLUIDO', DataConclusao = @hoje, RequisitosRetrato = ISNULL(@retrato, RequisitosRetrato)
                  WHERE ConsagracaoId = @id AND Status = @etapaAtual`);
        if (afetadas(avancou) !== 1) return { sucesso: false, mudou: true };
        if (!SEM_CARGO.includes(atual.assunto)) {
          if (conferencia.alvo) {
            // o CHM foi para ESTA mudança de cargo: a próxima indicação pede um novo, "válido e atualizado" (Regimento Art. 67 §1º; Art. 74, I)
            await new sql.Request(t).input("m", sql.Int, atual.membroId)
              .query(`UPDATE a SET CertificadoHabilitacao = 0, CHMEm = NULL, CHMPor = NULL FROM Matriculas_AFM a
                      WHERE a.MembroId = @m AND a.MatriculaId = (SELECT MAX(a2.MatriculaId) FROM Matriculas_AFM a2 WHERE a2.MembroId = @m)`);
            await escadaDb.trocarCargoNaTransacao(t, {
              membroId: atual.membroId, cargoNovo: conferencia.alvo, desde: hoje, origem: escadaDb.ORIGEM_DA_MODALIDADE[modalidade] || "CONSAGRACAO",
              consagracaoId, funcao: atual.assunto, por: usuario.membroId
            });
          } else {
            await new sql.Request(t).input("membroId", sql.Int, atual.membroId).input("funcao", sql.NVarChar(100), atual.assunto)
              .query(`UPDATE MembroReferencia SET Funcao = @funcao WHERE MembroId = @membroId`);
          }
        }
        return { sucesso: true };
      });
      if (!r.sucesso) {
        context.res = { status: 200, body: r.requisitos
          ? { sucesso: false, mensagem: r.mensagem, requisitos: mostrar(r.requisitos) }
          : { sucesso: false, mensagem: r.mensagem && !r.mudou ? r.mensagem : "Este processo mudou de etapa enquanto você olhava. Atualize a lista." } };
        return;
      }
    }

    await registrarAuditoria({
      tabela: "Consagracoes",
      registroId: atual.membroId,
      acao: `Avançou para ${novoStatus}`,
      usuarioId: usuario.membroId,
      dadosDepois: novoStatus === "CONCLUIDO" && conferencia.alvo ? { cargoNovo: conferencia.alvo, modalidade } : undefined
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        novoStatus,
        nivelamento: !!(conferencia.avaliacao && conferencia.avaliacao.nivelamento),
        mensagem: novoStatus === "CONCLUIDO"
          ? (conferencia.alvo ? `✅ Efetivado! Agora é ${escada.ROTULO_CARGO[conferencia.alvo]}.${conferencia.avaliacao && conferencia.avaliacao.nivelamento ? " Fica em nivelamento obrigatório na AFM (Regimento, Art. 66 §5º)." : ""}` : "✅ Efetivado! A função do obreiro foi atualizada.")
          : `Processo avançou para: ${novoStatus}`
      }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use 'AVANCAR' ou 'REPROVAR'." } };
};
