"use strict";
/*
 * TRAVA DE VAGAS E DE CUPOM DAS INSCRIÇÕES EM EVENTO (16/10/2026). Medido no Directus local: com 20 vagas e 40 inscrições ao mesmo tempo, as 40 saíam CONFIRMADAS (a conta era
 * "conta os confirmados, depois grava", sem trava: duas pessoas viam a mesma última vaga livre). O mesmo vale para o limite de usos do cupom (lia `usos` e gravava `usos + n`).
 *
 * É a mesma técnica da trava de pedidos das camisetas (ver `limiteLote.js`, cujo cabeçalho explica por que ela é exata): a inscrição que depende de um limite grava, NA MESMA transação,
 * uma linha no "livro de senhas" do evento (`evento_controle`) com a chave única "<evento>:<número>", onde o número é "a última senha do evento + 1":
 *   1. lê a última senha (h);  2. DEPOIS lê o que conta (confirmados do evento e usos do cupom);  3. decide quem fica confirmado e quem vai para a lista de espera, e quem leva o desconto;
 *   4. grava as inscrições pedindo a senha h+1. Se outra inscrição gravou a h+1 no meio do caminho, o banco recusa a nossa (chave única), nada é gravado, e a leitura é refeita.
 * Diferente do pedido de camiseta, aqui ninguém é recusado por falta de vaga: quem não cabe entra na lista de espera (como sempre foi) e o cupom esgotado só deixa de dar desconto.
 * Estabilidade: as inscrições de um mesmo evento entram numa fila de uma por vez por instância, com recusa imediata (503 "tente de novo") quando não daria tempo, e a instância lembra por
 * poucos segundos a última senha e as contagens (a idade conta desde a última leitura REAL) para pular duas leituras por inscrição quando está gravando em sequência.
 */
const { enfileirar } = require("./limiteLote");

const MAX_TENTATIVAS_SENHA = 20;
const VALIDADE_MEMORIA_MS = 3 * 1000;
const pausar = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- o que esta instância sabe do evento (validade curta; a idade conta desde a última leitura real) -----
// A chave é "<evento>|<cupom>|<conta vagas>": a contagem de usos vale para UM cupom e a de vagas só se o evento conta vagas, então estados diferentes nunca se misturam. A última senha é
// do evento todo; se alguém (com outro cupom, ou sem) gravou a senha seguinte, a nossa já estará tomada e o banco recusa: aí a leitura é refeita.
const estados = new Map(); // chave -> { em, ultima, estado: { confirmados, usosCupom } }
const chaveDoEstado = (eventoId, cupomCodigo, contarVagas) => `${eventoId}|${cupomCodigo || ""}|${contarVagas ? 1 : 0}`;
function lembrarEstado(chave, ultima, estado, leituraEm = Date.now()) { estados.set(String(chave), { em: leituraEm, ultima, estado }); }
function esquecerEstado(chave) { estados.delete(String(chave)); }
function estadoRecente(chave, agora = Date.now()) {
  const g = estados.get(String(chave));
  return g && agora - g.em <= VALIDADE_MEMORIA_MS ? g : null;
}
function esquecerMemoria() { estados.clear(); }

/**
 * O laço da senha. As operações vêm de fora (o teste de unidade troca por um livro de mentira):
 *  - `lerUltimaSenha()` → número (0 se o livro do evento está vazio);  - `lerEstado()` → { confirmados, usosCupom };
 *  - `montar(estado)` → { registros, confirmadosNovos, usosNovos } (função PURA: decide lista de espera e desconto com o estado lido);
 *  - `gravar(registros, numero)` → { ok: true, ... } | { conflito: true } | { falhou: true, ... }.
 * `estadoInicial` ({ ultima, estado, em }): o que a instância já sabe de poucos segundos atrás; usado só na PRIMEIRA tentativa.
 * Resultado: `{ ok: true, ultima, estado, leituraEm, resultado, montagem }` | `{ ok: false, ocupado: true }` | `{ ok: false, falhou }`.
 */
