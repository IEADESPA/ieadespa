// PreCadastros (FASE 10, v10.1b passo 4, 17/11/2026) — o PRÉ-CADASTRO feito por quem está com a pessoa e a FILA DE CADASTROS da secretaria. Regras em
// shared/preCadastro.js; leitura e gravação em shared/preCadastroDb.js. O formulário público do site é outra rota (PreCadastroSite).
//   POST /api/pre-cadastros   { nome, cpf?, email?, telefone?, dataNascimento?, sexo?, estadoCivil?, congregacaoId, consentimentoDaPessoa: true }
//        — lançar: a secretaria (permissão "pessoas" na congregação), um professor ativo da EBD da congregação ou a liderança da congregação.
//          Com o mínimo obrigatório e sem pendência, ENTRA SOZINHO (a ficha nova, como congregado, com a matrícula gerada); senão fica na fila.
//   GET  /api/pre-cadastros?caixa=fila|aceitos|descartados&pagina=   — a fila, no escopo da permissão "pessoas" (a área e a Geral acompanham)
//   GET  /api/pre-cadastros?caixa=meus                               — os que EU lancei (só o nome e a situação)
//   GET  /api/pre-cadastros/{id}                                     — um pré-cadastro (no escopo)
//   POST /api/pre-cadastros/{id}/completar  { campos:{…}, versao, naoERepeticao?, responsavelConfirmado? }  — a secretaria local (ou a Geral) completa; sem pendência, entra
//   POST /api/pre-cadastros/{id}/aceitar    { versao, naoERepeticao?, responsavelConfirmado? }                — idem, sem mudar campo (só as confirmações)
//   POST /api/pre-cadastros/{id}/descartar  { motivo, versao }
// Fora do escopo = a mesma resposta de "não existe". O professor/líder que lançou NÃO fica sabendo por que um pré-cadastro parou (um CPF repetido revelaria que a
// pessoa já é da Igreja): ele vê só "na fila da secretaria" e os campos que faltam.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const regras = require("../shared/preCadastro");
const pdb = require("../shared/preCadastroDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const pessoaCompleta = require("../shared/preCadastroPessoa");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");
const { urlPublicaBase } = require("../shared/certificados");

