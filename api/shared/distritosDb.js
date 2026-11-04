// shared/distritosDb.js — v9.3: Distrito e macroexpansão. O banco (migração 167); a regra pura está em distritos.js.
// Toda mudança é condicional (lida com UPDLOCK dentro da transação e gravada com WHERE no estado lido) e os decretos e intervenções passam um de cada vez (trava de
// aplicação): dois pedidos ao mesmo tempo, um só passa.
//
// `alcance` (montado por montarAlcance): { geral, presidente, nif, distritos:Set<DistritoId> } — o nível geral e o NIF (membro do Conselho Fiscal) veem todos os
// Distritos; quem tem acesso de escopo de Distrito (o Pastor Distrital, o Interventor, o Tesoureiro de Distrito), só o dele. O Distrito de cada pessoa vem do banco
// (Liderança vigente), nunca do bilhete: o acesso que terminou deixa de valer na hora.
const { sql } = require("./db");
const di = require("./distritos");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");
const { hojeBrasilia } = require("./dataBrasilia");
const { membrosSobDisciplina } = require("./disciplina");
const { lerReuniao, reunioesEncerradas } = require("./entidadesVinculadasDb");
const { ehPresidenteAtual } = require("./diretoria");

const NAO_EXISTE = { sucesso: false, naoExiste: true, mensagem: "Distrito não encontrado." };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = { sucesso: false, mensagem: "Isto mudou enquanto você olhava. Atualize a tela." };
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
const SO_PRESIDENTE = "Só o Pastor Presidente em exercício faz este ato (Regimento, Art. 126-L, I, e Art. 126-P, II).";
const PAPEL_PASTOR = "Pastor Distrital";
const PAPEL_INTERVENTOR = "Interventor Distrital";
const PAPEIS_RESERVADOS = [PAPEL_PASTOR, PAPEL_INTERVENTOR];
const VIGENTE = (l) => `(${l}.AtivoAte IS NULL OR ${l}.AtivoAte >= @h)`;

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
// Os decretos e as intervenções gravados um de cada vez (dentro da transação): o decreto e a intervenção do mesmo Distrito nunca se cruzam.
async function enfileirar(rq) {
  const r = await rq().query(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = N'ieadespa-distrito-ato', @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 20000; SELECT @r AS r`);
  return Number(r.recordset[0].r) >= 0;
}
const OCUPADO = { sucesso: false, mensagem: "Outro ato de Distrito está sendo gravado agora. Tente de novo em instantes." };

// ================================================================ alcance ================================================================
async function distritosDoMembro(pool, membroId, hoje) {
  const r = await pool.request().input("m", sql.Int, membroId).input("h", sql.Date, hoje).query(`
    SELECT DISTINCT l.EscopoId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
    WHERE l.MembroId = @m AND l.EscopoTipo = 'DISTRITO' AND l.EscopoId IS NOT NULL AND ${VIGENTE("l")}
      AND (',' + ISNULL(p.Permissoes, '') + ',') LIKE '%,distritos,%'`);
  return new Set(r.recordset.map((l) => Number(l.EscopoId)));
}
// O NIF (Regimento Art. 53): quem tem assento vigente no Conselho Fiscal.
async function ehDoNIF(pool, membroId, hoje) {
  const r = await pool.request().input("m", sql.Int, membroId).input("h", sql.Date, hoje).query(`
    SELECT TOP 1 1 AS ok FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE o.Sigla = N'CONSELHO_FISCAL' AND a.MembroId = @m AND a.DataFim IS NULL AND (a.DataTerminoPrevisao IS NULL OR a.DataTerminoPrevisao >= @h)`);
  return r.recordset.length > 0;
}
async function montarAlcance(pool, { membroId, geral, hoje = hojeBrasilia() }) {
  const [distritos, nif, presidente] = await Promise.all([distritosDoMembro(pool, membroId, hoje), ehDoNIF(pool, membroId, hoje), ehPresidenteAtual(pool, sql, membroId)]);
  return { geral: !!geral, nif, presidente, distritos };
}
const veTudo = (a) => !!a && (a.geral || a.nif);
const veDistrito = (a, id) => veTudo(a) || (!!a && a.distritos instanceof Set && a.distritos.has(Number(id)));
const ehDoDistrito = (a, id) => !!a && a.distritos instanceof Set && a.distritos.has(Number(id));

// ================================================================ leitura ================================================================
async function lerDistrito(rq, distritoId, { travar = false } = {}) {
  const r = await rq().input("d", sql.Int, distritoId).query(`SELECT DistritoId, Nome, Ativo FROM Distritos ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""} WHERE DistritoId = @d`);
  const l = r.recordset[0];
  return l ? { distritoId: l.DistritoId, nome: l.Nome, ativo: !!l.Ativo } : null;
}
const COLUNAS_PERIODO = `p.PeriodoId, p.DistritoId, p.Legado, CONVERT(varchar(10), p.AtivadoEm, 120) AS AtivadoEm, p.FinanceiroDesdeMes, p.AtivacaoSessaoId, p.Gatilho,
  p.Cidade, p.UF, p.Populacao, p.FontePopulacao, p.Fundamentacao, CONVERT(varchar(10), p.DesativadoEm, 120) AS DesativadoEm, p.FinanceiroAteMes,
  p.DesativacaoSessaoId, p.DesativacaoMotivo`;
function formaPeriodo(l) {
  return {
    periodoId: l.PeriodoId, legado: !!l.Legado, ativadoEm: l.AtivadoEm, financeiroDesdeMes: l.FinanceiroDesdeMes, ativacaoSessaoId: l.AtivacaoSessaoId,
    gatilho: l.Gatilho, gatilhoRotulo: l.Gatilho ? di.GATILHOS[l.Gatilho] : null, cidade: l.Cidade, uf: l.UF, populacao: l.Populacao == null ? null : Number(l.Populacao),
    fontePopulacao: l.FontePopulacao, fundamentacao: l.Fundamentacao, desativadoEm: l.DesativadoEm, financeiroAteMes: l.FinanceiroAteMes,
    desativacaoSessaoId: l.DesativacaoSessaoId, desativacaoMotivo: l.DesativacaoMotivo
  };
}
async function periodos(rq, distritoId, { travar = false } = {}) {
  const r = await rq().input("d", sql.Int, distritoId)
    .query(`SELECT ${COLUNAS_PERIODO} FROM DistritoPeriodos p ${travar ? "WITH (UPDLOCK, HOLDLOCK)" : ""} WHERE p.DistritoId = @d ORDER BY p.FinanceiroDesdeMes, p.PeriodoId`);
  return r.recordset.map(formaPeriodo);
}
const periodoAberto = (lista) => (lista || []).find((p) => !p.desativadoEm) || null;

// O território: Quadrantes → Regiões → Áreas → Congregações (o que o cadastro liga ao Distrito).
async function territorio(rq, distritoId) {
  const [qs, rs, cs] = await Promise.all([
    rq().input("d", sql.Int, distritoId).query(`SELECT QuadranteId, Nome FROM Quadrantes WHERE DistritoId = @d ORDER BY Nome`),
    rq().input("d", sql.Int, distritoId).query(`SELECT r.RegiaoId, r.Nome FROM Regioes r JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE q.DistritoId = @d ORDER BY r.Nome`),
    rq().input("d", sql.Int, distritoId).query(`
      SELECT c.CongregacaoId, c.Nome, c.Ativa, a.Nome AS Area, r.Nome AS Regiao, q.Nome AS Quadrante
      FROM Congregacoes c JOIN Areas a ON a.AreaId = c.AreaId JOIN Regioes r ON r.RegiaoId = a.RegiaoId JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId
      WHERE q.DistritoId = @d ORDER BY c.Nome`)
  ]);
  return {
    quadrantes: qs.recordset.map((l) => ({ quadranteId: l.QuadranteId, nome: l.Nome })),
    regioes: rs.recordset.map((l) => ({ regiaoId: l.RegiaoId, nome: l.Nome })),
    congregacoes: cs.recordset.map((l) => ({ congregacaoId: l.CongregacaoId, nome: l.Nome, ativa: !!l.Ativa, area: l.Area, regiao: l.Regiao, quadrante: l.Quadrante }))
  };
}

const { REPASSE_DO_DISTRITO, NOME_DO_DISTRITO_DO_REPASSE } = di;

// Quem ocupa hoje os papéis do Distrito (o Pastor Distrital e o Interventor) e o CDE calculado (Art. 126-L, II).
async function pessoasDoPapel(rq, papel, escopoTipo, escopoIds, hoje) {
  const ids = (escopoIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return [];
  const r = await rq().input("papel", sql.NVarChar(100), papel).input("tipo", sql.NVarChar(30), escopoTipo).input("h", sql.Date, hoje).query(`
    SELECT l.LiderancaId, l.MembroId, m.Nome, l.EscopoId, m.Email FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = @papel
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = @tipo AND l.EscopoId IN (${ids.join(",")}) AND ${VIGENTE("l")} ORDER BY m.Nome`);
  return r.recordset.map((l) => ({ liderancaId: l.LiderancaId, membroId: l.MembroId, nome: l.Nome, email: l.Email, escopoId: l.EscopoId, papel }));
}
async function composicaoCDE(rq, distritoId, hoje, terr) {
  const t = terr || (await territorio(rq, distritoId));
  const [pastor, interventor, vices, superintendentes] = await Promise.all([
    pessoasDoPapel(rq, PAPEL_PASTOR, "DISTRITO", [distritoId], hoje),
    pessoasDoPapel(rq, PAPEL_INTERVENTOR, "DISTRITO", [distritoId], hoje),
    pessoasDoPapel(rq, "Vice-Presidente de Quadrante", "QUADRANTE", t.quadrantes.map((q) => q.quadranteId), hoje),
    pessoasDoPapel(rq, "Superintendente Regional", "REGIAO", t.regioes.map((r) => r.regiaoId), hoje)
  ]);
  const semEmail = (l) => l.map(({ email, liderancaId, ...x }) => x);
  return { pastor: semEmail(pastor), interventor: semEmail(interventor), vices: semEmail(vices), superintendentes: semEmail(superintendentes) };
}

async function intervencoes(rq, distritoId) {
  const r = await rq().input("d", sql.Int, distritoId).query(`
    SELECT i.IntervencaoId, i.Motivo, i.Fundamentacao, i.InterventorMembroId, mi.Nome AS InterventorNome, i.MedidaBloqueioContas, i.MedidaProcuracao, i.MedidaJudicial,
           i.LiderancasDestituidas, CONVERT(varchar(10), i.DecretadaEm, 120) AS DecretadaEm, CONVERT(varchar(10), i.EncerradaEm, 120) AS EncerradaEm, i.Resultado
    FROM DistritoIntervencoes i JOIN MembroReferencia mi ON mi.MembroId = i.InterventorMembroId
    WHERE i.DistritoId = @d ORDER BY i.DecretadaEm DESC, i.IntervencaoId DESC`);
  return r.recordset.map((l) => ({
    intervencaoId: l.IntervencaoId, motivo: l.Motivo, motivoRotulo: di.MOTIVOS_INTERVENCAO[l.Motivo] || l.Motivo, fundamentacao: l.Fundamentacao,
    interventor: { membroId: l.InterventorMembroId, nome: l.InterventorNome },
    medidas: Object.entries({ bloqueioContas: l.MedidaBloqueioContas, procuracao: l.MedidaProcuracao, judicial: l.MedidaJudicial }).filter(([, v]) => !!v).map(([k]) => di.MEDIDAS[k]),
    liderancasDestituidas: Number(l.LiderancasDestituidas), decretadaEm: l.DecretadaEm, encerradaEm: l.EncerradaEm, resultado: l.Resultado, aberta: !l.EncerradaEm
  }));
}

async function balancos(rq, distritoId) {
  const r = await rq().input("d", sql.Int, distritoId).query(`
    SELECT b.BalancoId, b.Ano, b.Versao, b.Receitas, b.Despesas, b.SaldoFinal, b.Observacoes, b.Status, b.EnviadoPor, me.Nome AS EnviadoPorNome,
           CONVERT(varchar(10), b.EnviadoEm, 120) AS EnviadoEm, b.AnalisadoPor, ma.Nome AS AnalisadoPorNome, CONVERT(varchar(10), b.AnalisadoEm, 120) AS AnalisadoEm, b.MotivoDevolucao
    FROM DistritoBalancos b JOIN MembroReferencia me ON me.MembroId = b.EnviadoPor LEFT JOIN MembroReferencia ma ON ma.MembroId = b.AnalisadoPor
    WHERE b.DistritoId = @d ORDER BY b.Ano DESC, b.Versao DESC`);
  return r.recordset.map((l) => ({
    balancoId: l.BalancoId, ano: Number(l.Ano), versao: Number(l.Versao), receitas: Number(l.Receitas), despesas: Number(l.Despesas), saldoFinal: Number(l.SaldoFinal),
    observacoes: l.Observacoes, status: l.Status, statusRotulo: di.STATUS_BALANCO[l.Status] || l.Status, enviadoPor: l.EnviadoPor, enviadoPorNome: l.EnviadoPorNome,
    enviadoEm: l.EnviadoEm, analisadoPorNome: l.AnalisadoPorNome, analisadoEm: l.AnalisadoEm, motivoDevolucao: l.MotivoDevolucao
  }));
}

// ================================================================ finanças ================================================================
async function parametrosRepasse(rq) {
  const r = await rq().query(`SELECT PercentualDizimoInstitucional, DiasTolerancia FROM ParametrosRepasseInstitucional WHERE ParametroId = 1`);
  const l = r.recordset[0] || { PercentualDizimoInstitucional: 10, DiasTolerancia: 5 };
  return { percentual: Number(l.PercentualDizimoInstitucional), diasTolerancia: Number(l.DiasTolerancia) };
}
// Os meses do Distrito até o mês de hoje (os mais recentes primeiro), no máximo `limite`.
function mesesDosPeriodos(lista, hoje, limite = 24) {
  const mesHoje = di.mesDe(hoje);
  const todos = new Set();
  for (const p of lista || []) {
    const ate = p.financeiroAteMes ? di.mesAnterior(p.financeiroAteMes) : mesHoje;
    for (const m of di.mesesEntre(p.financeiroDesdeMes, ate < mesHoje ? ate : mesHoje)) todos.add(m);
  }
  return [...todos].sort().reverse().slice(0, limite);
}
// O mês a mês do Dízimo Institucional (os 24 meses mais recentes do Distrito).
async function posicaoFinanceira(rq, distritoId, { lista, terr, hoje, limite = 24 }) {
  const meses = mesesDosPeriodos(lista, hoje, limite);
  if (!meses.length) return { percentual: null, diasTolerancia: null, meses: [] };
  const param = await parametrosRepasse(rq);
  const todas = terr.congregacoes;
  const ativas = todas.filter((c) => c.ativa);
  const ids = todas.map((c) => Number(c.congregacaoId));
  const fechamentos = ids.length
    ? (await rq().query(`SELECT CongregacaoId, MesReferencia, TotalFinal FROM FechamentosTesouraria
         WHERE CongregacaoId IN (${ids.join(",")}) AND MesReferencia IN (${meses.map((m) => `'${m}'`).join(",")})`)).recordset
    : [];
  const repasses = (await rq().input("d", sql.Int, distritoId).query(`
    SELECT RepasseId, MesReferencia, ValorArrecadadoLiquido, ValorRepasse, Status, CONVERT(varchar(10), DataRepasse, 120) AS DataRepasse
    FROM RepassesInstitucionais WHERE OrigemTipo = N'DISTRITO' AND OrigemId = @d`)).recordset;
  const nomes = new Map(todas.map((c) => [Number(c.congregacaoId), c.nome]));
  return {
    percentual: param.percentual, diasTolerancia: param.diasTolerancia,
    meses: meses.map((mes) => {
      const doMes = fechamentos.filter((f) => f.MesReferencia === mes).map((f) => ({ congregacaoId: Number(f.CongregacaoId), totalFinal: Number(f.TotalFinal) }));
      const consideradas = ativas.concat(doMes.filter((f) => !ativas.some((c) => Number(c.congregacaoId) === f.congregacaoId))
        .map((f) => ({ congregacaoId: f.congregacaoId, nome: nomes.get(f.congregacaoId) || "" })));
      const rep = repasses.find((x) => x.MesReferencia === mes);
      return di.situacaoDoMes({
        mes, congregacoes: consideradas, fechamentos: doMes, percentual: param.percentual, diasTolerancia: param.diasTolerancia, hoje,
        repasse: rep ? { repasseId: rep.RepasseId, status: rep.Status, valorRepasse: Number(rep.ValorRepasse), valorArrecadadoLiquido: Number(rep.ValorArrecadadoLiquido), dataRepasse: rep.DataRepasse } : null
      });
    })
  };
}

// Para a tela de Repasses (GestaoRepassesInstitucionais): a arrecadação líquida consolidada do mês, calculada — nunca digitada. Recusa o mês fora de um período do
// Distrito e o mês com congregação ativa do território ainda sem fechamento (diz quais).
async function apuracaoParaRepasse(pool, distritoId, mes) {
  const rq = () => pool.request();
  const d = await lerDistrito(rq, distritoId);
  if (!d) return { erro: "Distrito não encontrado." };
  if (!di.ehMes(mes)) return { erro: "mesReferencia deve estar no formato AAAA-MM." };
  const lista = await periodos(rq, distritoId);
  if (!di.mesDoDistrito(mes, lista)) {
    return { erro: "Neste mês o Distrito não estava ativo por decreto da CLI: o repasse das congregações do território foi para a Sede (Rateio Geral)." };
  }
  const terr = await territorio(rq, distritoId);
  const ativas = terr.congregacoes.filter((c) => c.ativa);
  const ids = terr.congregacoes.map((c) => Number(c.congregacaoId));
  const fechamentos = ids.length
    ? (await pool.request().input("m", sql.Char(7), mes).query(`SELECT CongregacaoId, TotalFinal FROM FechamentosTesouraria WHERE MesReferencia = @m AND CongregacaoId IN (${ids.join(",")})`)).recordset
    : [];
  const fechadas = new Set(fechamentos.map((f) => Number(f.CongregacaoId)));
  const faltam = ativas.filter((c) => !fechadas.has(Number(c.congregacaoId)));
  if (faltam.length) {
    return { erro: `Ainda falta fechar o mês na Tesouraria Local de: ${faltam.map((c) => c.nome).join(", ")}. O Dízimo Institucional é calculado sobre todas as congregações do Distrito.` };
  }
  if (!fechamentos.length) return { erro: "Nenhuma congregação do território fechou este mês." };
  return { nome: d.nome, soma: di.round2(fechamentos.reduce((s, f) => s + Number(f.TotalFinal || 0), 0)) };
}

// ================================================================ listas e ficha ================================================================
async function listarDistritos(pool, { alcance, hoje = hojeBrasilia() }) {
  const r = await pool.request().input("h", sql.Date, hoje).query(`
    SELECT d.DistritoId, d.Nome, d.Ativo, p.Legado, CONVERT(varchar(10), p.AtivadoEm, 120) AS AtivadoEm,
           (SELECT COUNT(*) FROM Quadrantes q WHERE q.DistritoId = d.DistritoId) AS Quadrantes,
           (SELECT COUNT(*) FROM Congregacoes c JOIN Areas a ON a.AreaId = c.AreaId JOIN Regioes r ON r.RegiaoId = a.RegiaoId JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId
             WHERE q.DistritoId = d.DistritoId AND c.Ativa = 1) AS Congregacoes,
           (SELECT TOP 1 m.Nome FROM Lideranca l JOIN Papeis pp ON pp.PapelId = l.PapelId AND pp.Nome = N'Pastor Distrital' JOIN MembroReferencia m ON m.MembroId = l.MembroId
             WHERE l.EscopoTipo = 'DISTRITO' AND l.EscopoId = d.DistritoId AND ${VIGENTE("l")} ORDER BY l.LiderancaId DESC) AS Pastor,
           (SELECT COUNT(*) FROM DistritoIntervencoes i WHERE i.DistritoId = d.DistritoId AND i.EncerradaEm IS NULL) AS IntervencaoAberta
    FROM Distritos d LEFT JOIN DistritoPeriodos p ON p.DistritoId = d.DistritoId AND p.DesativadoEm IS NULL
    ORDER BY d.Ativo DESC, d.Nome`);
  return r.recordset.filter((l) => veDistrito(alcance, l.DistritoId)).map((l) => ({
    distritoId: l.DistritoId, nome: l.Nome, ativo: !!l.Ativo, legado: !!l.Legado, ativadoEm: l.AtivadoEm, quadrantes: Number(l.Quadrantes),
    congregacoes: Number(l.Congregacoes), pastor: l.Pastor || null, intervencaoAberta: Number(l.IntervencaoAberta) > 0
  }));
}

function acoesDaFicha(alcance, d, aberto, intervencaoAberta) {
  return {
    ativar: !!alcance.geral && (!d.ativo || !!(aberto && aberto.legado)),
    desativar: !!alcance.geral && d.ativo && !!aberto && !intervencaoAberta,
    intervir: !!alcance.presidente && d.ativo && !intervencaoAberta,
    encerrarIntervencao: !!alcance.presidente && !!intervencaoAberta,
    enviarBalanco: ehDoDistrito(alcance, d.distritoId),
    analisarBalanco: !!alcance.nif
  };
}

async function detalharDistrito(pool, { distritoId, alcance, hoje = hojeBrasilia() }) {
  if (!veDistrito(alcance, distritoId)) return null;
  const rq = () => pool.request();
  const d = await lerDistrito(rq, distritoId);
  if (!d) return null;
  const [lista, terr, ivs, bals] = await Promise.all([periodos(rq, distritoId), territorio(rq, distritoId), intervencoes(rq, distritoId), balancos(rq, distritoId)]);
  const aberto = periodoAberto(lista);
  const cde = await composicaoCDE(rq, distritoId, hoje, terr);
  const financeiro = await posicaoFinanceira(rq, distritoId, { lista, terr, hoje });
  const intervencaoAberta = ivs.find((i) => i.aberta) || null;
  const vencidos = financeiro.meses.filter((m) => m.vencido).map((m) => m.mes).sort();
  const atrasados = di.balancosAtrasados(lista, bals, hoje);
  return {
    distritoId: d.distritoId, nome: d.nome, ativo: d.ativo, periodoAberto: aberto, periodos: lista.slice().reverse(), territorio: terr, cde, intervencoes: ivs,
    balancos: bals, financeiro,
    anosParaBalanco: di.anosDoDistrito(lista, hoje).filter((ano) => !di.balancoVivo(bals, ano)),
    sinais: {
      semDecreto: !!(aberto && aberto.legado),
      semPastor: d.ativo && !cde.pastor.length && !intervencaoAberta,
      intervencaoSemInterventorComAcesso: !!intervencaoAberta && !cde.interventor.some((p) => Number(p.membroId) === Number(intervencaoAberta.interventor.membroId)),
      repasseVencido: vencidos, balancoAtrasado: atrasados
    },
    acoes: acoesDaFicha(alcance, d, aberto, intervencaoAberta)
  };
}

// ================================================================ decretos da CLI ================================================================
async function garantirCDE(rq, d) {
  try {
    await rq().input("ref", sql.Int, d.distritoId).input("nome", sql.NVarChar(200), `Conselho Distrital Eclesiástico — ${d.nome}`).query(`
      IF NOT EXISTS (SELECT 1 FROM OrgaosLocais WHERE Nivel = 5 AND ReferenciaId = @ref AND Sigla = N'CDE')
        INSERT INTO OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo) VALUES (N'CDE', @nome, 5, @ref, 1)`);
  } catch (e) {
    if (!violouUnicidade(e)) throw e;
  }
}

async function ativar(pool, { distritoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!alcance.geral) return PROIBIDO("O decreto da CLI é registrado pelo nível geral.");
  const v = di.validarAtivacao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const reuniao = await lerReuniao(pool, v.dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: "Escolha uma reunião da CLI já realizada e encerrada." };
  return emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq))) return OCUPADO;
    const d = await lerDistrito(rq, distritoId, { travar: true });
    if (!d) return NAO_EXISTE;
    const lista = await periodos(rq, distritoId, { travar: true });
    const aberto = periodoAberto(lista);
    if (aberto && !aberto.legado) return { sucesso: false, mensagem: "Este Distrito já está ativo por decreto da CLI." };
    const ultimoFim = lista.filter((p) => p.desativadoEm).map((p) => p.desativadoEm).sort().pop();
    if (ultimoFim && reuniao.data < ultimoFim) return { sucesso: false, mensagem: "A reunião da ativação não pode ser anterior à última desativação deste Distrito." };
    const terr = await territorio(rq, distritoId);
    const ativas = terr.congregacoes.filter((c) => c.ativa).length;
    // o Distrito que já estava ativo (legado) só ganha o decreto: o território dele se monta no cadastro a qualquer tempo
    if (!ativas && !aberto) {
      return { sucesso: false, mensagem: "O Distrito ainda não cobre nenhuma congregação ativa. Ligue no cadastro (Catálogos) os Quadrantes, as Regiões e as Áreas do território antes do decreto." };
    }
    const decreto = rq().input("s", sql.Int, reuniao.sessaoId).input("g", sql.NVarChar(12), v.dados.gatilho).input("cid", sql.NVarChar(150), v.dados.cidade)
      .input("uf", sql.Char(2), v.dados.uf).input("pop", sql.Int, v.dados.populacao).input("fonte", sql.NVarChar(200), v.dados.fontePopulacao)
      .input("fund", sql.NVarChar(2000), v.dados.fundamentacao).input("por", sql.Int, por);
    let periodoId;
    if (aberto) {
      // o período legado (ativo no cadastro antes da v9.3) ganha o decreto; o mês financeiro não muda
      const u = await decreto.input("p", sql.Int, aberto.periodoId).query(`
        UPDATE DistritoPeriodos SET Legado = 0, AtivacaoSessaoId = @s, Gatilho = @g, Cidade = @cid, UF = @uf, Populacao = @pop, FontePopulacao = @fonte,
               Fundamentacao = @fund, AtivacaoRegistradaPor = @por, AtivacaoRegistradaEm = SYSUTCDATETIME()
        WHERE PeriodoId = @p AND Legado = 1 AND DesativadoEm IS NULL`);
      if (!u.rowsAffected[0]) return MUDOU;
      periodoId = aberto.periodoId;
    } else {
      // o mês financeiro começa no mês do registro: o que a Sede já recebeu antes fica com ela
      try {
        const ins = await decreto.input("d", sql.Int, distritoId).input("em", sql.Date, reuniao.data).input("desde", sql.Char(7), di.mesDe(hoje)).query(`
          INSERT INTO DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes, AtivacaoSessaoId, Gatilho, Cidade, UF, Populacao, FontePopulacao, Fundamentacao, AtivacaoRegistradaPor)
          OUTPUT inserted.PeriodoId VALUES (@d, 0, @em, @desde, @s, @g, @cid, @uf, @pop, @fonte, @fund, @por)`);
        periodoId = ins.recordset[0].PeriodoId;
      } catch (e) {
        if (violouUnicidade(e)) return MUDOU;
        throw e;
      }
      const u = await rq().input("d", sql.Int, distritoId).query(`UPDATE Distritos SET Ativo = 1 WHERE DistritoId = @d AND Ativo = 0`);
      if (!u.rowsAffected[0]) return MUDOU;
    }
    await garantirCDE(rq, d);
    await registrarAuditoriaNaTransacao(t, { tabela: "Distritos", registroId: distritoId, acao: aberto ? "DISTRITO_DECRETO_REGISTRADO" : "DISTRITO_ATIVADO", usuarioId: por,
      dadosAntes: { ativo: d.ativo, legado: !!aberto }, dadosDepois: { ...v.dados, reuniao: reuniao.data, periodoId, congregacoesAtivas: ativas } });
    return {
      sucesso: true, periodoId,
      mensagem: aberto ? "Decreto da CLI registrado para o Distrito que já estava ativo."
        : `Distrito ativado por decreto da CLI, cobrindo ${ativas} congregação(ões). A partir deste mês o repasse delas vai para o Distrito. O Pastor Presidente dá o acesso de Pastor Distrital em Liderança.`
    };
  });
}

// Encerra o acesso das linhas de Liderança (AtivoAte = ontem), cancela as delegações delas e derruba as sessões das pessoas e dos delegados — na transação.
async function encerrarAcessos(rq, liderancaIds, { hoje, excetoMembroId = null }) {
  const ids = [...new Set((liderancaIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { membros: [], sessoes: [] };
  const fim = await rq().input("h", sql.Date, hoje).query(`
    UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, @h) OUTPUT inserted.MembroId
    WHERE LiderancaId IN (${ids.join(",")}) AND ${VIGENTE("Lideranca")}`);
  const membros = [...new Set(fim.recordset.map((l) => Number(l.MembroId)))];
  const deleg = await rq().query(`
    UPDATE DelegacoesAcesso SET Status = 'CANCELADA' OUTPUT inserted.DelegadoMembroId
    WHERE LiderancaId IN (${ids.join(",")}) AND Status = 'ATIVA'`);
  const alvos = [...new Set(membros.concat(deleg.recordset.map((l) => Number(l.DelegadoMembroId))))].filter((m) => m !== Number(excetoMembroId));
  let sessoes = [];
  if (alvos.length) {
    const s = await rq().query(`
      UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() OUTPUT inserted.SessaoId
      WHERE Encerrada = 0 AND CriadoEm >= DATEADD(HOUR, -14, SYSUTCDATETIME()) AND MembroId IN (${alvos.join(",")})`);
    sessoes = s.recordset.map((l) => l.SessaoId);
  }
  return { membros, sessoes };
}

async function desativar(pool, { distritoId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.geral) return PROIBIDO("O decreto da CLI é registrado pelo nível geral.");
  const v = di.validarDesativacao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const reuniao = await lerReuniao(pool, v.dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: "Escolha uma reunião da CLI já realizada e encerrada." };
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq))) return OCUPADO;
    const d = await lerDistrito(rq, distritoId, { travar: true });
    if (!d) return NAO_EXISTE;
    const aberto = periodoAberto(await periodos(rq, distritoId, { travar: true }));
    if (!d.ativo || !aberto) return { sucesso: false, mensagem: "Este Distrito não está ativo." };
    if (reuniao.data < aberto.ativadoEm) return { sucesso: false, mensagem: "A reunião da desativação não pode ser anterior à ativação do Distrito." };
    const iv = await rq().input("d", sql.Int, distritoId).query(`SELECT TOP 1 IntervencaoId FROM DistritoIntervencoes WITH (UPDLOCK) WHERE DistritoId = @d AND EncerradaEm IS NULL`);
    if (iv.recordset.length) return { sucesso: false, mensagem: "O Distrito está sob intervenção: o Pastor Presidente encerra a intervenção antes da desativação." };
    const u = await rq().input("p", sql.Int, aberto.periodoId).input("em", sql.Date, reuniao.data).input("ate", sql.Char(7), di.mesDe(hoje))
      .input("s", sql.Int, reuniao.sessaoId).input("mot", sql.NVarChar(2000), v.dados.motivo).input("por", sql.Int, por).query(`
      UPDATE DistritoPeriodos SET DesativadoEm = @em, FinanceiroAteMes = CASE WHEN @ate < FinanceiroDesdeMes THEN FinanceiroDesdeMes ELSE @ate END,
             DesativacaoSessaoId = @s, DesativacaoMotivo = @mot, DesativacaoRegistradaPor = @por
      WHERE PeriodoId = @p AND DesativadoEm IS NULL`);
    if (!u.rowsAffected[0]) return MUDOU;
    await rq().input("d", sql.Int, distritoId).query(`UPDATE Distritos SET Ativo = 0 WHERE DistritoId = @d`);
    // o acesso de toda a liderança de escopo do Distrito termina (o Distrito deixou de existir como nível ativo)
    const linhas = await rq().input("d", sql.Int, distritoId).input("h", sql.Date, hoje)
      .query(`SELECT LiderancaId FROM Lideranca WHERE EscopoTipo = 'DISTRITO' AND EscopoId = @d AND ${VIGENTE("Lideranca")}`);
    const enc = await encerrarAcessos(rq, linhas.recordset.map((l) => l.LiderancaId), { hoje, excetoMembroId: por });
    await registrarAuditoriaNaTransacao(t, { tabela: "Distritos", registroId: distritoId, acao: "DISTRITO_DESATIVADO", usuarioId: por,
      dadosAntes: { ativo: true, periodoId: aberto.periodoId }, dadosDepois: { ...v.dados, reuniao: reuniao.data, acessosEncerrados: enc.membros } });
    return { sucesso: true, acessos: enc.membros.length, sessoes: enc.sessoes };
  });
  if (!r.sucesso) return r;
  (deps.auth || require("./auth")).marcarRevogadas(r.sessoes);
  return { sucesso: true, mensagem: `Distrito desativado por decreto da CLI. A partir deste mês o repasse das congregações volta para a Sede.${r.acessos ? ` ${r.acessos} acesso(s) de escopo do Distrito encerrado(s).` : ""}`, acessosEncerrados: r.acessos };
}

// ================================================================ intervenção ================================================================
// A liderança distrital (o CDE, Art. 126-L, II): todo acesso de escopo do Distrito, os Vice-Presidentes dos Quadrantes e os Superintendentes das Regiões do território.
async function liderancaDistrital(rq, distritoId, hoje, terr) {
  const t = terr || (await territorio(rq, distritoId));
  const quad = t.quadrantes.map((q) => Number(q.quadranteId));
  const reg = t.regioes.map((r) => Number(r.regiaoId));
  const r = await rq().input("d", sql.Int, distritoId).input("h", sql.Date, hoje).query(`
    SELECT l.LiderancaId, l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
    WHERE ${VIGENTE("l")} AND ((l.EscopoTipo = 'DISTRITO' AND l.EscopoId = @d)
      ${quad.length ? `OR (p.Nome = N'Vice-Presidente de Quadrante' AND l.EscopoTipo = 'QUADRANTE' AND l.EscopoId IN (${quad.join(",")}))` : ""}
      ${reg.length ? `OR (p.Nome = N'Superintendente Regional' AND l.EscopoTipo = 'REGIAO' AND l.EscopoId IN (${reg.join(",")}))` : ""})`);
  return r.recordset.map((l) => ({ liderancaId: l.LiderancaId, membroId: Number(l.MembroId) }));
}

async function intervir(pool, { distritoId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.presidente) return PROIBIDO(SO_PRESIDENTE);
  const v = di.validarIntervencao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const sob = await membrosSobDisciplina(pool);
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq))) return OCUPADO;
    const d = await lerDistrito(rq, distritoId, { travar: true });
    if (!d) return NAO_EXISTE;
    if (!d.ativo) return { sucesso: false, mensagem: "A intervenção é num Distrito ativo." };
    const iv = await rq().input("d", sql.Int, distritoId).query(`SELECT TOP 1 IntervencaoId FROM DistritoIntervencoes WITH (UPDLOCK, HOLDLOCK) WHERE DistritoId = @d AND EncerradaEm IS NULL`);
    if (iv.recordset.length) return { sucesso: false, mensagem: "Já existe uma intervenção aberta neste Distrito." };
    const lideres = await liderancaDistrital(rq, distritoId, hoje);
    const m = (await rq().input("m", sql.Int, v.dados.interventorMembroId).query(`SELECT MembroId, Status, SituacaoMembro FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!m) return { sucesso: false, mensagem: "Matrícula do Interventor não encontrada." };
    if (m.Status !== "ATIVO" || m.SituacaoMembro === "SEM_COMUNHAO" || sob.has(m.MembroId)) return { sucesso: false, mensagem: "O Interventor precisa ser membro ativo e em comunhão, sem processo disciplinar em curso." };
    if (lideres.some((l) => l.membroId === Number(m.MembroId))) return { sucesso: false, mensagem: "O Interventor não pode ser alguém da liderança do Distrito que está sendo destituída." };
    const ins = await rq().input("d", sql.Int, distritoId).input("mot", sql.NVarChar(20), v.dados.motivo).input("fund", sql.NVarChar(4000), v.dados.fundamentacao)
      .input("i", sql.Int, v.dados.interventorMembroId).input("b", sql.Bit, v.dados.bloqueioContas).input("pr", sql.Bit, v.dados.procuracao).input("j", sql.Bit, v.dados.judicial)
      .input("n", sql.Int, lideres.length).input("em", sql.Date, hoje).input("por", sql.Int, por).query(`
      INSERT INTO DistritoIntervencoes (DistritoId, Motivo, Fundamentacao, InterventorMembroId, MedidaBloqueioContas, MedidaProcuracao, MedidaJudicial, LiderancasDestituidas, DecretadaEm, DecretadaPor)
      OUTPUT inserted.IntervencaoId VALUES (@d, @mot, @fund, @i, @b, @pr, @j, @n, @em, @por)`);
    const intervencaoId = ins.recordset[0].IntervencaoId;
    const enc = await encerrarAcessos(rq, lideres.map((l) => l.liderancaId), { hoje, excetoMembroId: por });
    await registrarAuditoriaNaTransacao(t, { tabela: "DistritoIntervencoes", registroId: intervencaoId, acao: "DISTRITO_INTERVENCAO", usuarioId: por,
      dadosDepois: { distritoId, ...v.dados, destituidos: enc.membros } });
    return { sucesso: true, intervencaoId, destituidos: enc.membros.length, sessoes: enc.sessoes };
  });
  if (!r.sucesso) return r;
  (deps.auth || require("./auth")).marcarRevogadas(r.sessoes);
  return {
    sucesso: true, intervencaoId: r.intervencaoId, destituidos: r.destituidos,
    mensagem: `Intervenção decretada: ${r.destituidos} acesso(s) da liderança do Distrito encerrado(s) e as sessões derrubadas. Agora dê ao Interventor o acesso "Interventor Distrital" em Liderança (só o Pastor Presidente pode). As medidas marcadas (contas, procuração, polícia ou Justiça) dependem de providência fora do sistema.`
  };
}

