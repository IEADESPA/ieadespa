// shared/finBlocosDb.js (FASE 10, Financeiro, incremento 1a, 21/11/2026) — as CONSULTAS dos blocos de recibo (migração 200). A regra pura está em
// shared/finBlocos.js; a rota é FinBlocos (financeiro/blocos).
//
// Quem vê o quê: a Tesouraria Geral vê todos os blocos, inclusive os que estão com ela (na Geral); a congregação e a área veem só os blocos
// entregues às congregações do seu escopo. O bloco nunca fica com a área: ela só leva (o livro registra "levado pela área").
// Gravações em transação com trava de aplicação: dois lotes ao mesmo tempo nunca cruzam a numeração, e o mesmo bloco não sai duas vezes.
const { sql } = require("./db");
const auth = require("./auth");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { obterTrava } = require("./financeiroSeguro");
const { condicaoSqlEscopoCongregacao } = require("./escopoRotas");
const regra = require("./finBlocos");

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
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

async function fecharTransacao(t, ok) {
  try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { if (ok) throw e; }
}

// A lista dos blocos (páginas de 40), com o uso das folhas e o resumo do alto à direita.
// `geral`: a sessão é do nível geral; `congregacaoId`: a congregação escolhida no seletor (já conferida no escopo pela rota), ou null = todas.
async function listar(pool, usuario, { geral, congregacaoId, filtro, procura, pagina }) {
  const pedido = pool.request();
  const onde = [];
  if (!geral) {
    onde.push("b.CongregacaoId IS NOT NULL");
    const cond = await condicaoSqlEscopoCongregacao(pool, usuario, pedido, "b.CongregacaoId");
    if (cond === "") return { blocos: [], total: 0, pagina: 1, porPagina: regra.POR_PAGINA, resumo: await resumo(pool, usuario, { geral, congregacaoId }) };
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
    resumo: await resumo(pool, usuario, { geral, congregacaoId })
  };
}

