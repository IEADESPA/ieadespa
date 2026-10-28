// RequisitosEscada (v8.2 — Escada ministerial)
// GET /api/escada/requisitos?membroId=&assunto=&modalidade=  -> { sucesso, alvo, alvoRotulo, requisitos:{ itens[], bloqueado, nivelamento, mensagemBloqueio } }
// O botão "Conferir requisitos" da aba Consagrações: a mesma conferência que CriarConsagracao faz ao protocolar (shared/escada.js), sem gravar nada. Permissão
// "consagracoes", pessoa dentro do escopo de quem pergunta (fora dele, a mesma resposta de "não encontrada"). Regimento Art. 66 §§3º–5º, 67, 71 a 74. Disciplina e carta
// de mudança só aparecem para quem tem a permissão "disciplina" sobre a pessoa; para os outros, o item é o mesmo aviso para todos (escadaDb.veDisciplinaDe).
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const escada = require("../shared/escada");
const escadaDb = require("../shared/escadaDb");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;
  const q = req.query || {};
  const membroId = auth.idDeRota(q.membroId);
  const assunto = typeof q.assunto === "string" ? q.assunto : "";
  const modalidade = q.modalidade == null || q.modalidade === "" ? "INDICACAO" : q.modalidade;
  if (!membroId || !assunto || assunto.length > 100) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula e o tipo de consagração." } };
    return;
  }
  if (typeof modalidade !== "string" || !Object.prototype.hasOwnProperty.call(escada.MODALIDADES, modalidade)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Modalidade inválida." } };
    return;
  }
  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroId);
  if (!pessoa) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const conferencia = await escadaDb.avaliar(pool, { membroId: pessoa.membroId, assunto, modalidade, veDisciplina: escadaDb.veDisciplinaDe(usuario, pessoa) });
  if (!conferencia.alvo) {
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, alvo: null, mensagem: "Este tipo de consagração não muda o cargo: a escada não se aplica." } };
    return;
  }
  context.res = {
    status: 200,
    headers: { "Cache-Control": "no-store" },
    body: { sucesso: true, alvo: conferencia.alvo, alvoRotulo: escada.ROTULO_CARGO[conferencia.alvo], requisitos: conferencia.avaliacao }
  };
};
