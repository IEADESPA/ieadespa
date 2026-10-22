"use strict";
/*
 * CONFIRMAR COM NOME E HORA (v7.13, 22/10/2026). Marcar uma inscrição como paga (ou desmarcar) passa a guardar QUEM confirmou e QUANDO; a CORTESIA (isenção) só vale com o motivo e
 * o nome de quem autorizou, e também guarda quem registrou e quando. O tipo de participante do crachá (Participante, Preletor, Equipe, Imprensa, Convidado) passa pelo mesmo
 * caminho. Quem grava é a função `PainelInscricao`, nunca o navegador: o "quem" sai do próprio token da pessoa (`/users/me` no Directus), então ninguém escreve o nome de outro.
 *
 * Aqui só as regras puras (sem rede): o nome que aparece, se o perfil pode mexer e quais campos cada ação grava.
 *
 * Revisão de 22/10/2026: junto com quem e quando grava o VALOR registrado (`pago_conferido_valor`, `cortesia_registrada_valor`). Quem tem permissão de alterar
 * tudo no Directus ainda consegue mudar o `pago` direto (a licença não deixa fechar campo por campo); aí o painel mostra "registro divergente" e a prova de
 * quem mudou é o registro de atividade do Directus.
 */
const TIPOS_PARTICIPANTE = Object.freeze(["Participante", "Preletor", "Equipe", "Imprensa", "Convidado"]);
const MOTIVO_MAX = 300;
const NOME_MAX = 120;
const { temCaractereProibido } = require("./textoSeguro");

/** O nome de quem está logado, como aparece no painel ("Confirmado por Maria Souza"). Sem nome cadastrado, o e-mail; sem nada, o começo do id. */
function nomeDoUsuario(u) {
  if (!u) return "Equipe";
  const nome = [u.first_name, u.last_name].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
  if (nome) return nome.slice(0, NOME_MAX);
  if (u.email) return String(u.email).slice(0, NOME_MAX);
  return u.id ? `Usuário ${String(u.id).slice(0, 8)}` : "Equipe";
}

/**
 * O perfil pode fazer esta ação? `permissoes` é a resposta de `GET /permissions/me` do Directus ({ colecao: { acao: { access, fields } } }). Pagamento e cortesia exigem poder
 * alterar o campo `pago` (é ele que diz que o perfil cuida de pagamento); o tipo de participante, poder alterar a inscrição.
 */
function perfilPode(permissoes, acao) {
  const update = permissoes && permissoes.inscricoes_eventos && permissoes.inscricoes_eventos.update;
  if (!update || !update.access || update.access === "none") return false;
  const campos = Array.isArray(update.fields) ? update.fields : [];
  // Revisão de 22/10/2026: o tipo também exige o campo (antes bastava poder alterar QUALQUER campo da inscrição).
  if (acao === "tipo") return campos.includes("*") || campos.includes("tipo_participante");
  return campos.includes("*") || campos.includes("pago");
}

function textoLimpo(bruto, { min, max, rotulo }) {
  if (typeof bruto !== "string") return { erro: `Informe ${rotulo}.` };
  if (temCaractereProibido(bruto)) return { erro: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} tem um caractere que não é aceito.` };
  const t = bruto.trim().replace(/\s+/g, " ");
  if (t.length < min) return { erro: `Informe ${rotulo}.` };
  if (t.length > max) return { erro: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} pode ter no máximo ${max} letras.` };
  return { valor: t };
}

/**
 * Os campos que a ação grava. `pedido` = { acao: "pago", pago } | { acao: "cortesia", ativa, motivo, autorizadoPor } | { acao: "tipo", tipo }.
 * Devolve `{ campos }` ou `{ erro }`.
 */
function montarAlteracao(pedido, usuario, agoraIso = new Date().toISOString()) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  const quem = { id: usuario && usuario.id ? String(usuario.id) : null, nome: nomeDoUsuario(usuario) };
  if (!quem.id) return { erro: "Não foi possível saber quem está logado." };
  if (p.acao === "pago") {
    if (typeof p.pago !== "boolean") return { erro: "Diga se está marcando ou desmarcando o pagamento." };
    return { campos: { pago: p.pago, pago_conferido_valor: p.pago, pago_conferido_em: agoraIso, pago_conferido_por: quem.id, pago_conferido_por_nome: quem.nome } };
  }
  if (p.acao === "cortesia") {
    if (typeof p.ativa !== "boolean") return { erro: "Diga se está dando ou tirando a cortesia." };
    if (!p.ativa) {
      // Tirar a cortesia: a inscrição volta a ser cobrada; fica registrado quem tirou e quando.
      return { campos: { cortesia: false, cortesia_registrada_valor: false, cortesia_motivo: null, cortesia_autorizada_por: null, cortesia_em: agoraIso, cortesia_registrada_por: quem.id, cortesia_registrada_por_nome: quem.nome } };
    }
    const motivo = textoLimpo(p.motivo, { min: 3, max: MOTIVO_MAX, rotulo: "o motivo da cortesia" });
    if (motivo.erro) return { erro: motivo.erro };
    const autorizou = textoLimpo(p.autorizadoPor, { min: 2, max: NOME_MAX, rotulo: "o nome de quem autorizou" });
    if (autorizou.erro) return { erro: autorizou.erro };
    return {
      campos: {
        cortesia: true, cortesia_registrada_valor: true, cortesia_motivo: motivo.valor, cortesia_autorizada_por: autorizou.valor,
        cortesia_em: agoraIso, cortesia_registrada_por: quem.id, cortesia_registrada_por_nome: quem.nome,
      },
    };
  }
  if (p.acao === "tipo") {
    if (!TIPOS_PARTICIPANTE.includes(p.tipo)) return { erro: "Tipo de participante inválido." };
    return { campos: { tipo_participante: p.tipo } };
  }
  return { erro: "Ação inválida." };
}

/** Os campos que a resposta devolve ao painel (para a linha ser atualizada sem recarregar tudo). */
const CAMPOS_RESPOSTA = "id,pago,pago_conferido_valor,pago_conferido_em,pago_conferido_por,pago_conferido_por_nome,cortesia,cortesia_registrada_valor,cortesia_motivo,cortesia_autorizada_por,cortesia_em,cortesia_registrada_por,cortesia_registrada_por_nome,tipo_participante";

module.exports = { TIPOS_PARTICIPANTE, MOTIVO_MAX, NOME_MAX, CAMPOS_RESPOSTA, nomeDoUsuario, perfilPode, montarAlteracao };