// O quadro da direita: na Geral, o lote da gráfica mais novo (quantos blocos e folhas, quantas chegaram e quantas faltam); na congregação,
// "Seus blocos" (em uso ou esperando, e as folhas livres deles).
async function resumo(pool, usuario, { geral, congregacaoId }) {
  if (geral && !congregacaoId) {
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
  const t = new sql.Transaction(pool);
  await t.begin();
  let ok = false;
  try {
    if (!(await obterTrava(() => new sql.Request(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro lote está sendo cadastrado agora. Tente de novo.");
    const cruza = (await new sql.Request(t).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .query(`SELECT TOP 1 Serie, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE PrimeiraFolha <= @u AND UltimaFolha >= @p`)).recordset[0];
    if (cruza) return { sucesso: false, mensagem: `As folhas ${lote.primeiraFolha} a ${lote.ultimaFolha} cruzam o lote da série ${cruza.Serie} (${cruza.PrimeiraFolha} a ${cruza.UltimaFolha}).` };
    const numeros = (await new sql.Request(t).input("a", sql.Int, blocos[0].numero).input("b", sql.Int, blocos[blocos.length - 1].numero)
      .query(`SELECT TOP 1 Numero FROM FinBlocos WHERE Numero BETWEEN @a AND @b`)).recordset[0];
    if (numeros) return { sucesso: false, mensagem: `O bloco ${numeros.Numero} já existe: confira a primeira folha do lote.` };
    const loteId = (await new sql.Request(t).input("s", sql.SmallInt, lote.serie).input("p", sql.Int, lote.primeiraFolha).input("u", sql.Int, lote.ultimaFolha)
      .input("f", sql.SmallInt, lote.folhasPorBloco).input("por", sql.Int, por)
      .query(`INSERT INTO FinLotesGrafica (Serie, PrimeiraFolha, UltimaFolha, FolhasPorBloco, CriadoPor) OUTPUT INSERTED.LoteId VALUES (@s, @p, @u, @f, @por)`)).recordset[0].LoteId;
    // os blocos de uma vez (uma ida ao banco por 200 blocos, não 200 idas)
    await new sql.Request(t).input("lote", sql.Int, loteId).input("blocos", sql.NVarChar(sql.MAX), JSON.stringify(blocos))
      .query(`INSERT INTO FinBlocos (LoteId, Numero, PrimeiraFolha, UltimaFolha)
              SELECT @lote, j.numero, j.primeiraFolha, j.ultimaFolha
              FROM OPENJSON(@blocos) WITH (numero INT '$.numero', primeiraFolha INT '$.primeiraFolha', ultimaFolha INT '$.ultimaFolha') j`);
    await new sql.Request(t).input("lote", sql.Int, loteId).input("q", sql.Int, lote.totalFolhas).input("d", sql.Date, hojeBrasilia()).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor) VALUES ('CADASTRO', @lote, @q, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLotesGrafica", registroId: loteId, acao: "FIN_LOTE_CADASTRADO", usuarioId: por,
      dadosDepois: { serie: lote.serie, primeiraFolha: lote.primeiraFolha, ultimaFolha: lote.ultimaFolha, blocos: blocos.length } });
    ok = true;
    return { sucesso: true, loteId, blocos: blocos.length, mensagem: `Lote da série ${lote.serie} cadastrado: ${blocos.length} blocos, folhas ${lote.primeiraFolha} a ${lote.ultimaFolha}.` };
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
  const t = new sql.Transaction(pool);
  await t.begin();
  let ok = false;
  try {
    if (!(await obterTrava(() => new sql.Request(t), "fin_lotes_grafica", 10000))) return MUDOU("Outro registro do lote está em andamento. Tente de novo.");
    const lote = (await new sql.Request(t).input("id", sql.Int, id).query(`SELECT LoteId, PrimeiraFolha, UltimaFolha FROM FinLotesGrafica WHERE LoteId = @id`)).recordset[0];
    if (!lote) return { sucesso: false, naoExiste: true };
    if (ate < lote.PrimeiraFolha || ate > lote.UltimaFolha) return { sucesso: false, mensagem: `A folha ${ate} não é deste lote (${lote.PrimeiraFolha} a ${lote.UltimaFolha}).` };
    const r = await new sql.Request(t).input("id", sql.Int, id).input("ate", sql.Int, ate).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET ChegouEm = @d OUTPUT INSERTED.BlocoId WHERE LoteId = @id AND UltimaFolha <= @ate AND ChegouEm IS NULL`);
    const n = r.recordset.length;
    if (!n) { ok = true; return { sucesso: true, blocos: 0, mensagem: "Esses blocos já estavam registrados como chegados." }; }
    await new sql.Request(t).input("lote", sql.Int, id).input("q", sql.Int, n).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor) VALUES ('CHEGADA', @lote, @q, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "FinLotesGrafica", registroId: id, acao: "FIN_LOTE_CHEGADA", usuarioId: por, dadosDepois: { ateFolha: ate, blocos: n } });
    ok = true;
    return { sucesso: true, blocos: n, mensagem: `Chegaram ${n} blocos da gráfica.` };
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
  const p = pessoa && typeof pessoa === "object" && !Array.isArray(pessoa) ? pessoa : {};
  const semMembro = p.membroId == null || p.membroId === "";
  const membroId = semMembro ? null : inteiroPositivo(p.membroId);
  const nome = typeof p.nome === "string" ? p.nome.trim() : "";
  if (!semMembro && !membroId) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
  if (membroId === null && !nome) return { sucesso: false, mensagem: "Informe a quem o bloco foi entregue." };
  if (nome.length > 200) return { sucesso: false, mensagem: "O nome passou de 200 letras." };
  const dia = data == null || data === "" ? hojeBrasilia() : data;
  if (!dataValida(dia) || dia > hojeBrasilia()) return { sucesso: false, mensagem: "A data da entrega não confere." };
  const t = new sql.Transaction(pool);
  await t.begin();
  let ok = false;
  try {
    const c = (await new sql.Request(t).input("c", sql.Int, cong).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
    if (!c) return { sucesso: false, mensagem: "Escolha a congregação." };
    if (membroId !== null) {
      const m = (await new sql.Request(t).input("m", sql.Int, membroId).query(`SELECT 1 AS ok FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (!m) return { sucesso: false, mensagem: "A pessoa escolhida não confere." };
    }
    const b = (await new sql.Request(t).input("pf", sql.Int, pf)
      .query(`SELECT BlocoId, Numero, Situacao, ChegouEm FROM FinBlocos WITH (UPDLOCK, HOLDLOCK) WHERE PrimeiraFolha = @pf`)).recordset[0];
    if (!b) return { sucesso: false, mensagem: `Não há bloco que comece na folha ${pf}.` };
    if (b.Situacao !== "NA_GERAL") return { sucesso: false, mensagem: `O bloco ${b.Numero} já foi entregue.` };
    if (!b.ChegouEm) return { sucesso: false, mensagem: `O bloco ${b.Numero} ainda não chegou da gráfica.` };
    await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("d", sql.Date, dia)
      .query(`UPDATE FinBlocos SET Situacao = 'ENTREGUE', CongregacaoId = @c, EntregueEm = @d WHERE BlocoId = @id AND Situacao = 'NA_GERAL'`);
    const reg = (await new sql.Request(t).input("id", sql.Int, b.BlocoId).input("c", sql.Int, cong).input("m", sql.Int, membroId).input("n", sql.NVarChar(200), membroId === null ? nome : null)
      .input("area", sql.Bit, levadoPelaArea === true).input("d", sql.Date, dia).input("por", sql.Int, por)
      .query(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaMembroId, PessoaNome, LevadoPelaArea, DataRegistro, RegistradoPor)
              OUTPUT INSERTED.RegistroId VALUES ('SAIDA', @id, @c, @m, @n, @area, @d, @por)`)).recordset[0].RegistroId;
    await registrarAuditoriaNaTransacao(t, { tabela: "FinBlocos", registroId: b.BlocoId, acao: "FIN_BLOCO_ENTREGUE", usuarioId: por,
      dadosDepois: { congregacaoId: cong, livro: reg, levadoPelaArea: levadoPelaArea === true } });
    ok = true;
    return { sucesso: true, mensagem: `Bloco ${b.Numero} entregue a ${c.Nome}.` };
  } finally {
    await fecharTransacao(t, ok);
  }
}

module.exports = { listar, resumo, cadastrarLote, registrarChegada, entregar };
