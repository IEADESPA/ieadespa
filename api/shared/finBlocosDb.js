// shared/finBlocosDb.js (FASE 10, Financeiro, incremento 1a, 21/11/2026) — as CONSULTAS dos blocos de recibo (migração 200). A regra pura está em
// shared/finBlocos.js; a rota é FinBlocos (financeiro/blocos).
//
// Quem vê o quê: a Tesouraria Geral vê todos os blocos, inclusive os que estão com ela (na Geral); a congregação e a área veem só os blocos
// entregues às congregações do seu escopo. O bloco nunca fica com a área: ela só leva (o livro registra "levado pela área").
// Gravações em transação com trava de aplicação: dois lotes ao mesmo tempo nunca cruzam a numeração, e o mesmo bloco não sai duas vezes.
// Revisão de 23/11/2026: SET XACT_ABORT ON em toda transação (regra 7 do banco; desde a revisão m1 de 24/11, dentro de cada consulta e nunca na
// conexão: ver abrirTransacao); a exceção da folha se desfaz com o motivo, só pela Tesouraria Geral (a regra dele); os números das mensagens com
// o ponto do milhar.
// Regra dele de 24/11/2026 (no lugar da "devolução só de bloco cheio" de 23/11), com o detalhe da r30: a devolução é completa ou parcial, e nada
// se recusa por folha livre. Na parcial, a tesouraria informa a primeira folha em branco: dela ao fim do bloco, as folhas voltam livres e o bloco
// fica na Geral, para sair de novo só com elas (a saída guarda a faixa entregue); a folha sem destino antes dela continua com a congregação.
// Cada folha guarda a entrega que a usou (FinFolhas.SaidaId); a entrada guarda a saída que fecha e, na parcial, a faixa que voltou livre (201).
const { sql } = require("./db");
const auth = require("./auth");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { obterTrava } = require("./financeiroSeguro");
const { condicaoSqlEscopoCongregacao } = require("./escopoRotas");
const regra = require("./finBlocos");

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dataBr = (d) => iso(d).split("-").reverse().join("/");
const hojeBrasilia = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
// o JavaScript aceita 30/02 e o vira em 02/03: a data só vale se voltar igual (senão o banco a recusaria e a rota daria 500)
const dataValida = (v) => {
  if (typeof v !== "string" || !DATA.test(v) || v < "2000-01-01") return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
// número de folha ou id vindo da tela: inteiro positivo que cabe no INT do banco (nada de 1e1, 1.5 nem 2^40)
const inteiroPositivo = (v) => auth.idDeRota(v);
const MUDOU = (mensagem) => ({ sucesso: false, conflito: true, mensagem });
// o número como a tela mostra (bloco 1.401, folha 70.090)
const milhar = (n) => Number(n).toLocaleString("pt-BR");

// Regra 7 do banco (api/CLAUDE.md): transação curta com SET XACT_ABORT ON — um erro do banco desfaz a transação inteira, e o tempo esgotado do
// cliente não deixa transação aberta segurando a trava. O SET vai DENTRO de cada consulta da transação (pedidoNaTransacao): o .query() do mssql
// roda em sp_executesql, e o SET feito ali vale para aquela consulta e se desfaz quando ela volta. Nada de SET na conexão (revisão de 24/11/2026,
// m1): quando o banco desfaz a transação, o mssql 12.7.2 devolve a conexão ao pool na hora (lib/tedious/transaction.js, _abort), e um "desligar"
// no fim já não chegaria a ela; a próxima rota que a pegasse rodaria com o XACT_ABORT ligado sem saber.
// As duas consultas da auditoria (shared/auditoria.js, comum a todos os módulos) vão sem o SET: um erro nelas cai no catch, e o rollback desfaz.
async function abrirTransacao(pool) {
  const t = new sql.Transaction(pool);
  await t.begin();
  return t;
}

// o pedido ao banco dentro da transação: toda consulta dele leva o SET XACT_ABORT ON no próprio lote
function pedidoNaTransacao(t) {
  const pedido = new sql.Request(t);
  const consultar = pedido.query.bind(pedido);
  pedido.query = (texto, ...resto) => consultar(`SET XACT_ABORT ON;\n${texto}`, ...resto);
  return pedido;
}

async function fecharTransacao(t, ok) {
  // quando o próprio banco já desfez a transação (o XACT_ABORT), o mssql já devolveu a conexão: o rollback falha calado
  try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { if (ok) throw e; }
}

// A última saída do bloco no livro (regra de 24/11/2026: o bloco pode sair mais de uma vez): a entrega em curso, quando ele está entregue. Lida
// com a linha do bloco já travada, na mesma transação. null = o bloco nunca saiu.
async function ultimaSaida(t, blocoId) {
  const s = (await pedidoNaTransacao(t).input("b", sql.Int, blocoId).query(`
    SELECT TOP 1 RegistroId, PrimeiraFolha FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = @b ORDER BY RegistroId DESC`)).recordset[0];
  return s ? { id: Number(s.RegistroId), primeiraFolha: Number(s.PrimeiraFolha) } : null;
}

// A faixa do bloco agora, para as leituras (o bloco é "b"): entregue ou devolvido, a da última saída; na Geral depois de uma devolução parcial, a
// que voltou livre (da primeira em branco ao fim); na Geral sem nunca ter saído, o bloco inteiro. Usadas = as folhas com destino dessa faixa: as de
// antes dela são de entregas anteriores (usadas, ou sem destino com a congregação que devolveu) e não contam aqui nem como usadas nem como livres.
// Herdadas = as da faixa marcadas numa entrega anterior (só a inexistente pode estar lá: resposta dele de 24/11/2026, a parcial passa com ela);
// contam como usadas (não estão livres), mas não tiram o "esperando" de quem recebeu o bloco de novo: a situação vem de UsadasDaEntrega.
const FAIXA_ATUAL = `
  OUTER APPLY (SELECT TOP 1 s.RegistroId, s.PrimeiraFolha FROM FinLivroBlocos s WHERE s.Tipo = 'SAIDA' AND s.BlocoId = b.BlocoId ORDER BY s.RegistroId DESC) sa
  OUTER APPLY (SELECT TOP 1 e.Parcial, e.PrimeiraFolha FROM FinLivroBlocos e WHERE e.Tipo = 'ENTRADA' AND e.BlocoId = b.BlocoId ORDER BY e.RegistroId DESC) en
  CROSS APPLY (SELECT CASE WHEN b.Situacao = 'NA_GERAL' AND en.Parcial = 1 THEN 1 ELSE 0 END AS VoltouParcial) vp
  CROSS APPLY (SELECT CASE WHEN vp.VoltouParcial = 1 THEN en.PrimeiraFolha WHEN b.Situacao = 'NA_GERAL' THEN b.PrimeiraFolha
                           ELSE ISNULL(sa.PrimeiraFolha, b.PrimeiraFolha) END AS Inicio) fx
  CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.BlocoId = b.BlocoId AND f.Folha >= fx.Inicio) u
  CROSS APPLY (SELECT COUNT(*) AS Herdadas FROM FinFolhas f WHERE f.BlocoId = b.BlocoId AND f.Folha >= fx.Inicio
                 AND (vp.VoltouParcial = 1 OR f.SaidaId < sa.RegistroId)) h
  CROSS APPLY (SELECT u.Usadas - h.Herdadas AS UsadasDaEntrega) ue`;
const faixaDaLinha = (l) => ({ primeiraFolha: Number(l.Inicio), ultimaFolha: Number(l.UltimaFolha) });
const livresDaLinha = (l) => Number(l.UltimaFolha) - Number(l.Inicio) + 1 - Number(l.Usadas);

// Quem está vendo (o título da página e o cabeçalho do módulo): a Geral, ou quantas congregações ativas a pessoa alcança, a área delas (quando é
// uma só) e a congregação (quando é uma só). Desenho: "Sede administrativa · as 45 congregações", "Área 2 · 12 congregações", "Congregação Vila Nova".
async function escopoDaTela(pool, usuario, geral) {
  const todas = (await pool.request().query(`
    SELECT c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId WHERE c.Ativa = 1`)).recordset;
  const alcance = usuario && usuario.escopoCongregacoes;
  const minhas = geral || alcance === "TODAS" ? todas : todas.filter((c) => Array.isArray(alcance) && c.Nome && alcance.includes(c.Nome));
  const areas = [...new Set(minhas.map((c) => c.Area).filter(Boolean))];
  return {
    geral: !!geral, congregacoes: minhas.length,
    area: !geral && areas.length === 1 ? areas[0] : null,
    congregacao: !geral && minhas.length === 1 ? minhas[0].Nome : null
  };
}

// A lista dos blocos (páginas de 40), com o uso das folhas, o quadro do alto à direita e quem está vendo. O uso é o da faixa de agora: o bloco que
// voltou em parte aparece na Geral como "parcial", com as folhas livres que voltaram (a r30: "parcial · 15 livres").
// `geral`: a sessão é do nível geral; `congregacaoId`: a congregação escolhida no seletor (já conferida no escopo pela rota), ou null = todas.
async function listar(pool, usuario, { geral, congregacaoId, filtro, procura, pagina }) {
  const escopo = await escopoDaTela(pool, usuario, geral);
  const quadro = () => resumo(pool, usuario, { geral, congregacaoId, variasCongregacoes: escopo.congregacoes > 1 });
  const pedido = pool.request();
  const onde = [];
  if (!geral) {
    onde.push("b.CongregacaoId IS NOT NULL");
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "b.CongregacaoId");
    if (cond === "") return { blocos: [], total: 0, pagina: 1, porPagina: regra.POR_PAGINA, resumo: await quadro(), escopo };
    if (cond) onde.push(cond);
  }
  if (congregacaoId) { pedido.input("cong", sql.Int, congregacaoId); onde.push("b.CongregacaoId = @cong"); }
  if (procura === undefined) onde.push("1 = 0");
  else if (procura !== null) { pedido.input("n", sql.Int, procura); onde.push("(b.Numero = @n OR @n BETWEEN b.PrimeiraFolha AND b.UltimaFolha)"); }
  if (filtro === "na-geral") onde.push(geral ? "b.Situacao = 'NA_GERAL'" : "1 = 0");
  else if (filtro === "fechado") onde.push("b.Situacao = 'DEVOLVIDO'");
  else if (filtro === "esperando") onde.push("b.Situacao = 'ENTREGUE' AND ue.UsadasDaEntrega = 0");
  else if (filtro === "em-uso") onde.push("b.Situacao = 'ENTREGUE' AND ue.UsadasDaEntrega > 0");
  pedido.input("pular", sql.Int, (pagina - 1) * regra.POR_PAGINA).input("porPagina", sql.Int, regra.POR_PAGINA);
  const r = await pedido.query(`
    SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.ChegouEm, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao,
           fx.Inicio, vp.VoltouParcial, u.Usadas, ue.UsadasDaEntrega, COUNT(*) OVER () AS Total
    FROM FinBlocos b
    LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
    ${FAIXA_ATUAL}
    ${onde.length ? "WHERE " + onde.join(" AND ") : ""}
    ORDER BY CASE b.Situacao WHEN 'ENTREGUE' THEN 0 WHEN 'DEVOLVIDO' THEN 1 ELSE 2 END, b.EntregueEm DESC, b.Numero
    OFFSET @pular ROWS FETCH NEXT @porPagina ROWS ONLY`);
  const linhas = r.recordset;
  return {
    blocos: linhas.map((l) => {
      const usadas = Number(l.Usadas);
      return {
        id: Number(l.BlocoId), numero: Number(l.Numero), primeiraFolha: Number(l.PrimeiraFolha), ultimaFolha: Number(l.UltimaFolha),
        congregacao: l.CongregacaoId ? { id: Number(l.CongregacaoId), nome: l.Congregacao } : null,
        situacao: regra.situacaoDoBloco(l.Situacao, Number(l.UsadasDaEntrega)), usadas, livres: livresDaLinha(l),
        parcial: Number(l.VoltouParcial) === 1, faixa: faixaDaLinha(l),
        chegouEm: iso(l.ChegouEm), entregueEm: iso(l.EntregueEm), devolvidoEm: iso(l.DevolvidoEm)
      };
    }),
    total: linhas.length ? Number(linhas[0].Total) : 0, pagina, porPagina: regra.POR_PAGINA,
    resumo: await quadro(), escopo
  };
}