async function encerrarIntervencao(pool, { distritoId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.presidente) return PROIBIDO(SO_PRESIDENTE);
  const v = di.validarEncerramento(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq))) return OCUPADO;
    const d = await lerDistrito(rq, distritoId, { travar: true });
    if (!d) return NAO_EXISTE;
    const iv = (await rq().input("d", sql.Int, distritoId).query(`
      SELECT IntervencaoId, InterventorMembroId, CONVERT(varchar(10), DecretadaEm, 120) AS DecretadaEm FROM DistritoIntervencoes WITH (UPDLOCK)
      WHERE DistritoId = @d AND EncerradaEm IS NULL`)).recordset[0];
    if (!iv) return { sucesso: false, mensagem: "Não há intervenção aberta neste Distrito." };
    const u = await rq().input("i", sql.Int, iv.IntervencaoId).input("em", sql.Date, hoje).input("por", sql.Int, por).input("res", sql.NVarChar(2000), v.dados.resultado)
      .query(`UPDATE DistritoIntervencoes SET EncerradaEm = CASE WHEN @em < DecretadaEm THEN DecretadaEm ELSE @em END, EncerradaPor = @por, Resultado = @res
              WHERE IntervencaoId = @i AND EncerradaEm IS NULL`);
    if (!u.rowsAffected[0]) return MUDOU;
    // o acesso de Interventor Distrital deste Distrito termina com a intervenção
    const linhas = await pessoasDoPapel(rq, PAPEL_INTERVENTOR, "DISTRITO", [distritoId], hoje);
    const enc = await encerrarAcessos(rq, linhas.map((l) => l.liderancaId), { hoje, excetoMembroId: por });
    await registrarAuditoriaNaTransacao(t, { tabela: "DistritoIntervencoes", registroId: iv.IntervencaoId, acao: "DISTRITO_INTERVENCAO_ENCERRADA", usuarioId: por,
      dadosDepois: { distritoId, ...v.dados, acessosEncerrados: enc.membros } });
    return { sucesso: true, sessoes: enc.sessoes };
  });
  if (!r.sucesso) return r;
  (deps.auth || require("./auth")).marcarRevogadas(r.sessoes);
  return { sucesso: true, mensagem: "Intervenção encerrada. O acesso do Interventor terminou. O novo Pastor Distrital recebe o acesso em Liderança (só o Pastor Presidente pode)." };
}

