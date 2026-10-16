"use strict";
/*
 * LIMITE DE PEDIDOS (16/10/2026). Pedido do responsável: "tenho 140 camisetas, não pode ter 141 pedidos", por total ou por tamanho, e o site
 * aguentando a rajada de quando o link cai no grupo (em 5 minutos acaba).
 *
 * O limite vale para as peças dos LOTES ABERTOS da campanha (normalmente um só: o lote em que os pedidos novos caem; fechou o lote, o próximo começa do zero). Conta TODAS as
 * peças desses pedidos (site, balcão, separados, retirados, pagos ou não): pedido apagado libera a vaga na hora. Configuração na campanha: `limite_total` (peças, todos os
 * tamanhos) e `limites_tamanho` ({"M": 40}). Por que "todos os lotes abertos" e não "o lote": se não há lote aberto (acabou de fechar), uma rajada pode criar mais de um lote
 * aberto ao mesmo tempo (aconteceu em 06/10/2026, seis lotes) e cada um teria o seu limite; contando os abertos juntos, o limite vale para a campanha mesmo assim.
 *
 * COMO NUNCA PASSA DO LIMITE, mesmo com centenas de pedidos ao mesmo tempo. O Directus não tem transação entre chamadas ("lê a soma, depois grava" deixaria dois pedidos
 * passarem juntos pela última vaga), então o pedido grava, NA MESMA transação do pedido, uma linha no "livro de senhas" da campanha (`camiseta_controle`) com a chave única
 * "<campanha>:<número>", onde o número é "o último do livro + 1":
 *   1. lê o último número do livro (h);  2. DEPOIS lê a soma das peças dos lotes abertos;  3. confere o limite com essa soma;  4. grava o pedido pedindo a senha h+1.
 * Se alguém gravou a senha h+1 no meio do caminho, o banco recusa a nossa (chave única) e nada é gravado: lemos de novo e conferimos de novo. Por que é exato: a ordem
 * "último número, depois soma" garante que a soma já inclui TODO pedido com senha até h (foi gravado na mesma transação da senha); e só um pedido consegue a senha h+1.
 * Logo, quem grava a senha h+1 viu todos os anteriores; ninguém grava duas vezes a mesma vaga. O livro nunca é apagado junto com o pedido (a senha não é reaproveitada).
 *
 * ESTABILIDADE. O Directus (plano B1, 1 núcleo) grava cerca de 1,5 pedido por segundo e cai se receber muitas gravações juntas (06/10/2026: 98 % de CPU). Por isso, por
 * instância, os pedidos de uma mesma campanha entram numa FILA de um por vez (paralelo não ajuda e só gera disputa por senha); quem não seria atendido a tempo (limite abaixo)
 * recebe 503 "tente de novo" na hora, em vez de segurar a conexão até o Azure derrubá-la; e, quando a campanha esgota, as chamadas seguintes são recusadas pela memória, sem ir ao Directus.
 */

const QTD_MAXIMA_POR_LINHA = 99;
const MAX_ITENS = 20;
const ESPERA_MAX_NA_FILA_MS = 25 * 1000; // o proxy do Static Web Apps derruba a chamada em ~45 s: 25 s de espera deixam folga para gravar
const MAX_NA_FILA = 200; // só uma trava de memória: quem não seria atendido a tempo já é recusado pela previsão
const MAX_TENTATIVAS_SENHA = 12;
const VALIDADE_MEMORIA_MS = 3 * 1000;

function inteiroNaoNegativo(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Lê os limites da campanha. Vazio/ausente = sem limite. Só números inteiros >= 0; tamanho com valor inválido é ignorado (sem limite próprio). */
function limitesDoGrupo(grupo) {
  const g = grupo || {};
  const total = inteiroNaoNegativo(g.limite_total);
  let bruto = g.limites_tamanho;
  if (typeof bruto === "string") { try { bruto = JSON.parse(bruto); } catch { bruto = null; } }
  const porTamanho = {};
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    for (const [tamanho, valor] of Object.entries(bruto)) {
      const n = inteiroNaoNegativo(valor);
      if (n !== null && String(tamanho).trim()) porTamanho[String(tamanho).trim()] = n;
    }
  }
  return { total, porTamanho };
}

const temLimite = (limites) => limites.total !== null || Object.keys(limites.porTamanho).length > 0;

