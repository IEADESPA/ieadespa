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
// O segredo vem de AUTH_SECRET (obrigatório no Azure: sem ele a Function se recusa a subir — ver shared/segredoSessao.js; nunca há um valor padrão público).
const SEGREDO = require("./segredoSessao").resolverSegredo();

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

// vB.9 — trilha de sessão: cada sessão nova ganha um SessaoId (sid) próprio,
// gravado em SessoesAtivas (dispositivo, criação) — usado pela tela "Minhas
// Sessões" e por encerrarSessao. Limitação real, deliberada: a validação
// de token (getSessao/exigirLogin) continua 100% síncrona e sem tocar o
// banco — mudar isso pra checar revogação em toda requisição exigiria
// tornar exigirLogin assíncrono e re-testar as ~140 Functions que o chamam
// hoje sem `await`, risco desproporcional aqui. Por isso encerrar uma
// sessão marca a trilha, mas o token em si só perde validade quando expira
// sozinho (12h) — ver README vB.9.
async function criarSessao(pool, sql, info, dispositivoInfo) {
  const inserida = await pool.request()
    .input("membroId", sql.Int, info.membroId)
    .input("dispositivoInfo", sql.NVarChar(300), dispositivoInfo || null)
    .query(`INSERT INTO SessoesAtivas (MembroId, DispositivoInfo) OUTPUT INSERTED.SessaoId VALUES (@membroId, @dispositivoInfo)`);
  const sid = inserida.recordset[0].SessaoId;
  return assinar({ ...info, sid, exp: Date.now() + (1000 * 60 * 60 * 12) }); // 12 horas
}

// Reemite o token com claims atualizadas (ex: termosPendentes depois de
// assinar um termo) SEM abrir uma sessão rastreada nova — é a mesma sessão
// de sempre, só o conteúdo do token mudou. `info.sid`, se vier, é
// preservado; nunca cria linha nova em SessoesAtivas (senão "Minhas
// Sessões" inflaria a cada refresh de token no meio do uso).
function reassinarSessao(info) {
  return assinar({ ...info, exp: Date.now() + (1000 * 60 * 60 * 12) });
}

// Reemite o token com claims novas MANTENDO a validade original: quem troca o PIN não ganha outras 12 horas (um token roubado não se renova sozinho). Devolve null
// se o token não vale.
function reassinarMantendoValidade(token, novasClaims) {
  const payload = verificarToken(token);
  if (!payload || !payload.exp) return null;
  return assinar({ ...payload, ...novasClaims, exp: payload.exp });
}

async function encerrarSessao(pool, sql, token) {
  const payload = verificarToken(token);
  if (!payload || !payload.sid) return true; // token inválido/sem sid (sessão antiga, pré-vB.9) — nada a marcar, não é erro
  await pool.request().input("id", sql.UniqueIdentifier, payload.sid)
    .query(`UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() WHERE SessaoId = @id`);
  return true;
}

