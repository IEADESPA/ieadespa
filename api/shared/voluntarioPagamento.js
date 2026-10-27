// shared/voluntarioPagamento.js (Trava 7-C, decisão de 23/10/2026 — regras de dinheiro do voluntário: SÓ AVISAR)
//
// A regra pura (sem banco). O Regimento manda:
//   - Art. 135 (e a Lei 9.608/98): o serviço voluntário é gratuito; pagar quem serve como voluntário pede Ordem de Serviço prévia (Art. 133 §4º);
//   - Art. 135 §2º: é vedada a "diarista disfarçada" — pagar com habitualidade a mesma pessoa (risco de vínculo de emprego);
//   - Art. 135 §3º: nada de cachê a membro nem comissão (cantina, bazar).
// Decisão do responsável (23/10/2026): o sistema AVISA o tesoureiro ao lançar a saída e registra que ele leu e confirmou; não bloqueia. Quem decide é a pessoa.
// Os fatos (o fornecedor é membro? voluntário ativo? quantos pagamentos?) vêm de shared/voluntarioPagamentoDb.js.
"use strict";

const CODIGOS = ["VOLUNTARIO_ATIVO", "HABITUALIDADE", "CACHE_COMISSAO"];
const ROTULOS = {
  VOLUNTARIO_ATIVO: "Pessoa voluntária",
  HABITUALIDADE: "Pagamento habitual à mesma pessoa",
  CACHE_COMISSAO: "Cachê ou comissão a voluntário"
};
const LIMITE_PADRAO = 3;          // pagamentos em semanas diferentes (Prazos TESOURARIA_HABITUAL_PAGAMENTOS)
const JANELA_PADRAO = 60;         // dias (Prazos TESOURARIA_HABITUAL_JANELA_DIAS)

const TEXTO_VOLUNTARIO = "Esta pessoa é voluntária: o serviço voluntário é gratuito (Lei 9.608/98; Regimento Art. 135). Se for serviço pago, precisa de Ordem de Serviço prévia (Regimento Art. 133 §4º).";
const TEXTO_CACHE = "A descrição fala em cachê ou comissão e esta pessoa é voluntária: o Regimento veda cachê a membro e comissão em cantina e bazar (Art. 135 §3º).";
function textoHabitualidade(semanas, janela) {
  return `Pagamentos a esta pessoa em ${semanas} semanas diferentes nos últimos ${janela} dias, contando este: risco de vínculo de emprego (a "diarista disfarçada", Regimento Art. 135 §2º). Confira se o serviço é mesmo eventual.`;
}

// Cachê ou comissão na descrição (sem acento, maiúscula ou minúscula). "Cache" sozinho também conta: é como a palavra chega digitada sem acento.
function temPalavraCacheComissao(descricao) {
  const s = String(descricao == null ? "" : descricao).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /(^|[^a-z])caches?([^a-z]|$)/.test(s) || /(^|[^a-z])comiss(ao|oes|ionad|ionament)/.test(s);
}

// A semana (de segunda a domingo) de uma data AAAA-MM-DD: o número de semanas desde 1970. Data inválida: null.
function semanaDe(dataIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataIso || ""));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) return null;
  const dias = Math.floor(ms / 86400000);
  return Math.floor((dias + 3) / 7);          // 01/01/1970 foi uma quinta: +3 faz a semana começar na segunda
}
// Quantas semanas diferentes há nas datas (inclusive a de hoje, que é a do pagamento sendo lançado).
function semanasDistintas(datasIso, hojeIso) {
  const s = new Set();
  for (const d of [...(datasIso || []), hojeIso]) { const w = semanaDe(d); if (w != null) s.add(w); }
  return s.size;
}

function limiteValido(v, padrao, max) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= max ? n : padrao; }

// fatos = { pessoaFisica, prebendado, membroId, voluntario, datasPagamentos[], limite, janela, descricao }
// Devolve a lista de avisos [{ codigo, texto }] (vazia = nada a avisar).
function avaliarAvisos(fatos, { hoje }) {
  const f = fatos || {};
  const avisos = [];
  if (!f.pessoaFisica) return avisos;                  // pessoa jurídica: nenhuma das três regras é sobre ela
  if (f.voluntario) avisos.push({ codigo: "VOLUNTARIO_ATIVO", texto: TEXTO_VOLUNTARIO });
  // A habitualidade vale para qualquer pessoa física, membro ou não (o vínculo de emprego não depende de ser membro); o ministro com prebenda não entra:
  // a relação dele é eclesiástica, regida pela ata de posse (Regimento Art. 134-A).
  if (!f.prebendado) {
    const limite = limiteValido(f.limite, LIMITE_PADRAO, 100);
    const janela = limiteValido(f.janela, JANELA_PADRAO, 3650);
    const semanas = semanasDistintas(f.datasPagamentos, hoje);
    if (semanas >= limite) avisos.push({ codigo: "HABITUALIDADE", texto: textoHabitualidade(semanas, janela) });
  }
  if (f.voluntario && temPalavraCacheComissao(f.descricao)) avisos.push({ codigo: "CACHE_COMISSAO", texto: TEXTO_CACHE });
  return avisos;
}

// O que o tesoureiro mandou como "li e confirmo": só os códigos conhecidos, sem repetição. Qualquer outra coisa vira lista vazia.
function codigosConfirmados(bruto) {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter((c) => typeof c === "string" && CODIGOS.includes(c)))];
}
// Todos os avisos de AGORA foram confirmados? (Se um aviso novo apareceu entre a tela e a gravação — outro pagamento lançado no meio —, pede de novo.)
function todosConfirmados(avisos, confirmados) {
  const ok = new Set(codigosConfirmados(confirmados));
  return (avisos || []).every((a) => ok.has(a.codigo));
}

// O resumo do mês para a Tesouraria geral. casos = [{ fornecedorNome, congregacoes:[], codigos:[] }]
function textoResumoMensal(casos, janela = JANELA_PADRAO) {
  const lista = [...(casos || [])].sort((a, b) => String(a.fornecedorNome).localeCompare(String(b.fornecedorNome), "pt-BR"));
  const itens = lista.slice(0, 12).map((c) => `${c.fornecedorNome} (${(c.codigos || []).map((x) => ROTULOS[x] || x).join(", ")})`);
  const mais = lista.length > 12 ? ` e mais ${lista.length - 12}` : "";
  return `${lista.length} pessoa(s) receberam pagamentos com aviso nos últimos ${janela} dias: ${itens.join("; ")}${mais}. Os avisos foram lidos e confirmados por quem lançou; confira as Ordens de Serviço e se o serviço é eventual (Regimento Arts. 133 §4º e 135). Veja em Financeiro → Saídas.`.slice(0, 1000);
}

module.exports = {
  CODIGOS, ROTULOS, LIMITE_PADRAO, JANELA_PADRAO, TEXTO_VOLUNTARIO, TEXTO_CACHE, textoHabitualidade,
  temPalavraCacheComissao, semanaDe, semanasDistintas, avaliarAvisos, codigosConfirmados, todosConfirmados, textoResumoMensal
};
