const { avaliarJanela } = require("../src/lib/janela");
const { umaVezPorChave } = require("../src/lib/limiteLote");
const { normalizarFaixas, algumLoteComVagas, situacaoDosLotes } = require("../src/lib/lotes");

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
 *
 * v7.13 — também diz a situação de cada LOTE (faixa de valor com `ate`/`vagas`, ver `lotes.js`):
 * `lotes: [{ descricao, valor, ate, vagas, restantes, disponivel, motivo }]`, para a página esconder o
 * lote vencido ou esgotado sem esperar a remontagem. A contagem por lote é UMA consulta agrupada.
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

  // Uma consulta só por evento de cada vez (por instância): com a memória vencida e mil aberturas de página no mesmo segundo, todas esperam a MESMA resposta do Directus
  // em vez de disparar mil consultas (medido em 19/10/2026 no status da camiseta, que tinha o mesmo desenho: 200 aberturas simultâneas levavam ~20 s no meio e 4 falhavam).
  const lida = await umaVezPorChave(`status-inscricao:${eventoId}`, async () => {
    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
    const res = await fetch(`${DIRECTUS_URL}/items/eventos/${eventoId}?fields=id,aceita_inscricao,inscricoes_encerradas,inscricoes_ate,vagas_limite,requer_aprovacao,faixas_valor`, { headers });
    let corpo;
    if (res.status === 404 || res.status === 403) {
      corpo = { aberto: false, motivo: "inexistente", mensagem: "Evento não encontrado." };
    } else if (!res.ok) {
      return { falhou: true };
    } else {
      const ev = (await res.json()).data;
      corpo = avaliarJanela({ ativo: ev.aceita_inscricao === true && ev.inscricoes_encerradas !== true, ate: ev.inscricoes_ate, rotulo: "inscrições" });
      // Vagas restantes (mesmo critério do painel e de `CriarInscricao`): a página mostra
      // "(N restantes)" sem precisar ler a coleção de inscrições pelo navegador.
      if (ev.vagas_limite && corpo.aberto) {
        const c = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?aggregate[count]=id&filter[_and][0][evento][_eq]=${eventoId}&filter[_and][1][_or][0][aguardando_vaga][_eq]=false&filter[_and][1][_or][1][aguardando_vaga][_null]=true`, { headers });
        const confirmados = c.ok ? Number(((await c.json()).data?.[0]?.count?.id) ?? 0) : null;
        corpo.vagasLimite = Number(ev.vagas_limite);
        corpo.vagasRestantes = confirmados == null ? null : Math.max(Number(ev.vagas_limite) - confirmados, 0);
      }
      const faixas = normalizarFaixas(ev.faixas_valor);
      if (faixas.length > 0) {
        const contagens = {};
        if (algumLoteComVagas(faixas) && corpo.aberto) {
          // Sem o campo `faixa_rotulo` (esquema v7.13 ainda não aplicado) a consulta falha: o lote com vagas aparece disponível e a trava decide na hora.
          const g = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?aggregate[count]=id&groupBy[]=faixa_rotulo&filter[evento][_eq]=${eventoId}&limit=-1`, { headers });
          if (g.ok) {
            for (const linha of (await g.json()).data || []) {
              if (linha.faixa_rotulo != null) contagens[linha.faixa_rotulo] = Number(linha.count?.id ?? linha.count) || 0;
            }
          }
        }
        // O número de inscritos de cada lote não sai daqui (só "restam N"), como as vagas do evento.
        corpo.lotes = situacaoDosLotes(faixas, contagens).map(({ inscritos, ...publico }) => publico);
      }
    }

    cache.set(eventoId, { em: Date.now(), corpo });
    return { corpo };
  });
  if (lida.falhou) {
    context.res = { status: 502, body: { erro: "Falha ao consultar o evento." } };
    return;
  }
  context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: lida.corpo };
};
