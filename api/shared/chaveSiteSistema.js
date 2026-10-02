// shared/chaveSiteSistema.js — chave combinada entre o SITE institucional e o SISTEMA, para a rota que o site chama de servidor para servidor (VerificarContaMembro).
//
// A rota responde "este e-mail é de um membro ativo?" e é anônima por desenho (o site chama de uma Azure Function, não do navegador). Sem uma chave, qualquer pessoa da internet
// poderia fazer a mesma pergunta, e-mail por e-mail, para descobrir quem é membro. O limite por origem só atrasa isso; a chave fecha.
//
// A variável CHAVE_SITE_SISTEMA precisa ter o MESMO valor nas configurações dos dois aplicativos do Azure (o do site e o do sistema). Enquanto ela não estiver definida no
// sistema, a rota continua como antes (só com o limite por origem) — assim o deploy não derruba a criação de conta do site no intervalo entre configurar um lado e o outro.
// Definida: quem não mandar o cabeçalho `x-site-key` igual recebe 401.
const crypto = require("crypto");

const CABECALHO = "x-site-key";

function sha(texto) { return crypto.createHash("sha256").update(String(texto)).digest(); }

function cabecalho(req) {
  const h = (req && req.headers) || {};
  const v = h[CABECALHO] !== undefined ? h[CABECALHO] : h["X-Site-Key"];
  return typeof v === "string" ? v : "";
}

// -> { exigida: boolean, ok: boolean }. `exigida` = a chave está configurada neste ambiente.
function conferirChaveDoSite(req, env = process.env) {
  const esperada = typeof env.CHAVE_SITE_SISTEMA === "string" ? env.CHAVE_SITE_SISTEMA.trim() : "";
  if (!esperada) return { exigida: false, ok: true };
  const enviada = cabecalho(req);
  // compara os hashes (tamanho fixo): o tempo da comparação não depende de quantos caracteres batem
  const ok = enviada !== "" && crypto.timingSafeEqual(sha(enviada), sha(esperada));
  return { exigida: true, ok };
}

module.exports = { conferirChaveDoSite, CABECALHO };
