// shared/workflow.js
// Motor genérico de workflow (vB.3): tipo de fluxo → etapas → responsável
// por etapa (permissão + nível territorial mínimo) → prazo/SLA →
// aprovar/rejeitar/devolver, com escalonamento automático quando o SLA
// estoura. Reaproveita a MESMA hierarquia territorial de shared/escopo.js
// (Congregação → Área → Região → Quadrante → Distrito → Global) em vez de
// inventar uma segunda, e o motor de notificações (shared/notificacoes.js,
// vB.2) pra avisar quem virou responsável por escalonamento.
//
// Decisão explícita (vB.3): NÃO migra os 7 fluxos hand-rolled existentes —
// eles funcionam. Este motor nasce servindo fluxos NOVOS (fases 5-11);
// nenhum tipo de fluxo é semeado aqui, o catálogo (TiposFluxo/FluxoEtapas)
// começa vazio.
const { sql } = require("./db");
const { ancestraisTerritoriais } = require("./escopo");
const { resolverDestinatariosPorPermissao, criarNotificacao } = require("./notificacoes");

const ORDEM_NIVEIS = ["CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO", "GLOBAL"];

// NULL em ResponsavelNivelMinimo/EscalonadoNivel sempre vira GLOBAL aqui —
// diferente do NivelAlvo de NotificacaoRegras (onde NULL = "qualquer
// nível"), porque uma etapa de fluxo sempre tem UM responsável concreto,
// nunca "todo mundo com a permissão".
function nivelEfetivo(etapaNivel, escalonadoNivel) {
  const base = etapaNivel || "GLOBAL";
  if (!escalonadoNivel) return base;
  return ORDEM_NIVEIS.indexOf(escalonadoNivel) > ORDEM_NIVEIS.indexOf(base) ? escalonadoNivel : base;
}

// Próximo nível territorial acima (pra escalonamento) — null quando já é
// GLOBAL (não tem mais pra onde subir; a instância fica "atrasada" mesmo).
function proximoNivel(nivel) {
  const i = ORDEM_NIVEIS.indexOf(nivel || "GLOBAL");
  if (i === -1 || i >= ORDEM_NIVEIS.length - 1) return null;
  return ORDEM_NIVEIS[i + 1];
}

