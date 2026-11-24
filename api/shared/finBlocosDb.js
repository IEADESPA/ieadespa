// shared/finBlocosDb.js (FASE 10, Financeiro, incremento 1a, 21/11/2026) — as CONSULTAS dos blocos de recibo (migração 200). A regra pura está em
// shared/finBlocos.js; a rota é FinBlocos (financeiro/blocos).
//
// Quem vê o quê: a Tesouraria Geral vê todos os blocos, inclusive os que estão com ela (na Geral); a congregação e a área veem só os blocos
// entregues às congregações do seu escopo. O bloco nunca fica com a área: ela só leva (o livro registra "levado pela área").
// Gravações em transação com trava de aplicação: dois lotes ao mesmo tempo nunca cruzam a numeração, e o mesmo bloco não sai duas vezes.
// Revisão de 23/11/2026: SET XACT_ABORT ON em toda transação (regra 7 do banco); o bloco só volta cheio e a exceção da folha se desfaz com o
// motivo, só pela Tesouraria Geral (as regras dele); os números das mensagens com o ponto do milhar.
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
// cliente não deixa transação aberta segurando a trava. O SET vai por LOTE (.batch): o .query() do mssql roda em sp_executesql, e o SET feito
// ali se desfaz quando a chamada volta. O mssql não reinicia a conexão ao devolvê-la ao pool: antes de fechar, desliga de novo.
async function abrirTransacao(pool) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    await new sql.Request(t).batch("SET XACT_ABORT ON");
  } catch (e) {
    try { await t.rollback(); } catch { /* a transação já caiu */ }
    throw e;
  }
  return t;
}

async function fecharTransacao(t, ok) {
  // quando o próprio banco já desfez a transação (o XACT_ABORT), o mssql já devolveu a conexão: o desligar e o rollback falham calados
  try { await new sql.Request(t).batch("SET XACT_ABORT OFF"); } catch { /* idem */ }
  try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { if (ok) throw e; }
}

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

