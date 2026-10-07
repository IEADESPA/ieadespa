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

// ---- Sessão em token assinado ----
// Não guarda a sessão em memória (Map). Em Azure Functions serverless há várias instâncias e
// cold starts; uma sessão em memória faz o usuário "desconectar" a cada troca de
// tela. Aqui o token carrega os dados do usuário assinados com HMAC, então qualquer
// instância consegue validar sem estado compartilhado. v7.6: a única coisa conferida contra o banco é a lista de sessões
// ENCERRADAS (ver "SESSÃO REVOGÁVEL" abaixo), sincronizada em memória pelo ponto de entrada.
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

// vB.9 — trilha de sessão: cada sessão nova ganha um SessaoId (sid) próprio, gravado em SessoesAtivas (dispositivo, criação) — usado pela tela "Minhas Sessões".
//
// v7.6 — SESSÃO REVOGÁVEL. Antes, encerrar uma sessão só marcava a trilha: o token valia até expirar sozinho (12 h). Agora toda rota HTTP entra por
// shared/entrada.js (o `scriptFile` de cada function.json), que antes de chamar o handler faz `await sincronizarRevogacoes()`: o processo guarda em memória
// o conjunto dos `sid` encerrados nas últimas 14 h (mais que a vida de um token), relido do banco no máximo a cada 3 s. getSessao/exigirLogin continuam
// SÍNCRONOS (os ~180 handlers não mudam) e só consultam esse conjunto. Encerrar (sair, "Minhas sessões", troca de senha, cargo alterado...) passa a derrubar o
// token em segundos em qualquer instância — e na hora, na instância que encerrou. Leitura falhou: o conjunto antigo vale por até 60 s; depois disso a entrada
// responde 503 (falha FECHADO: sem a lista, não dá para saber se o token foi derrubado). Token SEM `sid` não é revogável — só existe em teste e em token legado
// (anterior à vB.9, que já expirou há muito: 12 h); criarSessao sempre grava o sid.
const JANELA_REVOGADAS_HORAS = 14;
const INTERVALO_RELEITURA_MS = 3000;
const TOLERANCIA_FALHA_MS = 60000;
const MENSAGEM_SESSAO_ENCERRADA = "Sua sessão foi encerrada. Entre novamente.";
// Sessões que nasceram há mais que isso já expiraram (o token vive 12 h): revogar em massa só olha as mais novas — senão o histórico inteiro entraria no conjunto.
const IDADE_MAXIMA_SESSAO_ABERTA_HORAS = 13;
const estadoRevogacao = { revogadas: new Set(), locais: new Map(), lidaEm: 0, tentadaEm: 0, falhou: false, carregada: false, emAndamento: null };

const normalizarSid = (sid) => String(sid).toLowerCase();
// O `exceto` vai para uma coluna UNIQUEIDENTIFIER: o que não tem forma de GUID (sid de teste, valor estranho) não casa com sessão nenhuma — vira NULL.
const FORMA_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const guidOuNulo = (v) => (v !== undefined && v !== null && FORMA_GUID.test(String(v)) ? String(v) : null);
function sessaoRevogada(sid) {
  return sid !== undefined && sid !== null && estadoRevogacao.revogadas.has(normalizarSid(sid));
}
// A instância que encerra não espera a próxima leitura: marca na hora (e guarda por 60 s, para uma leitura que começou antes do UPDATE não apagar a marca).
function marcarRevogadas(sids) {
  const agora = Date.now();
  for (const sid of sids || []) {
    if (sid === undefined || sid === null) continue;
    estadoRevogacao.revogadas.add(normalizarSid(sid));
    estadoRevogacao.locais.set(normalizarSid(sid), agora);
  }
}
async function lerRevogadas(pool) {
  const r = await pool.request().query(`
    SELECT SessaoId FROM SessoesAtivas
    WHERE Encerrada = 1 AND EncerradaEm >= DATEADD(hour, -${JANELA_REVOGADAS_HORAS}, SYSUTCDATETIME())`);
  return (r.recordset || []).map((l) => l.SessaoId);
}
function aplicarLeitura(lidas) {
  const agora = Date.now();
  const novo = new Set((lidas || []).map(normalizarSid));
  for (const [sid, quando] of estadoRevogacao.locais) {
    if (agora - quando < TOLERANCIA_FALHA_MS) novo.add(sid);
    else estadoRevogacao.locais.delete(sid);
  }
  estadoRevogacao.revogadas = novo;
}

