// shared/discipuladoDb.js (v8.5 — Trilha de discipulado) — o banco da trilha. A regra pura está em shared/discipulado.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// A trilha NÃO guarda "etapa concluída" própria: cada etapa lê de onde a informação já está (nada é lançado duas vezes) — o marco do perfil (MarcosMembro), a data do
// batismo nas águas (MembroReferencia.DataBatismo, que a esteira de batismo grava), a conclusão de uma trilha de formação (TrilhaMatriculas, v6.9) ou a primeira escala
// aceita ou confirmada, já realizada (EscalasAlocacoes). Quem conta: membro ativo (inclusive o congregado e o de licença).
const { sql } = require("./db");
const regra = require("./discipulado");
const { hojeBrasilia } = require("./dataBrasilia");
const { registrarAuditoria } = require("./auditoria");

// a requisição no pool ou na transação (a transação do mssql não tem .request() em todas as versões)
const rqDe = (c) => (typeof c.request === "function" ? c.request() : new sql.Request(c));
const STATUS_NA_TRILHA = `N'ATIVO', N'LICENÇA', N'LICENCA_CANDIDATURA'`;

// ---------------------------------------------------------------- catálogo
async function tiposMarco(conexao, { soAtivos = false } = {}) {
  const r = await rqDe(conexao).query(`SELECT Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema, Ativo FROM TiposMarco ${soAtivos ? "WHERE Ativo = 1" : ""} ORDER BY Nome`);
  return r.recordset.map((l) => ({ codigo: l.Codigo, nome: l.Nome, descricao: l.Descricao || null, unico: !!l.Unico, soNivelGeral: !!l.SoNivelGeral, sistema: !!l.Sistema, ativo: !!l.Ativo }));
}
async function tipoMarco(conexao, codigo) {
  const r = await rqDe(conexao).input("c", sql.NVarChar(30), String(codigo || "")).query(`SELECT Codigo, Nome, Unico, SoNivelGeral, Ativo FROM TiposMarco WHERE Codigo = @c`);
  const l = r.recordset[0];
  return l ? { codigo: l.Codigo, nome: l.Nome, unico: !!l.Unico, soNivelGeral: !!l.SoNivelGeral, ativo: !!l.Ativo } : null;
}

async function etapas(conexao, { soAtivas = true } = {}) {
  const r = await rqDe(conexao).query(`
    SELECT e.EtapaId, e.Chave, e.Nome, e.Descricao, e.Ordem, e.Fonte, e.TipoMarco, e.TrilhaId, t.Nome AS TrilhaNome, e.GeraAcompanhamento, e.Ativa
    FROM EtapasDiscipulado e LEFT JOIN Trilhas t ON t.TrilhaId = e.TrilhaId ${soAtivas ? "WHERE e.Ativa = 1" : ""} ORDER BY e.Ordem, e.EtapaId`);
  const pre = await rqDe(conexao).query(`SELECT EtapaId, PreRequisitoId FROM EtapasDiscipuladoPreRequisitos`);
  const preDe = new Map();
  for (const l of pre.recordset) preDe.set(l.EtapaId, [...(preDe.get(l.EtapaId) || []), l.PreRequisitoId]);
  return r.recordset.map((l) => ({
    etapaId: l.EtapaId, chave: l.Chave, nome: l.Nome, descricao: l.Descricao || null, ordem: l.Ordem, fonte: l.Fonte, fonteRotulo: regra.FONTES[l.Fonte] || l.Fonte,
    tipoMarco: l.TipoMarco || null, trilhaId: l.TrilhaId || null, trilhaNome: l.TrilhaNome || null, geraAcompanhamento: !!l.GeraAcompanhamento, ativa: !!l.Ativa,
    preRequisitos: preDe.get(l.EtapaId) || []
  }));
}