/**
 * Confere e normaliza os itens do pedido. Quantidade tem de ser inteira de 1 a 99 (linha com 0 é descartada): quantidade negativa ou quebrada, num pedido com limite,
 * ABRIRIA vaga para os outros. Com limite ligado e lista de tamanhos na campanha, o tamanho tem de ser um da lista (senão daria para inventar um tamanho e escapar do limite dele).
 */
function normalizarItens(itensBrutos, { tamanhosDaCampanha = null, exigirTamanhoDaLista = false } = {}) {
  const lista = Array.isArray(itensBrutos) ? itensBrutos.slice(0, MAX_ITENS) : [];
  const itens = [];
  const porTamanho = {};
  let total = 0;
  for (const bruto of lista) {
    const item = bruto && typeof bruto === "object" ? bruto : {};
    const q = typeof item.quantidade === "number" ? item.quantidade : typeof item.quantidade === "string" && item.quantidade.trim() !== "" ? Number(item.quantidade) : 0;
    if (!Number.isInteger(q) || q < 0 || q > QTD_MAXIMA_POR_LINHA) return { ok: false, erro: "Quantidade inválida." };
    if (q === 0) continue;
    const tamanho = item.tamanho ? String(item.tamanho).trim().slice(0, 40) || null : null;
    const modelo = item.modelo ? String(item.modelo).trim().slice(0, 60) || null : null;
    if (exigirTamanhoDaLista && Array.isArray(tamanhosDaCampanha) && tamanhosDaCampanha.length > 0 && !tamanhosDaCampanha.includes(tamanho)) {
      return { ok: false, erro: "Escolha um dos tamanhos da lista." };
    }
    itens.push({ tamanho, modelo, quantidade: q });
    const chave = tamanho ?? "";
    porTamanho[chave] = (porTamanho[chave] || 0) + q;
    total += q;
  }
  if (itens.length === 0) return { ok: false, erro: "Parâmetros ausentes." };
  return { ok: true, itens, total, porTamanho };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** `uso` = o que o lote já tem ({ total, porTamanho }); `pedido` = o que este pedido quer ({ total, porTamanho }). */
function avaliar(limites, uso, pedido) {
  if (limites.total !== null) {
    const restam = Math.max(0, limites.total - uso.total);
    if (pedido.total > restam) {
      return restam === 0
        ? { ok: false, motivo: "esgotado", restam, mensagem: "Os pedidos esgotaram: não há mais peças disponíveis nesta campanha." }
        : { ok: false, motivo: "quantidade", restam, mensagem: `Restam apenas ${plural(restam, "peça", "peças")}. Diminua a quantidade do pedido.` };
    }
  }
  for (const [tamanho, q] of Object.entries(pedido.porTamanho)) {
    const limite = limites.porTamanho[tamanho];
    if (limite === undefined) continue;
    const restam = Math.max(0, limite - (uso.porTamanho[tamanho] || 0));
    if (q > restam) {
      return restam === 0
        ? { ok: false, motivo: "tamanho_esgotado", tamanho, restam, mensagem: `O tamanho ${tamanho} esgotou. Escolha outro tamanho.` }
        : { ok: false, motivo: "tamanho_quantidade", tamanho, restam, mensagem: `Do tamanho ${tamanho} restam apenas ${plural(restam, "peça", "peças")}. Diminua a quantidade.` };
    }
  }
  return { ok: true };
}

/** O que a página pública precisa saber: tudo esgotado? quais tamanhos esgotaram? (sem números: a página só mostra "esgotado"). */
function disponibilidade(limites, uso, tamanhosDaCampanha) {
  const tamanhosEsgotados = Object.keys(limites.porTamanho).filter((t) => (uso.porTamanho[t] || 0) >= limites.porTamanho[t]);
  let esgotado = limites.total !== null && uso.total >= limites.total;
  const lista = Array.isArray(tamanhosDaCampanha) ? tamanhosDaCampanha : [];
  if (!esgotado && lista.length > 0 && lista.every((t) => tamanhosEsgotados.includes(t))) esgotado = true;
  return { esgotado, tamanhosEsgotados };
}

/** Soma o que o lote já tem a partir da resposta do Directus (`aggregate[sum]=quantidade&groupBy[]=tamanho`; o Directus devolve a soma como texto). */
function usoDoAgregado(linhas) {
  const uso = { total: 0, porTamanho: {} };
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    const n = Number(linha && linha.sum && linha.sum.quantidade) || 0;
    const chave = linha && linha.tamanho ? String(linha.tamanho) : "";
    uso.porTamanho[chave] = (uso.porTamanho[chave] || 0) + n;
    uso.total += n;
  }
  return uso;
}