// Relê o conjunto de sessões encerradas (no máximo a cada 3 s; chamadas simultâneas esperam a MESMA leitura). Bloqueia na primeira vez. Lança erro (com
// `revogacaoIndisponivel: true`) quando não há conjunto confiável: nunca carregado, ou a última leitura boa tem mais de 60 s.
async function sincronizarRevogacoes({ obterPool } = {}) {
  const st = estadoRevogacao;
  const agora = Date.now();
  const cacheConfiavel = () => st.carregada && Date.now() - st.lidaEm <= TOLERANCIA_FALHA_MS;
  if (!st.emAndamento && agora - st.tentadaEm < INTERVALO_RELEITURA_MS) {
    if (cacheConfiavel()) return;
    if (st.falhou) throw Object.assign(new Error("Lista de sessões encerradas indisponível."), { revogacaoIndisponivel: true });
  }
  if (!st.emAndamento) {
    st.emAndamento = (async () => {
      try {
        const pool = await (obterPool || require("./db").getPool)();
        aplicarLeitura(await lerRevogadas(pool));
        st.lidaEm = Date.now();
        st.carregada = true;
        st.falhou = false;
      } catch (e) {
        st.falhou = true;
        throw e;
      } finally {
        st.tentadaEm = Date.now();
        st.emAndamento = null;
      }
    })();
  }
  try {
    await st.emAndamento;
  } catch (e) {
    if (cacheConfiavel()) return; // mantém o conjunto antigo (até 60 s)
    throw Object.assign(new Error("Lista de sessões encerradas indisponível: " + e.message), { revogacaoIndisponivel: true });
  }
}
// Só para teste: zera o estado do processo.
function _reiniciarRevogacoes() {
  Object.assign(estadoRevogacao, { revogadas: new Set(), locais: new Map(), lidaEm: 0, tentadaEm: 0, falhou: false, carregada: false, emAndamento: null });
}

async function criarSessao(pool, sql, info, dispositivoInfo) {
  const inserida = await pool.request()
    .input("membroId", sql.Int, info.membroId)
    .input("dispositivoInfo", sql.NVarChar(300), dispositivoInfo || null)
    .query(`INSERT INTO SessoesAtivas (MembroId, DispositivoInfo) OUTPUT INSERTED.SessaoId VALUES (@membroId, @dispositivoInfo)`);
  const sid = inserida.recordset[0].SessaoId;
  return assinar({ ...info, sid, exp: Date.now() + (1000 * 60 * 60 * 12) }); // 12 horas
}

// Derruba TODAS as sessões abertas de uma pessoa (cargo removido/alterado/suspenso, delegação cancelada, saiu do rol, PIN redefinido pela Secretaria...).
// `exceto`: o sid que fica (troca da própria senha: as OUTRAS caem, a atual continua). Devolve quantas caíram.
async function revogarSessoesDoMembro(pool, sql, membroId, { exceto } = {}) {
  const r = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("exceto", sql.UniqueIdentifier, guidOuNulo(exceto))
    .query(`
      UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME()
      OUTPUT INSERTED.SessaoId
      WHERE MembroId = @membroId AND Encerrada = 0
        AND CriadoEm >= DATEADD(hour, -${IDADE_MAXIMA_SESSAO_ABERTA_HORAS}, SYSUTCDATETIME())
        AND (@exceto IS NULL OR SessaoId <> @exceto)`);
  const sids = (r.recordset || []).map((l) => l.SessaoId);
  marcarRevogadas(sids);
  return sids.length;
}

// Derruba as sessões abertas de TODO MUNDO (o token carrega nomes de congregação e permissões de papel: renomear congregação, mudar a hierarquia ou as
// permissões de um papel deixaria tokens velhos alcançando o que não devem). `exceto`: a sessão de quem fez a mudança (é do nível geral e segue trabalhando).
async function revogarTodasAsSessoes(pool, sql, { exceto } = {}) {
  const r = await pool.request()
    .input("exceto", sql.UniqueIdentifier, guidOuNulo(exceto))
    .query(`
      UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME()
      OUTPUT INSERTED.SessaoId
      WHERE Encerrada = 0
        AND CriadoEm >= DATEADD(hour, -${IDADE_MAXIMA_SESSAO_ABERTA_HORAS}, SYSUTCDATETIME())
        AND (@exceto IS NULL OR SessaoId <> @exceto)`);
  const sids = (r.recordset || []).map((l) => l.SessaoId);
  marcarRevogadas(sids);
  return sids.length;
}

