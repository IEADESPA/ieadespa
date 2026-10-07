const crypto = require("node:crypto");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { gerarHash, chaveTelefone, cifrarTelefone } = require("../src/lib/telefone");
const { avaliarJanela } = require("../src/lib/janela");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Inscrição pública em evento, inteira no servidor (06/10/2026 — blindagem de
 * camisetas e eventos). Até aqui o NAVEGADOR gravava direto no Directus com a
 * permissão pública: criava a inscrição e as respostas, contava as vagas e até
 * mudava o contador de usos do cupom — qualquer pessoa podia chamar isso à mão,
 * sem prazo, sem vaga, sem limite. Agora o navegador manda UMA chamada para cá
 * e a regra toda mora aqui, igual a `CriarPedidoCamiseta`:
 *
 *   - rate limit por IP;
 *   - evento aceita inscrição? (`aceita_inscricao`, `inscricoes_encerradas` e
 *     `inscricoes_ate`, mesma régua de `StatusInscricao`/`janela.js`);
 *   - grupo (várias pessoas) só se o evento permitir;
 *   - faixa de valor tem que ser uma das faixas do evento;
 *   - cupom conferido aqui (ativo, validade, usos restantes) e o contador de
 *     usos atualizado aqui — nunca pelo navegador;
 *   - vagas contadas aqui, no mesmo critério do painel (aguardando_vaga falso
 *     ou nulo); quem não cabe entra na lista de espera, como antes;
 *   - telefone gravado como scrypt (`telefone`) + chave de busca
 *     (`telefone_chave`, HMAC) — ver `telefone.js`;
 *   - no máximo 10 inscrições por telefone por evento (grupo cabe; abuso não);
 *   - todas as pessoas do grupo numa gravação só (lista no POST) e as
 *     respostas em outra: 2 gravações, não 2 por pessoa.
 *
 * A resposta devolve, por pessoa, o código de check-in e a situação — o mesmo
 * que a tela já mostrava.
 */
const LIMITE_POR_IP = 40; // 5 min
const MAX_PESSOAS = 20;
const MAX_POR_TELEFONE = 10;
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L
const CACHE_EVENTO_MS = 10 * 1000;
const cacheEventos = new Map();

