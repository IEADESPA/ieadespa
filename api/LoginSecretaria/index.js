// LoginSecretaria
// Só quem tem registro em Lideranca (Dirigente, Pastor de Área etc.) consegue
// logar no painel da Secretaria. Ver api/shared/auth.js.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("../shared/escopo");
const { ehGeral } = require("../shared/escopoRotas");
const { termosPendentes } = require("../shared/termos");
const { concessoesDelegadas } = require("../shared/delegacoes");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { permissoesComRecertificacaoExpirada } = require("../shared/compliance");
const pinMembro = require("../shared/pinMembro");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// fecho da v7.5 — o login da liderança não tinha limite de tentativas. Agora: contenção por origem (por instância) e bloqueio por pessoa depois de 10 erros
// (15 min, que cresce se continuarem errando). Uma mensagem só para matrícula sem acesso, senha errada e pessoa bloqueada: não diz quem é da liderança.
const limitador = criarLimitador({ janelaMs: 60000, maximo: 30 });
const MENSAGEM_FALHA = "Matrícula ou senha incorreta, ou acesso bloqueado por muitas tentativas.";
// Hash de mentira, só para gastar o mesmo tempo de uma conferência verdadeira: quem pergunta por matrícula que não é da liderança (ou que está bloqueada)
// não distingue pelo tempo da resposta.
const HASH_FALSO = `${"0".repeat(32)}:${"0".repeat(128)}`;
const conferenciaFalsa = (senha) => { auth.verificarSenha(senha, HASH_FALSO); };

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const matricula = auth.idDeRota(corpo.matricula);
  const senha = typeof corpo.senha === "string" || typeof corpo.senha === "number" ? corpo.senha : null;

  if (!matricula || senha === null || senha === "") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT l.MembroId AS membroId, l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, l.SenhaHash AS senhaHash,
           l.DepartamentoId AS departamentoId,
           CONVERT(varchar(10), l.AtivoAte, 120) AS ativoAte,
           p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr, m.Nome AS nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.MembroId = @mat
  `);
  if (result.recordset.length === 0) {
    conferenciaFalsa(senha);
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }

  // A tentativa é reservada ANTES de conferir a senha (tentativas simultâneas não passam do limite); quem acerta zera o contador.
  const reserva = await pinMembro.reservarTentativa(pool, matricula, "SENHA", pinMembro.LIMITE_FALHAS_SENHA);
  if (reserva.bloqueado) {
    conferenciaFalsa(senha);
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }

  // vB.9 — achado real (v4.5): quando a matrícula tem mais de um papel de
  // Lideranca, não existia critério nenhum pra escolher qual (nem TOP 1,
  // nem ORDER BY) — o SQL Server devolvia em ordem indefinida, então tanto
  // fazia qual senha/permissão/nível "vencia" a cada login, sem ninguém
  // decidir isso de propósito (podia até cair numa linha sem SenhaHash e
  // travar o login de vez). Corrigido: confere a senha contra TODAS as
  // linhas com hash, e entre as que baterem, escolhe a de MAIOR amplitude
  // territorial (RANKING_NIVEL) — critério único e sempre o mesmo.
  const candidatas = result.recordset.filter((l) => l.senhaHash && auth.verificarSenha(senha, l.senhaHash));
  if (candidatas.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: MENSAGEM_FALHA } };
    return;
  }
  await pinMembro.limparTentativas(pool, matricula, "SENHA");
  candidatas.sort((a, b) => (auth.RANKING_NIVEL[b.papelNivel] || 0) - (auth.RANKING_NIVEL[a.papelNivel] || 0));
  const lideranca = candidatas[0];

  // Art. 45 §1º, I — Medida Cautelar de suspensão de acesso ao sistema
  // (GestaoMedidasCautelares grava AtivoAte = hoje na hora que aplica).
  // v7.6 — "hoje" no calendário de Brasília, o mesmo que a sessão usa para descartar concessão vencida (shared/auth.js).
  const hoje = hojeBrasilia();
  if (lideranca.ativoAte && lideranca.ativoAte < hoje) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Acesso suspenso — procure a Secretaria Geral." } };
    return;
  }

  const permissoesProprias = lideranca.permissoesStr ? lideranca.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : [];

  // v10.2 — achado real de medição ao vivo (19/09): login media 3.66s numa
  // Function fria / 0.82s já quente, e a fatia "quente" era majoritariamente
  // estas 5 consultas rodando em SÉRIE (await uma a uma) sem nenhuma delas
  // depender do resultado da anterior — só se combinam depois daqui.
  // Promise.all corta ~4 idas e vindas ao Azure SQL do caminho mais sensível
  // a latência do sistema (todo login passa por ele).
  const [escopo, escopoExtensaoNome, pendentes, delegados, expiradas] = await Promise.all([
    resolverEscopoCongregacoes(pool, lideranca.escopoTipo, lideranca.escopoId),
    resolverNomeExtensao(pool, lideranca.escopoTipo, lideranca.escopoId),
    termosPendentes(pool, sql, lideranca.membroId, lideranca.papelNivel),
    // vB.9 — delegação temporária: o que outra pessoa te delegou por um prazo, sem precisar emprestar senha de ninguém. v7.6 — cada delegação vira uma
    // CONCESSÃO à parte (com o escopo e o prazo dela), em vez de somar permissões e escopo num conjunto só.
    concessoesDelegadas(pool, sql, lideranca.membroId, hoje),
    // vB.9 — revisão periódica com efeito real: permissão cuja recertificação
    // mais recente está EXPIRADA (v4.12, hoje generalizada a todos os papéis)
    // não entra na sessão nova, até alguém confirmar de novo (GestaoCompliance).
    permissoesComRecertificacaoExpirada(pool, sql, lideranca.membroId)
  ]);
  const { delegacoesAtivas } = delegados;
  const delegadas = delegados.concessoes.map((c) => ({ ...c, permissoes: c.permissoes.filter((p) => !expiradas.includes(p)) }));

  const concessaoPropria = {
    origem: "PROPRIA",
    // último dia do mandato/cargo (Lideranca.AtivoAte): passou, a concessão deixa de valer sozinha, sem esperar o token expirar
    ate: lideranca.ativoAte || null,
    permissoes: permissoesProprias.filter((p) => !expiradas.includes(p)),
    nivel: lideranca.papelNivel,
    escopoCongregacoes: escopo,
    escopoExtensaoNome,
    // v5.2 — Líder Local/de Área de um departamento específico (Lideranca.DepartamentoId). NULL = enxerga todos (Dirigente, Pastor de Área). Mesma limitação
    // de sempre no "escolhe 1 vínculo por login" acima: o cargo próprio da sessão é UM (o de maior amplitude territorial cuja senha confere).
    // v5.3 — Líder Geral (v2.7) guarda o departamento em `EscopoTipo='DEPARTAMENTO'`, `EscopoId`=departamentoId (mecanismo mais antigo, sem território), não
    // na coluna `DepartamentoId`: sem este `||`, `auth.podeDepartamento` barrava ele até das próprias aprovações.
    departamentoId: lideranca.escopoTipo === "DEPARTAMENTO" ? lideranca.escopoId : (lideranca.departamentoId || null)
  };
  const concessoes = [concessaoPropria, ...delegadas];

  // vB.9 — trilha de sessão: guarda o dispositivo (User-Agent) que logou,
  // pra tela "Minhas Sessões".
  const dispositivoInfo = (req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || null;
  // v7.6 — o token leva só as concessões; permissões, nível e escopo de topo são calculados delas a cada requisição (auth.getSessao) — não vão repetidos no
  // token (o escopo de um cargo de distrito são centenas de nomes).
  const token = await auth.criarSessao(pool, sql, {
    membroId: lideranca.membroId,
    nome: lideranca.nome,
    tipo: lideranca.papelNome,
    concessoes,
    termosPendentes: pendentes,
    // fecho da v7.5 — a sessão nasceu da SENHA de acesso administrativo: é isso que as rotas que dependem de "ser a liderança" (trocar a senha, aprovar etapa de
    // fluxo, delegar papel) exigem; a sessão de PIN ou de código (via:"PIN"/"CODIGO") é de membro, ainda que a pessoa tenha cargo.
    via: "SENHA"
  }, dispositivoInfo);
  // O que a TELA mostra (menus, rótulos): a sessão inteira, com todas as concessões juntas. Quem decide acesso é a API, permissão por permissão.
  const sessao = auth.getSessao(token);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      token,
      nome: lideranca.nome,
      tipo: lideranca.papelNome,
      nivel: lideranca.papelNivel,
      escopo: sessao.escopoCongregacoes,
      // v7.6 — "geral" calculado aqui com a MESMA regra das rotas (escopoRotas.ehGeral: nível Global e escopo TODAS numa mesma concessão). nivel/escopo acima
      // juntam concessões diferentes (cargo próprio + delegação) e podiam fazer a tela mostrar como geral quem o servidor recusa. Só decide o que aparece.
      geral: ehGeral(sessao),
      permissoes: sessao.permissoes,
      termosPendentes: pendentes,
      delegacoesAtivas
    }
  };
};
