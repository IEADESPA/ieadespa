const crypto = require("node:crypto");

const SECRET = process.env.CONTA_TOKEN_SECRET;
const VALIDADE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Fase 26 — sessão de "Minha Conta" sem tabela de sessão nenhuma no Directus:
 * o próprio token carrega `email` + validade, assinado com HMAC (mesma ideia
 * de um JWT, sem depender de biblioteca externa). O navegador guarda o token
 * inteiro (não só o e-mail) em localStorage; qualquer alteração no payload
 * quebra a assinatura e `verificar` devolve null. Sem lista de revogação —
 * aceitável pro escopo (site de igreja, não sistema financeiro): sair some
 * o token do navegador, mas um token vazado continua válido até expirar.
 */
function assinar(email) {
  const expiraEm = Date.now() + VALIDADE_MS;
  const payload = Buffer.from(JSON.stringify({ email, expiraEm })).toString("base64url");
  const assinatura = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${assinatura}`;
}

function verificar(token) {
  if (!SECRET || !token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, assinatura] = token.split(".");
  const esperada = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

  const bufA = Buffer.from(assinatura);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!dados.email || Date.now() > dados.expiraEm) return null;
    return dados.email;
  } catch {
    return null;
  }
}

/** Código de 6 dígitos, mandado por e-mail — nunca guardado em texto puro (ver hashCodigo). */
function gerarCodigo() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashCodigo(codigo) {
  return crypto.createHash("sha256").update(String(codigo)).digest("hex");
}

function conferirCodigo(codigo, hashGuardado) {
  if (!hashGuardado) return false;
  const bufA = Buffer.from(hashCodigo(codigo));
  const bufB = Buffer.from(hashGuardado);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { assinar, verificar, gerarCodigo, hashCodigo, conferirCodigo };
