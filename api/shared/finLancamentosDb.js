// shared/finLancamentosDb.js (FASE 10, Financeiro, incremento 3, 26/11/2026) — as CONSULTAS de lançar dízimos e ofertas (migração 204). A regra
// pura está em shared/finLancamentos.js; a rota é FinLancamentos (financeiro/lancamentos). Tela aprovada: rodada 24, "r24-lancamento", opção 1.
//
// - As folhas de uma congregação são as das entregas a ela (as saídas do livro): da primeira folha da saída ao fim do bloco, ou até a folha
//   antes da primeira em branco, quando a devolução foi parcial. A folha sem destino de uma entrega que já voltou ganha destino pelo lançamento,
//   com a SaidaId da entrega original (decisão N3 de 24/11), mesmo com o bloco já na Geral ou com outra congregação.
// - Cada folha lançada fica em FinFolhas (LANCADA) e em FinLancamentos, na mesma transação, com os blocos travados na ordem (a devolução e a
//   exceção da folha travam a mesma linha do bloco: nada se cruza).
// - Quem lança: a congregação (o nível dela) ou a Tesouraria Geral por ela; a área acompanha (a rota confere). A correção muda a linha e guarda
//   o antes, o depois, o motivo e quem (a regra da r27); nada se apaga.
const { sql } = require("./db");
const auth = require("./auth");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { condicaoSqlEscopoCongregacao } = require("./escopoRotas");
const { hojeBrasilia } = require("./dataBrasilia");
const { abrirTransacao, pedidoNaTransacao, fecharTransacao, marcarExcecaoNaTransacao } = require("./finBlocosDb");
const regraBlocos = require("./finBlocos");
const regra = require("./finLancamentos");
const regraPix = require("./finDizimoDigital");

const MUDOU = (mensagem) => ({ sucesso: false, conflito: true, mensagem });
const milhar = (n) => Number(n).toLocaleString("pt-BR");
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const MAX_LINHAS = 200;          // uma planilha cheia (quatro blocos) de uma vez
const MAX_FOLHA = 999999999;
const EXCLUIDO_LGPD = "EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')";
// o dia em Belém de um carimbo gravado em UTC (a hora do registro)
const DIA_BRASILIA = (col) => `CONVERT(char(10), DATEADD(HOUR, -3, ${col}), 23)`;

// As entregas às congregações (cada saída do livro), com a faixa de folhas: a fechada pela devolução parcial vai até a folha antes da primeira em
// branco; a que voltou sem uso (a primeira em branco na primeira folha da entrega) fica de fora. "Aberta" = ainda não voltou.
const FAIXAS = (cond) => `
  SELECT s.RegistroId AS SaidaId, s.CongregacaoId, s.BlocoId, b.Numero, s.PrimeiraFolha AS De,
         CASE WHEN e.Parcial = 1 THEN e.PrimeiraFolha - 1 ELSE b.UltimaFolha END AS Ate,
         CASE WHEN e.RegistroId IS NULL THEN 1 ELSE 0 END AS Aberta, b.PrimeiraFolha AS BlocoDe, b.UltimaFolha AS BlocoAte
  FROM FinLivroBlocos s
  JOIN FinBlocos b ON b.BlocoId = s.BlocoId
  LEFT JOIN FinLivroBlocos e ON e.Tipo = 'ENTRADA' AND e.SaidaId = s.RegistroId
  WHERE s.Tipo = 'SAIDA' AND (e.RegistroId IS NULL OR e.Parcial = 0 OR e.PrimeiraFolha > s.PrimeiraFolha) AND ${cond}`;

const faixaDaLinha = (f) => ({
  saidaId: Number(f.SaidaId), blocoId: Number(f.BlocoId), bloco: Number(f.Numero), de: Number(f.De), ate: Number(f.Ate), aberta: Number(f.Aberta) === 1,
  blocoDe: Number(f.BlocoDe), blocoAte: Number(f.BlocoAte)
});

// a linha de FinLancamentos lida do banco, como a regra pura recebe (valores em centavos)
const lancamentoDoBanco = (l) => ({
  folha: Number(l.Folha), dia: iso(l.Dia), referente: l.Referente, mesSoma: iso(l.MesSoma), tipo: l.Tipo || null, forma: l.Forma || null,
  valor: regra.centavosDoBanco(l.Valor), voluntaria: regra.centavosDoBanco(l.Voluntaria),
  membroId: l.MembroId === null || l.MembroId === undefined ? null : Number(l.MembroId), membro: l.Membro || null, nome: l.NomeDigitado || null,
  pelaGeral: l.PelaGeral === true || Number(l.PelaGeral) === 1, corrigida: !!l.CorrigidoEm
});

async function relatorioMandado(pedido, congregacaoId, mes) {
  return !!(await pedido.input("rc", sql.Int, congregacaoId).input("rm", sql.Date, mes)
    .query(`SELECT 1 AS x FROM FinRelatoriosMes WHERE CongregacaoId = @rc AND Mes = @rm`)).recordset[0];
}