async function catalogo(pool) {
  const trilhas = await pool.request().query(`SELECT TrilhaId, Nome FROM Trilhas WHERE Ativa = 1 ORDER BY Nome`);
  return { etapas: await etapas(pool, { soAtivas: false }), tiposMarco: await tiposMarco(pool), fontes: regra.FONTES,
    trilhas: trilhas.recordset.map((l) => ({ trilhaId: l.TrilhaId, nome: l.Nome })), diasParado: regra.DIAS_PARADO_PADRAO };
}

async function salvarTipoMarco(pool, { tipo, por }) {
  const atual = await tipoMarco(pool, tipo.codigo);
  try {
    if (atual) {
      const sistema = (await pool.request().input("c", sql.NVarChar(30), tipo.codigo).query(`SELECT Sistema FROM TiposMarco WHERE Codigo = @c`)).recordset[0].Sistema;
      // o "só do nível geral" do batismo no Espírito Santo é a trava da escada (Art. 72, III, a): não se desliga pela tela
      if (sistema && tipo.codigo === "BATISMO_ESPIRITO_SANTO" && !tipo.soNivelGeral) return { sucesso: false, mensagem: "O batismo no Espírito Santo conta para a escada: continua só do nível geral." };
      await pool.request().input("c", sql.NVarChar(30), tipo.codigo).input("n", sql.NVarChar(80), tipo.nome).input("d", sql.NVarChar(300), tipo.descricao)
        .input("u", sql.Bit, tipo.unico).input("g", sql.Bit, tipo.soNivelGeral).input("a", sql.Bit, tipo.ativo).input("por", sql.Int, por)
        .query(`UPDATE TiposMarco SET Nome = @n, Descricao = @d, Unico = @u, SoNivelGeral = @g, Ativo = @a, AtualizadoEm = SYSUTCDATETIME(), AtualizadoPor = @por WHERE Codigo = @c`);
    } else {
      await pool.request().input("c", sql.NVarChar(30), tipo.codigo).input("n", sql.NVarChar(80), tipo.nome).input("d", sql.NVarChar(300), tipo.descricao)
        .input("u", sql.Bit, tipo.unico).input("g", sql.Bit, tipo.soNivelGeral).input("a", sql.Bit, tipo.ativo).input("por", sql.Int, por)
        .query(`INSERT INTO TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Ativo, AtualizadoPor) VALUES (@c, @n, @d, @u, @g, @a, @por)`);
    }
  } catch (e) {
    if (require("./violacaoUnica").violouUnicidade(e)) return { sucesso: false, mudou: true, mensagem: "Já existe um tipo de marco com esse nome ou esse código." };
    throw e;
  }
  await registrarAuditoria({ tabela: "TiposMarco", registroId: 0, acao: atual ? "TIPO_MARCO_ALTERADO" : "TIPO_MARCO_CRIADO", usuarioId: por, dadosAntes: atual, dadosDepois: tipo });
  return { sucesso: true, mensagem: atual ? "Tipo de marco salvo." : "Tipo de marco criado." };
}

