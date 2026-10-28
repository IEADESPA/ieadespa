// shared/credencial.js (v8.4) — Credencial digital com QR Code (Regimento Art. 76; Art. 69 §3º; Art. 77; Art. 95 §2º, IV, a). Regra pura: nenhuma consulta ao banco
// aqui (quem busca e grava é shared/credencialDb.js). Desenho em docs/plano/fase-8-ministerial-afm.md.
//
// A credencial não tem validade impressa (Art. 76 §1º): a situação é calculada na hora da leitura, a partir do cadastro e da Academia. A página pública mostra o mínimo
// para conferir quem está na frente — nunca o motivo de uma inatividade, a matrícula, a foto ou um contato.
const { calcularCapacidadeEleitoral } = require("./estatuto");
const { CARGOS_OFICIAIS } = require("./afm");
const { ROTULO_CARGO } = require("./escada");

// O que a pessoa precisa para receber uma credencial: membro ativo em plena comunhão (o congregado ainda não é membro; o desligado e o excluído já não são).
function podeReceber(pessoa) {
  if (!pessoa) return { pode: false, mensagem: "Matrícula não encontrada." };
  if (pessoa.status !== "ATIVO") return { pode: false, mensagem: "Só membro ativo recebe a credencial." };
  if (pessoa.situacaoMembro === "CONGREGADO") return { pode: false, mensagem: "Congregado ainda não é membro: a credencial vem com a recepção." };
  if (!calcularCapacidadeEleitoral({ situacaoMembro: pessoa.situacaoMembro, status: pessoa.status }).emComunhao) {
    return { pode: false, mensagem: "Só membro em plena comunhão recebe a credencial." };
  }
  return { pode: true, mensagem: null };
}

const ehObreiro = (cargo) => CARGOS_OFICIAIS.includes(cargo);
const categoria = (cargo) => (ehObreiro(cargo) ? `Obreiro(a) — ${ROTULO_CARGO[cargo] || cargo}` : "Membro");

// A situação que o QR mostra. `credencial`: { situacao } (VALIDA | SUBSTITUIDA | CANCELADA) ou null. `pessoa`: { nome, congregacao, status, situacaoMembro, cargo,
// statusMatricula, sobDisciplina }. Devolve { situacao, titulo, ... } só com o que pode ser público.
function situacaoPublica(credencial, pessoa) {
  if (!credencial || !pessoa) return { situacao: "NAO_ENCONTRADA" };
  if (credencial.situacao === "SUBSTITUIDA") return { situacao: "SUBSTITUIDA", nome: pessoa.nome };
  if (credencial.situacao === "CANCELADA") return { situacao: "CANCELADA", nome: pessoa.nome };
  const ativa = pessoa.status === "ATIVO" && calcularCapacidadeEleitoral({ situacaoMembro: pessoa.situacaoMembro, status: pessoa.status }).emComunhao;
  const r = { situacao: ativa ? "ATIVA" : "INATIVA", nome: pessoa.nome, categoria: categoria(pessoa.cargo), congregacao: pessoa.congregacao || null, via: credencial.via };
  if (ehObreiro(pessoa.cargo)) {
    // Art. 69 §3º: a matrícula da AFM inativa suspende a credencial do obreiro ("Obreiro Inativo"); o afastamento disciplinar também (Art. 95 §2º, II, b; Art. 77).
    r.funcao = ativa && pessoa.statusMatricula !== "INATIVA" && !pessoa.sobDisciplina ? "HABILITADO" : "INATIVO";
  }
  return r;
}

// O motivo que a Secretaria escreve ao emitir uma nova via ou cancelar.
function validarMotivo(texto) {
  if (texto != null && typeof texto !== "string") return { valido: false, mensagem: "O motivo é um texto." };
  const t = String(texto || "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 5) return { valido: false, mensagem: "Informe o motivo (pelo menos 5 caracteres)." };
  if (t.length > 300) return { valido: false, mensagem: "O motivo tem no máximo 300 caracteres." };
  return { valido: true, texto: t };
}

module.exports = { podeReceber, ehObreiro, categoria, situacaoPublica, validarMotivo };
