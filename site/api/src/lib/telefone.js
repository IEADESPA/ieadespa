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
 *
 * CUSTO: cada chamada leva ~50 ms de CPU (scrypt é lento de propósito). Nunca
 * rodar isto em laço sobre uma coleção inteira — foi exatamente o que travou o
 * site em 06/10/2026 (1.000 pedidos × 50 ms = 50 s por consulta). Para achar
 * um registro pelo telefone, use `chaveTelefone` + filtro no Directus; scrypt
 * fica só para conferir UM registro já localizado (ou os poucos candidatos
 * antigos, sem chave, filtrados pelo nome).
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

/**
 * Chave de BUSCA do telefone (06/10/2026): HMAC-SHA256 do telefone normalizado
 * com um segredo só do servidor (`TELEFONE_CHAVE_SEGREDO`, Application Setting
 * do site, guardado criptografado em `site/secrets.env`). Determinística — o
 * mesmo telefone dá sempre a mesma chave — então o Directus acha o registro
 * com um filtro de igualdade (campo indexado `telefone_chave`), em
 * milissegundos, sem varrer a coleção. Sem o segredo não dá para recalcular a
 * chave a partir do telefone (nem de uma lista de telefones), então continua
 * sendo um dado protegido; o scrypt com salt (`telefone`) segue gravado ao
 * lado, como antes. Trocar o segredo invalida todas as chaves gravadas: só com
 * reindexação.
 */
function chaveTelefone(telefoneBruto) {
  const segredo = process.env.TELEFONE_CHAVE_SEGREDO;
  if (!segredo) return null;
  const normalizado = normalizar(telefoneBruto);
  if (normalizado.length < 8) return null;
  return crypto.createHmac("sha256", segredo).update(normalizado).digest("hex");
}

/**
 * Telefone CIFRADO (07/10/2026) — para o botão de WhatsApp do painel. Até aqui o telefone só
 * existia como hash (scrypt) e chave de busca (HMAC): nenhum dos dois volta ao número, então
 * o sistema não tinha como falar com a pessoa (3 em 4 pedidos de 06/10 não tinham e-mail).
 * Agora o número completo (só dígitos, com DDD) é guardado cifrado com AES-256-GCM, chave
 * derivada do segredo do servidor (`TELEFONE_CHAVE_SEGREDO`, HKDF com rótulo próprio): quem
 * lê a coleção no Directus vê só o cifrado; só a API do site decifra, e só para quem está
 * logado no painel (`TelefonePedido`). Formato: "v1:<iv hex>:<tag hex>:<cifrado hex>".
 */
function chaveCifra() {
  const segredo = process.env.TELEFONE_CHAVE_SEGREDO;
  if (!segredo) return null;
  return crypto.hkdfSync("sha256", segredo, "ieadespa-telefone", "telefone-cifrado-v1", 32);
}

/** Todos os dígitos do telefone (com DDD; "+55" na frente é removido). `null` se tiver menos de 10. */
function digitosCompletos(telefoneBruto) {
  let d = String(telefoneBruto || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 ? d : null;
}

function cifrarTelefone(telefoneBruto) {
  const chave = chaveCifra();
  const digitos = digitosCompletos(telefoneBruto);
  if (!chave || !digitos) return null;
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv("aes-256-gcm", Buffer.from(chave), iv);
  const cifrado = Buffer.concat([cifra.update(digitos, "utf8"), cifra.final()]);
  return `v1:${iv.toString("hex")}:${cifra.getAuthTag().toString("hex")}:${cifrado.toString("hex")}`;
}

function decifrarTelefone(valorGuardado) {
  const chave = chaveCifra();
  if (!chave || !valorGuardado) return null;
  const [versao, ivHex, tagHex, cifradoHex] = String(valorGuardado).split(":");
  if (versao !== "v1" || !ivHex || !tagHex || !cifradoHex) return null;
  try {
    const decifra = crypto.createDecipheriv("aes-256-gcm", Buffer.from(chave), Buffer.from(ivHex, "hex"));
    decifra.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decifra.update(Buffer.from(cifradoHex, "hex")), decifra.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Endereço de conversa do WhatsApp (sem mensagem): 55 + DDD + número. */
function linkWhatsApp(digitos) {
  return digitos ? `https://wa.me/55${digitos}` : null;
}

/** Nome sem acento, minúsculo e com espaços únicos — para casar "José" com "jose". */
function normalizarNome(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizar, gerarHash, conferirHash, chaveTelefone, normalizarNome, digitosCompletos, cifrarTelefone, decifrarTelefone, linkWhatsApp };