// ================================================================ balanço anual ao NIF ================================================================
async function enviarBalanco(pool, { distritoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!ehDoDistrito(alcance, distritoId)) return PROIBIDO("O balanço é enviado por quem tem acesso de escopo do Distrito (o Pastor Distrital, o Tesoureiro de Distrito ou o Interventor).");
  const v = di.validarBalanco(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const d = await lerDistrito(rq, distritoId, { travar: true });
      if (!d) return NAO_EXISTE;
      const [lista, bals] = await Promise.all([periodos(rq, distritoId), balancos(rq, distritoId)]);
      const pode = di.podeEnviarBalanco({ ano: v.dados.ano, periodos: lista, balancos: bals, hoje });
      if (!pode.pode) return { sucesso: false, mensagem: pode.mensagem };
      const versao = bals.filter((b) => b.ano === v.dados.ano).reduce((mx, b) => Math.max(mx, b.versao), 0) + 1;
      const ins = await rq().input("d", sql.Int, distritoId).input("ano", sql.Int, v.dados.ano).input("ver", sql.Int, versao)
        .input("rec", sql.Decimal(14, 2), v.dados.receitas).input("desp", sql.Decimal(14, 2), v.dados.despesas).input("saldo", sql.Decimal(14, 2), v.dados.saldoFinal)
        .input("obs", sql.NVarChar(2000), v.dados.observacoes).input("por", sql.Int, por).query(`
        INSERT INTO DistritoBalancos (DistritoId, Ano, Versao, Receitas, Despesas, SaldoFinal, Observacoes, Status, EnviadoPor)
        OUTPUT inserted.BalancoId VALUES (@d, @ano, @ver, @rec, @desp, @saldo, @obs, N'ENVIADO', @por)`);
      const balancoId = ins.recordset[0].BalancoId;
      await registrarAuditoriaNaTransacao(t, { tabela: "DistritoBalancos", registroId: balancoId, acao: "DISTRITO_BALANCO_ENVIADO", usuarioId: por, dadosDepois: { distritoId, versao, ...v.dados } });
      return { sucesso: true, balancoId, mensagem: `Balanço de ${v.dados.ano} enviado ao NIF${versao > 1 ? ` (versão ${versao})` : ""}.` };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "O balanço deste ano acabou de ser enviado por outra pessoa. Atualize a tela." };
    throw e;
  }
}

