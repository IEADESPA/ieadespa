const crypto = require("node:crypto");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { gerarHashAssincrono, chaveTelefone, cifrarTelefone } = require("../src/lib/telefone");
const { avaliarJanela } = require("../src/lib/janela");
const { gravarInscricoesComTrava } = require("../src/lib/vagasEvento");
const { umaVezPorChave } = require("../src/lib/limiteLote");

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
 *     ou nulo); quem não cabe entra na lista de espera, como antes. Vagas e
 *     limite de usos do cupom passam pela TRAVA de `vagasEvento.js` (16/10/2026:
 *     "conta, depois grava" deixava 40 inscrições simultâneas ocuparem 20 vagas);
 *     evento sem limite e cupom sem limite seguem direto, sem trava;
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
  // Uma leitura só por evento de cada vez (uma rajada de inscrições não repete a mesma pergunta ao Directus dezenas de vezes).
  return umaVezPorChave(`ler-evento:${eventoId}`, async () => {
    const r = await directus(headers, "GET", `/items/eventos/${eventoId}?fields=id,title,aceita_inscricao,inscricoes_encerradas,inscricoes_ate,vagas_limite,requer_aprovacao,permite_inscricao_grupo,faixas_valor`);
    const valor = r.ok ? { ok: true, evento: r.data } : { ok: false, status: r.status };
    if (r.ok || r.status === 404 || r.status === 403) cacheEventos.set(eventoId, { em: Date.now(), valor });
    return valor;
  });
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

/**
 * Decide, com o que se sabe das vagas (`estado.confirmados`) e dos usos do cupom (`estado.usosCupom`), quem fica confirmado e quem vai para a lista de espera, e quem leva o
 * desconto. É PURA (a trava a chama de novo a cada tentativa, com a leitura nova). Devolve `{ registros, confirmadosNovos, usosNovos }`.
 */