async function reservarEGravarEvento({ lerUltimaSenha, lerEstado, montar, gravar, estadoInicial = null, maxTentativas = MAX_TENTATIVAS_SENHA, esperar = pausar, aleatorio = Math.random }) {
  for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
    let ultima;
    let estado;
    let leituraEm;
    if (tentativa === 0 && estadoInicial) {
      ({ ultima, estado, em: leituraEm } = estadoInicial);
    } else {
      ultima = await lerUltimaSenha();
      estado = await lerEstado(); // SEMPRE depois da última senha (é isso que torna a conta exata)
      leituraEm = Date.now();
    }
    const montagem = montar(estado);
    const r = await gravar(montagem.registros, ultima + 1);
    if (r.ok) {
      return {
        ok: true, ultima: ultima + 1, leituraEm, resultado: r, montagem,
        estado: { confirmados: estado.confirmados + montagem.confirmadosNovos, usosCupom: estado.usosCupom + montagem.usosNovos },
      };
    }
    if (!r.conflito) return { ok: false, falhou: r };
    await esperar(Math.floor(aleatorio() * Math.min(400, 40 * (tentativa + 1))));
  }
  return { ok: false, ocupado: true };
}

// ----- as chamadas ao Directus -----
/** Mesmo critério do painel de inscritos: aguardando_vaga falso OU nulo conta como confirmado. */
const FILTRO_CONFIRMADOS = (eventoId) => `filter[_and][0][evento][_eq]=${eventoId}&filter[_and][1][_or][0][aguardando_vaga][_eq]=false&filter[_and][1][_or][1][aguardando_vaga][_null]=true`;

/**
 * Uma LEITURA que falhou (Directus ocupado: 5xx, 429, conexão caída) é repetida até 3 vezes com uma espera curta — ler de novo é sempre seguro. A GRAVAÇÃO nunca é repetida às cegas: um 5xx
 * pode ter vindo depois de o banco gravar, e repetir criaria a inscrição em dobro. O esquema ausente (`semEsquema`) não se repete.
 */
async function lerComRepeticao(fazer, { tentativas = 3, esperar = pausar, aleatorio = Math.random } = {}) {
  let erro;
  for (let i = 0; i < tentativas; i += 1) {
    try { return await fazer(); } catch (e) {
      if (e && e.semEsquema) throw e;
      erro = e;
      if (i < tentativas - 1) await esperar(150 * (i + 1) + Math.floor(aleatorio() * 100));
    }
  }
  throw erro;
}

function operacoesDoEvento(directus, eventoId, { cupomCodigo = null, contarVagas = true, repeticao = {} } = {}) {
  const contar = (consulta, o_que) => lerComRepeticao(async () => {
    const r = await directus(`/items/inscricoes_eventos?aggregate[count]=id&${consulta}`);
    if (!r.ok) throw new Error(`falha ao contar ${o_que} (${r.status})`);
    return Number(((await r.json()).data || [])[0]?.count?.id ?? 0);
  }, repeticao);
  return {
    lerUltimaSenha: () => lerComRepeticao(async () => {
      const r = await directus(`/items/evento_controle?filter[evento][_eq]=${eventoId}&sort=-n&limit=1&fields=n`);
      // O Directus responde 403 tanto para "sem permissão" quanto para "coleção que não existe": com o token de administrador só pode ser o esquema ainda não aplicado.
      if (r.status === 403 || r.status === 404) { const e = new Error(`o livro de senhas do evento não existe neste Directus (${r.status})`); e.semEsquema = true; throw e; }
      if (!r.ok) throw new Error(`falha ao ler o livro de senhas do evento (${r.status})`);
      const linhas = (await r.json()).data || [];
      return linhas.length ? Number(linhas[0].n) || 0 : 0;
    }, repeticao),
    async lerEstado() {
      const [confirmados, usosCupom] = await Promise.all([
        contarVagas ? contar(FILTRO_CONFIRMADOS(eventoId), "as vagas") : Promise.resolve(0),
        cupomCodigo ? contar(`filter[evento][_eq]=${eventoId}&filter[cupom_usado][_eq]=${encodeURIComponent(cupomCodigo)}`, "os usos do cupom") : Promise.resolve(0),
      ]);
      return { confirmados, usosCupom };
    },
  };
}

