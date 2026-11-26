// shared/finLancamentos.js (FASE 10, Financeiro, incremento 3, 26/11/2026) — a REGRA PURA de LANÇAR DÍZIMOS E OFERTAS (migração 204). As
// consultas estão em shared/finLancamentosDb.js. Tela aprovada: rodada 24, "r24-lancamento", opção 1 (a planilha, a linha de lançar, o celular e
// a área), sem "marcada em novembro" (a resposta dele de 22/11 e a decisão de 26/11).
//
// - Cada folha do bloco é uma linha, na ordem do papel. Ao lançar só existem "Este mês" e "Mês posterior"; ninguém marca "mês anterior".
// - A folha marcada "mês posterior" soma no mês seguinte: no mês em que foi entregue fica só com a linha "referente ao mês posterior" (sem nome e
//   sem valor); a planilha do mês seguinte começa nela, com o nome e o valor obrigatórios. As que somaram no mês anterior vêm com a tarja
//   "referente ao mês anterior", sozinhas, e ninguém digita nada.
// - O dia do lançamento: o mês de agora ou o anterior, nunca depois de hoje; o anterior só enquanto a congregação não mandou aquele relatório.
// - O dinheiro anda em centavos inteiros (nada de número quebrado); o banco guarda DECIMAL(14,2).

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const TIPOS = { DIZIMO: "Dízimo", OFERTA_CULTO: "Oferta de culto", OFERTA_VOLUNTARIA: "Oferta voluntária" };
const FORMAS = { PIX: "Pix", ESPECIE: "Espécie" };
const REFERENTES = ["ESTE_MES", "MES_POSTERIOR"];
const MAX_CENTAVOS = 9999999999;   // R$ 99.999.999,99: muito acima de qualquer folha, e cabe com folga no DECIMAL(14,2)
const MAX_NOME = 120;
const MAX_MOTIVO = 300;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const VALOR_TEXTO = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

const milhar = (x) => Number(x).toLocaleString("pt-BR");
const tem = (v) => v !== undefined && v !== null && v !== "";

// ---- o dinheiro ----

/** o valor digitado ("250,00", "1.454,00", "R$ 486,50" ou um número com até 2 casas) em centavos; null quando não vale (zero, negativo, lixo) */
function lerValor(v) {
  let centavos = null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const c = Math.round(v * 100);
    if (Math.abs(v * 100 - c) > 1e-6) return null;
    centavos = c;
  } else if (typeof v === "string") {
    const t = v.trim().replace(/^R\$\s*/, "");
    if (!VALOR_TEXTO.test(t)) return null;
    const [inteiro, frac = ""] = t.split(",");
    centavos = Number(inteiro.replace(/\./g, "")) * 100 + Number(frac.padEnd(2, "0"));
  } else return null;
  return centavos > 0 && centavos <= MAX_CENTAVOS ? centavos : null;
}
/** centavos → o texto que o DECIMAL do banco recebe ("1454.00"), sem passar por número quebrado */
const decimalDoBanco = (c) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
/** o DECIMAL que o banco devolve (número ou texto) → centavos */
const centavosDoBanco = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));
/** centavos → como a tela mostra ("1.454,00") */
const reais = (c) => `${milhar(Math.trunc(c / 100))},${String(c % 100).padStart(2, "0")}`;

// ---- o mês ----

/** o dia 1 do mês da data ("2026-12-02" → "2026-12-01") */
const mesDe = (dia) => `${dia.slice(0, 7)}-01`;
function mesSomado(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
const mesSeguinte = (mes) => mesSomado(mes, 1);
const mesAnterior = (mes) => mesSomado(mes, -1);
/** o mês em que a folha soma: o do dia ("Este mês") ou o seguinte ("Mês posterior") */
const mesSoma = (dia, referente) => (referente === "MES_POSTERIOR" ? mesSeguinte(mesDe(dia)) : mesDe(dia));
const nomeDoMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];

