// shared/pscApuracao.js (v7.1 — PSC: apuração assistida)
//
// O PSC pergunta coisas que o sistema JÁ sabe (balancete do mês fechado,
// repasse feito, lição da EBD aberta, batismos do ano). Em vez de obrigar a
// pessoa a conferir tudo à mão, a abertura da avaliação preenche, em cada
// alínea ligada a uma fonte (PscCriterios.FonteAutomatica), uma SUGESTÃO:
//   CONFERE      os dados do sistema sustentam o critério;
//   NAO_CONFERE  os dados do sistema apontam falha (o texto traz os números);
//   SEM_DADOS    o sistema não tem o que conferir (ou o exercício mal começou).
//
// Sugestão NUNCA é resposta: não muda `Situacao`, não conta para a escada, e
// quem avalia decide (o sistema não enxerga qualidade de nota fiscal, nem que
// o feriado justificava a lição que faltou). Por isso o texto sempre diz o que
// o sistema viu e o que ele NÃO consegue ver.
//
// Lógica pura (interpretar*) separada da leitura do banco (apurar*).
const { sql } = require("./db");
const { hojeBrasilia } = require("./dataBrasilia");

const FONTES = ["REPASSES", "PRESTACAO_CONTAS", "EBD_LICOES", "EBD_DIARIO", "BATISMOS"];
const PERCENTUAL_MINIMO_BATISMO = 10; // Art. 128 §5º, III, a

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Meses (YYYY-MM) do exercício cujo fechamento e repasse já são EXIGÍVEIS em `hoje`.
// O fechamento da tesouraria e a prestação de contas de um mês acontecem no mês
// SEGUINTE, então um mês só entra na conta depois do fim do seguinte — senão a
// sugestão ficaria vermelha todo começo de mês para uma congregação em dia.
function mesesExigiveis(ano, hoje) {
  const dois = (n) => String(n).padStart(2, "0");
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const anoFolga = m === 12 ? ano + 1 : ano;
    const mesFolga = m === 12 ? 1 : m + 1;
    const fimDaFolga = `${anoFolga}-${dois(mesFolga)}-${dois(ultimoDiaDoMes(anoFolga, mesFolga))}`;
    if (fimDaFolga < hoje) meses.push(`${ano}-${dois(m)}`);
  }
  return meses;
}

// Primeiro dia que NÃO entra na conta: hoje (o culto de hoje pode nem ter começado)
// ou o 1º de janeiro seguinte, o que vier antes.
function limiteExclusivo(ano, hoje) {
  const fimAno = `${ano + 1}-01-01`;
  return hoje < fimAno ? hoje : fimAno;
}

// Domingos do exercício que já passaram — o que já deveria ter tido EBD.
function domingosPassados(ano, hoje) {
  const limite = limiteExclusivo(ano, hoje);
  let conta = 0;
  for (let d = new Date(Date.UTC(ano, 0, 1)); d.toISOString().slice(0, 10) < limite; d = new Date(d.getTime() + 86400000)) {
    if (d.getUTCDay() === 0) conta++;
  }
  return conta;
}

// Critério "x de y": todos os períodos esperados cumpridos?
function interpretarCobertura({ esperados, cumpridos, temDado, unidade, oQueViu, naoVe }) {
  if (esperados === 0) return { situacao: "SEM_DADOS", texto: `O exercício ainda não teve ${unidade} para conferir. ${naoVe}` };
  if (!temDado) return { situacao: "SEM_DADOS", texto: `O sistema não tem ${oQueViu} registrado neste exercício — nada a conferir. ${naoVe}` };
  if (cumpridos >= esperados) return { situacao: "CONFERE", texto: `${cumpridos} de ${esperados} ${unidade}: ${oQueViu}. ${naoVe}` };
  return { situacao: "NAO_CONFERE", texto: `Só ${cumpridos} de ${esperados} ${unidade}: ${oQueViu}. ${naoVe}` };
}

