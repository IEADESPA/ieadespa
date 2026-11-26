// ConferenciaCadastro (FASE 10, v10.1b passo 4, 17/11/2026) — a CONFERÊNCIA AO DIGITAR do cadastro pelo sistema e os CASOS que vão à Secretaria Geral.
// Decisão do responsável (17/11/2026): na tela de cadastro, uma barra de avisos confere enquanto a secretaria digita nome, nascimento e CPF.
//   POST /api/cadastro/conferir           { cpf?, nome?, dataNascimento?, congregacaoId?, excluirMembroId? }   (permissão "pessoas")
//        → { cpf: { situacao: SEM_CPF | INVALIDO | LIVRE | NO_ESCOPO | FORA_DO_ESCOPO, … }, parecidos: [...], bloqueia }
//        CPF que já está numa ficha NÃO deixa concluir: no escopo de quem cadastra, devolve a ficha (matrícula e nome, para ir até ela); FORA do escopo, só
//        "já tem cadastro" e o caso vai à Secretaria Geral (sem nome, congregação ou matrícula da outra ficha). Nome + nascimento parecidos: só aviso, e só das
//        fichas que quem cadastra alcança. Com limite por pessoa (a conferência não pode virar um buscador de quem é da Igreja).
//   GET  /api/cadastro/casos?situacao=ABERTO|RESOLVIDO   — os casos (só a Secretaria Geral)
//   POST /api/cadastro/resolver-caso/{id}  { nota }       — dar o caso por resolvido (só a Secretaria Geral)
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { ehGeral, MSG_GERAL } = require("../shared/escopoRotas");
const { criarLimitador } = require("../shared/limiteTaxa");
const pdb = require("../shared/preCadastroDb");

// 40 conferências por minuto por pessoa (a tela confere ao terminar de digitar cada campo; mais que isso é varredura)
const limitador = criarLimitador({ janelaMs: 60000, maximo: 40 });
const responder = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };

module.exports = async function (context, req) {
  const visao = auth.exigirPermissao(req, context, "pessoas");
  if (!visao) return;
  const acao = context.bindingData && context.bindingData.acao ? String(context.bindingData.acao).toLowerCase() : "";
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pool = await getPool();

  if (acao === "conferir" && req.method === "POST") {
    const limite = limitador.registrar(`m:${visao.membroId}`);
    if (!limite.permitido) return responder(context, 429, { sucesso: false, mensagem: "Muitas conferências seguidas. Espere um minuto." });
    const textoOuNulo = (v) => (typeof v === "string" ? v : null);
    const r = await pdb.conferir(pool, visao, {
      cpf: typeof corpo.cpf === "string" || typeof corpo.cpf === "number" ? String(corpo.cpf) : null,
      nome: textoOuNulo(corpo.nome), dataNascimento: textoOuNulo(corpo.dataNascimento),
      congregacaoId: auth.idDeRota(corpo.congregacaoId) || null, excluirMembroId: auth.idDeRota(corpo.excluirMembroId) || null
    });
    return responder(context, 200, { sucesso: true, ...r });
  }

  if (acao === "casos" || acao === "resolver-caso") {
    if (!ehGeral(visao)) return responder(context, 403, { sucesso: false, mensagem: MSG_GERAL || "Só a Secretaria Geral." });
    if (acao === "casos" && req.method === "GET") {
      const situacao = req.query && req.query.situacao === "RESOLVIDO" ? "RESOLVIDO" : "ABERTO";
      return responder(context, 200, { sucesso: true, casos: await pdb.listarCasos(pool, { situacao }) });
    }
    if (acao === "resolver-caso" && req.method === "POST") {
      const id = auth.idDeRota(context.bindingData && context.bindingData.id);
      if (!id) return responder(context, 200, { sucesso: false, mensagem: "Caso não encontrado." });
      return responder(context, 200, await pdb.resolverCaso(pool, { casoId: id, por: Number(visao.membroId), nota: corpo.nota }));
    }
  }
  return responder(context, 404, { sucesso: false, mensagem: "Rota não encontrada." });
};