async function analisarBalanco(pool, { balancoId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.nif) return PROIBIDO("O balanço é analisado pelo NIF (quem tem assento no Conselho Fiscal, Regimento Art. 53-D).");
  const v = di.validarAnalise(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await emTransacao(pool, async (t, rq) => {
    const b = (await rq().input("b", sql.Int, balancoId).query(`
      SELECT b.BalancoId, b.DistritoId, b.Ano, b.Status, b.EnviadoPor, d.Nome AS Distrito FROM DistritoBalancos b WITH (UPDLOCK) JOIN Distritos d ON d.DistritoId = b.DistritoId
      WHERE b.BalancoId = @b`)).recordset[0];
    if (!b) return { sucesso: false, naoExiste: true, mensagem: "Balanço não encontrado." };
    if (b.Status !== "ENVIADO") return { sucesso: false, mensagem: "Este balanço já foi analisado." };
    if (Number(b.EnviadoPor) === Number(por)) return { sucesso: false, mensagem: "Quem enviou o balanço não o analisa: outra pessoa do NIF precisa fazer a análise." };
    const aprovado = v.dados.decisao === "APROVAR";
    const u = await rq().input("b", sql.Int, balancoId).input("st", sql.NVarChar(10), aprovado ? "APROVADO" : "DEVOLVIDO").input("por", sql.Int, por)
      .input("mot", sql.NVarChar(2000), v.dados.motivo)
      .query(`UPDATE DistritoBalancos SET Status = @st, AnalisadoPor = @por, AnalisadoEm = SYSUTCDATETIME(), MotivoDevolucao = @mot WHERE BalancoId = @b AND Status = N'ENVIADO'`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "DistritoBalancos", registroId: balancoId, acao: aprovado ? "DISTRITO_BALANCO_APROVADO" : "DISTRITO_BALANCO_DEVOLVIDO", usuarioId: por,
      dadosAntes: { status: "ENVIADO" }, dadosDepois: v.dados });
    return { sucesso: true, aprovado, balanco: { distrito: b.Distrito, ano: Number(b.Ano), enviadoPor: b.EnviadoPor } };
  });
  if (!r.sucesso) return r;
  await avisarAnalise(pool, { ...r.balanco, aprovado: r.aprovado, motivo: v.dados.motivo, deps });
  return { sucesso: true, mensagem: r.aprovado ? "Balanço aprovado pelo NIF." : "Balanço devolvido ao Distrito com o motivo." };
}

