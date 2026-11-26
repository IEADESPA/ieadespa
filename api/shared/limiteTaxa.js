// shared/limiteTaxa.js (Trava 6-B)
// Limite de requisições por origem, em memória, para rota ANÔNIMA que
// consulta o banco (a verificação pública de certificado, v6.9). É uma
// contenção por instância das Functions — não um limite global: com várias
// instâncias, cada uma conta a sua parte. O que ela garante é que uma única
// origem martelando a rota não acorda o banco serverless a cada requisição
// nem consome o pool à toa; um limite global de verdade exige borda paga
// (Front Door/WAF), registrado no README como decisão.
//
// A origem é guardada só como hash truncado do IP (nunca o IP em claro), e a
// tabela se limpa sozinha (janelas vencidas saem na próxima passada).
const crypto = require("crypto");
const net = require("net");

function criarLimitador({ janelaMs = 60000, maximo = 30, maxChaves = 5000 } = {}) {
  const contadores = new Map(); // chave -> { inicio, total }

  function limpar(agora) {
    for (const [chave, c] of contadores) if (agora - c.inicio >= janelaMs) contadores.delete(chave);
  }

  // Devolve { permitido, restante, retryAposSegundos }.
  function registrar(chave, agora = Date.now()) {
    if (contadores.size > maxChaves) limpar(agora);
    let c = contadores.get(chave);
    if (!c || agora - c.inicio >= janelaMs) {
      c = { inicio: agora, total: 0 };
      contadores.set(chave, c);
    }
    c.total++;
    if (c.total > maximo) {
      return { permitido: false, restante: 0, retryAposSegundos: Math.max(1, Math.ceil((c.inicio + janelaMs - agora) / 1000)) };
    }
    return { permitido: true, restante: maximo - c.total, retryAposSegundos: 0 };
  }

  return { registrar, _tamanho: () => contadores.size };
}

// IP do cliente atrás do proxy do Static Web Apps/Functions. Sem cabeçalho
// conhecido, todas as requisições caem numa chave só ("desconhecida") — o
// limite fica mais apertado, nunca mais frouxo.
// v7.5 (revisão de segurança, medido no Azure em 02/10/2026): o x-azure-clientip e o x-client-ip chegam EXATAMENTE como o cliente os escreveu, e no
// x-forwarded-for só o PENÚLTIMO valor (o último é o proxy do Azure) é confiável. Antes a chave saía do primeiro valor — quem trocasse esse valor a cada
// requisição nunca batia no limite. Ver shared/origemConexao.js.
function chaveDeOrigem(req) {
  const ip = require("./origemConexao").ipDoCliente((req && req.headers) || {}, { apenasPublico: false }) || "desconhecida";
  return resumir(ip);
}
const resumir = (texto) => crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);