function dataValida(s) {
  if (typeof s !== "string" || !DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** o dia do lançamento (sem dia = hoje): o mês de agora ou o anterior, nunca depois de hoje; o anterior só se aquele relatório não foi mandado */
function diaDoLancamento(dia, hoje, mandouOAnterior) {
  const d = tem(dia) ? dia : hoje;
  if (!dataValida(d)) return { ok: false, mensagem: "Confira o dia do lançamento." };
  if (d > hoje) return { ok: false, mensagem: "Depois de hoje: confira a data." };
  const agora = mesDe(hoje), antes = mesAnterior(agora), mes = mesDe(d);
  if (mes !== agora && mes !== antes) return { ok: false, mensagem: `Só se lança no mês de agora ou no anterior (${nomeDoMes(antes)}).` };
  if (mes === antes && mandouOAnterior) return { ok: false, mensagem: `O relatório de ${nomeDoMes(antes)} já foi mandado: lance em ${nomeDoMes(agora)}.` };
  return { ok: true, dia: d, mes };
}

/** o mês pedido pela tela ("2026-11"; vazio = o de agora) → "2026-11-01"; null quando não vale (lixo, mês que não existe, depois de agora) */
function mesDaTela(v, hoje) {
  const agora = mesDe(hoje);
  if (!tem(v)) return agora;
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  const mes = `${v}-01`;
  return mes >= "2020-01-01" && mes <= agora ? mes : null;
}

/** o último dia do mês ("2026-11-01" → "2026-11-30"): o dia que a tela propõe para lançar no mês anterior */
const ultimoDia = (mes) => new Date(Date.parse(`${mesSeguinte(mes)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

// ---- a linha ----

/** quem deu: o membro do cadastro ({ membroId }) ou o nome digitado ({ nome }), nunca os dois; nada = sem nome */
function lerPessoa(p) {
  if (!tem(p)) return { ok: true, membroId: null, nome: null };
  if (typeof p !== "object" || Array.isArray(p)) return { ok: false, mensagem: "quem deu não confere." };
  if (tem(p.nome) && typeof p.nome !== "string") return { ok: false, mensagem: "quem deu não confere." };
  const nome = tem(p.nome) ? p.nome.trim().replace(/\s+/g, " ") : "";
  const comId = tem(p.membroId);
  if (comId && nome) return { ok: false, mensagem: "escolha o membro do cadastro ou digite o nome, não os dois." };
  if (comId) return Number.isInteger(p.membroId) && p.membroId > 0 ? { ok: true, membroId: p.membroId, nome: null } : { ok: false, mensagem: "o membro escolhido não confere." };
  if (nome.length > MAX_NOME) return { ok: false, mensagem: `o nome tem no máximo ${MAX_NOME} letras.` };
  return { ok: true, membroId: null, nome: nome || null };
}

/** os campos preenchidos (tipo, forma, valor, voluntária e quem deu) de uma linha "este mês", da folha que se preenche ou da correção */
function lerCampos(l, preencher) {
  if (!TIPOS[l.tipo]) return { ok: false, mensagem: "escolha o tipo (dízimo, oferta de culto ou oferta voluntária)." };
  if (!FORMAS[l.forma]) return { ok: false, mensagem: "escolha a forma (Pix ou espécie)." };
  const valor = lerValor(l.valor);
  if (valor === null) return { ok: false, mensagem: "informe o valor." };
  let voluntaria = null;
  if (tem(l.voluntaria)) {
    if (l.tipo !== "DIZIMO") return { ok: false, mensagem: "a oferta voluntária junto só vai com o dízimo." };
    voluntaria = lerValor(l.voluntaria);
    if (voluntaria === null) return { ok: false, mensagem: "o valor da oferta voluntária não confere." };
  }
  const p = lerPessoa(l.pessoa);
  if (!p.ok) return p;
  const semNome = !p.membroId && !p.nome;
  if (semNome && preencher) return { ok: false, mensagem: "informe quem deu (a folha veio marcada do mês anterior)." };
  if (semNome && l.tipo === "DIZIMO") return { ok: false, mensagem: "o dízimo precisa de quem deu (do cadastro ou o nome digitado)." };
  return { ok: true, campos: { tipo: l.tipo, forma: l.forma, valor, voluntaria, membroId: p.membroId, nome: p.nome } };
}

/**
 * Confere uma linha da planilha. { preencher: true } é a folha que veio marcada "mês posterior" do mês anterior: o "Referente a" já está decidido
 * e o nome e o valor são obrigatórios. Devolve a linha limpa (valores em centavos) ou a mensagem com o número da folha.
 */
function validarLinha(l, { preencher = false } = {}) {
  if (!l || typeof l !== "object" || !Number.isInteger(l.folha) || l.folha <= 0) return { ok: false, mensagem: "Confira o número da folha." };
  const pre = `Folha ${milhar(l.folha)}: `;
  const erro = (m) => ({ ok: false, mensagem: pre + m });
  const vazia = { tipo: null, forma: null, valor: null, voluntaria: null, membroId: null, nome: null };
  if (!preencher && !REFERENTES.includes(l.referente)) return erro("escolha “Este mês” ou “Mês posterior”.");
  if (!preencher && l.referente === "MES_POSTERIOR") {
    const algo = tem(l.tipo) || tem(l.forma) || tem(l.valor) || tem(l.voluntaria) || (tem(l.pessoa) && (tem(l.pessoa.membroId) || tem(l.pessoa.nome)));
    if (algo) return erro("a folha do mês posterior fica sem nome e sem valor; eles entram na planilha do mês seguinte.");
    return { ok: true, linha: { folha: l.folha, referente: "MES_POSTERIOR", ...vazia } };
  }
  const c = lerCampos(l, preencher);
  if (!c.ok) return erro(c.mensagem);
  return { ok: true, linha: { folha: l.folha, referente: preencher ? "MES_POSTERIOR" : "ESTE_MES", ...c.campos } };
}

/** a correção (a regra da r27: a linha muda e a trilha guarda o antes, o depois, o motivo e quem): os campos novos e o motivo, obrigatório */
function validarCorrecao(d) {
  if (!d || typeof d !== "object") return { ok: false, mensagem: "Confira a correção." };
  const motivo = typeof d.motivo === "string" ? d.motivo.trim().replace(/\s+/g, " ") : "";
  if (!motivo) return { ok: false, mensagem: "Escreva o motivo da correção." };
  if (motivo.length > MAX_MOTIVO) return { ok: false, mensagem: `O motivo tem no máximo ${MAX_MOTIVO} letras.` };
  const c = lerCampos(d, false);
  if (!c.ok) return { ok: false, mensagem: c.mensagem.charAt(0).toUpperCase() + c.mensagem.slice(1) };
  return { ok: true, campos: c.campos, motivo };
}

/** o que mudou entre o lançamento de agora e a correção (só os campos que a correção alcança); vazio = nada mudou */
function mudancas(antes, depois) {
  return ["tipo", "forma", "valor", "voluntaria", "membroId", "nome"].filter((k) => (antes[k] ?? null) !== (depois[k] ?? null));
}

// ---- a planilha do mês ----

const comparado = (m, mes) => (m < mes ? "antes" : m === mes ? "mes" : "depois");

/**
 * A planilha de um mês de uma congregação.
 * - faixas: as folhas de cada entrega à congregação (uma por saída do livro): { blocoId, bloco, de, ate, saidaId, aberta }; a fechada pela
 *   devolução parcial vai até a folha antes da primeira em branco.
 * - lancamentos: { folha, dia, referente, mesSoma, tipo, forma, valor (centavos), voluntaria, ... }; excecoes: { folha, destino, observacao, dia };
 *   lancadasSemDados: as folhas lançadas antes da migração 204, sem o lançamento (a semeadura e os roteiros antigos).
 * Em cada faixa, as linhas vão da primeira à última folha que importa para o mês (o que soma nele, o que foi entregue nele, a exceção marcada
 * nele, a folha sem destino que ficou para trás); as do meio que não importam vêm com a tarja (anterior, posterior) para a sequência do papel.
 * A próxima é a primeira folha livre depois da última usada, na primeira entrega em curso que ainda tem folha.
 */
function montarPlanilha({ faixas, lancamentos, excecoes, lancadasSemDados, mes }) {
  const porFolha = new Map();
  for (const f of lancadasSemDados) porFolha.set(f, { natureza: "antiga" });
  for (const x of excecoes) porFolha.set(x.folha, { natureza: "excecao", ...x });
  for (const l of lancamentos) porFolha.set(l.folha, { natureza: "lancamento", ...l });
  const ordenadas = [...faixas].sort((a, b) => a.de - b.de);
  const ultimaUsada = (fx) => { let u = fx.de - 1; for (let f = fx.de; f <= fx.ate; f++) if (porFolha.has(f)) u = f; return u; };

  let proxima = null;
  for (const fx of ordenadas.filter((x) => x.aberta)) {
    const u = ultimaUsada(fx);
    if (u < fx.ate) { proxima = { folha: u + 1, blocoId: fx.blocoId, bloco: fx.bloco, saidaId: fx.saidaId }; break; }
  }

  const importa = (f, fx, u) => {
    const x = porFolha.get(f);
    if (!x) return !fx.aberta || f < u;                         // a folha sem destino que ficou para trás (ou de entrega que já voltou)
    if (x.natureza === "lancamento") return x.mesSoma === mes || mesDe(x.dia) === mes;
    if (x.natureza === "excecao") return !!x.dia && mesDe(x.dia) === mes;
    return false;
  };
  const linhas = [];
  for (const fx of ordenadas) {
    const u = ultimaUsada(fx);
    let de = null, ate = null;
    for (let f = fx.de; f <= fx.ate; f++) if (importa(f, fx, u)) { if (de === null) de = f; ate = f; }
    if (de === null) continue;
    for (let f = de; f <= ate; f++) {
      const x = porFolha.get(f), base = { folha: f, blocoId: fx.blocoId, bloco: fx.bloco, saidaId: fx.saidaId };
      if (!x) linhas.push({ ...base, situacao: "pendente" });
      else if (x.natureza === "antiga") linhas.push({ ...base, situacao: "anterior", mesSoma: null });
      else if (x.natureza === "excecao") linhas.push({ ...base, situacao: "excecao", destino: x.destino, observacao: x.observacao ?? null, dia: x.dia ?? null });
      else {
        const { natureza, ...l } = x;
        const posterior = l.referente === "MES_POSTERIOR";
        let situacao;
        if (l.mesSoma === mes) situacao = posterior && l.valor === null ? "preencher" : "lancada";
        else if (l.mesSoma > mes) situacao = posterior ? "posterior" : "depois";
        else situacao = "anterior";
        linhas.push({ ...l, ...base, situacao, veioDoMesAnterior: posterior && l.mesSoma === mes });
      }
    }
  }
  const marcadasNoAnterior = lancamentos.filter((l) => l.referente === "MES_POSTERIOR" && l.mesSoma === mes).map((l) => l.folha).sort((a, b) => a - b);
  return { mes, comeca: linhas.length ? linhas[0].folha : proxima ? proxima.folha : null, proxima, linhas, marcadasNoAnterior };
}

/** os totais do mês (o que soma nele, em centavos): os quadros da planilha; "adiantado" é o que entrou no mês anterior marcado "mês posterior" */
function totaisDoMes(lancamentos, mes) {
  const t = { dizimos: 0, ofertaCulto: 0, ofertaVoluntaria: 0, voluntariasJunto: 0, voluntariasSozinhas: 0, total: 0, pix: 0, especie: 0, adiantado: 0, folhas: 0 };
  for (const l of lancamentos) {
    if (l.mesSoma !== mes || l.valor === null || l.valor === undefined) continue;
    const vol = l.voluntaria || 0, soma = l.valor + vol;
    if (l.tipo === "DIZIMO") t.dizimos += l.valor;
    else if (l.tipo === "OFERTA_CULTO") t.ofertaCulto += l.valor;
    else if (l.tipo === "OFERTA_VOLUNTARIA") { t.ofertaVoluntaria += l.valor; t.voluntariasSozinhas++; }
    if (vol) { t.ofertaVoluntaria += vol; t.voluntariasJunto++; }
    if (l.forma === "PIX") t.pix += soma; else t.especie += soma;
    if (l.referente === "MES_POSTERIOR") t.adiantado += soma;
    t.total += soma;
    t.folhas++;
  }
  return t;
}

/** as posições do bloco por extenso, como a legenda do desenho: [1..10, 13, 14] → "1ª a 10ª, 13ª e 14ª" */
function posicoesEmTexto(lista) {
  const p = [...lista].sort((a, b) => a - b), itens = [];
  for (let i = 0; i < p.length;) {
    let j = i;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    if (j - i >= 2) itens.push(`${p[i]}ª a ${p[j]}ª`); else for (let k = i; k <= j; k++) itens.push(`${p[k]}ª`);
    i = j + 1;
  }
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * A tira do bloco (os 50 quadradinhos do desenho) vista de um mês: cada posição "antes" (somou num mês anterior), "posterior" (marcada "mês
 * posterior" e ainda não somou num mês que passou), "mes", "depois" (só na planilha de um mês que passou), "proxima" ou "livre" (a folha sem
 * destino, também a que ficou para trás). Com a legenda escrita.
 */
function tiraDoBloco({ bloco, lancamentos, excecoes, lancadasSemDados, proxima, mes }) {
  const estado = new Map(), mesDoAntes = new Map();
  for (const f of lancadasSemDados) { estado.set(f, "antes"); mesDoAntes.set(f, null); }
  for (const x of excecoes) if (x.dia) { const e = comparado(mesDe(x.dia), mes); estado.set(x.folha, e); if (e === "antes") mesDoAntes.set(x.folha, mesDe(x.dia)); }
  for (const l of lancamentos) {
    const e = l.referente === "MES_POSTERIOR" && l.mesSoma >= mes ? "posterior" : comparado(l.mesSoma, mes);
    estado.set(l.folha, e);
    if (e === "antes") mesDoAntes.set(l.folha, l.mesSoma);
  }
  const posicoes = [], grupos = { antes: [], posterior: [], mes: [], depois: [] };
  for (let f = bloco.primeiraFolha; f <= bloco.ultimaFolha; f++) {
    const e = proxima && proxima.folha === f ? "proxima" : estado.get(f) || "livre";
    posicoes.push(e);
    if (grupos[e]) grupos[e].push(f - bloco.primeiraFolha + 1);
  }
  const legenda = [];
  if (grupos.antes.length) {
    const anterior = mesAnterior(mes);
    const todosNoAnterior = [...mesDoAntes.entries()].filter(([f]) => estado.get(f) === "antes" && f >= bloco.primeiraFolha && f <= bloco.ultimaFolha).every(([, m]) => m === anterior);
    legenda.push({ estado: "antes", texto: `${todosNoAnterior ? nomeDoMes(anterior) : `antes de ${nomeDoMes(mes)}`}: ${posicoesEmTexto(grupos.antes)}` });
  }
  if (grupos.posterior.length) legenda.push({ estado: "posterior", texto: `mês posterior: ${posicoesEmTexto(grupos.posterior)}` });
  if (grupos.mes.length) {
    const m = grupos.mes, posProxima = proxima ? proxima.folha - bloco.primeiraFolha + 1 : null;
    const corrida = m[m.length - 1] - m[0] + 1 === m.length && (posProxima === null || posProxima === m[m.length - 1] + 1 || posProxima < 1 || posProxima > posicoes.length);
    legenda.push({ estado: "mes", texto: `${nomeDoMes(mes)}: ${corrida && m.length > 1 ? `da ${m[0]}ª` : posicoesEmTexto(m)}` });
  }
  if (grupos.depois.length) legenda.push({ estado: "depois", texto: `depois de ${nomeDoMes(mes)}: ${posicoesEmTexto(grupos.depois)}` });
  if (posicoes.includes("proxima")) legenda.push({ estado: "proxima", texto: `a próxima: ${milhar(proxima.folha)}` });
  // na ordem do papel: cada grupo pela primeira posição dele (dezembro: novembro, mês posterior, dezembro, a próxima)
  legenda.sort((x, y) => posicoes.indexOf(x.estado) - posicoes.indexOf(y.estado));
  return { blocoId: bloco.blocoId, numero: bloco.numero, primeiraFolha: bloco.primeiraFolha, ultimaFolha: bloco.ultimaFolha, posicoes, legenda };
}

module.exports = {
  TIPOS, FORMAS, REFERENTES, MAX_CENTAVOS, MAX_NOME, MAX_MOTIVO,
  lerValor, decimalDoBanco, centavosDoBanco, reais,
  mesDe, mesSeguinte, mesAnterior, mesSoma, nomeDoMes, dataValida, diaDoLancamento, mesDaTela, ultimoDia,
  lerPessoa, validarLinha, validarCorrecao, mudancas,
  montarPlanilha, totaisDoMes, posicoesEmTexto, tiraDoBloco
};