/** Lê a resposta da gravação em lote das inscrições: ok (com a lista criada), conflito de senha (chave única) ou falha. */
async function classificarGravacaoLote(res) {
  if (res.ok) return { ok: true, data: (await res.json()).data, status: res.status };
  const texto = await res.text().catch(() => "");
  let corpo = null;
  try { corpo = JSON.parse(texto); } catch { /* não é JSON */ }
  const erros = (corpo && corpo.errors) || [];
  if (res.status === 400 && erros.some((e) => (e.extensions && e.extensions.code) === "RECORD_NOT_UNIQUE")) return { conflito: true };
  return { falhou: true, status: res.status, texto: texto.slice(0, 300) };
}

const MENSAGEM_OCUPADO = "Muita gente se inscrevendo ao mesmo tempo. Aguarde alguns segundos e toque no botão de enviar de novo.";

/**
 * Grava as inscrições respeitando vagas e cupom. `montar(estado)` é da função de inscrição (decide lista de espera e desconto). Devolve
 * `{ criadas, montagem, estado }`, ou `{ erroHttp: { status, body } }`, ou `{ semControle: true }` (o Directus não aceitou a senha — o esquema não existe — e a função de inscrição
 * grava do jeito antigo, para nunca deixar de aceitar inscrição por causa disto).
 */
async function gravarInscricoesComTrava({ directus, eventoId, cupomCodigo = null, contarVagas = true, montar, log = () => {}, opcoesFila = {}, repeticao = {} }) {
  const ops = operacoesDoEvento(directus, eventoId, { cupomCodigo, contarVagas, repeticao });
  const chave = chaveDoEstado(eventoId, cupomCodigo, contarVagas);
  let fila;
  try {
    fila = await enfileirar(`evento:${eventoId}`, () => reservarEGravarEvento({
      ...ops, montar, estadoInicial: estadoRecente(chave),
      gravar: async (registros, numero) => {
        const comSenha = registros.map((r, i) => (i === 0 ? { ...r, controle: [{ evento: eventoId, n: numero, chave: `${eventoId}:${numero}`, pessoas: registros.length }] } : r));
        return classificarGravacaoLote(await directus("/items/inscricoes_eventos", { method: "POST", body: JSON.stringify(comSenha) }));
      },
    }), opcoesFila);
  } catch (e) {
    if (e && e.semEsquema) { log(`${e.message}: gravando sem trava (aplique site/scripts/directus-vagas-esquema.mjs)`); return { semControle: true }; }
    throw e;
  }
  if (fila.lotado) {
    log(`fila do evento ${eventoId} cheia (${fila.motivo})`);
    return { erroHttp: { status: 503, body: { erro: MENSAGEM_OCUPADO, motivo: "ocupado" } } };
  }
  const r = fila.valor;
  if (r.ok) {
    lembrarEstado(chave, r.ultima, r.estado, r.leituraEm);
    return { criadas: r.resultado.data, montagem: r.montagem, estado: r.estado };
  }
  esquecerEstado(chave);
  if (r.ocupado) {
    log(`senhas disputadas demais no evento ${eventoId} (tentativas esgotadas)`);
    return { erroHttp: { status: 503, body: { erro: MENSAGEM_OCUPADO, motivo: "ocupado" } } };
  }
  if (r.falhou && r.falhou.status === 403) { log(`o Directus não aceitou a senha do evento ${eventoId} (esquema ausente?): gravando sem trava`); return { semControle: true }; }
  log(`falha ao gravar a inscrição com senha: ${r.falhou && r.falhou.status} ${r.falhou && r.falhou.texto}`);
  return { erroHttp: { status: 502, body: { erro: "Falha ao registrar a inscrição." } } };
}

module.exports = {
  MAX_TENTATIVAS_SENHA, VALIDADE_MEMORIA_MS, FILTRO_CONFIRMADOS, MENSAGEM_OCUPADO,
  chaveDoEstado, lembrarEstado, esquecerEstado, estadoRecente, esquecerMemoria,
  reservarEGravarEvento, operacoesDoEvento, classificarGravacaoLote, gravarInscricoesComTrava, lerComRepeticao,
};
