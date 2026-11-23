// shared/arrolamento.js (FASE 10, Membros, rodada 28 aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO: as REGRAS PURAS (nenhuma consulta ao banco aqui;
// quem lê e grava é shared/arrolamentoDb.js).
// Quem veio do sistema pago entra com a situação "Arrolamento a completar" (ARROLAMENTO), sem voto, e a pendência ARROLAMENTO (migração 185). A regra dele
// (plano da fase 10, "As regras da rodada 28"): a secretaria preenche a situação, a data e a forma de entrada (batismo, carta...); o cargo só se tiver; ao
// completar, a pessoa ganha o voto. E a da aprovação (23/11): "A área e a Geral também podem completar e editar os dados do membro ... se a congregação não
// faz o que tem de fazer, a área faz, e o serviço não para." Cada uma só no seu escopo (shared/escopoRotas.js). A ficha que veio sem congregação fica com a
// Geral, que escolhe a congregação (desenho r28). O cargo daqui é o que a pessoa JÁ TINHA no sistema pago: entra no histórico como LEGADO, sem data — o
// cadastro completo continua deixando só a Geral trocar cargo (GestaoPessoas), e a esteira de consagração continua sendo o caminho de quem sobe.
const auth = require("./auth");
const { FORMAS_ADMISSAO } = require("./edicaoFicha");

const SITUACOES = ["EM_COMUNHAO", "CONGREGADO", "SEM_COMUNHAO"];
const DATA_MINIMA = "1900-01-01";
const vazio = (v) => v === undefined || v === null || v === "";
const dataISOValida = (txt) => typeof txt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(txt) && !Number.isNaN(Date.parse(`${txt}T00:00:00Z`))
  && new Date(`${txt}T00:00:00Z`).toISOString().slice(0, 10) === txt;
const recusa = (mensagem) => ({ ok: false, mensagem });

// Confere o que a secretaria mandou. ctx: { hoje: "AAAA-MM-DD" (Brasília), nascimento: "AAAA-MM-DD" | null }. Devolve { ok, dados } ou { ok: false, mensagem }.
// dados: { situacao, formaAdmissao, dataAdmissao, cargo (sigla ou null; o catálogo é conferido no banco), congregacaoId (ou null) }.
function validarCompletar(corpo, { hoje, nascimento = null } = {}) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return recusa("Envie a situação, como e quando a pessoa entrou.");
  const situacao = corpo.situacao;
  if (typeof situacao !== "string" || !SITUACOES.includes(situacao)) return recusa("Escolha a situação: em comunhão, congregado ou sem comunhão.");
  const congregado = situacao === "CONGREGADO";

  let cargo = null;
  if (!vazio(corpo.cargoMinisterial) && corpo.cargoMinisterial !== "MEMBRO") {
    if (typeof corpo.cargoMinisterial !== "string" || !/^[A-Z_]{2,30}$/.test(corpo.cargoMinisterial)) return recusa("Escolha o cargo da lista (ou nenhum).");
    cargo = corpo.cargoMinisterial;
  }

  let formaAdmissao = null, dataAdmissao = null;
  if (congregado) {
    if (!vazio(corpo.formaAdmissao) || !vazio(corpo.dataAdmissao)) return recusa("O congregado ainda não é membro: fica sem a forma e a data de entrada.");
    if (cargo) return recusa("O congregado ainda não é membro: não tem cargo ministerial.");
  } else {
    if (typeof corpo.formaAdmissao !== "string" || !FORMAS_ADMISSAO.includes(corpo.formaAdmissao)) return recusa("Escolha como a pessoa entrou: batismo nas águas, carta de mudança, reconciliação ou aclamação.");
    formaAdmissao = corpo.formaAdmissao;
    if (!dataISOValida(corpo.dataAdmissao) || corpo.dataAdmissao < DATA_MINIMA) return recusa("Informe quando a pessoa entrou (dia, mês e ano).");
    dataAdmissao = corpo.dataAdmissao;
    if (hoje && dataAdmissao > hoje) return recusa("A data de entrada não pode ser depois de hoje.");
    if (nascimento && dataAdmissao < nascimento) return recusa("A data de entrada não pode ser antes do nascimento.");
  }

  let congregacaoId = null;
  if (!vazio(corpo.congregacaoId)) {
    congregacaoId = auth.idDeRota(corpo.congregacaoId);
    if (!congregacaoId) return recusa("Escolha a congregação da lista.");
  }
  return { ok: true, dados: { situacao, formaAdmissao, dataAdmissao, cargo, congregacaoId } };
}

// Quem completa ESTA ficha (o escopo já foi conferido antes: fora dele a resposta é a de "não encontrada"). ctx: { geral, propria, temCongregacao, congregacaoPedida }.
function podeCompletar({ geral, propria, temCongregacao, congregacaoPedida }) {
  if (propria) return { pode: false, status: 403, mensagem: "Ninguém completa a própria ficha: peça a outra pessoa da Secretaria." };
  if (!temCongregacao) {
    if (!geral) return { pode: false, status: 403, mensagem: "A ficha que veio sem congregação, só a Secretaria Geral completa, escolhendo a congregação." };
    if (!congregacaoPedida) return { pode: false, status: 400, mensagem: "Escolha a congregação desta pessoa." };
    return { pode: true };
  }
  if (congregacaoPedida) return { pode: false, status: 400, mensagem: "Esta ficha já tem congregação: a congregação muda pela transferência." };
  return { pode: true };
}

// O recado da tela depois de completar.
function recadoFeito(situacao, nome) {
  if (situacao === "EM_COMUNHAO") return `Arrolamento completado: ${nome} está em comunhão e ganhou o voto.`;
  if (situacao === "CONGREGADO") return `Arrolamento completado: ${nome} ficou como congregado (ainda não membro, sem voto).`;
  return `Arrolamento completado: ${nome} ficou sem comunhão (sem voto).`;
}

module.exports = { SITUACOES, validarCompletar, podeCompletar, recadoFeito };