const NAO_EXISTE = { sucesso: false, mensagem: regras.MSG.NAO_EXISTE };
const CAMPOS = ["nome", "cpf", "email", "telefone", "dataNascimento", "sexo", "estadoCivil", "congregacaoId"];
const responder = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
// O que quem LANÇOU (sem a permissão de secretaria) pode saber do resultado: aceito (com a matrícula) ou "na fila", e só os campos que faltam.
function resultadoParaQuemLancou(r) {
  if (r.situacao === "ACEITO") return { sucesso: true, situacao: "ACEITO", matricula: r.matricula, mensagem: `Cadastro feito: matrícula ${r.matricula}.` };
  const campos = (r.pendencias || []).filter((p) => p.startsWith("FALTA_") || p === "MENOR_DE_IDADE");
  return { sucesso: true, situacao: "NA_FILA", pendencias: regras.pendenciasComRotulo(campos), mensagem: "O pré-cadastro foi para a fila da secretaria da congregação." };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const visao = auth.visaoDaPermissao(usuario, "pessoas");
  const eu = Number(usuario.membroId);
  const idBruto = context.bindingData && context.bindingData.id;
  const acao = context.bindingData && context.bindingData.acao ? String(context.bindingData.acao).toLowerCase() : null;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pool = await getPool();

  if (req.method === "GET") {
    if (!idBruto && req.query && req.query.caixa === "meus") return responder(context, 200, { sucesso: true, itens: await pdb.meus(pool, eu) });
    if (!visao) return responder(context, 403, { sucesso: false, mensagem: "A fila de cadastros é da secretaria." });
    if (!idBruto) {
      const caixa = req.query && ["fila", "aceitos", "descartados"].includes(req.query.caixa) ? req.query.caixa : "fila";
      const r = await pdb.listar(pool, visao, { caixa, pagina: req.query && req.query.pagina, porPagina: req.query && req.query.porPagina });
      return responder(context, 200, { sucesso: true, ...r });
    }
    const id = auth.idDeRota(idBruto);
    const l = id ? await pdb.lerPreCadastro(() => pool.request(), id) : null;
    if (!l || !pdb.visivelPara(visao, l)) return responder(context, 200, NAO_EXISTE);
    return responder(context, 200, { sucesso: true, preCadastro: pdb.mapear(l, visao) });
  }
  if (req.method !== "POST") return responder(context, 405, { sucesso: false, mensagem: "Método não permitido." });

  // ---- lançar ----
  if (!idBruto) {
    const lido = regras.lerEntrada(corpo, { hojeISO: hojeBrasilia() });
    if (!lido.ok) return responder(context, 200, { sucesso: false, mensagem: lido.mensagem });
    if (!lido.dados.congregacaoId) return responder(context, 200, { sucesso: false, mensagem: "Escolha a congregação." });
    const cong = await pdb.lerCongregacao(() => pool.request(), lido.dados.congregacaoId);
    if (!cong || !cong.ativa) return responder(context, 200, { sucesso: false, mensagem: "Congregação inválida." });
    const origem = await pdb.origemDeQuemLanca(pool, usuario, cong);
    if (!origem) return responder(context, 403, { sucesso: false, mensagem: regras.MSG.QUEM_LANCA });
    if (corpo.consentimentoDaPessoa !== true) return responder(context, 200, { sucesso: false, mensagem: "Confirme que a pessoa concordou em ter os dados no cadastro da Igreja." });
    const id = await pdb.inserir(pool, lido.dados, { origem, criadoPor: eu, consentimento: regras.CONSENTIMENTO });
    let r;
    try { r = await pdb.processar(pool, id); } catch (e) { context.log.error("[PreCadastros] processar:", e.message); r = { situacao: "PENDENTE", pendencias: [] }; }
    if (origem === "LIDER") return responder(context, 200, { preCadastroId: id, ...resultadoParaQuemLancou(r) });
    const l = await pdb.lerPreCadastro(() => pool.request(), id);
    return responder(context, 200, { sucesso: true, preCadastroId: id, situacao: r.situacao, matricula: r.matricula || null, preCadastro: pdb.mapear(l, visao) });
  }

  // ---- completar, aceitar, descartar (a secretaria local da congregação do pré-cadastro, ou a Geral) ----
  const id = auth.idDeRota(idBruto);
  if (!id || !["completar", "aceitar", "descartar", "pedir-pessoa"].includes(acao) || !visao) return responder(context, 200, NAO_EXISTE);
  const l = await pdb.lerPreCadastro(() => pool.request(), id);
  if (!l || !pdb.visivelPara(visao, l)) return responder(context, 200, NAO_EXISTE);
  const papel = pdb.papelParaResolver(visao, l);
  if (!papel) return responder(context, 403, { sucesso: false, mensagem: regras.MSG.QUEM_RESOLVE });
  const versaoLida = typeof corpo.versao === "string" && /^\d{1,20}$/.test(corpo.versao) ? corpo.versao : null;
  const confirmacoes = { naoERepeticao: corpo.naoERepeticao === true, responsavelConfirmado: corpo.responsavelConfirmado === true };

  // a própria pessoa completa pelo e-mail (migração 183): o link vale 7 dias e uma vez só; se o e-mail não sair, o pedido não vale
  if (acao === "pedir-pessoa") {
    const p = await pessoaCompleta.pedir(pool, { id, por: eu });
    if (!p.sucesso) return responder(context, p.conflito ? 409 : 200, { sucesso: false, mensagem: p.mensagem });
    const url = `${urlPublicaBase()}/completar-cadastro.html?c=${encodeURIComponent(p.token)}`;
    const enviado = await enviarEmailNotificacao({ email: p.email, titulo: "Complete o seu cadastro na IEADESPA", mensagem: pessoaCompleta.textoDoEmail({ nome: p.nome, falta: p.falta, url }), aguardarEntrega: false });
    if (!enviado) {
      await pessoaCompleta.desfazerPedido(pool, { id, token: p.token });
      return responder(context, 503, { sucesso: false, mensagem: "O e-mail não saiu agora: tente de novo em instantes (ou complete você mesma)." });
    }
    const atual = await pdb.lerPreCadastro(() => pool.request(), id);
    return responder(context, 200, { sucesso: true, mensagem: `E-mail enviado: a pessoa tem ${pessoaCompleta.DIAS} dias para completar.`, preCadastro: pdb.mapear(atual, visao) });
  }
  let r;
  if (acao === "descartar") r = await pdb.descartar(pool, { id, papel, por: eu, motivo: corpo.motivo, versaoLida });
  else if (acao === "completar") {
    const fonte = corpo.campos && typeof corpo.campos === "object" && !Array.isArray(corpo.campos) ? corpo.campos : {};
    const campos = {};
    for (const k of CAMPOS) if (Object.prototype.hasOwnProperty.call(fonte, k)) campos[k] = fonte[k];
    r = await pdb.completar(pool, { id, campos, papel, por: eu, versaoLida, ...confirmacoes });
  } else {
    r = await pdb.processar(pool, id, { porQuem: eu, como: papel, versaoLida, ...confirmacoes });
    if (r.sucesso && r.situacao !== "ACEITO" && !r.jaResolvido) {
      const atual = await pdb.lerPreCadastro(() => pool.request(), id);
      return responder(context, 200, { sucesso: false, mensagem: regras.MSG.SEM_PENDENCIA_PARA_ACEITAR, preCadastro: pdb.mapear(atual, visao) });
    }
    if (r.jaResolvido && r.situacao !== "ACEITO") return responder(context, 409, { sucesso: false, mensagem: regras.MSG.JA_RESOLVIDO });
  }
  if (!r.sucesso) return responder(context, r.conflito ? 409 : r.proibido ? 403 : 200, { sucesso: false, mensagem: r.mensagem });
  const atual = await pdb.lerPreCadastro(() => pool.request(), id);
  return responder(context, 200, { sucesso: true, situacao: r.situacao, matricula: r.matricula || null, preCadastro: pdb.mapear(atual, visao) });
};
