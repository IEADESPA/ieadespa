// ElegibilidadeCEI (v3.1)
// GET /api/elegibilidade-cei/{membroId} — checagem INFORMATIVA dos requisitos
// do Art. 88 §2º pra ocupar o CEI/Corte Suprema Eclesiástica. Nunca bloqueia
// sozinha a criação do Assento (ver shared/estatuto.js::avaliarElegibilidadeCEI)
// — quem decide a indicação continua sendo o Pastor Presidente (Art. 89 §1º).
//
// SIGILO + ESCOPO: a resposta diz se a pessoa teve sanção ou exclusão disciplinar nos últimos 10 anos (Art. 88 §2º, III) — dado do processo disciplinar, que o resto do
// sistema só mostra a quem tem "disciplina". Por isso, além de "pessoas", exige "cei" ou "disciplina", e a pessoa precisa estar no escopo de quem pergunta; fora do escopo
// (ou matrícula inexistente/malformada) vale a mesma resposta de "Matrícula não encontrada".
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { dadosElegibilidadeCEI } = require("../shared/cei");
const estatuto = require("../shared/estatuto");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  if (!auth.exigirAlgumaPermissao(req, context, ["cei", "disciplina"])) return;

  const membroIdBruto = context.bindingData.membroId;
  if (membroIdBruto === undefined || membroIdBruto === null || membroIdBruto === "") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/elegibilidade-cei/{membroId}" } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  const dados = await dadosElegibilidadeCEI(pool, sql, pessoa.membroId);
  const avaliacao = estatuto.avaliarElegibilidadeCEI(dados);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({ sucesso: true }, avaliacao) };
};
