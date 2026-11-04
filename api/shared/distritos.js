// shared/distritos.js — v9.3: Distrito e macroexpansão. A regra pura, sem banco; o banco está em distritosDb.js.
// Estatuto Art. 5º §5º; Regimento Art. 6-A, III e IV, Art. 53-D, I, Art. 126-K a 126-N, Art. 126-P e Art. 144, II.
// Desenho em docs/plano/fase-9-entidades-vinculadas.md ("Desenho da v9.3").
const { texto, idDe, booleano, br, UFS } = require("./entidadesVinculadas");

// Art. 126-K §2º: o Distrito não nasce por quantidade de congregações, mas por um destes dois gatilhos.
const GATILHOS = {
  METROPOLE: "Capital ou região metropolitana fora da sede de origem (Art. 126-K §2º, a)",
  MILHAO: "Cidade com mais de 1.000.000 de habitantes (Art. 126-K §2º, b)"
};
const LIMITE_POPULACAO = 1000000;
// Art. 126-N, III (a desvinculação, o estatuto próprio, a retenção da cota) e Art. 126-P, II (a intervenção a qualquer tempo).
const MOTIVOS_INTERVENCAO = {
  DESVINCULACAO: "Tentativa de desvincular o Distrito do Ministério IEADESPA",
  ESTATUTO_PROPRIO: "Alteração ou adoção de estatuto próprio",
  RETENCAO_REPASSE: "Retenção da cota de repasse (Dízimo Institucional)",
  OUTRA: "Outra ameaça à integridade do Ministério (Art. 126-P, II)"
};
// As medidas que dependem de gente (o sistema só registra que foram determinadas).
const MEDIDAS = {
  bloqueioContas: "Bloqueio das contas bancárias do Distrito",
  procuracao: "Revogação da procuração pública do Pastor Distrital",
  judicial: "Providência policial ou judicial"
};
const STATUS_BALANCO = { ENVIADO: "Enviado, aguardando o NIF", APROVADO: "Aprovado pelo NIF", DEVOLVIDO: "Devolvido pelo NIF" };
const DECISOES_BALANCO = { APROVAR: "Aprovar", DEVOLVER: "Devolver para correção" };
// O balanço do ano vai ao NIF até 31 de março do ano seguinte (o Regimento diz "anualmente"; a data é a mesma da prestação de contas anual da Sede).
const PRAZO_BALANCO_MES_DIA = "03-31";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ehMes = (m) => typeof m === "string" && /^[12][0-9]{3}-(0[1-9]|1[0-2])$/.test(m);
const mesDe = (iso) => String(iso).slice(0, 7);
function proximoMes(m) {
  const [a, mm] = m.split("-").map(Number);
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
}
function mesAnterior(m) {
  const [a, mm] = m.split("-").map(Number);
  return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, "0")}`;
}
// Os meses de `desde` até `ate` (inclusivo), em ordem. Teto de 600 meses para nunca girar sem fim.
function mesesEntre(desde, ate) {
  const out = [];
  if (!ehMes(desde) || !ehMes(ate)) return out;
  for (let m = desde; m <= ate && out.length < 600; m = proximoMes(m)) out.push(m);
  return out;
}
// O mês é do Distrito quando cai dentro de algum período: [FinanceiroDesdeMes, FinanceiroAteMes) — o mês da desativação já volta para a Sede.
function mesNoPeriodo(mes, p) { return mes >= p.financeiroDesdeMes && (!p.financeiroAteMes || mes < p.financeiroAteMes); }
// O período legado (ativo pelo cadastro antes da v9.3, sem decreto) não tem efeito no dinheiro nem no balanço até o decreto ser registrado.
const comDecreto = (periodos) => (periodos || []).filter((p) => !p.legado);
const mesDoDistrito = (mes, periodos) => comDecreto(periodos).some((p) => mesNoPeriodo(mes, p));

// O mês M vence no dia da tolerância do mês seguinte (o mesmo critério dos repasses institucionais, v4.15): depois disso, sem repasse, a cota está retida.
// O último dia dentro do prazo: o dia da tolerância do mês seguinte (tolerância 0 = o último dia do próprio mês) — o mesmo de repassesInstitucionais.estaAtrasado.
function venceEm(mes, diasTolerancia) {
  const [a, mm] = mes.split("-").map(Number);
  const tol = Math.max(0, Math.min(28, Math.trunc(Number(diasTolerancia) || 0)));
  return new Date(Date.UTC(a, mm, tol)).toISOString().slice(0, 10);
}
const mesVencido = (mes, hoje, diasTolerancia) => hoje > venceEm(mes, diasTolerancia);

// O Dízimo Institucional (Art. 126-N, I): o percentual sobre a arrecadação líquida consolidada (a soma do Total Final dos fechamentos do território).
const dizimoInstitucional = (soma, percentual) => round2(Number(soma) * Number(percentual) / 100);

// A posição de um mês do Distrito.
//   `congregacoes`: as que o mês exige (do território, ativas e que já fechavam a tesouraria naquele mês — a congregação nova não trava meses anteriores a ela);
//   `fechamentos`: os do mês com o repasse gravado para este Distrito (os que entram na soma); `fecharam`: ids das congregações exigidas que fecharam o mês (para
//   qualquer destino).
//   situacao: REPASSADO · REGISTRADO (pendente de repasse) · APURAVEL (todas fecharam) · ABERTO (falta fechamento) · SEM_MOVIMENTO (nada a apurar).
//   `vencido`: passou da tolerância sem repasse e havia o que repassar; `motivoVencido`: RETENCAO (apurável ou registrado e não repassado) ou FECHAMENTO (falta o
//   fechamento local: o Dízimo nem pôde ser calculado — não é a retenção do Art. 126-N, III).
function situacaoDoMes({ mes, congregacoes, fechamentos, fecharam, repasse, percentual, diasTolerancia, hoje }) {
  const exigidas = congregacoes || [];
  const fechou = new Set((fecharam || (fechamentos || []).map((f) => f.congregacaoId)).map(Number));
  const faltam = exigidas.filter((c) => !fechou.has(Number(c.congregacaoId))).map((c) => ({ congregacaoId: c.congregacaoId, nome: c.nome }));
  const soma = round2((fechamentos || []).reduce((s, f) => s + Number(f.totalFinal || 0), 0));
  const valor = repasse ? round2(repasse.valorRepasse) : dizimoInstitucional(soma, percentual);
  let situacao;
  if (repasse && repasse.status === "REPASSADO") situacao = "REPASSADO";
  else if (repasse) situacao = "REGISTRADO";
  else if (!exigidas.length && !(fechamentos || []).length) situacao = "SEM_MOVIMENTO";
  else if (!faltam.length) situacao = "APURAVEL";
  else situacao = "ABERTO";
  const passou = mesVencido(mes, hoje, diasTolerancia);
  let motivoVencido = null;
  if (passou && (situacao === "REGISTRADO" || (situacao === "APURAVEL" && valor > 0))) motivoVencido = "RETENCAO";
  else if (passou && situacao === "ABERTO") motivoVencido = "FECHAMENTO";
  return {
    mes, situacao, faltam, fechadas: exigidas.length - faltam.length, congregacoes: exigidas.length, soma, valor,
    venceEm: venceEm(mes, diasTolerancia), vencido: !!motivoVencido, motivoVencido, repasse: repasse || null
  };
}

// Os anos com algum mês do Distrito, até o ano anterior ao de hoje (o balanço de um ano só é devido depois que ele termina).
function anosDoDistrito(periodos, hoje) {
  const anoAtual = Number(String(hoje).slice(0, 4));
  const anos = new Set();
  for (const p of comDecreto(periodos)) {
    const ultimo = p.financeiroAteMes ? mesAnterior(p.financeiroAteMes) : `${anoAtual}-12`;
    if (ultimo < p.financeiroDesdeMes) continue;
    for (let a = Number(p.financeiroDesdeMes.slice(0, 4)); a <= Number(ultimo.slice(0, 4)); a++) if (a < anoAtual) anos.add(a);
  }
  return [...anos].sort((x, y) => x - y);
}
const prazoBalanco = (ano) => `${Number(ano) + 1}-${PRAZO_BALANCO_MES_DIA}`;
// O balanço "vivo" do ano (o enviado ou o aprovado); o devolvido sem reenvio não conta.
const balancoVivo = (balancos, ano) => (balancos || []).find((b) => Number(b.ano) === Number(ano) && (b.status === "ENVIADO" || b.status === "APROVADO")) || null;
// Os anos com o balanço atrasado: o prazo passou e não há balanço enviado nem aprovado.
function balancosAtrasados(periodos, balancos, hoje) {
  return anosDoDistrito(periodos, hoje).filter((ano) => hoje > prazoBalanco(ano) && !balancoVivo(balancos, ano));
}

// ================================================================ trechos de SQL ================================================================
// O Distrito do repasse é gravado no fechamento (FechamentosTesouraria.RepasseDistritoId), na hora em que o mês é fechado (DISTRITO_DO_MES): mudar o território
// depois não reescreve o passado (revisão de 04/11/2026). Usado no Rateio Geral (o que é do Distrito não entra no malote da Sede) e na Tesouraria Local (o rótulo).
// Só nomes de alias e de parâmetro fixos entram no texto.
const ALIAS = /^[a-z]{1,3}$/;
const PARAM = /^@[a-zA-Z]{1,30}$/;
function conferirAlias(...nomes) { for (const n of nomes) if (!ALIAS.test(n)) throw new Error("alias inválido"); }
const REPASSE_DO_DISTRITO = (f = "f") => { conferirAlias(f); return `${f}.RepasseDistritoId IS NOT NULL`; };
// O nome do Distrito que recebe o repasse do fechamento (ou NULL: vai para a Sede).
const NOME_DO_DISTRITO_DO_REPASSE = (f = "f") => { conferirAlias(f); return `(SELECT dtd.Nome FROM Distritos dtd WHERE dtd.DistritoId = ${f}.RepasseDistritoId)`; };
// O Distrito que recebe o repasse da congregação naquele mês, decidido agora (no fechamento): o território de hoje e um período COM DECRETO (o legado não conta)
// que cubra o mês. NULL: vai para a Sede. Os argumentos são nomes de parâmetro ou expressões de coluna com alias.
function DISTRITO_DO_MES(congregacao, mes) {
  for (const x of [congregacao, mes]) if (!PARAM.test(x) && !/^[a-z]{1,3}\.[A-Za-z]{1,40}$/.test(x)) throw new Error("expressão inválida");
  return `(SELECT TOP 1 dtq.DistritoId FROM Congregacoes dtc JOIN Areas dta ON dta.AreaId = dtc.AreaId JOIN Regioes dtr ON dtr.RegiaoId = dta.RegiaoId
    JOIN Quadrantes dtq ON dtq.QuadranteId = dtr.QuadranteId JOIN DistritoPeriodos dtp ON dtp.DistritoId = dtq.DistritoId
    WHERE dtc.CongregacaoId = ${congregacao} AND dtp.Legado = 0 AND ${mes} >= dtp.FinanceiroDesdeMes AND (dtp.FinanceiroAteMes IS NULL OR ${mes} < dtp.FinanceiroAteMes))`;
}

// ================================================================ validações ================================================================
function validarAtivacao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const sessaoId = idDe(d.sessaoId);
  if (!sessaoId) return { valido: false, mensagem: "Escolha a reunião da CLI que decretou a ativação." };
  const gatilho = typeof d.gatilho === "string" ? d.gatilho.toUpperCase() : "";
  if (!GATILHOS[gatilho]) return { valido: false, mensagem: "Escolha o gatilho do Art. 126-K §2º: capital ou região metropolitana fora da sede (a), ou cidade com mais de um milhão de habitantes (b)." };
  const cidade = texto(d.cidade, { minimo: 2, maximo: 150, rotulo: "A cidade" });
  if (!cidade.valido) return cidade;
  const uf = typeof d.uf === "string" ? d.uf.trim().toUpperCase() : "";
  if (!UFS.includes(uf)) return { valido: false, mensagem: "Escolha a UF." };
  let populacao = null;
  if (d.populacao != null && d.populacao !== "") {
    const bruto = typeof d.populacao === "number" ? String(d.populacao) : (typeof d.populacao === "string" ? d.populacao.replace(/[.\s]/g, "") : "");
    if (!/^[1-9][0-9]{0,9}$/.test(bruto) || Number(bruto) > 2147483647) return { valido: false, mensagem: "A população é um número inteiro de habitantes (sem pontos ou com pontos de milhar)." };
    populacao = Number(bruto);
  }
  if (gatilho === "MILHAO" && (populacao == null || populacao <= LIMITE_POPULACAO)) {
    return { valido: false, mensagem: "O gatilho (b) exige cidade com MAIS de 1.000.000 de habitantes: informe a população." };
  }
  const fonte = texto(d.fontePopulacao, { maximo: 200, rotulo: "A fonte da população", obrigatorio: populacao != null });
  if (!fonte.valido) return fonte;
  const fundamentacao = texto(d.fundamentacao, { minimo: 10, maximo: 2000, rotulo: "A fundamentação do decreto", multilinha: true });
  if (!fundamentacao.valido) return fundamentacao;
  return { valido: true, dados: { sessaoId, gatilho, cidade: cidade.texto, uf, populacao, fontePopulacao: fonte.texto, fundamentacao: fundamentacao.texto } };
}

function validarDesativacao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const sessaoId = idDe(d.sessaoId);
  if (!sessaoId) return { valido: false, mensagem: "Escolha a reunião da CLI que decretou a desativação." };
  const motivo = texto(d.motivo, { minimo: 10, maximo: 2000, rotulo: "O motivo", multilinha: true });
  if (!motivo.valido) return motivo;
  return { valido: true, dados: { sessaoId, motivo: motivo.texto } };
}

function validarIntervencao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const motivo = typeof d.motivo === "string" ? d.motivo.toUpperCase() : "";
  if (!MOTIVOS_INTERVENCAO[motivo]) return { valido: false, mensagem: "Escolha o motivo da intervenção." };
  const fundamentacao = texto(d.fundamentacao, { minimo: 20, maximo: 4000, rotulo: "A fundamentação", multilinha: true });
  if (!fundamentacao.valido) return fundamentacao;
  const interventorMembroId = idDe(d.interventorMembroId);
  if (!interventorMembroId) return { valido: false, mensagem: "Informe a matrícula do Interventor." };
  const medidas = {};
  for (const k of Object.keys(MEDIDAS)) {
    if (d[k] != null && typeof d[k] !== "boolean") return { valido: false, mensagem: "As medidas são marcadas como verdadeiro ou falso." };
    medidas[k] = booleano(d[k]);
  }
  return { valido: true, dados: { motivo, fundamentacao: fundamentacao.texto, interventorMembroId, ...medidas } };
}

function validarEncerramento(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const resultado = texto(d.resultado, { minimo: 10, maximo: 2000, rotulo: "O resultado da intervenção", multilinha: true });
  if (!resultado.valido) return resultado;
  return { valido: true, dados: { resultado: resultado.texto } };
}

// Dinheiro em reais: número ou texto "1234,56" / "1.234,56" / "1234.56"; no máximo 2 casas e 12 dígitos inteiros.
function valorEmReais(v, rotulo, { podeNegativo = false } = {}) {
  let t;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { valido: false, mensagem: `${rotulo}: informe um valor em reais.` };
    t = v.toFixed(2);
  } else if (typeof v === "string") {
    t = v.trim().replace(/\s/g, "");
    if (/,/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  } else return { valido: false, mensagem: `${rotulo}: informe um valor em reais.` };
  if (!/^-?[0-9]{1,12}(\.[0-9]{1,2})?$/.test(t)) return { valido: false, mensagem: `${rotulo}: informe um valor em reais (até duas casas decimais).` };
  const n = round2(Number(t));
  if (!podeNegativo && n < 0) return { valido: false, mensagem: `${rotulo} não pode ser negativo.` };
  return { valido: true, valor: n };
}

function validarBalanco(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const ano = typeof d.ano === "number" ? d.ano : (typeof d.ano === "string" && /^[0-9]{4}$/.test(d.ano.trim()) ? Number(d.ano.trim()) : NaN);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) return { valido: false, mensagem: "Escolha o ano do balanço." };
  const receitas = valorEmReais(d.receitas, "As receitas");
  if (!receitas.valido) return receitas;
  const despesas = valorEmReais(d.despesas, "As despesas");
  if (!despesas.valido) return despesas;
  const saldo = valorEmReais(d.saldoFinal, "O saldo em 31/12", { podeNegativo: true });
  if (!saldo.valido) return saldo;
  const observacoes = texto(d.observacoes, { maximo: 2000, rotulo: "As observações", obrigatorio: false, multilinha: true });
  if (!observacoes.valido) return observacoes;
  return { valido: true, dados: { ano, receitas: receitas.valor, despesas: despesas.valor, saldoFinal: saldo.valor, observacoes: observacoes.texto } };
}

function validarAnalise(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const decisao = typeof d.decisao === "string" ? d.decisao.toUpperCase() : "";
  if (!DECISOES_BALANCO[decisao]) return { valido: false, mensagem: "Escolha: aprovar ou devolver o balanço." };
  const motivo = texto(d.motivo, { minimo: decisao === "DEVOLVER" ? 10 : 0, maximo: 2000, rotulo: "O motivo da devolução", obrigatorio: decisao === "DEVOLVER", multilinha: true });
  if (!motivo.valido) return motivo;
  return { valido: true, dados: { decisao, motivo: decisao === "DEVOLVER" ? motivo.texto : null } };
}

// O balanço de um ano pode ser enviado quando o ano já terminou e o Distrito esteve ativo em algum mês dele, sem outro vivo.
function podeEnviarBalanco({ ano, periodos, balancos, hoje }) {
  if (!anosDoDistrito(periodos, hoje).includes(Number(ano))) {
    return { pode: false, mensagem: "O balanço é do ano já terminado em que o Distrito esteve ativo." };
  }
  const vivo = balancoVivo(balancos, ano);
  if (vivo) return { pode: false, mensagem: vivo.status === "APROVADO" ? "O balanço deste ano já foi aprovado pelo NIF." : "O balanço deste ano já está com o NIF: espere a análise (se ele devolver, você reenvia)." };
  return { pode: true };
}

// ================================================================ textos dos avisos ================================================================
function textoRepasseVencido({ distrito, meses, motivo = "RETENCAO", faltam = [] }) {
  const lista = (meses || []).map((m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`).join(", ");
  if (motivo === "FECHAMENTO") {
    return `O Dízimo Institucional do Distrito ${distrito} de ${lista} ainda não pôde ser calculado: falta fechar o mês na Tesouraria Local de ${(faltam || []).join(", ") || "uma congregação do território"}. Feche os meses para apurar o repasse à Sede.`;
  }
  return `O Dízimo Institucional do Distrito ${distrito} está vencido sem repasse à Sede: ${lista}. A retenção da cota de repasse é causa de intervenção imediata (Regimento, Art. 126-N, III, e Art. 144, II).`;
}
function textoBalancoAtrasado({ distrito, anos }) {
  return `O Balanço Consolidado do Distrito ${distrito} não foi enviado ao NIF no prazo (31/03): ${(anos || []).join(", ")} (Regimento, Art. 126-M, II, e Art. 53-D, I).`;
}
function textoBalancoAnalisado({ distrito, ano, aprovado, motivo }) {
  return aprovado
    ? `O NIF aprovou o Balanço Consolidado de ${ano} do Distrito ${distrito}.`
    : `O NIF devolveu o Balanço Consolidado de ${ano} do Distrito ${distrito} para correção: ${motivo}. Corrija e reenvie.`;
}

module.exports = {
  GATILHOS, LIMITE_POPULACAO, MOTIVOS_INTERVENCAO, MEDIDAS, STATUS_BALANCO, DECISOES_BALANCO, PRAZO_BALANCO_MES_DIA,
  round2, ehMes, mesDe, proximoMes, mesAnterior, mesesEntre, mesNoPeriodo, mesDoDistrito, venceEm, mesVencido, dizimoInstitucional, situacaoDoMes,
  anosDoDistrito, prazoBalanco, balancoVivo, balancosAtrasados, REPASSE_DO_DISTRITO, NOME_DO_DISTRITO_DO_REPASSE, DISTRITO_DO_MES, comDecreto,
  validarAtivacao, validarDesativacao, validarIntervencao, validarEncerramento, valorEmReais, validarBalanco, validarAnalise, podeEnviarBalanco,
  textoRepasseVencido, textoBalancoAtrasado, textoBalancoAnalisado, idDe, br
};