function interpretarBatismos({ batismos, rol }) {
  if (!rol) return { situacao: "SEM_DADOS", texto: "O sistema não tem membros em comunhão registrados nesta congregação — não dá para calcular o índice. A origem do fruto (5.3.b) é conferida por quem avalia." };
  const percentual = Math.round((batismos / rol) * 1000) / 10; // só para o texto; a decisão abaixo usa a razão exata
  const base = `${batismos} batismo(s) no exercício para um rol de ${rol} membro(s) em comunhão (${String(percentual).replace(".", ",")}%; mínimo ${PERCENTUAL_MINIMO_BATISMO}%).`;
  const ressalva = "O sistema conta membros com data de batismo no ano; se são fruto de evangelismo local ou de Carta de Mudança (5.3.b) é conferido por quem avalia.";
  return { situacao: batismos * 100 >= rol * PERCENTUAL_MINIMO_BATISMO ? "CONFERE" : "NAO_CONFERE", texto: `${base} ${ressalva}` };
}

// ---------------------------------------------------------------
// Banco
// ---------------------------------------------------------------

async function apurarRepasses(pool, { congregacaoId, ano, hoje }) {
  const esperados = mesesExigiveis(ano, hoje);
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Char(7), `${ano}-01`).input("fim", sql.Char(7), `${ano}-12`).query(`
    SELECT MesReferencia, Status FROM FechamentosTesouraria WHERE CongregacaoId = @c AND MesReferencia BETWEEN @ini AND @fim
  `);
  const repassados = new Set(r.recordset.filter(x => x.Status === "REPASSADO").map(x => x.MesReferencia));
  return interpretarCobertura({
    esperados: esperados.length, cumpridos: esperados.filter(m => repassados.has(m)).length, temDado: r.recordset.length > 0,
    unidade: "meses com fechamento já exigível", oQueViu: "fechamento da tesouraria com o repasse à Tesouraria Geral confirmado",
    naoVe: "O sistema vê se o repasse foi feito, não se foi pontual nem se houve retenção indevida."
  });
}

async function apurarPrestacaoContas(pool, { congregacaoId, ano, hoje }) {
  const esperados = mesesExigiveis(ano, hoje);
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Char(7), `${ano}-01`).input("fim", sql.Char(7), `${ano}-12`).query(`
    SELECT MesReferencia, Status FROM PrestacoesContas WHERE CongregacaoId = @c AND MesReferencia BETWEEN @ini AND @fim
  `);
  const completas = new Set(r.recordset.filter(x => x.Status === "COMPLETA").map(x => x.MesReferencia));
  return interpretarCobertura({
    esperados: esperados.length, cumpridos: esperados.filter(m => completas.has(m)).length, temDado: r.recordset.length > 0,
    unidade: "meses com fechamento já exigível", oQueViu: "prestação de contas mensal COMPLETA",
    naoVe: "O sistema vê se a prestação foi fechada, não se há erro de soma, rasura ou vale sem justificativa nos balancetes."
  });
}

async function apurarLicoesEbd(pool, { congregacaoId, ano, hoje }) {
  const fimAno = `${ano}-12-31`;
  const limite = limiteExclusivo(ano, hoje);
  // Só conta lição de DOMINGO (1900-01-07 foi um domingo): uma aula extra de
  // sábado não cobre um domingo perdido.
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Date, `${ano}-01-01`).input("fim", sql.Date, limite).query(`
    SELECT COUNT(*) AS Licoes FROM EbdLicoes
    WHERE CongregacaoId = @c AND Data >= @ini AND Data < @fim AND DATEDIFF(day, '1900-01-07', Data) % 7 = 0
  `);
  const licoes = r.recordset[0].Licoes;
  const esperados = domingosPassados(ano, hoje);
  return interpretarCobertura({
    esperados, cumpridos: Math.min(licoes, esperados), temDado: licoes > 0,
    unidade: "domingos que já passaram", oQueViu: "lição da EBD aberta na chamada",
    naoVe: "O Regimento admite exceção para feriados nacionais e eventos magnos da IEADESPA — o sistema não sabe quais domingos eram assim."
  });
}

