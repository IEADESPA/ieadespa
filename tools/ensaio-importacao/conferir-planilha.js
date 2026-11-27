// tools/ensaio-importacao/conferir-planilha.js — confere a PLANILHA DE VERDADE do sistema pago no próprio computador, sem banco e sem rede (missão C,
// 26/11/2026). Lê o arquivo como a tela lê (UTF-8 ou, se não for, Windows-1252), passa pelas mesmas regras da prévia (shared/importacaoMembros.js) e mostra
// só NÚMEROS e CÓDIGOS: quantas linhas, quantas ficam de fora e por quê, quantas entram com a próxima matrícula, os avisos de cada campo e as congregações
// que não batem com a lista. Nenhum nome, CPF, celular ou e-mail aparece na tela nem vai para arquivo: a planilha real não sai do computador. O nome da
// congregação que não bateu é texto do arquivo: sai sem o número comprido e sem o e-mail (regras.semDadoPessoal; revisão permanente de 27/11, I1).
//
// O que ela NÃO vê (precisa do banco): a matrícula que já é de uma ficha do sistema, o CPF e o nome e nascimento iguais aos de uma ficha que já existe.
//
// Uso: node conferir-planilha.js <planilha.csv> <congregacoes.txt>
// congregacoes.txt: um nome por linha, os nomes das congregações como estão no sistema (sem o "IEADESPA - ").
"use strict";
const fs = require("fs");
const path = require("path");
const regras = require(path.resolve(__dirname, "..", "..", "api", "shared", "importacaoMembros.js"));

// como a tela (front/src/membros/importar/importar.ts): UTF-8; se os bytes não forem UTF-8 válido, Windows-1252
function lerTexto(arquivo) {
  const bytes = fs.readFileSync(arquivo);
  try { return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), codificacao: "UTF-8" }; } catch { return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "Windows-1252" }; }
}

function conferir(texto, nomesCongregacoes, hojeISO) {
  const congs = nomesCongregacoes.map((nome, i) => ({ congregacaoId: i + 1, nome, ativa: true }));
  const prep = regras.prepararArquivo(texto, { congregacoes: regras.mapaDeCongregacoes(congs), hojeISO });
  if (prep.erro) return { erro: prep.erro };
  regras.classificar(prep.linhas, {});
  const resumo = regras.resumir(prep, { maiorMatriculaSistema: 0 });
  const porCodigo = {};
  const linhasDoCodigo = {};
  for (const l of prep.linhas) {
    for (const c of [...l.problemas, ...l.avisos]) {
      porCodigo[c] = (porCodigo[c] || 0) + 1;
      (linhasDoCodigo[c] = linhasDoCodigo[c] || []).length < 15 && linhasDoCodigo[c].push(l.linha);
    }
  }
  // as congregações do arquivo que não existem na lista (o nome escrito diferente): só o nome da congregação, nunca o da pessoa. A linha com colunas a mais
  // fica fora desta lista: o ';' solto empurra as células, e a "congregação" dela seria um pedaço do nome da pessoa (o ensaio de 26/11 mostrou)
  const semPar = new Map();
  for (const l of prep.linhas) {
    if (!l.problemas.includes("CONGREGACAO_NAO_ENCONTRADA") || l.problemas.includes("COLUNAS_A_MAIS")) continue;
    const k = regras.semDadoPessoal(String(l.dados.igrejaArquivo || "").trim());
    semPar.set(k, (semPar.get(k) || 0) + 1);
  }
  return {
    total: resumo.total, novas: resumo.novas, problemas: resumo.problemas, numeroNovo: resumo.numeroNovo, possivelRepetida: resumo.possivelRepetida,
    colunas: resumo.colunas, avisosGerais: resumo.avisosGerais, porCodigo, linhasDoCodigo, congregacoesSemPar: [...semPar.entries()].sort((a, b) => b[1] - a[1])
  };
}

// as linhas da tela: só números, códigos e os nomes das congregações sem par (já sem o número comprido e o e-mail)
function linhasDaTela({ arquivo, codificacao, bytes }, r) {
  const linhas = [`arquivo: ${path.basename(arquivo)} (${codificacao}${bytes == null ? "" : `, ${bytes.toLocaleString("pt-BR")} bytes`})`];
  if (r.erro) return [...linhas, `A PRÉVIA RECUSARIA O ARQUIVO: ${r.erro}`];
  linhas.push(`pessoas: ${r.total} · entram: ${r.novas} · ficam de fora: ${r.problemas} · com a próxima matrícula: ${r.numeroNovo} · possíveis repetidas: ${r.possivelRepetida}`);
  for (const a of r.avisosGerais || []) linhas.push(`aviso geral: ${typeof a === "string" ? a : JSON.stringify(a)}`);
  linhas.push("por motivo (linhas do arquivo, até 15):");
  for (const [c, n] of Object.entries(r.porCodigo).sort((a, b) => b[1] - a[1])) linhas.push(`  ${String(n).padStart(6)}  ${c} — ${regras.PROBLEMAS[c] || regras.AVISOS[c] || ""} [${r.linhasDoCodigo[c].join(", ")}]`);
  if (r.congregacoesSemPar.length) {
    linhas.push("congregações do arquivo que não estão na lista (corrigir o nome no sistema ou na planilha):");
    for (const [nome, n] of r.congregacoesSemPar) linhas.push(`  ${String(n).padStart(6)}  ${nome}`);
  }
  return linhas;
}

if (require.main === module) {
  const [arquivo, listaCongs] = process.argv.slice(2);
  if (!arquivo || !listaCongs) { console.log("uso: node conferir-planilha.js <planilha.csv> <congregacoes.txt>"); process.exit(2); }
  const { texto, codificacao } = lerTexto(arquivo);
  const nomes = fs.readFileSync(listaCongs, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const r = conferir(texto, nomes, hoje);
  for (const l of linhasDaTela({ arquivo, codificacao, bytes: Buffer.byteLength(texto, "utf8") }, r)) console.log(l);
  if (r.erro) process.exit(1);
}

module.exports = { conferir, lerTexto, linhasDaTela };
