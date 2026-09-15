// shared/apresentacaoCriancas.js (vB.12 — Apresentação de Crianças, Regimento Art. 82)
// Aptidão CALCULADA na leitura, nunca marcação manual (mesmo princípio de
// shared/batismo.js e do Art. 7º §1º usado em todo o resto do sistema).
const estatuto = require("./estatuto");
const { membrosSobDisciplina } = require("./disciplina");
const { possuiCasamentoCivilRegistrado } = require("./batismo");

const IDADE_PREFERENCIAL_DIAS = 90; // Art. 82 §3º, I — preferência, não bloqueia
const IDADE_MAXIMA_ANOS = 1; // Art. 82 §3º, II — vedação a partir de 1 ano completo
const MODALIDADES = ["SOLENE", "RESERVADA"]; // Art. 82 §2º, I

function modalidadeValida(modalidade) {
  return MODALIDADES.includes(String(modalidade || "").toUpperCase());
}

// Ato reservado nunca gera certificado (Art. 82 §2º, II "b") — a regra fica
// no sistema, não na lembrança de quem emite.
function geraCertificado(modalidade) {
  return String(modalidade || "").toUpperCase() === "SOLENE";
}

// pais: { membroIdPai, membroIdMae }, cada um { membroId, estadoCivil } ou null
async function calcularImpedimentoPais(pool, pai, mae) {
  const disciplinados = await membrosSobDisciplina(pool);
  const detalhes = [];

  for (const [rotulo, pessoa] of [["pai", pai], ["mãe", mae]]) {
    if (!pessoa) continue;
    if (disciplinados.has(pessoa.membroId)) {
      detalhes.push(`${rotulo} sob disciplina em curso`);
      continue;
    }
    if (pessoa.estadoCivil === "UNIAO_ESTAVEL") {
      const temCertidao = await possuiCasamentoCivilRegistrado(pool, pessoa.membroId);
      if (!temCertidao) detalhes.push(`${rotulo} em união estável sem certidão de casamento civil registrada`);
    }
  }

  return { ok: detalhes.length === 0, detalhe: detalhes.length === 0 ? "Sem impedimentos" : detalhes.join("; ") };
}

// candidato: { dataNascimento, pai: {membroId, estadoCivil}|null, mae: {membroId, estadoCivil}|null }
async function calcularAptidaoApresentacao(pool, candidato, hoje) {
  const idadeAnos = estatuto.idadeEm(candidato.dataNascimento, hoje);
  const idadeDias = estatuto.diasDesde(candidato.dataNascimento, hoje);

  const idadeVedadaOk = idadeAnos !== null && idadeAnos < IDADE_MAXIMA_ANOS;
  const impedimentoPais = await calcularImpedimentoPais(pool, candidato.pai, candidato.mae);

  const avisoForaJanelaPreferencial =
    idadeDias !== null && idadeDias > IDADE_PREFERENCIAL_DIAS && idadeVedadaOk
      ? `⚠️ Fora da janela preferencial de até ${IDADE_PREFERENCIAL_DIAS} dias de vida (${idadeDias} dias) — Art. 82 §3º, I. Não impede a apresentação, só é preferencial.`
      : null;

  return {
    apto: idadeVedadaOk && impedimentoPais.ok,
    itens: {
      idadeVedada: {
        ok: idadeVedadaOk,
        detalhe: idadeAnos === null
          ? "Data de nascimento ausente"
          : (idadeVedadaOk ? `${idadeDias ?? 0} dias de vida` : `Vedado: já completou ${idadeAnos} ano(s) de vida (Art. 82 §3º, II)`)
      },
      impedimentoPais
    },
    avisoForaJanelaPreferencial
  };
}

module.exports = {
  IDADE_PREFERENCIAL_DIAS, IDADE_MAXIMA_ANOS, MODALIDADES,
  modalidadeValida, geraCertificado,
  calcularImpedimentoPais, calcularAptidaoApresentacao
};