// A lista dos blocos (páginas de 40), com o uso das folhas, o quadro do alto à direita e quem está vendo.
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
  else if (filtro === "esperando") onde.push("b.Situacao = 'ENTREGUE' AND u.Usadas = 0");
  else if (filtro === "em-uso") onde.push("b.Situacao = 'ENTREGUE' AND u.Usadas > 0");
  pedido.input("pular", sql.Int, (pagina - 1) * regra.POR_PAGINA).input("porPagina", sql.Int, regra.POR_PAGINA);
  const r = await pedido.query(`
    SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.ChegouEm, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao,
           u.Usadas, COUNT(*) OVER () AS Total
    FROM FinBlocos b
    LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
    CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.BlocoId = b.BlocoId) u
    ${onde.length ? "WHERE " + onde.join(" AND ") : ""}
    ORDER BY CASE b.Situacao WHEN 'ENTREGUE' THEN 0 WHEN 'DEVOLVIDO' THEN 1 ELSE 2 END, b.EntregueEm DESC, b.Numero
    OFFSET @pular ROWS FETCH NEXT @porPagina ROWS ONLY`);
  const linhas = r.recordset;
  return {
    blocos: linhas.map((l) => {
      const folhas = Number(l.UltimaFolha) - Number(l.PrimeiraFolha) + 1;
      const usadas = Number(l.Usadas);
      return {
        id: Number(l.BlocoId), numero: Number(l.Numero), primeiraFolha: Number(l.PrimeiraFolha), ultimaFolha: Number(l.UltimaFolha),
        congregacao: l.CongregacaoId ? { id: Number(l.CongregacaoId), nome: l.Congregacao } : null,
        situacao: regra.situacaoDoBloco(l.Situacao, usadas), usadas, livres: folhas - usadas,
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
    SELECT COUNT(*) AS Blocos, ISNULL(SUM(b.UltimaFolha - b.PrimeiraFolha + 1 - u.Usadas), 0) AS Livres
    FROM FinBlocos b CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.BlocoId = b.BlocoId) u
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
    if (!(await obterTrava(() => new sql.Request(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro lote está sendo cadastrado agora. Tente de novo.");
    const cruza = (await new sql.Request(t).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .query(`SELECT TOP 1 Serie, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE PrimeiraFolha <= @u AND UltimaFolha >= @p`)).recordset[0];
    if (cruza) return { sucesso: false, mensagem: `As folhas ${milhar(lote.primeiraFolha)} a ${milhar(lote.ultimaFolha)} cruzam o lote da série ${cruza.Serie} (${milhar(cruza.PrimeiraFolha)} a ${milhar(cruza.UltimaFolha)}).` };
    const numeros = (await new sql.Request(t).input("a", sql.Int, blocos[0].numero).input("b", sql.Int, blocos[blocos.length - 1].numero)
      .query(`SELECT TOP 1 Numero FROM FinBlocos WHERE Numero BETWEEN @a AND @b`)).recordset[0];
    if (numeros) return { sucesso: false, mensagem: `O bloco ${milhar(numeros.Numero)} já existe: confira a primeira folha do lote.` };
    const loteId = (await new sql.Request(t).input("s", sql.SmallInt, lote.serie).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .input("f", sql.SmallInt, lote.folhasPorBloco).input("por", sql.Int, por)
      .query(`INSERT INTO FinLotesGrafica (Serie, PrimeiraFolha, UltimaFolha, FolhasPorBloco, CriadoPor) OUTPUT INSERTED.LoteId VALUES (@s, @p, @u, @f, @por)`)).recordset[0].LoteId;
    // os blocos de uma vez (uma ida ao banco por 200 blocos, não 200 idas)
    await new sql.Request(t).input("lote", sql.Int, loteId).input("blocos", sql.NVarChar(sql.MAX), JSON.stringify(blocos))
      .query(`INSERT INTO FinBlocos (LoteId, Numero, PrimeiraFolha, UltimaFolha)
              SELECT @lote, j.numero, j.primeiraFolha, j.ultimaFolha
              FROM OPENJSON(@blocos) WITH (numero INT '$.numero', primeiraFolha INT '$.primeiraFolha', ultimaFolha INT '$.ultimaFolha') j`);
    // a Quantidade do livro conta BLOCOS, no cadastro e na chegada (revisão M7)
    await new sql.Request(t).input("lote", sql.Int, loteId).input("q", sql.Int, blocos.length).input("d", sql.Date, hojeBrasilia()).input("por", sql.Int, por)
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
    if (!(await obterTrava(() => new sql.Request(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro registro do lote está em andamento. Tente de novo.");
    const lote = (await new sql.Request(t).input("id", sql.Int, id).query(`SELECT LoteId, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE LoteId = @id`)).recordset[0];
    if (!lote) return { sucesso: false, naoExiste: true };
    if (ate < lote.PrimeiraFolha || ate > lote.UltimaFolha) return { sucesso: false, mensagem: `A folha ${milhar(ate)} não é deste lote (${milhar(lote.PrimeiraFolha)} a ${milhar(lote.UltimaFolha)}).` };
    const r = await new sql.Request(t).input("id", sql.Int, id).input("ate", sql.Int, ate).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET ChegouEm = @d OUTPUT INSERTED.BlocoId WHERE LoteId = @id AND UltimaFolha <= @ate AND ChegouEm IS NULL`);
    const n = r.recordset.length;
    if (!n) {
      // nenhum bloco mudou: ou já tinham chegado, ou a folha fica no meio do primeiro bloco que falta (nenhum chegou inteiro)
      const v = (await new sql.Request(t).input("id", sql.Int, id).input("ate", sql.Int, ate).query(`
        SELECT (SELECT COUNT(*) FROM FinBlocos WHERE LoteId = @id AND UltimaFolha <= @ate) AS Inteiros, m.Numero, m.UltimaFolha
        FROM (SELECT 1 AS um) u OUTER APPLY (SELECT TOP 1 Numero, UltimaFolha FROM FinBlocos WHERE LoteId = @id AND UltimaFolha >= @ate ORDER BY UltimaFolha) m`)).recordset[0];
      if (!Number(v.Inteiros) && v.Numero != null) {
        return { sucesso: false, mensagem: `Até a folha ${milhar(ate)} nenhum bloco chegou inteiro: o bloco ${milhar(v.Numero)} vai até a folha ${milhar(v.UltimaFolha)}.` };
      }
      ok = true;
      return { sucesso: true, blocos: 0, mensagem: "Esses blocos já estavam registrados como chegados." };
    }
    await new sql.Request(t).input("lote", sql.Int, id).input("q", sql.Int, n).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor) VALUES ('CHEGADA', @lote, @q, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLotesGrafica", registroId: id, acao: "FIN_LOTE_CHEGADA", usuarioId: por, dadosDepois: { ateFolha: ate, blocos: n } });
    ok = true;
    return { sucesso: true, blocos: n, mensagem: n === 1 ? "Chegou 1 bloco da gráfica." : `Chegaram ${milhar(n)} blocos da gráfica.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// A saída (só a Tesouraria Geral): o bloco que chegou e está na Geral é entregue a alguém de uma congregação. A área pode levar, mas o bloco nunca
// fica com ela: fica registrado como "levado pela área" e passa a ser da congregação.
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
    const c = (await new sql.Request(t).input("c", sql.Int, cong).query(`SELECT Nome, Ativa FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
    if (!c) return { sucesso: false, mensagem: "Escolha a congregação." };
    if (!c.Ativa) return { sucesso: false, mensagem: `A congregação ${c.Nome} não está ativa: o bloco só sai para congregação ativa.` };   // revisão M3
    if (membroId !== null) {
      const m = (await new sql.Request(t).input("m", sql.Int, membroId).query(`SELECT 1 AS ok FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!m) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
    }
    const b = (await new sql.Request(t).input("pf", sql.Int, pf)
      .query(`SELECT BlocoId, Numero, Situacao, ChegouEm, DevolvidoEm FROM FinBlocos WITH (UPDLOCK, HOLDLOCK) WHERE PrimeiraFolha = @pf`)).recordset[0];
    if (!b) return { sucesso: false, mensagem: `Não há bloco que comece na folha ${milhar(pf)}.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido em ${dataBr(b.DevolvidoEm)}.` };
    if (b.Situacao !== "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi entregue.` };
    if (!b.ChegouEm) return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda não chegou da gráfica.` };
    // a entrega não vem antes da chegada da gráfica (revisão M2; a devolução já confere a data contra a entrega)
    if (dia < iso(b.ChegouEm)) return { sucesso: false, mensagem: `A data da entrega é antes da chegada do bloco da gráfica (${dataBr(b.ChegouEm)}).` };
    await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET Situacao = 'ENTREGUE', CongregacaoId = @c, EntregueEm = @d WHERE BlocoId = @id AND Situacao = 'NA_GERAL'`);
    const reg = (await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("m", sql.Int, membroId).input("n", sql.NVarChar(200), nome)
      .input("area", sql.Bit, area).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaMembroId, PessoaNome, LevadoPelaArea, DataRegistro, RegistradoPor)
              OUTPUT INSERTED.RegistroId VALUES ('SAIDA', @id, @c, @m, @n, @area, @d, @por)`)).recordset[0].RegistroId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinBlocos", registroId: b.BlocoId, acao: "FIN_BLOCO_ENTREGUE", usuarioId: por,
      dadosDepois: { congregacaoId: cong, livro: reg, levadoPelaArea: area } });
    ok = true;
    return { sucesso: true, mensagem: `Bloco ${milhar(b.Numero)} entregue a ${c.Nome}.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// ---- incremento 2 (22/11/2026): as folhas de um bloco, a exceção da folha, o livro, o rastreio e a devolução ----

const blocoDaLinha = (l) => ({
  id: Number(l.BlocoId), numero: Number(l.Numero), primeiraFolha: Number(l.PrimeiraFolha), ultimaFolha: Number(l.UltimaFolha),
  congregacao: l.CongregacaoId ? { id: Number(l.CongregacaoId), nome: l.Congregacao } : null,
  situacao: regra.situacaoDoBloco(l.Situacao, Number(l.Usadas || 0)), entregueEm: iso(l.EntregueEm), devolvidoEm: iso(l.DevolvidoEm)
});

// As folhas de um bloco (a grade das 50 e o formulário da exceção). Quem vê: a Geral, os blocos que já saíram (entregues ou devolvidos); a área e
// a congregação, os das congregações do seu escopo. `blocoId` vazio = o bloco em uso mais recente (senão o esperando, senão o último devolvido).
// As opções do seletor "Bloco 1.401 · Vila Nova ▾": os entregues e os 50 devolvidos mais novos. Fora do escopo e "não existe": a mesma resposta.
async function folhasDoBloco(pool, usuario, { geral, blocoId }) {
  const escopo = await escopoDaTela(pool, usuario, geral);
  const pedido = pool.request();
  const onde = ["b.Situacao IN ('ENTREGUE', 'DEVOLVIDO')"];
  if (!geral) {
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "b.CongregacaoId");
    if (cond === "") return blocoId ? { naoExiste: true } : { sucesso: true, bloco: null, folhas: [], opcoes: [], escopo };
    if (cond) onde.push(cond);
  }
  if (blocoId) pedido.input("id", sql.Int, blocoId);
  const r = await pedido.query(`
    WITH alcance AS (
      SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao, u.Usadas,
             ROW_NUMBER() OVER (PARTITION BY b.Situacao ORDER BY b.DevolvidoEm DESC, b.Numero DESC) AS OrdemDevolvido
      FROM FinBlocos b
      JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      CROSS APPLY (SELECT COUNT(*) AS Usadas FROM FinFolhas f WHERE f.BlocoId = b.BlocoId) u
      WHERE ${onde.join(" AND ")}
    )
    SELECT *, CASE WHEN ${blocoId ? "BlocoId = @id" : "1 = 0"} THEN 1 ELSE 0 END AS Pedido FROM alcance
    WHERE Situacao = 'ENTREGUE' OR OrdemDevolvido <= 50 ${blocoId ? "OR BlocoId = @id" : ""}
    ORDER BY CASE Situacao WHEN 'ENTREGUE' THEN 0 ELSE 1 END, CASE WHEN Situacao = 'ENTREGUE' THEN Numero END, DevolvidoEm DESC, Numero DESC`);
  const linhas = r.recordset;
  let escolhido;
  if (blocoId) {
    escolhido = linhas.find((l) => Number(l.Pedido) === 1);
    if (!escolhido) return { naoExiste: true };
  } else {
    const entregues = linhas.filter((l) => l.Situacao === "ENTREGUE");
    const recente = (a, b) => String(iso(b.EntregueEm)).localeCompare(String(iso(a.EntregueEm))) || Number(b.Numero) - Number(a.Numero);
    escolhido = entregues.filter((l) => Number(l.Usadas) > 0).sort(recente)[0] || entregues.sort(recente)[0] || linhas.find((l) => l.Situacao === "DEVOLVIDO");
  }
  const opcoes = linhas.filter((l) => l.Situacao === "ENTREGUE" || Number(l.OrdemDevolvido) <= 50 || (escolhido && l.BlocoId === escolhido.BlocoId))
    .map((l) => ({ id: Number(l.BlocoId), numero: Number(l.Numero), congregacao: l.Congregacao, situacao: regra.situacaoDoBloco(l.Situacao, Number(l.Usadas)) }));
  if (!escolhido) return { sucesso: true, bloco: null, folhas: [], opcoes, escopo };
  const f = await pool.request().input("b", sql.Int, escolhido.BlocoId)
    .query(`SELECT Folha, Destino, Observacao FROM FinFolhas WHERE BlocoId = @b ORDER BY Folha`);
  const total = Number(escolhido.UltimaFolha) - Number(escolhido.PrimeiraFolha) + 1;
  return {
    sucesso: true,
    bloco: { ...blocoDaLinha(escolhido), usadas: Number(escolhido.Usadas), livres: total - Number(escolhido.Usadas) },
    folhas: f.recordset.map((x) => ({ folha: Number(x.Folha), destino: regra.destinoDaTela(x.Destino), observacao: x.Destino === "LANCADA" ? null : x.Observacao })),
    opcoes, escopo
  };
}

// A exceção de uma folha (cancelada, arrancada ou extraviada, com a observação): só numa folha livre de um bloco que está com a congregação. Quem
// registra: quem tem a permissão financeiro e alcança a congregação do bloco (a Geral, a área, a congregação). A folha lançada vem do lançamento.
// O bloco fica travado na transação: a devolução e a exceção da mesma folha nunca se cruzam.
async function registrarFolha(pool, usuario, { geral, dados, por }) {
  const v = regra.excecaoDaFolha(dados);
  if (v.erro) return { sucesso: false, mensagem: v.erro };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    // as folhas de um bloco nunca mudam depois do cadastro: acha o bloco sem trava e trava só a linha dele, pela chave (travar a faixa do índice
    // prendia todos os blocos de folha menor e a corrida com a devolução dava impasse; o e2e-201 pegou)
    const achado = (await new sql.Request(t).input("f", sql.Int, v.folha)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @f AND UltimaFolha >= @f ORDER BY PrimeiraFolha DESC`)).recordset[0];
    // o nome da congregação vem na mesma leitura que trava o bloco: a conferência do escopo não pede outra conexão ao pool com a trava presa (revisão I4)
    const b = achado && (await new sql.Request(t).input("id", sql.Int, achado.BlocoId).query(`
      SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.Situacao, b.CongregacaoId, c.Nome AS Congregacao
      FROM FinBlocos b WITH (UPDLOCK, ROWLOCK) LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId WHERE b.BlocoId = @id`)).recordset[0];
    // fora do escopo e "não existe" dão a mesma resposta; o bloco que ainda está na Geral só a Geral sabe que existe (a regra do escopo é a de
    // escopoRotas.congregacaoNoEscopo: auth.estaNoEscopo pelo nome da congregação)
    if (!b || (!geral && (!b.CongregacaoId || !auth.estaNoEscopo(usuario, b.Congregacao)))) return { sucesso: false, naoExiste: true };
    if (b.Situacao === "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda está na Tesouraria Geral: a folha só tem destino depois da entrega.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido: as folhas dele não mudam mais.` };
    const ja = (await new sql.Request(t).input("f", sql.Int, v.folha).query(`SELECT Destino FROM FinFolhas WHERE Folha = @f`)).recordset[0];
    if (ja) return MUDOU(`A folha ${milhar(v.folha)} já tem destino (${regra.destinoDaTela(ja.Destino)}).`);
    const id = (await new sql.Request(t).input("b", sql.Int, b.BlocoId).input("f", sql.Int, v.folha).input("d", sql.NVarChar(10), v.destino)
      .input("o", sql.NVarChar(300), v.observacao).input("por", sql.Int, por)
      .query(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor) OUTPUT INSERTED.FolhaId VALUES (@b, @f, @d, @o, @por)`)).recordset[0].FolhaId;
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
// lote também); a área e a congregação, as saídas e as entradas das congregações do seu escopo, e os blocos delas agora.
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
           b.Numero, b.PrimeiraFolha, b.UltimaFolha, c.Nome AS Congregacao, lg.Serie, lg.PrimeiraFolha AS LotePrimeira, lg.UltimaFolha AS LoteUltima,
           (SELECT COUNT(*) FROM FinBlocos x WHERE x.LoteId = lg.LoteId) AS LoteBlocos, k.Lancadas, k.Canceladas, k.Arrancadas, k.Extraviadas,
           COUNT(*) OVER () AS Total
    FROM FinLivroBlocos l
    LEFT JOIN FinBlocos b ON b.BlocoId = l.BlocoId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    LEFT JOIN FinLotesGrafica lg ON lg.LoteId = l.LoteId
    LEFT JOIN MembroReferencia pm ON pm.MembroId = l.PessoaMembroId
    LEFT JOIN MembroReferencia rp ON rp.MembroId = l.RegistradoPor
    OUTER APPLY (SELECT SUM(CASE WHEN f.Destino = 'LANCADA' THEN 1 ELSE 0 END) AS Lancadas, SUM(CASE WHEN f.Destino = 'CANCELADA' THEN 1 ELSE 0 END) AS Canceladas,
                        SUM(CASE WHEN f.Destino = 'ARRANCADA' THEN 1 ELSE 0 END) AS Arrancadas, SUM(CASE WHEN f.Destino = 'EXTRAVIADA' THEN 1 ELSE 0 END) AS Extraviadas
                 FROM FinFolhas f WHERE l.Tipo = 'ENTRADA' AND f.BlocoId = l.BlocoId) k
    ${onde.length ? "WHERE " + onde.join(" AND ") : ""}
    ORDER BY l.DataRegistro DESC, l.RegistroId DESC
    OFFSET @pular ROWS FETCH NEXT @porPagina ROWS ONLY`);
  const linhas = r.recordset;
  const agora = geral ? null : regra.blocosAgora((await pedidoAgora.query(`
    SELECT b.UltimaFolha - b.PrimeiraFolha + 1 AS Total, (SELECT COUNT(*) FROM FinFolhas f WHERE f.BlocoId = b.BlocoId) AS Usadas
    FROM FinBlocos b WHERE ${agoraOnde}`)).recordset);
  return {
    sucesso: true,
    registros: linhas.map((l) => {
      const reg = { id: Number(l.RegistroId), tipo: String(l.Tipo).toLowerCase(), data: iso(l.DataRegistro), registradoPor: l.RegistradoPor || "" };
      if (l.Tipo === "CADASTRO" || l.Tipo === "CHEGADA") {
        return { ...reg, quantidade: l.Quantidade == null ? null : Number(l.Quantidade),
          lote: { serie: Number(l.Serie), primeiraFolha: Number(l.LotePrimeira), ultimaFolha: Number(l.LoteUltima), blocos: Number(l.LoteBlocos) } };
      }
      const total = Number(l.UltimaFolha) - Number(l.PrimeiraFolha) + 1;
      const contagem = l.Tipo === "ENTRADA" ? regra.contagemDasFolhas([
        { Destino: "LANCADA", N: l.Lancadas }, { Destino: "CANCELADA", N: l.Canceladas }, { Destino: "ARRANCADA", N: l.Arrancadas }, { Destino: "EXTRAVIADA", N: l.Extraviadas }
      ], total) : null;
      return { ...reg, bloco: Number(l.Numero), congregacao: l.Congregacao || "", pessoa: l.PessoaMembro || l.PessoaNome || "", levadoPelaArea: l.LevadoPelaArea === true, contagem };
    }),
    total: linhas.length ? Number(linhas[0].Total) : 0, pagina, porPagina, agora, escopo
  };
}

// O rastreio do bloco (só a Tesouraria Geral, no "Registrar entrada"): pela primeira folha (ou qualquer folha dele), o bloco, com quem está, quando
// saiu, quantas folhas têm cada destino e as pessoas que podem devolver (quem o levou e a liderança da congregação; ou outra pessoa, escrita).
async function rastreio(pool, { folha }) {
  const f = inteiroPositivo(folha);
  if (!f) return { sucesso: false, mensagem: "Informe o número da primeira folha do bloco." };
  const b = (await pool.request().input("f", sql.Int, f).query(`
    SELECT b.BlocoId, b.Numero, b.PrimeiraFolha, b.UltimaFolha, b.Situacao, b.EntregueEm, b.DevolvidoEm, b.CongregacaoId, c.Nome AS Congregacao,
           (SELECT COUNT(*) FROM FinFolhas x WHERE x.BlocoId = b.BlocoId) AS Usadas
    FROM FinBlocos b LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
    WHERE @f BETWEEN b.PrimeiraFolha AND b.UltimaFolha`)).recordset[0];
  if (!b) return { sucesso: false, mensagem: `Nenhum bloco tem a folha ${milhar(f)}.` };
  const total = Number(b.UltimaFolha) - Number(b.PrimeiraFolha) + 1;
  const contagem = regra.contagemDasFolhas((await pool.request().input("b", sql.Int, b.BlocoId)
    .query(`SELECT Destino, COUNT(*) AS N FROM FinFolhas WHERE BlocoId = @b GROUP BY Destino`)).recordset, total);
  let pessoas = [];
  if (b.Situacao === "ENTREGUE") {
    const saida = (await pool.request().input("b", sql.Int, b.BlocoId).query(`
      SELECT TOP 1 l.PessoaMembroId, COALESCE(m.Nome, l.PessoaNome) AS Nome FROM FinLivroBlocos l LEFT JOIN MembroReferencia m ON m.MembroId = l.PessoaMembroId
      WHERE l.Tipo = 'SAIDA' AND l.BlocoId = @b ORDER BY l.RegistroId DESC`)).recordset[0];
    const lideres = (await pool.request().input("c", sql.Int, b.CongregacaoId).query(`
      SELECT m.MembroId, m.Nome, MIN(p.Nome) AS Papel
      FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      GROUP BY m.MembroId, m.Nome ORDER BY m.Nome`)).recordset;
    if (saida && saida.Nome) pessoas.push({ membroId: saida.PessoaMembroId ? Number(saida.PessoaMembroId) : null, nome: saida.Nome, papel: "quem levou o bloco" });
    for (const l of lideres) if (!pessoas.some((p) => p.membroId === Number(l.MembroId))) pessoas.push({ membroId: Number(l.MembroId), nome: l.Nome, papel: l.Papel || "" });
  }
  return { sucesso: true, bloco: { ...blocoDaLinha(b), usadas: Number(b.Usadas), livres: total - Number(b.Usadas) }, contagem, pessoas };
}

// A entrada (a devolução; só a Tesouraria Geral): o bloco que está com a congregação volta para a Geral. Quem recebe é quem está registrando (o nome
// de quem está logado entra sozinho); quem devolveu é alguém do cadastro ou o nome escrito. A data não pode ser antes da entrega nem depois de hoje.
// Regra dele (23/11/2026): o bloco só volta CHEIO — toda folha com destino (lançada, ou cancelada, arrancada ou extraviada). A exceção e o
// desfazer travam a mesma linha do bloco antes de mexer nas folhas: a contagem aqui não muda até o fim da transação.
async function devolver(pool, { primeiraFolha, pessoa, data, por }) {
  const pf = inteiroPositivo(primeiraFolha);
  if (!pf) return { sucesso: false, mensagem: "Informe a primeira folha do bloco." };
  const p = regra.pessoaDoLivro(pessoa, "Informe quem devolveu o bloco.");
  if (p.erro) return { sucesso: false, mensagem: p.erro };
  const dia = data == null || data === "" ? hojeBrasilia() : data;
  if (!dataValida(dia) || dia > hojeBrasilia()) return { sucesso: false, mensagem: "A data da devolução não confere." };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    if (p.membroId !== null) {
      const m = (await new sql.Request(t).input("m", sql.Int, p.membroId).query(`SELECT 1 AS ok FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!m) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
    }
    // como na exceção da folha: acha sem trava e trava a linha pela chave (as duas gravações travam o mesmo recurso, na mesma ordem)
    const achado = (await new sql.Request(t).input("pf", sql.Int, pf).query(`SELECT BlocoId FROM FinBlocos WHERE PrimeiraFolha = @pf`)).recordset[0];
    const b = achado && (await new sql.Request(t).input("id", sql.Int, achado.BlocoId)
      .query(`SELECT BlocoId, Numero, PrimeiraFolha, UltimaFolha, Situacao, CongregacaoId, EntregueEm, DevolvidoEm FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @id`)).recordset[0];
    if (!b) return { sucesso: false, mensagem: `Não há bloco que comece na folha ${milhar(pf)}.` };
    if (b.Situacao === "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} ainda está na Tesouraria Geral: não saiu para voltar.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido em ${dataBr(b.DevolvidoEm)}.` };
    if (dia < iso(b.EntregueEm)) return { sucesso: false, mensagem: "A data da devolução é antes da entrega do bloco." };
    const usadas = Number((await new sql.Request(t).input("id", sql.Int, b.BlocoId).query(`SELECT COUNT(*) AS N FROM FinFolhas WHERE BlocoId = @id`)).recordset[0].N);
    const livres = Number(b.UltimaFolha) - Number(b.PrimeiraFolha) + 1 - usadas;
    if (livres > 0) return { sucesso: false, mensagem: regra.recusaDoBlocoComFolhaLivre(b.Numero, livres) };
    const u = await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET Situacao = 'DEVOLVIDO', DevolvidoEm = @d WHERE BlocoId = @id AND Situacao = 'ENTREGUE'`);
    if (!u.rowsAffected || !u.rowsAffected[0]) return MUDOU(`O bloco ${milhar(b.Numero)} acabou de mudar. Confira e tente de novo.`);
    const reg = (await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, b.CongregacaoId).input("m", sql.Int, p.membroId)
      .input("n", sql.NVarChar(200), p.nome).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaMembroId, PessoaNome, DataRegistro, RegistradoPor)
              OUTPUT INSERTED.RegistroId VALUES ('ENTRADA', @id, @c, @m, @n, @d, @por)`)).recordset[0].RegistroId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinBlocos", registroId: b.BlocoId, acao: "FIN_BLOCO_DEVOLVIDO", usuarioId: por, dadosDepois: { livro: reg } });
    ok = true;
    return { sucesso: true, mensagem: `Bloco ${milhar(b.Numero)} devolvido: está de novo com a Tesouraria Geral.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

// Desfazer a exceção de uma folha (regra dele, 23/11/2026): só a Tesouraria Geral, com o motivo; nunca em bloco já devolvido; a folha lançada se
// corrige pelo lançamento. A linha sai de FinFolhas e vai INTEIRA para FinFolhasDesfeitas (quem marcou e quando, o que era, quem desfez, quando
// e por quê), na mesma transação: nada se perde, e a folha volta a poder ter destino. Trava a linha do bloco primeiro, como a exceção e a
// devolução (a mesma ordem: nunca impasse, e a devolução nunca conta uma folha que está sendo desfeita).
async function desfazerFolha(pool, { dados, por }) {
  const v = regra.desfazimentoDaFolha(dados);
  if (v.erro) return { sucesso: false, mensagem: v.erro };
  const t = await abrirTransacao(pool);
  let ok = false;
  try {
    const achado = (await new sql.Request(t).input("f", sql.Int, v.folha)
      .query(`SELECT TOP 1 BlocoId FROM FinBlocos WHERE PrimeiraFolha <= @f AND UltimaFolha >= @f ORDER BY PrimeiraFolha DESC`)).recordset[0];
    const b = achado && (await new sql.Request(t).input("id", sql.Int, achado.BlocoId)
      .query(`SELECT BlocoId, Numero, PrimeiraFolha, Situacao FROM FinBlocos WITH (UPDLOCK, ROWLOCK) WHERE BlocoId = @id`)).recordset[0];
    if (!b) return { sucesso: false, mensagem: `Nenhum bloco tem a folha ${milhar(v.folha)}.` };
    if (b.Situacao === "DEVOLVIDO") return { sucesso: false, mensagem: `O bloco ${milhar(b.Numero)} já foi devolvido: as folhas dele não mudam mais.` };
    const f = (await new sql.Request(t).input("f", sql.Int, v.folha)
      .query(`SELECT FolhaId, Destino FROM FinFolhas WITH (UPDLOCK, ROWLOCK) WHERE Folha = @f`)).recordset[0];
    if (!f) return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} não tem exceção para desfazer: ela está livre.` };
    if (f.Destino === "LANCADA") return { sucesso: false, mensagem: `A folha ${milhar(v.folha)} foi lançada: aqui só se desfaz a exceção (cancelada, arrancada ou extraviada).` };
    const desfeita = (await new sql.Request(t).input("id", sql.Int, f.FolhaId).input("por", sql.Int, por).input("motivo", sql.NVarChar(300), v.motivo).query(`
      INSERT INTO FinFolhasDesfeitas (FolhaId, BlocoId, Folha, Destino, Observacao, RegistradoPor, RegistradoEm, DesfeitaPor, Motivo)
      OUTPUT INSERTED.DesfeitaId
      SELECT FolhaId, BlocoId, Folha, Destino, Observacao, RegistradoPor, RegistradoEm, @por, @motivo FROM FinFolhas WHERE FolhaId = @id`)).recordset[0].DesfeitaId;
    await new sql.Request(t).input("id", sql.Int, f.FolhaId).query(`DELETE FROM FinFolhas WHERE FolhaId = @id`);
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