// O quadro da direita: na Geral e na área (o desenho mostra o mesmo quadro às duas), o lote da gráfica mais novo (quantos blocos e folhas, quantas
// chegaram e quantas faltam); na congregação (o alcance é uma congregação, ou a Geral escolheu uma), "Seus blocos" (em uso ou esperando, e as
// folhas livres deles).
async function resumo(pool, usuario, { geral, congregacaoId, variasCongregacoes = false }) {
  if (!congregacaoId && (geral || variasCongregacoes)) {
    const l = (await pool.request().query(`
      SELECT TOP 1 l.LoteId, l.Serie, l.PrimeiraFolha, l.UltimaFolha, l.FolhasPorBloco,
             (SELECT COUNT(*) FROM FinBlocos b WHERE b.LoteId = l.LoteId) AS Blocos,
             (SELECT COUNT(*) FROM FinBlocos b WHERE b.LoteId = l.LoteId AND b.ChegouEm IS NOT NULL) AS BlocosChegaram
      FROM FinLotesGrafica l ORDER BY l.LoteId DESC`)).recordset[0];
    if (!l) return { tipo: "lote", lote: null };
    const porBloco = Number(l.FolhasPorBloco);
    const folhas = Number(l.UltimaFolha) - Number(l.PrimeiraFolha) + 1;
    const chegaram = Number(l.BlocosChegaram) * porBloco;
    return {
      tipo: "lote",
      lote: { id: Number(l.LoteId), serie: Number(l.Serie), primeiraFolha: Number(l.PrimeiraFolha), ultimaFolha: Number(l.UltimaFolha), folhasPorBloco: porBloco,
        blocos: Number(l.Blocos), folhas, folhasChegaram: chegaram, blocosChegaram: Number(l.BlocosChegaram), folhasFaltam: folhas - chegaram }
    };
  }
  const pedido = pool.request();
  const onde = ["b.Situacao = 'ENTREGUE'"];
  if (congregacaoId) { pedido.input("cong", sql.Int, congregacaoId); onde.push("b.CongregacaoId = @cong"); }
  else if (!geral) {
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "b.CongregacaoId");
    if (cond === "") return { tipo: "seus", emUsoOuEsperando: 0, folhasLivres: 0 };
    if (cond) onde.push(cond);
  }
  const r = (await pedido.query(`
    SELECT COUNT(*) AS Blocos, ISNULL(SUM(b.UltimaFolha - fx.Inicio + 1 - u.Usadas), 0) AS Livres
    FROM FinBlocos b ${FAIXA_ATUAL}
    WHERE ${onde.join(" AND ")}`)).recordset[0] || {};
  return { tipo: "seus", emUsoOuEsperando: Number(r.Blocos || 0), folhasLivres: Number(r.Livres || 0) };
}

