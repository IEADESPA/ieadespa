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

function ipDoPedido(request) {
  const encaminhado = request.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return request.headers.get("x-azure-clientip") || "desconhecido";
}

module.exports = { permitir, ipDoPedido };