// ---- Concessões: escopo POR permissão (v7.6) ----
// Antes, o login fundia num só conjunto as permissões, o nível e o escopo do cargo próprio e de cada delegação recebida: uma delegação de "financeiro" da
// congregação B fazia o "pessoas" do cargo próprio (congregação A) alcançar B também. Agora o token carrega `concessoes` — uma por cargo próprio e uma por
// delegação ativa: { origem: "PROPRIA"|"DELEGACAO", delegacaoId?, ate?: "AAAA-MM-DD", permissoes, nivel, escopoCongregacoes, escopoExtensaoNome, departamentoId }.
// exigirPermissao("x") devolve uma VISÃO da sessão montada só com as concessões que têm "x" e não venceram (`ate` antes de hoje, no calendário de Brasília,
// ignora a concessão: a delegação que acabou deixa de valer na hora, e não quando o token expira). Nessa visão: escopo = união só dessas concessões, nível =
// o maior só delas, departamento só se todas restringem. As rotas que depois chamam estaNoEscopo/ehGeral/podeDepartamento não mudam: já recebem a visão certa.
// Token sem `concessoes` (os testes e as sessões de PIN/código) vira UMA concessão com os campos de topo — o mesmo comportamento de antes.
const CAMPOS_DA_VISAO = ["permissoes", "nivel", "escopoCongregacoes", "escopoExtensaoNome", "departamentoId"];
const { hojeBrasilia } = require("./dataBrasilia");

function concessaoSintetica(p) {
  const c = { origem: "PROPRIA" };
  for (const campo of CAMPOS_DA_VISAO) c[campo] = p[campo];
  return c;
}
function concessaoVigente(c, hoje) {
  return !!c && typeof c === "object" && !(typeof c.ate === "string" && c.ate < hoje);
}
const listaDePermissoes = (c) => (Array.isArray(c.permissoes) ? c.permissoes : []);

// Monta a visão: os campos da sessão (membroId, nome, via, sid, termosPendentes...) + os 5 campos calculados SÓ com `escolhidas`. Duas propriedades internas
// (não enumeráveis: não vão para JSON nem para comparação de teste) guardam as concessões vigentes e as da visão — é delas que sai a próxima visão.
function montarVisao(base, vigentes, escolhidas) {
  const v = {};
  for (const k of Object.keys(base)) if (k !== "exp") v[k] = base[k];
  if (escolhidas.length === 1) {
    // uma concessão só: copia os campos como estão (é o caso de todo token legado/de teste — comportamento idêntico ao de antes)
    for (const campo of CAMPOS_DA_VISAO) v[campo] = escolhidas[0][campo];
    v.permissoes = listaDePermissoes(escolhidas[0]);
  } else {
    v.permissoes = [...new Set(escolhidas.flatMap(listaDePermissoes))];
    let nivel = escolhidas.length ? escolhidas[0].nivel : null;
    for (const c of escolhidas) if ((RANKING_NIVEL[c.nivel] || 0) > (RANKING_NIVEL[nivel] || 0)) nivel = c.nivel;
    v.nivel = nivel === undefined ? null : nivel;
    if (escolhidas.some((c) => c.escopoCongregacoes === "TODAS")) v.escopoCongregacoes = "TODAS";
    else v.escopoCongregacoes = [...new Set(escolhidas.flatMap((c) => (Array.isArray(c.escopoCongregacoes) ? c.escopoCongregacoes : [])))];
    // Extensão: o campo de topo fica com a extensão se ALGUMA concessão é de extensão (quem só lê o campo de topo erra para o lado fechado);
    // escopoRotas.noEscopoDaPessoa olha concessão por concessão e acerta.
    const comExtensao = escolhidas.find((c) => c.escopoExtensaoNome);
    v.escopoExtensaoNome = comExtensao ? comExtensao.escopoExtensaoNome : null;
    const restringem = escolhidas.length > 0 && escolhidas.every((c) => c.departamentoId);
    v.departamentoId = restringem ? escolhidas[0].departamentoId : null;
  }
  Object.defineProperty(v, "_vigentes", { value: vigentes, enumerable: false });
  Object.defineProperty(v, "_daVisao", { value: escolhidas, enumerable: false });
  return v;
}