function gerarCodigo(tamanho = 6) {
  const bytes = crypto.randomBytes(tamanho);
  return Array.from(bytes, (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join("");
}

function aplicarDesconto(valorBase, cupom) {
  const base = valorBase ?? 0;
  if (cupom.tipo === "fixo") return Math.max(0, base - Number(cupom.valor));
  return Math.max(0, base - (base * Number(cupom.valor)) / 100);
}

async function directus(headers, metodo, caminho, corpo) {
  const res = await fetch(`${DIRECTUS_URL}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json.data };
}

async function lerEvento(headers, eventoId) {
  const agora = Date.now();
  const guardado = cacheEventos.get(eventoId);
  if (guardado && agora - guardado.em < CACHE_EVENTO_MS) return guardado.valor;
  const r = await directus(headers, "GET", `/items/eventos/${eventoId}?fields=id,title,aceita_inscricao,inscricoes_encerradas,inscricoes_ate,vagas_limite,requer_aprovacao,permite_inscricao_grupo,faixas_valor`);
  const valor = r.ok ? { ok: true, evento: r.data } : { ok: false, status: r.status };
  if (r.ok || r.status === 404 || r.status === 403) cacheEventos.set(eventoId, { em: agora, valor });
  return valor;
}

async function contarConfirmados(headers, eventoId) {
  // "_eq=false" sozinho não bateria com uma linha onde o campo nunca foi definido (null) —
  // o "_or" cobre os dois casos, mesmo critério do painel de inscritos.
  const r = await directus(headers, "GET", `/items/inscricoes_eventos?aggregate[count]=id&filter[_and][0][evento][_eq]=${eventoId}&filter[_and][1][_or][0][aguardando_vaga][_eq]=false&filter[_and][1][_or][1][aguardando_vaga][_null]=true`);
  if (!r.ok) throw new Error(`falha ao contar vagas (${r.status})`);
  return Number(r.data?.[0]?.count?.id ?? 0);
}

async function contarPorTelefone(headers, eventoId, chave) {
  const r = await directus(headers, "GET", `/items/inscricoes_eventos?aggregate[count]=id&filter[evento][_eq]=${eventoId}&filter[telefone_chave][_eq]=${encodeURIComponent(chave)}`);
  if (!r.ok) throw new Error(`falha ao conferir telefone (${r.status})`);
  return Number(r.data?.[0]?.count?.id ?? 0);
}

/** Cupom válido deste evento, ou a mensagem de por que não — a inscrição segue sem desconto. */
async function buscarCupom(headers, eventoId, codigo) {
  const r = await directus(headers, "GET", `/items/cupons_desconto?filter[_and][0][evento][_eq]=${eventoId}&filter[_and][1][codigo][_eq]=${encodeURIComponent(codigo)}&fields=id,codigo,tipo,valor,limite_usos,usos,valido_ate,ativo&limit=1`);
  if (!r.ok) return { cupom: null, mensagem: "Não foi possível conferir o cupom agora; a inscrição segue sem desconto." };
  const cupom = r.data?.[0];
  if (!cupom || cupom.ativo === false) return { cupom: null, mensagem: "Cupom inválido para este evento." };
  if (cupom.valido_ate && new Date(`${String(cupom.valido_ate).slice(0, 10)}T23:59:59-03:00`).getTime() < Date.now()) return { cupom: null, mensagem: "Cupom vencido." };
  const usos = Number(cupom.usos) || 0;
  if (cupom.limite_usos != null && usos >= Number(cupom.limite_usos)) return { cupom: null, mensagem: "Cupom esgotado." };
  return { cupom: { ...cupom, usos }, mensagem: null };
}

module.exports = async function (context, req) {
  if (!permitir(`criar-inscricao:${ipDoPedido(req)}`, LIMITE_POR_IP)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/TELEFONE_CHAVE_SEGREDO).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const eventoId = Number(body.eventoId);
  const nomes = (Array.isArray(body.nomes) ? body.nomes : [body.nome]).map((n) => String(n || "").trim().slice(0, 120)).filter(Boolean).slice(0, MAX_PESSOAS);
  const telefone = String(body.telefone || "");
  const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 200) || null : null;
  const codigoCupom = body.cupom ? String(body.cupom).trim().toUpperCase().slice(0, 40) : "";
  const respostasBase = (Array.isArray(body.respostas) ? body.respostas : []).slice(0, 30).map((r) => ({ pergunta: Number(r.pergunta), valor: String(r.valor ?? "").slice(0, 2000) })).filter((r) => Number.isInteger(r.pergunta) && r.valor);

  const telefoneHash = gerarHash(telefone);
  const telefoneChave = chaveTelefone(telefone);
  if (!Number.isInteger(eventoId) || eventoId <= 0 || nomes.length === 0 || !telefoneHash || !telefoneChave) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes (evento, nome e telefone com pelo menos 8 dígitos)." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const lido = await lerEvento(headers, eventoId);
  if (!lido.ok) {
    context.res = { status: 404, body: { erro: "Evento não encontrado." } };
    return;
  }
  const evento = lido.evento;

  const janela = avaliarJanela({ ativo: evento.aceita_inscricao === true && evento.inscricoes_encerradas !== true, ate: evento.inscricoes_ate, rotulo: "inscrições" });
  if (!janela.aberto) {
    context.res = { status: 403, body: { erro: janela.mensagem, motivo: janela.motivo } };
    return;
  }
  if (nomes.length > 1 && !evento.permite_inscricao_grupo) {
    context.res = { status: 400, body: { erro: "Este evento não aceita inscrição em grupo." } };
    return;
  }

  // Faixa de valor: só uma das faixas do evento (ou nenhuma, se o evento não tem faixa).
  const faixas = Array.isArray(evento.faixas_valor) ? evento.faixas_valor : [];
  let valorFaixa = null;
  if (faixas.length > 0) {
    const pedido = body.valorFaixa == null || body.valorFaixa === "" ? null : Number(body.valorFaixa);
    const existe = pedido != null && faixas.some((f) => Number(f.valor) === pedido);
    if (pedido != null && !existe) {
      context.res = { status: 400, body: { erro: "Faixa de valor inválida." } };
      return;
    }
    valorFaixa = pedido;
  }

  try {
    const [jaTem, confirmadosIniciais, cupomInfo] = await Promise.all([
      contarPorTelefone(headers, eventoId, telefoneChave),
      evento.vagas_limite && !evento.requer_aprovacao ? contarConfirmados(headers, eventoId) : Promise.resolve(0),
      codigoCupom ? buscarCupom(headers, eventoId, codigoCupom) : Promise.resolve({ cupom: null, mensagem: null }),
    ]);
    if (jaTem + nomes.length > MAX_POR_TELEFONE) {
      context.res = { status: 400, body: { erro: `Este telefone já tem ${jaTem} inscrição(ões) neste evento; o limite é ${MAX_POR_TELEFONE}.` } };
      return;
    }

    const cupom = cupomInfo.cupom;
    let usosRestantesCupom = cupom ? (cupom.limite_usos == null ? Infinity : Number(cupom.limite_usos) - cupom.usos) : 0;
    let confirmados = confirmadosIniciais;
    const pendenteAprovacao = Boolean(evento.requer_aprovacao);

    const registros = nomes.map((nome) => {
      let aguardandoVaga = false;
      if (evento.vagas_limite && !pendenteAprovacao) {
        aguardandoVaga = confirmados >= Number(evento.vagas_limite);
        if (!aguardandoVaga) confirmados += 1;
      }
      let valorFinal = valorFaixa;
      let cupomAplicado = null;
      if (cupom && usosRestantesCupom > 0) {
        valorFinal = aplicarDesconto(valorFaixa, cupom);
        cupomAplicado = cupom.codigo;
        usosRestantesCupom -= 1;
      }
      return {
        evento: eventoId,
        nome,
        telefone: telefoneHash,
        telefone_chave: telefoneChave,
        telefone_cifrado: cifrarTelefone(telefone),
        email,
        codigo: gerarCodigo(),
        valor: valorFinal,
        cupom_usado: cupomAplicado,
        aguardando_vaga: aguardandoVaga,
        pendente_aprovacao: pendenteAprovacao,
      };
    });

    const criado = await directus(headers, "POST", "/items/inscricoes_eventos", registros);
    if (!criado.ok || !Array.isArray(criado.data)) {
      context.log.error("Falha ao criar inscrição:", criado.status);
      context.res = { status: 502, body: { erro: "Falha ao registrar a inscrição." } };
      return;
    }
    const criadas = criado.data;

    const tarefas = [];
    if (respostasBase.length > 0) {
      const respostas = criadas.flatMap((i) => respostasBase.map((r) => ({ inscricao: i.id, pergunta: r.pergunta, valor: r.valor })));
      tarefas.push(directus(headers, "POST", "/items/respostas_inscricao", respostas));
    }
    const usosAplicados = registros.filter((r) => r.cupom_usado).length;
    if (cupom && usosAplicados > 0) tarefas.push(directus(headers, "PATCH", `/items/cupons_desconto/${cupom.id}`, { usos: cupom.usos + usosAplicados }));
    const resultadosTarefas = await Promise.all(tarefas);
    resultadosTarefas.forEach((r) => { if (!r.ok) context.log.warn("Gravação complementar falhou:", r.status); });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        inscricoes: criadas.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo, aguardandoVaga: Boolean(i.aguardando_vaga), pendenteAprovacao: Boolean(i.pendente_aprovacao), valor: i.valor })),
        cupom: codigoCupom ? { aplicado: usosAplicados > 0, mensagem: cupomInfo.mensagem || (usosAplicados > 0 ? "✅ Cupom aplicado." : "Cupom esgotado.") } : null,
      },
    };
  } catch (err) {
    context.log.error("Falha ao preparar a inscrição:", err);
    context.res = { status: 502, body: { erro: "Falha ao registrar a inscrição." } };
  }
};
