// shared/educacaoContinuadaDb.js (v8.6 — Educação continuada) — o banco da reciclagem anual e do exame bienal da AFM. A regra pura está em shared/educacaoContinuada.js;
// o desenho, em docs/plano/fase-8-ministerial-afm.md. Quem registra é a AFM do nível geral (o handler confere); ninguém registra o próprio resultado.
const { sql } = require("./db");
const regra = require("./educacaoContinuada");
const { CARGOS_OFICIAIS } = require("./afm");
const { hojeBrasilia } = require("./dataBrasilia");
const { registrarAuditoria } = require("./auditoria");

const rqDe = (c) => (typeof c.request === "function" ? c.request() : new sql.Request(c));
const listaDeIds = (ids) => [...new Set((ids || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
const OFICIAIS_SQL = CARGOS_OFICIAIS.map((c) => `N'${c}'`).join(", ");
const iso = (v) => regra.dataIso(v);
const num = (v) => (v == null ? null : Number(v));

// O primeiro dia como oficial sem interrupção de cada pessoa (Map membroId -> "AAAA-MM-DD" | null): a promoção não zera (regra.inicioNoMinisterio).
async function iniciosNoMinisterio(conexao, ids) {
  const out = new Map();
  const lista = listaDeIds(ids);
  if (!lista.length) return out;
  const porId = new Map();
  const r = await rqDe(conexao).query(`SELECT MembroId, CONVERT(varchar(10), Desde, 120) AS Desde, CONVERT(varchar(10), Ate, 120) AS Ate FROM CargosMinisteriaisHistorico
    WHERE MembroId IN (${lista.join(",")}) AND Cargo IN (${OFICIAIS_SQL})`);
  for (const l of r.recordset) porId.set(Number(l.MembroId), [...(porId.get(Number(l.MembroId)) || []), { desde: l.Desde || null, ate: l.Ate || null }]);
  for (const id of lista) out.set(id, regra.inicioNoMinisterio(porId.get(id) || []));
  return out;
}

// ---------------------------------------------------------------- a situação (a regra única da Trava 8-A lê daqui)
// Map membroId -> situação ({ reciclagemPendente, sobObservacao, suspensoExame, devendoRepescagem, pendencias }). `conexao`: o pool ou a transação.
async function situacoes(conexao, membroIds, hojeIso = hojeBrasilia()) {
  const ids = listaDeIds(membroIds);
  const out = new Map();
  if (!ids.length) return out;
  const lista = ids.join(",");
  const pessoas = (await rqDe(conexao).query(`SELECT m.MembroId, m.Status, m.CargoMinisterial FROM MembroReferencia m WHERE m.MembroId IN (${lista})`)).recordset;
  const inicios = await iniciosNoMinisterio(conexao, ids);
  const ano = Number(String(hojeIso).slice(0, 4));
  const edicao = (await rqDe(conexao).input("a", sql.Int, ano - 1).query(`SELECT EdicaoId, Ano, CONVERT(varchar(10), DataRealizacao, 120) AS Data FROM AFMReciclagemEdicoes WHERE Ano = @a`)).recordset[0] || null;
  const resultados = new Map();
  if (edicao) {
    for (const l of (await rqDe(conexao).input("e", sql.Int, edicao.EdicaoId).query(`SELECT MembroId, Resultado FROM AFMReciclagemResultados WHERE EdicaoId = @e AND MembroId IN (${lista})`)).recordset) {
      resultados.set(Number(l.MembroId), { resultado: l.Resultado });
    }
  }
  // todos os resultados de exames já realizados: a sanção segue até uma aprovação (um bienal novo em que a pessoa não foi registrada não a apaga)
  const exames = new Map();
  const rx = await rqDe(conexao).input("h", sql.Date, hojeIso).query(`
    SELECT er.MembroId, e.ExameId, e.Tipo, CONVERT(varchar(10), e.DataExame, 120) AS Data, er.Resultado
    FROM AFMExameResultados er JOIN AFMExames e ON e.ExameId = er.ExameId
    WHERE e.DataExame <= @h AND er.MembroId IN (${lista})`);
  for (const l of rx.recordset) exames.set(Number(l.MembroId), [...(exames.get(Number(l.MembroId)) || []), { exameId: l.ExameId, tipo: l.Tipo, data: l.Data, resultado: l.Resultado }]);
  for (const p of pessoas) {
    const id = Number(p.MembroId);
    const ehObreiro = p.Status === "ATIVO" && CARGOS_OFICIAIS.includes(p.CargoMinisterial);
    out.set(id, regra.situacao({
      hojeIso, ehObreiro, obreiroDesde: inicios.get(id) || null, edicaoAnterior: edicao ? { ano: edicao.Ano, data: edicao.Data } : null, resultadoAnterior: resultados.get(id) || null,
      exames: exames.get(id) || []
    }));
  }
  return out;
}

// ---------------------------------------------------------------- o painel da AFM
async function obreirosAtivos(pool) {
  const r = await pool.request().query(`
    SELECT m.MembroId, m.Nome, m.CargoMinisterial, c.Nome AS Congregacao
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = N'ATIVO' AND m.CargoMinisterial IN (${OFICIAIS_SQL}) ORDER BY m.Nome`);
  const inicios = await iniciosNoMinisterio(pool, r.recordset.map((l) => l.MembroId));
  return r.recordset.map((l) => ({ membroId: Number(l.MembroId), nome: l.Nome, cargo: l.CargoMinisterial, congregacao: l.Congregacao || null, desde: inicios.get(Number(l.MembroId)) || null }));
}

// Quem o exame alcança (Art. 70 §3º: "todos os obreiros e membros da Câmara"): os obreiros e a composição da CLI.
async function obrigadosAoExame(pool) {
  const obreiros = await obreirosAtivos(pool);
  const porId = new Map(obreiros.map((o) => [o.membroId, { ...o, obreiro: true }]));
  const orgao = (await pool.request().query(`SELECT OrgaoId FROM Orgaos WHERE Sigla = N'CLI'`)).recordset[0];
  if (orgao) {
    const composicao = await require("./universo").composicaoCLI(pool, orgao.OrgaoId);
    const fora = listaDeIds(composicao.map((m) => m.membroId)).filter((id) => !porId.has(id));
    if (fora.length) {
      const r = await pool.request().query(`SELECT m.MembroId, m.Nome, c.Nome AS Congregacao FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
        WHERE m.MembroId IN (${fora.join(",")}) AND m.Status = N'ATIVO'`);
      for (const l of r.recordset) porId.set(Number(l.MembroId), { membroId: Number(l.MembroId), nome: l.Nome, cargo: null, congregacao: l.Congregacao || null, desde: null, obreiro: false });
    }
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function painel(pool, { hojeIso = hojeBrasilia() } = {}) {
  const edicoes = (await pool.request().query(`
    SELECT TOP 6 e.EdicaoId, e.Ano, CONVERT(varchar(10), e.DataRealizacao, 120) AS Data, e.CargaHoraria, e.FrequenciaMinimaPct, e.Observacao,
           (SELECT COUNT(*) FROM AFMReciclagemResultados r WHERE r.EdicaoId = e.EdicaoId AND r.Resultado = N'APROVADO') AS Aprovados,
           (SELECT COUNT(*) FROM AFMReciclagemResultados r WHERE r.EdicaoId = e.EdicaoId) AS Registrados
    FROM AFMReciclagemEdicoes e ORDER BY e.Ano DESC`)).recordset.map((l) => ({
    edicaoId: l.EdicaoId, ano: l.Ano, data: l.Data, cargaHoraria: Number(l.CargaHoraria), frequenciaMinimaPct: l.FrequenciaMinimaPct, observacao: l.Observacao || null,
    horasMinimas: regra.horasMinimas({ cargaHoraria: Number(l.CargaHoraria), frequenciaMinimaPct: l.FrequenciaMinimaPct }), aprovados: Number(l.Aprovados), registrados: Number(l.Registrados)
  }));
  const exames = (await pool.request().query(`
    SELECT TOP 12 e.ExameId, e.Tipo, CONVERT(varchar(10), e.DataExame, 120) AS Data, e.ExameOrigemId, e.Observacao,
           (SELECT COUNT(*) FROM AFMExameResultados r WHERE r.ExameId = e.ExameId) AS Registrados,
           (SELECT COUNT(*) FROM AFMExameResultados r WHERE r.ExameId = e.ExameId AND r.Resultado = N'APROVADO') AS Aprovados
    FROM AFMExames e ORDER BY e.DataExame DESC, e.ExameId DESC`)).recordset.map((l) => ({
    exameId: l.ExameId, tipo: l.Tipo, tipoRotulo: regra.TIPOS_EXAME[l.Tipo], data: l.Data, exameOrigemId: l.ExameOrigemId || null, observacao: l.Observacao || null,
    registrados: Number(l.Registrados), aprovados: Number(l.Aprovados)
  }));
  const obrigados = await obrigadosAoExame(pool);
  const sit = await situacoes(pool, obrigados.map((o) => o.membroId), hojeIso);
  // a edição DO ANO (se registrada): quem é obreiro desde antes dela e ainda não foi aprovado perde a renovação da credencial em 1º de janeiro
  const doAno = edicoes.find((e) => e.ano === Number(hojeIso.slice(0, 4))) || null;
  const aprovadosNoAno = doAno ? new Set((await pool.request().input("e", sql.Int, doAno.edicaoId).query(`SELECT MembroId FROM AFMReciclagemResultados WHERE EdicaoId = @e AND Resultado = N'APROVADO'`))
    .recordset.map((l) => Number(l.MembroId))) : new Set();
  return { edicoes, exames, edicaoDoAno: doAno ? { edicaoId: doAno.edicaoId, ano: doAno.ano, data: doAno.data } : null,
    pessoas: obrigados.map((o) => ({ ...o, situacao: sit.get(o.membroId) || null,
      semAprovacaoNoAno: !!(doAno && o.obreiro && (!o.desde || o.desde <= doAno.data) && !aprovadosNoAno.has(o.membroId)) })),
    resultados: regra.RESULTADOS_RECICLAGEM, resultadosExame: regra.RESULTADOS_EXAME };
}

// Os resultados de uma edição ou de um exame (o formulário da AFM).
async function resultadosDaEdicao(pool, edicaoId) {
  if (!(await pool.request().input("e", sql.Int, Number(edicaoId)).query(`SELECT 1 AS x FROM AFMReciclagemEdicoes WHERE EdicaoId = @e`)).recordset.length) return null;
  const r = await pool.request().input("e", sql.Int, Number(edicaoId)).query(`SELECT MembroId, HorasPresentes, Resultado FROM AFMReciclagemResultados WHERE EdicaoId = @e`);
  return r.recordset.map((l) => ({ membroId: Number(l.MembroId), horasPresentes: num(l.HorasPresentes), resultado: l.Resultado }));
}
async function resultadosDoExame(pool, exameId) {
  if (!(await pool.request().input("e", sql.Int, Number(exameId)).query(`SELECT 1 AS x FROM AFMExames WHERE ExameId = @e`)).recordset.length) return null;
  const r = await pool.request().input("e", sql.Int, Number(exameId)).query(`SELECT MembroId, Resultado, Justificativa FROM AFMExameResultados WHERE ExameId = @e`);
  return r.recordset.map((l) => ({ membroId: Number(l.MembroId), resultado: l.Resultado, justificativa: l.Justificativa || null }));
}

// ---------------------------------------------------------------- o que a AFM registra
async function salvarEdicao(pool, { edicao, por }) {
  const atual = (await pool.request().input("a", sql.Int, edicao.ano).query(`SELECT EdicaoId, CONVERT(varchar(10), DataRealizacao, 120) AS Data, CargaHoraria, FrequenciaMinimaPct, Observacao
    FROM AFMReciclagemEdicoes WHERE Ano = @a`)).recordset[0];
  let edicaoId = atual ? atual.EdicaoId : null;
  if (atual) {
    // mudar a carga ou a frequência não pode deixar um "aprovado" abaixo do novo mínimo (nem horas acima da nova carga): corrija os resultados antes
    const minimo = regra.horasMinimas(edicao);
    const fora = (await pool.request().input("e", sql.Int, atual.EdicaoId).input("min", sql.Decimal(6, 2), minimo).input("c", sql.Decimal(5, 1), edicao.cargaHoraria).query(`
      SELECT COUNT(*) AS n FROM AFMReciclagemResultados WHERE EdicaoId = @e AND ((Resultado = N'APROVADO' AND HorasPresentes < @min) OR HorasPresentes > @c)`)).recordset[0].n;
    if (Number(fora)) return { sucesso: false, mudou: true, mensagem: `Com essa carga e essa frequência, ${Number(fora)} resultado(s) já lançado(s) ficariam fora da regra (aprovado abaixo de ${minimo} h ou horas acima da carga). Corrija esses resultados primeiro.` };
  }
  try {
    if (atual) {
      await pool.request().input("id", sql.Int, atual.EdicaoId).input("d", sql.Date, edicao.data).input("c", sql.Decimal(5, 1), edicao.cargaHoraria).input("f", sql.Int, edicao.frequenciaMinimaPct)
        .input("o", sql.NVarChar(300), edicao.observacao).input("por", sql.Int, por)
        .query(`UPDATE AFMReciclagemEdicoes SET DataRealizacao = @d, CargaHoraria = @c, FrequenciaMinimaPct = @f, Observacao = @o, AtualizadaPor = @por, AtualizadaEm = SYSUTCDATETIME() WHERE EdicaoId = @id`);
    } else {
      edicaoId = (await pool.request().input("a", sql.Int, edicao.ano).input("d", sql.Date, edicao.data).input("c", sql.Decimal(5, 1), edicao.cargaHoraria).input("f", sql.Int, edicao.frequenciaMinimaPct)
        .input("o", sql.NVarChar(300), edicao.observacao).input("por", sql.Int, por)
        .query(`INSERT INTO AFMReciclagemEdicoes (Ano, DataRealizacao, CargaHoraria, FrequenciaMinimaPct, Observacao, CriadaPor) OUTPUT INSERTED.EdicaoId VALUES (@a, @d, @c, @f, @o, @por)`)).recordset[0].EdicaoId;
    }
  } catch (e) {
    if (require("./violacaoUnica").violouUnicidade(e)) return { sucesso: false, mudou: true, mensagem: "A edição deste ano acabou de ser registrada por outra pessoa. Atualize a tela." };
    throw e;
  }
  await registrarAuditoria({ tabela: "AFMReciclagemEdicoes", registroId: edicaoId, acao: atual ? "AFM_RECICLAGEM_EDICAO_ALTERADA" : "AFM_RECICLAGEM_EDICAO_CRIADA", usuarioId: por,
    dadosAntes: atual ? { data: atual.Data, cargaHoraria: Number(atual.CargaHoraria), frequenciaMinimaPct: atual.FrequenciaMinimaPct, observacao: atual.Observacao || null } : null, dadosDepois: edicao });
  return { sucesso: true, mensagem: atual ? `Reciclagem de ${edicao.ano} atualizada.` : `Reciclagem de ${edicao.ano} registrada. Agora lance a frequência e o resultado de cada obreiro.` };
}

// Os resultados de vários obreiros numa edição (um a um: o que falhar não leva os outros). Ninguém registra o próprio.
async function registrarResultadosReciclagem(pool, { edicaoId, itens, por, hojeIso = hojeBrasilia() }) {
  const e = (await pool.request().input("e", sql.Int, Number(edicaoId)).query(`SELECT EdicaoId, Ano, CONVERT(varchar(10), DataRealizacao, 120) AS Data, CargaHoraria, FrequenciaMinimaPct FROM AFMReciclagemEdicoes WHERE EdicaoId = @e`)).recordset[0];
  if (!e) return { sucesso: false, naoExiste: true };
  if (e.Data > hojeIso) return { sucesso: false, mensagem: "Esta reciclagem ainda não aconteceu: o resultado se lança depois dela." };
  const edicao = { cargaHoraria: Number(e.CargaHoraria), frequenciaMinimaPct: e.FrequenciaMinimaPct };
  const resultados = [];
  for (const item of itens) {
    const membroId = Number(item && item.membroId);
    if (!Number.isInteger(membroId) || membroId <= 0 || membroId > 2147483647) { resultados.push({ membroId: null, sucesso: false, mensagem: "Matrícula inválida." }); continue; }
    if (membroId === Number(por)) { resultados.push({ membroId, sucesso: false, mensagem: "Ninguém registra o próprio resultado." }); continue; }
    const v = regra.validarResultadoReciclagem(item, edicao);
    if (!v.valido) { resultados.push({ membroId, sucesso: false, mensagem: v.mensagem }); continue; }
    const existe = (await pool.request().input("m", sql.Int, membroId).query(`SELECT 1 AS x FROM MembroReferencia WHERE MembroId = @m`)).recordset.length;
    if (!existe) { resultados.push({ membroId, sucesso: false, mensagem: "Matrícula não encontrada." }); continue; }
    const antes = (await pool.request().input("e", sql.Int, e.EdicaoId).input("m", sql.Int, membroId).query(`SELECT Resultado, HorasPresentes FROM AFMReciclagemResultados WHERE EdicaoId = @e AND MembroId = @m`)).recordset[0] || null;
    await pool.request().input("e", sql.Int, e.EdicaoId).input("m", sql.Int, membroId).input("h", sql.Decimal(5, 1), v.resultado.horasPresentes).input("r", sql.NVarChar(12), v.resultado.resultado).input("por", sql.Int, por)
      .query(`MERGE AFMReciclagemResultados WITH (HOLDLOCK) AS t USING (SELECT @e AS EdicaoId, @m AS MembroId) AS s ON t.EdicaoId = s.EdicaoId AND t.MembroId = s.MembroId
              WHEN MATCHED THEN UPDATE SET HorasPresentes = @h, Resultado = @r, RegistradoPor = @por, RegistradoEm = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (EdicaoId, MembroId, HorasPresentes, Resultado, RegistradoPor) VALUES (@e, @m, @h, @r, @por);`);
    await registrarAuditoria({ tabela: "AFMReciclagemResultados", registroId: membroId, acao: "AFM_RECICLAGEM_RESULTADO", usuarioId: por,
      dadosAntes: antes ? { resultado: antes.Resultado, horas: num(antes.HorasPresentes) } : null, dadosDepois: { ano: e.Ano, ...v.resultado } });
    resultados.push({ membroId, sucesso: true });
  }
  const ok = resultados.filter((x) => x.sucesso).length;
  return { sucesso: ok > 0, resultados, mensagem: ok === resultados.length ? `${ok} resultado(s) registrado(s).` : `${ok} de ${resultados.length} registrado(s). Veja os que não passaram.` };
}

async function salvarExame(pool, { exame, por }) {
  const t = new sql.Transaction(pool);
  await t.begin();
  let exameId;
  try {
    if (exame.tipo === "BIENAL") {
      const doAno = (await rqDe(t).input("a", sql.Int, Number(exame.data.slice(0, 4))).query(`SELECT TOP 1 ExameId FROM AFMExames WITH (UPDLOCK, HOLDLOCK) WHERE Tipo = N'BIENAL' AND YEAR(DataExame) = @a`)).recordset[0];
      if (doAno) { await t.rollback(); return { sucesso: false, mudou: true, mensagem: "Já existe o exame bienal deste ano: registre uma repescagem dele." }; }
    } else {
      const origem = (await rqDe(t).input("o", sql.Int, exame.exameOrigemId).query(`SELECT Tipo, CONVERT(varchar(10), DataExame, 120) AS Data FROM AFMExames WHERE ExameId = @o`)).recordset[0];
      if (!origem || origem.Tipo !== "BIENAL") { await t.rollback(); return { sucesso: false, mensagem: "A repescagem é de um exame bienal: escolha qual." }; }
      if (exame.data <= origem.Data) { await t.rollback(); return { sucesso: false, mensagem: "A repescagem é depois do exame bienal." }; }
    }
    exameId = (await rqDe(t).input("t", sql.NVarChar(12), exame.tipo).input("d", sql.Date, exame.data).input("o", sql.Int, exame.exameOrigemId).input("ob", sql.NVarChar(300), exame.observacao)
      .input("por", sql.Int, por).query(`INSERT INTO AFMExames (Tipo, DataExame, ExameOrigemId, Observacao, CriadoPor) OUTPUT INSERTED.ExameId VALUES (@t, @d, @o, @ob, @por)`)).recordset[0].ExameId;
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    if (require("./violacaoUnica").violouUnicidade(e)) return { sucesso: false, mudou: true, mensagem: "Já existe um exame bienal nesta data." };
    throw e;
  }
  await registrarAuditoria({ tabela: "AFMExames", registroId: exameId, acao: "AFM_EXAME_CRIADO", usuarioId: por, dadosDepois: exame });
  return { sucesso: true, exameId, mensagem: `${regra.TIPOS_EXAME[exame.tipo]} registrado(a). Agora lance o resultado de cada pessoa.` };
}

async function registrarResultadosExame(pool, { exameId, itens, por, hojeIso = hojeBrasilia() }) {
  const e = (await pool.request().input("e", sql.Int, Number(exameId)).query(`SELECT ExameId, Tipo, CONVERT(varchar(10), DataExame, 120) AS Data FROM AFMExames WHERE ExameId = @e`)).recordset[0];
  if (!e) return { sucesso: false, naoExiste: true };
  if (e.Data > hojeIso) return { sucesso: false, mensagem: "Este exame ainda não aconteceu: o resultado se lança depois dele." };
  const resultados = [];
  for (const item of itens) {
    const membroId = Number(item && item.membroId);
    if (!Number.isInteger(membroId) || membroId <= 0 || membroId > 2147483647) { resultados.push({ membroId: null, sucesso: false, mensagem: "Matrícula inválida." }); continue; }
    if (membroId === Number(por)) { resultados.push({ membroId, sucesso: false, mensagem: "Ninguém registra o próprio resultado." }); continue; }
    const v = regra.validarResultadoExame(item);
    if (!v.valido) { resultados.push({ membroId, sucesso: false, mensagem: v.mensagem }); continue; }
    const existe = (await pool.request().input("m", sql.Int, membroId).query(`SELECT 1 AS x FROM MembroReferencia WHERE MembroId = @m`)).recordset.length;
    if (!existe) { resultados.push({ membroId, sucesso: false, mensagem: "Matrícula não encontrada." }); continue; }
    const antes = (await pool.request().input("e", sql.Int, e.ExameId).input("m", sql.Int, membroId).query(`SELECT Resultado FROM AFMExameResultados WHERE ExameId = @e AND MembroId = @m`)).recordset[0] || null;
    await pool.request().input("e", sql.Int, e.ExameId).input("m", sql.Int, membroId).input("r", sql.NVarChar(20), v.resultado.resultado).input("j", sql.NVarChar(300), v.resultado.justificativa).input("por", sql.Int, por)
      .query(`MERGE AFMExameResultados WITH (HOLDLOCK) AS t USING (SELECT @e AS ExameId, @m AS MembroId) AS s ON t.ExameId = s.ExameId AND t.MembroId = s.MembroId
              WHEN MATCHED THEN UPDATE SET Resultado = @r, Justificativa = @j, RegistradoPor = @por, RegistradoEm = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (ExameId, MembroId, Resultado, Justificativa, RegistradoPor) VALUES (@e, @m, @r, @j, @por);`);
    // a auditoria guarda o resultado, não o texto da justificativa (pode citar saúde)
    await registrarAuditoria({ tabela: "AFMExameResultados", registroId: membroId, acao: "AFM_EXAME_RESULTADO", usuarioId: por,
      dadosAntes: antes ? { resultado: antes.Resultado } : null, dadosDepois: { exameId: e.ExameId, tipo: e.Tipo, resultado: v.resultado.resultado } });
    resultados.push({ membroId, sucesso: true });
  }
  const ok = resultados.filter((x) => x.sucesso).length;
  return { sucesso: ok > 0, resultados, mensagem: ok === resultados.length ? `${ok} resultado(s) registrado(s).` : `${ok} de ${resultados.length} registrado(s). Veja os que não passaram.` };
}

// ---------------------------------------------------------------- o histórico de formação (o perfil, a minha, Meus Dados)
async function historicoDe(pool, membroId, { hojeIso = hojeBrasilia(), comJustificativa = false } = {}) {
  const id = Number(membroId);
  const rec = (await pool.request().input("m", sql.Int, id).query(`
    SELECT e.Ano, CONVERT(varchar(10), e.DataRealizacao, 120) AS Data, e.CargaHoraria, r.HorasPresentes, r.Resultado
    FROM AFMReciclagemResultados r JOIN AFMReciclagemEdicoes e ON e.EdicaoId = r.EdicaoId WHERE r.MembroId = @m ORDER BY e.Ano DESC`)).recordset;
  const ex = (await pool.request().input("m", sql.Int, id).query(`
    SELECT e.Tipo, CONVERT(varchar(10), e.DataExame, 120) AS Data, r.Resultado, r.Justificativa
    FROM AFMExameResultados r JOIN AFMExames e ON e.ExameId = r.ExameId WHERE r.MembroId = @m ORDER BY e.DataExame DESC`)).recordset;
  // as trilhas de formação concluídas (v6.9), com o código do certificado verificável
  const tr = (await pool.request().input("m", sql.Int, id).query(`
    SELECT t.Nome AS Trilha, CONVERT(varchar(10), tm.ConcluidaEm, 120) AS ConcluidaEm, CONVERT(varchar(10), tm.ValidoAte, 120) AS ValidoAte, c.CodigoVerificacao, c.RevogadoEm
    FROM TrilhaMatriculas tm JOIN Trilhas t ON t.TrilhaId = tm.TrilhaId
    LEFT JOIN CertificadosEmitidos c ON c.TrilhaMatriculaId = tm.MatriculaId
    WHERE tm.MembroId = @m AND tm.Status = 'CONCLUIDA' ORDER BY tm.ConcluidaEm DESC`)).recordset;
  const certs = require("./certificados");
  const m = (await pool.request().input("m", sql.Int, id).query(`SELECT Status, CargoMinisterial FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
  return {
    obreiro: !!(m && m.Status === "ATIVO" && CARGOS_OFICIAIS.includes(m.CargoMinisterial)),   // a tela só mostra o bloco a quem a educação continuada diz respeito
    situacao: (await situacoes(pool, [id], hojeIso)).get(id) || null,
    reciclagens: rec.map((l) => ({ ano: l.Ano, data: l.Data, cargaHoraria: Number(l.CargaHoraria), horasPresentes: num(l.HorasPresentes), resultado: l.Resultado, resultadoRotulo: regra.RESULTADOS_RECICLAGEM[l.Resultado] })),
    exames: ex.map((l) => ({ tipo: l.Tipo, tipoRotulo: regra.TIPOS_EXAME[l.Tipo], data: l.Data, resultado: l.Resultado, resultadoRotulo: regra.RESULTADOS_EXAME[l.Resultado],
      justificativa: comJustificativa ? l.Justificativa || null : undefined })),
    trilhas: tr.map((l) => ({ trilha: l.Trilha, concluidaEm: l.ConcluidaEm, validoAte: l.ValidoAte || null,
      codigo: l.CodigoVerificacao && !l.RevogadoEm ? certs.formatarCodigo(l.CodigoVerificacao) : null }))
  };
}

// ---------------------------------------------------------------- os avisos (motor de notificações)
async function contatos(pool, ids) {
  const lista = listaDeIds(ids);
  if (!lista.length) return new Map();
  const r = await pool.request().query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId IN (${lista.join(",")})`);
  return new Map(r.recordset.map((l) => [Number(l.MembroId), { membroId: Number(l.MembroId), nome: l.Nome, email: l.Email || null }]));
}

// AFM_RECICLAGEM_PENDENTE — de outubro a dezembro, o obreiro sem a reciclagem DO ANO aprovada (se a edição do ano já foi registrada), uma vez por mês; e a AFM do nível
// geral recebe a lista (quantos faltam), também uma vez por mês.
async function detectarReciclagemPendente(pool, { hojeIso = hojeBrasilia() } = {}) {
  if (!regra.mesDoAlerta(hojeIso)) return [];
  const ano = Number(hojeIso.slice(0, 4));
  const ed = (await pool.request().input("a", sql.Int, ano).query(`SELECT EdicaoId, CONVERT(varchar(10), DataRealizacao, 120) AS Data FROM AFMReciclagemEdicoes WHERE Ano = @a`)).recordset[0];
  if (!ed) return [];
  const obreiros = (await obreirosAtivos(pool)).filter((o) => !o.desde || o.desde <= ed.Data);
  const aprovados = new Set((await pool.request().input("e", sql.Int, ed.EdicaoId).query(`SELECT MembroId FROM AFMReciclagemResultados WHERE EdicaoId = @e AND Resultado = N'APROVADO'`)).recordset.map((l) => Number(l.MembroId)));
  const pendentes = obreiros.filter((o) => !aprovados.has(o.membroId));
  if (!pendentes.length) return [];
  const ref = ano * 100 + Number(hojeIso.slice(5, 7));
  const c = await contatos(pool, pendentes.map((o) => o.membroId));
  const fatos = pendentes.filter((o) => c.has(o.membroId)).map((o) => ({ referenciaId: ref, destinatarios: [c.get(o.membroId)],
    fatoGerador: `Sua Reciclagem e Prática Pastoral de ${ano} ainda não está aprovada. Sem ela, a credencial de obreiro não é renovada em 1º de janeiro de ${ano + 1} e você fica sem licença para oficiar até a reposição (Regimento, Art. 68 §3º).` }));
  const gerais = await require("./notificacoes").resolverDestinatariosPorPermissao(pool, { permissao: "afm", nivel: "GLOBAL" });
  if (gerais.length) fatos.push({ referenciaId: -ref, destinatarios: gerais, fatoGerador: `Reciclagem de ${ano}: ${pendentes.length} obreiro(s) ainda sem aprovação registrada. Sem ela, a credencial não é renovada em 1º de janeiro (Regimento, Art. 68 §3º).` });
  return fatos;
}

// AFM_EXAME_PENDENTE — quem está sob observação, suspenso das funções ou devendo a repescagem (de qualquer exame ainda não resolvido): uma vez por mês, até a aprovação.
async function detectarExamePendente(pool, { hojeIso = hojeBrasilia() } = {}) {
  const ids = (await pool.request().input("h", sql.Date, hojeIso).query(`SELECT DISTINCT r.MembroId FROM AFMExameResultados r JOIN AFMExames e ON e.ExameId = r.ExameId
    WHERE e.DataExame <= @h AND r.Resultado <> N'APROVADO'`)).recordset.map((l) => Number(l.MembroId));
  if (!ids.length) return [];
  const sit = await situacoes(pool, ids, hojeIso);
  const c = await contatos(pool, ids);
  const ref = Number(hojeIso.slice(0, 4)) * 100 + Number(hojeIso.slice(5, 7));
  return ids.filter((id) => c.has(id) && sit.get(id) && (sit.get(id).sobObservacao || sit.get(id).suspensoExame || sit.get(id).devendoRepescagem)).map((id) => ({
    referenciaId: ref, destinatarios: [c.get(id)], fatoGerador: `${sit.get(id).pendencias.find((p) => /exame/.test(p)) || "Exame bienal pendente."} Procure a AFM para a repescagem.`
  }));
}

// LGPD — a justificativa de ausência no exame pode citar saúde: o texto sai 2 anos depois do exame (o resultado fica — sustenta a situação) e, na exclusão LGPD, na
// hora. O CHECK pede um texto na ausência justificada: fica a marca de que foi apagado.
const MARCA_APAGADA = "[apagada — LGPD]";
// Prazo ajustável em Proteção de Dados → Políticas de retenção.
const POLITICA_JUSTIFICATIVA_EXAME = { categoria: "AFM — justificativa de ausência no exame", padrao: 730 };
async function aplicarRetencao(conexao, { membroId = null, hoje = hojeBrasilia() } = {}) {
  const rq = rqDe(conexao).input("marca", sql.NVarChar(300), MARCA_APAGADA);
  if (membroId) rq.input("m", sql.Int, Number(membroId));
  else {
    const pool = typeof conexao.request === "function" ? conexao : conexao.pool || conexao;
    rq.input("d", sql.Int, await require("./politicasRetencao").diasDaPolitica(pool, POLITICA_JUSTIFICATIVA_EXAME.categoria, POLITICA_JUSTIFICATIVA_EXAME.padrao)).input("hoje", sql.Date, hoje);
  }
  const r = await rq.query(`UPDATE r SET Justificativa = @marca FROM AFMExameResultados r JOIN AFMExames e ON e.ExameId = r.ExameId
    WHERE r.Justificativa IS NOT NULL AND r.Justificativa <> @marca AND ${membroId ? "r.MembroId = @m" : "e.DataExame < DATEADD(DAY, -@d, @hoje)"}`);
  return { justificativasApagadas: (r.rowsAffected && r.rowsAffected[0]) || 0 };
}

// Meus Dados
async function dadosDoTitular(pool, membroId) {
  const h = await historicoDe(pool, membroId, { comJustificativa: true });
  return { reciclagens: h.reciclagens, exames: h.exames, pendencias: h.situacao ? h.situacao.pendencias : [] };
}

module.exports = { situacoes, obreirosAtivos, obrigadosAoExame, painel, resultadosDaEdicao, resultadosDoExame, salvarEdicao, registrarResultadosReciclagem, salvarExame,
  registrarResultadosExame, historicoDe, detectarReciclagemPendente, detectarExamePendente, dadosDoTitular, aplicarRetencao, iniciosNoMinisterio, MARCA_APAGADA,
  POLITICA_JUSTIFICATIVA_EXAME };