async function apurarDiarioEbd(pool, { congregacaoId, ano, hoje }) {
  const limite = limiteExclusivo(ano, hoje); // a lição de hoje ainda pode estar aberta: não conta como diário por fechar
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Date, `${ano}-01-01`).input("fim", sql.Date, limite).query(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN Status = 'FECHADA' THEN 1 ELSE 0 END) AS fechadas
    FROM EbdLicoes WHERE CongregacaoId = @c AND Data >= @ini AND Data < @fim
  `);
  const total = r.recordset[0].total;
  const fechadas = r.recordset[0].fechadas || 0;
  return interpretarCobertura({
    esperados: total, cumpridos: fechadas, temDado: total > 0,
    unidade: "lições", oQueViu: "diário de classe fechado (chamada concluída)",
    naoVe: "O sistema registra a frequência dos alunos e visitantes; a frequência dos professores é conferida por quem avalia."
  });
}

async function apurarBatismos(pool, { congregacaoId, ano }) {
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Date, `${ano}-01-01`).input("fim", sql.Date, `${ano}-12-31`).query(`
    SELECT
      (SELECT COUNT(*) FROM MembroReferencia WHERE CongregacaoId = @c AND DataBatismo BETWEEN @ini AND @fim) AS batismos,
      (SELECT COUNT(*) FROM MembroReferencia WHERE CongregacaoId = @c AND SituacaoMembro = 'EM_COMUNHAO' AND Status = 'ATIVO') AS rol
  `);
  return interpretarBatismos({ batismos: r.recordset[0].batismos, rol: r.recordset[0].rol });
}

const APURADORES = {
  REPASSES: apurarRepasses,
  PRESTACAO_CONTAS: apurarPrestacaoContas,
  EBD_LICOES: apurarLicoesEbd,
  EBD_DIARIO: apurarDiarioEbd,
  BATISMOS: apurarBatismos
};

// Aplica as sugestões nas alíneas ligadas a uma fonte. Fail-soft por fonte: uma
// leitura que falha (tabela vazia, dado estranho) só deixa aquela alínea sem
// sugestão, nunca derruba a abertura da avaliação.
async function aplicarSugestoes(pool, { avaliacaoId, congregacaoId, ano, hoje = hojeBrasilia() }) {
  const fontes = (await pool.request().input("id", sql.Int, avaliacaoId).query(`
    SELECT DISTINCT c.FonteAutomatica FROM PscRespostas r JOIN PscCriterios c ON c.CriterioId = r.CriterioId
    WHERE r.AvaliacaoId = @id AND c.FonteAutomatica IS NOT NULL
  `)).recordset.map(x => x.FonteAutomatica);
  let aplicadas = 0;
  for (const fonte of fontes) {
    const apurador = APURADORES[fonte];
    if (!apurador) continue;
    let sugestao;
    try {
      sugestao = await apurador(pool, { congregacaoId, ano, hoje });
    } catch (e) {
      console.error(`[PSC] apuração ${fonte} falhou:`, e.message);
      continue;
    }
    // Só escreve em avaliação ainda em rascunho (uma sugestão tardia não mexe numa já enviada) e uma
    // falha na gravação de uma fonte não derruba as outras.
    try {
      const r = await pool.request()
        .input("id", sql.Int, avaliacaoId).input("fonte", sql.NVarChar(30), fonte)
        .input("situacao", sql.NVarChar(12), sugestao.situacao).input("texto", sql.NVarChar(500), sugestao.texto.slice(0, 500))
        .query(`
          UPDATE r SET SugestaoSituacao = @situacao, SugestaoSistema = @texto, SugestaoEm = SYSUTCDATETIME()
          FROM PscRespostas r
          JOIN PscCriterios c ON c.CriterioId = r.CriterioId
          JOIN PscAvaliacoes a ON a.AvaliacaoId = r.AvaliacaoId AND a.Status = 'RASCUNHO'
          WHERE r.AvaliacaoId = @id AND c.FonteAutomatica = @fonte
        `);
      aplicadas += r.rowsAffected[0] || 0;
    } catch (e) {
      console.error(`[PSC] gravar sugestão ${fonte} falhou:`, e.message);
    }
  }
  return aplicadas;
}

module.exports = {
  FONTES, PERCENTUAL_MINIMO_BATISMO,
  ultimoDiaDoMes, mesesExigiveis, limiteExclusivo, domingosPassados, interpretarCobertura, interpretarBatismos,
  aplicarSugestoes
};
