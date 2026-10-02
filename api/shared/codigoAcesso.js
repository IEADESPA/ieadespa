// shared/codigoAcesso.js (vB.5 — Login simplificado pro membro comum)
// Mesmo padrão da "Minha Conta" do site (site/api/src/lib/contaToken.js,
// Fase 26): código de 6 dígitos por e-mail, nunca guardado em texto puro.
// Diferença aqui: o destinatário é sempre uma matrícula real de
// MembroReferencia, não uma conta solta — por isso não precisa de token
// HMAC próprio, a sessão final reaproveita shared/auth.js::criarSessao
// (mesmo mecanismo que Lideranca já usa).
const crypto = require("crypto");
const { sql } = require("./db");
const pinMembro = require("./pinMembro");

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
const COOLDOWN_MS = 60 * 1000; // não manda um segundo código antes de 1 minuto
// No máximo este tanto de códigos por hora para a mesma matrícula: sem teto, um anônimo enchia a caixa de e-mail de um membro (até 1.440 por dia) e, com 5 chutes por
// código novo, forçava o código de 6 dígitos por força bruta mesmo com o bloqueio do PIN (fecho da v7.5).
const MAX_CODIGOS_POR_HORA = 5;

// Retorna { podeEnviar: false, mensagem } se pediu um código há menos de 1 minuto ou já pediu o máximo na última hora — sem isso, um clique duplo (ou alguém
// enchendo o e-mail de terceiro) manda vários e-mails seguidos.
async function podeSolicitarCodigo(pool, membroId) {
  const r = (await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT MAX(CriadoEm) AS Ultimo, COUNT(*) AS Total FROM CodigosAcessoMembro WHERE MembroId = @membroId AND CriadoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())
  `)).recordset[0];
  if (!r || !r.Ultimo) return { podeEnviar: true };
  const desde = Date.now() - new Date(r.Ultimo).getTime();
  if (desde < COOLDOWN_MS) return { podeEnviar: false, mensagem: "Aguarde um minuto antes de pedir outro código." };
  if (Number(r.Total) >= MAX_CODIGOS_POR_HORA) return { podeEnviar: false, mensagem: "Muitos códigos pedidos. Tente de novo em uma hora." };
  return { podeEnviar: true };
}

// Um código NOVO invalida os anteriores ainda não usados: senão, ao queimar ou usar o mais recente, o anterior voltaria a ser o "pendente".
async function registrarCodigo(pool, membroId, codigo) {
  const expiraEm = new Date(Date.now() + VALIDADE_MS);
  await pool.request().input("membroId", sql.Int, membroId).query(`UPDATE CodigosAcessoMembro SET Usado = 1 WHERE MembroId = @membroId AND Usado = 0`);
  await pool.request()
    .input("membroId", sql.Int, membroId).input("hash", sql.NVarChar(64), hashCodigo(codigo)).input("expiraEm", sql.DateTime2, expiraEm)
    .query(`INSERT INTO CodigosAcessoMembro (MembroId, CodigoHash, ExpiraEm) VALUES (@membroId, @hash, @expiraEm)`);
}

// Quantas vezes se pode errar um mesmo código: com 6 dígitos (1 milhão de combinações) e a matrícula adivinhável, sem limite ele seria forçável dentro
// dos 10 minutos de validade. Ao errar o quinto chute o código QUEIMA e é preciso pedir outro.
const LIMITE_TENTATIVAS = 5;
// E um contador por MEMBRO (canal CODIGO, mesmo escalonamento do PIN): pedir um código novo não zera as tentativas. 10 erros somados, em qualquer código, bloqueiam o canal.
const LIMITE_TENTATIVAS_POR_MEMBRO = 10;
// UMA mensagem para todo código que não vale (não existe, venceu, errou, gastou as tentativas, matrícula inexistente): mensagens diferentes dariam a quem
// chuta matrículas a pista de quem tem cadastro e de quem acabou de pedir um código.
const MENSAGEM_FALHA = "Código incorreto ou vencido. Peça um novo código.";

// Confere o código MAIS RECENTE ainda não usado — não deixa reaproveitar
// código antigo mesmo que a pessoa ainda o tenha no e-mail.
// A tentativa é RESERVADA de forma atômica antes de comparar (cem chutes ao mesmo tempo não conferem mais que cinco) e o uso é atômico (dois acertos
// simultâneos com o mesmo código: só um entra).
async function confirmarCodigo(pool, membroId, codigo) {
  const pendente = (await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 CodigoId, CodigoHash, ExpiraEm FROM CodigosAcessoMembro
    WHERE MembroId = @membroId AND Usado = 0 ORDER BY CriadoEm DESC
  `)).recordset[0];
  if (!pendente) return { valido: false, mensagem: MENSAGEM_FALHA };
  if (new Date(pendente.ExpiraEm) < new Date()) return { valido: false, mensagem: MENSAGEM_FALHA };

  // Primeiro o contador do MEMBRO (cobre todos os códigos), depois o do código.
  const membroReserva = await pinMembro.reservarTentativa(pool, membroId, "CODIGO", LIMITE_TENTATIVAS_POR_MEMBRO);
  if (membroReserva.bloqueado) return { valido: false, mensagem: MENSAGEM_FALHA };

  const reserva = (await pool.request().input("id", sql.Int, pendente.CodigoId).input("lim", sql.Int, LIMITE_TENTATIVAS).query(`
    UPDATE CodigosAcessoMembro SET Tentativas = Tentativas + 1 OUTPUT inserted.Tentativas AS Tentativas
    WHERE CodigoId = @id AND Usado = 0 AND Tentativas < @lim
  `)).recordset[0];
  if (!reserva) return { valido: false, mensagem: MENSAGEM_FALHA };

  if (!conferirCodigo(codigo, pendente.CodigoHash)) {
    if (reserva.Tentativas >= LIMITE_TENTATIVAS) {
      await pool.request().input("id", sql.Int, pendente.CodigoId).query(`UPDATE CodigosAcessoMembro SET Usado = 1 WHERE CodigoId = @id`);
      return { valido: false, mensagem: MENSAGEM_FALHA };
    }
    return { valido: false, mensagem: MENSAGEM_FALHA };
  }

  const usou = (await pool.request().input("id", sql.Int, pendente.CodigoId)
    .query(`UPDATE CodigosAcessoMembro SET Usado = 1 OUTPUT inserted.CodigoId AS CodigoId WHERE CodigoId = @id AND Usado = 0`)).recordset[0];
  if (!usou) return { valido: false, mensagem: MENSAGEM_FALHA };         // outro pedido acabou de usar este mesmo código
  await pinMembro.limparTentativas(pool, membroId, "CODIGO");
  await pool.request().input("membroId", sql.Int, membroId).query(`UPDATE CodigosAcessoMembro SET Usado = 1 WHERE MembroId = @membroId AND Usado = 0`);   // nenhum outro código pendente sobrevive
  return { valido: true };
}

module.exports = { LIMITE_TENTATIVAS, LIMITE_TENTATIVAS_POR_MEMBRO, MAX_CODIGOS_POR_HORA, MENSAGEM_FALHA, gerarCodigo, hashCodigo, conferirCodigo, podeSolicitarCodigo, registrarCodigo, confirmarCodigo };