// Cadastrar o lote da gráfica (só a Tesouraria Geral): cria os blocos numerados e a linha "Cadastro" do livro. A faixa de folhas não pode cruzar
// a de nenhum lote já cadastrado (a numeração da série nunca se repete).
async function cadastrarLote(pool, { dados, por }) {
  const v = regra.blocosDoLote(dados);
  if (v.erro) return { sucesso: false, mensagem: v.erro };
  const { lote, blocos } = v;
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    if (!(await obterTrava(() => pedidoNaTransacao(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro lote está sendo cadastrado agora. Tente de novo.");
    const cruza = (await pedidoNaTransacao(t).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .query(`SELECT TOP 1 Serie, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE PrimeiraFolha <= @u AND UltimaFolha >= @p`)).recordset[0];
    if (cruza) return { sucesso: false, mensagem: `As folhas ${milhar(lote.primeiraFolha)} a ${milhar(lote.ultimaFolha)} cruzam o lote da série ${cruza.Serie} (${milhar(cruza.PrimeiraFolha)} a ${milhar(cruza.UltimaFolha)}).` };
    const numeros = (await pedidoNaTransacao(t).input("a", sql.Int, blocos[0].numero).input("b", sql.Int, blocos[blocos.length - 1].numero)
      .query(`SELECT TOP 1 Numero FROM FinBlocos WHERE Numero BETWEEN @a AND @b`)).recordset[0];
    if (numeros) return { sucesso: false, mensagem: `O bloco ${milhar(numeros.Numero)} já existe: confira a primeira folha do lote.` };
    const loteId = (await pedidoNaTransacao(t).input("s", sql.SmallInt, lote.serie).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .input("f", sql.SmallInt, lote.folhasPorBloco).input("por", sql.Int, por)
      .query(`INSERT INTO FinLotesGrafica (Serie, PrimeiraFolha, UltimaFolha, FolhasPorBloco, CriadoPor) OUTPUT INSERTED.LoteId VALUES (@s, @p, @u, @f, @por)`)).recordset[0].LoteId;
    // os blocos de uma vez (uma ida ao banco por 200 blocos, não 200 idas)
    await pedidoNaTransacao(t).input("lote", sql.Int, loteId).input("blocos", sql.NVarChar(sql.MAX), JSON.stringify(blocos))
      .query(`INSERT INTO FinBlocos (LoteId, Numero, PrimeiraFolha, UltimaFolha)
              SELECT @lote, j.numero, j.primeiraFolha, j.ultimaFolha
              FROM OPENJSON(@blocos) WITH (numero INT '$.numero', primeiraFolha INT '$.primeiraFolha', ultimaFolha INT '$.ultimaFolha') j`);
    // a Quantidade do livro conta BLOCOS, no cadastro e na chegada (revisão M7)
    await pedidoNaTransacao(t).input("lote", sql.Int, loteId).input("q", sql.Int, blocos.length).input("d", sql.Date, hojeBrasilia()).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor) VALUES ('CADASTRO', @lote, @q, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLotesGrafica", registroId: loteId, acao: "FIN_LOTE_CADASTRADO", usuarioId: por,
      dadosDepois: { serie: lote.serie, primeiraFolha: lote.primeiraFolha, ultimaFolha: lote.ultimaFolha, blocos: blocos.length } });
    ok = true;
    return { sucesso: true, loteId, blocos: blocos.length, mensagem: `Lote da série ${lote.serie} cadastrado: ${milhar(blocos.length)} blocos, folhas ${milhar(lote.primeiraFolha)} a ${milhar(lote.ultimaFolha)}.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// A chegada da gráfica (só a Tesouraria Geral): os blocos do lote até a folha informada passam a estar na Geral, prontos para entregar.
async function registrarChegada(pool, { loteId, ateFolha, data, por }) {
  const id = inteiroPositivo(loteId), ate = inteiroPositivo(ateFolha);
  if (!id) return { sucesso: false, naoExiste: true };
  if (!ate) return { sucesso: false, mensagem: "Informe até que folha chegou." };
  const dia = data == null || data === "" ? hojeBrasilia() : data;
  if (!dataValida(dia) || dia > hojeBrasilia()) return { sucesso: false, mensagem: "A data da chegada não confere." };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    if (!(await obterTrava(() => pedidoNaTransacao(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro registro do lote está em andamento. Tente de novo.");
    const lote = (await pedidoNaTransacao(t).input("id", sql.Int, id).query(`SELECT LoteId, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE LoteId = @id`)).recordset[0];
    if (!lote) return { sucesso: false, naoExiste: true };
    if (ate < lote.PrimeiraFolha || ate > lote.UltimaFolha) return { sucesso: false, mensagem: `A folha ${milhar(ate)} não é deste lote (${milhar(lote.PrimeiraFolha)} a ${milhar(lote.UltimaFolha)}).` };
    const r = await pedidoNaTransacao(t).input("id", sql.Int, id).input("ate", sql.Int, ate).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET ChegouEm = @d OUTPUT INSERTED.BlocoId WHERE LoteId = @id AND UltimaFolha <= @ate AND ChegouEm IS NULL`);
    const n = r.recordset.length;
    if (!n) {
      // nenhum bloco mudou: ou já tinham chegado, ou a folha fica no meio do primeiro bloco que falta (nenhum chegou inteiro)
      const v = (await pedidoNaTransacao(t).input("id", sql.Int, id).input("ate", sql.Int, ate).query(`
        SELECT (SELECT COUNT(*) FROM FinBlocos WHERE LoteId = @id AND UltimaFolha <= @ate) AS Inteiros, m.Numero, m.UltimaFolha
        FROM (SELECT 1 AS um) u OUTER APPLY (SELECT TOP 1 Numero, UltimaFolha FROM FinBlocos WHERE LoteId = @id AND UltimaFolha >= @ate ORDER BY UltimaFolha) m`)).recordset[0];
      if (!Number(v.Inteiros) && v.Numero != null) {
        return { sucesso: false, mensagem: `Até a folha ${milhar(ate)} nenhum bloco chegou inteiro: o bloco ${milhar(v.Numero)} vai até a folha ${milhar(v.UltimaFolha)}.` };
      }
      ok = true;
      return { sucesso: true, blocos: 0, mensagem: "Esses blocos já estavam registrados como chegados." };
    }
    await pedidoNaTransacao(t).input("lote", sql.Int, id).input("q", sql.Int, n).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor) VALUES ('CHEGADA', @lote, @q, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLotesGrafica", registroId: id, acao: "FIN_LOTE_CHEGADA", usuarioId: por, dadosDepois: { ateFolha: ate, blocos: n } });
    ok = true;
    return { sucesso: true, blocos: n, mensagem: n === 1 ? "Chegou 1 bloco da gráfica." : `Chegaram ${milhar(n)} blocos da gráfica.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// A saída (só a Tesouraria Geral): o bloco que chegou e está na Geral é entregue a alguém de uma congregação. A área pode levar, mas o bloco nunca
// fica com ela: fica registrado como "levado pela área" e passa a ser da congregação. Regra de 24/11/2026 com o detalhe da r30: o bloco que voltou
// em parte sai de novo SÓ com as folhas livres, pela primeira em branco da devolução, e a data não vem antes da volta; a saída guarda a faixa.
async function entregar(pool, { primeiraFolha, congregacaoId, pessoa, levadoPelaArea, data, por }) {
  const pf = inteiroPositivo(primeiraFolha), cong = inteiroPositivo(congregacaoId);
  if (!pf) return { sucesso: false, mensagem: "Informe a primeira folha do bloco." };
  if (!cong) return { sucesso: false, mensagem: "Escolha a congregação." };
  const p = regra.pessoaDoLivro(pessoa, "Informe a quem o bloco foi entregue.");
  if (p.erro) return { sucesso: false, mensagem: p.erro };
  const { membroId, nome } = p;
  // "levado pela área": sim ou não; o texto "true" ou outro valor não vira "não" calado (revisão M5)
  const area = regra.levadoPelaArea(levadoPelaArea);
  if (area === null) return { sucesso: false, mensagem: "Diga se o bloco foi levado pela área (sim ou não)." };
  const dia = data == null || data === "" ? hojeBrasilia() : data;
  if (!dataValida(dia) || dia > hojeBrasilia()) return { sucesso: false, mensagem: "A data da entrega não confere." };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const c = (await pedidoNaTransacao(t).input("c", sql.Int, cong).query(`SELECT Nome, Ativa FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
    if (!c) return { sucesso: false, mensagem: "Escolha a congregação." };
    if (!c.Ativa) return { sucesso: false, mensagem: `A congregação ${c.Nome} não está ativa: o bloco só sai para congregação ativa.` };   // revisão M3
    if (membroId !== null) {
      const m = (await pedidoNaTransacao(t).input("m", sql.Int, membroId).query(`SELECT 1 AS ok FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!m) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
    }
    // como na exceção da folha: acha o bloco sem trava e trava só a linha dele, pela chave (travar a faixa do índice dava impasse; a exceção, o
    // desfazer e a devolução travam a mesma linha antes de mexer nas folhas; a última volta do bloco só se lê depois da trava)
    const achado = (await pedidoNaTransacao(t).input("pf", sql.Int, pf)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @pf AND UltimaFolha >= @pf ORDER BY PrimeiraFolha DESC`)).recordset[0];
    const b = achado && (await pedidoNaTransacao(t).input("id", sql.Int, achado.BlocoId).query(`
      SELECT BlocoId, Numero, PrimeiraFolha, UltimaFolha, Situacao, ChegouEm, DevolvidoEm FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @id`)).recordset[0];
    const naoComeca = { sucesso: false, mensagem: `Não há bloco que comece na folha ${milhar(pf)}.` };
    if (!b) return naoComeca;
    const volta = (await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).query(`
      SELECT TOP 1 Parcial, PrimeiraFolha, DataRegistro FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = @id ORDER BY RegistroId DESC`)).recordset[0];
    // por onde o bloco sai: o que voltou em parte, só pela primeira em branco da devolução (as folhas antes dela são da entrega anterior); o que
    // nunca saiu, pela primeira folha; o entregue ou devolvido, pela primeira folha ou por onde saiu da última vez (para a recusa certa)
    const voltouParcial = b.Situacao === "NA_GERAL" && !!volta && volta.Parcial === true;
    if (voltouParcial) {
      if (pf !== Number(volta.PrimeiraFolha)) return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} volta a sair pela folha ${milhar(volta.PrimeiraFolha)}, a primeira livre.` };
    } else {
      const saiuPor = b.Situacao === "NA_GERAL" ? null : ((await ultimaSaida(t, b.BlocoId)) || {}).primeiraFolha;
      if (pf !== Number(b.PrimeiraFolha) && pf !== saiuPor) return naoComeca;
    }
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido em ${dataBr(b.DevolvidoEm)}.` };
    if (b.Situacao !== "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi entregue.` };
    if (!b.ChegouEm) return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda não chegou da gráfica.` };
    // a entrega não vem antes da chegada da gráfica (revisão M2; a devolução já confere a data contra a entrega) nem antes da volta do bloco (r30)
    if (dia < iso(b.ChegouEm)) return { sucesso: false, mensagem: `A data da entrega é antes da chegada do bloco da gráfica (${dataBr(b.ChegouEm)}).` };
    if (voltouParcial && dia < iso(volta.DataRegistro)) return { sucesso: false, mensagem: `A data da entrega é antes da volta do bloco (${dataBr(volta.DataRegistro)}).` };
    await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET Situacao = 'ENTREGUE', CongregacaoId = @c, EntregueEm = @d WHERE BlocoId = @id AND Situacao = 'NA_GERAL'`);
    const inicio = voltouParcial ? Number(volta.PrimeiraFolha) : Number(b.PrimeiraFolha);
    const ultima = Number(b.UltimaFolha);
    const reg = (await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("m", sql.Int, membroId).input("n", sql.NVarChar(200), nome)
      .input("area", sql.Bit, area).input("d", sql.Date, dia).input("por", sql.Int, por).input("de", sql.Int, inicio).input("ate", sql.Int, ultima)
      .input("bp", sql.Int, Number(b.PrimeiraFolha))
      .query(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaMembroId, PessoaNome, LevadoPelaArea, DataRegistro, RegistradoPor, PrimeiraFolha, UltimaFolha, BlocoPrimeiraFolha)
              OUTPUT INSERTED.RegistroId VALUES ('SAIDA', @id, @c, @m, @n, @area, @d, @por, @de, @ate, @bp)`)).recordset[0].RegistroId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinBlocos", registroId: b.BlocoId, acao: "FIN_BLOCO_ENTREGUE", usuarioId: por,
      dadosDepois: { congregacaoId: cong, livro: reg, levadoPelaArea: area, primeiraFolha: inicio, ultimaFolha: ultima } });
    ok = true;
    const faixa = inicio === Number(b.PrimeiraFolha) ? "" : ` (folhas ${milhar(inicio)} a ${milhar(ultima)})`;
    return { sucesso: true, mensagem: `Bloco ${milhar(b.Numero)} entregue a ${c.Nome}${faixa}.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// ---- incremento 2 (22/11/2026): as folhas de um bloco, a exceção da folha, o livro, o rastreio e a devolução ----

// A última volta do bloco à Tesouraria Geral (a r30): de que congregação, em que dia e quantas folhas a entrega usou. "Usadas" é a faixa da entrega
// até a folha antes da primeira em branco (as 35 do 1.288: as com destino e as que ficaram sem destino com a congregação), nunca só as com destino.
async function ultimaVolta(pool, blocoId) {
  const v = (await pool.request().input("b", sql.Int, blocoId).query(`
    SELECT TOP 1 c.Nome AS Congregacao, e.DataRegistro, e.Parcial, e.PrimeiraFolha AS Branco, s.PrimeiraFolha AS EntregaDe, b.UltimaFolha
    FROM FinLivroBlocos e
    JOIN FinLivroBlocos s ON s.RegistroId = e.SaidaId
    JOIN FinBlocos b ON b.BlocoId = e.BlocoId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE e.Tipo = 'ENTRADA' AND e.BlocoId = @b ORDER BY e.RegistroId DESC`)).recordset[0];
  if (!v) return null;
  const ate = v.Parcial === true ? Number(v.Branco) - 1 : Number(v.UltimaFolha);
  return { congregacao: v.Congregacao || "", data: iso(v.DataRegistro), usadas: ate - Number(v.EntregaDe) + 1 };
}

const blocoDaLinha = (l) => ({
  id: Number(l.BlocoId), numero: Number(l.Numero), primeiraFolha: Number(l.PrimeiraFolha), ultimaFolha: Number(l.UltimaFolha),
  congregacao: l.CongregacaoId ? { id: Number(l.CongregacaoId), nome: l.Congregacao } : null,
  situacao: regra.situacaoDoBloco(l.Situacao, Number(l.UsadasDaEntrega ?? l.Usadas ?? 0)), entregueEm: iso(l.EntregueEm), devolvidoEm: iso(l.DevolvidoEm)
});

// As folhas de um bloco (a grade das 50 e o formulário da exceção). A Geral vê o bloco como está agora: os que já saíram (entregues ou devolvidos)
// e, pedido pelo número, o que voltou em parte e está com ela. A área e a congregação veem as ENTREGAS às congregações do seu escopo (regra de
// 24/11/2026, com o detalhe da r30): de cada bloco, a última entrega que alcançam. Na entrega em curso (ou fechada pela devolução completa), as
// folhas até o fim do bloco; na que voltou em parte, só até a folha antes da primeira em branco: quem devolveu continua vendo as suas folhas, sem
// ver o que acontece com as livres depois. O cabeçalho e o seletor vêm da entrega vista (a congregação, a data da entrega e a da volta), nunca do
// bloco de agora. As folhas de uma entrega anterior aparecem só para consulta; a observação, só a de folha usada numa entrega a uma congregação que
// a pessoa alcança (a Geral vê todas). A entrega que voltou sem uso nenhum não tem folha para ver.
// `blocoId` vazio = a entrega em uso mais recente (senão a esperando, senão a última fechada). As opções do seletor "Bloco 1.401 · Vila Nova ▾":
// as em curso e as 50 fechadas mais novas. Fora do escopo e "não existe": a mesma resposta.
async function folhasDoBloco(pool, usuario, { geral, blocoId }) {
  const escopo = await escopoDaTela(pool, usuario, geral);
  const pedido = pool.request();
  if (blocoId) pedido.input("id", sql.Int, blocoId);
  let vistas;
  if (geral) {
    vistas = `
      SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao,
             fx.Inicio AS De, b.UltimaFolha AS Ate, vp.VoltouParcial AS Parcial, u.Usadas, ue.UsadasDaEntrega, CASE WHEN b.Situacao = 'DEVOLVIDO' THEN 1 ELSE 0 END AS Fechada
      FROM FinBlocos b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      ${FAIXA_ATUAL}
      WHERE b.Situacao IN ('ENTREGUE', 'DEVOLVIDO') OR vp.VoltouParcial = 1`;
  } else {
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "s.CongregacaoId");
    if (cond === "") return blocoId ? { naoExiste: true } : { sucesso: true, bloco: null, folhas: [], opcoes: [], escopo };
    // a entrega fechada pela parcial vai até a folha antes da primeira em branco (a que voltou sem uso, com a primeira em branco na primeira
    // folha da entrega, fica de fora); a em curso e a fechada pela completa, até o fim do bloco
    vistas = `
      SELECT v.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, v.EntregueEm, v.DevolvidoEm, v.CongregacaoId, v.Congregacao,
             v.De, x.Ate, v.Parcial, u.Usadas, u.Usadas - h.Herdadas AS UsadasDaEntrega, CASE WHEN v.EntradaId IS NULL THEN 0 ELSE 1 END AS Fechada
      FROM (
        SELECT s.BlocoId, s.RegistroId AS SaidaId, s.CongregacaoId, c.Nome AS Congregacao, s.PrimeiraFolha AS De, s.DataRegistro AS EntregueEm,
               e.RegistroId AS EntradaId, e.DataRegistro AS DevolvidoEm, e.Parcial, e.PrimeiraFolha AS Branco,
               ROW_NUMBER() OVER (PARTITION BY s.BlocoId ORDER BY s.RegistroId DESC) AS DaVez
        FROM FinLivroBlocos s
        JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId
        LEFT JOIN FinLivroBlocos e ON e.Tipo = 'ENTRADA' AND e.SaidaId = s.RegistroId
        WHERE s.Tipo = 'SAIDA' AND (e.RegistroId IS NULL OR e.Parcial = 0 OR e.PrimeiraFolha > s.PrimeiraFolha) ${cond ? "AND " + cond : ""}
      ) v
      JOIN FinBlocos b ON b.BlocoId = v.BlocoId
      CROSS APPLY (SELECT CASE WHEN v.Parcial = 1 THEN v.Branco - 1 ELSE b.UltimaFolha END AS Ate) x
      CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.BlocoId = v.BlocoId AND f.Folha BETWEEN v.De AND x.Ate) u
      CROSS APPLY (SELECT COUNT(*) AS Herdadas FROM FinFolhas f WHERE f.BlocoId = v.BlocoId AND f.Folha BETWEEN v.De AND x.Ate AND f.SaidaId < v.SaidaId) h
      WHERE v.DaVez = 1`;
  }
  const linhas = (await pedido.query(`
    WITH vistas AS (${vistas}),
    ordenadas AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY Fechada ORDER BY DevolvidoEm DESC, Numero DESC) AS OrdemFechada FROM vistas)
    SELECT *, CASE WHEN ${blocoId ? "BlocoId = @id" : "1 = 0"} THEN 1 ELSE 0 END AS Pedido FROM ordenadas
    WHERE Fechada = 0 OR OrdemFechada <= 50 ${blocoId ? "OR BlocoId = @id" : ""}
    ORDER BY Fechada, CASE WHEN Fechada = 0 THEN Numero END, DevolvidoEm DESC, Numero DESC`)).recordset;
  const situacao = (l) => (Number(l.Fechada) ? "fechado" : regra.situacaoDoBloco(l.Situacao, Number(l.UsadasDaEntrega)));
  let escolhido;
  if (blocoId) {
    escolhido = linhas.find((l) => Number(l.Pedido) === 1);
    if (!escolhido) return { naoExiste: true };
  } else {
    const emCurso = linhas.filter((l) => !Number(l.Fechada) && l.Situacao === "ENTREGUE");
    const recente = (a, b) => String(iso(b.EntregueEm)).localeCompare(String(iso(a.EntregueEm))) || Number(b.Numero) - Number(a.Numero);
    escolhido = emCurso.filter((l) => Number(l.UsadasDaEntrega) > 0).sort(recente)[0] || emCurso.sort(recente)[0] || linhas.find((l) => Number(l.Fechada));
  }
  // o seletor da r30 (em todos os níveis): de cada bloco, a congregação (null = está com a Geral, depois de voltar em parte), a situação, a data da
  // entrega e a da volta, se a devolução foi parcial, a faixa vista e quantas folhas dela têm destino. Os textos ("38 com destino · 12 livres",
  // "recebido em 25/11 · 50 livres", "parcial: as 35 usadas, só consulta") a tela escreve.
  const opcoes = linhas.map((l) => ({
    id: Number(l.BlocoId), numero: Number(l.Numero), congregacao: l.Congregacao || null, situacao: situacao(l),
    entregueEm: iso(l.EntregueEm), devolvidoEm: iso(l.DevolvidoEm), parcial: Number(l.Parcial) === 1,
    faixa: { primeiraFolha: Number(l.De), ultimaFolha: Number(l.Ate) }, usadas: Number(l.Usadas)
  }));
  if (!escolhido) return { sucesso: true, bloco: null, folhas: [], opcoes, escopo };
  const f = await pool.request().input("b", sql.Int, escolhido.BlocoId).input("ate", sql.Int, Number(escolhido.Ate)).query(`
    SELECT f.Folha, f.Destino, f.Observacao, c.Nome AS CongregacaoDaEntrega
    FROM FinFolhas f
    LEFT JOIN FinLivroBlocos s ON s.RegistroId = f.SaidaId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId
    WHERE f.BlocoId = @b AND f.Folha <= @ate ORDER BY f.Folha`);
  const de = Number(escolhido.De), ate = Number(escolhido.Ate), usadas = Number(escolhido.Usadas);
  const verObservacao = (x) => x.Destino !== "LANCADA" && (geral || (!!x.CongregacaoDaEntrega && auth.estaNoEscopo(usuario, x.CongregacaoDaEntrega)));
  // o bloco que voltou em parte e está com a Geral: de onde voltou, quando e quantas a entrega usou (o cartão "O bloco 1.288 voltou parcial em 03/11")
  const volta = geral && escolhido.Situacao === "NA_GERAL" ? await ultimaVolta(pool, escolhido.BlocoId) : null;
  return {
    sucesso: true,
    bloco: {
      id: Number(escolhido.BlocoId), numero: Number(escolhido.Numero), primeiraFolha: Number(escolhido.PrimeiraFolha), ultimaFolha: Number(escolhido.UltimaFolha),
      congregacao: escolhido.CongregacaoId ? { id: Number(escolhido.CongregacaoId), nome: escolhido.Congregacao } : null,
      situacao: situacao(escolhido), entregueEm: iso(escolhido.EntregueEm), devolvidoEm: iso(escolhido.DevolvidoEm),
      parcial: Number(escolhido.Parcial) === 1, faixa: { primeiraFolha: de, ultimaFolha: ate }, usadas, livres: ate - de + 1 - usadas, volta
    },
    folhas: f.recordset.map((x) => ({ folha: Number(x.Folha), destino: regra.destinoDaTela(x.Destino), observacao: verObservacao(x) ? x.Observacao : null })),
    opcoes, escopo
  };
}

// A exceção de uma folha (cancelada, arrancada, extraviada ou inexistente, com a observação): só numa folha livre de um bloco que está com a
// congregação. Quem registra: quem tem a permissão financeiro e alcança a congregação do bloco (a Geral, a área, a congregação). A folha lançada vem
// do lançamento.
// O bloco fica travado na transação: a devolução e a exceção da mesma folha nunca se cruzam. Regra de 24/11/2026 com o detalhe da r30: só as folhas
// da entrega em curso (da primeira folha da saída ao fim); quem recebe o bloco que voltou em parte não marca as folhas de quem devolveu.
async function registrarFolha(pool, usuario, { geral, dados, por }) {
  const v = regra.excecaoDaFolha(dados);
  if (v.erro) return { sucesso: false, mensagem: v.erro };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    // as folhas de um bloco nunca mudam depois do cadastro: acha o bloco sem trava e trava só a linha dele, pela chave (travar a faixa do índice
    // prendia todos os blocos de folha menor e a corrida com a devolução dava impasse; o e2e-201 pegou)
    const achado = (await pedidoNaTransacao(t).input("f", sql.Int, v.folha)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @f AND UltimaFolha >= @f ORDER BY PrimeiraFolha DESC`)).recordset[0];
    // o nome da congregação vem na mesma leitura que trava o bloco: a conferência do escopo não pede outra conexão ao pool com a trava presa (revisão I4)
    const b = achado && (await pedidoNaTransacao(t).input("id", sql.Int, achado.BlocoId).query(`
      SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.Situacao, b.CongregacaoId, c.Nome AS Congregacao,
             (SELECT TOP 1 s.PrimeiraFolha FROM FinLivroBlocos s WHERE s.Tipo = 'SAIDA' AND s.BlocoId = b.BlocoId ORDER BY s.RegistroId DESC) AS SaidaDe
      FROM FinBlocos b WITH (UPDLOCK, ROWLOCK) LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId WHERE b.BlocoId = @id`)).recordset[0];
    // fora do escopo e "não existe" dão a mesma resposta; o bloco que ainda está na Geral só a Geral sabe que existe (a regra do escopo é a de
    // escopoRotas.congregacaoNoEscopo: auth.estaNoEscopo pelo nome da congregação)
    if (!b || (!geral && (!b.CongregacaoId || !auth.estaNoEscopo(usuario, b.Congregacao)))) return { sucesso: false, naoExiste: true };
    if (b.Situacao === "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda está na Tesouraria Geral: a folha só tem destino depois da entrega.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido: as folhas dele não mudam mais.` };
    if (v.folha < Number(b.SaidaDe)) {
      return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} é de uma entrega anterior do bloco ${milhar(b.Numero)}: aqui só se marcam as folhas desta entrega (a partir da ${milhar(b.SaidaDe)}).` };
    }
    const ja = (await pedidoNaTransacao(t).input("f", sql.Int, v.folha).query(`SELECT Destino FROM FinFolhas WHERE Folha = @f`)).recordset[0];
    if (ja) return MUDOU(`A folha ${milhar(v.folha)} já tem destino (${regra.destinoDaTela(ja.Destino)}).`);
    // a folha guarda a entrega em que foi usada (a última saída do bloco, que está entregue: regra de 24/11/2026)
    const id = (await pedidoNaTransacao(t).input("b", sql.Int, b.BlocoId).input("f", sql.Int, v.folha).input("d", sql.NVarChar(12), v.destino)
      .input("o", sql.NVarChar(300), v.observacao).input("por", sql.Int, por)
      .query(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor, SaidaId) OUTPUT INSERTED.FolhaId
              SELECT @b, @f, @d, @o, @por, (SELECT TOP 1 RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = @b ORDER BY RegistroId DESC)`)).recordset[0].FolhaId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinFolhas", registroId: id, acao: "FIN_FOLHA_EXCECAO", usuarioId: por,
      dadosDepois: { bloco: Number(b.Numero), folha: v.folha, destino: v.destino } });
    ok = true;
    const posicao = v.folha - Number(b.PrimeiraFolha) + 1;
    return { sucesso: true, mensagem: `Folha ${milhar(v.folha)} (${posicao}ª do bloco ${milhar(b.Numero)}) registrada como ${regra.destinoDaTela(v.destino)}.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// O livro de entrada e saída em páginas (5 no notebook, 3 no celular), do mais novo ao mais antigo. A Geral vê tudo (o cadastro e a chegada do
// lote também); a área e a congregação, as saídas e as entradas das congregações do seu escopo, e os blocos delas agora. Regra de 24/11/2026, com
// o detalhe da r30: a saída traz a faixa entregue; a entrada traz se foi parcial, a faixa que voltou livre e a contagem só das folhas da entrega
// que ela fecha (as livres que voltaram e as que ficaram sem destino com a congregação, os "pendentes"): a contagem não muda quando o bloco sai
// de novo.
async function livroDosBlocos(pool, usuario, { geral, pagina, porPagina }) {
  const escopo = await escopoDaTela(pool, usuario, geral);
  const pedido = pool.request();
  const onde = [];
  let agoraOnde = "b.Situacao = 'ENTREGUE'";
  const pedidoAgora = pool.request();
  if (!geral) {
    onde.push("l.Tipo IN ('SAIDA', 'ENTRADA')");
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "l.CongregacaoId");
    if (cond === "") return { sucesso: true, registros: [], total: 0, pagina: 1, porPagina, agora: { emUso: 0, esperando: 0, aDevolver: 0 }, escopo };
    if (cond) onde.push(cond);
    const condAgora = await condicaoSqlEscopoCongregacao(pool, usuario, pedidoAgora, "b.CongregacaoId");
    if (condAgora) agoraOnde += " AND " + condAgora;
  }
  pedido.input("pular", sql.Int, (pagina - 1) * porPagina).input("porPagina", sql.Int, porPagina);
  const r = await pedido.query(`
    SELECT l.RegistroId, l.Tipo, l.DataRegistro, l.LevadoPelaArea, l.Quantidade, l.PessoaNome, pm.Nome AS PessoaMembro, rp.Nome AS RegistradoPor,
           l.PrimeiraFolha AS FaixaPrimeira, l.UltimaFolha AS FaixaUltima, l.Parcial, sx.PrimeiraFolha AS EntregaDe, b.UltimaFolha AS BlocoUltima,
           b.Numero, c.Nome AS Congregacao, lg.Serie, lg.PrimeiraFolha AS LotePrimeira, lg.UltimaFolha AS LoteUltima,
           fa.ComDestinoNaEntrega, fa.ComDestinoNaFaixaLivre,
           (SELECT COUNT(*) FROM FinBlocos x WHERE x.LoteId = lg.LoteId) AS LoteBlocos, k.Lancadas, k.Canceladas, k.Arrancadas, k.Extraviadas, k.Inexistentes,
           COUNT(*) OVER () AS Total
    FROM FinLivroBlocos l
    LEFT JOIN FinBlocos b ON b.BlocoId = l.BlocoId
    LEFT JOIN FinLivroBlocos sx ON sx.RegistroId = l.SaidaId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    LEFT JOIN FinLotesGrafica lg ON lg.LoteId = l.LoteId
    LEFT JOIN MembroReferencia pm ON pm.MembroId = l.PessoaMembroId
    LEFT JOIN MembroReferencia rp ON rp.MembroId = l.RegistradoPor
    OUTER APPLY (SELECT SUM(CASE WHEN f.Destino = 'LANCADA' THEN 1 ELSE 0 END) AS Lancadas, SUM(CASE WHEN f.Destino = 'CANCELADA' THEN 1 ELSE 0 END) AS Canceladas,
                        SUM(CASE WHEN f.Destino = 'ARRANCADA' THEN 1 ELSE 0 END) AS Arrancadas, SUM(CASE WHEN f.Destino = 'EXTRAVIADA' THEN 1 ELSE 0 END) AS Extraviadas,
                        SUM(CASE WHEN f.Destino = 'INEXISTENTE' THEN 1 ELSE 0 END) AS Inexistentes
                 FROM FinFolhas f WHERE l.Tipo = 'ENTRADA' AND f.SaidaId = l.SaidaId) k
    OUTER APPLY (SELECT (SELECT COUNT(*) FROM FinFolhas f WHERE l.Tipo = 'ENTRADA' AND f.BlocoId = l.BlocoId AND (f.SaidaId IS NULL OR f.SaidaId <= l.SaidaId)
                           AND f.Folha BETWEEN sx.PrimeiraFolha AND CASE WHEN l.Parcial = 1 THEN l.PrimeiraFolha - 1 ELSE b.UltimaFolha END) AS ComDestinoNaEntrega,
                        (SELECT COUNT(*) FROM FinFolhas f WHERE l.Tipo = 'ENTRADA' AND l.Parcial = 1 AND f.BlocoId = l.BlocoId AND (f.SaidaId IS NULL OR f.SaidaId <= l.SaidaId)
                           AND f.Folha BETWEEN l.PrimeiraFolha AND l.UltimaFolha) AS ComDestinoNaFaixaLivre) fa
    ${onde.length ? "WHERE " + onde.join(" AND ") : ""}
    ORDER BY l.DataRegistro DESC, l.RegistroId DESC
    OFFSET @pular ROWS FETCH NEXT @porPagina ROWS ONLY`);
  const linhas = r.recordset;
  const agora = geral ? null : regra.blocosAgora((await pedidoAgora.query(`
    SELECT b.UltimaFolha - fx.Inicio + 1 AS Total, CASE WHEN ue.UsadasDaEntrega = 0 THEN 0 ELSE u.Usadas END AS Usadas FROM FinBlocos b ${FAIXA_ATUAL} WHERE ${agoraOnde}`)).recordset);
  return {
    sucesso: true,
    registros: linhas.map((l) => {
      const reg = { id: Number(l.RegistroId), tipo: String(l.Tipo).toLowerCase(), data: iso(l.DataRegistro), registradoPor: l.RegistradoPor || "" };
      if (l.Tipo === "CADASTRO" || l.Tipo === "CHEGADA") {
        return { ...reg, quantidade: l.Quantidade == null ? null : Number(l.Quantidade),
          lote: { serie: Number(l.Serie), primeiraFolha: Number(l.LotePrimeira), ultimaFolha: Number(l.LoteUltima), blocos: Number(l.LoteBlocos) } };
      }
      const base = { ...reg, bloco: Number(l.Numero), congregacao: l.Congregacao || "", pessoa: l.PessoaMembro || l.PessoaNome || "", levadoPelaArea: l.LevadoPelaArea === true };
      if (l.Tipo === "SAIDA") return { ...base, contagem: null, folhas: { primeiraFolha: Number(l.FaixaPrimeira), ultimaFolha: Number(l.FaixaUltima) } };
      // a entrega que a entrada fecha vai da primeira folha da saída até o fim do bloco (a completa) ou até a folha antes da primeira em branco (a
      // parcial); dela, as folhas sem destino são os pendentes (recibos ainda não lançados, que continuam com a congregação). A contagem é a das
      // folhas que esta entrega marcou; as pendentes e as livres se contam pela faixa, com o que esta entrega ou uma anterior marcou (a
      // inexistente continua inexistente: nunca vira pendente nem livre; o que a entrega seguinte marca não muda esta linha)
      const parcial = l.Parcial === true;
      const usadas = [l.Lancadas, l.Canceladas, l.Arrancadas, l.Extraviadas, l.Inexistentes].reduce((a, n) => a + (Number(n) || 0), 0);
      const livres = parcial ? Number(l.FaixaUltima) - Number(l.FaixaPrimeira) + 1 - Number(l.ComDestinoNaFaixaLivre || 0) : 0;
      const ate = parcial ? Number(l.FaixaPrimeira) - 1 : Number(l.BlocoUltima);
      const contagem = regra.contagemDasFolhas([
        { Destino: "LANCADA", N: l.Lancadas }, { Destino: "CANCELADA", N: l.Canceladas }, { Destino: "ARRANCADA", N: l.Arrancadas }, { Destino: "EXTRAVIADA", N: l.Extraviadas },
        { Destino: "INEXISTENTE", N: l.Inexistentes }
      ], usadas + livres);
      return { ...base, contagem, parcial, pendentes: Math.max(0, ate - Number(l.EntregaDe) + 1 - Number(l.ComDestinoNaEntrega || 0)),
        faixaLivre: parcial ? { primeiraFolha: Number(l.FaixaPrimeira), ultimaFolha: Number(l.FaixaUltima) } : null };
    }),
    total: linhas.length ? Number(linhas[0].Total) : 0, pagina, porPagina, agora, escopo
  };
}

// O rastreio do bloco (só a Tesouraria Geral, no "Registrar entrada"): pela primeira folha (ou qualquer folha dele), o bloco, com quem está, quando
// saiu, quantas folhas têm cada destino e as pessoas que podem devolver (quem o levou e a liderança da congregação; ou outra pessoa, escrita).
// A contagem é a da faixa de agora (a entrega em curso, quando entregue: o bloco pode ter saído antes e voltado em parte). Entregue, o rastreio
// sugere a primeira folha em branco da devolução parcial (a r30): a seguinte à última folha com destino da entrega, ignorando as inexistentes
// (null = não sobra nenhuma).
// Para o "Registrar saída" da r30: a chegada da gráfica e, no bloco que voltou em parte, de onde voltou, quando e quantas folhas ficaram usadas.
async function rastreio(pool, { folha }) {
  const f = inteiroPositivo(folha);
  if (!f) return { sucesso: false, mensagem: "Informe o número da primeira folha do bloco." };
  const b = (await pool.request().input("f", sql.Int, f).query(`
    SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.ChegouEm, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao,
           fx.Inicio, vp.VoltouParcial, u.Usadas, ue.UsadasDaEntrega,
           (SELECT MAX(x.Folha) FROM FinFolhas x WHERE x.BlocoId = b.BlocoId AND x.Folha >= fx.Inicio AND x.Destino <> 'INEXISTENTE') AS UltimaComDestino
    FROM FinBlocos b LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
    ${FAIXA_ATUAL}
    WHERE @f BETWEEN b.PrimeiraFolha AND b.UltimaFolha`)).recordset[0];
  if (!b) return { sucesso: false, mensagem: `Nenhum bloco tem a folha ${milhar(f)}.` };
  const inicio = Number(b.Inicio), ultima = Number(b.UltimaFolha);
  const saida = b.Situacao !== "ENTREGUE" ? null : (await pool.request().input("b", sql.Int, b.BlocoId).query(`
      SELECT TOP 1 l.RegistroId, l.PessoaMembroId, COALESCE(m.Nome, l.PessoaNome) AS Nome FROM FinLivroBlocos l LEFT JOIN MembroReferencia m ON m.MembroId = l.PessoaMembroId
      WHERE l.Tipo = 'SAIDA' AND l.BlocoId = @b ORDER BY l.RegistroId DESC`)).recordset[0];
  const destinos = (await pool.request().input("b", sql.Int, b.BlocoId).input("de", sql.Int, inicio)
    .query(`SELECT Destino, COUNT(*) AS N FROM FinFolhas WHERE BlocoId = @b AND Folha >= @de GROUP BY Destino`)).recordset;
  const contagem = regra.contagemDasFolhas(destinos, ultima - inicio + 1);
  const volta = Number(b.VoltouParcial) !== 1 ? null : await ultimaVolta(pool, b.BlocoId);
  let primeiraEmBranco = null;
  if (b.Situacao === "ENTREGUE") {
    // resposta dele (24/11/2026): a primeira em branco é procurada ignorando as inexistentes (a seguinte à última com outro destino, pulando as
    // inexistentes que vierem logo depois)
    const inexistentes = new Set((await pool.request().input("b", sql.Int, b.BlocoId).input("de", sql.Int, inicio)
      .query(`SELECT Folha FROM FinFolhas WHERE BlocoId = @b AND Folha >= @de AND Destino = 'INEXISTENTE'`)).recordset.map((x) => Number(x.Folha)));
    let seguinte = b.UltimaComDestino == null ? inicio : Number(b.UltimaComDestino) + 1;
    while (inexistentes.has(seguinte)) seguinte++;
    primeiraEmBranco = seguinte <= ultima ? seguinte : null;
  }
  let pessoas = [];
  if (b.Situacao === "ENTREGUE") {
    const lideres = (await pool.request().input("c", sql.Int, b.CongregacaoId).query(`
      SELECT m.MembroId, m.Nome, MIN(p.Nome) AS Papel
      FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      GROUP BY m.MembroId, m.Nome ORDER BY m.Nome`)).recordset;
    if (saida && saida.Nome) pessoas.push({ membroId: saida.PessoaMembroId ? Number(saida.PessoaMembroId) : null, nome: saida.Nome, papel: "quem levou o bloco" });
    for (const l of lideres) if (!pessoas.some((p) => p.membroId === Number(l.MembroId))) pessoas.push({ membroId: Number(l.MembroId), nome: l.Nome, papel: l.Papel || "" });
  }
  return {
    sucesso: true,
    bloco: { ...blocoDaLinha(b), usadas: Number(b.Usadas), livres: livresDaLinha(b), parcial: Number(b.VoltouParcial) === 1, faixa: faixaDaLinha(b), chegouEm: iso(b.ChegouEm) },
    contagem, primeiraEmBranco, pessoas,
    volta
  };
}

// A entrada (a devolução; só a Tesouraria Geral): o bloco que está com a congregação volta para a Geral. Quem recebe é quem está registrando (o nome
// de quem está logado entra sozinho); quem devolveu é alguém do cadastro ou o nome escrito. A data não pode ser antes da entrega nem depois de hoje.
// Regra dele (24/11/2026, no lugar da "só bloco cheio" de 23/11), com o detalhe da r30: a tesouraria diz se a devolução é COMPLETA ou PARCIAL, e
// nada se recusa por folha livre. Completa: o bloco fecha (o recibo ainda não lançado passa normalmente). Parcial: com a primeira folha em branco
// (o rastreio sugere), que tem de ser da entrega e vir depois da última folha com destino (a inexistente não conta: resposta dele de 24/11/2026);
// dela ao fim do bloco, as folhas voltam livres (a inexistente continua inexistente) e o bloco fica na Geral, para sair de novo só com elas; a folha
// sem destino antes dela continua com a congregação (nada se anula). A entrada guarda a saída
// que fecha e, na parcial, a faixa que voltou livre. A exceção e o desfazer travam a mesma linha do bloco antes de mexer nas folhas: o que se
// confere aqui não muda até o fim da transação.
async function devolver(pool, { primeiraFolha, pessoa, parcial, primeiraEmBranco, data, por }) {
  const pf = inteiroPositivo(primeiraFolha);
  if (!pf) return { sucesso: false, mensagem: "Informe a primeira folha do bloco." };
  const p = regra.pessoaDoLivro(pessoa, "Informe quem devolveu o bloco.");
  if (p.erro) return { sucesso: false, mensagem: p.erro };
  const emParte = regra.devolucaoParcial(parcial);
  if (emParte === null) return { sucesso: false, mensagem: "Diga se a devolução é completa ou parcial." };
  const branco = emParte ? inteiroPositivo(primeiraEmBranco) : null;
  if (emParte && !branco) return { sucesso: false, mensagem: "Informe a primeira folha em branco do bloco." };
  // a completa com a primeira em branco é um "parcial" que se perdeu no caminho: nunca fecha o bloco calada
  if (!emParte && !(primeiraEmBranco === undefined || primeiraEmBranco === null || primeiraEmBranco === "")) {
    return { sucesso: false, mensagem: "A primeira folha em branco só vale na devolução parcial." };
  }
  const dia = data == null || data === "" ? hojeBrasilia() : data;
  if (!dataValida(dia) || dia > hojeBrasilia()) return { sucesso: false, mensagem: "A data da devolução não confere." };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    if (p.membroId !== null) {
      const m = (await pedidoNaTransacao(t).input("m", sql.Int, p.membroId).query(`SELECT 1 AS ok FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!m) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
    }
    // como na exceção da folha: acha sem trava e trava a linha pela chave (as gravações do bloco travam o mesmo recurso, na mesma ordem)
    const achado = (await pedidoNaTransacao(t).input("pf", sql.Int, pf)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @pf AND UltimaFolha >= @pf ORDER BY PrimeiraFolha DESC`)).recordset[0];
    const b = achado && (await pedidoNaTransacao(t).input("id", sql.Int, achado.BlocoId)
      .query(`SELECT BlocoId, Numero, PrimeiraFolha, UltimaFolha, Situacao, CongregacaoId, EntregueEm, DevolvidoEm FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @id`)).recordset[0];
    const saida = b ? await ultimaSaida(t, b.BlocoId) : null;
    // pela primeira folha do bloco ou pela primeira da última saída (o bloco que saiu de novo com as folhas que voltaram livres)
    if (!b || (pf !== Number(b.PrimeiraFolha) && !(saida && pf === saida.primeiraFolha))) return { sucesso: false, mensagem: `Não há bloco que comece na folha ${milhar(pf)}.` };
    if (b.Situacao === "NA_GERAL" && !saida) return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda está na Tesouraria Geral: não saiu para voltar.` };
    if (b.Situacao === "NA_GERAL") {
      // na Geral depois de sair: voltou em parte (revisão m3); só volta de novo depois de sair outra vez
      const volta = (await pedidoNaTransacao(t).input("b", sql.Int, b.BlocoId).query(`
        SELECT TOP 1 DataRegistro, PrimeiraFolha, UltimaFolha FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = @b ORDER BY RegistroId DESC`)).recordset[0];
      const inexistentes = (await pedidoNaTransacao(t).input("b", sql.Int, b.BlocoId).input("de", sql.Int, volta.PrimeiraFolha).query(`
        SELECT Folha FROM FinFolhas WHERE BlocoId = @b AND Folha >= @de AND Destino = 'INEXISTENTE'`)).recordset.map((x) => Number(x.Folha));
      const livres = regra.faixaLivre(volta.PrimeiraFolha, volta.UltimaFolha, inexistentes);
      return { sucesso: false, mensagem: regra.mensagemJaVoltouParcial(b.Numero, iso(volta.DataRegistro), livres.de, livres.ate, livres.menos) };
    }
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido em ${dataBr(b.DevolvidoEm)}.` };
    if (dia < iso(b.EntregueEm)) return { sucesso: false, mensagem: "A data da devolução é antes da entrega do bloco." };
    const ultima = Number(b.UltimaFolha);
    let livresDaParcial = null;
    if (emParte) {
      if (branco < saida.primeiraFolha || branco > ultima) {
        return { sucesso: false, mensagem: `A folha ${milhar(branco)} não é desta entrega do bloco ${milhar(b.Numero)} (${milhar(saida.primeiraFolha)} a ${milhar(ultima)}).` };
      }
      // resposta dele (24/11/2026): a primeira em branco é procurada ignorando as inexistentes; elas continuam inexistentes (a faixa guardada vai
      // até o fim do bloco, como sempre; a mensagem diz as livres sem elas)
      const depois = (await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).input("x", sql.Int, branco)
        .query(`SELECT Folha, Destino FROM FinFolhas WHERE BlocoId = @id AND Folha >= @x`)).recordset;
      const outra = depois.filter((x) => x.Destino !== "INEXISTENTE").reduce((m, x) => Math.max(m, Number(x.Folha)), 0);
      if (outra) return { sucesso: false, mensagem: `A folha ${milhar(branco)} não pode ser a primeira em branco: a ${milhar(outra)} já tem destino.` };
      if (depois.some((x) => Number(x.Folha) === branco)) return { sucesso: false, mensagem: `A folha ${milhar(branco)} não pode ser a primeira em branco: ela é inexistente.` };
      livresDaParcial = regra.faixaLivre(branco, ultima, depois.map((x) => Number(x.Folha)));
    }
    // completa: o bloco fecha; parcial: volta para a Geral (sem congregação), com as folhas da primeira em branco ao fim livres para outra saída
    const u = await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).input("d", sql.Date, dia).query(emParte
      ? `UPDATE FinBlocos SET Situacao = 'NA_GERAL', CongregacaoId = NULL, EntregueEm = NULL WHERE BlocoId = @id AND Situacao = 'ENTREGUE'`
      : `UPDATE FinBlocos SET Situacao = 'DEVOLVIDO', DevolvidoEm = @d WHERE BlocoId = @id AND Situacao = 'ENTREGUE'`);
    if (!u.rowsAffected || !u.rowsAffected[0]) return MUDOU(`O bloco ${milhar(b.Numero)} acabou de mudar. Confira e tente de novo.`);
    const reg = (await pedidoNaTransacao(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, b.CongregacaoId).input("m", sql.Int, p.membroId)
      .input("n", sql.NVarChar(200), p.nome).input("d", sql.Date, dia).input("por", sql.Int, por)
      .input("saida", sql.Int, saida.id).input("parcial", sql.Bit, emParte).input("de", sql.Int, emParte ? branco : null).input("ate", sql.Int, emParte ? ultima : null)
      .input("bp", sql.Int, emParte ? Number(b.PrimeiraFolha) : null)
      .query(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaMembroId, PessoaNome, DataRegistro, RegistradoPor, SaidaId, Parcial, PrimeiraFolha, UltimaFolha, BlocoPrimeiraFolha)
              OUTPUT INSERTED.RegistroId VALUES ('ENTRADA', @id, @c, @m, @n, @d, @por, @saida, @parcial, @de, @ate, @bp)`)).recordset[0].RegistroId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinBlocos", registroId: b.BlocoId, acao: "FIN_BLOCO_DEVOLVIDO", usuarioId: por,
      dadosDepois: { livro: reg, parcial: emParte, primeiraEmBranco: emParte ? branco : null } });
    ok = true;
    return { sucesso: true, mensagem: emParte ? regra.mensagemDaParcial(b.Numero, livresDaParcial.de, livresDaParcial.ate, livresDaParcial.menos)
      : `Bloco ${milhar(b.Numero)} devolvido: está de novo com a Tesouraria Geral.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// Desfazer a exceção de uma folha (regra dele, 23/11/2026): só a Tesouraria Geral, com o motivo; nunca em bloco já devolvido; a folha lançada se
// corrige pelo lançamento. A linha sai de FinFolhas e vai INTEIRA para FinFolhasDesfeitas (quem marcou e quando, o que era, quem desfez, quando
// e por quê), na mesma transação: nada se perde, e a folha volta a poder ter destino. Trava a linha do bloco primeiro, como a exceção e a
// devolução (a mesma ordem: nunca impasse, e a devolução nunca conta uma folha que está sendo desfeita). Regra de 24/11/2026: só a exceção da
// entrega em curso; a folha de uma entrega que já voltou (em parte) não muda mais, como a do bloco devolvido.
async function desfazerFolha(pool, { dados, por }) {
  const v = regra.desfazimentoDaFolha(dados);
  if (v.erro) return { sucesso: false, mensagem: v.erro };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const achado = (await pedidoNaTransacao(t).input("f", sql.Int, v.folha)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @f AND UltimaFolha >= @f ORDER BY PrimeiraFolha DESC`)).recordset[0];
    const b = achado && (await pedidoNaTransacao(t).input("id", sql.Int, achado.BlocoId)
      .query(`SELECT BlocoId, Numero, PrimeiraFolha, Situacao FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @id`)).recordset[0];
    if (!b) return { sucesso: false, mensagem: `Nenhum bloco tem a folha ${milhar(v.folha)}.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido: as folhas dele não mudam mais.` };
    const f = (await pedidoNaTransacao(t).input("f", sql.Int, v.folha)
      .query(`SELECT FolhaId, Destino, SaidaId FROM FinFolhas WITH (UPDLOCK, ROWLOCK) WHERE Folha = @f`)).recordset[0];
    if (!f) return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} não tem exceção para desfazer: ela está livre.` };
    if (f.Destino === "LANCADA") return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} foi lançada: aqui só se desfaz a exceção (cancelada, arrancada, extraviada ou inexistente).` };
    const emCurso = b.Situacao === "ENTREGUE" ? await ultimaSaida(t, b.BlocoId) : null;
    if (!emCurso || Number(f.SaidaId) !== emCurso.id) {
      return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} voltou com o bloco ${milhar(b.Numero)} numa devolução: as folhas que já voltaram não mudam mais.` };
    }
    const desfeita = (await pedidoNaTransacao(t).input("id", sql.Int, f.FolhaId).input("por", sql.Int, por).input("motivo", sql.NVarChar(300), v.motivo).query(`
      INSERT INTO FinFolhasDesfeitas (FolhaId, BlocoId, Folha, Destino, Observacao, RegistradoPor, RegistradoEm, DesfeitaPor, Motivo, SaidaId)
      OUTPUT INSERTED.DesfeitaId
      SELECT FolhaId, BlocoId, Folha, Destino, Observacao, RegistradoPor, RegistradoEm, @por, @motivo, SaidaId FROM FinFolhas WHERE FolhaId = @id`)).recordset[0].DesfeitaId;
    await pedidoNaTransacao(t).input("id", sql.Int, f.FolhaId).query(`DELETE FROM FinFolhas WHERE FolhaId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinFolhas", registroId: Number(f.FolhaId), acao: "FIN_FOLHA_DESFEITA", usuarioId: por,
      dadosAntes: { bloco: Number(b.Numero), folha: v.folha, destino: f.Destino }, dadosDepois: { desfeita: Number(desfeita) } });
    ok = true;
    const posicao = v.folha - Number(b.PrimeiraFolha) + 1;
    return { sucesso: true, mensagem: `Folha ${milhar(v.folha)} (${posicao}ª do bloco ${milhar(b.Numero)}) livre de novo: a exceção (${regra.destinoDaTela(f.Destino)}) foi desfeita.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

module.exports = { listar, resumo, escopoDaTela, cadastrarLote, registrarChegada, entregar, folhasDoBloco, registrarFolha, livroDosBlocos, rastreio, devolver, desfazerFolha };
