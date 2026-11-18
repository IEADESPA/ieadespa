// painelMembros (FASE 10, v10.1b passo 7a, 18/11/2026) — os números do PAINEL EXECUTIVO do módulo Membros (rodadas 9 e 10 da gestão de membros:
// "números no alto e 3 gráficos", o gráfico grande que cada um AJUSTA, os avisos do módulo). Tudo contado no banco, dentro do escopo de quem vê (a mesma
// condição da lista: shared/escopoRotas.condicaoSqlEscopoPessoa), numa ida só e sem o nome de ninguém:
//   - o rol de hoje por situação (em comunhão, congregados, sem comunhão) e os novos do mês (com a forma de entrada);
//   - o que falta no cadastro (CPF, nascimento, contato, departamento, sexo) — "cadastro completo" é ter os cinco;
//   - o recorte do gráfico grande (batizados no Espírito Santo, nas águas, com CPF, em comunhão, cadastro completo) agrupado por departamento,
//     congregação, sexo ou faixa de idade (GROUPING SETS: uma leitura só para os quatro agrupamentos);
//   - as entradas (data de admissão) e as saídas (data de saída) dos últimos 6 meses.
// O rol = quem não está DESLIGADO nem FALECIDO. A saída conta quem saiu (qualquer situação), pela congregação em que estava.

const FAIXAS = [
  { codigo: "1", nome: "Crianças (até 11)" },
  { codigo: "2", nome: "Adolescentes (12 a 17)" },
  { codigo: "3", nome: "Jovens (18 a 29)" },
  { codigo: "4", nome: "Adultos (30 a 59)" },
  { codigo: "5", nome: "60 anos ou mais" },
  { codigo: "6", nome: "Sem data de nascimento" }
];
const NOME_FAIXA = Object.fromEntries(FAIXAS.map((f) => [f.codigo, f.nome]));
const FORMAS = { BATISMO: "por batismo", CARTA_MUDANCA: "por carta", RECONCILIACAO: "por reconciliação", ACLAMACAO: "por aclamação" };
const RECORTES = ["es", "aguas", "cpf", "comunhao", "completo"];

const TEM_CONTATO = "(NULLIF(LTRIM(RTRIM(ISNULL(m.Email, N''))), N'') IS NOT NULL OR NULLIF(LTRIM(RTRIM(ISNULL(m.Telefone, N''))), N'') IS NOT NULL)";
const COMPLETO = `(m.Cpf IS NOT NULL AND m.DataNascimento IS NOT NULL AND m.DepartamentoId IS NOT NULL AND m.Sexo IN (N'M', N'F') AND ${TEM_CONTATO})`;
const IDADE = "(DATEDIFF(YEAR, m.DataNascimento, @hojePainel) - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, m.DataNascimento, @hojePainel), m.DataNascimento) > @hojePainel THEN 1 ELSE 0 END)";

