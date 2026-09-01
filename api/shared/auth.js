// shared/auth.js
// Autenticação da Secretaria: só quem tem registro em Lideranca (Dirigente,
// Pastor de Área etc.) consegue logar. Senha com hash (scrypt nativo do
// Node, sem dependência nova) + sessão como token opaco guardado em memória.
// Quando isso for para produção de verdade, o candidato natural é trocar
// essa sessão em memória por um provedor de identidade (Azure AD / SWA
// auth) — para uso interno hoje, isso já é login real, não decorativo.
const crypto = require("crypto");

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(senha), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verificarSenha(senha, senhaHash) {
  if (!senhaHash) return false;
  const [salt, hash] = senhaHash.split(":");
  if (!salt || !hash) return false;
  const hashTentativa = crypto.scryptSync(String(senha), salt, 64).toString("hex");
  const bufHash = Buffer.from(hash, "hex");
  const bufTentativa = Buffer.from(hashTentativa, "hex");
  if (bufHash.length !== bufTentativa.length) return false;
  return crypto.timingSafeEqual(bufHash, bufTentativa);
}

// ---- Sessão STATELESS (token assinado) ----
// Não usa memória (Map). Em Azure Functions serverless há várias instâncias e
// cold starts; uma sessão em memória faz o usuário "desconectar" a cada troca de
// tela. Aqui o token carrega os dados do usuário assinados com HMAC, então qualquer
// instância consegue validar sem estado compartilhado.
// O segredo vem de AUTH_SECRET (obrigatório definir em produção no Azure).
const SEGREDO = process.env.AUTH_SECRET || "dev-secret-ieadespa";

function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const assinatura = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("base64url");
  return `${corpo}.${assinatura}`;
}

function verificarToken(token) {
  try {
    const [corpo, assinatura] = String(token).split(".");
    if (!corpo || !assinatura) return null;
    const esperada = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("base64url");
    const bufA = Buffer.from(assinatura);
    const bufE = Buffer.from(esperada);
    if (bufA.length !== bufE.length || !crypto.timingSafeEqual(bufA, bufE)) return null;
    const payload = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function criarSessao(info) {
  return assinar({ ...info, exp: Date.now() + (1000 * 60 * 60 * 12) }); // 12 horas
}

function encerrarSessao() {
  return true; // stateless: descartar o token no cliente já "encerra"
}

function getSessao(token) {
  if (!token) return null;
  const payload = verificarToken(token);
  if (!payload) return null;
  const { exp, ...info } = payload;
  return info;
}

function extrairToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const [tipo, token] = header.split(" ");
  return tipo === "Bearer" ? token : null;
}

// Uso: const usuario = exigirLogin(req, context); if (!usuario) return;
function exigirLogin(req, context) {
  const token = extrairToken(req);
  const sessao = token ? getSessao(token) : null;
  if (!sessao) {
    context.res = { status: 401, body: { sucesso: false, mensagem: "Faça login para continuar." } };
    return null;
  }
  return sessao;
}

// Uso: const usuario = exigirPermissao(req, context, "pessoas"); if (!usuario) return;
// Permissão são chaves livres definidas em Lideranca.Permissoes: "reunioes",
// "pessoas", "permissoes", "consagracoes" — o que cada pessoa pode fazer,
// independente do "Tipo" (que é só um rótulo/cargo de exibição).
function exigirPermissao(req, context, chave) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  if (!usuario.permissoes || !usuario.permissoes.includes(chave)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    return null;
  }
  return usuario;
}

// Uso: const usuario = exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]); if (!usuario) return;
// Passa se a pessoa tiver QUALQUER uma das chaves - usado pelo motor generico de
// Sessoes/Presencas (AbrirReuniao, EncerrarReuniao, ListarFrequencia etc.), que e
// compartilhado entre o orgao do Ministerio ("reunioes") e a Assembleia Geral
// ("assembleia") sem ter uma permissao por orgao.
function exigirAlgumaPermissao(req, context, chaves) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  const tem = usuario.permissoes && chaves.some(chave => usuario.permissoes.includes(chave));
  if (!tem) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    return null;
  }
  return usuario;
}

// Escopo: 'TODAS' (string) ou array de nomes de congregação. 'TODAS' sempre passa.
function estaNoEscopo(usuario, congregacaoNome) {
  if (!usuario.escopoCongregacoes || usuario.escopoCongregacoes === "TODAS") return true;
  if (!congregacaoNome) return false;
  return usuario.escopoCongregacoes.includes(congregacaoNome);
}

module.exports = { hashSenha, verificarSenha, criarSessao, encerrarSessao, getSessao, exigirLogin, exigirPermissao, exigirAlgumaPermissao, estaNoEscopo };
