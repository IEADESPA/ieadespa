// shared/segundoFator.js (vD.4, 07/10/2026) — segundo fator da liderança: CHAVE DE ACESSO (passkey, WebAuthn) com
// código por e-mail de reserva.
//
// Fluxo do login (LoginSecretaria → SegundoFator): matrícula + senha certas NÃO abrem a sessão; abrem um BILHETE
// (5 minutos, assinado com uma chave derivada do segredo das sessões — não serve como token de sessão) que só a segunda
// etapa aceita. A segunda etapa é a chave de acesso do aparelho (navigator.credentials.get) ou, na falta dela, o código
// de 6 dígitos no e-mail do cadastro (CodigosAcessoMembro, as mesmas regras do membro: 10 min, 5 tentativas). Quem não
// tem chave nem e-mail não fica trancado fora: entra com aviso (via "NENHUM") e é levado a cadastrar.
//
// Cada cadastro/entrada/confirmação parte de um desafio aleatório de uso único guardado em DesafiosWebAuthn (5 min).
// A origem (rpID) vem do cabeçalho Origin da própria requisição, conferido contra a lista do que é nosso: produção
// (app.ieadespa.org.br), os endereços do Static Web App (homologação) e localhost — uma chave cadastrada em um
// endereço só vale naquele endereço (regra do padrão).
const crypto = require("crypto");
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require("@simplewebauthn/server");
const { sql } = require("./db");
const { resolverSegredo } = require("./segredoSessao");
const codigoAcesso = require("./codigoAcesso");
const { enviarEmailNotificacao } = require("./notificacaoEmail");

