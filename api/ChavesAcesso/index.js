// ChavesAcesso (vD.4, 07/10/2026) — cadastro e gestão das chaves de acesso (passkeys) e a CONFIRMAÇÃO REFORÇADA.
// Exige sessão de liderança (nascida da senha): membro comum (PIN) não tem segundo fator — o PIN já é o fator dele.
//
// GET  /api/chaves-acesso                      -> { chaves:[{chaveId, apelido, dispositivoInfo, criadoEm, ultimoUsoEm}], email, fator }
// POST /api/chaves-acesso/registrar/opcoes     -> { opcoes }                  (desafio de cadastro para ESTE aparelho)
// POST /api/chaves-acesso/registrar            body:{resposta, apelido}       (guarda a chave pública)
// POST /api/chaves-acesso/remover              body:{chaveId}                 (a própria pessoa remove uma chave sua)
// POST /api/chaves-acesso/confirmar/opcoes     -> { opcoes }                  (confirmação reforçada: desafio para a chave)
// POST /api/chaves-acesso/confirmar            body:{resposta}                -> { token } (sessão reassinada com o fator recente)
// POST /api/chaves-acesso/confirmar/codigo/enviar                             (reserva: código por e-mail)
// POST /api/chaves-acesso/confirmar/codigo     body:{codigo}                  -> { token }
// GET  /api/chaves-acesso/admin                (nível geral) -> { lideres:[{membroId, nome, papel, chaves, ultimoUsoEm, temEmail}] }
// POST /api/chaves-acesso/admin/remover        (nível geral) body:{membroId, motivo} — quem perdeu o aparelho; fica na auditoria
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const segundoFator = require("../shared/segundoFator");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas chamadas seguidas. Aguarde um minuto." } };
    return;
  }
  const usuario = auth.exigirSessaoDeLideranca(req, context);
  if (!usuario) return;
  const acao = String(context.bindingData.acao || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pool = await getPool();
  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };

  if (metodo === "GET" && acao === "") {
    const s = await segundoFator.situacaoDaPessoa(pool, usuario.membroId);
    responder(200, { sucesso: true, chaves: s.chaves.map(segundoFator.semSegredos), emailMascarado: s.emailMascarado, fator: usuario.fator || null, fatorRecente: segundoFator.fatorRecente(usuario) });
    return;
  }

  if (metodo === "GET" && acao === "admin") {
    if (!auth.exigirNivelGlobal(req, context)) return;
    const r = await pool.request().query(`
      SELECT l.MembroId AS membroId, m.Nome AS nome, p.Nome AS papel, CASE WHEN m.Email IS NULL OR m.Email = '' THEN 0 ELSE 1 END AS temEmail,
             (SELECT COUNT(*) FROM dbo.ChavesAcesso c WHERE c.MembroId = l.MembroId AND c.Ativa = 1) AS chaves,
             (SELECT MAX(c.UltimoUsoEm) FROM dbo.ChavesAcesso c WHERE c.MembroId = l.MembroId AND c.Ativa = 1) AS ultimoUsoEm
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE l.SenhaHash IS NOT NULL
      GROUP BY l.MembroId, m.Nome, p.Nome, m.Email
      ORDER BY m.Nome`);
    responder(200, { sucesso: true, lideres: r.recordset.map((x) => ({ ...x, temEmail: !!x.temEmail })) });
    return;
  }

  if (metodo !== "POST") { responder(405, { sucesso: false, mensagem: "Método não suportado." }); return; }

  if (acao === "registrar/opcoes") {
    const o = await segundoFator.opcoesDeCadastro(pool, req, { membroId: usuario.membroId, nome: usuario.nome });
    responder(o.erro ? 400 : 200, o.erro ? { sucesso: false, mensagem: o.erro } : { sucesso: true, opcoes: o.opcoes });
    return;
  }
  if (acao === "registrar") {
    const r = await segundoFator.concluirCadastro(pool, req, { membroId: usuario.membroId, resposta: corpo.resposta, apelido: corpo.apelido, dispositivoInfo });
    if (r.erro) { responder(200, { sucesso: false, mensagem: r.erro }); return; }
    await registrarAuditoria({ tabela: "ChavesAcesso", registroId: usuario.membroId, acao: "CHAVE_ACESSO_CADASTRADA", usuarioId: usuario.membroId, dadosDepois: { apelido: corpo.apelido || null, dispositivoInfo } }).catch(() => {});
    responder(200, { sucesso: true, mensagem: "Chave de acesso cadastrada neste aparelho." });
    return;
  }
  if (acao === "remover") {
    const chaveId = auth.idDeRota(corpo.chaveId);
    if (!chaveId) { responder(400, { sucesso: false, mensagem: "Informe a chave." }); return; }
    const ok = await segundoFator.removerChave(pool, { membroId: usuario.membroId, chaveId, por: usuario.membroId });
    if (ok) await registrarAuditoria({ tabela: "ChavesAcesso", registroId: chaveId, acao: "CHAVE_ACESSO_REMOVIDA", usuarioId: usuario.membroId, dadosDepois: { chaveId } }).catch(() => {});
    responder(200, ok ? { sucesso: true, mensagem: "Chave removida." } : { sucesso: false, mensagem: "Chave não encontrada." });
    return;
  }

  // ---- confirmação reforçada (os quatro atos pedem o fator de novo se a última confirmação passou de 10 minutos) ----
  if (acao === "confirmar/opcoes") {
    const o = await segundoFator.opcoesDeUso(pool, req, usuario.membroId, "CONFIRMAR");
    responder(o.erro ? 400 : 200, o.erro ? { sucesso: false, mensagem: o.erro } : { sucesso: true, opcoes: o.opcoes });
    return;
  }
  if (acao === "confirmar/codigo/enviar") {
    const s = await segundoFator.situacaoDaPessoa(pool, usuario.membroId);
    if (!s.email) { responder(400, { sucesso: false, mensagem: "Sua matrícula não tem e-mail cadastrado. Cadastre uma chave de acesso ou peça à Secretaria Geral." }); return; }
    const e = await segundoFator.enviarCodigo(pool, { membroId: usuario.membroId, email: s.email, nome: usuario.nome, motivo: "confirmar um ato no sistema" });
    responder(200, e.erro ? { sucesso: false, mensagem: e.erro } : { sucesso: true, mensagem: `Código enviado para ${s.emailMascarado}.` });
    return;
  }
  if (acao === "confirmar" || acao === "confirmar/codigo") {
    const r = acao === "confirmar"
      ? await segundoFator.conferirUso(pool, req, usuario.membroId, "CONFIRMAR", corpo.resposta)
      : await segundoFator.conferirCodigo(pool, usuario.membroId, corpo.codigo);
    if (r.erro) { responder(200, { sucesso: false, mensagem: r.erro }); return; }
    // a sessão continua a mesma (mesmo sid, mesma validade): só o carimbo do fator é renovado
    const token = auth.reassinarMantendoValidade(auth.extrairToken(req), { fator: { via: acao === "confirmar" ? "CHAVE" : "CODIGO", em: Date.now() } });
    responder(200, { sucesso: true, token });
    return;
  }

  if (acao === "admin/remover") {
    if (!auth.exigirNivelGlobal(req, context)) return;
    const membroId = auth.idDeRota(corpo.membroId);
    if (!membroId) { responder(400, { sucesso: false, mensagem: "Informe a matrícula." }); return; }
    const n = await segundoFator.removerTodasAsChaves(pool, { membroId, por: usuario.membroId });
    await registrarAuditoria({ tabela: "ChavesAcesso", registroId: membroId, acao: "CHAVES_ACESSO_REMOVIDAS_PELA_GESTAO", usuarioId: usuario.membroId, dadosDepois: { alvoMembroId: membroId, removidas: n, motivo: String(corpo.motivo || "").slice(0, 200) } }).catch(() => {});
    responder(200, { sucesso: true, mensagem: n ? `${n} chave(s) removida(s). A pessoa volta a entrar pelo código no e-mail.` : "A pessoa não tinha chave ativa." });
    return;
  }

  responder(404, { sucesso: false, mensagem: "Ação inválida." });
};