async function listarSessoes(pool, sql, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 20 SessaoId AS sessaoId, DispositivoInfo AS dispositivoInfo,
           CONVERT(varchar(33), CriadoEm, 126) AS criadoEm, Encerrada AS encerrada
    FROM SessoesAtivas WHERE MembroId = @membroId ORDER BY CriadoEm DESC
  `);
  return result.recordset;
}

// Só o dono da sessão pode encerrá-la — checagem de posse aqui, não deixada
// pra quem chama.
async function encerrarSessaoEspecifica(pool, sql, membroId, sessaoId) {
  const dona = await pool.request().input("id", sql.UniqueIdentifier, sessaoId).query(`SELECT MembroId FROM SessoesAtivas WHERE SessaoId = @id`);
  if (dona.recordset.length === 0 || dona.recordset[0].MembroId !== membroId) return false;
  await pool.request().input("id", sql.UniqueIdentifier, sessaoId)
    .query(`UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() WHERE SessaoId = @id`);
  return true;
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
// `permitirProvisorio`: só a rota de criar o PIN (MembroPin) aceita a sessão aberta com o PIN PROVISÓRIO que a Secretaria gerou. Em todas as outras essa sessão é
// recusada (403 com `criarPin`): o provisório é uma credencial que a Secretaria conhece e só serve para a pessoa escolher o PIN dela.
function exigirLoginIgnorandoTermos(req, context, { permitirProvisorio = false } = {}) {
  const token = extrairToken(req);
  const sessao = token ? getSessao(token) : null;
  if (!sessao) {
    context.res = { status: 401, body: { sucesso: false, mensagem: "Faça login para continuar." } };
    return null;
  }
  if (sessao.pinProvisorio === true && !permitirProvisorio) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Crie o seu PIN para continuar.", criarPin: true } };
    return null;
  }
  return sessao;
}

// A sessão nasceu de uma SENHA de acesso administrativo (LoginSecretaria põe via:"SENHA")? A sessão de PIN ou de código (via:"PIN"/"CODIGO") é de MEMBRO, mesmo
// quando a pessoa também tem cargo na liderança: ela serve para os dados da própria pessoa, nunca para o que depende de ser "a liderança" (trocar a senha,
// aprovar etapa de fluxo, delegar papel). Tokens emitidos antes desta marca (12 h no máximo) não têm `via`: valem como liderança só se carregam o nível do papel.
function ehSessaoDeLideranca(usuario) {
  return usuario.via === "SENHA" || (usuario.via === undefined && !!usuario.nivel);
}
function exigirSessaoDeLideranca(req, context) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  if (!ehSessaoDeLideranca(usuario)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Esta ação exige entrar com a senha de acesso administrativo (não vale a entrada por PIN ou por código)." } };
    return null;
  }
  return usuario;
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

// Número inteiro positivo na forma canônica (só dígitos, sem zero à esquerda nem espaço), como chega na rota ou na query, dentro do INT do SQL.
// "0x10", "1e1", " 5", "05", "-1", "1.5", true e [5] viram null — uma matrícula só tem uma grafia.
function idDeRota(v) {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v);
  if (!/^[1-9]\d{0,9}$/.test(s)) return null;
  const n = Number(s);
  return n <= 2147483647 ? n : null;
}

// Rotas de AUTOATENDIMENTO ("meus dados", "minha foto"...): a matrícula da rota é a pessoa, então ela precisa ser a pessoa da sessão. Antes bastava o número
// (inteiros em sequência, que qualquer um adivinha). 401 sem sessão, 400 se a matrícula é malformada, 403 se é de outra pessoa — e o 403 é o mesmo
// exista ou não a matrícula, para a resposta não dizer quem tem cadastro. Termos pendentes não bloqueiam: é o dado da própria pessoa.
function exigirTitular(req, context, matriculaDaRota) {
  const usuario = exigirLoginIgnorandoTermos(req, context);
  if (!usuario) return null;
  const alvo = idDeRota(matriculaDaRota);
  if (!alvo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula inválida." } };
    return null;
  }
  if (Number(usuario.membroId) !== alvo) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você só pode acessar os seus próprios dados." } };
    return null;
  }
  return usuario;
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

// Escopo: 'TODAS' (string) ou array de nomes de congregação. 'TODAS' sempre passa. FALHA FECHADO: sessão sem a lista (token antigo, claim ausente) não alcança nada —
// antes, "sem lista" valia como "todas", o que dava acesso total a quem não deveria.
function estaNoEscopo(usuario, congregacaoNome) {
  const escopo = usuario && usuario.escopoCongregacoes;
  if (escopo === "TODAS") return true;
  if (!Array.isArray(escopo) || !congregacaoNome) return false;
  return escopo.includes(congregacaoNome);
}

// v5.2 — Lideranca.DepartamentoId (nullable, ortogonal ao EscopoTipo/EscopoId
// territorial): NULL enxerga todos os departamentos daquele escopo (é assim
// que Dirigente de Congregação e Pastor de Área já funcionam, sem mudança
// nenhuma neles); preenchido, restringe o papel a um departamento só (Líder
// Local, Líder de Área do departamento — papéis novos da v5.2).
function podeDepartamento(usuario, departamentoId) {
  if (!usuario.departamentoId) return true;
  return Number(usuario.departamentoId) === Number(departamentoId);
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

module.exports = { hashSenha, verificarSenha, criarSessao, reassinarSessao, reassinarMantendoValidade, ehSessaoDeLideranca, exigirSessaoDeLideranca, extrairToken, encerrarSessao, listarSessoes, encerrarSessaoEspecifica, getSessao, idDeRota, exigirTitular, exigirLogin, exigirLoginIgnorandoTermos, exigirPermissao, exigirAlgumaPermissao, exigirNivelGlobal, estaNoEscopo, podeDepartamento, nivelAtingeMinimo, RANKING_NIVEL };