async function salvarEtapa(pool, { etapa, por }) {
  const t = new sql.Transaction(pool);
  await t.begin();
  let etapaId = etapa.etapaId;
  try {
    const rq = () => rqDe(t);
    if (etapa.tipoMarco) {
      const tm = await tipoMarco(t, etapa.tipoMarco);
      if (!tm) { await t.rollback(); return { sucesso: false, mensagem: "Tipo de marco não encontrado." }; }
    }
    if (etapa.fonte === "TRILHA" && !(await rq().input("t", sql.Int, etapa.trilhaId).query(`SELECT 1 AS x FROM Trilhas WHERE TrilhaId = @t`)).recordset.length) {
      await t.rollback(); return { sucesso: false, mensagem: "Trilha de formação não encontrada." };
    }
    const outras = (await rq().query(`SELECT EtapaId FROM EtapasDiscipulado WITH (UPDLOCK, HOLDLOCK)`)).recordset.map((l) => l.EtapaId);
    if (etapa.preRequisitos.some((p) => !outras.includes(p))) { await t.rollback(); return { sucesso: false, mensagem: "Pré-requisito: etapa não encontrada." }; }
    const campos = (r) => r.input("ch", sql.NVarChar(30), etapa.chave).input("n", sql.NVarChar(80), etapa.nome).input("d", sql.NVarChar(300), etapa.descricao)
      .input("o", sql.Int, etapa.ordem).input("f", sql.NVarChar(20), etapa.fonte).input("tm", sql.NVarChar(30), etapa.tipoMarco).input("tr", sql.Int, etapa.trilhaId)
      .input("g", sql.Bit, etapa.geraAcompanhamento).input("a", sql.Bit, etapa.ativa).input("por", sql.Int, por);
    if (etapaId) {
      if (!outras.includes(etapaId)) { await t.rollback(); return { sucesso: false, naoExiste: true }; }
      await campos(rq().input("id", sql.Int, etapaId)).query(`UPDATE EtapasDiscipulado SET Chave = @ch, Nome = @n, Descricao = @d, Ordem = @o, Fonte = @f, TipoMarco = @tm, TrilhaId = @tr,
        GeraAcompanhamento = @g, Ativa = @a, AtualizadoEm = SYSUTCDATETIME(), AtualizadoPor = @por WHERE EtapaId = @id`);
      await rq().input("id", sql.Int, etapaId).query(`DELETE FROM EtapasDiscipuladoPreRequisitos WHERE EtapaId = @id`);
    } else {
      etapaId = (await campos(rq()).query(`INSERT INTO EtapasDiscipulado (Chave, Nome, Descricao, Ordem, Fonte, TipoMarco, TrilhaId, GeraAcompanhamento, Ativa, AtualizadoEm, AtualizadoPor)
        OUTPUT INSERTED.EtapaId VALUES (@ch, @n, @d, @o, @f, @tm, @tr, @g, @a, SYSUTCDATETIME(), @por)`)).recordset[0].EtapaId;
    }
    for (const p of etapa.preRequisitos) await rq().input("e", sql.Int, etapaId).input("p", sql.Int, p).query(`INSERT INTO EtapasDiscipuladoPreRequisitos (EtapaId, PreRequisitoId) VALUES (@e, @p)`);
    // pré-requisito em círculo (A pede B e B pede A) deixaria a trilha sem começo: recusa
    const pares = (await rq().query(`SELECT EtapaId, PreRequisitoId FROM EtapasDiscipuladoPreRequisitos`)).recordset;
    if (temCiclo(pares)) { await t.rollback(); return { sucesso: false, mensagem: "Esses pré-requisitos fazem um círculo (uma etapa acaba pedindo a si mesma)." }; }
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    if (require("./violacaoUnica").violouUnicidade(e)) return { sucesso: false, mudou: true, mensagem: "Já existe uma etapa com essa chave." };
    throw e;
  }
  await registrarAuditoria({ tabela: "EtapasDiscipulado", registroId: etapaId, acao: etapa.etapaId ? "ETAPA_DISCIPULADO_ALTERADA" : "ETAPA_DISCIPULADO_CRIADA", usuarioId: por, dadosDepois: etapa });
  return { sucesso: true, etapaId, mensagem: etapa.etapaId ? "Etapa salva." : "Etapa criada." };
}
function temCiclo(pares) {
  const filhos = new Map();
  for (const { EtapaId, PreRequisitoId } of pares) filhos.set(EtapaId, [...(filhos.get(EtapaId) || []), PreRequisitoId]);
  const estado = new Map();
  const visitar = (n) => {
    if (estado.get(n) === 1) return true;
    if (estado.get(n) === 2) return false;
    estado.set(n, 1);
    for (const f of filhos.get(n) || []) if (visitar(f)) return true;
    estado.set(n, 2);
    return false;
  };
  return [...filhos.keys()].some(visitar);
}