// condEscopo: null = sem filtro (a Geral); texto = a condição SQL (com os parâmetros já postos no pedido). "" (escopo vazio) não chega aqui.
function montarConsulta(condEscopo) {
  const escopo = condEscopo ? ` AND ${condEscopo}` : "";
  const deRol = `FROM MembroReferencia m LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    LEFT JOIN Departamentos d ON d.DepartamentoId = m.DepartamentoId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE ISNULL(m.Status, N'ATIVO') NOT IN (N'DESLIGADO', N'FALECIDO')${escopo}`;
  const base = `SELECT ISNULL(d.Nome, N'Sem departamento') AS dep, ISNULL(c.Nome, N'Sem congregação') AS cong, m.CongregacaoId AS congId,
      CASE m.Sexo WHEN N'M' THEN N'Homens' WHEN N'F' THEN N'Mulheres' ELSE N'Sem sexo informado' END AS sexo,
      CASE WHEN m.DataNascimento IS NULL THEN N'6' WHEN ${IDADE} < 12 THEN N'1' WHEN ${IDADE} < 18 THEN N'2' WHEN ${IDADE} < 30 THEN N'3'
           WHEN ${IDADE} < 60 THEN N'4' ELSE N'5' END AS faixa,
      CASE WHEN EXISTS (SELECT 1 FROM MarcosMembro mm WHERE mm.MembroId = m.MembroId AND mm.Tipo = N'BATISMO_ESPIRITO_SANTO') THEN 1 ELSE 0 END AS es,
      CASE WHEN m.DataBatismo IS NOT NULL THEN 1 ELSE 0 END AS aguas,
      CASE WHEN m.Cpf IS NOT NULL THEN 1 ELSE 0 END AS cpf,
      CASE WHEN m.SituacaoMembro = N'EM_COMUNHAO' THEN 1 ELSE 0 END AS comunhao,
      CASE WHEN m.SituacaoMembro = N'CONGREGADO' THEN 1 ELSE 0 END AS congregado,
      CASE WHEN m.SituacaoMembro = N'SEM_COMUNHAO' THEN 1 ELSE 0 END AS semComunhao,
      CASE WHEN ${COMPLETO} THEN 1 ELSE 0 END AS completo,
      CASE WHEN ${TEM_CONTATO} THEN 1 ELSE 0 END AS contato,
      CASE WHEN m.DataNascimento IS NOT NULL THEN 1 ELSE 0 END AS nasc,
      CASE WHEN m.DepartamentoId IS NOT NULL THEN 1 ELSE 0 END AS depOk,
      CASE WHEN m.Sexo IN (N'M', N'F') THEN 1 ELSE 0 END AS sexoOk
    ${deRol}`;
  const somas = "COUNT(*) AS total, SUM(b.es) AS es, SUM(b.aguas) AS aguas, SUM(b.cpf) AS cpf, SUM(b.comunhao) AS comunhao, SUM(b.congregado) AS congregado, "
    + "SUM(b.semComunhao) AS semComunhao, SUM(b.completo) AS completo, SUM(b.contato) AS contato, SUM(b.nasc) AS nasc, SUM(b.depOk) AS depOk, SUM(b.sexoOk) AS sexoOk";
  // entradas e saídas: a mesma condição de escopo, sem o filtro do rol (quem saiu também conta)
  const deTodos = `FROM MembroReferencia m LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE 1 = 1${escopo}`;
  return `
    SELECT GROUPING(b.dep) AS gDep, GROUPING(b.cong) AS gCong, GROUPING(b.sexo) AS gSexo, GROUPING(b.faixa) AS gFaixa, b.dep, b.cong, b.congId, b.sexo, b.faixa, ${somas}
    FROM (${base}) b GROUP BY GROUPING SETS ((b.dep), (b.congId, b.cong), (b.sexo), (b.faixa), ());
    SELECT CONVERT(char(7), m.DataAdmissao, 120) AS mes, ISNULL(m.FormaAdmissao, N'') AS forma, COUNT(*) AS n ${deTodos}
      AND m.DataAdmissao >= @desdePainel AND m.DataAdmissao <= @hojePainel GROUP BY CONVERT(char(7), m.DataAdmissao, 120), m.FormaAdmissao;
    SELECT CONVERT(char(7), m.DataSaida, 120) AS mes, COUNT(*) AS n ${deTodos}
      AND m.DataSaida >= @desdePainel AND m.DataSaida <= @hojePainel GROUP BY CONVERT(char(7), m.DataSaida, 120);`;
}

// "2026-11-18" -> o primeiro dia do mês 5 meses antes ("2026-06-01") e a lista dos 6 meses ("2026-06" ... "2026-11")
function janelaSeisMeses(hoje) {
  const [a, m] = String(hoje).slice(0, 7).split("-").map(Number);
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return { desde: `${meses[0]}-01`, meses };
}

