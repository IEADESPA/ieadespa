// DiagnosticoOrigem — TEMPORÁRIO (v7.5, item "IP no Azure"). Devolve a QUEM CHAMA só os cabeçalhos de origem que a Function recebeu, para descobrir
// empiricamente como o Static Web Apps monta x-forwarded-for / x-azure-clientip. Não grava nada, não lê banco, não devolve cookie nem token.
// Será REMOVIDO no commit seguinte à medição.
const vol = require("../shared/voluntariado");

const PERMITIDOS = /^(x-forwarded-.*|x-azure-.*|x-client-ip|x-real-ip|forwarded|via|client-ip|true-client-ip|cf-connecting-ip|x-original-for|x-appservice-proto|x-arr-ssl|x-ms-original-url|disguised-host|host|x-original-url|x-waws-unencoded-url)$/i;

module.exports = async function (context, req) {
  const recebidos = {};
  for (const [nome, valor] of Object.entries(req.headers || {})) {
    if (PERMITIDOS.test(nome) && !/auth|cookie|token|secret|principal/i.test(nome)) recebidos[nome.toLowerCase()] = String(valor).slice(0, 300);
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { recebidos, ipEscolhido: vol.extrairIp(req.headers), cadeia: vol.cadeiaDeCabecalhos(req.headers), nomesDeTodosOsCabecalhos: Object.keys(req.headers || {}).map(n => n.toLowerCase()).sort() }
  };
};