function montarRegistros({ nomes, evento, eventoId, valorFaixa, cupom, contarVagas, pendenteAprovacao, telefone, telefoneHash, telefoneChave, email }, estado) {
  let confirmados = estado.confirmados;
  let usosRestantesCupom = cupom ? (cupom.limite_usos == null ? Infinity : Number(cupom.limite_usos) - estado.usosCupom) : 0;
  let confirmadosNovos = 0;
  let usosNovos = 0;
  const registros = nomes.map((nome) => {
    let aguardandoVaga = false;
    if (contarVagas) {
      aguardandoVaga = confirmados >= Number(evento.vagas_limite);
      if (!aguardandoVaga) { confirmados += 1; confirmadosNovos += 1; }
    }
    let valorFinal = valorFaixa;
    let cupomAplicado = null;
    if (cupom && usosRestantesCupom > 0) {
      valorFinal = aplicarDesconto(valorFaixa, cupom);
      cupomAplicado = cupom.codigo;
      usosRestantesCupom -= 1;
      usosNovos += 1;
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
  return { registros, confirmadosNovos, usosNovos };
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

  // `chaveTelefone` é nula nas mesmas condições do hash (menos de 8 dígitos); o hash scrypt só é calculado depois das recusas baratas, de forma assíncrona.
  const telefoneChave = chaveTelefone(telefone);
  if (!Number.isInteger(eventoId) || eventoId <= 0 || nomes.length === 0 || !telefoneChave) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes (evento, nome e telefone com pelo menos 8 dígitos)." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const lido = await lerEvento(headers, eventoId);
  if (!lido.ok) {
    // 404/403 = o evento não existe (ou não é público); qualquer outra falha é o Directus ocupado: "tente de novo", não "evento não encontrado".
    if (lido.status === 404 || lido.status === 403) context.res = { status: 404, body: { erro: "Evento não encontrado." } };
    else context.res = { status: 503, body: { erro: "Não foi possível conferir o evento agora. Aguarde alguns segundos e tente de novo." } };
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
    const [jaTem, cupomInfo] = await Promise.all([
      contarPorTelefone(headers, eventoId, telefoneChave),
      codigoCupom ? buscarCupom(headers, eventoId, codigoCupom) : Promise.resolve({ cupom: null, mensagem: null }),
    ]);
    if (jaTem + nomes.length > MAX_POR_TELEFONE) {
      context.res = { status: 400, body: { erro: `Este telefone já tem ${jaTem} inscrição(ões) neste evento; o limite é ${MAX_POR_TELEFONE}.` } };
      return;
    }

    const cupom = cupomInfo.cupom;
    const pendenteAprovacao = Boolean(evento.requer_aprovacao);
    const contarVagas = Boolean(evento.vagas_limite) && !pendenteAprovacao;
    const contarCupom = Boolean(cupom) && cupom.limite_usos != null;

    // O hash scrypt do telefone (assíncrono e com poucos ao mesmo tempo) só é calculado agora, com as recusas baratas já feitas.
    const telefoneHash = await gerarHashAssincrono(telefone);
    if (!telefoneHash) {
      context.res = { status: 400, body: { erro: "Parâmetros ausentes (evento, nome e telefone com pelo menos 8 dígitos)." } };
      return;
    }
    const montar = (estado) => montarRegistros({ nomes, evento, eventoId, valorFaixa, cupom, contarVagas, pendenteAprovacao, telefone, telefoneHash, telefoneChave, email }, estado);

    let criadas = null;
    let montagem = null;
    let usosDoCupom = null; // valor do contador `usos` do cupom depois desta inscrição

    if (contarVagas || contarCupom) {
      // Vagas ou limite de cupom em jogo: grava com a senha do livro do evento, para nunca passar do número com muita gente ao mesmo tempo.
      const r = await gravarInscricoesComTrava({
        directus: (caminho, init = {}) => fetch(`${DIRECTUS_URL}${caminho}`, { ...init, headers }),
        eventoId, cupomCodigo: contarCupom ? cupom.codigo : null, contarVagas, montar, log: (m) => context.log.warn(m),
      });
      if (r.erroHttp) {
        context.res = { status: r.erroHttp.status, headers: { "Content-Type": "application/json" }, body: r.erroHttp.body };
        return;
      }
      if (!r.semControle) {
        criadas = r.criadas;
        montagem = r.montagem;
        usosDoCupom = r.estado.usosCupom;
      }
    }

    if (!criadas) {
      // Sem limite nenhum — ou o livro de senhas ainda não existe no Directus (esquema não aplicado): grava do jeito de sempre, para nunca deixar de aceitar inscrição.
      const confirmados = contarVagas ? await contarConfirmados(headers, eventoId) : 0;
      montagem = montar({ confirmados, usosCupom: cupom ? cupom.usos : 0 });
      const criado = await directus(headers, "POST", "/items/inscricoes_eventos", montagem.registros);
      if (!criado.ok || !Array.isArray(criado.data)) {
        context.log.error("Falha ao criar inscrição:", criado.status);
        context.res = { status: 502, body: { erro: "Falha ao registrar a inscrição." } };
        return;
      }
      criadas = criado.data;
      usosDoCupom = cupom ? cupom.usos + montagem.usosNovos : null;
    }

    const tarefas = [];
    if (respostasBase.length > 0) {
      const respostas = criadas.flatMap((i) => respostasBase.map((r) => ({ inscricao: i.id, pergunta: r.pergunta, valor: r.valor })));
      tarefas.push(directus(headers, "POST", "/items/respostas_inscricao", respostas));
    }
    const usosAplicados = montagem.usosNovos;
    // O contador `usos` é só o número que o painel mostra: o limite de verdade é a contagem das inscrições com o cupom, feita dentro da trava.
    if (cupom && usosAplicados > 0) tarefas.push(directus(headers, "PATCH", `/items/cupons_desconto/${cupom.id}`, { usos: usosDoCupom }));
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

module.exports.montarRegistros = montarRegistros; // para o teste de unidade
