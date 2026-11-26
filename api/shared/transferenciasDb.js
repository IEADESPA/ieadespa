// shared/transferenciasDb.js (FASE 10, v10.1b passo 3, 17/11/2026) — a leitura e a gravação da TRANSFERÊNCIA DE CONGREGAÇÃO (as regras puras estão em
// shared/transferencias.js). Toda mudança da ficha (MembroReferencia.CongregacaoId) acontece aqui, numa transação, e só se a pessoa AINDA estiver na
// congregação de origem do pedido (senão "mudou enquanto você olhava"). O dízimo dela passa junto para a tesouraria do destino (Dizimistas), como na
// emancipação de uma Extensão (shared/expansaoDb.js). Só um pedido PENDENTE por pessoa (índice único da migração 176).
const { sql } = require("./db");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const regras = require("./transferencias");
const { condicaoSqlEscopoCongregacao, ehGeral } = require("./escopoRotas");

const erroNumero = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const violouPendenteUnico = (e) => [2601, 2627].includes(erroNumero(e)) && /UX_Transferencias_PendentePorMembro/.test(String(e && e.message));

async function emTransacao(pool, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const r = await fazer(t, () => new sql.Request(t));
    if (r && r.sucesso === false) { await t.rollback(); return r; }
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}

// A pessoa com a congregação (e a área dela). `travar` = UPDLOCK na ficha (dentro da transação).
async function lerPessoa(rq, membroId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Status, m.CongregacaoId, c.Nome AS CongregacaoNome, c.AreaId, e.Nome AS ExtensaoNome
    FROM MembroReferencia m ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""}
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id`);
  const l = r.recordset[0];
  return l ? { membroId: l.MembroId, nome: l.Nome, status: l.Status, congregacaoId: l.CongregacaoId, congregacaoNome: l.CongregacaoNome || null, areaId: l.AreaId,
    extensaoNome: l.ExtensaoNome || null } : null;
}

async function lerCongregacao(rq, congregacaoId) {
  const r = await rq().input("id", sql.Int, congregacaoId).query(`SELECT CongregacaoId, Nome, Ativa, AreaId FROM Congregacoes WHERE CongregacaoId = @id`);
  const l = r.recordset[0];
  return l ? { congregacaoId: l.CongregacaoId, nome: l.Nome, ativa: !!l.Ativa, areaId: l.AreaId } : null;
}

const SELECT_TRANSFERENCIA = `
  SELECT t.TransferenciaId, t.MembroId, m.Nome AS PessoaNome, t.CongregacaoOrigemId, co.Nome AS OrigemNome, co.AreaId AS OrigemAreaId, ao.Nome AS OrigemAreaNome,
         t.CongregacaoDestinoId, cd.Nome AS DestinoNome, cd.AreaId AS DestinoAreaId, ad.Nome AS DestinoAreaNome,
         t.Regra, t.PedidoComo, t.PedidoPor, pp.Nome AS PedidoPorNome, t.PedidoEm, t.Motivo, t.Situacao, t.DecididoComo, t.DecididoPor, dp.Nome AS DecididoPorNome,
         t.DecididoEm, t.MotivoRecusa, t.CanceladoPor, t.CanceladoEm
  FROM TransferenciasCongregacao t
  JOIN MembroReferencia m ON m.MembroId = t.MembroId
  JOIN Congregacoes co ON co.CongregacaoId = t.CongregacaoOrigemId
  JOIN Congregacoes cd ON cd.CongregacaoId = t.CongregacaoDestinoId
  LEFT JOIN Areas ao ON ao.AreaId = co.AreaId
  LEFT JOIN Areas ad ON ad.AreaId = cd.AreaId
  LEFT JOIN MembroReferencia pp ON pp.MembroId = t.PedidoPor
  LEFT JOIN MembroReferencia dp ON dp.MembroId = t.DecididoPor`;

const iso = (v) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
function mapear(l, agora = new Date()) {
  return {
    transferenciaId: l.TransferenciaId, membroId: l.MembroId, pessoaNome: l.PessoaNome,
    origemId: l.CongregacaoOrigemId, origemNome: l.OrigemNome, origemAreaNome: l.OrigemAreaNome || null,
    destinoId: l.CongregacaoDestinoId, destinoNome: l.DestinoNome, destinoAreaNome: l.DestinoAreaNome || null,
    regra: l.Regra, pedidoComo: l.PedidoComo, pedidoPor: l.PedidoPor, pedidoPorNome: l.PedidoPorNome || null, pedidoEm: iso(l.PedidoEm), motivo: l.Motivo || null,
    situacao: l.Situacao, decididoComo: l.DecididoComo || null, decididoPor: l.DecididoPor || null, decididoPorNome: l.DecididoPorNome || null, decididoEm: iso(l.DecididoEm),
    motivoRecusa: l.MotivoRecusa || null, canceladoPor: l.CanceladoPor || null, canceladoEm: iso(l.CanceladoEm),
    diasParado: l.Situacao === "PENDENTE" ? regras.diasParado(l.PedidoEm, agora) : null
  };
}

async function lerTransferencia(rq, id, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, id).query(`${SELECT_TRANSFERENCIA.replace("FROM TransferenciasCongregacao t", `FROM TransferenciasCongregacao t ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""}`)} WHERE t.TransferenciaId = @id`);
  return r.recordset[0] ? mapear(r.recordset[0]) : null;
}

// Muda a ficha: a congregação do destino e sai da Extensão (a Extensão é da congregação antiga). Só se a pessoa ainda está na origem. O dízimo ativo dela passa
// para a tesouraria do destino. Devolve false se a ficha já não estava na origem.
async function moverFicha(rq, membroId, origemId, destinoId) {
  const mov = await rq().input("m", sql.Int, membroId).input("o", sql.Int, origemId).input("d", sql.Int, destinoId)
    .query(`UPDATE MembroReferencia SET CongregacaoId = @d, ExtensaoId = NULL WHERE MembroId = @m AND CongregacaoId = @o`);
  if (!mov.rowsAffected[0]) return false;
  await rq().input("m", sql.Int, membroId).input("o", sql.Int, origemId).input("d", sql.Int, destinoId)
    .query(`UPDATE Dizimistas SET CongregacaoId = @d WHERE MembroId = @m AND CongregacaoId = @o AND Ativo = 1`);
  return true;
}

// PEDIR. `pedidoComo`: GERAL | ORIGEM | PROPRIO (quem chama já conferiu que pode). `origemEsperadaId`: a congregação que a pessoa tinha quando o pedido foi
// conferido (se mudou no meio, "mudou enquanto você olhava").
async function pedir(pool, { membroId, destinoId, motivo, pedidoComo, por, origemEsperadaId }) {
  try {
    return await emTransacao(pool, async (t, rq) => {
      const p = await lerPessoa(rq, membroId, { travar: true });
      if (!p) return { sucesso: false, naoExiste: true, mensagem: "Matrícula não encontrada." };
      if (regras.STATUS_SEM_TRANSFERENCIA.has(p.status)) return { sucesso: false, mensagem: regras.MSG.SAIU_DO_ROL };
      if (!p.congregacaoId) return { sucesso: false, mensagem: regras.MSG.SEM_CONGREGACAO };
      if (origemEsperadaId != null && Number(p.congregacaoId) !== Number(origemEsperadaId)) return { sucesso: false, mensagem: regras.MSG.MUDOU };
      const destino = await lerCongregacao(rq, destinoId);
      if (!destino || !destino.ativa) return { sucesso: false, mensagem: regras.MSG.DESTINO_INVALIDO };
      if (Number(destino.congregacaoId) === Number(p.congregacaoId)) return { sucesso: false, mensagem: regras.MSG.MESMA_CONGREGACAO };
      const regra = regras.regraDaTransferencia({ pedidoComo, areaOrigemId: p.areaId, areaDestinoId: destino.areaId });
      const naHora = regras.entraNaHora(regra);
      const decididoComo = naHora ? (pedidoComo === "GERAL" ? "GERAL" : "AUTOMATICO") : null;
      const ins = await rq().input("m", sql.Int, p.membroId).input("o", sql.Int, p.congregacaoId).input("d", sql.Int, destino.congregacaoId)
        .input("regra", sql.NVarChar(20), regra).input("como", sql.NVarChar(20), pedidoComo).input("por", sql.Int, por)
        .input("motivo", sql.NVarChar(500), regras.textoLimpo(motivo)).input("sit", sql.NVarChar(20), naHora ? "CONCLUIDA" : "PENDENTE")
        .input("dc", sql.NVarChar(20), decididoComo).input("dp", sql.Int, naHora ? por : null)
        .query(`INSERT INTO TransferenciasCongregacao (MembroId, CongregacaoOrigemId, CongregacaoDestinoId, Regra, PedidoComo, PedidoPor, Motivo, Situacao, DecididoComo, DecididoPor, DecididoEm)
                OUTPUT inserted.TransferenciaId
                VALUES (@m, @o, @d, @regra, @como, @por, @motivo, @sit, @dc, @dp, CASE WHEN @sit = N'CONCLUIDA' THEN SYSUTCDATETIME() ELSE NULL END)`);
      const transferenciaId = ins.recordset[0].TransferenciaId;
      if (naHora && !(await moverFicha(rq, p.membroId, p.congregacaoId, destino.congregacaoId))) return { sucesso: false, mensagem: regras.MSG.MUDOU };
      await registrarAuditoriaNaTransacao(t, { tabela: "TransferenciasCongregacao", registroId: transferenciaId, acao: naHora ? "TRANSFERENCIA_FEITA" : "TRANSFERENCIA_PEDIDA",
        usuarioId: por, dadosDepois: { membroId: p.membroId, origemId: p.congregacaoId, destinoId: destino.congregacaoId, regra, pedidoComo } });
      if (naHora) {
        await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: p.membroId, acao: "Transferiu de congregação", usuarioId: por,
          dadosAntes: { congregacaoId: p.congregacaoId }, dadosDepois: { congregacaoId: destino.congregacaoId, transferenciaId } });
      }
      return {
        sucesso: true, transferenciaId, regra, situacao: naHora ? "CONCLUIDA" : "PENDENTE", membroId: p.membroId, pessoaNome: p.nome, pedidoPor: por,
        origemNome: p.congregacaoNome, destinoId: destino.congregacaoId, destinoNome: destino.nome,
        mensagem: naHora
          ? `${p.nome} passou para ${destino.nome}${regra === "GERAL" ? " (pedido da Secretaria Geral: entra na hora)" : " (mesma área: entra na hora)"}.`
          : `Pedido enviado: a secretaria de ${destino.nome} aceita ou recusa. Até lá, ${p.nome} continua em ${p.congregacaoNome}.`
      };
    });
  } catch (e) {
    if (violouPendenteUnico(e)) return { sucesso: false, conflito: true, mensagem: regras.MSG.JA_HA_PEDIDO };
    throw e;
  }
}

// ACEITAR ou RECUSAR um pedido PENDENTE. `decididoComo`: DESTINO | GERAL (quem chama já conferiu). `destinoEsperadoId` garante que o pedido conferido é o mesmo.
async function decidir(pool, { transferenciaId, aceitar, motivoRecusa, decididoComo, por, destinoEsperadoId }) {
  const motivo = regras.textoLimpo(motivoRecusa);
  if (!aceitar && (!motivo || motivo.length < 3)) return { sucesso: false, mensagem: regras.MSG.MOTIVO_RECUSA };
  return emTransacao(pool, async (t, rq) => {
    const tr = await lerTransferencia(rq, transferenciaId, { travar: true });
    if (!tr) return { sucesso: false, naoExiste: true, mensagem: regras.MSG.NAO_EXISTE };
    if (tr.situacao !== "PENDENTE") return { sucesso: false, conflito: true, mensagem: regras.MSG.NAO_PENDENTE };
    if (destinoEsperadoId != null && Number(tr.destinoId) !== Number(destinoEsperadoId)) return { sucesso: false, mensagem: regras.MSG.MUDOU };
    if (aceitar) {
      const destino = await lerCongregacao(rq, tr.destinoId);
      if (!destino || !destino.ativa) return { sucesso: false, mensagem: regras.MSG.DESTINO_INVALIDO };
      if (!(await moverFicha(rq, tr.membroId, tr.origemId, tr.destinoId))) return { sucesso: false, mensagem: "A pessoa já não está na congregação de origem deste pedido. Cancele-o e peça de novo." };
    }
    const up = await rq().input("id", sql.Int, tr.transferenciaId).input("sit", sql.NVarChar(20), aceitar ? "CONCLUIDA" : "RECUSADA")
      .input("dc", sql.NVarChar(20), decididoComo).input("por", sql.Int, por).input("mot", sql.NVarChar(500), aceitar ? null : motivo)
      .query(`UPDATE TransferenciasCongregacao SET Situacao = @sit, DecididoComo = @dc, DecididoPor = @por, DecididoEm = SYSUTCDATETIME(), MotivoRecusa = @mot
              WHERE TransferenciaId = @id AND Situacao = N'PENDENTE'`);
    if (!up.rowsAffected[0]) return { sucesso: false, conflito: true, mensagem: regras.MSG.NAO_PENDENTE };
    await registrarAuditoriaNaTransacao(t, { tabela: "TransferenciasCongregacao", registroId: tr.transferenciaId, acao: aceitar ? "TRANSFERENCIA_ACEITA" : "TRANSFERENCIA_RECUSADA",
      usuarioId: por, dadosDepois: { decididoComo, ...(aceitar ? {} : { motivoRecusa: motivo }) } });
    if (aceitar) {
      await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: tr.membroId, acao: "Transferiu de congregação", usuarioId: por,
        dadosAntes: { congregacaoId: tr.origemId }, dadosDepois: { congregacaoId: tr.destinoId, transferenciaId: tr.transferenciaId } });
    }
    return { sucesso: true, transferenciaId: tr.transferenciaId, situacao: aceitar ? "CONCLUIDA" : "RECUSADA", membroId: tr.membroId, pessoaNome: tr.pessoaNome,
      pedidoPor: tr.pedidoPor, origemNome: tr.origemNome, destinoNome: tr.destinoNome,
      mensagem: aceitar ? `${tr.pessoaNome} passou para ${tr.destinoNome}.` : `Pedido recusado. A congregação de origem (${tr.origemNome}) recebe o motivo.` };
  });
}

// CANCELAR um pedido PENDENTE (quem chama já conferiu que pode). `somenteSeProprio`: a pessoa só cancela o pedido que ela mesma fez.
async function cancelar(pool, { transferenciaId, por, somenteSeProprio = false, membroIdDono = null }) {
  return emTransacao(pool, async (t, rq) => {
    const tr = await lerTransferencia(rq, transferenciaId, { travar: true });
    if (!tr || (membroIdDono != null && Number(tr.membroId) !== Number(membroIdDono))) return { sucesso: false, naoExiste: true, mensagem: regras.MSG.NAO_EXISTE };
    if (tr.situacao !== "PENDENTE") return { sucesso: false, conflito: true, mensagem: regras.MSG.NAO_PENDENTE };
    if (somenteSeProprio && !(tr.pedidoComo === "PROPRIO" && Number(tr.pedidoPor) === Number(por))) return { sucesso: false, proibido: true, mensagem: regras.MSG.QUEM_CANCELA };
    const up = await rq().input("id", sql.Int, tr.transferenciaId).input("por", sql.Int, por)
      .query(`UPDATE TransferenciasCongregacao SET Situacao = N'CANCELADA', CanceladoPor = @por, CanceladoEm = SYSUTCDATETIME() WHERE TransferenciaId = @id AND Situacao = N'PENDENTE'`);
    if (!up.rowsAffected[0]) return { sucesso: false, conflito: true, mensagem: regras.MSG.NAO_PENDENTE };
    await registrarAuditoriaNaTransacao(t, { tabela: "TransferenciasCongregacao", registroId: tr.transferenciaId, acao: "TRANSFERENCIA_CANCELADA", usuarioId: por });
    return { sucesso: true, transferenciaId: tr.transferenciaId, situacao: "CANCELADA", mensagem: "Pedido de transferência cancelado." };
  });
}

// LISTAR as caixas da secretaria, no escopo da visão (filtrado NO BANCO, como as listas da fase 10): chegando (destino no escopo, pendentes), saindo (origem no
// escopo, pendentes), concluidos (resolvidos nos últimos 90 dias, origem ou destino no escopo), paradas (só a Geral: pendentes há mais de 7 dias), ou todas as
// pendentes do escopo (padrão). Em páginas (até 100).
async function listar(pool, visao, { caixa, pagina = 1, porPagina = 30 } = {}) {
  const geral = ehGeral(visao);
  const pedido = pool.request();
  const pg = Math.min(Math.max(parseInt(pagina, 10) || 1, 1), 100000);
  const pp = Math.min(Math.max(parseInt(porPagina, 10) || 30, 1), 100);
  const onde = [];
  const destCond = geral ? null : await condicaoSqlEscopoCongregacao(pool, visao, pedido, "t.CongregacaoDestinoId", "escDest");
  const origCond = geral ? null : await condicaoSqlEscopoCongregacao(pool, visao, pedido, "t.CongregacaoOrigemId", "escOrig");
  const vazio = { itens: [], total: 0, pagina: pg, porPagina: pp };
  if (caixa === "chegando") {
    onde.push("t.Situacao = N'PENDENTE'");
    if (destCond === "") return vazio;
    if (destCond) onde.push(destCond);
  } else if (caixa === "saindo") {
    onde.push("t.Situacao = N'PENDENTE'");
    if (origCond === "") return vazio;
    if (origCond) onde.push(origCond);
  } else if (caixa === "paradas") {
    if (!geral) return { ...vazio, soGeral: true };
    onde.push(`t.Situacao = N'PENDENTE' AND t.PedidoEm < DATEADD(DAY, -${regras.DIAS_PARADO}, SYSUTCDATETIME())`);
  } else {
    onde.push(caixa === "concluidos" ? "t.Situacao <> N'PENDENTE' AND ISNULL(t.DecididoEm, t.CanceladoEm) >= DATEADD(DAY, -90, SYSUTCDATETIME())" : "t.Situacao = N'PENDENTE'");
    if (!geral) {
      const partes = [destCond, origCond].filter((c) => c);
      if (partes.length === 0) return vazio;
      onde.push(`(${partes.join(" OR ")})`);
    }
  }
  const where = onde.length ? ` WHERE ${onde.join(" AND ")}` : "";
  pedido.input("pular", sql.Int, (pg - 1) * pp).input("trazer", sql.Int, pp);
  const r = await pedido.query(`SELECT COUNT(*) AS total FROM TransferenciasCongregacao t${where};
    ${SELECT_TRANSFERENCIA}${where} ORDER BY t.PedidoEm DESC, t.TransferenciaId DESC OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY`);
  const agora = new Date();
  return { itens: (r.recordsets[1] || []).map((l) => mapear(l, agora)), total: (r.recordsets[0][0] || {}).total || 0, pagina: pg, porPagina: pp };
}

// Os pedidos de UMA pessoa (a própria pessoa vê os seus: Minha vida › a minha transferência).
async function daPessoa(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`${SELECT_TRANSFERENCIA} WHERE t.MembroId = @m ORDER BY t.PedidoEm DESC, t.TransferenciaId DESC`);
  const agora = new Date();
  return r.recordset.map((l) => mapear(l, agora));
}

// As congregações ativas para escolher o destino (nome e área; nada da pessoa).
async function congregacoesAtivas(pool) {
  const r = await pool.request().query(`SELECT c.CongregacaoId, c.Nome, a.Nome AS AreaNome FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId WHERE c.Ativa = 1 ORDER BY c.Nome`);
  return r.recordset.map((l) => ({ congregacaoId: l.CongregacaoId, nome: l.Nome, areaNome: l.AreaNome || null }));
}

// Os avisos (depois da gravação; uma falha aqui não desfaz a transferência). O destino tem um pedido para aceitar: as secretarias locais do destino (Lideranca
// com escopo da congregação e a permissão "pessoas"); recusado: quem pediu; concluído: a pessoa e quem pediu.
async function avisar(pool, criarNotificacao, evento, r) {
  try {
    if (evento === "PEDIDO_PENDENTE") {
      const dest = await pool.request().input("c", sql.Int, r.destinoId).query(`
        SELECT DISTINCT l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
        WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c AND (',' + p.Permissoes + ',') LIKE '%,pessoas,%'
          AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`);
      for (const d of dest.recordset) {
        await criarNotificacao(pool, { regraChave: "TRANSFERENCIA_PARA_ACEITAR", destinatarioMembroId: d.MembroId, titulo: `Transferência para ${r.destinoNome}`,
          mensagem: `${r.pessoaNome} vem de ${r.origemNome}. Aceite ou recuse em Membros › Transferência.`, categoria: "SECRETARIA",
          referenciaTabela: "TransferenciasCongregacao", referenciaId: r.transferenciaId });
      }
    } else if (evento === "RECUSADA" && r.pedidoPor) {
      await criarNotificacao(pool, { regraChave: "TRANSFERENCIA_RECUSADA", destinatarioMembroId: r.pedidoPor, titulo: `Transferência recusada por ${r.destinoNome}`,
        mensagem: `O pedido de ${r.pessoaNome} para ${r.destinoNome} foi recusado. Veja o motivo em Membros › Transferência.`, categoria: "SECRETARIA",
        referenciaTabela: "TransferenciasCongregacao", referenciaId: r.transferenciaId });
    } else if (evento === "CONCLUIDA") {
      const para = [...new Set([r.membroId, r.pedidoPor].filter((x) => x != null).map(Number))];
      for (const membroId of para) {
        await criarNotificacao(pool, { regraChave: "TRANSFERENCIA_CONCLUIDA", destinatarioMembroId: membroId, titulo: `Transferência para ${r.destinoNome} concluída`,
          mensagem: `${r.pessoaNome} passou para ${r.destinoNome}.`, categoria: "SECRETARIA", referenciaTabela: "TransferenciasCongregacao", referenciaId: r.transferenciaId });
      }
    }
  } catch (_) { /* o aviso é melhor-esforço: a transferência já está gravada */ }
}

module.exports = { lerPessoa, lerCongregacao, lerTransferencia, pedir, decidir, cancelar, listar, daPessoa, congregacoesAtivas, avisar, mapear };
