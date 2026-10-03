// shared/origemConexao.js (v7.5 — revisão de segurança)
// De onde veio a conexão, do jeito que o Azure Static Web Apps entrega à Function. MEDIDO em produção em 02/10/2026 (endpoint de diagnóstico temporário):
//
//   chamada normal:        x-forwarded-for: <IP do cliente>:<porta>, <IP do proxy do Azure>:<porta>
//   cliente forjando XFF:  x-forwarded-for: <o que o cliente escreveu>, <IP real do cliente>:<porta>, <IP do proxy do Azure>:<porta>
//   x-azure-clientip e x-client-ip: NÃO são filtrados — o valor que o cliente manda chega igual. Não provam nada.
//   client-ip: é o IP do salto imediato (o proxy do Azure ou uma rede interna), não o do cliente.
//
// Ou seja: o Azure ACRESCENTA entradas à direita; o que está à esquerda pode ser inventado por quem chama. O IP do cliente é o PENÚLTIMO da lista
// (o último é o proxy do Azure). Quando a lista tem uma só entrada, o pedido chegou direto à Function e a entrada é o próprio par da conexão.
// Se a arquitetura do Azure mudar (outro salto), esta escolha degrada — por isso o aceite guarda a cadeia inteira (cadeiaDeCabecalhos) e o diagnóstico
// pode ser refeito em minutos.

const net = require("net");

const limpar = (v) => String(v == null ? "" : v).trim();

function cabecalho(headers, nome) {
  const h = headers || {};
  const chave = Object.keys(h).find(k => k.toLowerCase() === nome);
  const v = chave ? h[chave] : undefined;
  return Array.isArray(v) ? v.join(",") : String(v == null ? "" : v);
}
function ipPublico(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;                    // não especificado, privado, loopback, multicast/reservado
    if (a === 100 && b >= 64 && b <= 127) return false;                                 // CGNAT
    if (a === 169 && b === 254) return false;                                           // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && ip.startsWith("192.0.0.")) || ip.startsWith("192.0.2."))) return false;
    if (a === 198 && (b === 18 || b === 19 || ip.startsWith("198.51.100."))) return false;
    if (ip.startsWith("203.0.113.")) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const baixo = ip.toLowerCase();
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(baixo);
    if (mapeado) return ipPublico(mapeado[1]);
    // Só o unicast global (2000::/3) prova uma conexão vinda da internet: o resto (::, ::1, ::x, ULA, link-local, multicast...) é reservado ou interno.
    const primeiro = parseInt(baixo.split(":")[0] || "0", 16);
    if (!(primeiro >= 0x2000 && primeiro <= 0x3fff)) return false;
    if (baixo.startsWith("2001:db8:") || baixo.startsWith("2001:0db8:")) return false;             // documentação
    return true;
  }
  return false;
}
// "1.2.3.4", "1.2.3.4:5678", "[2804::1]:443", "2804::1" -> o endereço, ou null se não for um IP válido.
function normalizarIp(texto) {
  const v = limpar(texto);
  if (!v) return null;
  let m = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (m) return net.isIPv6(m[1]) ? m[1] : null;
  m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(v);
  if (m) return net.isIPv4(m[1]) ? m[1] : null;
  return net.isIP(v) ? v : null;
}

// O IP do cliente, ou null se não for um endereço válido (com `apenasPublico`, também se for privado/reservado: não prova de onde veio a conexão).
function ipDoCliente(headers, { apenasPublico = true } = {}) {
  const entradas = cabecalho(headers, "x-forwarded-for").split(",").map(s => s.trim()).filter(Boolean);
  if (entradas.length === 0) return null;
  const alvo = entradas.length === 1 ? entradas[0] : entradas[entradas.length - 2];
  const ip = normalizarIp(alvo);
  if (!ip || ip.length > 45) return null;
  return !apenasPublico || ipPublico(ip) ? ip : null;
}

// Os cabeçalhos de origem como chegaram, limpos e cortados: guardados com a adesão para a prova não depender só da escolha acima. Os de nome "client"
// e o x-azure-clientip entram como INFORMAÇÃO (podem ter sido escritos pelo cliente), nunca como critério.
function cadeiaDeCabecalhos(headers) {
  const partes = {};
  for (const nome of ["x-forwarded-for", "client-ip", "x-azure-clientip", "x-client-ip"]) {
    const v = cabecalho(headers, nome).replace(/[^0-9a-fA-F:.,\[\] ]/g, "").trim().slice(0, 120);
    if (v) partes[nome] = v;
  }
  return Object.keys(partes).length ? JSON.stringify(partes).slice(0, 400) : null;
}

module.exports = { cabecalho, ipPublico, normalizarIp, ipDoCliente, cadeiaDeCabecalhos };