const num = (v) => Number(v) || 0;
function linhaGrupo(x, nome) {
  const o = { nome, total: num(x.total) };
  for (const r of RECORTES) o[r] = num(x[r]);
  return o;
}
// grupos grandes: os 12 maiores e o resto somado em "Outros" (o gráfico continua legível sem rolagem)
function limitar(lista, max = 12) {
  const ordenada = lista.slice().sort((a, b) => b.total - a.total || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  if (ordenada.length <= max) return ordenada;
  const resto = ordenada.slice(max - 1);
  const outros = { nome: `Outros (${resto.length})`, total: 0 };
  for (const r of RECORTES) outros[r] = 0;
  for (const x of resto) { outros.total += x.total; for (const r of RECORTES) outros[r] += x[r]; }
  return [...ordenada.slice(0, max - 1), outros];
}

function vazio(hoje) {
  const { meses } = janelaSeisMeses(hoje);
  return { total: 0, emComunhao: 0, congregados: 0, semComunhao: 0, semCpf: 0, semNascimento: 0, semContato: 0, semDepartamento: 0, semSexo: 0, completos: 0,
    batizadosEspirito: 0, batizadosAguas: 0, novosNoMes: 0, novosPorForma: [], mesAtual: meses[5],
    grupos: { departamento: [], congregacao: [], sexo: [], faixa: [] }, congregacoes: [], movimento: meses.map((mes) => ({ mes, entradas: 0, saidas: 0 })) };
}

function mapear(recordsets, hoje) {
  const r = vazio(hoje);
  const rs = recordsets || [];
  const grupos = rs[0] || [];
  const geral = grupos.find((x) => num(x.gDep) && num(x.gCong) && num(x.gSexo) && num(x.gFaixa)) || {};
  r.total = num(geral.total);
  r.emComunhao = num(geral.comunhao);
  r.congregados = num(geral.congregado);
  r.semComunhao = num(geral.semComunhao);
  r.semCpf = r.total - num(geral.cpf);
  r.semNascimento = r.total - num(geral.nasc);
  r.semContato = r.total - num(geral.contato);
  r.semDepartamento = r.total - num(geral.depOk);
  r.semSexo = r.total - num(geral.sexoOk);
  r.completos = num(geral.completo);
  r.batizadosEspirito = num(geral.es);
  r.batizadosAguas = num(geral.aguas);
  r.grupos.departamento = limitar(grupos.filter((x) => !num(x.gDep)).map((x) => linhaGrupo(x, x.dep)));
  const porCong = grupos.filter((x) => !num(x.gCong));
  r.grupos.congregacao = limitar(porCong.map((x) => linhaGrupo(x, x.cong)));
  // as congregações do escopo que têm gente no rol (para escolher uma no painel e na lista): todas, por nome
  r.congregacoes = porCong.filter((x) => x.congId != null).map((x) => ({ congregacaoId: num(x.congId), nome: x.cong, total: num(x.total) }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  r.grupos.sexo = grupos.filter((x) => !num(x.gSexo)).map((x) => linhaGrupo(x, x.sexo)).sort((a, b) => b.total - a.total);
  r.grupos.faixa = grupos.filter((x) => !num(x.gFaixa)).sort((a, b) => String(a.faixa).localeCompare(String(b.faixa))).map((x) => linhaGrupo(x, NOME_FAIXA[x.faixa] || "?"));
  const porMes = new Map(r.movimento.map((x) => [x.mes, x]));
  const formas = new Map();
  for (const x of rs[1] || []) {
    const alvo = porMes.get(x.mes);
    if (!alvo) continue;
    alvo.entradas += num(x.n);
    if (x.mes === r.mesAtual) {
      r.novosNoMes += num(x.n);
      const rot = FORMAS[x.forma] || "sem a forma de entrada";
      formas.set(rot, (formas.get(rot) || 0) + num(x.n));
    }
  }
  for (const x of rs[2] || []) { const alvo = porMes.get(x.mes); if (alvo) alvo.saidas += num(x.n); }
  r.novosPorForma = [...formas.entries()].map(([forma, n]) => ({ forma, n })).sort((a, b) => b.n - a.n);
  return r;
}

// Lê o painel. `pedido` já traz os parâmetros da condição de escopo (condicaoSqlEscopoPessoa); aqui entram @hojePainel e @desdePainel.
async function lerPainel(pedido, sql, condEscopo, hoje) {
  const { desde } = janelaSeisMeses(hoje);
  pedido.input("hojePainel", sql.Date, hoje).input("desdePainel", sql.Date, desde);
  const r = await pedido.query(montarConsulta(condEscopo));
  return mapear(r.recordsets, hoje);
}

module.exports = { FAIXAS, RECORTES, montarConsulta, janelaSeisMeses, mapear, vazio, limitar, lerPainel };
