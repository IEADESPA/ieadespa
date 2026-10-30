// shared/credencial.js (v8.4) — Credencial digital com QR Code (Regimento Art. 76; Art. 69 §3º; Art. 77; Art. 95 §2º, IV, a). Regra pura: nenhuma consulta ao banco
// aqui (quem busca e grava é shared/credencialDb.js). Desenho em docs/plano/fase-8-ministerial-afm.md.
//
// A credencial não tem validade impressa (Art. 76 §1º): a situação é calculada na hora da leitura, a partir do cadastro e da Academia. A página pública mostra o mínimo
// para conferir quem está na frente — nunca o motivo de uma inatividade, a matrícula, a foto ou um contato.
const { calcularCapacidadeEleitoral } = require("./estatuto");
const { CARGOS_OFICIAIS, licencaLiturgica } = require("./afm");
const { ROTULO_CARGO } = require("./escada");

// Membro de verdade: ativo ou de licença (a licença — inclusive a de candidatura política, Regimento Art. 157 — não tira a membresia: "senta-se como membro comum"),
// em plena comunhão. A disciplina não muda o cadastro (Status/Situação): por isso a exclusão em vigor e a Disciplina Rigorosa em vigor (Art. 95 §2º, III e IV — o
// "afastamento total da comunhão") vêm do processo disciplinar, lidos no banco (shared/credencialDb.js) — revisão independente, 28/10/2026.
const STATUS_DE_MEMBRO = new Set(["ATIVO", "LICENÇA", "LICENCA_CANDIDATURA"]);
function membroEmComunhao(p) {
  if (!p || !STATUS_DE_MEMBRO.has(p.status) || p.excluido || p.foraDaComunhao) return false;
  return calcularCapacidadeEleitoral({ situacaoMembro: p.situacaoMembro, status: "ATIVO" }).emComunhao;
}

// O que a pessoa precisa para receber uma credencial: membro em plena comunhão (o congregado ainda não é membro; o desligado e o excluído já não são).
function podeReceber(pessoa) {
  if (!pessoa) return { pode: false, mensagem: "Matrícula não encontrada." };
  if (pessoa.excluido) return { pode: false, mensagem: "Pessoa excluída por decisão disciplinar: a credencial é recolhida (Regimento, Art. 95 §2º, IV, a)." };
  if (!STATUS_DE_MEMBRO.has(pessoa.status)) return { pode: false, mensagem: "Só membro ativo recebe a credencial." };
  if (pessoa.situacaoMembro === "CONGREGADO") return { pode: false, mensagem: "Congregado ainda não é membro: a credencial vem com a recepção." };
  if (!membroEmComunhao(pessoa)) return { pode: false, mensagem: "Só membro em plena comunhão recebe a credencial." };
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
  const ativa = membroEmComunhao(pessoa);
  const r = { situacao: ativa ? "ATIVA" : "INATIVA", nome: pessoa.nome, categoria: categoria(pessoa.cargo), congregacao: pessoa.congregacao || null, via: credencial.via };
  if (ehObreiro(pessoa.cargo)) {
    // Art. 69 §3º: a matrícula da AFM inativa suspende a credencial do obreiro ("Obreiro Inativo"); o afastamento disciplinar também (Art. 95 §2º, II, b), e a
    // Carência Administrativa depois da suspensão, até a Prova de Reintegração (Art. 77 — decisão de 29/10/2026);
    // e a licença afasta das funções enquanto dura.
    // Trava 8-A: a mesma regra da licença para oficiar (shared/afm.js) — o QR, a turma de batismo e a Comissão de Unção dizem a mesma coisa da mesma pessoa.
    const habilitado = ativa && licencaLiturgica({ cargo: pessoa.cargo, statusMatricula: pessoa.statusMatricula, status: pessoa.status, situacaoMembro: pessoa.situacaoMembro,
      excluido: pessoa.excluido, foraDaComunhao: pessoa.foraDaComunhao, afastado: pessoa.sobDisciplina, educacao: pessoa.educacao }).podeOficiar;
    // v8.6 — reprovado no exame bienal: continua oficiando, mas "sob observação" até a repescagem (Regimento Art. 70 §3º, I)
    r.funcao = !habilitado ? "INATIVO" : pessoa.educacao && pessoa.educacao.sobObservacao ? "SOB_OBSERVACAO" : "HABILITADO";
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

module.exports = { STATUS_DE_MEMBRO, membroEmComunhao, podeReceber, ehObreiro, categoria, situacaoPublica, validarMotivo };
