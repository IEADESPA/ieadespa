// mutacoes.js — desfaz, uma a uma, as proteções da tela da v7.15 (escape, prazo, confirmação, troca de login, resposta atrasada, a resposta anterior, os números inteiros, o
// filtro dos telefones, a faixa que some na saída...). Cada mutação TEM de ser acusada pelo roteiro; âncora que não casa mais = "INAPLICÁVEL" (também reprovada).
// Uso: node mutacoes.js [filtro]
"use strict";
const { rodar } = require("./roteiro");
const { lerApp } = require("./ambiente");
const M = "modulos/crise-seguranca.js";
const MUTACOES = [
  ["faixa: o nome do porta-voz sem escape", M, "porta-voz único: ${escaparHtmlEbd(pv.nome)}</strong>", "porta-voz único: ${pv.nome}</strong>"],
  ["faixa: não some na saída da sessão", M, "  crsFaixa = null; crsFaixaLidaEm = 0; crsFaixaSeq++;\n  crsPintarFaixa();", "  crsFaixaLidaEm = 0; crsFaixaSeq++;"],
  ["faixa: lida também pelo PIN", M, "if (!authToken || !sessaoDeLiderancaNaTela()) { crsFaixa = null; crsPintarFaixa(); return; }", "if (!authToken) { crsFaixa = null; crsPintarFaixa(); return; }"],
  ["faixa: resposta atrasada aceita", M, "if (seq !== crsFaixaSeq || crsDono !== crsChaveDoDono()) return;", "if (false) return;"],
  ["faixa: relida a cada troca de tela", M, "if (Date.now() - crsFaixaLidaEm > CRS_FAIXA_INTERVALO_MS) crsAtualizarFaixa();", "crsAtualizarFaixa();"],
  ["abrir: sem a confirmação", M, "  if (!(await confirmarAcao(\"Abrir o regime de crise? Toda", "  if (false && !(await confirmarAcao(\"Abrir o regime de crise? Toda"],
  ["428: sem repetir depois da confirmação", M, "if (r.res.status === 428) { const ok = await confirmarFatorAgora(); if (ok) r = await crsTentar(url, opcoes, prazoMs); }", ""],
  ["resposta: sem a resposta anterior", M, "  if (anterior) dados.substituiRespostaId = anterior;", ""],
  ["manifestação: a correção não aponta a original", M, "  if (crsCorrigeManif) dados.corrigeManifestacaoId = crsCorrigeManif;", ""],
  ["manifestação: o link sem urlSegura", M, "const link = m.link ? urlSegura(m.link) : \"\";", "const link = m.link ? String(m.link) : \"\";"],
  ["simulado: números como texto", M, "const inteiro = (campo) => { const t = crsValor(campo); return /^[0-9]+$/.test(t) ? Number(t) : t; };", "const inteiro = (campo) => crsValor(campo);"],
  ["vistoria: pendência em todo item", M, "...(resultado === \"PENDENTE\" ? { pendencia: crsValor(`crsVisPend_${i.codigo}`) } : {})", "pendencia: crsValor(`crsVisPend_${i.codigo}`)"],
  ["telefones: sem o filtro de 3 dígitos", M, ".filter(c => CRS_TELEFONE.test(String(c.numero))).map(c => `<a class=\"crs-tel\"", ".map(c => `<a class=\"crs-tel\""],
  ["seção: resposta atrasada pinta por cima", M, "  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== \"crise\") return;\n  if (data.sucesso === false || !Array.isArray(data.crises))", "  if (data.sucesso === false || !Array.isArray(data.crises))"],
  ["aba: sair dela não limpa", M, "  if (aba !== \"crise\") crsFecharAba();", ""],
  ["pílulas: a da crise para todos", M, "crsMostrarPilulas({ crise: cat.papeis.crise, manifestacoes", "crsMostrarPilulas({ crise: true, manifestacoes"],
  ["prazo dos atos: 25 s em vez de 40 s", M, "const CRS_TEMPO_LIMITE_ATO_MS = 40000;", "const CRS_TEMPO_LIMITE_ATO_MS = 25000;"],
  ["prazo: sem prazo no pedido", M, "const limite = controle ? setTimeout(() => controle.abort(), prazoMs || CRS_TEMPO_LIMITE_MS) : null;", "const limite = null;"],
  ["Meus Dados: a função sem escape", M, "<strong>Equipe de segurança:</strong> ${escaparHtmlEbd(e.funcao)}", "<strong>Equipe de segurança:</strong> ${e.funcao}"],
  ["equipe: o texto da pendência sem escape", M, "${i.pendencia ? ` — ${escaparHtmlEbd(i.pendencia)}` : \"\"}", "${i.pendencia ? ` — ${i.pendencia}` : \"\"}"],
  ["navegação: a aba fechada para quem não tem permissão", "script.js", "  if (nome === \"crise\") return sessaoDeLiderancaNaTela();", ""]
];

(async () => {
  const filtro = process.argv[2] || "";
  let acusadas = 0, total = 0;
  for (const [nome, arquivo, de, para] of MUTACOES) {
    if (filtro && !nome.includes(filtro)) continue;
    total++;
    // a âncora tem de casar exatamente uma vez ANTES de rodar (senão a exceção do ambiente seria contada como "acusada")
    const n = lerApp(arquivo).split(de).length - 1;
    if (n !== 1) { console.log(`  INAPLICÁVEL  ${nome} (${n} ocorrências)`); continue; }
    let r;
    try { r = await rodar({ mutar: { [arquivo]: [[de, para]] } }); }
    catch (e) { console.log(`  INAPLICÁVEL  ${nome}: ${String(e.message).slice(0, 120)}`); continue; }
    const pega = r.falhas.length > 0;
    if (pega) acusadas++;
    console.log(`  ${pega ? "acusada " : "ESCAPOU "} ${nome}${pega ? ` (${r.falhas.length} falha(s); ex.: ${r.falhas[0].slice(0, 110)})` : ""}`);
  }
  console.log(`${acusadas}/${total} mutações acusadas`);
  process.exit(acusadas === total ? 0 : 1);
})();