// ----- fila por campanha (por instância) -----
const filas = new Map();
const duracoes = new Map(); // chave -> média móvel (ms) do tempo que cada pedido leva no Directus, para prever a espera de quem chega

/**
 * Executa `tarefa` depois das anteriores da mesma `chave`, uma de cada vez. Devolve `{ valor }`, ou `{ lotado: true, motivo }` quando NÃO vai dar tempo: a fila está cheia, a espera
 * prevista (pedidos na frente × tempo médio de cada um) passa do teto, ou a espera real passou do teto. Nesses casos a tarefa NÃO roda: nenhum trabalho é gasto no Directus com quem
 * já seria desistência, e a pessoa fica sabendo na hora, em vez de esperar o teto inteiro para falhar. Erro da tarefa propaga para quem chamou, sem travar a fila.
 */
function enfileirar(chave, tarefa, { maxNaFila = MAX_NA_FILA, esperaMaxMs = ESPERA_MAX_NA_FILA_MS, duracaoInicialMs = 600, agora = Date.now } = {}) {
  let fila = filas.get(chave);
  if (!fila) { fila = { cauda: Promise.resolve(), pendentes: 0 }; filas.set(chave, fila); }
  if (fila.pendentes >= maxNaFila) return Promise.resolve({ lotado: true, motivo: "fila" });
  const media = duracoes.has(chave) ? duracoes.get(chave) : duracaoInicialMs;
  if (fila.pendentes * media > esperaMaxMs) return Promise.resolve({ lotado: true, motivo: "previsao" });
  fila.pendentes += 1;
  const entrou = agora();
  const minha = fila.cauda.then(async () => {
    if (agora() - entrou > esperaMaxMs) return { lotado: true, motivo: "espera" };
    const comecou = agora();
    try {
      return { valor: await tarefa() };
    } finally {
      const gasto = Math.max(0, agora() - comecou);
      duracoes.set(chave, 0.7 * (duracoes.has(chave) ? duracoes.get(chave) : duracaoInicialMs) + 0.3 * gasto);
    }
  });
  fila.cauda = minha.then(() => undefined, () => undefined);
  const terminar = () => { fila.pendentes -= 1; if (fila.pendentes === 0 && filas.get(chave) === fila) filas.delete(chave); };
  minha.then(terminar, terminar);
  return minha;
}

// ----- o que esta instância sabe da campanha (validade curta) -----
// Guarda o último número do livro e as peças dos lotes abertos como esta instância os viu na ÚLTIMA LEITURA REAL ao Directus (`em`), já somando os pedidos que ela mesma gravou depois.
// Serve a duas coisas: (1) recusar sem ir ao Directus quando já se sabe que não cabe (a memória só recusa); (2) pular as duas leituras do pedido seguinte quando a instância está
// gravando em sequência — se outra instância (ou a venda de balcão) gravou no meio, a senha que esta tentar já estará tomada e o banco recusa: aí lê de novo. A idade conta desde a
// última leitura real (gravar não "rejuvenesce" o estado), então em no máximo VALIDADE_MEMORIA_MS tudo é lido de novo e mudanças manuais (apagar ou acrescentar peças no painel) entram na conta.
const estados = new Map(); // grupoId -> { em, ultima, uso }

function lembrarEstado(grupoId, ultima, uso, leituraEm = Date.now()) { estados.set(String(grupoId), { em: leituraEm, ultima, uso }); }
function esquecerEstado(grupoId) { estados.delete(String(grupoId)); }
function estadoRecente(grupoId, agora = Date.now()) {
  const g = estados.get(String(grupoId));
  return g && agora - g.em <= VALIDADE_MEMORIA_MS ? g : null;
}
/** Recusa pela memória se, com o que a instância viu há poucos segundos, o pedido já não cabe. */
function recusaPelaMemoria(limites, grupoId, pedido, agora = Date.now()) {
  const g = estadoRecente(grupoId, agora);
  if (!g) return null;
  const v = avaliar(limites, g.uso, pedido);
  return v.ok ? null : v;
}
function esquecerMemoria() { estados.clear(); }