// As congregações que a pessoa alcança (ativas), com a área: o seletor "Lançando por" da Geral e a congregação de quem lança.
async function congregacoesDoEscopo(pool, usuario) {
  const pedido = pool.request();
  const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "c.CongregacaoId");
  if (cond === "") return [];
  const r = await pedido.query(`
    SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId
    WHERE c.Ativa = 1 ${cond ? "AND " + cond : ""} ORDER BY a.Nome, c.Nome`);
  return r.recordset.map((c) => ({ id: Number(c.CongregacaoId), nome: c.Nome, area: c.Area || null }));
}

// A planilha de um mês de uma congregação (já conferida no escopo pela rota): as linhas, a próxima folha, os totais e a tira do bloco.
// `podeLancar`: a sessão lança (a congregação ou a Geral); a área só vê.
async function planilha(pool, { congregacaoId, mes, podeLancar }) {
  const c = (await pool.request().input("c", sql.Int, congregacaoId).query(`
    SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId WHERE c.CongregacaoId = @c`)).recordset[0];
  if (!c) return { naoExiste: true };
  const hoje = hojeBrasilia(), agora = regra.mesDe(hoje), anterior = regra.mesAnterior(agora), seg = regra.mesSeguinte(mes);
  // as entregas que importam para o mês: as em curso, as que voltaram com folha sem destino e as que têm algo do mês (o que soma nele, o que foi
  // entregue nele, a exceção marcada nele)
  const faixas = (await pool.request().input("c", sql.Int, congregacaoId).input("mes", sql.Date, mes).input("seg", sql.Date, seg).query(`
    WITH faixas AS (${FAIXAS("s.CongregacaoId = @c")})
    SELECT fx.* FROM faixas fx
    CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.Folha BETWEEN fx.De AND fx.Ate) u
    WHERE fx.Aberta = 1 OR u.Usadas < fx.Ate - fx.De + 1
       OR EXISTS (SELECT 1 FROM FinLancamentos l WHERE l.SaidaId = fx.SaidaId AND (l.MesSoma = @mes OR (l.Dia >= @mes AND l.Dia < @seg)))
       OR EXISTS (SELECT 1 FROM FinFolhas f WHERE f.Folha BETWEEN fx.De AND fx.Ate AND f.Destino <> 'LANCADA'
                  AND DATEADD(HOUR, -3, f.RegistradoEm) >= @mes AND DATEADD(HOUR, -3, f.RegistradoEm) < @seg)`)).recordset.map(faixaDaLinha);
  const lidas = faixas.length ? (await pool.request().input("fx", sql.NVarChar(sql.MAX), JSON.stringify(faixas.map((f) => ({ de: f.de, ate: f.ate })))).query(`
    SELECT f.Folha, f.Destino, f.Observacao, ${DIA_BRASILIA("f.RegistradoEm")} AS Marcada,
           l.LancamentoId, l.Dia, l.Referente, l.MesSoma, l.Tipo, l.Forma, l.Valor, l.Voluntaria, l.MembroId, m.Nome AS Membro, l.NomeDigitado, l.PelaGeral, l.CorrigidoEm
    FROM OPENJSON(@fx) WITH (De INT '$.de', Ate INT '$.ate') x
    JOIN FinFolhas f ON f.Folha BETWEEN x.De AND x.Ate
    LEFT JOIN FinLancamentos l ON l.Folha = f.Folha
    LEFT JOIN MembroReferencia m ON m.MembroId = l.MembroId`)).recordset : [];
  const lancamentos = [], excecoes = [], lancadasSemDados = [];
  for (const x of lidas) {
    if (x.LancamentoId) lancamentos.push(lancamentoDoBanco(x));
    else if (x.Destino === "LANCADA") lancadasSemDados.push(Number(x.Folha));
    else excecoes.push({ folha: Number(x.Folha), destino: x.Destino, observacao: x.Observacao || null, dia: x.Marcada });
  }
  const p = regra.montarPlanilha({ faixas, lancamentos, excecoes, lancadasSemDados, mes });
  const doMes = (await pool.request().input("c", sql.Int, congregacaoId).input("mes", sql.Date, mes).query(`
    SELECT Folha, Referente, MesSoma, Tipo, Forma, Valor, Voluntaria FROM FinLancamentos WHERE CongregacaoId = @c AND MesSoma = @mes`)).recordset.map(lancamentoDoBanco);
  // a tira: o bloco da próxima folha (ou o da última linha), com o destino de todas as folhas dele
  const blocoDaTira = p.proxima ? p.proxima.blocoId : p.linhas.length ? p.linhas[p.linhas.length - 1].blocoId : null;
  let tira = null;
  if (blocoDaTira) {
    const fx = faixas.find((f) => f.blocoId === blocoDaTira);
    const doBloco = (await pool.request().input("b", sql.Int, blocoDaTira).query(`
      SELECT f.Folha, f.Destino, ${DIA_BRASILIA("f.RegistradoEm")} AS Marcada, l.LancamentoId, l.Dia, l.Referente, l.MesSoma, l.Valor
      FROM FinFolhas f LEFT JOIN FinLancamentos l ON l.Folha = f.Folha WHERE f.BlocoId = @b`)).recordset;
    tira = regra.tiraDoBloco({
      bloco: { blocoId: fx.blocoId, numero: fx.bloco, primeiraFolha: fx.blocoDe, ultimaFolha: fx.blocoAte },
      lancamentos: doBloco.filter((x) => x.LancamentoId).map(lancamentoDoBanco),
      excecoes: doBloco.filter((x) => x.Destino !== "LANCADA").map((x) => ({ folha: Number(x.Folha), dia: x.Marcada })),
      lancadasSemDados: doBloco.filter((x) => x.Destino === "LANCADA" && !x.LancamentoId).map((x) => Number(x.Folha)),
      proxima: p.proxima, mes
    });
    delete tira.blocoId;
  }
  const mandouAnterior = await relatorioMandado(pool.request(), congregacaoId, anterior);
  const lancavel = podeLancar && (mes === agora || (mes === anterior && !mandouAnterior));
  // o dízimo digital (incremento 4): os Pix esperando a tesouraria (sem ligar, não se salva) e as folhas ligadas a um Pix nas entregas da planilha:
  // a reservada vem preenchida com o Pix (`ligadas`); a já lançada leva a marca "Pix ligado"
  const pix = await pool.request().input("c", sql.Int, congregacaoId).input("fx", sql.NVarChar(sql.MAX), JSON.stringify(faixas.map((f) => ({ de: f.de, ate: f.ate })))).query(`
    SELECT COUNT(*) AS n FROM FinDizimosDigitais WHERE CongregacaoId = @c AND Situacao = 'INFORMADO';
    SELECT d.Folha, d.Valor, d.MembroId, m.Nome AS Membro, l.Valor AS Lancado
    FROM OPENJSON(@fx) WITH (De INT '$.de', Ate INT '$.ate') x
    JOIN FinDizimosDigitais d ON d.Folha BETWEEN x.De AND x.Ate AND d.Situacao = 'LIGADO'
    JOIN MembroReferencia m ON m.MembroId = d.MembroId
    LEFT JOIN FinLancamentos l ON l.Folha = d.Folha
    ORDER BY d.Folha`);
  const [contagem, comPix] = pix.recordsets;
  const ligadas = comPix.filter((x) => x.Lancado === null).map((x) => ({ folha: Number(x.Folha), membroId: Number(x.MembroId), membro: x.Membro, valor: regra.centavosDoBanco(x.Valor) }));
  const pixLancado = new Set(comPix.filter((x) => x.Lancado !== null).map((x) => Number(x.Folha)));
  const limpa = ({ blocoId, saidaId, ...l }) => (pixLancado.has(l.folha) ? { ...l, pixLigado: true } : l);
  return {
    sucesso: true,
    congregacao: { id: Number(c.CongregacaoId), nome: c.Nome, area: c.Area || null },
    mes, hoje, podeLancar, lancavel, mandouAnterior,
    // o "Dia do lançamento": hoje no mês de agora; no anterior, o último dia dele (pode ser outro, dentro do mês)
    diaPadrao: mes === agora ? hoje : regra.ultimoDia(mes),
    comeca: p.comeca, proxima: p.proxima ? { folha: p.proxima.folha, bloco: p.proxima.bloco } : null,
    marcadasNoAnterior: p.marcadasNoAnterior, linhas: p.linhas.map(limpa), totais: regra.totaisDoMes(doMes, mes), tira,
    paraLigar: Number(contagem[0].n), ligadas
  };
}

