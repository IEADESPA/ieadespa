// shared/segredoSessao.js — o segredo que assina o crachá de sessão (auth.js) e tempera o hash do PIN (pinMembro.js).
//
// Antes, se a variável AUTH_SECRET faltasse no ambiente, o código usava uma frase fixa de desenvolvimento ("dev-secret-...") — e como o repositório é PÚBLICO, essa frase é
// conhecida de todos: quem a soubesse forjaria o crachá de qualquer pessoa, inclusive de um administrador global, sem deixar rastro. Em produção a variável está definida
// (medido em 02/10/2026: um crachá assinado com a frase pública é recusado), então o risco era só o de ela ser apagada ou renomeada por engano.
//
// Agora o sistema nunca tem um segredo conhecido:
//  - AUTH_SECRET definida e diferente da frase antiga → usa;
//  - ausente (ou igual à frase pública) rodando como Azure Function (FUNCTIONS_WORKER_RUNTIME definido) → RECUSA subir: a Function falha ao carregar, com a causa no log;
//  - ausente fora do Azure (testes, scripts de verificação) → segredo ALEATÓRIO só deste processo (nada que sobreviva a um reinício, nada que outro processo conheça).
const crypto = require("crypto");

const FRASE_PUBLICA_ANTIGA = "dev-secret-ieadespa";

function resolverSegredo(env = process.env) {
  const definido = typeof env.AUTH_SECRET === "string" ? env.AUTH_SECRET.trim() : "";
  if (definido && definido !== FRASE_PUBLICA_ANTIGA) return definido;
  if (env.FUNCTIONS_WORKER_RUNTIME) {
    throw new Error("AUTH_SECRET ausente (ou igual ao valor público antigo): defina um segredo próprio nas configurações do aplicativo. O sistema se recusa a subir sem ele.");
  }
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { resolverSegredo, FRASE_PUBLICA_ANTIGA };
