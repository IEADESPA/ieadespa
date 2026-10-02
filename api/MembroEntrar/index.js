// MembroEntrar (fecho da v7.5) — entrada do membro comum com matrícula + PIN de 4 dígitos.
// Antes, o Meu Painel do membro abria só com a matrícula; agora a sessão (token) nasce aqui, do PIN que a pessoa criou — ou do PIN provisório que a
// Secretaria gerou para quem não tem e-mail — ou do código por e-mail (ConfirmarCodigoAcessoMembro). A sessão é de MEMBRO: sem permissão nenhuma. Quem tem
// acesso administrativo continua entrando com a senha da liderança (LoginSecretaria).
//
// POST /api/membro/entrar -> { matricula, pin }
//
// A resposta de erro é UMA só para matrícula inexistente, matrícula sem PIN, PIN errado e pessoa bloqueada: a matrícula é adivinhável, e uma resposta diferente
// por caso diria quem tem cadastro e quem está bloqueado. O tempo também é parecido (a conferência falsa gasta o mesmo). Ver shared/pinMembro.js.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const pinMembro = require("../shared/pinMembro");
const { registrarAuditoria } = require("../shared/auditoria");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// Contenção por origem (por instância), além do bloqueio por pessoa: segura quem testa muitas matrículas de um mesmo lugar.
const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });
const FALHA = () => ({ status: 200, body: { sucesso: false, mensagem: pinMembro.MENSAGEM_GENERICA } });

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }

  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const matricula = auth.idDeRota(corpo.matricula);
  if (!matricula || !pinMembro.formatoPinValido(corpo.pin)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula e o PIN de 4 números." } };
    return;
  }
  const pin = corpo.pin;

  const pool = await getPool();
  const membro = (await pool.request().input("id", sql.Int, matricula)
    .query(`SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`)).recordset[0];
  const registro = membro ? await pinMembro.lerPin(pool, matricula) : null;
  const provisorioVencido = registro && registro.provisorio && registro.expiraEm && new Date(registro.expiraEm) < new Date();
  if (!membro || !registro || provisorioVencido) {
    pinMembro.conferenciaFalsa(pin);
    context.res = FALHA();
    return;
  }

  // A tentativa é reservada (contada) ANTES de conferir: chutes simultâneos não passam do limite.
  const reserva = await pinMembro.reservarTentativa(pool, matricula, "PIN");
  if (reserva.bloqueado) {
    pinMembro.conferenciaFalsa(pin);
    context.res = FALHA();
    return;
  }
  if (!pinMembro.verificarPin(pin, matricula, registro.pinHash)) {
    // Só a partir do SEGUNDO bloqueio (10 erros ou mais): o primeiro é um engano comum, e a trilha imutável não deve poder ser inundada por quem erra de propósito
    // uma vez por matrícula.
    if (reserva.bloqueadaAgora && reserva.falhas >= 2 * pinMembro.LIMITE_FALHAS_PIN) {
      await registrarAuditoria({ tabela: "MembroPins", registroId: matricula, acao: "PIN_BLOQUEADO_POR_TENTATIVAS", usuarioId: null, dadosDepois: { falhas: reserva.falhas } });
    }
    context.res = FALHA();
    return;
  }
  await pinMembro.limparTentativas(pool, matricula, "PIN");
  // O PIN provisório é uma credencial que a Secretaria conhece: cada entrada com ele deixa rastro (sem o PIN, sem IP).
  if (registro.provisorio) await registrarAuditoria({ tabela: "MembroPins", registroId: matricula, acao: "PIN_PROVISORIO_USADO", usuarioId: matricula });

  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const token = await auth.criarSessao(pool, sql, {
    membroId: membro.MembroId, nome: membro.Nome, tipo: "Membro (autoatendimento)",
    nivel: null, escopoCongregacoes: [], permissoes: [], termosPendentes: [], via: "PIN", pinProvisorio: registro.provisorio
  }, dispositivoInfo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, token, nome: membro.Nome, tipo: "Membro (autoatendimento)", nivel: null, permissoes: [], matricula: membro.MembroId, pinProvisorio: registro.provisorio }
  };
};