// ----- "uma vez só" por chave (por instância): quem chega enquanto a mesma coisa já está sendo feita espera o mesmo resultado -----
const emAndamento = new Map();
function umaVezPorChave(chave, fazer) {
  let promessa = emAndamento.get(chave);
  if (!promessa) {
    promessa = Promise.resolve().then(fazer).finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, promessa);
  }
  return promessa;
}

const pausar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * O laço da senha (descrito no começo do arquivo). As operações vêm de fora (o teste de unidade troca por um livro de mentira):
 *  - `lerUltimaSenha()` → número (0 se o livro da campanha está vazio);  - `lerUso()` → { total, porTamanho };
 *  - `gravar(numero)` → { ok: true, ... } | { conflito: true } | { falhou: true, ... }.
 * `estadoInicial` ({ ultima, uso, em }, opcional): o que a instância já sabe de poucos segundos atrás; usado só na PRIMEIRA tentativa (pula as duas leituras). Se alguém gravou a senha
 * seguinte no meio, o banco recusa a nossa e as tentativas seguintes leem tudo de novo.
 * Resultado: `{ ok: true, uso, ultima, leituraEm }` (gravou) | `{ ok: false, recusa, uso, ultima, leituraEm }` (não cabe) | `{ ok: false, ocupado: true }` (disputa demais) | `{ ok: false, falhou }`.
 * `leituraEm` é a hora da última leitura REAL (a do estado inicial, se foi ele que se usou).
 */
async function reservarEGravar({ limites, pedido, lerUltimaSenha, lerUso, gravar, estadoInicial = null, maxTentativas = MAX_TENTATIVAS_SENHA, esperar = pausar, aleatorio = Math.random }) {
  for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
    let ultima;
    let uso;
    let leituraEm;
    if (tentativa === 0 && estadoInicial) {
      ({ ultima, uso, em: leituraEm } = estadoInicial);
    } else {
      ultima = await lerUltimaSenha();
      uso = await lerUso(); // SEMPRE depois da última senha (é isso que torna a conferência exata)
      leituraEm = Date.now();
    }
    const veredito = avaliar(limites, uso, pedido);
    if (!veredito.ok) return { ok: false, recusa: veredito, uso, ultima, leituraEm };
    const r = await gravar(ultima + 1);
    if (r.ok) return { ok: true, ultima: ultima + 1, uso: { total: uso.total + pedido.total, porTamanho: somarPorTamanho(uso.porTamanho, pedido.porTamanho) }, leituraEm, resultado: r };
    if (!r.conflito) return { ok: false, falhou: r };
    await esperar(Math.floor(aleatorio() * Math.min(400, 40 * (tentativa + 1))));
  }
  return { ok: false, ocupado: true };
}

function somarPorTamanho(a, b) {
  const r = { ...a };
  for (const [t, q] of Object.entries(b)) r[t] = (r[t] || 0) + q;
  return r;
}

// ----- as chamadas ao Directus -----
// `directus(caminho, init)` devolve uma Response (cada função da API passa o seu token).
/** O filtro das peças que contam: pedidos dos lotes ABERTOS da campanha (pedido sem lote, o avulso, e pedido de lote fechado não contam). */
const FILTRO_PECAS_DOS_LOTES_ABERTOS = (grupoId) => `filter[pedido][lote][grupo][_eq]=${grupoId}&filter[pedido][lote][status][_eq]=aberto`;

function operacoesDaCampanha(directus, grupoId) {
  return {
    async lerUltimaSenha() {
      const r = await directus(`/items/camiseta_controle?filter[grupo][_eq]=${grupoId}&sort=-n&limit=1&fields=n`);
      if (!r.ok) throw new Error(`falha ao ler o livro de senhas (${r.status})`);
      const linhas = (await r.json()).data || [];
      return linhas.length ? Number(linhas[0].n) || 0 : 0;
    },
    async lerUso() {
      const r = await directus(`/items/camiseta_itens_pedido?${FILTRO_PECAS_DOS_LOTES_ABERTOS(grupoId)}&aggregate[sum]=quantidade&groupBy[]=tamanho`);
      if (!r.ok) throw new Error(`falha ao somar as peças dos lotes abertos (${r.status})`);
      return usoDoAgregado((await r.json()).data);
    },
  };
}