// Os 8 grupos de um IPv6 (com "::" e com IPv4 no fim, como "::ffff:1.2.3.4"), em hexadecimal sem zeros à esquerda. null se não der para ler.
function gruposIpv6(ip) {
  let s = String(ip).toLowerCase();
  const zona = s.indexOf("%");
  if (zona >= 0) s = s.slice(0, zona);
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = s.slice(0, v4.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const partes = s.split("::");
  if (partes.length > 2) return null;
  const cabeca = partes[0] ? partes[0].split(":") : [];
  const cauda = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const faltam = 8 - cabeca.length - cauda.length;
  if (partes.length === 1 ? faltam !== 0 : faltam < 1) return null;
  const grupos = [...cabeca, ...Array(partes.length === 2 ? faltam : 0).fill("0"), ...cauda];
  if (grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.map((g) => parseInt(g, 16).toString(16));
}

// A REDE de onde vem o pedido: o IPv4 inteiro; no IPv6, a rede /64 (a parte que o provedor entrega a um cliente; os 64 bits de baixo são do aparelho).
// IPv4 dentro de IPv6 (::ffff:a.b.c.d) conta como o próprio IPv4. Sem endereço legível: uma chave só ("desconhecida"), como em chaveDeOrigem. Também só
// o hash truncado.
function chaveDeRede(req) {
  const ip = require("./origemConexao").ipDoCliente((req && req.headers) || {}, { apenasPublico: false });
  if (!ip) return resumir("desconhecida");
  if (!net.isIPv6(ip)) return resumir(ip);
  const g = gruposIpv6(ip);
  if (!g) return resumir("desconhecida");
  if (g.slice(0, 5).every((x) => x === "0") && g[5] === "ffff") {
    const v4 = [parseInt(g[6], 16) >> 8, parseInt(g[6], 16) & 255, parseInt(g[7], 16) >> 8, parseInt(g[7], 16) & 255].join(".");
    return resumir(v4);
  }
  return resumir(`${g.slice(0, 4).join(":")}::/64`);
}

// Freio de FALHAS por conexão (em memória, por instância, como o limitador acima): conta as tentativas SEM acerto que saem de uma mesma chave (a conexão),
// qualquer que seja a matrícula tentada, e PARA A CONEXÃO — nunca a conta de ninguém — com um bloqueio que cresce, no mesmo desenho do bloqueio por pessoa
// (shared/pinMembro.js): a tentativa é reservada ANTES de conferir; a que completa `limite` falhas ainda é conferida e abre o bloqueio (15 min; depois 1 h,
// 4 h e 24 h a cada novo `limite`); quem acerta DEVOLVE a própria tentativa (só a dela: o acerto numa matrícula não apaga as falhas nas outras); um dia
// inteiro sem falha, contado do fim do último bloqueio, esquece o histórico. A memória tem teto: com muitas chaves, saem primeiro as esquecidas, depois as
// antigas sem bloqueio.
const ESCADA_MINUTOS = [15, 60, 240, 1440];
const UM_DIA_MS = 24 * 3600 * 1000;

function criarFreioDeFalhas({ limite, escadaMinutos = ESCADA_MINUTOS, esquecerAposMs = UM_DIA_MS, maxChaves = 5000 } = {}) {
  if (!Number.isInteger(limite) || limite < 1) throw new Error("criarFreioDeFalhas: limite inválido");
  const contas = new Map(); // chave -> { falhas, ultimaFalhaEm, bloqueadoAte }
  const bloqueada = (c, agora) => c.bloqueadoAte !== null && c.bloqueadoAte > agora;
  const esquecida = (c, agora) => !bloqueada(c, agora) && agora - Math.max(c.ultimaFalhaEm || 0, c.bloqueadoAte || 0) >= esquecerAposMs;

  function abrirEspaco(agora) {
    for (const [k, c] of contas) if (esquecida(c, agora)) contas.delete(k);
    for (const [k, c] of contas) { if (contas.size < maxChaves) return; if (!bloqueada(c, agora)) contas.delete(k); }
    for (const k of contas.keys()) { if (contas.size < maxChaves) return; contas.delete(k); }
  }

  // { bloqueado:true, retryAposSegundos } (nada foi contado) ou { bloqueado:false, falhas, bloqueadaAgora, minutos } com a tentativa já contada como falha.
  function reservar(chave, agora = Date.now()) {
    let c = contas.get(chave);
    if (c && bloqueada(c, agora)) return { bloqueado: true, retryAposSegundos: Math.max(1, Math.ceil((c.bloqueadoAte - agora) / 1000)) };
    if (!c) {
      if (contas.size >= maxChaves) abrirEspaco(agora);
      c = { falhas: 0, ultimaFalhaEm: null, bloqueadoAte: null };
      contas.set(chave, c);
    } else if (esquecida(c, agora)) {
      c.falhas = 0;
      c.bloqueadoAte = null;
    }
    const anterior = { ultimaFalhaEm: c.ultimaFalhaEm, bloqueadoAte: c.bloqueadoAte };
    c.falhas += 1;
    c.ultimaFalhaEm = agora;
    let minutos = 0;
    if (c.falhas % limite === 0) {
      minutos = escadaMinutos[Math.min(c.falhas / limite, escadaMinutos.length) - 1];
      c.bloqueadoAte = agora + minutos * 60000;
    }
    const reserva = { bloqueado: false, falhas: c.falhas, bloqueadaAgora: minutos > 0, minutos };
    Object.defineProperty(reserva, "_devolucao", { value: { chave, em: agora, bloqueioAte: c.bloqueadoAte, anterior } });
    return reserva;
  }

  // Quem acertou devolve a tentativa que reservou. Se outra tentativa da mesma chave veio depois, a marca dela fica.
  function devolver(chave, reserva) {
    const d = reserva && !reserva.bloqueado && reserva._devolucao;
    if (!d || d.chave !== chave) return;
    const c = contas.get(chave);
    if (!c) return;
    c.falhas = Math.max(0, c.falhas - 1);
    if (c.ultimaFalhaEm === d.em) c.ultimaFalhaEm = d.anterior.ultimaFalhaEm;
    if (reserva.bloqueadaAgora && c.bloqueadoAte === d.bloqueioAte) c.bloqueadoAte = d.anterior.bloqueadoAte;
  }

  return { reservar, devolver, _tamanho: () => contas.size };
}

module.exports = { criarLimitador, chaveDeOrigem, chaveDeRede, criarFreioDeFalhas };
