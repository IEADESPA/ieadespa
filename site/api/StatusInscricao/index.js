const { avaliarJanela } = require("../src/lib/janela");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * "Este evento ainda aceita inscrição?" — irmão de `StatusCamiseta`
 * (06/10/2026). A página do evento é estática: foi montada com as inscrições
 * abertas e continua mostrando o formulário até o site ser remontado. A
 * secretaria que marca "inscrições encerradas" no Directus espera que o
 * formulário suma na hora. Regra: `aceita_inscricao` e `inscricoes_encerradas`
 * mandam acima de tudo; `inscricoes_ate` (dia inclusive, Brasília) fecha pelo
 * prazo. Cache de 20 s por instância.
 */
const CACHE_MS = 20 * 1000;
const cache = new Map();

module.exports = async function (context, req) {
  const eventoId = Number(req.params?.eventoId);
  if (!Number.isInteger(eventoId) || eventoId <= 0) {
    context.res = { status: 400, body: { erro: "Evento inválido." } };
    return;
  }
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const agora = Date.now();
  const guardado = cache.get(eventoId);
  if (guardado && agora - guardado.em < CACHE_MS) {
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: guardado.corpo };
    return;
  }

  const res = await fetch(`${DIRECTUS_URL}/items/eventos/${eventoId}?fields=id,aceita_inscricao,inscricoes_encerradas,inscricoes_ate`, {
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
  });
  let corpo;
  if (res.status === 404 || res.status === 403) {
    corpo = { aberto: false, motivo: "inexistente", mensagem: "Evento não encontrado." };
  } else if (!res.ok) {
    context.res = { status: 502, body: { erro: "Falha ao consultar o evento." } };
    return;
  } else {
    const ev = (await res.json()).data;
    corpo = avaliarJanela({ ativo: ev.aceita_inscricao === true && ev.inscricoes_encerradas !== true, ate: ev.inscricoes_ate, rotulo: "inscrições" });
  }

  cache.set(eventoId, { em: agora, corpo });
  context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: corpo };
};
