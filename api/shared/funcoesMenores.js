// shared/funcoesMenores.js (Trava 7-C, decisão de 23/10/2026 — aptidão para funções com criança FORA das escalas: departamentos e liderança; eventos ficaram fora)
//
// A regra pura. A v7.7 confere a aptidão (antecedentes, treinamento, ficha, política, 6 meses, sem pendência reservada) em escalas, turmas da EBD e salas; quem lidera um
// DEPARTAMENTO de crianças (a União de Crianças, por exemplo) ou ocupa um CARGO de liderança com crianças não passava por nenhum portão. Agora:
//   - departamentos (Departamentos.ContatoComMenores) e cargos (Papeis.ContatoComMenores) ganham a marca "tem contato com crianças e adolescentes" (nível geral, com a
//     confirmação reforçada);
//   - quem ocupa um deles e NÃO está apto aparece para a Diretoria e para a Proteção de crianças do nível geral, num painel e num aviso (um por pessoa e função, que se repete
//     a cada mês enquanto durar). Ninguém sai do cargo sozinho: a decisão é humana;
//   - ao nomear alguém sem aptidão, a tela avisa e não impede.
// PRIVACIDADE: o aviso e a nomeação dizem só "não está apto para função com menores" — nunca o motivo (a pendência reservada à Diretoria — afastamento cautelar, comunicação
// em análise, cadastro nacional, restrição, fora de comunhão — só a Diretoria lê, no painel, como já é na v7.7).
"use strict";
const crypto = require("crypto");

const TIPOS = { DEPARTAMENTO: "Departamento", PAPEL: "Cargo" };
const NAO_APTO = "não está apto para função com menores";

function rotuloFuncao(f) { return `${TIPOS[f.tipo] || f.tipo} ${f.nome}`; }

// Uma referência por pessoa, função e mês: o aviso sai uma vez por pessoa e função e se repete no mês seguinte enquanto a situação durar.
function referenciaDoAviso(mes, membroId, tipo, funcaoId) {
  const base = `MENORES_FUNCAO|${mes}|${Number(membroId)}|${tipo}|${Number(funcaoId)}`;
  return crypto.createHash("sha256").update(base).digest().readUInt32BE(0) & 0x7fffffff || 1;
}

// O texto do aviso (sem o motivo, sem dado de criança).
function textoDoAviso({ nome, funcao, congregacaoNome }) {
  const onde = congregacaoNome ? `, da congregação ${congregacaoNome},` : "";
  return `${nome}${onde} ocupa ${rotuloFuncao(funcao)}, marcado com contato com crianças e adolescentes, e ${NAO_APTO}. A pessoa continua no cargo: a decisão é da Diretoria. Veja em Habilitação de Voluntários → Ministério com Menores → Funções com menores.`.slice(0, 1000);
}

// O aviso da nomeação (para quem nomeia, que pode não ser da Diretoria): só o fato, nunca o motivo.
function textoDaNomeacao(funcoes) {
  const lista = (funcoes || []).map(rotuloFuncao).join(", ");
  return `⚠️ Atenção: ${lista} tem contato com crianças e adolescentes, e esta pessoa ${NAO_APTO} (habilitação, certidões, treinamento ou pendência a tratar com a Diretoria). A nomeação foi registrada — o sistema avisa, não impede. A Diretoria e a Proteção de crianças do nível geral recebem o aviso.`;
}

// As linhas (pessoa × função) agrupadas por pessoa, sem repetir a função.
function agruparPorPessoa(linhas) {
  const mapa = new Map();
  for (const l of linhas || []) {
    const id = Number(l.membroId);
    if (!mapa.has(id)) mapa.set(id, { membroId: id, nome: l.nome, congregacaoNome: l.congregacaoNome || null, funcoes: [] });
    const p = mapa.get(id);
    if (!p.funcoes.some((f) => f.tipo === l.tipo && Number(f.id) === Number(l.funcaoId))) p.funcoes.push({ tipo: l.tipo, id: Number(l.funcaoId), nome: l.funcaoNome });
  }
  return [...mapa.values()];
}

// O pedido de marcar: { tipo: DEPARTAMENTO|PAPEL, id: inteiro positivo, contatoComMenores: true|false }. Devolve { tipo, id, contatoComMenores } ou { erro }.
function validarMarca(c) {
  const corpo = c && typeof c === "object" && !Array.isArray(c) ? c : {};
  if (!Object.prototype.hasOwnProperty.call(TIPOS, corpo.tipo)) return { erro: "Informe o tipo: DEPARTAMENTO ou PAPEL." };
  const id = typeof corpo.id === "number" || typeof corpo.id === "string" ? Number(corpo.id) : NaN;
  if (!Number.isInteger(id) || id < 1 || id > 2147483647 || !/^\d+$/.test(String(corpo.id))) return { erro: "id inválido." };
  if (typeof corpo.contatoComMenores !== "boolean") return { erro: "Informe contatoComMenores (true ou false)." };
  return { tipo: corpo.tipo, id, contatoComMenores: corpo.contatoComMenores };
}

module.exports = { TIPOS, NAO_APTO, rotuloFuncao, referenciaDoAviso, textoDoAviso, textoDaNomeacao, agruparPorPessoa, validarMarca };