// ---------------------------------------------------------------- os fatos de cada etapa
// `populacao`: um pedaço de SQL que devolve MembroIds (a congregação, a pessoa), com os parâmetros já postos em `rq()`. Devolve Map membroId -> Map etapaId -> { data }.
async function fatos(rq, lista, populacao) {
  const porPessoa = new Map();
  const marcar = (membroId, etapaId, data) => {
    const id = Number(membroId);
    if (!porPessoa.has(id)) porPessoa.set(id, new Map());
    const atual = porPessoa.get(id).get(etapaId);
    const nova = regra.dataIso(data);
    // duas fontes para a mesma etapa (o curso pela trilha E pelo marco antigo): vale a primeira data
    if (!atual || (nova && (!atual.data || nova < atual.data))) porPessoa.get(id).set(etapaId, { data: nova });
  };
  // o marco vale para a etapa de marco e, se configurado, também para a etapa de trilha (o marco antigo não se perde quando a AFM liga a trilha)
  const marcos = lista.filter((e) => e.tipoMarco);
  if (marcos.length) {
    const r = await rq().query(`SELECT MembroId, Tipo, MIN(COALESCE(DataMarco, CAST(CriadoEm AS date))) AS Data FROM MarcosMembro
      WHERE MembroId IN (${populacao}) GROUP BY MembroId, Tipo`);
    for (const l of r.recordset) for (const e of marcos) if (e.tipoMarco === l.Tipo) marcar(l.MembroId, e.etapaId, l.Data);
  }
  const batismo = lista.filter((e) => e.fonte === "BATISMO_AGUAS");
  if (batismo.length) {
    const r = await rq().query(`SELECT MembroId, DataBatismo AS Data FROM MembroReferencia WHERE DataBatismo IS NOT NULL AND MembroId IN (${populacao})`);
    for (const l of r.recordset) for (const e of batismo) marcar(l.MembroId, e.etapaId, l.Data);
  }
  const trilhas = lista.filter((e) => e.fonte === "TRILHA" && e.trilhaId);
  if (trilhas.length) {
    const r = await rq().query(`SELECT MembroId, TrilhaId, MIN(ConcluidaEm) AS Data FROM TrilhaMatriculas WHERE Status = 'CONCLUIDA' AND MembroId IN (${populacao}) GROUP BY MembroId, TrilhaId`);
    for (const l of r.recordset) for (const e of trilhas) if (Number(e.trilhaId) === Number(l.TrilhaId)) marcar(l.MembroId, e.etapaId, l.Data);
  }
  const servico = lista.filter((e) => e.fonte === "SERVICO_VOLUNTARIO");
  if (servico.length) {
    const r = await rq().query(`SELECT a.MembroId, MIN(s.DataHora) AS Data FROM EscalasAlocacoes a JOIN EscalasServicos s ON s.ServicoId = a.ServicoId
      WHERE a.Status IN ('ACEITO', 'CONFIRMADO') AND s.Status <> 'CANCELADA' AND s.DataHora <= SYSUTCDATETIME() AND a.MembroId IN (${populacao}) GROUP BY a.MembroId`);
    for (const l of r.recordset) for (const e of servico) marcar(l.MembroId, e.etapaId, new Date(new Date(l.Data).getTime() - 3 * 60 * 60 * 1000));
  }
  return porPessoa;
}

// A caminhada de uma pessoa (perfil, Meu Painel, Meus Dados).
async function caminhadaDe(pool, membroId) {
  const lista = await etapas(pool);
  const f = await fatos(() => pool.request().input("m", sql.Int, Number(membroId)), lista, "SELECT @m");
  return regra.caminhada(lista, f.get(Number(membroId)) || new Map());
}

