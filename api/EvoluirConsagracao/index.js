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
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const { exigirGeral } = require("../shared/escopoRotas");

const PROXIMA_ETAPA_CONSAGRACAO = {
  PROTOCOLADO: "EM_ANALISE_CONSELHO",
  EM_ANALISE_CONSELHO: "AGUARDANDO_PLENARIO",
  AGUARDANDO_PLENARIO: "CONCLUIDO"
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "consagracoes");
  if (!usuario) return;

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
    .query(`SELECT MembroId AS membroId, Status AS status, Assunto AS assunto FROM Consagracoes WHERE ConsagracaoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  if (acao === "REPROVAR") {
    const reprovou = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
      .query(`UPDATE Consagracoes SET Status = 'REPROVADO', DataConclusao = CAST(SYSUTCDATETIME() AS DATE)
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
      context.res = { status: 400, body: { sucesso: false, mensagem: "Este processo já está em CONCLUIDO." } };
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

    // A etapa só muda se o processo AINDA está na etapa que lemos acima.
    const avancou = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("status", sql.NVarChar(30), novoStatus).input("etapaAtual", sql.NVarChar(30), atual.status)
      .query(novoStatus === "CONCLUIDO"
        ? `UPDATE Consagracoes SET Status = @status, DataConclusao = CAST(SYSUTCDATETIME() AS DATE) WHERE ConsagracaoId = @id AND Status = @etapaAtual`
        : `UPDATE Consagracoes SET Status = @status WHERE ConsagracaoId = @id AND Status = @etapaAtual`);
    if (afetadas(avancou) !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo mudou de etapa enquanto você olhava. Atualize a lista." } };
      return;
    }

    if (novoStatus === "CONCLUIDO" && atual.assunto !== "Integração" && atual.assunto !== "Reintegração") {
      await pool.request().input("membroId", sql.Int, atual.membroId).input("funcao", sql.NVarChar(100), atual.assunto)
        .query(`UPDATE MembroReferencia SET Funcao = @funcao WHERE MembroId = @membroId`);

      const tipoResult = await pool.request().input("nome", sql.NVarChar(100), atual.assunto)
        .query(`SELECT TOP 1 CargoMinisterialResultante FROM TiposConsagracao WHERE Nome = @nome`);
      const cargoResultante = tipoResult.recordset[0] && tipoResult.recordset[0].CargoMinisterialResultante;
      if (cargoResultante) {
        await pool.request().input("membroId", sql.Int, atual.membroId).input("cargo", sql.NVarChar(30), cargoResultante)
          .query(`UPDATE MembroReferencia SET CargoMinisterial = @cargo WHERE MembroId = @membroId`);
      }
    }

    await registrarAuditoria({
      tabela: "Consagracoes",
      registroId: atual.membroId,
      acao: `Avançou para ${novoStatus}`,
      usuarioId: usuario.membroId
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        novoStatus,
        mensagem: novoStatus === "CONCLUIDO" ? "✅ Efetivado! A função do obreiro foi atualizada." : `Processo avançou para: ${novoStatus}`
      }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use 'AVANCAR' ou 'REPROVAR'." } };
};
