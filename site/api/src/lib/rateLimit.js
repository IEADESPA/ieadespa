/**
 * Limitador por IP em memória — melhor esforço, não é perfeito (uma
 * instância nova/fria começa com contador zerado, e sob carga o Azure
 * Functions pode rodar mais de uma instância ao mesmo tempo, cada uma com
 * seu próprio contador). Mesmo assim, é uma proteção real contra o caso
 * comum de alguém tentando adivinhar código+telefone repetidamente pela
 * mesma conexão — bem melhor que o rate limiter do Directus, que está
 * confirmadamente sem efeito nenhum (ver README, Fase 6).
 */
const tentativas = new Map();

const JANELA_MS = 5 * 60 * 1000;
const LIMITE = 20;

function limpar(agora) {
  for (const [chave, registro] of tentativas) {
    if (agora - registro.inicio > JANELA_MS) tentativas.delete(chave);
  }
}

/** true = pode seguir; false = bloqueado por excesso de tentativas. */
function permitir(chave) {
  const agora = Date.now();
  if (tentativas.size > 5000) limpar(agora);

  const registro = tentativas.get(chave);
  if (!registro || agora - registro.inicio > JANELA_MS) {
    tentativas.set(chave, { inicio: agora, contagem: 1 });
    return true;
  }

  registro.contagem += 1;
  return registro.contagem <= LIMITE;
}

// vC.5 — modelo clássico (function.json + module.exports): `req.headers` é
// um objeto simples, não a interface Headers do modelo v4 (sem `.get()`).
// Busca sem diferenciar maiúscula/minúscula porque o runtime do Functions
// não garante uma capitalização fixa.
function header(req, nome) {
  if (!req.headers) return undefined;
  const chave = Object.keys(req.headers).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave ? req.headers[chave] : undefined;
}

// O IP de quem chamou. O Azure Static Web Apps ACRESCENTA entradas à direita do x-forwarded-for (medido no sistema, 02/10/2026, e confirmado aqui em 03/10/2026: com um
// valor inventado de primeira entrada o limite nunca barrava): a esquerda pode ser escrita por quem chama, então o IP real é o PENÚLTIMO (o último é o proxy do Azure).
// Com uma só entrada, ela é o próprio par da conexão. Sem o cabeçalho, todos caem no mesmo balde "desconhecido" (barra junto em vez de deixar passar): o
// x-azure-clientip chega como o cliente escreveu e não vale como critério.
function ipDoPedido(req) {
  const encaminhado = header(req, "x-forwarded-for");
  const entradas = String(encaminhado == null ? "" : Array.isArray(encaminhado) ? encaminhado.join(",") : encaminhado).split(",").map((s) => s.trim()).filter(Boolean);
  if (entradas.length === 0) return "desconhecido";
  return (entradas.length === 1 ? entradas[0] : entradas[entradas.length - 2]).slice(0, 64);
}

module.exports = { permitir, ipDoPedido };