/** Lê a resposta da gravação do pedido: ok, conflito de senha (chave única) ou falha. */
async function classificarGravacao(res) {
  if (res.ok) return { ok: true, pedidoId: (await res.json()).data.id, status: res.status };
  const texto = await res.text().catch(() => "");
  let corpo = null;
  try { corpo = JSON.parse(texto); } catch { /* não é JSON */ }
  const erros = (corpo && corpo.errors) || [];
  const conflito = res.status === 400 && erros.some((e) => (e.extensions && e.extensions.code) === "RECORD_NOT_UNIQUE");
  if (conflito) return { conflito: true };
  return { falhou: true, status: res.status, texto: texto.slice(0, 300) };
}

/**
 * Cria o pedido respeitando o limite da campanha. `corpoPedido` é o corpo normal do POST /items/camiseta_pedidos; a senha é acrescentada aqui.
 * Devolve `{ pedidoId }` ou `{ erroHttp: { status, body } }` (o corpo já no formato que a API responde).
 */
async function criarPedidoComLimite({ directus, grupoId, limites, pedido, corpoPedido, log = () => {}, opcoesFila = {} }) {
  const chave = `campanha:${grupoId}`;
  const pelaMemoria = recusaPelaMemoria(limites, grupoId, pedido);
  if (pelaMemoria) return { erroHttp: erroDaRecusa(pelaMemoria) };

  const ops = operacoesDaCampanha(directus, grupoId);
  // o estado é conferido de novo QUANDO a vez chega (não ao entrar na fila): o pedido da frente acabou de atualizá-lo
  const fila = await enfileirar(chave, () => reservarEGravar({
    limites, pedido, ...ops, estadoInicial: estadoRecente(grupoId),
    gravar: async (numero) => classificarGravacao(await directus("/items/camiseta_pedidos", {
      method: "POST",
      body: JSON.stringify({ ...corpoPedido, controle: [{ grupo: grupoId, n: numero, chave: `${grupoId}:${numero}`, pecas: pedido.total }] }),
    })),
  }), opcoesFila);
  if (fila.lotado) {
    log(`fila da campanha ${grupoId} cheia (${fila.motivo})`);
    return { erroHttp: { status: 503, body: { erro: "Muita gente pedindo ao mesmo tempo. Aguarde alguns segundos e toque em “Fazer pedido” de novo.", motivo: "ocupado" } } };
  }
  const r = fila.valor;
  if (r.ok) { lembrarEstado(grupoId, r.ultima, r.uso, r.leituraEm); return { pedidoId: r.resultado.pedidoId }; }
  if (r.recusa) { lembrarEstado(grupoId, r.ultima, r.uso, r.leituraEm); return { erroHttp: erroDaRecusa(r.recusa) }; }
  esquecerEstado(grupoId); // disputa demais ou falha: na dúvida, a próxima vez lê tudo de novo
  if (r.ocupado) log(`senhas disputadas demais na campanha ${grupoId} (tentativas esgotadas)`);
  if (r.ocupado) return { erroHttp: { status: 503, body: { erro: "Muita gente pedindo ao mesmo tempo. Aguarde alguns segundos e toque em “Fazer pedido” de novo.", motivo: "ocupado" } } };
  if (r.falhou && (r.falhou.status === 401 || r.falhou.status === 403)) return { erroHttp: { status: r.falhou.status, body: { erro: "Sem permissão para gravar o pedido.", motivo: "permissao" } } };
  log(`falha ao gravar o pedido com senha: ${r.falhou && r.falhou.status} ${r.falhou && r.falhou.texto}`);
  return { erroHttp: { status: 502, body: { erro: "Falha ao criar pedido." } } };
}

function erroDaRecusa(v) {
  return { status: 409, body: { erro: v.mensagem, motivo: v.motivo, ...(v.tamanho ? { tamanho: v.tamanho } : {}), restam: v.restam } };
}

module.exports = {
  QTD_MAXIMA_POR_LINHA, ESPERA_MAX_NA_FILA_MS, MAX_NA_FILA, MAX_TENTATIVAS_SENHA, VALIDADE_MEMORIA_MS,
  limitesDoGrupo, temLimite, normalizarItens, avaliar, disponibilidade, usoDoAgregado,
  enfileirar, lembrarEstado, estadoRecente, recusaPelaMemoria, esquecerMemoria, umaVezPorChave,
  reservarEGravar, operacoesDaCampanha, FILTRO_PECAS_DOS_LOTES_ABERTOS, classificarGravacao, criarPedidoComLimite, erroDaRecusa,
};