// As pessoas da trilha (ativas) de um conjunto de congregações, com a caminhada de cada uma.
async function pessoasDasCongregacoes(pool, congregacaoIds, lista) {
  const ids = [...new Set((congregacaoIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return [];
  const populacao = `SELECT MembroId FROM MembroReferencia WHERE Status IN (${STATUS_NA_TRILHA}) AND CongregacaoId IN (${ids.join(",")})`;
  const f = await fatos(() => pool.request(), lista, populacao);
  if (!f.size) return [];
  const quem = await pool.request().query(`SELECT m.MembroId, m.Nome, m.CongregacaoId, c.Nome AS Congregacao FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.MembroId IN (${populacao})`);
  return quem.recordset.filter((l) => f.has(Number(l.MembroId))).map((l) => ({
    membroId: Number(l.MembroId), nome: l.Nome, congregacaoId: l.CongregacaoId, congregacao: l.Congregacao, caminhada: regra.caminhada(lista, f.get(Number(l.MembroId)))
  }));
}

// O funil de cada congregação do território de quem vê. `noEscopo(nome)`: a congregação está no território?
async function funil(pool, { noEscopo, diasParado = regra.DIAS_PARADO_PADRAO, hojeIso = hojeBrasilia() }) {
  const congs = (await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes ORDER BY Nome`)).recordset.filter((c) => noEscopo(c.Nome));
  const lista = await etapas(pool);
  const pessoas = await pessoasDasCongregacoes(pool, congs.map((c) => c.CongregacaoId), lista);
  const porCong = new Map(congs.map((c) => [c.CongregacaoId, []]));
  for (const p of pessoas) if (porCong.has(p.congregacaoId)) porCong.get(p.congregacaoId).push(p);
  return {
    etapas: lista.map((e) => ({ etapaId: e.etapaId, nome: e.nome, ordem: e.ordem })), diasParado,
    congregacoes: congs.map((c) => ({ congregacaoId: c.CongregacaoId, nome: c.Nome, ...regra.funil(porCong.get(c.CongregacaoId), lista, { hojeIso, diasParado }) }))
      .filter((c) => c.iniciadas > 0),
    total: regra.funil(pessoas, lista, { hojeIso, diasParado })
  };
}

// Quem está parado antes de uma etapa, numa congregação (nomes: só para quem alcança a congregação — o handler confere).
async function parados(pool, { congregacaoId, etapaId, diasParado = regra.DIAS_PARADO_PADRAO, hojeIso = hojeBrasilia() }) {
  const lista = await etapas(pool);
  const pessoas = await pessoasDasCongregacoes(pool, [congregacaoId], lista);
  return pessoas.filter((p) => p.caminhada.proximo && p.caminhada.proximo.etapaId === Number(etapaId) && regra.estaParado(p.caminhada, hojeIso, diasParado))
    .map((p) => ({ membroId: p.membroId, nome: p.nome, ultimoPasso: p.caminhada.ultimoPasso, diasSemPasso: p.caminhada.ultimoPasso ? regra.diasEntre(p.caminhada.ultimoPasso, hojeIso) : null }))
    .sort((a, b) => (a.ultimoPasso || "") < (b.ultimoPasso || "") ? -1 : 1);
}

// ---------------------------------------------------------------- o próximo passo vira acompanhamento (rotina diária, dentro da do cuidado pastoral)
async function rotinaDiaria(pool, { agora = new Date() } = {}) {
  const cuidado = require("./cuidadoPastoralDb");
  const cp = require("./cuidadoPastoral");
  const hojeIso = hojeBrasilia(agora);
  const lista = await etapas(pool);
  const r = { fechados: 0, abertos: 0 };
  // 1) fecha o item de quem já deu o passo (a etapa do item está feita agora)
  const abertos = (await pool.request().query(`SELECT ItemId, MembroId, EtapaDiscipuladoId FROM CuidadoItens WHERE Tipo = N'DISCIPULADO' AND Status = N'ABERTO' AND EtapaDiscipuladoId IS NOT NULL`)).recordset;
  if (abertos.length) {
    const ids = [...new Set(abertos.map((a) => Number(a.MembroId)))];
    const f = await fatos(() => pool.request(), await etapas(pool, { soAtivas: false }), `SELECT MembroId FROM MembroReferencia WHERE MembroId IN (${ids.join(",")})`);
    for (const a of abertos) {
      const feita = f.get(Number(a.MembroId)) && f.get(Number(a.MembroId)).has(a.EtapaDiscipuladoId);
      if (!feita) continue;
      const t = new sql.Transaction(pool);
      await t.begin();
      try {
        const u = await new sql.Request(t).input("id", sql.Int, a.ItemId)
          .query(`UPDATE CuidadoItens SET Status = N'CONCLUIDO', Desfecho = N'PASSO_DADO', EncerradoEm = SYSUTCDATETIME() WHERE ItemId = @id AND Status = N'ABERTO'`);
        if (u.rowsAffected[0]) {
          await cuidado.inserirEvento(new sql.Request(t), { itemId: a.ItemId, tipo: "CONCLUIDO", membroId: null, observacao: "A pessoa deu o passo da trilha de discipulado." });
          r.fechados++;
        }
        await t.commit();
      } catch (e) { try { await t.rollback(); } catch (x) { /* já encerrada */ } throw e; }
    }
  }
  // 2) abre o item do próximo passo de quem andou nos últimos 180 dias (no máximo 20 por congregação por dia; nunca de novo para a mesma pessoa e etapa)
  const congs = (await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes`)).recordset;
  const pessoas = await pessoasDasCongregacoes(pool, congs.map((c) => c.CongregacaoId), lista);
  const ja = new Set((await pool.request().query(`SELECT MembroId, EtapaDiscipuladoId FROM CuidadoItens WHERE EtapaDiscipuladoId IS NOT NULL`)).recordset
    .map((l) => `${l.MembroId}:${l.EtapaDiscipuladoId}`));
  const abertoDoTipo = new Set((await pool.request().query(`SELECT MembroId FROM CuidadoItens WHERE Tipo = N'DISCIPULADO' AND Status = N'ABERTO'`)).recordset.map((l) => Number(l.MembroId)));
  const porCong = new Map();
  for (const p of pessoas) {
    if (!regra.deveAcompanhar(p.caminhada, hojeIso)) continue;
    if (abertoDoTipo.has(p.membroId) || ja.has(`${p.membroId}:${p.caminhada.proximo.etapaId}`)) continue;
    const l = porCong.get(p.congregacaoId) || [];
    l.push(p);
    porCong.set(p.congregacaoId, l);
  }
  const prazos = await cuidado.lerPrazos(pool);
  for (const [congregacaoId, lista0] of porCong) {
    // os passos mais recentes primeiro (quem acabou de andar é quem mais precisa do próximo empurrão)
    const escolhidos = lista0.sort((a, b) => (a.caminhada.ultimoPasso < b.caminhada.ultimoPasso ? 1 : -1)).slice(0, regra.MAX_NOVOS_POR_CONGREGACAO);
    const cong = await cuidado.congregacao(pool, congregacaoId);
    for (const p of escolhidos) {
      const texto = regra.textoDoAcompanhamento(p.caminhada);
      const destino = await cuidado.destinoDoItem(pool, { congregacaoId, membroId: p.membroId, agora });
      const prazoEm = cp.prazoInicial("DISCIPULADO", agora, prazos);
      const g = await cuidado.gravarItem(pool, { tipo: "DISCIPULADO", congregacaoId, membroId: p.membroId, motivo: texto.motivo, origem: "DISCIPULADO", deteccaoResumo: texto.resumo,
        prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, etapaDiscipuladoId: p.caminhada.proximo.etapaId });
      if (!g.itemId) continue;   // outra rotina abriu ao mesmo tempo (o índice único segura)
      r.abertos++;
      if (!destino.responsavel) await cuidado.avisarDestino(pool, { destino, g, membroId: p.membroId, congregacaoNome: cong && cong.Nome, prazoEm, agora, por: null });
    }
  }
  return r;
}

// Meus Dados: a caminhada da pessoa (o que é derivado — os marcos já saem como marcos).
async function dadosDoTitular(pool, membroId) {
  const c = await caminhadaDe(pool, membroId);
  return { etapas: c.etapas.map((e) => ({ etapa: e.nome, feita: e.feita, data: e.data, fonte: e.fonteRotulo })), proximoPasso: c.proximo ? c.proximo.nome : null };
}

module.exports = { tiposMarco, tipoMarco, etapas, catalogo, salvarTipoMarco, salvarEtapa, temCiclo, fatos, caminhadaDe, pessoasDasCongregacoes, funil, parados, rotinaDiaria, dadosDoTitular };