// Visão com TODAS as concessões vigentes (o que exigirLogin devolve: a "sessão inteira", para a tela e para as rotas sem permissão específica).
function visaoCompleta(payload) {
  const hoje = hojeBrasilia();
  const todas = Array.isArray(payload.concessoes) ? payload.concessoes : [concessaoSintetica(payload)];
  const vigentes = todas.filter((c) => concessaoVigente(c, hoje));
  return montarVisao(payload, vigentes, vigentes);
}
function concessoesVigentes(usuario) {
  if (!usuario) return [];
  if (Array.isArray(usuario._vigentes)) return usuario._vigentes;
  const hoje = hojeBrasilia();
  return (Array.isArray(usuario.concessoes) ? usuario.concessoes : [concessaoSintetica(usuario)]).filter((c) => concessaoVigente(c, hoje));
}
// Concessões que compõem esta visão (para quem precisa decidir concessão por concessão: ehGeral, noEscopoDaPessoa, podeDepartamento).
function concessoesDaVisao(usuario) {
  if (!usuario) return [];
  return Array.isArray(usuario._daVisao) ? usuario._daVisao : concessoesVigentes(usuario);
}

// A visão da sessão para UMA permissão (ou qualquer uma de uma lista): só as concessões vigentes que a têm. null = não tem a permissão em concessão vigente.
// Uso fora de auth.js: `const v = auth.visaoDaPermissao(usuario, "disciplina"); if (v && estaNoEscopo(v, nome)) ...` — nunca `usuario.permissoes.includes(...)`
// seguido de conferência de escopo com o `usuario` de outra permissão.
function visaoDaPermissao(usuario, chaves) {
  if (!usuario) return null;
  const lista = Array.isArray(chaves) ? chaves : [chaves];
  const vigentes = concessoesVigentes(usuario);
  const escolhidas = vigentes.filter((c) => lista.some((k) => listaDePermissoes(c).includes(k)));
  if (escolhidas.length === 0) return null;
  const base = {};
  for (const k of Object.keys(usuario)) if (!CAMPOS_DA_VISAO.includes(k)) base[k] = usuario[k];
  return montarVisao(base, vigentes, escolhidas);
}
// Estreita uma visão às concessões dela que passam no filtro (ex.: só as do nível geral). null = nenhuma passa.
function restringirVisao(usuario, filtro) {
  if (!usuario) return null;
  const escolhidas = concessoesDaVisao(usuario).filter(filtro);
  if (escolhidas.length === 0) return null;
  const base = {};
  for (const k of Object.keys(usuario)) if (!CAMPOS_DA_VISAO.includes(k)) base[k] = usuario[k];
  return montarVisao(base, concessoesVigentes(usuario), escolhidas);
}
// O nível do CARGO PRÓPRIO (não o maior das concessões): é o que decide quais termos a pessoa assina (o Termo de Compromisso do Dirigente é do papel dela, não
// de uma delegação recebida) — o mesmo que o login usa em termosPendentes.
function nivelDoCargoProprio(usuario) {
  if (!usuario) return null;
  const todas = Array.isArray(usuario.concessoes) ? usuario.concessoes : null;
  if (!todas) return usuario.nivel === undefined ? null : usuario.nivel;
  const propria = todas.find((c) => c && c.origem === "PROPRIA");
  return propria ? (propria.nivel === undefined ? null : propria.nivel) : null;
}
function temPermissao(usuario, chave) {
  return !!visaoDaPermissao(usuario, chave);
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
// Preserva tudo o que o token já carrega (sid, concessoes, via, pinProvisorio...); token de sessão encerrada não é reassinado.
function reassinarMantendoValidade(token, novasClaims) {
  const payload = verificarToken(token);
  if (!payload || !payload.exp || sessaoRevogada(payload.sid)) return null;
  return assinar({ ...payload, ...novasClaims, exp: payload.exp });
}

async function encerrarSessao(pool, sql, token) {
  const payload = verificarToken(token);
  if (!payload || !payload.sid) return true; // token inválido/sem sid (sessão antiga, pré-vB.9) — nada a marcar, não é erro
  await pool.request().input("id", sql.UniqueIdentifier, payload.sid)
    .query(`UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() WHERE SessaoId = @id`);
  marcarRevogadas([payload.sid]);
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
  marcarRevogadas([sessaoId]);
  return true;
}

// A sessão inteira (visão com todas as concessões vigentes), ou null se o token não vale, expirou ou foi encerrado.
function getSessao(token) {
  if (!token) return null;
  const payload = verificarToken(token);
  if (!payload || sessaoRevogada(payload.sid)) return null;
  return visaoCompleta(payload);
}

// O token tem assinatura válida e está no prazo, mas a sessão foi encerrada? (para a mensagem de 401 dizer isso, e o front tratar como sessão vencida)
function tokenRevogado(token) {
  const payload = token ? verificarToken(token) : null;
  return !!payload && sessaoRevogada(payload.sid);
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
    context.res = { status: 401, body: { sucesso: false, mensagem: tokenRevogado(token) ? MENSAGEM_SESSAO_ENCERRADA : "Faça login para continuar." } };
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
// v7.6 — devolve a VISÃO da sessão só com as concessões vigentes que têm a chave (ver "Concessões" acima): o escopo/nível/departamento que a rota usar depois
// é o DESTA permissão, nunca o somado de outro cargo ou delegação.
function exigirPermissao(req, context, chave) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  const visao = visaoDaPermissao(usuario, chave);
  if (!visao) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    return null;
  }
  return visao;
}