// ================================================================ painel ================================================================
async function painel(pool, { alcance, hoje = hojeBrasilia() }) {
  const lista = await listarDistritos(pool, { alcance, hoje });
  const itens = [];
  for (const l of lista) {
    if (!l.ativo) {
      // inativo: só interessa se ainda deve balanço de ano em que esteve ativo
      const ficha = await detalharDistrito(pool, { distritoId: l.distritoId, alcance, hoje });
      if (ficha && ficha.sinais.balancoAtrasado.length) itens.push({ distritoId: l.distritoId, nome: l.nome, ativo: false, sinais: ficha.sinais, aguardandoNIF: [] });
      continue;
    }
    const ficha = await detalharDistrito(pool, { distritoId: l.distritoId, alcance, hoje });
    if (!ficha) continue;
    const aguardandoNIF = ficha.balancos.filter((b) => b.status === "ENVIADO").map((b) => ({ balancoId: b.balancoId, ano: b.ano, versao: b.versao }));
    itens.push({ distritoId: l.distritoId, nome: l.nome, ativo: l.ativo, pastor: l.pastor, intervencaoAberta: l.intervencaoAberta, sinais: ficha.sinais, aguardandoNIF });
  }
  return { hoje, distritos: itens, total: lista.length };
}

// ================================================================ Liderança: os papéis reservados ================================================================
// Chamado pela tela de Liderança (GestaoLideranca) antes de gravar. Dar, tirar ou trocar o papel "Pastor Distrital" ou "Interventor Distrital" é só do Pastor
// Presidente em exercício (Art. 126-L, I, e Art. 126-P, II); o Pastor Distrital é de um Distrito ativo, sem intervenção aberta e sem outro Pastor Distrital, e é
// Pastor, ativo, em comunhão, sem processo e com a credencial em dia; o Interventor Distrital é a pessoa da intervenção aberta daquele Distrito.
// `antes`: a linha atual da pessoa ({ PapelId, EscopoTipo, EscopoId, vigente }) ou null. `depois`: { papelId, escopoTipo, escopoId, vigente } ou null (remoção).
// Devolve a mensagem da recusa ou null.
// A linha de Liderança da pessoa vale hoje (mandato sem fim ou ainda não vencido)?
async function linhaVigente(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).input("h", sql.Date, hojeBrasilia())
    .query(`SELECT TOP 1 1 AS ok FROM Lideranca WHERE MembroId = @m AND ${VIGENTE("Lideranca")}`);
  return !!(r && r.recordset && r.recordset.length);
}
async function conferirPapelReservado(pool, { usuarioId, membroId, antes, depois, hoje = hojeBrasilia() }) {
  const nomes = await pool.request().query(`SELECT PapelId, Nome FROM Papeis WHERE Nome IN (N'${PAPEL_PASTOR}', N'${PAPEL_INTERVENTOR}')`);
  const nomeDe = new Map(nomes.recordset.map((l) => [Number(l.PapelId), l.Nome]));
  const papelAntes = antes && antes.vigente ? nomeDe.get(Number(antes.PapelId)) : null;
  const papelDepois = depois && depois.vigente !== false ? nomeDe.get(Number(depois.papelId)) : null;
  if (!papelAntes && !papelDepois) return null;
  const mesmo = papelAntes && papelDepois && papelAntes === papelDepois && antes.EscopoTipo === depois.escopoTipo && Number(antes.EscopoId) === Number(depois.escopoId);
  if (mesmo) return null;   // só a senha ou o mandato de quem já está no papel
  if (!(await ehPresidenteAtual(pool, sql, usuarioId))) return `Os papéis "${PAPEL_PASTOR}" e "${PAPEL_INTERVENTOR}" só são dados, trocados ou tirados pelo Pastor Presidente em exercício (Regimento, Art. 126-L, I, e Art. 126-P, II).`;
  if (!papelDepois) return null;
  if (depois.escopoTipo !== "DISTRITO") return `O papel "${papelDepois}" é dado com o escopo de um Distrito.`;
  const distritoId = Number(depois.escopoId);
  const d = await lerDistrito(() => pool.request(), distritoId);
  if (!d || !d.ativo) return `O papel "${papelDepois}" só vale em Distrito ativo por decreto da CLI.`;
  const ivAberta = (await pool.request().input("d", sql.Int, distritoId).query(`SELECT InterventorMembroId FROM DistritoIntervencoes WHERE DistritoId = @d AND EncerradaEm IS NULL`)).recordset[0];
  if (papelDepois === PAPEL_INTERVENTOR) {
    if (!ivAberta || Number(ivAberta.InterventorMembroId) !== Number(membroId)) return "O acesso de Interventor Distrital é só da pessoa nomeada na intervenção aberta deste Distrito (a intervenção é decretada na aba Distritos da Expansão).";
    return null;
  }
  if (ivAberta) return "O Distrito está sob intervenção: o novo Pastor Distrital é nomeado depois que o Pastor Presidente encerrar a intervenção.";
  const outro = (await pessoasDoPapel(() => pool.request(), PAPEL_PASTOR, "DISTRITO", [distritoId], hoje)).filter((p) => Number(p.membroId) !== Number(membroId));
  if (outro.length) return `O Distrito já tem Pastor Distrital (${outro[0].nome}). Tire o acesso dele antes de dar a outra pessoa.`;
  const habilitacao = require("./habilitacao");
  const p = (await habilitacao.situacaoMinisterial(pool, [membroId])).get(Number(membroId));
  if (!p) return "Matrícula não encontrada.";
  if (p.cargo !== "PASTOR") return "O Pastor Distrital precisa ter o cargo ministerial de Pastor.";
  const sob = await membrosSobDisciplina(pool);
  if (p.status !== "ATIVO" || p.situacaoMembro === "SEM_COMUNHAO" || p.excluido || p.foraDaComunhao || p.afastado || sob.has(Number(membroId))) {
    return "O Pastor Distrital precisa ser membro ativo e em comunhão, sem processo disciplinar e sem afastamento das funções.";
  }
  const { idsComCredencialEmDia } = require("./afmDb");
  if (!(await idsComCredencialEmDia(pool, [membroId])).has(Number(membroId))) return "O Pastor Distrital precisa estar com a credencial em dia (AFM, educação continuada e disciplina).";
  return null;
}

