// shared/codigoAcesso.js (vB.5 — Login simplificado pro membro comum)
// Mesmo padrão da "Minha Conta" do site (site/api/src/lib/contaToken.js,
// Fase 26): código de 6 dígitos por e-mail, nunca guardado em texto puro.
// Diferença aqui: o destinatário é sempre uma matrícula real de
// MembroReferencia, não uma conta solta — por isso não precisa de token
// HMAC próprio, a sessão final reaproveita shared/auth.js::criarSessao
// (mesmo mecanismo que Lideranca já usa).
const crypto = require("crypto");
const { sql } = require("./db");

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

const VALIDADE_MS = 10 * 60 * 1000; // 10 minutos, igual ao do site
const COOLDOWN_MS = 60 * 1000; // não manda um segundo código antes de 1 minuto (sem tabela de rate-limit própria)

// Retorna { podeEnviar: false, mensagem } se pediu um código há menos de 1
// minuto — sem isso, um clique duplo (ou alguém enchendo o e-mail de
// terceiro) manda vários e-mails seguidos.
async function podeSolicitarCodigo(pool, membroId) {
  const ultimo = (await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 CriadoEm FROM CodigosAcessoMembro WHERE MembroId = @membroId ORDER BY CriadoEm DESC
  `)).recordset[0];
  if (!ultimo) return { podeEnviar: true };
  const desde = Date.now() - new Date(ultimo.CriadoEm).getTime();
  if (desde < COOLDOWN_MS) return { podeEnviar: false, mensagem: "Aguarde um minuto antes de pedir outro código." };
  return { podeEnviar: true };
}

async function registrarCodigo(pool, membroId, codigo) {
  const expiraEm = new Date(Date.now() + VALIDADE_MS);
  await pool.request()
    .input("membroId", sql.Int, membroId).input("hash", sql.NVarChar(64), hashCodigo(codigo)).input("expiraEm", sql.DateTime2, expiraEm)
    .query(`INSERT INTO CodigosAcessoMembro (MembroId, CodigoHash, ExpiraEm) VALUES (@membroId, @hash, @expiraEm)`);
}

// Confere o código MAIS RECENTE ainda não usado — não deixa reaproveitar
// código antigo mesmo que a pessoa ainda o tenha no e-mail.
async function confirmarCodigo(pool, membroId, codigo) {
  const pendente = (await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 CodigoId, CodigoHash, ExpiraEm FROM CodigosAcessoMembro
    WHERE MembroId = @membroId AND Usado = 0 ORDER BY CriadoEm DESC
  `)).recordset[0];
  if (!pendente) return { valido: false, mensagem: "Nenhum código pendente. Peça um novo." };
  if (new Date(pendente.ExpiraEm) < new Date()) return { valido: false, mensagem: "Código expirado. Peça um novo." };
  if (!conferirCodigo(codigo, pendente.CodigoHash)) return { valido: false, mensagem: "Código incorreto." };

  await pool.request().input("id", sql.Int, pendente.CodigoId).query(`UPDATE CodigosAcessoMembro SET Usado = 1 WHERE CodigoId = @id`);
  return { valido: true };
}

module.exports = { gerarCodigo, hashCodigo, conferirCodigo, podeSolicitarCodigo, registrarCodigo, confirmarCodigo };
