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
  const headers = (req && req.headers) || {};
  // O Azure Static Web Apps pode não repassar o header "Authorization" padrão
  // para a API. Usamos um header próprio (x-auth-token) como via principal.
  const direto = headers["x-auth-token"] || headers["X-Auth-Token"];
  if (direto) return String(direto).trim();
  const header = headers.authorization || headers.Authorization || "";
  const [tipo, token] = header.split(" ");
  return tipo === "Bearer" ? token : null;
}

// Mesmo corpo que exigirLogin tinha antes dos Termos (v2.7) — usada só pelo
// endpoint de assinatura (GestaoTermos), que não pode ficar preso atrás do
// próprio bloqueio que ele existe pra resolver.
function exigirLoginIgnorandoTermos(req, context) {
  const token = extrairToken(req);
  const sessao = token ? getSessao(token) : null;
  if (!sessao) {
    context.res = { status: 401, body: { sucesso: false, mensagem: "Faça login para continuar." } };
    return null;
  }
  return sessao;
}

// Uso: const usuario = exigirLogin(req, context); if (!usuario) return;
// Termos de Compromisso/Confidencialidade (v2.7) pendentes bloqueiam aqui —
// ponto único usado por exigirPermissao/exigirAlgumaPermissao/
// exigirNivelGlobal, então toda rota protegida do sistema já barra sozinha,
// sem precisar checar termo por endpoint.
function exigirLogin(req, context) {
  const sessao = exigirLoginIgnorandoTermos(req, context);
  if (!sessao) return null;
  if (sessao.termosPendentes && sessao.termosPendentes.length > 0) {
    context.res = {
      status: 403,
      body: { sucesso: false, mensagem: "Assine os termos pendentes para continuar.", termosPendentes: sessao.termosPendentes }
    };
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

// v4.5 — alçada de valor (Saídas): quanto maior o valor, mais "largo"
// precisa ser o nível de quem aprova. Não existia nenhuma comparação de
// amplitude entre níveis territoriais no sistema (só igualdade exata,
// como em exigirNivelGlobal) — esse ranking é novo, construído só pra essa
// necessidade, sem mexer em login/sessão.
const RANKING_NIVEL = { CONGREGACAO: 1, AREA: 2, REGIAO: 3, QUADRANTE: 4, DISTRITO: 5, GLOBAL: 6 };
function nivelAtingeMinimo(nivelUsuario, nivelMinimo) {
  return (RANKING_NIVEL[nivelUsuario] || 0) >= (RANKING_NIVEL[nivelMinimo] || 0);
}

// Uso: const usuario = exigirNivelGlobal(req, context); if (!usuario) return;
// Papeis.Nivel (GLOBAL/CONGREGACAO/AREA) existe desde a migração 002, mas nunca tinha
// sido checado em código (era só rótulo de exibição em GestaoLideranca) — v1.6 é a
// primeira ação restrita de verdade a esse nível: corrigir um Marco já lançado na
// Linha do Tempo do membro. Sessões emitidas antes desta mudança não têm `nivel` no
// token (precisam relogar).
function exigirNivelGlobal(req, context) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Ação restrita a papéis de nível Global." } };
    return null;
  }
  return usuario;
}

module.exports = { hashSenha, verificarSenha, criarSessao, encerrarSessao, getSessao, exigirLogin, exigirLoginIgnorandoTermos, exigirPermissao, exigirAlgumaPermissao, exigirNivelGlobal, estaNoEscopo, nivelAtingeMinimo };