// ================================================================ avisos ================================================================
async function destinatariosGerais(pool) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  return resolverDestinatariosPorPermissao(pool, { permissao: "distritos", nivel: "GLOBAL" });
}
async function avisarAnalise(pool, { distrito, ano, enviadoPor, aprovado, motivo, deps = {} }) {
  try {
    const canaisDb = deps.canaisDb || require("./canaisDb");
    const m = (await pool.request().input("m", sql.Int, enviadoPor).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!m) return 0;
    await canaisDb.notificarAgora(pool, { regraChave: "DISTRITO_BALANCO_ANALISADO", destinatarios: [{ membroId: m.MembroId, nome: m.Nome, email: m.Email }],
      mensagem: di.textoBalancoAnalisado({ distrito, ano, aprovado, motivo }), referenciaTabela: "DistritoBalancos", aguardarEntrega: false, deps });
    return 1;
  } catch (e) {
    console.error("[DISTRITOS] falha ao avisar a análise do balanço:", e.message);
    return 0;
  }
}
// Quem recebe os sinais de um Distrito: o nível geral com a permissão e quem tem acesso de escopo dele.
async function destinatariosDoDistrito(pool, distritoId, hoje) {
  const vistos = new Set();
  const locais = (await pool.request().input("d", sql.Int, distritoId).input("h", sql.Date, hoje).query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = 'DISTRITO' AND l.EscopoId = @d AND ${VIGENTE("l")} AND (',' + ISNULL(p.Permissoes, '') + ',') LIKE '%,distritos,%'`)).recordset;
  return [...(await destinatariosGerais(pool)), ...locais].filter((x) => !vistos.has(Number(x.membroId)) && vistos.add(Number(x.membroId)))
    .map((x) => ({ membroId: x.membroId, nome: x.nome, email: x.email }));
}
// O Dízimo Institucional vencido: um aviso por Distrito e mês. A referência do aviso junta os dois num número só: (AAAAMM − 200000) × 10000 + Distrito
// (novembro de 2026 no Distrito 3 = 26110003), distinto enquanto houver menos de 10.000 Distritos.
const referenciaMes = (mes, distritoId) => (Number(mes.replace("-", "")) - 200000) * 10000 + Number(distritoId);
async function detectarRepasseVencido(pool, { hoje = hojeBrasilia() } = {}) {
  const ativos = (await pool.request().query(`SELECT DISTINCT DistritoId FROM DistritoPeriodos`)).recordset.map((l) => Number(l.DistritoId));
  const fatos = [];
  for (const distritoId of ativos) {
    const rq = () => pool.request();
    const d = await lerDistrito(rq, distritoId);
    if (!d) continue;
    const [lista, terr] = await Promise.all([periodos(rq, distritoId), territorio(rq, distritoId)]);
    const fin = await posicaoFinanceira(rq, distritoId, { lista, terr, hoje, limite: 6 });
    const vencidos = fin.meses.filter((m) => m.vencido).map((m) => m.mes).sort();
    if (!vencidos.length) continue;
    const destinatarios = await destinatariosDoDistrito(pool, distritoId, hoje);
    for (const mes of vencidos) {
      fatos.push({ referenciaId: referenciaMes(mes, distritoId), destinatarios, fatoGerador: di.textoRepasseVencido({ distrito: d.nome, meses: [mes] }) });
    }
  }
  return fatos;
}
async function detectarBalancoAtrasado(pool, { hoje = hojeBrasilia() } = {}) {
  const ids = (await pool.request().query(`SELECT DISTINCT DistritoId FROM DistritoPeriodos`)).recordset.map((l) => Number(l.DistritoId));
  const fatos = [];
  for (const distritoId of ids) {
    const rq = () => pool.request();
    const d = await lerDistrito(rq, distritoId);
    if (!d) continue;
    const atrasados = di.balancosAtrasados(await periodos(rq, distritoId), await balancos(rq, distritoId), hoje);
    if (!atrasados.length) continue;
    const destinatarios = await destinatariosDoDistrito(pool, distritoId, hoje);
    for (const ano of atrasados) fatos.push({ referenciaId: ano * 10000 + distritoId, destinatarios, fatoGerador: di.textoBalancoAtrasado({ distrito: d.nome, anos: [ano] }) });
  }
  return fatos;
}

// Meus Dados (LGPD Art. 18): os balanços que a pessoa enviou e as intervenções em que foi Interventor.
async function dadosDoTitular(pool, membroId) {
  const [bals, ivs] = await Promise.all([
    pool.request().input("m", sql.Int, membroId).query(`SELECT d.Nome AS Distrito, b.Ano, b.Versao, b.Status, CONVERT(varchar(10), b.EnviadoEm, 120) AS EnviadoEm
      FROM DistritoBalancos b JOIN Distritos d ON d.DistritoId = b.DistritoId WHERE b.EnviadoPor = @m ORDER BY b.EnviadoEm DESC`),
    pool.request().input("m", sql.Int, membroId).query(`SELECT d.Nome AS Distrito, CONVERT(varchar(10), i.DecretadaEm, 120) AS DecretadaEm, CONVERT(varchar(10), i.EncerradaEm, 120) AS EncerradaEm
      FROM DistritoIntervencoes i JOIN Distritos d ON d.DistritoId = i.DistritoId WHERE i.InterventorMembroId = @m ORDER BY i.DecretadaEm DESC`)
  ]);
  return {
    balancosEnviados: bals.recordset.map((l) => ({ distrito: l.Distrito, ano: Number(l.Ano), versao: Number(l.Versao), status: di.STATUS_BALANCO[l.Status] || l.Status, enviadoEm: iso(l.EnviadoEm) })),
    intervencoesComoInterventor: ivs.recordset.map((l) => ({ distrito: l.Distrito, decretadaEm: iso(l.DecretadaEm), encerradaEm: iso(l.EncerradaEm) }))
  };
}

module.exports = {
  PAPEL_PASTOR, PAPEL_INTERVENTOR, PAPEIS_RESERVADOS, REPASSE_DO_DISTRITO, NOME_DO_DISTRITO_DO_REPASSE,
  montarAlcance, listarDistritos, detalharDistrito, territorio, composicaoCDE, posicaoFinanceira, apuracaoParaRepasse, reunioesEncerradas,
  ativar, desativar, intervir, encerrarIntervencao, enviarBalanco, analisarBalanco, painel, conferirPapelReservado, linhaVigente,
  detectarRepasseVencido, detectarBalancoAtrasado, dadosDoTitular
};
