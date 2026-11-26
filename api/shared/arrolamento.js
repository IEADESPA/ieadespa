// shared/arrolamento.js (FASE 10, Membros, rodada 28 aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO: as REGRAS PURAS (nenhuma consulta ao banco aqui;
// quem lê e grava é shared/arrolamentoDb.js).
// Quem veio do sistema pago entra com a situação "Arrolamento a completar" (ARROLAMENTO), sem voto, e a pendência ARROLAMENTO (migração 185). A regra dele
// (plano da fase 10, "As regras da rodada 28"): a secretaria preenche a situação, a data e a forma de entrada (batismo, carta...); ao completar, a pessoa sai
// do grupo e, em comunhão, vota com 18 anos e 90 dias de entrada (o congregado continua fora de tudo, decisão dele de 25/11). E a da aprovação (23/11): "A área e a Geral também podem completar e editar os dados do membro ... se a congregação não
// faz o que tem de fazer, a área faz, e o serviço não para." Cada uma só no seu escopo (shared/escopoRotas.js). Toda ficha do arrolamento tem congregação
// (G3, decisão dele de 24/11/2026: sem congregação não há importação); a congregação não muda por aqui (é a transferência). A FUNÇÃO ECLESIÁSTICA (auxiliar, diácono, presbítero, evangelista, missionário, pastor: o
// MembroReferencia.CargoMinisterial) não se grava aqui, em nenhum nível — regra dele de 24/11/2026: só a Câmara de liderança e a academia mudam a função; a
// secretaria local e a da área nunca. A tela mostra a que a ficha já tem, só para ler. Os cargos administrativos (dirigente, tesoureiro, secretário) não
// passam pelo arrolamento (moram na liderança de cada nível).
const { FORMAS_ADMISSAO } = require("./edicaoFicha");

const SITUACOES = ["EM_COMUNHAO", "CONGREGADO", "SEM_COMUNHAO"];
const DATA_MINIMA = "1900-01-01";
const vazio = (v) => v === undefined || v === null || v === "";
const dataISOValida = (txt) => typeof txt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(txt) && !Number.isNaN(Date.parse(`${txt}T00:00:00Z`))
  && new Date(`${txt}T00:00:00Z`).toISOString().slice(0, 10) === txt;
const recusa = (mensagem) => ({ ok: false, mensagem });
const MSG_CONGREGACAO = "A congregação não muda pelo arrolamento: para mudar, use a transferência.";
// a ficha sem congregação que ficou de antes da regra G3 (a importação de hoje recusa a linha sem ela): ninguém a completa por aqui, nem a Geral
const MSG_SEM_CONGREGACAO = "Esta ficha está sem congregação: ela não se completa pelo arrolamento. Toda ficha precisa de uma congregação; avise o suporte.";
const MSG_FUNCAO = "A função eclesiástica (auxiliar, diácono, presbítero, evangelista, missionário, pastor) só a Câmara de liderança e a academia mudam: o arrolamento não grava função.";

// Confere o que a secretaria mandou. ctx: { hoje: "AAAA-MM-DD" (Brasília), nascimento: "AAAA-MM-DD" | null }. Devolve { ok, dados } ou { ok: false, mensagem }.
// dados: { situacao, formaAdmissao, dataAdmissao }.
function validarCompletar(corpo, { hoje, nascimento = null } = {}) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return recusa("Envie a situação, como e quando a pessoa entrou.");
  const situacao = corpo.situacao;
  if (typeof situacao !== "string" || !SITUACOES.includes(situacao)) return recusa("Escolha a situação: em comunhão, congregado ou sem comunhão.");
  const congregado = situacao === "CONGREGADO";

  // a função eclesiástica não se grava no arrolamento (qualquer sigla, ou lixo, no campo: recusado; vazio ou MEMBRO é "nenhuma")
  if (!vazio(corpo.cargoMinisterial) && corpo.cargoMinisterial !== "MEMBRO") return recusa(MSG_FUNCAO);
  // nem a congregação (G3): qualquer valor no campo é recusado
  if (!vazio(corpo.congregacaoId)) return recusa(MSG_CONGREGACAO);

  let formaAdmissao = null, dataAdmissao = null;
  if (congregado) {
    if (!vazio(corpo.formaAdmissao) || !vazio(corpo.dataAdmissao)) return recusa("O congregado ainda não é membro: fica sem a forma e a data de entrada.");
  } else {
    if (typeof corpo.formaAdmissao !== "string" || !FORMAS_ADMISSAO.includes(corpo.formaAdmissao)) return recusa("Escolha como a pessoa entrou: batismo nas águas, carta de mudança, reconciliação ou aclamação.");
    formaAdmissao = corpo.formaAdmissao;
    if (!dataISOValida(corpo.dataAdmissao) || corpo.dataAdmissao < DATA_MINIMA) return recusa("Informe quando a pessoa entrou (dia, mês e ano).");
    dataAdmissao = corpo.dataAdmissao;
    if (hoje && dataAdmissao > hoje) return recusa("A data de entrada não pode ser depois de hoje.");
    if (nascimento && dataAdmissao < nascimento) return recusa("A data de entrada não pode ser antes do nascimento.");
  }

  return { ok: true, dados: { situacao, formaAdmissao, dataAdmissao } };
}

// Quem completa ESTA ficha (o escopo já foi conferido antes: fora dele a resposta é a de "não encontrada"). ctx: { propria, temCongregacao }.
function podeCompletar({ propria, temCongregacao }) {
  if (propria) return { pode: false, status: 403, mensagem: "Ninguém completa a própria ficha: peça a outra pessoa da Secretaria." };
  if (!temCongregacao) return { pode: false, status: 409, mensagem: MSG_SEM_CONGREGACAO };
  return { pode: true };
}

// O recado da tela depois de completar.
function recadoFeito(situacao, nome) {
  // a Assembleia pede 18 anos e 90 dias da entrada (estatuto.js): o recado não promete o voto na hora (A4, revisão de 24/11/2026)
  if (situacao === "EM_COMUNHAO") return `Arrolamento completado: ${nome} está em comunhão (na Assembleia, vota com 18 anos e 90 dias de entrada).`;
  if (situacao === "CONGREGADO") return `Arrolamento completado: ${nome} ficou como congregado (ainda não membro, sem voto).`;
  return `Arrolamento completado: ${nome} ficou sem comunhão (sem voto).`;
}

module.exports = { SITUACOES, validarCompletar, podeCompletar, recadoFeito, MSG_SEM_CONGREGACAO };