// Quem responde pela etapa: permissão sempre, nível territorial só quando a
// etapa exige (GLOBAL cai no mesmo caminho de shared/notificacoes.js — vale
// pro sistema inteiro, sem depender de escopo territorial de ninguém).
async function resolverResponsaveisEtapa(pool, { permissao, nivel, congregacaoId }) {
  if (!nivel || nivel === "GLOBAL" || !congregacaoId) {
    return resolverDestinatariosPorPermissao(pool, { permissao, nivel: "GLOBAL" });
  }
  const ancestrais = await ancestraisTerritoriais(pool, sql, 1, congregacaoId);
  const idPorNivel = {
    CONGREGACAO: ancestrais.congregacaoId, AREA: ancestrais.areaId, REGIAO: ancestrais.regiaoId,
    QUADRANTE: ancestrais.quadranteId, DISTRITO: ancestrais.distritoId
  };
  const escopoId = idPorNivel[nivel];
  // Ramo territorial incompleto (ex: congregação sem Área cadastrada) — modo
  // seguro: ninguém responde (fica pra escalonar), nunca "todo mundo".
  if (!escopoId) return [];

  const result = await pool.request()
    .input("permissao", sql.NVarChar(60), `%,${permissao},%`)
    .input("nivel", sql.NVarChar(20), nivel)
    .input("escopoId", sql.Int, escopoId)
    .query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
      FROM Lideranca l
      JOIN Papeis p ON p.PapelId = l.PapelId
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE (',' + p.Permissoes + ',') LIKE @permissao
        AND l.EscopoTipo = @nivel AND l.EscopoId = @escopoId
        AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    `);
  return result.recordset;
}

async function registrarHistoricoFluxo(pool, { instanciaId, etapaOrdem, acao, usuarioMembroId, observacao }) {
  await pool.request()
    .input("instanciaId", sql.Int, instanciaId)
    .input("etapaOrdem", sql.Int, etapaOrdem)
    .input("acao", sql.NVarChar(20), acao)
    .input("usuarioMembroId", sql.Int, usuarioMembroId || null)
    .input("observacao", sql.NVarChar(500), observacao || null)
    .query(`INSERT INTO FluxoHistorico (InstanciaId, EtapaOrdem, Acao, UsuarioMembroId, Observacao)
            VALUES (@instanciaId, @etapaOrdem, @acao, @usuarioMembroId, @observacao)`);
}

// Idempotente por origem (TipoFluxo + ReferenciaTabela + ReferenciaId) — o
// módulo dono do dado real pode chamar isso de novo sem medo (ex: reprocessar
// uma fila) sem abrir uma segunda instância pro mesmo registro.
async function iniciarFluxo(pool, { tipoFluxo, referenciaTabela, referenciaId, congregacaoId, solicitanteMembroId }) {
  const existente = await pool.request()
    .input("tipoFluxo", sql.NVarChar(60), tipoFluxo)
    .input("referenciaTabela", sql.NVarChar(60), referenciaTabela)
    .input("referenciaId", sql.Int, referenciaId)
    .query(`SELECT InstanciaId FROM FluxoInstancias WHERE TipoFluxo = @tipoFluxo AND ReferenciaTabela = @referenciaTabela AND ReferenciaId = @referenciaId`);
  if (existente.recordset.length > 0) return { criada: false, instanciaId: existente.recordset[0].InstanciaId };

  const etapa1 = (await pool.request().input("tipoFluxo", sql.NVarChar(60), tipoFluxo)
    .query(`SELECT TOP 1 PrazoDias FROM FluxoEtapas WHERE TipoFluxo = @tipoFluxo ORDER BY Ordem ASC`)).recordset[0];
  if (!etapa1) throw new Error(`Tipo de fluxo '${tipoFluxo}' não tem etapas cadastradas em FluxoEtapas.`);

  const prazoEtapaEm = new Date(Date.now() + etapa1.PrazoDias * 86400000);
  const inserida = await pool.request()
    .input("tipoFluxo", sql.NVarChar(60), tipoFluxo)
    .input("referenciaTabela", sql.NVarChar(60), referenciaTabela)
    .input("referenciaId", sql.Int, referenciaId)
    .input("congregacaoId", sql.Int, congregacaoId || null)
    .input("solicitanteMembroId", sql.Int, solicitanteMembroId || null)
    .input("prazoEtapaEm", sql.Date, prazoEtapaEm)
    .query(`
      INSERT INTO FluxoInstancias (TipoFluxo, ReferenciaTabela, ReferenciaId, CongregacaoId, SolicitanteMembroId, PrazoEtapaEm)
      OUTPUT INSERTED.InstanciaId
      VALUES (@tipoFluxo, @referenciaTabela, @referenciaId, @congregacaoId, @solicitanteMembroId, @prazoEtapaEm)
    `);
  const instanciaId = inserida.recordset[0].InstanciaId;
  await registrarHistoricoFluxo(pool, { instanciaId, etapaOrdem: 1, acao: "INICIAR", usuarioMembroId: solicitanteMembroId, observacao: null });
  return { criada: true, instanciaId };
}

async function atualizarInstancia(pool, instanciaId, campos) {
  const request = pool.request().input("id", sql.Int, instanciaId);
  const sets = ["AtualizadaEm = SYSUTCDATETIME()"];
  if (campos.status) { request.input("status", sql.NVarChar(20), campos.status); sets.push("Status = @status"); }
  if (campos.etapaAtualOrdem !== undefined) { request.input("etapaAtualOrdem", sql.Int, campos.etapaAtualOrdem); sets.push("EtapaAtualOrdem = @etapaAtualOrdem"); }
  if (campos.escalonadoNivel !== undefined) { request.input("escalonadoNivel", sql.NVarChar(20), campos.escalonadoNivel); sets.push("EscalonadoNivel = @escalonadoNivel"); }
  if (campos.prazoEtapaEm) { request.input("prazoEtapaEm", sql.Date, campos.prazoEtapaEm); sets.push("PrazoEtapaEm = @prazoEtapaEm"); }
  await request.query(`UPDATE FluxoInstancias SET ${sets.join(", ")} WHERE InstanciaId = @id`);
}

// Aprovar avança pra próxima etapa (ou conclui, se era a última); rejeitar e
// devolver são terminais — "devolver" não tem etapa regressiva no motor
// genérico (o solicitante corrige e resubmete, o que abre uma instância
// nova; simples de propósito, todos os 7 fluxos manuais já funcionam assim
// na prática, mesmo sem motor).
async function avancarEtapa(pool, { instanciaId, acao, usuarioMembroId, observacao }) {
  const instancia = (await pool.request().input("id", sql.Int, instanciaId).query(`SELECT * FROM FluxoInstancias WHERE InstanciaId = @id`)).recordset[0];
  if (!instancia) return { sucesso: false, mensagem: "Fluxo não encontrado." };
  if (instancia.Status !== "EM_ANDAMENTO") return { sucesso: false, mensagem: "Este fluxo já foi encerrado." };

  await registrarHistoricoFluxo(pool, { instanciaId, etapaOrdem: instancia.EtapaAtualOrdem, acao, usuarioMembroId, observacao });

  if (acao === "REJEITAR") {
    await atualizarInstancia(pool, instanciaId, { status: "REJEITADO" });
    return { sucesso: true, mensagem: "✅ Fluxo rejeitado." };
  }
  if (acao === "DEVOLVER") {
    await atualizarInstancia(pool, instanciaId, { status: "DEVOLVIDO" });
    return { sucesso: true, mensagem: "✅ Fluxo devolvido ao solicitante." };
  }
  if (acao === "APROVAR") {
    const proximaEtapa = (await pool.request()
      .input("tipoFluxo", sql.NVarChar(60), instancia.TipoFluxo)
      .input("ordem", sql.Int, instancia.EtapaAtualOrdem + 1)
      .query(`SELECT PrazoDias FROM FluxoEtapas WHERE TipoFluxo = @tipoFluxo AND Ordem = @ordem`)).recordset[0];
    if (!proximaEtapa) {
      await atualizarInstancia(pool, instanciaId, { status: "CONCLUIDO" });
      return { sucesso: true, mensagem: "✅ Fluxo concluído — era a última etapa." };
    }
    const prazoEtapaEm = new Date(Date.now() + proximaEtapa.PrazoDias * 86400000);
    await atualizarInstancia(pool, instanciaId, { etapaAtualOrdem: instancia.EtapaAtualOrdem + 1, escalonadoNivel: null, prazoEtapaEm });
    return { sucesso: true, mensagem: "✅ Aprovado — avançou para a próxima etapa." };
  }
  return { sucesso: false, mensagem: "Ação inválida. Use APROVAR, REJEITAR ou DEVOLVER." };
}

// Roda no NotificacoesAgendador... não — tem seu próprio timer
// (FluxosEscalonador). Escalona (sobe 1 nível territorial, reabre o mesmo
// prazo da etapa) tudo que estourou o SLA e ainda não é GLOBAL, e avisa o
// novo responsável pela central de notificações (vB.2) — best-effort, uma
// falha de notificação nunca trava o escalonamento em si.
async function escalonarSLAsVencidos(pool) {
  const vencidas = (await pool.request().query(`
    SELECT i.InstanciaId, i.TipoFluxo, i.EtapaAtualOrdem, i.EscalonadoNivel, i.CongregacaoId,
           e.ResponsavelPermissao, e.ResponsavelNivelMinimo, e.PrazoDias
    FROM FluxoInstancias i
    JOIN FluxoEtapas e ON e.TipoFluxo = i.TipoFluxo AND e.Ordem = i.EtapaAtualOrdem
    WHERE i.Status = 'EM_ANDAMENTO' AND i.PrazoEtapaEm < CAST(SYSUTCDATETIME() AS DATE)
  `)).recordset;

  let escalonadas = 0;
  for (const instancia of vencidas) {
    const nivelAtual = nivelEfetivo(instancia.ResponsavelNivelMinimo, instancia.EscalonadoNivel);
    const proximo = proximoNivel(nivelAtual);
    if (!proximo) continue; // já é GLOBAL — não tem pra onde subir, fica atrasado mesmo (aparece em "atrasados")

    await pool.request()
      .input("id", sql.Int, instancia.InstanciaId)
      .input("nivel", sql.NVarChar(20), proximo)
      .input("prazo", sql.Date, new Date(Date.now() + instancia.PrazoDias * 86400000))
      .query(`UPDATE FluxoInstancias SET EscalonadoNivel = @nivel, PrazoEtapaEm = @prazo, AtualizadaEm = SYSUTCDATETIME() WHERE InstanciaId = @id`);
    await registrarHistoricoFluxo(pool, {
      instanciaId: instancia.InstanciaId, etapaOrdem: instancia.EtapaAtualOrdem, acao: "ESCALONAR", usuarioMembroId: null,
      observacao: `SLA estourado — escalonado de ${nivelAtual} para ${proximo}.`
    });
    escalonadas++;

    const destinatarios = await resolverResponsaveisEtapa(pool, { permissao: instancia.ResponsavelPermissao, nivel: proximo, congregacaoId: instancia.CongregacaoId });
    for (const dest of destinatarios) {
      await criarNotificacao(pool, {
        regraChave: "FLUXO_ESCALONADO",
        destinatarioMembroId: dest.membroId,
        titulo: "Fluxo escalonado até você",
        mensagem: `Um fluxo do tipo "${instancia.TipoFluxo}" estourou o prazo na etapa atual e escalonou até seu nível.`,
        categoria: "WORKFLOW",
        referenciaTabela: "FluxoInstancias",
        referenciaId: instancia.InstanciaId
      });
    }
  }
  return escalonadas;
}

// Painel único "o que está comigo" / "o que está atrasado" (vB.3) — junta
// TipoFluxo+Etapa pra saber a permissão/nível de cada instância em aberto e
// filtra só as que o usuário logado responde (mesma resolução de
// responsável usada pra aprovar/rejeitar, nunca uma segunda regra solta).
async function listarFluxosDoUsuario(pool, usuario, { apenasAtrasados } = {}) {
  const abertas = (await pool.request().query(`
    SELECT i.InstanciaId AS instanciaId, i.TipoFluxo AS tipoFluxo, t.Nome AS tipoFluxoNome,
           i.ReferenciaTabela AS referenciaTabela, i.ReferenciaId AS referenciaId,
           i.EtapaAtualOrdem AS etapaAtualOrdem, i.EscalonadoNivel AS escalonadoNivel,
           i.CongregacaoId AS congregacaoId, i.PrazoEtapaEm AS prazoEtapaEm, i.CriadaEm AS criadaEm,
           e.Nome AS etapaNome, e.ResponsavelPermissao AS responsavelPermissao, e.ResponsavelNivelMinimo AS responsavelNivelMinimo
    FROM FluxoInstancias i
    JOIN TiposFluxo t ON t.Chave = i.TipoFluxo
    JOIN FluxoEtapas e ON e.TipoFluxo = i.TipoFluxo AND e.Ordem = i.EtapaAtualOrdem
    WHERE i.Status = 'EM_ANDAMENTO'
    ORDER BY i.PrazoEtapaEm ASC
  `)).recordset;

  const hoje = new Date().toISOString().slice(0, 10);
  const minhas = [];
  for (const instancia of abertas) {
    const nivel = nivelEfetivo(instancia.responsavelNivelMinimo, instancia.escalonadoNivel);
    const responsaveis = await resolverResponsaveisEtapa(pool, { permissao: instancia.responsavelPermissao, nivel, congregacaoId: instancia.congregacaoId });
    if (!responsaveis.some(r => r.membroId === usuario.membroId)) continue;
    const atrasado = String(instancia.prazoEtapaEm).slice(0, 10) < hoje;
    if (apenasAtrasados && !atrasado) continue;
    minhas.push({ ...instancia, atrasado });
  }
  return minhas;
}

module.exports = {
  ORDEM_NIVEIS, nivelEfetivo, proximoNivel, resolverResponsaveisEtapa,
  iniciarFluxo, avancarEtapa, escalonarSLAsVencidos, listarFluxosDoUsuario, registrarHistoricoFluxo
};