const RP_NOME = "Governança IEADESPA";
const VALIDADE_BILHETE_MS = 5 * 60 * 1000;
const VALIDADE_DESAFIO_MS = 5 * 60 * 1000;
const FATOR_RECENTE_MS = 10 * 60 * 1000; // confirmação reforçada: vale por 10 minutos
const ORIGENS_NOSSAS = [/^https:\/\/app\.ieadespa\.org\.br$/, /^https:\/\/([a-z0-9-]+\.)+azurestaticapps\.net$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

// chave própria do bilhete: derivada do segredo das sessões, mas distinta dele — um bilhete nunca passa por token de sessão nem o contrário
const CHAVE_BILHETE = crypto.hkdfSync("sha256", resolverSegredo(), "ieadespa-segundo-fator", "bilhete-v1", 32);

function emitirBilhete(dados) {
  const corpo = Buffer.from(JSON.stringify({ ...dados, fase: "fator", exp: Date.now() + VALIDADE_BILHETE_MS, n: crypto.randomBytes(8).toString("base64url") })).toString("base64url");
  const assinatura = crypto.createHmac("sha256", Buffer.from(CHAVE_BILHETE)).update(corpo).digest("base64url");
  return `F.${corpo}.${assinatura}`;
}
function lerBilhete(bilhete) {
  try {
    const [marca, corpo, assinatura] = String(bilhete || "").split(".");
    if (marca !== "F" || !corpo || !assinatura) return null;
    const esperada = crypto.createHmac("sha256", Buffer.from(CHAVE_BILHETE)).update(corpo).digest("base64url");
    const a = Buffer.from(assinatura), b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (p.fase !== "fator" || !p.exp || Date.now() > p.exp || !Number.isInteger(p.membroId)) return null;
    return p;
  } catch (_) { return null; }
}

// Origem (e rpID) da requisição: só as nossas. Devolve null para origem ausente/estranha — a chamada é recusada.
function origemDaRequisicao(req) {
  const h = (req && req.headers) || {};
  const k = Object.keys(h).find((c) => c.toLowerCase() === "origin");
  const origem = k ? String(h[k]).trim().replace(/\/+$/, "") : "";
  if (!origem || !ORIGENS_NOSSAS.some((re) => re.test(origem))) return null;
  try { return { origem, rpId: new URL(origem).hostname }; } catch (_) { return null; }
}

const mascararEmail = (email) => { const m = /^([^@])([^@]*)(@.*)$/.exec(String(email || "")); return m ? `${m[1]}${"*".repeat(Math.min(m[2].length, 6))}${m[3]}` : null; };

// ---------- desafios de uso único ----------
async function guardarDesafio(pool, membroId, tipo, desafio) {
  await pool.request().input("m", sql.Int, membroId).input("t", sql.NVarChar(12), tipo).query("UPDATE dbo.DesafiosWebAuthn SET Usado = 1 WHERE MembroId = @m AND Tipo = @t AND Usado = 0");
  await pool.request().input("m", sql.Int, membroId).input("t", sql.NVarChar(12), tipo).input("d", sql.NVarChar(100), desafio).input("e", sql.DateTime2, new Date(Date.now() + VALIDADE_DESAFIO_MS))
    .query("INSERT INTO dbo.DesafiosWebAuthn (MembroId, Tipo, Desafio, ExpiraEm) VALUES (@m, @t, @d, @e)");
}
// Consome (marca usado) o desafio pendente mais recente; null se não há, venceu ou já foi usado. Atômico: dois usos simultâneos, um só leva.
async function consumirDesafio(pool, membroId, tipo) {
  const r = await pool.request().input("m", sql.Int, membroId).input("t", sql.NVarChar(12), tipo).query(`
    UPDATE d SET Usado = 1 OUTPUT inserted.Desafio AS Desafio
    FROM dbo.DesafiosWebAuthn d
    WHERE d.DesafioId = (SELECT TOP 1 DesafioId FROM dbo.DesafiosWebAuthn WHERE MembroId = @m AND Tipo = @t AND Usado = 0 AND ExpiraEm > SYSUTCDATETIME() ORDER BY CriadoEm DESC)
      AND d.Usado = 0`);
  return r.recordset[0] ? r.recordset[0].Desafio : null;
}

// ---------- chaves ----------
async function chavesAtivas(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT ChaveId AS chaveId, CredencialId AS credencialId, ChavePublica AS chavePublica, Contador AS contador, Transportes AS transportes, Apelido AS apelido,
           DispositivoInfo AS dispositivoInfo, CriadoEm AS criadoEm, UltimoUsoEm AS ultimoUsoEm
    FROM dbo.ChavesAcesso WHERE MembroId = @m AND Ativa = 1 ORDER BY CriadoEm`);
  return r.recordset;
}
const paraCredencial = (c) => ({ id: c.credencialId, publicKey: new Uint8Array(Buffer.from(c.chavePublica, "base64url")), counter: Number(c.contador || 0), transports: c.transportes ? c.transportes.split(",") : undefined });
const semSegredos = (c) => ({ chaveId: c.chaveId, apelido: c.apelido, dispositivoInfo: c.dispositivoInfo, criadoEm: c.criadoEm, ultimoUsoEm: c.ultimoUsoEm });

// A pessoa tem chave? tem e-mail? (decide a etapa do login)
async function situacaoDaPessoa(pool, membroId) {
  const [chaves, membro] = await Promise.all([
    chavesAtivas(pool, membroId),
    pool.request().input("m", sql.Int, membroId).query("SELECT Nome, Email FROM dbo.MembroReferencia WHERE MembroId = @m")
  ]);
  const m = membro.recordset[0] || {};
  return { temChaves: chaves.length > 0, chaves, email: m.Email || null, emailMascarado: mascararEmail(m.Email), nome: m.Nome || null };
}

// opções para cadastrar uma chave nova neste aparelho
async function opcoesDeCadastro(pool, req, { membroId, nome }) {
  const origem = origemDaRequisicao(req);
  if (!origem) return { erro: "Origem da chamada não reconhecida." };
  const existentes = await chavesAtivas(pool, membroId);
  const opcoes = await generateRegistrationOptions({
    rpName: RP_NOME, rpID: origem.rpId,
    userName: `matricula-${membroId}`, userID: new Uint8Array(Buffer.from(String(membroId))), userDisplayName: nome || `Matrícula ${membroId}`,
    attestationType: "none",
    excludeCredentials: existentes.map((c) => ({ id: c.credencialId, transports: c.transportes ? c.transportes.split(",") : undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }
  });
  await guardarDesafio(pool, membroId, "REGISTRO", opcoes.challenge);
  return { opcoes };
}

async function concluirCadastro(pool, req, { membroId, resposta, apelido, dispositivoInfo }) {
  const origem = origemDaRequisicao(req);
  if (!origem) return { erro: "Origem da chamada não reconhecida." };
  const desafio = await consumirDesafio(pool, membroId, "REGISTRO");
  if (!desafio) return { erro: "O pedido de cadastro venceu. Tente de novo." };
  let v;
  try { v = await verifyRegistrationResponse({ response: resposta, expectedChallenge: desafio, expectedOrigin: origem.origem, expectedRPID: origem.rpId }); }
  catch (e) { return { erro: "O aparelho não confirmou o cadastro: " + String(e && e.message).slice(0, 120) }; }
  if (!v.verified || !v.registrationInfo) return { erro: "O aparelho não confirmou o cadastro." };
  const c = v.registrationInfo.credential;
  await pool.request().input("m", sql.Int, membroId).input("id", sql.NVarChar(512), c.id).input("pk", sql.NVarChar(sql.MAX), Buffer.from(c.publicKey).toString("base64url"))
    .input("ct", sql.BigInt, Number(c.counter || 0)).input("tr", sql.NVarChar(100), Array.isArray(c.transports) ? c.transports.join(",").slice(0, 100) : null)
    .input("ap", sql.NVarChar(80), apelido ? String(apelido).slice(0, 80) : null).input("di", sql.NVarChar(300), dispositivoInfo ? String(dispositivoInfo).slice(0, 300) : null)
    .query("INSERT INTO dbo.ChavesAcesso (MembroId, CredencialId, ChavePublica, Contador, Transportes, Apelido, DispositivoInfo) VALUES (@m, @id, @pk, @ct, @tr, @ap, @di)");
  return { sucesso: true };
}

// opções para ENTRAR/CONFIRMAR com uma chave já cadastrada (tipo: LOGIN | CONFIRMAR)
async function opcoesDeUso(pool, req, membroId, tipo) {
  const origem = origemDaRequisicao(req);
  if (!origem) return { erro: "Origem da chamada não reconhecida." };
  const chaves = await chavesAtivas(pool, membroId);
  if (!chaves.length) return { erro: "Nenhuma chave de acesso cadastrada." };
  const opcoes = await generateAuthenticationOptions({ rpID: origem.rpId, userVerification: "preferred", allowCredentials: chaves.map((c) => ({ id: c.credencialId, transports: c.transportes ? c.transportes.split(",") : undefined })) });
  await guardarDesafio(pool, membroId, tipo, opcoes.challenge);
  return { opcoes };
}

async function conferirUso(pool, req, membroId, tipo, resposta) {
  const origem = origemDaRequisicao(req);
  if (!origem) return { erro: "Origem da chamada não reconhecida." };
  const chaves = await chavesAtivas(pool, membroId);
  const chave = chaves.find((c) => c.credencialId === (resposta && resposta.id));
  if (!chave) return { erro: "Chave de acesso desconhecida." };
  const desafio = await consumirDesafio(pool, membroId, tipo);
  if (!desafio) return { erro: "A confirmação venceu. Tente de novo." };
  let v;
  try { v = await verifyAuthenticationResponse({ response: resposta, expectedChallenge: desafio, expectedOrigin: origem.origem, expectedRPID: origem.rpId, credential: paraCredencial(chave) }); }
  catch (e) { return { erro: "O aparelho não confirmou: " + String(e && e.message).slice(0, 120) }; }
  if (!v.verified) return { erro: "O aparelho não confirmou." };
  await pool.request().input("id", sql.Int, chave.chaveId).input("ct", sql.BigInt, Number((v.authenticationInfo && v.authenticationInfo.newCounter) || 0))
    .query("UPDATE dbo.ChavesAcesso SET Contador = @ct, UltimoUsoEm = SYSUTCDATETIME() WHERE ChaveId = @id");
  return { sucesso: true, chaveId: chave.chaveId, apelido: chave.apelido };
}

async function removerChave(pool, { membroId, chaveId, por }) {
  const r = await pool.request().input("m", sql.Int, membroId).input("id", sql.Int, chaveId).input("por", sql.Int, por)
    .query("UPDATE dbo.ChavesAcesso SET Ativa = 0, RemovidaEm = SYSUTCDATETIME(), RemovidaPor = @por WHERE ChaveId = @id AND MembroId = @m AND Ativa = 1");
  return r.rowsAffected[0] > 0;
}
async function removerTodasAsChaves(pool, { membroId, por }) {
  const r = await pool.request().input("m", sql.Int, membroId).input("por", sql.Int, por)
    .query("UPDATE dbo.ChavesAcesso SET Ativa = 0, RemovidaEm = SYSUTCDATETIME(), RemovidaPor = @por WHERE MembroId = @m AND Ativa = 1");
  return r.rowsAffected[0];
}

// ---------- código por e-mail (reserva) ----------
async function enviarCodigo(pool, { membroId, email, nome, motivo }) {
  const pode = await codigoAcesso.podeSolicitarCodigo(pool, membroId);
  if (!pode.podeEnviar) return { erro: pode.mensagem };
  const codigo = codigoAcesso.gerarCodigo();
  await codigoAcesso.registrarCodigo(pool, membroId, codigo);
  const enviado = await enviarEmailNotificacao({
    email, titulo: "Código de confirmação — Governança IEADESPA",
    mensagem: `Olá, ${nome || "irmão(ã)"}.\n\nSeu código de confirmação para ${motivo || "entrar no sistema"} é: ${codigo}\n\nEle vale por 10 minutos. Se não foi você, ignore esta mensagem e avise a Secretaria Geral.`
  });
  return enviado ? { sucesso: true } : { erro: "Não foi possível enviar o e-mail agora. Tente de novo em instantes." };
}
async function conferirCodigo(pool, membroId, codigo) {
  const r = await codigoAcesso.confirmarCodigo(pool, membroId, String(codigo || "").trim());
  return r.valido ? { sucesso: true } : { erro: r.mensagem };
}

const fatorRecente = (sessao) => !!(sessao && sessao.fator && sessao.fator.via && sessao.fator.via !== "NENHUM" && Number.isFinite(sessao.fator.em) && Date.now() - sessao.fator.em < FATOR_RECENTE_MS);

module.exports = {
  emitirBilhete, lerBilhete, origemDaRequisicao, mascararEmail, situacaoDaPessoa, chavesAtivas, semSegredos,
  opcoesDeCadastro, concluirCadastro, opcoesDeUso, conferirUso, removerChave, removerTodasAsChaves,
  enviarCodigo, conferirCodigo, fatorRecente, guardarDesafio, consumirDesafio,
  VALIDADE_BILHETE_MS, VALIDADE_DESAFIO_MS, FATOR_RECENTE_MS, ORIGENS_NOSSAS
};
