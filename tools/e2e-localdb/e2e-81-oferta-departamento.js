// e2e-81-oferta-departamento.js — migração 172 (FASE 10, 12/11/2026): o tipo do lançamento da tesouraria cabe o código de qualquer categoria de entrada.
// Antes, LancamentosTesouraria.Tipo tinha 20 letras e "OFERTA_CULTO_DEPARTAMENTO" (25) não cabia: nem o lançamento direto nem a confirmação de uma conta a
// receber dessa categoria gravavam. Roda sobre a base "cenario-172" (`bash rodar.sh preparar-172`); sobre "cenario-trava9b" (sem a 172) as provas do
// lançamento de 25 letras FALHAM — é a prova de que o teste enxerga o defeito. Usa os handlers e o banco REAIS; monta o próprio cenário.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr } = L;
const { chamarRota } = require("./lib-afm");

console.error = () => { };
const LANC = (metodo, { corpo, query, id, token }) => chamarRota("GestaoLancamentosTesouraria/index.js", { metodo, binding: id ? { id } : {}, corpo, query, token });
const CR = (metodo, { corpo, query, id, token }) => chamarRota("GestaoContasReceber/index.js", { metodo, binding: id ? { id } : {}, corpo, query, token });
const tentar = async (f) => { try { return await f(); } catch (e) { return { status: -1, body: { sucesso: false, mensagem: "exceção: " + e.message } }; } };
const CODIGO = "OFERTA_CULTO_DEPARTAMENTO";

(async () => {
  await obterPool();
  console.log("== esquema ==");
  const bytes = await escalar("SELECT COL_LENGTH('dbo.LancamentosTesouraria', 'Tipo')");
  ok(bytes === 60, "LancamentosTesouraria.Tipo tem 30 letras (60 bytes)", `bytes=${bytes}`);
  const maior = await escalar("SELECT MAX(LEN(Codigo)) FROM CategoriasEntrada");
  ok(maior <= 30, "nenhum código de categoria de entrada passa de 30 letras (cabe sempre no lançamento)", `maior=${maior}`);
  ok(await escalar("SELECT COUNT(*) FROM CategoriasEntrada WHERE Codigo = @c AND Ativa = 1", { c: CODIGO }) === 1, `a categoria ${CODIGO} existe e está ativa`);

  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const mes = hojeBr().slice(0, 7);
  ok(!(await escalar("SELECT COUNT(*) FROM FechamentosTesouraria WHERE CongregacaoId = @c AND MesReferencia = @m", { c: central, m: mes })), "o mês de hoje está aberto na Central");
  const tok = L.GERAL(1002, ["financeiro"]);
  const antes = await escalar("SELECT COUNT(*) FROM LancamentosTesouraria");

  console.log("== lançamento direto ==");
  const r1 = await tentar(() => LANC("POST", { token: tok, corpo: { congregacaoId: central, nomeAvulso: "Culto do Departamento de Jovens E2E", tipo: CODIGO, valor: 87.5, formaPagamento: "DINHEIRO", mesReferencia: mes } }));
  ok(r1.status === 201 && r1.body.sucesso, "a Oferta de Culto do Departamento é lançada (201)", JSON.stringify(r1.body));
  const gravado = r1.body && r1.body.lancamentoId ? await escalar("SELECT Tipo FROM LancamentosTesouraria WHERE LancamentoId = @id", { id: r1.body.lancamentoId }) : null;
  ok(gravado === CODIGO, "o tipo gravado é o código inteiro, sem corte (25 letras)", `gravado=${gravado}`);
  const lista = await tentar(() => LANC("GET", { token: tok, query: { congregacaoId: central, mesReferencia: mes } }));
  const naLista = Array.isArray(lista.body) && lista.body.find((l) => l.lancamentoId === (r1.body && r1.body.lancamentoId));
  ok(!!naLista, "o lançamento aparece na lista do mês", naLista ? "" : JSON.stringify(lista.body).slice(0, 200));
  ok(naLista && /Oferta de Culto do Departamento/.test(JSON.stringify(naLista)), "a lista mostra o nome da categoria (a junção pelo código funciona)", naLista ? JSON.stringify(naLista).slice(0, 300) : "");

  console.log("== o que já funcionava continua igual ==");
  const r2 = await tentar(() => LANC("POST", { token: tok, corpo: { congregacaoId: central, nomeAvulso: "Dizimista avulso E2E", tipo: "DIZIMO", valor: 120, formaPagamento: "DINHEIRO", mesReferencia: mes } }));
  ok(r2.status === 201 && r2.body.sucesso, "dízimo continua sendo lançado (201)", JSON.stringify(r2.body));
  ok(r1.body && r2.body && r2.body.termoNumero === r1.body.termoNumero + 1, "o Termo nº segue contínuo entre os dois lançamentos", `${r1.body && r1.body.termoNumero} → ${r2.body && r2.body.termoNumero}`);
  const r3 = await tentar(() => LANC("POST", { token: tok, corpo: { congregacaoId: central, nomeAvulso: "X", tipo: "CATEGORIA_QUE_NAO_EXISTE_E2E", valor: 10, formaPagamento: "DINHEIRO", mesReferencia: mes } }));
  ok(r3.status === 400 && !r3.body.sucesso, "categoria que não está no catálogo continua recusada (400)", JSON.stringify(r3.body));

  console.log("== conta a receber confirmada ==");
  const venc = hojeBr();
  const c1 = await tentar(() => CR("POST", { token: tok, corpo: { congregacaoId: central, nomeAvulso: "Departamento de Mulheres E2E", tipo: CODIGO, descricao: "Oferta do culto de sábado", valor: 64, dataVencimento: venc } }));
  const crId = c1.body && (c1.body.contaReceberId || c1.body.id);
  ok((c1.status === 200 || c1.status === 201) && c1.body.sucesso && crId, "a conta a receber da Oferta de Culto do Departamento é registrada", JSON.stringify(c1.body));
  const c2 = crId ? await tentar(() => CR("PUT", { token: tok, id: crId, corpo: { acao: "CONFIRMAR", formaPagamento: "DINHEIRO", mesReferencia: mes } })) : { status: 0, body: {} };
  ok(c2.body && c2.body.sucesso, "confirmar a conta gera o lançamento (antes o banco recusava)", JSON.stringify(c2.body));
  const doCr = crId ? await escalar("SELECT l.Tipo FROM ContasAReceber cr JOIN LancamentosTesouraria l ON l.LancamentoId = cr.LancamentoId WHERE cr.ContaReceberId = @id", { id: crId }) : null;
  ok(doCr === CODIGO, "o lançamento nascido da conta tem o código inteiro", `tipo=${doCr}`);

  const depois = await escalar("SELECT COUNT(*) FROM LancamentosTesouraria");
  ok(depois - antes === 3, "exatamente 3 lançamentos novos (oferta, dízimo e a conta confirmada) — nada a mais, nada a menos", `${antes} → ${depois}`);
  fim("e2e-81 oferta de culto do departamento (migração 172)");
})().catch((e) => { console.log("ERRO", e.message); fim("e2e-81 (abortado)"); });
