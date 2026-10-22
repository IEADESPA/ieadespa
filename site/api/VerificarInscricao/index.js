const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { avisoDoRegistro } = require("../src/lib/pagamentoInformado");
const { respostaParaCracha, perguntasDoCracha } = require("../src/lib/cracha");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * v7.13 — o resto do que a própria pessoa pode ver da sua inscrição (lote, tipo, cortesia, pagamento informado) e, quando `eventoId` vem, os dados do crachá: a configuração do
 * crachá do evento e as respostas da pessoa às perguntas escolhidas para "igreja/congregação" e "cidade". Só é chamada DEPOIS de o telefone conferir.
 */
async function detalhesDaInscricao(inscricaoId, eventoId) {
  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
  const r = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${inscricaoId}?fields=*`, { headers });
  if (!r.ok) throw new Error(`leitura da inscrição falhou (${r.status})`);
  const i = (await r.json()).data || {};
  const saida = {
    faixa: i.faixa_rotulo ?? null,
    valor: i.valor == null ? null : Number(i.valor),
    tipoParticipante: i.tipo_participante || "Participante",
    cortesia: i.cortesia === true,
    aguardandoVaga: i.aguardando_vaga === true,
    pagamentoInformado: avisoDoRegistro(i),
  };
  if (eventoId) {
    const re = await fetch(`${DIRECTUS_URL}/items/eventos/${encodeURIComponent(eventoId)}?fields=*`, { headers });
    const evento = re.ok ? (await re.json()).data || {} : {};
    let config = evento.cracha_config;
    if (typeof config === "string") { try { config = JSON.parse(config); } catch { config = null; } }
    config = config && typeof config === "object" ? config : {};
    const perguntas = { igreja: config.igreja ? Number(config.pergunta_igreja) : null, cidade: config.cidade ? Number(config.pergunta_cidade) : null };
    const ids = Object.values(perguntas).filter((n) => Number.isInteger(n) && n > 0);
    // Revisão de 22/10/2026: a resposta pode ter sido criada por qualquer pessoa (criação pública em respostas_inscricao). Só vale a MAIS ANTIGA, de pergunta
    // do evento feita na inscrição, criada até 10 min depois da inscrição (ver `src/lib/cracha.js`).
    let respostas = [];
    let validas = new Set();
    if (ids.length) {
      const [rr, rp] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/respostas_inscricao?filter[inscricao][_eq]=${inscricaoId}&filter[pergunta][_in]=${ids.join(",")}&fields=*&sort=id&limit=50`, { headers }),
        fetch(`${DIRECTUS_URL}/items/perguntas_evento?filter[id][_in]=${ids.join(",")}&fields=id,evento,momento&limit=10`, { headers }),
      ]);
      respostas = rr.ok ? (await rr.json()).data || [] : [];
      validas = perguntasDoCracha(rp.ok ? (await rp.json()).data || [] : [], eventoId);
    }
    const opcoes = { perguntasValidas: validas, inscricaoCriadaEm: i.date_created || null };
    saida.cracha = {
      config,
      tipo: saida.tipoParticipante,
      igreja: perguntas.igreja ? respostaParaCracha(respostas, perguntas.igreja, opcoes) : null,
      cidade: perguntas.cidade ? respostaParaCracha(respostas, perguntas.cidade, opcoes) : null,
    };
  }
  return saida;
}

/**
 * Substitui o Flow "Verificar inscricao (codigo + telefone)" do Directus —
 * mesma lógica e mesmo formato de entrada/saída (drop-in replacement, as
 * páginas certificado/cracha/pesquisa/qrcode não precisaram mudar nada
 * além da URL), mas rodando em Node.js de verdade (não no sandbox do
 * Flow, que não tem `crypto` nem `fetch` — ver README, Fase 6) e
 * comparando o telefone contra um hash de verdade, não texto puro.
 */
module.exports = async function (context, req) {
  if (!permitir(`verificar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const { evento, modo, codigo, nome, id, telefone } = body;
  if (!evento || !modo) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  const rosterRes = await fetch(
    `${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${encodeURIComponent(evento)}&fields=id,nome,codigo,presente,pago,telefone&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
  );
  if (!rosterRes.ok) {
    context.log.error("Falha ao buscar roster no Directus:", rosterRes.status);
    context.res = { status: 502, body: { erro: "Falha ao consultar inscrições." } };
    return;
  }
  const roster = (await rosterRes.json()).data || [];

  // v7.13: depois de o telefone conferir, a pessoa também vê o lote, o tipo de participante, se é cortesia e o pagamento que ela informou (página "Informar pagamento"), e, se
  // a página pedir (`cracha: true`), o que vai no crachá (respostas às perguntas que o evento escolheu). Isso vem numa leitura à parte, com `fields=*`, para a verificação não
  // quebrar num Directus ainda sem os campos novos (pedir um campo que não existe dá 403). Revisão de 22/10/2026: só quando a página PEDE (`detalhes` ou `cracha`) —
  // o QR Code, o certificado e a pesquisa não precisam disso e não pagam as leituras a mais.
  const querDetalhes = body.detalhes === true || body.cracha === true;
  const responder = async (registro) => {
    const base = { encontrado: true, id: registro.id, nome: registro.nome, codigo: registro.codigo, presente: registro.presente, pago: registro.pago };
    if (!querDetalhes) return base;
    try {
      Object.assign(base, await detalhesDaInscricao(registro.id, body.cracha === true ? evento : null));
    } catch (e) {
      context.log.warn("detalhes da inscrição indisponíveis:", e && e.message);
    }
    return base;
  };

  if (modo === "codigo") {
    const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
    if (!registro || !conferirHash(telefone, registro.telefone)) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await responder(registro) };
    return;
  }

  if (modo === "nome") {
    const termo = norm(nome);
    if (termo.length < 2) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { candidatos: [] } };
      return;
    }
    const candidatos = roster
      .filter((r) => norm(r.nome).includes(termo))
      .slice(0, 8)
      .map((r) => ({ id: r.id, nome: r.nome }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { candidatos } };
    return;
  }

  if (modo === "id") {
    const registro = roster.find((r) => String(r.id) === String(id));
    if (!registro || !conferirHash(telefone, registro.telefone)) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await responder(registro) };
    return;
  }

  // Fase 21 — verificação pública de autenticidade de certificado: de
  // propósito SEM telefone (quem confere é um terceiro — ex. um
  // empregador — que nunca teria o telefone de quem se inscreveu, só o
  // código impresso no próprio certificado). Por isso a resposta é
  // mínima: nunca confirma nem nega que um código existe quando a pessoa
  // não esteve presente — sempre a mesma forma (`autentico:false`), pra
  // não revelar "existe mas não foi" de quem não tem certificado nenhum.
  if (modo === "verificar_certificado") {
    const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
    if (!registro || !registro.presente) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { autentico: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { autentico: true, nome: registro.nome } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
};
