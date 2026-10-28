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
//
// v8.3 — Consagração e documentação (Regimento Art. 74 e 75): no processo que leva a cargo, "Avançar" só envia ao CEI, e só com os documentos da indicação (foto e
// documentos pessoais — Art. 74, II). O parecer é do CEI, a homologação do Presidente ou da CLI (EsteiraConsagracao) e a conclusão é o registro da cerimônia
// (CerimoniasConsagracao). Os processos sem cargo (Integração, Reintegração) seguem a esteira de sempre.
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const escada = require("../shared/escada");
const escadaDb = require("../shared/escadaDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { exigirGeral, carregarPessoa } = require("../shared/escopoRotas");
const auth = require("../shared/auth");
const consagracaoDb = require("../shared/consagracaoDb");

// v8.3 — quem resolve cada etapa do processo que leva a cargo (Regimento Art. 74 e 75).
const ETAPA_COM_DONO = {
  EM_ANALISE_CONSELHO: "Este processo aguarda o parecer do CEI (Regimento, Art. 74, III): quem tem a permissão do CEI registra o parecer.",
  AGUARDANDO_PLENARIO: "Este processo aguarda a homologação: use \"Homologar\" (ato do Pastor Presidente ou reunião da CLI — Regimento, Art. 74, IV e Art. 7º, III).",
  HOMOLOGADO: "Este processo já está homologado: a consagração se conclui no registro da cerimônia (Regimento, Art. 75)."
};

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
      .query(`UPDATE Consagracoes SET Status = 'REPROVADO', DataConclusao = @hoje, CerimoniaId = NULL, DiplomaCodigo = NULL
              WHERE ConsagracaoId = @id AND Status NOT IN ('CONCLUIDO', 'REPROVADO')`);   // v8.3: sai da cerimônia e solta o código reservado do diploma
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
    if (!novoStatus && atual.status === "HOMOLOGADO" && !(atual.cargoAlvo || (await escadaDb.cargoDoTipo(pool, atual.assunto)))) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "Este processo está homologado, mas o tipo dele não leva mais a um cargo: reprove-o e protocole de novo." } };
      return;
    }
    if (!novoStatus && atual.status !== "HOMOLOGADO") {   // v8.3: o homologado tem resposta própria logo abaixo
      context.res = { status: 400, body: { sucesso: false, mensagem: atual.status === "REPROVADO" ? "Este processo foi reprovado." : "Este processo já está em CONCLUIDO." } };
      return;
    }
    if (Number(atual.membroId) === Number(usuario.membroId)) {
      context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém avança o próprio processo de consagração." } };
      return;
    }

    // v8.3 — o processo que leva a cargo só sai daqui do protocolo para o CEI; as etapas seguintes têm dono próprio (EsteiraConsagracao e CerimoniasConsagracao).
    const alvo = atual.cargoAlvo || (await escadaDb.cargoDoTipo(pool, atual.assunto));
    if (alvo && atual.status !== "PROTOCOLADO") {
      context.res = { status: 409, body: { sucesso: false, mensagem: ETAPA_COM_DONO[atual.status] || "Este processo não avança por aqui. Atualize a lista." } };
      return;
    }

    // v8.2 — a escada, conferida de novo. Processo de antes da v8.2 (sem cargo de destino gravado) usa o cargo do tipo.
    const modalidade = atual.modalidade || "INDICACAO";
    const pessoa = await carregarPessoa(pool, atual.membroId);
    const veDisciplina = escadaDb.veDisciplinaDe(sessao, pessoa);
    const mostrar = (av) => (veDisciplina ? av : escada.mascararParaEscopo(av));
    const conferencia = await escadaDb.avaliar(pool, { membroId: atual.membroId, assunto: atual.assunto, modalidade, alvo: alvo || null });
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
    // v8.3 — os documentos da indicação (Art. 74, II), depois dos requisitos: o que trava a pessoa aparece primeiro.
    if (alvo) {
      const proc = await consagracaoDb.carregarProcesso(pool, consagracaoId);
      const falta = proc ? consagracaoDb.faltaNoDossie(proc) : "Processo não encontrado.";
      if (falta) {
        context.res = { status: 200, body: { sucesso: false, mensagem: falta } };
        return;
      }
    }

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
      // v8.3 — só o processo SEM cargo (Integração, Reintegração, texto livre) conclui aqui: grava a Função. O de cargo conclui no registro da cerimônia
      // (shared/consagracaoDb.js — cargo, histórico, CHM usado e diploma, sob a trava de cada candidato).
      const hoje = hojeBrasilia();
      const r = await escadaDb.comTravaDaPessoa(pool, atual.membroId, async (t) => {
        const avancou = await new sql.Request(t).input("id", sql.UniqueIdentifier, consagracaoId).input("etapaAtual", sql.NVarChar(30), atual.status).input("hoje", sql.Date, hoje)
          .query(`UPDATE Consagracoes SET Status = 'CONCLUIDO', DataConclusao = @hoje WHERE ConsagracaoId = @id AND Status = @etapaAtual`);
        if (afetadas(avancou) !== 1) return { sucesso: false, mudou: true };
        if (!SEM_CARGO.includes(atual.assunto)) {
          await new sql.Request(t).input("membroId", sql.Int, atual.membroId).input("funcao", sql.NVarChar(100), atual.assunto)
            .query(`UPDATE MembroReferencia SET Funcao = @funcao WHERE MembroId = @membroId`);
        }
        return { sucesso: true };
      });
      if (!r.sucesso) {
        context.res = { status: 200, body: { sucesso: false, mensagem: r.mensagem && !r.mudou ? r.mensagem : "Este processo mudou de etapa enquanto você olhava. Atualize a lista." } };
        return;
      }
    }

    await registrarAuditoria({
      tabela: "Consagracoes",
      registroId: atual.membroId,
      acao: `Avançou para ${novoStatus}`,
      usuarioId: usuario.membroId,
      dadosDepois: alvo ? { etapa: "CEI" } : undefined
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        novoStatus,
        mensagem: novoStatus === "CONCLUIDO"
          ? "✅ Efetivado! A função do obreiro foi atualizada."
          : alvo ? "Processo enviado ao CEI para o parecer (Regimento, Art. 74, III)." : `Processo avançou para: ${novoStatus}`
      }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use 'AVANCAR' ou 'REPROVAR'." } };
};