// O membro escolhido em cada linha existe? (a chave estrangeira recusaria com erro do banco; aqui vira a mensagem da folha)
async function membrosQueFaltam(t, linhas) {
  const ids = [...new Set(linhas.map((l) => l.membroId).filter(Boolean))];
  if (!ids.length) return new Set();
  const achados = (await pedidoNaTransacao(t).input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids))
    .query(`SELECT MembroId FROM MembroReferencia WHERE MembroId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`)).recordset.map((x) => Number(x.MembroId));
  return new Set(ids.filter((id) => !achados.includes(id)));
}

// Salva as linhas da planilha de uma vez (tudo ou nada): a folha nova (FinFolhas LANCADA e o lançamento), a folha que veio marcada "mês posterior"
// do mês anterior (o nome e o valor chegam agora) e a folha marcada como cancelada, arrancada ou inexistente, com o motivo (a decisão 4 corrigida
// de 26/11/2026: a mesma regra da aba Folhas, por finBlocosDb.marcarExcecaoNaTransacao). `dados`: { dia, linhas: [{ folha, referente, tipo,
// forma, valor, voluntaria, pessoa } | { folha, excecao: { oQueAconteceu, observacao } }] }. A primeira linha que não confere volta com a mensagem
// e o número da folha; nada se grava.
async function salvar(pool, usuario, { congregacaoId, dados, por, pelaGeral }) {
  const entrada = Array.isArray(dados.linhas) ? dados.linhas : null;
  if (!entrada || !entrada.length) return { sucesso: false, mensagem: "Nenhuma folha para salvar." };
  if (entrada.length > MAX_LINHAS) return { sucesso: false, mensagem: `No máximo ${MAX_LINHAS} folhas de uma vez.` };
  if (entrada.some((l) => !l || typeof l !== "object" || Array.isArray(l) || !Number.isInteger(l.folha) || l.folha <= 0 || l.folha > MAX_FOLHA)) {
    return { sucesso: false, mensagem: "Confira o número da folha." };
  }
  const vistas = new Set();
  for (const l of entrada) { if (vistas.has(l.folha)) return { sucesso: false, mensagem: `A folha ${milhar(l.folha)} está duas vezes.`, folha: l.folha }; vistas.add(l.folha); }
  const linhas = [...entrada].sort((a, b) => a.folha - b.folha);
  const folhas = linhas.map((l) => l.folha);
  const hoje = hojeBrasilia();
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const c = (await pedidoNaTransacao(t).input("c", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
    if (!c) return { sucesso: false, naoExiste: true };
    const mandou = await relatorioMandado(pedidoNaTransacao(t), congregacaoId, regra.mesAnterior(regra.mesDe(hoje)));
    const d = regra.diaDoLancamento(dados.dia, hoje, mandou);
    if (!d.ok) return { sucesso: false, mensagem: d.mensagem };
    // o dízimo digital (r22): sem ligar (ou excluir) cada Pix que espera a tesouraria, a planilha fica aberta para ver, mas não se salva
    const paraLigar = Number((await pedidoNaTransacao(t).input("c", sql.Int, congregacaoId)
      .query(`SELECT COUNT(*) AS n FROM FinDizimosDigitais WHERE CongregacaoId = @c AND Situacao = 'INFORMADO'`)).recordset[0].n);
    if (paraLigar) return { sucesso: false, paraLigar, mensagem: `${paraLigar === 1 ? "Há 1 dízimo por Pix para ligar" : `Há ${paraLigar} dízimos por Pix para ligar`}: ligue cada um à folha do recibo de papel (ou exclua com o motivo) antes de salvar.` };
    // os blocos das folhas, travados na ordem (a devolução e a exceção da folha travam a mesma linha): as entregas só se leem depois da trava
    const blocos = (await pedidoNaTransacao(t).input("fs", sql.NVarChar(sql.MAX), JSON.stringify(folhas)).query(`
      SELECT DISTINCT b.BlocoId FROM OPENJSON(@fs) j JOIN FinBlocos b ON CAST(j.value AS INT) BETWEEN b.PrimeiraFolha AND b.UltimaFolha`)).recordset
      .map((x) => Number(x.BlocoId)).sort((a, b) => a - b);
    for (const b of blocos) await pedidoNaTransacao(t).input("b", sql.Int, b).query(`SELECT BlocoId FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @b`);
    const faixas = blocos.length ? (await pedidoNaTransacao(t).input("c", sql.Int, congregacaoId).input("bs", sql.NVarChar(sql.MAX), JSON.stringify(blocos)).query(`
      WITH faixas AS (${FAIXAS("s.CongregacaoId = @c AND s.BlocoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@bs))")})
      SELECT fx.*, (SELECT MAX(f.Folha) FROM FinFolhas f WHERE f.Folha BETWEEN fx.De AND fx.Ate) AS Ultima FROM faixas fx`)).recordset
      .map((f) => ({ ...faixaDaLinha(f), ultima: f.Ultima === null ? null : Number(f.Ultima) })) : [];
    const estado = new Map((await pedidoNaTransacao(t).input("fs", sql.NVarChar(sql.MAX), JSON.stringify(folhas)).query(`
      SELECT f.Folha, f.Destino, l.LancamentoId, l.Referente, l.MesSoma, l.Valor
      FROM OPENJSON(@fs) j JOIN FinFolhas f ON f.Folha = CAST(j.value AS INT) LEFT JOIN FinLancamentos l ON l.Folha = f.Folha`)).recordset.map((x) => [Number(x.Folha), x]));
    // as folhas ligadas a um Pix (o dízimo digital): o nome e o valor vêm do Pix, nunca do corpo
    const doPix = new Map((await pedidoNaTransacao(t).input("fs", sql.NVarChar(sql.MAX), JSON.stringify(folhas)).query(`
      SELECT d.Folha, d.MembroId, d.Valor FROM OPENJSON(@fs) j JOIN FinDizimosDigitais d ON d.Folha = CAST(j.value AS INT) AND d.Situacao = 'LIGADO'`)).recordset
      .map((x) => [Number(x.Folha), { membroId: Number(x.MembroId), valor: regra.centavosDoBanco(x.Valor) }]));

    // 1ª passada: cada linha conferida (a regra pura e o estado da folha); a folha nova segue a ordem do bloco. A recusa leva o número da folha
    // (`folha`), para a tela marcar a linha.
    const acoes = [], esperada = new Map();
    for (const l of linhas) {
      const n = milhar(l.folha);
      const recusa = (mensagem) => ({ sucesso: false, mensagem, folha: l.folha });
      const fx = faixas.find((f) => l.folha >= f.de && l.folha <= f.ate);
      if (!fx) return recusa(`A folha ${n} não é de um bloco entregue a ${c.Nome}.`);
      const x = estado.get(l.folha);
      const marca = l.excecao !== undefined;
      const pix = doPix.get(l.folha);
      if (marca && pix) return recusa(`Folha ${n}: a folha está ligada a um dízimo por Pix; ela se lança com o Pix, não se marca.`);
      if (!x) {
        const v = marca ? regra.excecaoNaPlanilha(l) : pix ? regraPix.linhaDaFolhaLigada(l, pix) : regra.validarLinha(l);
        if (!v.ok) return recusa(v.mensagem);
        // a marca vale só na entrega em curso, como na aba Folhas: a folha sem destino de uma entrega que já voltou só se lança
        if (marca && !fx.aberta) return recusa(`Folha ${n}: o bloco ${milhar(fx.bloco)} já voltou desta entrega; a folha que ficou sem destino só se lança.`);
        // a folha depois da última usada da entrega em curso vem na sequência (a sem destino que ficou para trás é um pendente e vale)
        if (fx.aberta && (fx.ultima === null || l.folha > fx.ultima)) {
          const proxima = esperada.has(fx.saidaId) ? esperada.get(fx.saidaId) : (fx.ultima === null ? fx.de : fx.ultima + 1);
          if (l.folha !== proxima) return recusa(`Folha ${n}: a próxima folha deste bloco é a ${milhar(proxima)} (as folhas vão na ordem do bloco).`);
          esperada.set(fx.saidaId, proxima + 1);
        }
        acoes.push(marca ? { marca: v.excecao, folha: l.folha } : { nova: true, fx, ...v.linha });
        continue;
      }
      if (x.Destino !== "LANCADA") return { ...MUDOU(`A folha ${n} está marcada como ${regraBlocos.destinoDaTela(x.Destino)}.`), folha: l.folha };
      if (marca || !x.LancamentoId || x.Referente !== "MES_POSTERIOR" || x.Valor !== null) return { ...MUDOU(`A folha ${n} já foi lançada: para mudar, use Corrigir.`), folha: l.folha };
      const somaEm = iso(x.MesSoma);
      if (somaEm !== d.mes) return recusa(`A folha ${n} soma em ${regra.nomeDoMes(somaEm)}: o nome e o valor entram na planilha de ${regra.nomeDoMes(somaEm)}.`);
      const v = pix ? regraPix.linhaDaFolhaLigada(l, pix, { preencher: true }) : regra.validarLinha(l, { preencher: true });
      if (!v.ok) return recusa(v.mensagem);
      acoes.push({ nova: false, lancamentoId: Number(x.LancamentoId), ...v.linha });
    }
    const faltam = await membrosQueFaltam(t, acoes);
    const semMembro = acoes.find((a) => faltam.has(a.membroId));
    if (semMembro) return { sucesso: false, mensagem: `Folha ${milhar(semMembro.folha)}: o membro escolhido não foi encontrado no cadastro.`, folha: semMembro.folha };

    // 2ª passada: grava
    const dec = (c) => (c === null ? null : regra.decimalDoBanco(c));
    let primeiroId = null;
    for (const a of acoes) {
      if (a.marca) {
        // a exceção grava a folha, o papel de quem marcou e a auditoria dela (FIN_FOLHA_EXCECAO), na mesma transação: tudo ou nada
        const r = await marcarExcecaoNaTransacao(t, usuario, { geral: pelaGeral, v: a.marca, por });
        if (!r.sucesso) return { ...r, folha: a.folha };
        continue;
      }
      const pedido = pedidoNaTransacao(t).input("tipo", sql.NVarChar(17), a.tipo).input("forma", sql.NVarChar(7), a.forma)
        .input("valor", sql.Decimal(14, 2), dec(a.valor)).input("vol", sql.Decimal(14, 2), dec(a.voluntaria))
        .input("membro", sql.Int, a.membroId).input("nome", sql.NVarChar(120), a.nome).input("por", sql.Int, por);
      if (a.nova) {
        const id = (await pedido.input("c", sql.Int, congregacaoId).input("b", sql.Int, a.fx.blocoId).input("f", sql.Int, a.folha).input("s", sql.Int, a.fx.saidaId)
          .input("dia", sql.Date, d.dia).input("ref", sql.NVarChar(13), a.referente).input("soma", sql.Date, regra.mesSoma(d.dia, a.referente))
          .input("geral", sql.Bit, pelaGeral ? 1 : 0).query(`
            INSERT INTO FinFolhas (BlocoId, Folha, Destino, RegistradoPor, SaidaId) VALUES (@b, @f, 'LANCADA', @por, @s);
            INSERT INTO FinLancamentos (CongregacaoId, BlocoId, Folha, SaidaId, Dia, Referente, MesSoma, Tipo, Forma, Valor, Voluntaria, MembroId, NomeDigitado, PelaGeral, RegistradoPor)
            OUTPUT INSERTED.LancamentoId
            VALUES (@c, @b, @f, @s, @dia, @ref, @soma, @tipo, @forma, @valor, @vol, @membro, @nome, @geral, @por)`)).recordset[0].LancamentoId;
        if (primeiroId === null) primeiroId = Number(id);
      } else {
        const r = await pedido.input("id", sql.Int, a.lancamentoId).query(`
          UPDATE FinLancamentos SET Tipo = @tipo, Forma = @forma, Valor = @valor, Voluntaria = @vol, MembroId = @membro, NomeDigitado = @nome,
                 PreenchidoPor = @por, PreenchidoEm = SYSUTCDATETIME()
          WHERE LancamentoId = @id AND Valor IS NULL`);
        if (r.rowsAffected[0] !== 1) return { ...MUDOU(`A folha ${milhar(a.folha)} mudou enquanto você lançava. Confira a planilha.`), folha: a.folha };
        if (primeiroId === null) primeiroId = a.lancamentoId;
      }
    }
    // a trilha: as folhas, o tipo e o valor (o nome fica só no lançamento); a folha marcada já ficou na auditoria dela
    const lancadas = acoes.filter((a) => !a.marca);
    if (lancadas.length) {
      await registrarAuditoriaNaTransacao(t, { tabela: "FinLancamentos", registroId: primeiroId, acao: "FIN_LANCAMENTO_SALVO", usuarioId: por, dadosDepois: {
        congregacaoId, dia: d.dia, pelaGeral: !!pelaGeral,
        folhas: lancadas.map((a) => ({ folha: a.folha, nova: a.nova, referente: a.referente, tipo: a.tipo, forma: a.forma, valor: a.valor, voluntaria: a.voluntaria, membroId: a.membroId, comNomeDigitado: !!a.nome, doPix: doPix.has(a.folha) }))
      } });
    }
    ok = true;
    const total = acoes.length, uma = acoes[0];
    const mensagem = total > 1 ? `${total} folhas salvas (${milhar(uma.folha)} a ${milhar(acoes[total - 1].folha)}).`
      : uma.marca ? `Folha ${milhar(uma.folha)} marcada como ${regraBlocos.destinoDaTela(uma.marca.destino)}.` : `Folha ${milhar(uma.folha)} salva.`;
    return { sucesso: true, mensagem, folhas: acoes.map((a) => a.folha) };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// o que a trilha da correção guarda de cada lado (o valor em centavos; quem deu com o nome da hora, para o histórico ler sem outra consulta)
const ladoDaCorrecao = (x, quem) => ({ tipo: x.tipo, forma: x.forma, valor: x.valor, voluntaria: x.voluntaria, membroId: x.membroId, quem });

// A correção do lançamento (a regra da r27): a linha muda e a trilha guarda o antes, o depois, o motivo e quem. Só a congregação do lançamento
// (ou a Geral); fora do escopo e a folha que não existe têm a mesma resposta. O dia e o "Referente a" não mudam. Ponto de encaixe da auditoria
// (2ª leva): com a nota já conferida pelo Conselho, "Corrigir" vira "Pedir correção"; a conferência ainda não existe.
async function corrigir(pool, usuario, { geral, dados, por }) {
  const folha = auth.idDeRota(dados.folha);
  if (!folha) return { sucesso: false, naoExiste: true };
  const v = regra.validarCorrecao(dados);
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const l = (await pedidoNaTransacao(t).input("f", sql.Int, folha).query(`
      SELECT l.LancamentoId, l.Folha, l.Referente, l.MesSoma, l.Tipo, l.Forma, l.Valor, l.Voluntaria, l.MembroId, m.Nome AS Membro, l.NomeDigitado,
             c.Nome AS Congregacao
      FROM FinLancamentos l WITH (UPDLOCK, ROWLOCK)
      JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
      LEFT JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE l.Folha = @f`)).recordset[0];
    if (!l || (!geral && !auth.estaNoEscopo(usuario, l.Congregacao))) return { sucesso: false, naoExiste: true };
    const n = milhar(folha);
    if (l.Valor === null) return { sucesso: false, mensagem: `A folha ${n} ainda não tem o nome e o valor: eles entram na planilha de ${regra.nomeDoMes(iso(l.MesSoma))}.` };
    if (!v.ok) return { sucesso: false, mensagem: v.mensagem };
    const antes = lancamentoDoBanco(l), depois = v.campos;
    if (!regra.mudancas(antes, depois).length) return { sucesso: false, mensagem: "Nada mudou: confira os campos." };
    if ((await membrosQueFaltam(t, [depois])).size) return { sucesso: false, mensagem: "O membro escolhido não foi encontrado no cadastro." };
    const dec = (c) => (c === null ? null : regra.decimalDoBanco(c));
    await pedidoNaTransacao(t).input("id", sql.Int, l.LancamentoId).input("tipo", sql.NVarChar(17), depois.tipo).input("forma", sql.NVarChar(7), depois.forma)
      .input("valor", sql.Decimal(14, 2), dec(depois.valor)).input("vol", sql.Decimal(14, 2), dec(depois.voluntaria))
      .input("membro", sql.Int, depois.membroId).input("nome", sql.NVarChar(120), depois.nome).query(`
        UPDATE FinLancamentos SET Tipo = @tipo, Forma = @forma, Valor = @valor, Voluntaria = @vol, MembroId = @membro, NomeDigitado = @nome,
               CorrigidoEm = SYSUTCDATETIME()
        WHERE LancamentoId = @id`);
    const nomeNovo = depois.membroId
      ? (await pedidoNaTransacao(t).input("m", sql.Int, depois.membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @m`)).recordset[0].Nome
      : depois.nome;
    const ladoAntes = ladoDaCorrecao(antes, antes.membro || antes.nome), ladoDepois = ladoDaCorrecao(depois, nomeNovo);
    const id = (await pedidoNaTransacao(t).input("id", sql.Int, l.LancamentoId)
      .input("antes", sql.NVarChar(600), JSON.stringify(ladoAntes)).input("depois", sql.NVarChar(600), JSON.stringify(ladoDepois))
      .input("motivo", sql.NVarChar(300), v.motivo).input("por", sql.Int, por).query(`
        INSERT INTO FinLancamentosCorrecoes (LancamentoId, Antes, Depois, Motivo, RegistradoPor) OUTPUT INSERTED.CorrecaoId
        VALUES (@id, @antes, @depois, @motivo, @por)`)).recordset[0].CorrecaoId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLancamentosCorrecoes", registroId: Number(id), acao: "FIN_LANCAMENTO_CORRIGIDO", usuarioId: por,
      dadosAntes: { folha, ...ladoDaCorrecao(antes, null) }, dadosDepois: { folha, ...ladoDaCorrecao(depois, null), motivo: v.motivo } });
    ok = true;
    return { sucesso: true, mensagem: `Folha ${n} corrigida.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// O histórico do lançamento (a r30, como o da folha): quem lançou e quando, quem preencheu a folha que veio marcada, e cada correção com o antes,
// o depois, o motivo, quem e quando. Fora do escopo e a folha sem lançamento: a mesma resposta.
async function historico(pool, usuario, { geral, folha }) {
  const l = (await pool.request().input("f", sql.Int, folha).query(`
    SELECT l.LancamentoId, l.Folha, l.Dia, l.Referente, l.MesSoma, l.PelaGeral, l.RegistradoEm, l.PreenchidoEm, c.Nome AS Congregacao,
           rp.Nome AS RegistradoPor, pp.Nome AS PreenchidoPor
    FROM FinLancamentos l
    JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    LEFT JOIN MembroReferencia rp ON rp.MembroId = l.RegistradoPor
    LEFT JOIN MembroReferencia pp ON pp.MembroId = l.PreenchidoPor
    WHERE l.Folha = @f`)).recordset[0];
  if (!l || (!geral && !auth.estaNoEscopo(usuario, l.Congregacao))) return { sucesso: false, naoExiste: true };
  const correcoes = (await pool.request().input("id", sql.Int, l.LancamentoId).query(`
    SELECT x.Antes, x.Depois, x.Motivo, x.RegistradoEm, p.Nome AS Por
    FROM FinLancamentosCorrecoes x LEFT JOIN MembroReferencia p ON p.MembroId = x.RegistradoPor
    WHERE x.LancamentoId = @id ORDER BY x.CorrecaoId`)).recordset;
  const quando = (d) => (d ? new Date(d).toISOString() : null);
  return {
    sucesso: true, folha,
    lancamento: {
      dia: iso(l.Dia), referente: l.Referente, mesSoma: iso(l.MesSoma), pelaGeral: l.PelaGeral === true || Number(l.PelaGeral) === 1,
      registradoPor: l.RegistradoPor || null, registradoEm: quando(l.RegistradoEm), preenchidoPor: l.PreenchidoPor || null, preenchidoEm: quando(l.PreenchidoEm)
    },
    correcoes: correcoes.map((x) => ({ antes: JSON.parse(x.Antes), depois: JSON.parse(x.Depois), motivo: x.Motivo, por: x.Por || null, em: quando(x.RegistradoEm) }))
  };
}

// A procura do dizimista (a resposta de 26/11): a Igreja inteira, só o nome, o número e a congregação; nada mais da ficha. Os ativos, sem quem
// pediu a exclusão pela LGPD. Por parte do nome (2 letras ou mais, sem acento e sem maiúscula) ou pelo número.
async function procurarMembros(pool, { procura }) {
  const termo = typeof procura === "string" ? procura.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const digitos = termo.replace(/\./g, "");
  const numero = /^\d{1,9}$/.test(digitos) ? Number(digitos) : null;
  if (numero === null && termo.length < 2) return { sucesso: true, membros: [] };
  // o %, o _ e o [ valem como letra; o ] sozinho já é letra no LIKE (o "[]]" quebrava a procura: o e2e-204 pegou)
  const like = (t) => t.replace(/[[%_]/g, (x) => `[${x}]`);
  const pedido = pool.request();
  if (numero !== null) pedido.input("n", sql.Int, numero);
  else pedido.input("t", sql.NVarChar(130), `%${like(termo)}%`).input("ini", sql.NVarChar(130), `${like(termo)}%`);
  const r = await pedido.query(`
    SELECT TOP 8 m.MembroId, m.Nome, c.Nome AS Congregacao
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = 'ATIVO' AND NOT ${EXCLUIDO_LGPD}
      AND ${numero !== null ? "m.MembroId = @n" : "m.Nome COLLATE Latin1_General_CI_AI LIKE @t"}
    ORDER BY ${numero !== null ? "m.Nome" : "CASE WHEN m.Nome COLLATE Latin1_General_CI_AI LIKE @ini THEN 0 ELSE 1 END, m.Nome"}`);
  return { sucesso: true, membros: r.recordset.map((m) => ({ membroId: Number(m.MembroId), nome: m.Nome, congregacao: m.Congregacao || null })) };
}

// A área acompanha (o r20LancArea): de cada congregação do escopo, o último lançamento, o lançado no mês, o bloco e a folha em que está e o que
// precisa de atenção. A coluna "Entrega" (o jeito do repasse) vem com o incremento 5: até lá, nada inventado (a resposta de 26/11).
async function area(pool, usuario, { mes }) {
  const hoje = hojeBrasilia(), agora = regra.mesDe(hoje);
  const pedido = pool.request().input("mes", sql.Date, mes).input("agora", sql.Date, agora);
  const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "c.CongregacaoId");
  if (cond === "") return { sucesso: true, mes, congregacoes: [], resumo: { congregacoes: 0, lancaram: 0, total: 0, precisam: 0 } };
  const onde = `c.Ativa = 1 ${cond ? "AND " + cond : ""}`;
  const r = await pedido.query(`
    SELECT c.CongregacaoId, c.Nome, lm.Total, lm.Folhas, ul.Ultimo, es.Esperando, pl.ParaLigar
    FROM Congregacoes c
    OUTER APPLY (SELECT SUM(l.Valor + ISNULL(l.Voluntaria, 0)) AS Total, COUNT(l.Valor) AS Folhas FROM FinLancamentos l WHERE l.CongregacaoId = c.CongregacaoId AND l.MesSoma = @mes) lm
    OUTER APPLY (SELECT MAX(l.RegistradoEm) AS Ultimo FROM FinLancamentos l WHERE l.CongregacaoId = c.CongregacaoId) ul
    OUTER APPLY (SELECT COUNT(*) AS Esperando FROM FinLancamentos l WHERE l.CongregacaoId = c.CongregacaoId AND l.Valor IS NULL AND l.MesSoma <= @agora) es
    OUTER APPLY (SELECT COUNT(*) AS ParaLigar FROM FinDizimosDigitais d WHERE d.CongregacaoId = c.CongregacaoId AND d.Situacao = 'INFORMADO') pl
    WHERE ${onde}
    ORDER BY c.Nome;
    WITH faixas AS (${FAIXAS("s.CongregacaoId IN (SELECT c.CongregacaoId FROM Congregacoes c WHERE " + onde + ")")})
    SELECT fx.CongregacaoId, fx.SaidaId, fx.Numero, fx.De, fx.Ate, fx.Aberta, u.Usadas, u.Ultima FROM faixas fx
    CROSS APPLY (SELECT COUNT(*) AS Usadas, MAX(f.Folha) AS Ultima FROM FinFolhas f WHERE f.Folha BETWEEN fx.De AND fx.Ate) u
    WHERE fx.Aberta = 1 OR u.Usadas < fx.Ate - fx.De + 1
    ORDER BY fx.De`);
  const [congs, faixas] = r.recordsets;
  const porCong = new Map();
  for (const f of faixas) {
    const id = Number(f.CongregacaoId), de = Number(f.De), ate = Number(f.Ate), usadas = Number(f.Usadas), ultima = f.Ultima === null ? null : Number(f.Ultima);
    const x = porCong.get(id) || { pendentes: 0, agora: null };
    if (Number(f.Aberta) === 1) {
      if (ultima !== null) x.pendentes += ultima - de + 1 - usadas;
      if (!x.agora && (ultima === null || ultima < ate)) x.agora = { bloco: Number(f.Numero), folha: ultima === null ? de : ultima + 1 };
    } else x.pendentes += ate - de + 1 - usadas;
    porCong.set(id, x);
  }
  const lista = congs.map((c) => {
    const x = porCong.get(Number(c.CongregacaoId)) || { pendentes: 0, agora: null };
    const precisa = [];
    // o dízimo digital primeiro: sem ligar, a congregação não salva (r22)
    const pl = Number(c.ParaLigar) || 0;
    if (pl) precisa.push(pl === 1 ? "1 dízimo por Pix para ligar" : `${pl} dízimos por Pix para ligar`);
    if (x.pendentes) precisa.push(x.pendentes === 1 ? "1 folha sem destino" : `${x.pendentes} folhas sem destino`);
    if (Number(c.Esperando)) precisa.push(Number(c.Esperando) === 1 ? "1 folha do mês posterior sem o nome e o valor" : `${c.Esperando} folhas do mês posterior sem o nome e o valor`);
    return {
      id: Number(c.CongregacaoId), nome: c.Nome, ultimoLancamento: c.Ultimo ? new Date(c.Ultimo).toISOString() : null,
      lancadoNoMes: regra.centavosDoBanco(c.Total) || 0, folhasNoMes: Number(c.Folhas) || 0, agora: x.agora, precisa
    };
  });
  return {
    sucesso: true, mes, congregacoes: lista,
    resumo: { congregacoes: lista.length, lancaram: lista.filter((c) => c.folhasNoMes > 0).length, total: lista.reduce((s, c) => s + c.lancadoNoMes, 0), precisam: lista.filter((c) => c.precisa.length).length }
  };
}

// O seletor "Lançando por / Trocar" (r20-seletor, a peça comum): as congregações do escopo, com a área e a situação de agora. A situação é
// só o que o lançamento já sabe (a resposta 6 de 26/11/2026: nada de repasse inventado até o incremento 5): o primeiro "precisa" da área
// ("2 folhas sem destino") ou "em dia".
async function seletor(pool, usuario) {
  const lista = await congregacoesDoEscopo(pool, usuario);
  if (!lista.length) return [];
  const a = await area(pool, usuario, { mes: regra.mesDe(hojeBrasilia()) });
  const precisa = new Map(a.congregacoes.map((c) => [c.id, c.precisa]));
  return lista.map((c) => {
    const p = precisa.get(c.id) || [];
    return { ...c, situacao: p.length ? { texto: p[0], tom: "pend" } : { texto: "em dia", tom: "ok" } };
  });
}

module.exports = { congregacoesDoEscopo, seletor, planilha, salvar, corrigir, historico, procurarMembros, area, MAX_LINHAS, FAIXAS, faixaDaLinha };