// Uso: const usuario = exigirAlgumaPermissao(req, context, ["reunioes", "assembleia"]); if (!usuario) return;
// Passa se a pessoa tiver QUALQUER uma das chaves - usado pelo motor generico de
// Sessoes/Presencas (AbrirReuniao, EncerrarReuniao, ListarFrequencia etc.), que e
// compartilhado entre o orgao do Ministerio ("reunioes") e a Assembleia Geral
// ("assembleia") sem ter uma permissao por orgao.
function exigirAlgumaPermissao(req, context, chaves) {
  const usuario = exigirLogin(req, context);
  if (!usuario) return null;
  const visao = Array.isArray(chaves) ? visaoDaPermissao(usuario, chaves) : null;
  if (!visao) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    return null;
  }
  return visao;
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
// v7.6 — na visão de várias concessões, o departamento só restringe se TODAS restringem; e então vale qualquer um dos departamentos delas.
function podeDepartamento(usuario, departamentoId) {
  if (!usuario.departamentoId) return true;
  const daVisao = Array.isArray(usuario._daVisao) && usuario._daVisao.length > 1 ? usuario._daVisao : null;
  if (daVisao) return daVisao.some((c) => Number(c.departamentoId) === Number(departamentoId));
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
  // v7.6 — a visão devolvida é só a das concessões de nível Global (o escopo de um cargo local ou de uma delegação local não pega carona).
  const visao = restringirVisao(usuario, (c) => c.nivel === "GLOBAL");
  if (!visao) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Ação restrita a papéis de nível Global." } };
    return null;
  }
  return visao;
}

// vD.4 — confirmação reforçada: os quatro atos (aprovar saída acima do valor dos quatro olhos, gerar remessa, conceder/retirar
// permissão ou cargo, exclusão LGPD) exigem que a última confirmação por chave de acesso ou código tenha menos de 10 minutos.
// Responde 428 com { precisaFator: true }: a tela confirma de novo (chaves-acesso/confirmar) e repete a chamada.
function exigirFatorRecente(req, context) {
  const sessao = getSessao(extrairToken(req));
  if (!sessao) { context.res = { status: 401, body: { sucesso: false, mensagem: "Sessão inválida ou expirada." } }; return false; }
  const f = sessao.fator;
  const recente = !!(f && f.via && f.via !== "NENHUM" && Number.isFinite(f.em) && Date.now() - f.em < 10 * 60 * 1000);
  if (recente) return true;
  context.res = { status: 428, headers: { "Content-Type": "application/json" }, body: { sucesso: false, precisaFator: true, mensagem: "Este ato exige confirmação recente de quem você é (chave de acesso ou código por e-mail)." } };
  return false;
}

module.exports = { exigirFatorRecente, sincronizarRevogacoes, revogarSessoesDoMembro, revogarTodasAsSessoes, marcarRevogadas, sessaoRevogada, tokenRevogado, _reiniciarRevogacoes, MENSAGEM_SESSAO_ENCERRADA,
  visaoDaPermissao, temPermissao, restringirVisao, concessoesDaVisao, concessoesVigentes, nivelDoCargoProprio, hashSenha, verificarSenha, criarSessao, reassinarSessao, reassinarMantendoValidade, ehSessaoDeLideranca, exigirSessaoDeLideranca, extrairToken, encerrarSessao, listarSessoes, encerrarSessaoEspecifica, getSessao, idDeRota, exigirTitular, exigirLogin, exigirLoginIgnorandoTermos, exigirPermissao, exigirAlgumaPermissao, exigirNivelGlobal, estaNoEscopo, podeDepartamento, nivelAtingeMinimo, RANKING_NIVEL };
