const crypto = require("node:crypto");

/**
 * Mesma tolerância de formato que o site já usava antes (parênteses, traço,
 * espaço, +55 etc. não importam) — só os últimos 8 dígitos contam. Hash e
 * verificação SEMPRE normalizam antes, ou o mesmo telefone digitado de
 * formas diferentes geraria hashes diferentes.
 */
function normalizar(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  return digitos.slice(-8);
}

const SCRYPT_KEYLEN = 64;

/**
 * Gera "saltHex:hashHex" — formato próprio, sem depender de nenhuma
 * biblioteca externa (scrypt é nativo do Node desde a v10, sem risco de
 * falha de compilação nativa como aconteceu testando `argon2` localmente).
 * Guardado como texto simples no mesmo campo `telefone` que já existia —
 * não precisou de campo novo no Directus.
 */
function gerarHash(telefoneBruto) {
  const normalizado = normalizar(telefoneBruto);
  if (normalizado.length < 8) return null;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(normalizado, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Compara em tempo constante (`timingSafeEqual`) — comparação normal de
 * string (`===`) vaza quantos caracteres bateram através do tempo de
 * resposta, o que ajudaria um ataque de força bruta a adivinhar o hash
 * caractere por caractere.
 */
function conferirHash(telefoneBruto, valorGuardado) {
  if (!valorGuardado || !valorGuardado.includes(":")) return false;
  const normalizado = normalizar(telefoneBruto);
  if (normalizado.length < 8) return false;

  const [salt, hashGuardado] = valorGuardado.split(":");
  const hashCalculado = crypto.scryptSync(normalizado, salt, SCRYPT_KEYLEN).toString("hex");

  const bufA = Buffer.from(hashCalculado, "hex");
  const bufB = Buffer.from(hashGuardado, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { normalizar, gerarHash, conferirHash };
