// shared/identidadeVisualDb.js (v7.14 — Identidade Visual Anual, Regimento Art. 159) — o banco. A regra está em shared/identidadeVisual.js (pura, testada).
//
// O ciclo é aberto pela Diretoria (permissão identidade_visual, nível Geral — Art. 126-Q, II) e anda SÓ pela data de Brasília: sugestões (01–15/nov), triagem (16–21/nov),
// votação (22–30/nov, pela Enquete, em Meu Painel), arte e escolha final (dezembro). Nada aqui "abre" etapa; duas coisas são materializadas quando a data chega, por quem
// tocar primeiro no ciclo (a rotina diária das 7h ou qualquer acesso) — sempre debaixo da trava do ciclo, então duas chamadas juntas fazem uma vez só:
//   (a) no dia 22, com pelo menos 2 finalistas, a enquete da votação nasce (uma por ciclo; a cédula congela no banco);
//   (b) passada a meia-noite do dia 30 (Brasília), a enquete fecha e é apurada (só contam os votos de antes do instante; empate e "nenhum voto" ficam para a Diretoria).
// O resultado do culto (arte + cor) entra sozinho na lista de temas já usados. Sugestão e arte são dados do membro: Meus Dados mostra, a exclusão LGPD e a retenção tiram o
// nome (e a imagem não escolhida sai do armazenamento); as contagens, os finalistas e o escolhido ficam.
const crypto = require("crypto");
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const iv = require("./identidadeVisual");
const { hojeBrasilia } = require("./dataBrasilia");
const { obterTrava } = require("./financeiroSeguro");
const { aptoEmComunhao } = require("./enquetes");

const PERMISSAO = iv.PERMISSAO;
const RETENCAO_CATEGORIA = "Identidade visual — sugestões e artes dos membros";
const RETENCAO_PADRAO = 365;
const TEXTO_ANONIMO = "(removida a pedido do titular)";

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const RECUSA = (mensagem, extra = {}) => ({ sucesso: false, mensagem, ...extra });
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const OCUPADO = (mensagem) => ({ sucesso: false, limite: true, mensagem });
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const contagem = (x) => Number((((x && x.recordset) || [])[0] || {}).n) || 0;
const afetadas = (x) => Number(((x && x.rowsAffected) || [0])[0]) || 0;
async function fecharTransacao(t, ok) { try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { /* já encerrada */ } }
// A auditoria guarda o código do ato e, nos atos da liderança, quem fez e o número do registro — nunca o texto da sugestão. Nos atos do PRÓPRIO membro sobre a sugestão ou a
// arte dele (mandar, retirar), a trilha não guarda a pessoa nem o número da sugestão/arte, só o ciclo (auditarDoMembro): a trilha é encadeada e não se apaga, e a pessoa
// e o número juntos diriam para sempre quem mandou cada sugestão — o que a triagem não vê, a exclusão LGPD e a retenção tiram e o ROPA promete que some. O registro do
// ato é a própria linha da tabela (com a data), enquanto a pessoa estiver nela.
async function auditar(tabela, registroId, acao, usuarioId, dadosDepois = {}) {
  await registrarAuditoria({ tabela, registroId: registroId || 0, acao, usuarioId: usuarioId || null, dadosDepois });
}
async function auditarDoMembro(cicloId, acao) {
  await registrarAuditoria({ tabela: "IdentidadeCiclos", registroId: cicloId || 0, acao, usuarioId: null, dadosDepois: {} });
}
const OCUPADO_MSG = "Muita gente mexendo neste ciclo agora. Espere alguns segundos e tente de novo.";
const ehChaveUnica = (e) => !!e && (e.number === 2627 || e.number === 2601);
// Só o erro do gatilho das cores (TR_IdentidadeCores_Protegida) vira a mensagem das cores; qualquer outro erro segue como erro (500), não é mascarado.
const ehGatilhoDasCores = (e) => !!e && /As cores não mudam depois que chegou a primeira arte/.test(String(e.message || ""));

// O relógio (os testes põem o calendário em novembro ou dezembro sem esperar o ano: o banco segue com a hora dele).
let relogio = () => new Date();
function usarRelogio(f) { relogio = typeof f === "function" ? f : () => new Date(); }

// O armazenamento das imagens (o Storage privado; os testes trocam por um de mentira).
let armazenamentoTroca = null;
function usarArmazenamento(a) { armazenamentoTroca = a || null; }
const armazenamento = () => armazenamentoTroca || require("./storage");

// ---------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------

const SELECT_CICLO = `SELECT c.*, r.ResultadoId, a.Nome AS AbertoPorNome, d.Nome AS DesempatePorNome FROM IdentidadeCiclos c
  LEFT JOIN IdentidadeResultados r ON r.CicloId = c.CicloId
  LEFT JOIN MembroReferencia a ON a.MembroId = c.AbertoPorMembroId
  LEFT JOIN MembroReferencia d ON d.MembroId = c.DesempatePorMembroId`;
async function carregarCiclo(pool, cicloId) {
  return (await pool.request().input("c", sql.Int, cicloId).query(`${SELECT_CICLO} WHERE c.CicloId = @c`)).recordset[0] || null;
}
async function cicloDoAno(pool, anoAlvo) {
  return (await pool.request().input("a", sql.SmallInt, anoAlvo).query(`${SELECT_CICLO} WHERE c.AnoAlvo = @a`)).recordset[0] || null;
}
function faseDe(c, hoje) { return iv.fase(Number(c.AnoAlvo), hoje, { encerrado: !!c.ResultadoId }); }
function formatarCiclo(c, hoje) {
  const fase = faseDe(c, hoje);
  return {
    cicloId: c.CicloId, anoAlvo: Number(c.AnoAlvo), fase, faseRotulo: iv.FASES[fase].rotulo, calendario: iv.calendario(Number(c.AnoAlvo)),
    abertoEm: iso(c.AbertoEm), abertoPor: c.AbertoPorNome || null,
    enqueteId: c.EnqueteId || null, votacaoCriadaEm: iso(c.VotacaoCriadaEm), votacaoAutomatica: !!c.EnqueteId && !c.VotacaoCriadaPorMembroId,
    apuracao: c.Apuracao || null, apuradoEm: iso(c.ApuradoEm), votosTotal: c.VotosTotal == null ? null : Number(c.VotosTotal),
    tema: c.TemaSugestaoId ? { sugestaoId: c.TemaSugestaoId, texto: c.TemaTexto, votos: Number(c.TemaVotos), definidoPor: c.TemaDefinidoPor,
      desempate: ["DESEMPATE", "DIRETORIA"].includes(c.TemaDefinidoPor) ? { motivo: c.DesempateMotivo, por: c.DesempatePorNome || null, em: iso(c.DesempateEm) } : null } : null,
    encerrado: !!c.ResultadoId,
    // depois de 31/12 sem o resultado registrado: a etapa é "encerrado", mas a Diretoria ainda registra o que o culto decidiu
    resultadoPendente: !c.ResultadoId && hoje >= iv.calendario(Number(c.AnoAlvo)).arte.inicio
  };
}

// Abre o ciclo da identidade do ano que vem (a Diretoria, quando quiser, até 15/11).
async function abrirCiclo(pool, { ver, anoAlvo, agora = relogio() }) {
  const hoje = hojeBrasilia(agora);
  const ano = Number.isInteger(anoAlvo) ? anoAlvo : (typeof anoAlvo === "string" && /^\d{4}$/.test(anoAlvo) ? Number(anoAlvo) : null);
  const pode = iv.podeAbrirCiclo(ano, hoje);
  if (pode.problema) return RECUSA(pode.problema);
  const r = await pool.request().input("a", sql.SmallInt, ano).input("por", sql.Int, ver.membroId).query(`
    INSERT INTO IdentidadeCiclos (AnoAlvo, AbertoPorMembroId) SELECT @a, @por
    WHERE NOT EXISTS (SELECT 1 FROM IdentidadeCiclos WITH (UPDLOCK, HOLDLOCK) WHERE AnoAlvo = @a);
    SELECT @@ROWCOUNT AS n, (SELECT CicloId FROM IdentidadeCiclos WHERE AnoAlvo = @a) AS cicloId`);
  const linha = r.recordset[0] || {};
  if (!Number(linha.n)) return RECUSA(`O ciclo da identidade de ${ano} já está aberto.`, { cicloId: linha.cicloId || null });
  await auditar("IdentidadeCiclos", linha.cicloId, "IDENTIDADE_CICLO_ABERTO", ver.membroId, { anoAlvo: ano });
  return { sucesso: true, cicloId: linha.cicloId, mensagem: `Ciclo da Identidade Visual de ${ano} aberto. As sugestões dos membros vão de ${iv.dataBr(iv.calendario(ano).sugestao.inicio)} a ${iv.dataBr(iv.calendario(ano).sugestao.fim)}.` };
}

// Cancelar o ciclo aberto por engano: só sem nenhuma sugestão, cor ou arte. Debaixo da MESMA trava do ciclo que a sugestão e a arte usam: um "mandar sugestão" que chegue junto
// ou entra antes (e o cancelamento é recusado) ou depois (e encontra o ciclo já sem existir) — nunca a chave estrangeira estourando em erro 500.
async function cancelarCiclo(pool, { ver, cicloId }) {
  const c = await carregarCiclo(pool, cicloId);
  if (!c) return NAO_EXISTE;
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${cicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    let apagou;
    try {
      apagou = contagem(await r().input("c", sql.Int, cicloId).query(`
        DELETE FROM IdentidadeCiclos WHERE CicloId = @c AND EnqueteId IS NULL AND Apuracao IS NULL
          AND NOT EXISTS (SELECT 1 FROM IdentidadeSugestoes WHERE CicloId = @c) AND NOT EXISTS (SELECT 1 FROM IdentidadeCores WHERE CicloId = @c)
          AND NOT EXISTS (SELECT 1 FROM IdentidadeArtes WHERE CicloId = @c) AND NOT EXISTS (SELECT 1 FROM IdentidadeTemasUsados WHERE CicloId = @c);
        SELECT @@ROWCOUNT AS n`));
    } catch (e) {
      if (e && e.number === 547) return RECUSA("Este ciclo já tem sugestões, cores ou artes: não pode mais ser cancelado.");
      throw e;
    }
    if (!apagou) return RECUSA("Este ciclo já tem sugestões, cores ou artes: não pode mais ser cancelado.");
    await t.commit();
    ok = true;
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
  await auditar("IdentidadeCiclos", cicloId, "IDENTIDADE_CICLO_CANCELADO", ver.membroId, { anoAlvo: Number(c.AnoAlvo) });
  return { sucesso: true, mensagem: `Ciclo de ${c.AnoAlvo} cancelado.` };
}

// ---------------------------------------------------------------
// Materializar o que a data já decidiu (votação e apuração)
// ---------------------------------------------------------------

const textoDaFinalista = (s) => s.TextoFinal || s.Texto;
async function finalistas(rq, cicloId) {
  return (await rq.input("c", sql.Int, cicloId).query(`SELECT SugestaoId, Texto, TextoFinal, TextoNormalizado, OpcaoId FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'FINALISTA'`)).recordset;
}
// Sugestões ainda sem decisão da triagem (enviadas e não retiradas): com alguma, a votação não abre sozinha.
async function semDecisao(rq, cicloId) {
  return contagem(await rq.input("c", sql.Int, cicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'ENVIADA'`));
}

// A enquete da votação: no período da votação, com pelo menos 2 finalistas; uma por ciclo. `porMembroId` null = abriu sozinha (rotina ou primeiro acesso no dia 22) — e
// sozinha ela só abre com a triagem completa (nenhuma sugestão sem decisão). Pelo botão, com sugestão sem decisão, a resposta diz quantas são (`pendentes`) e a Diretoria
// confirma (`aceitarPendentes`).
async function criarVotacao(pool, { cicloId, porMembroId = null, aceitarPendentes = false, agora = relogio() }) {
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${cicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, cicloId).query(`SELECT * FROM IdentidadeCiclos WITH (UPDLOCK) WHERE CicloId = @c`)).recordset[0];
    if (!c) return NAO_EXISTE;
    if (c.EnqueteId) return { sucesso: true, jaExistia: true, enqueteId: c.EnqueteId, mensagem: "A votação já está aberta." };
    if (c.Apuracao || c.TemaSugestaoId) return RECUSA("O tema deste ano já foi definido: não há mais votação a abrir.");
    const ano = Number(c.AnoAlvo);
    const hoje = hojeBrasilia(agora);
    const cal = iv.calendario(ano);
    if (hoje < cal.votacao.inicio) return RECUSA(`A votação só começa em ${iv.dataBr(cal.votacao.inicio)}.`);
    if (iv.votacaoFechou(ano, agora)) return RECUSA(`O período da votação terminou em ${iv.dataBr(cal.votacao.fim)}.`);
    const lista = (await finalistas(r(), cicloId)).sort((a, b) => iv.normalizar(textoDaFinalista(a)).localeCompare(iv.normalizar(textoDaFinalista(b))));
    if (lista.length < iv.MIN_FINALISTAS) return RECUSA(`A votação precisa de pelo menos ${iv.MIN_FINALISTAS} finalistas aprovados na triagem (há ${lista.length}).`, { faltamFinalistas: true });
    const pendentes = await semDecisao(r(), cicloId);
    if (pendentes > 0 && !(porMembroId && aceitarPendentes)) {
      return RECUSA(`Há ${pendentes} sugestão(ões) ainda sem decisão da triagem. ${porMembroId ? "Confirme para abrir a votação assim mesmo (elas ficam fora)." : "A votação espera a Diretoria."}`, { pendentes });
    }
    const enqueteId = (await r()
      .input("titulo", sql.NVarChar(200), `Tema da Identidade Visual de ${ano}`)
      .input("descricao", sql.NVarChar(1000), `Escolha um dos temas finalistas para a Identidade Visual de ${ano} (Regimento, Art. 159, § 1º, III). Um voto por pessoa; o voto é secreto. A votação fecha no fim do dia ${iv.dataBr(cal.votacao.fim)}.`)
      .input("por", sql.Int, porMembroId).input("prevista", sql.NVarChar(19), cal.votacaoFechaEm.slice(0, 19))
      .query(`INSERT INTO Enquetes (Titulo, Descricao, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, Status, CriadoPor, DataFechamentoPrevista)
              VALUES (@titulo, @descricao, 'SECRETA', 'TODOS_ATIVOS', 0, NULL, 'ABERTA', @por, CONVERT(datetime2, @prevista, 126));
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    const perguntaId = (await r().input("e", sql.Int, enqueteId).input("titulo", sql.NVarChar(300), `Qual tema você escolhe para a Identidade Visual de ${ano}?`)
      .query(`INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) VALUES (@e, 1, @titulo, 'OPCOES'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    for (const s of lista) {
      const opcaoId = (await r().input("p", sql.Int, perguntaId).input("texto", sql.NVarChar(300), textoDaFinalista(s))
        .query(`INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@p, @texto); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
      await r().input("s", sql.Int, s.SugestaoId).input("o", sql.Int, opcaoId).query(`UPDATE IdentidadeSugestoes SET OpcaoId = @o WHERE SugestaoId = @s AND Status = 'FINALISTA' AND OpcaoId IS NULL`);
    }
    const ligou = await r().input("c", sql.Int, cicloId).input("e", sql.Int, enqueteId).input("por", sql.Int, porMembroId)
      .query(`UPDATE IdentidadeCiclos SET EnqueteId = @e, VotacaoCriadaEm = SYSUTCDATETIME(), VotacaoCriadaPorMembroId = @por WHERE CicloId = @c AND EnqueteId IS NULL AND Apuracao IS NULL`);
    if (!afetadas(ligou)) return MUDOU("O ciclo mudou enquanto a votação era aberta. Atualize a tela.");
    await t.commit();
    ok = true;
    await auditar("IdentidadeCiclos", cicloId, porMembroId ? "IDENTIDADE_VOTACAO_ABERTA" : "IDENTIDADE_VOTACAO_ABERTA_SOZINHA", porMembroId, { enqueteId, finalistas: lista.length, pendentes });
    return { sucesso: true, enqueteId, finalistas: lista.length, mensagem: `Votação aberta com ${lista.length} finalistas: os membros votam em Meu Painel até ${iv.dataBr(cal.votacao.fim)}.` };
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
}

// Fecha e apura. Quem decide se já fechou é a HORA DO BANCO (SYSUTCDATETIME() >= DataFechamentoPrevista), a mesma que o INSERT do voto confere: assim nenhum voto aceito
// fica de fora da contagem. A enquete é marcada ENCERRADA ANTES de contar, na mesma transação: o voto lê a enquete com trava (UPDLOCK) e, com o banco em
// READ_COMMITTED_SNAPSHOT (o padrão do Azure SQL), espera esta transação terminar e então a encontra encerrada. Os votos de cada finalista ficam gravados
// (VotosApurados): o desempate usa essa contagem, nunca uma recontagem.
async function apurarVotacao(pool, { cicloId, agora = relogio() }) {
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${cicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, cicloId).query(`SELECT * FROM IdentidadeCiclos WITH (UPDLOCK) WHERE CicloId = @c`)).recordset[0];
    if (!c || !c.EnqueteId) return NAO_EXISTE;
    if (c.Apuracao) return { sucesso: true, jaApurado: true, situacao: c.Apuracao };
    if (!iv.votacaoFechou(Number(c.AnoAlvo), agora)) return RECUSA("A votação ainda está aberta.");
    const fechou = (await r().input("e", sql.Int, c.EnqueteId).query(`SELECT CASE WHEN DataFechamentoPrevista IS NOT NULL AND SYSUTCDATETIME() >= DataFechamentoPrevista THEN 1 ELSE 0 END AS f
      FROM Enquetes WITH (UPDLOCK) WHERE EnqueteId = @e`)).recordset[0];
    if (!fechou || !Number(fechou.f)) return RECUSA("A votação ainda está aberta (pela hora do banco).");
    await r().input("e", sql.Int, c.EnqueteId).query(`UPDATE Enquetes SET Status = 'ENCERRADA', DataFechamento = ISNULL(DataFechamentoPrevista, SYSUTCDATETIME()) WHERE EnqueteId = @e AND Status = 'ABERTA'`);
    const opcoes = (await r().input("c", sql.Int, cicloId).input("e", sql.Int, c.EnqueteId).query(`
      SELECT s.SugestaoId, s.OpcaoId, ISNULL(s.TextoFinal, s.Texto) AS Texto,
        (SELECT COUNT(*) FROM RespostasEnquete x JOIN Enquetes e ON e.EnqueteId = @e WHERE x.OpcaoId = s.OpcaoId AND (e.DataFechamentoPrevista IS NULL OR x.DataResposta < e.DataFechamentoPrevista)) AS Votos
      FROM IdentidadeSugestoes s WHERE s.CicloId = @c AND s.Status = 'FINALISTA' AND s.OpcaoId IS NOT NULL`)).recordset;
    const ap = iv.apurar(opcoes.map((o) => ({ opcaoId: o.OpcaoId, votos: o.Votos })));
    const venc = ap.situacao === "VENCEDOR" ? opcoes.find((o) => o.OpcaoId === ap.vencedor) : null;
    for (const o of opcoes) await r().input("s", sql.Int, o.SugestaoId).input("v", sql.Int, Number(o.Votos)).query(`UPDATE IdentidadeSugestoes SET VotosApurados = @v WHERE SugestaoId = @s AND VotosApurados IS NULL`);
    await r().input("c", sql.Int, cicloId).input("ap", sql.NVarChar(10), ap.situacao).input("total", sql.Int, ap.total)
      .input("s", sql.Int, venc ? venc.SugestaoId : null).input("texto", sql.NVarChar(80), venc ? venc.Texto : null).input("votos", sql.Int, venc ? ap.maior : null)
      .query(`UPDATE IdentidadeCiclos SET Apuracao = @ap, ApuradoEm = SYSUTCDATETIME(), VotosTotal = @total,
                TemaSugestaoId = @s, TemaTexto = @texto, TemaVotos = @votos, TemaDefinidoPor = CASE WHEN @s IS NULL THEN NULL ELSE 'VOTACAO' END
              WHERE CicloId = @c AND Apuracao IS NULL`);
    await t.commit();
    ok = true;
    await auditar("IdentidadeCiclos", cicloId, "IDENTIDADE_VOTACAO_APURADA", null, { situacao: ap.situacao, total: ap.total });
    return { sucesso: true, situacao: ap.situacao, total: ap.total, tema: venc ? venc.Texto : null };
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
}

// Ciclo sem saída (revisão de 23/10/2026): a votação não aconteceu — a partir de 22/11 com menos de 2 finalistas, ou depois de 30/11 sem a votação ter aberto. A Diretoria
// define o tema entre os FINALISTAS, com o motivo (confirmação reforçada; fica quem decidiu, quando e por quê), e o ciclo segue para as cores e a arte.
async function definirTemaSemVotacao(pool, { ver, dados, agora = relogio() }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const motivo = iv.validarTextoLivre(d.motivo, { campo: "o motivo da decisão", max: 300, min: 5 });
  if (motivo.problema) return RECUSA(motivo.problema);
  const s0 = (await pool.request().input("s", sql.Int, d.sugestaoId).query(`SELECT CicloId FROM IdentidadeSugestoes WHERE SugestaoId = @s`)).recordset[0];
  if (!s0) return NAO_EXISTE;
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, texto;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${s0.CicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, s0.CicloId).query(`SELECT * FROM IdentidadeCiclos WITH (UPDLOCK) WHERE CicloId = @c`)).recordset[0];
    if (c.EnqueteId) return RECUSA("Este ciclo teve votação: o tema sai da apuração (e, no empate, do desempate).");
    if (c.Apuracao || c.TemaSugestaoId) return RECUSA("O tema deste ano já está definido.");
    const ano = Number(c.AnoAlvo);
    const hoje = hojeBrasilia(agora);
    const lista = await finalistas(r(), c.CicloId);
    if (hoje < iv.calendario(ano).votacao.inicio) return RECUSA(`Antes de ${iv.dataBr(iv.calendario(ano).votacao.inicio)}, termine a triagem: o tema sai da votação.`);
    if (lista.length >= iv.MIN_FINALISTAS && !iv.votacaoFechou(ano, agora)) return RECUSA("Há finalistas para a votação: abra a votação (o tema sai do voto dos membros).");
    const escolhida = lista.find((x) => x.SugestaoId === Number(d.sugestaoId));
    if (!escolhida) return RECUSA("Escolha uma das sugestões aprovadas como finalista.");
    texto = textoDaFinalista(escolhida);
    const u = await r().input("c", sql.Int, c.CicloId).input("s", sql.Int, escolhida.SugestaoId).input("t", sql.NVarChar(80), texto)
      .input("m", sql.NVarChar(300), motivo.texto).input("por", sql.Int, ver.membroId)
      .query(`UPDATE IdentidadeCiclos SET Apuracao = 'NAO_VOTADA', ApuradoEm = SYSUTCDATETIME(), VotosTotal = 0, TemaSugestaoId = @s, TemaTexto = @t, TemaVotos = 0,
                TemaDefinidoPor = 'DIRETORIA', DesempateMotivo = @m, DesempatePorMembroId = @por, DesempateEm = SYSUTCDATETIME()
              WHERE CicloId = @c AND EnqueteId IS NULL AND Apuracao IS NULL AND TemaSugestaoId IS NULL`);
    if (!afetadas(u)) return MUDOU("O ciclo mudou enquanto você decidia. Atualize a tela.");
    await t.commit();
    ok = true;
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
  await auditar("IdentidadeCiclos", s0.CicloId, "IDENTIDADE_TEMA_SEM_VOTACAO", ver.membroId, { sugestaoId: Number(d.sugestaoId) });
  return { sucesso: true, mensagem: `Tema definido pela Diretoria, sem votação: "${texto}".` };
}

// O que a data já decidiu e ainda não está no banco. Nunca lança por regra (só por erro de banco). A votação só abre sozinha com a triagem completa (nenhuma sugestão
// sem decisão); senão a Diretoria é avisada e abre pelo botão.
async function materializar(pool, c, { agora = relogio() } = {}) {
  if (!c || c.ResultadoId) return {};
  const hoje = hojeBrasilia(agora);
  const ano = Number(c.AnoAlvo);
  const feito = {};
  if (!c.EnqueteId && !c.Apuracao && iv.fase(ano, hoje) === "VOTACAO" && !iv.votacaoFechou(ano, agora)) {
    const q = (await pool.request().input("c", sql.Int, c.CicloId).query(`SELECT ISNULL(SUM(CASE WHEN Status = 'FINALISTA' THEN 1 ELSE 0 END), 0) AS n,
      ISNULL(SUM(CASE WHEN Status = 'ENVIADA' THEN 1 ELSE 0 END), 0) AS p FROM IdentidadeSugestoes WHERE CicloId = @c`)).recordset[0] || {};
    const n = Number(q.n) || 0, p = Number(q.p) || 0;
    if (n >= iv.MIN_FINALISTAS && p === 0) feito.votacao = await criarVotacao(pool, { cicloId: c.CicloId, agora });
  }
  if (c.EnqueteId && !c.Apuracao && iv.votacaoFechou(ano, agora)) feito.apuracao = await apurarVotacao(pool, { cicloId: c.CicloId, agora });
  return feito;
}
async function cicloAtualizado(pool, c, agora) {
  if (!c) return null;
  const feito = await materializar(pool, c, { agora });
  return feito.votacao || feito.apuracao ? carregarCiclo(pool, c.CicloId) : c;
}

// ---------------------------------------------------------------
// Temas já usados
// ---------------------------------------------------------------

async function lerTemasUsados(rq) {
  return (await rq.query(`SELECT TemaUsadoId, Ano, Tema, TemaNormalizado FROM IdentidadeTemasUsados ORDER BY Ano`)).recordset
    .map((t) => ({ temaUsadoId: t.TemaUsadoId, ano: Number(t.Ano), tema: t.Tema, normalizado: t.TemaNormalizado }));
}
async function listarTemas(pool) {
  return (await pool.request().query(`SELECT t.*, a.Nome AS RegistradoPorNome, b.Nome AS AtualizadoPorNome FROM IdentidadeTemasUsados t
      LEFT JOIN MembroReferencia a ON a.MembroId = t.RegistradoPorMembroId LEFT JOIN MembroReferencia b ON b.MembroId = t.AtualizadoPorMembroId ORDER BY t.Ano DESC`)).recordset
    .map((t) => ({ temaUsadoId: t.TemaUsadoId, ano: Number(t.Ano), tema: t.Tema, origem: t.Origem, registradoPor: t.RegistradoPorNome || null, registradoEm: iso(t.RegistradoEm),
      atualizadoPor: t.AtualizadoPorNome || null, atualizadoEm: iso(t.AtualizadoEm) }));
}
// Cadastrar ou corrigir um tema à mão (a Secretaria): ano de 2006 até o ano que vem, um tema por ano.
async function salvarTema(pool, { ver, dados, agora = relogio() }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const anoMax = Number(hojeBrasilia(agora).slice(0, 4)) + 1;
  const ano = Number.isInteger(d.ano) ? d.ano : (typeof d.ano === "string" && /^\d{4}$/.test(d.ano) ? Number(d.ano) : null);
  if (!ano || ano < iv.PRIMEIRO_ANO_TEMAS || ano > anoMax) return RECUSA(`Informe o ano (de ${iv.PRIMEIRO_ANO_TEMAS} a ${anoMax}).`);
  const v = iv.validarTema(d.tema, { max: iv.MAX_TEMA_USADO, campo: "o tema" });
  if (v.problema) return RECUSA(v.problema);
  const temaUsadoId = d.temaUsadoId == null || d.temaUsadoId === "" ? null : (Number.isInteger(d.temaUsadoId) && d.temaUsadoId > 0 ? d.temaUsadoId : (typeof d.temaUsadoId === "string" && /^[1-9]\d{0,9}$/.test(d.temaUsadoId) ? Number(d.temaUsadoId) : -1));
  if (temaUsadoId === -1) return RECUSA("Tema inválido.");
  try {
    if (temaUsadoId) {
      const atual = (await pool.request().input("t", sql.Int, temaUsadoId).query(`SELECT Origem FROM IdentidadeTemasUsados WHERE TemaUsadoId = @t`)).recordset[0];
      if (!atual) return NAO_EXISTE;
      if (atual.Origem !== "MANUAL") return RECUSA("O tema escolhido pelo processo da identidade visual não se edita.");
      const r = await pool.request().input("t", sql.Int, temaUsadoId).input("ano", sql.SmallInt, ano).input("tema", sql.NVarChar(150), v.texto).input("n", sql.NVarChar(150), v.normalizado).input("por", sql.Int, ver.membroId)
        .query(`UPDATE IdentidadeTemasUsados SET Ano = @ano, Tema = @tema, TemaNormalizado = @n, AtualizadoPorMembroId = @por, AtualizadoEm = SYSUTCDATETIME() WHERE TemaUsadoId = @t AND Origem = 'MANUAL'`);
      if (!afetadas(r)) return MUDOU("O tema mudou enquanto você editava. Atualize a lista.");
      await auditar("IdentidadeTemasUsados", temaUsadoId, "IDENTIDADE_TEMA_USADO_CORRIGIDO", ver.membroId, { ano });
      return { sucesso: true, temaUsadoId, mensagem: `Tema de ${ano} corrigido.` };
    }
    const id = (await pool.request().input("ano", sql.SmallInt, ano).input("tema", sql.NVarChar(150), v.texto).input("n", sql.NVarChar(150), v.normalizado).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO IdentidadeTemasUsados (Ano, Tema, TemaNormalizado, Origem, RegistradoPorMembroId) VALUES (@ano, @tema, @n, 'MANUAL', @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await auditar("IdentidadeTemasUsados", id, "IDENTIDADE_TEMA_USADO_CADASTRADO", ver.membroId, { ano });
    return { sucesso: true, temaUsadoId: id, mensagem: `Tema de ${ano} cadastrado.` };
  } catch (e) {
    if (ehChaveUnica(e)) return RECUSA(`Já há um tema cadastrado para ${ano}: corrija o que está na lista.`);
    throw e;
  }
}
async function excluirTema(pool, { ver, temaUsadoId }) {
  const atual = (await pool.request().input("t", sql.Int, temaUsadoId).query(`SELECT Origem, Ano FROM IdentidadeTemasUsados WHERE TemaUsadoId = @t`)).recordset[0];
  if (!atual) return NAO_EXISTE;
  if (atual.Origem !== "MANUAL") return RECUSA("O tema escolhido pelo processo da identidade visual não se apaga.");
  const r = await pool.request().input("t", sql.Int, temaUsadoId).query(`DELETE FROM IdentidadeTemasUsados WHERE TemaUsadoId = @t AND Origem = 'MANUAL'`);
  if (!afetadas(r)) return MUDOU("O tema mudou enquanto você decidia. Atualize a lista.");
  await auditar("IdentidadeTemasUsados", temaUsadoId, "IDENTIDADE_TEMA_USADO_APAGADO", ver.membroId, { ano: Number(atual.Ano) });
  return { sucesso: true, mensagem: `Tema de ${atual.Ano} apagado da lista.` };
}

// ---------------------------------------------------------------
// Membro: sugestões
// ---------------------------------------------------------------

const NAO_APTO = "Só quem é membro ativo e em comunhão participa da escolha da identidade visual (Regimento, Art. 159). Se acha que é engano, fale com a Secretaria.";
const SEM_CICLO = (ano) => `Ainda não há processo de escolha aberto para a Identidade Visual de ${ano}: a Diretoria abre o ciclo do ano.`;

async function sugerir(pool, { membroId, texto, agora = relogio() }) {
  const hoje = hojeBrasilia(agora);
  const ano = iv.anoAlvoDoDia(hoje);
  const c = await cicloDoAno(pool, ano);
  if (!c) return RECUSA(SEM_CICLO(ano));
  const cal = iv.calendario(ano);
  if (faseDe(c, hoje) !== "SUGESTAO") return RECUSA(`As sugestões para ${ano} vão de ${iv.dataBr(cal.sugestao.inicio)} a ${iv.dataBr(cal.sugestao.fim)}.`);
  const v = iv.validarTema(texto);
  if (v.problema) return RECUSA(v.problema);
  if (!(await aptoEmComunhao(pool, membroId))) return RECUSA(NAO_APTO);
  const conf = iv.conferirTemasUsados(v.normalizado, await lerTemasUsados(pool.request()));
  if (conf.igual) return RECUSA(`Esse tema já foi usado pela Igreja em ${conf.igual.ano} ("${conf.igual.tema}"). O Regimento veda tema repetido (Art. 159): pense em outro.`, { jaUsado: { ano: conf.igual.ano } });
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, sugestaoId;
  try {
    await t.begin();
    // a trava do ciclo (a mesma do cancelar, da triagem e da votação) põe as sugestões em fila: com o banco em READ_COMMITTED_SNAPSHOT (Azure), a contagem abaixo
    // poderia ler uma versão antiga sem ela; com ela, cada uma conta depois da anterior gravada (o gatilho dos 3 é a segunda guarda)
    if (!(await obterTrava(r, `identidade-ciclo-${c.CicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const existe = contagem(await r().input("c", sql.Int, c.CicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeCiclos WHERE CicloId = @c`));
    if (!existe) return RECUSA(SEM_CICLO(ano));
    const minhas = contagem(await r().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId)
      .query(`SELECT COUNT(*) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND MembroId = @m AND Status <> 'RETIRADA'`));
    if (minhas >= iv.MAX_SUGESTOES) return RECUSA(`Você já mandou ${iv.MAX_SUGESTOES} sugestões este ano (o máximo). Para mandar outra, retire uma das suas antes.`);
    const repetida = (await r().input("c", sql.Int, c.CicloId).input("n", sql.NVarChar(100), v.normalizado)
      .query(`SELECT TOP 1 MembroId FROM IdentidadeSugestoes WHERE CicloId = @c AND TextoNormalizado = @n AND Status <> 'RETIRADA'`)).recordset[0];
    if (repetida) return RECUSA(Number(repetida.MembroId) === Number(membroId) ? "Você já mandou esse tema." : "Esse tema já foi sugerido por outro membro: ele já está na lista da triagem.");
    sugestaoId = (await r().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId).input("t", sql.NVarChar(80), v.texto).input("n", sql.NVarChar(100), v.normalizado)
      .input("pa", sql.SmallInt, conf.parecido ? conf.parecido.ano : null).input("pt", sql.NVarChar(150), conf.parecido ? conf.parecido.tema : null)
      .query(`INSERT INTO IdentidadeSugestoes (CicloId, MembroId, Texto, TextoNormalizado, ParecidoComAno, ParecidoComTema) VALUES (@c, @m, @t, @n, @pa, @pt);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
    ok = true;
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
  await auditarDoMembro(c.CicloId, "IDENTIDADE_SUGESTAO_ENVIADA");
  return { sucesso: true, sugestaoId, parecido: conf.parecido ? { ano: conf.parecido.ano, tema: conf.parecido.tema } : null,
    mensagem: conf.parecido ? `Sugestão recebida. Ela lembra o tema de ${conf.parecido.ano} ("${conf.parecido.tema}"): a Diretoria vai conferir na triagem.` : "Sugestão recebida. Obrigado por participar!" };
}

async function retirarSugestao(pool, { membroId, sugestaoId, agora = relogio() }) {
  const s = (await pool.request().input("s", sql.Int, sugestaoId).input("m", sql.Int, membroId)
    .query(`SELECT s.SugestaoId, s.Status, s.CicloId, c.AnoAlvo, r.ResultadoId FROM IdentidadeSugestoes s JOIN IdentidadeCiclos c ON c.CicloId = s.CicloId
            LEFT JOIN IdentidadeResultados r ON r.CicloId = c.CicloId WHERE s.SugestaoId = @s AND s.MembroId = @m`)).recordset[0];
  if (!s) return NAO_EXISTE;
  const hoje = hojeBrasilia(agora);
  if (iv.fase(Number(s.AnoAlvo), hoje, { encerrado: !!s.ResultadoId }) !== "SUGESTAO") return RECUSA(`A sugestão só pode ser retirada até ${iv.dataBr(iv.calendario(Number(s.AnoAlvo)).sugestao.fim)}.`);
  if (s.Status !== "ENVIADA") return RECUSA("Esta sugestão já foi retirada.");
  const r = await pool.request().input("s", sql.Int, sugestaoId).input("m", sql.Int, membroId)
    .query(`UPDATE IdentidadeSugestoes SET Status = 'RETIRADA', RetiradaEm = SYSUTCDATETIME() WHERE SugestaoId = @s AND MembroId = @m AND Status = 'ENVIADA'`);
  if (!afetadas(r)) return MUDOU("A sugestão mudou enquanto você decidia. Atualize a tela.");
  await auditarDoMembro(s.CicloId, "IDENTIDADE_SUGESTAO_RETIRADA");
  return { sucesso: true, mensagem: "Sugestão retirada." };
}

// ---------------------------------------------------------------
// Diretoria: triagem e desempate
// ---------------------------------------------------------------

// Triagem: TRIAGEM (16 a 21/nov) e, se a Diretoria atrasou, no período da votação enquanto a votação ainda não abriu (sem isso o processo do ano pararia).
// Aprovar como finalista E mexer numa finalista (descartar, voltar para a triagem) pedem a confirmação reforçada (`fatorRecente`): sem ela a resposta é { precisaFator }
// e a rota responde 428 — a rota não sabe a situação da sugestão; quem sabe é esta função.
// Aprovar de novo sem `textoAjustado` mantém o ajuste já salvo (só o mesmo texto da original o desfaz).
async function triar(pool, { ver, dados, fatorRecente = false, agora = relogio() }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const sugestaoId = d.sugestaoId;
  const decisao = d.decisao;
  if (!["FINALISTA", "DESCARTADA", "ENVIADA"].includes(decisao)) return RECUSA("Escolha a decisão: finalista, descartada ou voltar para a triagem.");
  let textoFinal = null, normalFinal = null, criterio = null, observacao = null;
  if (decisao === "FINALISTA" && d.textoAjustado !== undefined && d.textoAjustado !== null && d.textoAjustado !== "") {
    const v = iv.validarTema(d.textoAjustado, { campo: "a redação ajustada" });
    if (v.problema) return RECUSA(v.problema);
    textoFinal = v.texto; normalFinal = v.normalizado;
  }
  if (decisao === "DESCARTADA") {
    criterio = Number.isInteger(d.criterio) ? d.criterio : (typeof d.criterio === "string" && /^[1-3]$/.test(d.criterio) ? Number(d.criterio) : null);
    if (!criterio || !iv.CRITERIOS[criterio]) return RECUSA("Escolha o critério do descarte (1, 2 ou 3 do Art. 159, § 1º, I, a).");
  }
  if (decisao !== "ENVIADA") {
    const o = iv.validarTextoLivre(d.observacao, { campo: "a observação", max: 300, opcional: true });
    if (o.problema) return RECUSA(o.problema);
    observacao = o.texto;
  }
  const s0 = (await pool.request().input("s", sql.Int, sugestaoId).query(`SELECT CicloId, Status FROM IdentidadeSugestoes WHERE SugestaoId = @s`)).recordset[0];
  if (!s0) return NAO_EXISTE;
  if ((decisao === "FINALISTA" || s0.Status === "FINALISTA") && !fatorRecente) return { sucesso: false, precisaFator: true };
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, resposta, parecido = null;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${s0.CicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, s0.CicloId).query(`SELECT c.*, (SELECT COUNT(*) FROM IdentidadeResultados x WHERE x.CicloId = c.CicloId) AS TemResultado FROM IdentidadeCiclos c WHERE c.CicloId = @c`)).recordset[0];
    const ano = Number(c.AnoAlvo);
    const hoje = hojeBrasilia(agora);
    const fase = iv.fase(ano, hoje, { encerrado: Number(c.TemResultado) > 0 });
    if (c.EnqueteId) return MUDOU("A votação já começou: a lista de finalistas não muda mais.");
    if (!(fase === "TRIAGEM" || (fase === "VOTACAO" && !iv.votacaoFechou(ano, agora)))) return RECUSA(`A triagem vai de ${iv.dataBr(iv.calendario(ano).triagem.inicio)} a ${iv.dataBr(iv.calendario(ano).triagem.fim)}.`);
    const s = (await r().input("s", sql.Int, sugestaoId).query(`SELECT * FROM IdentidadeSugestoes WITH (UPDLOCK) WHERE SugestaoId = @s`)).recordset[0];
    if (s.Status === "RETIRADA") return RECUSA("Esta sugestão foi retirada por quem mandou.");
    if (s.Status === "FINALISTA" && s.Status !== s0.Status && !fatorRecente) return { sucesso: false, precisaFator: true };
    if (s.AnonimizadoEm && decisao === "FINALISTA" && s.Status !== "FINALISTA") return RECUSA("Esta sugestão foi removida a pedido do titular (LGPD) e não pode ser finalista.");
    if (decisao === "FINALISTA") {
      const veioAjuste = d.textoAjustado !== undefined && d.textoAjustado !== null && d.textoAjustado !== "";
      if (!veioAjuste && s.Status === "FINALISTA" && s.TextoFinal) { textoFinal = s.TextoFinal; normalFinal = iv.normalizar(s.TextoFinal); }
      if (textoFinal && textoFinal === s.Texto) { textoFinal = null; normalFinal = null; }
      const normal = normalFinal || s.TextoNormalizado;
      const conf = iv.conferirTemasUsados(normal, await lerTemasUsados(r()));
      if (conf.igual) return RECUSA(`Essa redação é igual ao tema de ${conf.igual.ano} ("${conf.igual.tema}"): tema repetido não vai à votação (Art. 159).`);
      parecido = conf.parecido;
      const outras = (await r().input("c", sql.Int, s.CicloId).input("s", sql.Int, s.SugestaoId)
        .query(`SELECT SugestaoId, Texto, TextoFinal, TextoNormalizado FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'FINALISTA' AND SugestaoId <> @s`)).recordset;
      if (outras.length >= iv.MAX_FINALISTAS) return RECUSA(`A votação leva no máximo ${iv.MAX_FINALISTAS} finalistas.`);
      if (outras.some((o) => iv.normalizar(textoDaFinalista(o)) === normal)) return RECUSA("Já há uma finalista com esta mesma redação.");
    }
    const upd = await r().input("s", sql.Int, s.SugestaoId).input("st", sql.NVarChar(10), decisao).input("tf", sql.NVarChar(80), textoFinal)
      .input("cr", sql.TinyInt, criterio).input("ob", sql.NVarChar(300), observacao).input("por", sql.Int, decisao === "ENVIADA" ? null : ver.membroId).input("antes", sql.NVarChar(10), s.Status)
      .query(`UPDATE IdentidadeSugestoes SET Status = @st, TextoFinal = @tf, Criterio = @cr, ObservacaoTriagem = @ob, TriadoPorMembroId = @por,
                TriadoEm = CASE WHEN @st = 'ENVIADA' THEN NULL ELSE SYSUTCDATETIME() END
              WHERE SugestaoId = @s AND Status = @antes`);
    if (!afetadas(upd)) return MUDOU("A sugestão mudou enquanto você decidia. Atualize a tela.");
    await t.commit();
    ok = true;
    resposta = { sucesso: true, mensagem: (decisao === "FINALISTA" ? (textoFinal ? "Aprovada como finalista, com a redação ajustada (a original fica guardada)." : "Aprovada como finalista.")
      : decisao === "DESCARTADA" ? `Descartada: ${iv.CRITERIOS[criterio].rotulo}.` : "A sugestão voltou para a triagem.")
      + (parecido ? ` Atenção: ela lembra o tema de ${parecido.ano} ("${parecido.tema}").` : ""), parecido: parecido ? { ano: parecido.ano, tema: parecido.tema } : null };
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
  await auditar("IdentidadeSugestoes", sugestaoId, `IDENTIDADE_TRIAGEM_${decisao}`, ver.membroId, decisao === "DESCARTADA" ? { criterio } : decisao === "FINALISTA" ? { ajustada: !!textoFinal } : {});
  return resposta;
}

// Empate ou nenhum voto: a Diretoria define o tema entre os mais votados (ou entre os finalistas, se ninguém votou), dizendo por quê.
async function desempatar(pool, { ver, dados }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const motivo = iv.validarTextoLivre(d.motivo, { campo: "o motivo da decisão", max: 300, min: 5 });
  if (motivo.problema) return RECUSA(motivo.problema);
  const s0 = (await pool.request().input("s", sql.Int, d.sugestaoId).query(`SELECT CicloId FROM IdentidadeSugestoes WHERE SugestaoId = @s`)).recordset[0];
  if (!s0) return NAO_EXISTE;
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, texto;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${s0.CicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, s0.CicloId).query(`SELECT * FROM IdentidadeCiclos WITH (UPDLOCK) WHERE CicloId = @c`)).recordset[0];
    if (!c.Apuracao) return RECUSA("A votação ainda não foi apurada.");
    if (c.TemaSugestaoId) return RECUSA("O tema deste ano já está definido.");
    if (!["EMPATE", "SEM_VOTOS"].includes(c.Apuracao)) return RECUSA("Só há desempate quando a votação terminou empatada ou sem nenhum voto.");
    // a contagem GRAVADA na apuração (VotosApurados) — nunca uma recontagem ao vivo, que mudaria com um voto gravado depois
    const opcoes = (await r().input("c", sql.Int, c.CicloId).query(`
      SELECT s.SugestaoId, ISNULL(s.TextoFinal, s.Texto) AS Texto, ISNULL(s.VotosApurados, 0) AS Votos
      FROM IdentidadeSugestoes s WHERE s.CicloId = @c AND s.Status = 'FINALISTA' AND s.OpcaoId IS NOT NULL`)).recordset;
    const maior = Math.max(0, ...opcoes.map((o) => Number(o.Votos)));
    const escolhida = opcoes.find((o) => o.SugestaoId === Number(d.sugestaoId));
    if (!escolhida || Number(escolhida.Votos) !== maior) return RECUSA(c.Apuracao === "EMPATE" ? "Escolha um dos temas empatados em primeiro lugar." : "Escolha um dos temas finalistas.");
    texto = escolhida.Texto;
    const u = await r().input("c", sql.Int, c.CicloId).input("s", sql.Int, escolhida.SugestaoId).input("t", sql.NVarChar(80), texto).input("v", sql.Int, Number(escolhida.Votos))
      .input("m", sql.NVarChar(300), motivo.texto).input("por", sql.Int, ver.membroId)
      .query(`UPDATE IdentidadeCiclos SET TemaSugestaoId = @s, TemaTexto = @t, TemaVotos = @v, TemaDefinidoPor = 'DESEMPATE', DesempateMotivo = @m, DesempatePorMembroId = @por,
                DesempateEm = SYSUTCDATETIME() WHERE CicloId = @c AND TemaSugestaoId IS NULL`);
    if (!afetadas(u)) return MUDOU("O ciclo mudou enquanto você decidia. Atualize a tela.");
    await t.commit();
    ok = true;
  } finally {
    if (!ok) await fecharTransacao(t, false);
  }
  await auditar("IdentidadeCiclos", s0.CicloId, "IDENTIDADE_DESEMPATE", ver.membroId, { sugestaoId: Number(d.sugestaoId) });
  return { sucesso: true, mensagem: `Tema definido pela Diretoria: "${texto}".` };
}

// ---------------------------------------------------------------
// Cores e artes
// ---------------------------------------------------------------

function podeMexerNasCores(c, hoje) {
  const f = faseDe(c, hoje);
  return ["TRIAGEM", "VOTACAO", "ARTE"].includes(f);
}
async function salvarCor(pool, { ver, cicloId, dados, agora = relogio() }) {
  const v = iv.validarCor(dados);
  if (v.problema) return RECUSA(v.problema);
  const c = await carregarCiclo(pool, cicloId);
  if (!c) return NAO_EXISTE;
  if (!podeMexerNasCores(c, hojeBrasilia(agora))) return RECUSA("As cores se registram da triagem (16/11) até a escolha final.");
  const artes = contagem(await pool.request().input("c", sql.Int, cicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeArtes WHERE CicloId = @c AND Status IN ('ENVIADA', 'ESCOLHIDA')`));
  const existe = contagem(await pool.request().input("c", sql.Int, cicloId).input("o", sql.TinyInt, v.dados.ordem).query(`SELECT COUNT(*) AS n FROM IdentidadeCores WHERE CicloId = @c AND Ordem = @o`));
  // trocar uma cor em que os membros já desenharam: não (acrescentar uma cor nova, até 3, ainda pode)
  if (existe && artes) return RECUSA("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
  try {
    const r = await pool.request().input("c", sql.Int, cicloId).input("o", sql.TinyInt, v.dados.ordem).input("n", sql.NVarChar(40), v.dados.nome).input("h", sql.Char(7), v.dados.hex).input("por", sql.Int, ver.membroId)
      .query(`IF EXISTS (SELECT 1 FROM IdentidadeCores WHERE CicloId = @c AND Ordem = @o)
                UPDATE IdentidadeCores SET Nome = @n, Hex = @h, RegistradoPorMembroId = @por, RegistradoEm = SYSUTCDATETIME() WHERE CicloId = @c AND Ordem = @o
              ELSE
                INSERT INTO IdentidadeCores (CicloId, Ordem, Nome, Hex, RegistradoPorMembroId) VALUES (@c, @o, @n, @h, @por);
              SELECT CorId AS id FROM IdentidadeCores WHERE CicloId = @c AND Ordem = @o`);
    const corId = r.recordset[0] && r.recordset[0].id;
    await auditar("IdentidadeCores", corId, "IDENTIDADE_COR_REGISTRADA", ver.membroId, { ordem: v.dados.ordem });
    return { sucesso: true, corId, mensagem: `Cor ${v.dados.ordem} registrada.` };
  } catch (e) {
    if (ehGatilhoDasCores(e)) return RECUSA("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
    if (ehChaveUnica(e)) return MUDOU("A cor mudou enquanto você editava. Atualize a tela.");
    throw e;
  }
}
async function excluirCor(pool, { ver, corId, agora = relogio() }) {
  const cor = (await pool.request().input("k", sql.Int, corId).query(`SELECT CicloId, Ordem FROM IdentidadeCores WHERE CorId = @k`)).recordset[0];
  if (!cor) return NAO_EXISTE;
  const c = await carregarCiclo(pool, cor.CicloId);
  if (!podeMexerNasCores(c, hojeBrasilia(agora))) return RECUSA("As cores se registram da triagem (16/11) até a escolha final.");
  if (contagem(await pool.request().input("c", sql.Int, cor.CicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeArtes WHERE CicloId = @c AND Status IN ('ENVIADA', 'ESCOLHIDA')`))) {
    return RECUSA("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
  }
  try {
    const r = await pool.request().input("k", sql.Int, corId).query(`DELETE FROM IdentidadeCores WHERE CorId = @k`);
    if (!afetadas(r)) return MUDOU("A cor mudou enquanto você decidia. Atualize a tela.");
  } catch (e) {
    if (ehGatilhoDasCores(e)) return RECUSA("As cores não mudam depois que chegou a primeira arte (os membros desenharam com elas).");
    throw e;
  }
  await auditar("IdentidadeCores", corId, "IDENTIDADE_COR_APAGADA", ver.membroId, { ordem: Number(cor.Ordem) });
  return { sucesso: true, mensagem: "Cor apagada." };
}
async function coresDoCiclo(pool, cicloId) {
  return (await pool.request().input("c", sql.Int, cicloId).query(`SELECT CorId, Ordem, Nome, Hex FROM IdentidadeCores WHERE CicloId = @c ORDER BY Ordem`)).recordset
    .map((k) => ({ corId: k.CorId, ordem: Number(k.Ordem), nome: k.Nome, hex: k.Hex }));
}

// O membro manda a arte (dezembro, depois de haver ao menos uma cor). A imagem é guardada SEM os metadados (lugar do GPS, aparelho, data, autor: shared/identidadeVisual.js,
// prepararImagem) e vai primeiro ao armazenamento; se a gravação no banco falhar, ela sai de lá.
async function enviarArte(pool, { membroId, dados, agora = relogio() }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const hoje = hojeBrasilia(agora);
  const ano = iv.anoAlvoDoDia(hoje);
  const c = await cicloDoAno(pool, ano);
  if (!c) return RECUSA(SEM_CICLO(ano));
  if (faseDe(c, hoje) !== "ARTE") return RECUSA(`O concurso de arte é em dezembro (até a escolha final do culto).`);
  if (!(await coresDoCiclo(pool, c.CicloId)).length) return RECUSA("A Diretoria ainda não registrou as cores: a arte é feita com elas. Volte em alguns dias.");
  const titulo = iv.validarTextoLivre(d.titulo, { campo: "o título da arte", max: 80, opcional: true, umaLinha: true });
  if (titulo.problema) return RECUSA(titulo.problema);
  const descricao = iv.validarTextoLivre(d.descricao, { campo: "a descrição", max: 300, opcional: true });
  if (descricao.problema) return RECUSA(descricao.problema);
  if (!iv.TIPOS_IMAGEM.includes(d.tipo)) return RECUSA("A arte tem de ser uma imagem PNG ou JPEG.");
  if (!iv.base64CabeNoLimite(d.imagemBase64)) return RECUSA("A imagem está vazia, corrompida ou passa de 5 MB.");
  const img = iv.prepararImagem(Buffer.from(d.imagemBase64, "base64"), d.tipo);
  if (img.problema) return RECUSA(img.problema);
  const buffer = img.buffer;
  if (!(await aptoEmComunhao(pool, membroId))) return RECUSA(NAO_APTO);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const antes = (await pool.request().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId).input("h", sql.Char(64), hash)
    .query(`SELECT SUM(CASE WHEN Status IN ('ENVIADA', 'ESCOLHIDA') THEN 1 ELSE 0 END) AS ativas, SUM(CASE WHEN Sha256 = @h AND Status IN ('ENVIADA', 'ESCOLHIDA') THEN 1 ELSE 0 END) AS mesma
            FROM IdentidadeArtes WHERE CicloId = @c AND MembroId = @m`)).recordset[0] || {};
  if (Number(antes.mesma) > 0) return RECUSA("Você já mandou esta mesma imagem.");
  if (Number(antes.ativas) >= iv.MAX_ARTES) return RECUSA(`Você já mandou ${iv.MAX_ARTES} artes este ano (o máximo). Para mandar outra, retire uma das suas antes.`);
  let url;
  try { url = await armazenamento().salvarDocumento(buffer, d.tipo); } catch (e) { console.error("[IDENTIDADE] falha ao guardar a imagem:", e && e.message); return RECUSA("Não foi possível guardar a imagem agora. Tente de novo em alguns minutos."); }
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, arteId;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${c.CicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const ativas = contagem(await r().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId)
      .query(`SELECT COUNT(*) AS n FROM IdentidadeArtes WHERE CicloId = @c AND MembroId = @m AND Status IN ('ENVIADA', 'ESCOLHIDA') AND EnviadaPelaDiretoria = 0`));
    if (ativas >= iv.MAX_ARTES) return RECUSA(`Você já mandou ${iv.MAX_ARTES} artes este ano (o máximo). Para mandar outra, retire uma das suas antes.`);
    arteId = (await r().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId).input("ti", sql.NVarChar(80), titulo.texto).input("de", sql.NVarChar(300), descricao.texto)
      .input("u", sql.NVarChar(500), url).input("tp", sql.NVarChar(20), d.tipo).input("tam", sql.Int, buffer.length).input("h", sql.Char(64), hash)
      .query(`INSERT INTO IdentidadeArtes (CicloId, MembroId, Titulo, Descricao, ArquivoUrl, TipoConteudo, TamanhoBytes, Sha256) VALUES (@c, @m, @ti, @de, @u, @tp, @tam, @h);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await t.commit();
    ok = true;
  } finally {
    if (!ok) { await fecharTransacao(t, false); try { await armazenamento().excluirDocumento(url); } catch (e) { /* o blob órfão não bloqueia */ } }
  }
  await auditarDoMembro(c.CicloId, "IDENTIDADE_ARTE_ENVIADA");
  return { sucesso: true, arteId, mensagem: "Arte recebida. A escolha final (arte + cor) é no culto de dezembro." };
}

// O membro retira a arte dele até 24/12 do ano do processo (depois, a Diretoria prepara a escolha do culto com as artes que estão no concurso) e nunca depois do resultado.
async function retirarArte(pool, { membroId, arteId, agora = relogio() }) {
  const a = (await pool.request().input("a", sql.Int, arteId).input("m", sql.Int, membroId)
    .query(`SELECT a.ArteId, a.Status, a.ArquivoUrl, a.CicloId, c.AnoAlvo, (SELECT COUNT(*) FROM IdentidadeResultados x WHERE x.CicloId = a.CicloId) AS TemResultado
            FROM IdentidadeArtes a JOIN IdentidadeCiclos c ON c.CicloId = a.CicloId WHERE a.ArteId = @a AND a.MembroId = @m AND a.EnviadaPelaDiretoria = 0`)).recordset[0];
  if (!a) return NAO_EXISTE;
  if (a.Status !== "ENVIADA") return RECUSA(a.Status === "ESCOLHIDA" ? "Esta arte foi a escolhida no culto: não pode mais ser retirada." : "Esta arte já não está no concurso.");
  if (Number(a.TemResultado) > 0) return RECUSA("A escolha final deste ano já foi registrada: as artes do concurso não saem mais.");
  const limite = iv.retiradaDeArteAte(Number(a.AnoAlvo));
  if (hojeBrasilia(agora) > limite) return RECUSA(`A arte só pode ser retirada até ${iv.dataBr(limite)}: depois disso a Diretoria já prepara a escolha do culto.`);
  const r = await pool.request().input("a", sql.Int, arteId).input("m", sql.Int, membroId)
    .query(`UPDATE IdentidadeArtes SET Status = 'RETIRADA', RetiradaEm = SYSUTCDATETIME(), ArquivoUrl = NULL, ImagemApagadaEm = SYSUTCDATETIME()
            WHERE ArteId = @a AND MembroId = @m AND Status = 'ENVIADA'`);
  if (!afetadas(r)) return MUDOU("A arte mudou enquanto você decidia. Atualize a tela.");
  try { await armazenamento().excluirDocumento(a.ArquivoUrl); } catch (e) { /* best-effort */ }
  await auditarDoMembro(a.CicloId, "IDENTIDADE_ARTE_RETIRADA");
  return { sucesso: true, mensagem: "Arte retirada (a imagem foi apagada)." };
}

// Viabilidade (Art. 159 § 1º, IV, c): a arte ilegível ou fora das cores sai do concurso, com o motivo (a pessoa vê).
async function recusarArte(pool, { ver, arteId, motivo }) {
  const m = iv.validarTextoLivre(motivo, { campo: "o motivo", max: 300, min: 3 });
  if (m.problema) return RECUSA(m.problema);
  const a = (await pool.request().input("a", sql.Int, arteId).query(`SELECT a.Status, r.ResultadoId FROM IdentidadeArtes a LEFT JOIN IdentidadeResultados r ON r.CicloId = a.CicloId WHERE a.ArteId = @a`)).recordset[0];
  if (!a) return NAO_EXISTE;
  if (a.ResultadoId) return RECUSA("A escolha final deste ano já foi registrada.");
  if (a.Status !== "ENVIADA") return RECUSA("Esta arte já não está no concurso.");
  const r = await pool.request().input("a", sql.Int, arteId).input("m", sql.NVarChar(300), m.texto).input("por", sql.Int, ver.membroId)
    .query(`UPDATE IdentidadeArtes SET Status = 'RECUSADA', MotivoRecusa = @m, RecusadaPorMembroId = @por, RecusadaEm = SYSUTCDATETIME() WHERE ArteId = @a AND Status = 'ENVIADA'`);
  if (!afetadas(r)) return MUDOU("A arte mudou enquanto você decidia. Atualize a tela.");
  await auditar("IdentidadeArtes", arteId, "IDENTIDADE_ARTE_RECUSADA", ver.membroId);
  return { sucesso: true, mensagem: "Arte retirada do concurso, com o motivo." };
}

// O endereço da imagem (assinado, vale 1 hora): a Diretoria vê qualquer uma; o membro, as dele e a escolhida de um ciclo encerrado.
async function imagemDaArte(pool, { membroId, gestao, arteId }) {
  const a = (await pool.request().input("a", sql.Int, arteId).query(`SELECT a.MembroId, a.Status, a.ArquivoUrl, r.ResultadoId FROM IdentidadeArtes a
      LEFT JOIN IdentidadeResultados r ON r.CicloId = a.CicloId AND r.ArteId = a.ArteId WHERE a.ArteId = @a`)).recordset[0];
  if (!a || !(gestao || Number(a.MembroId) === Number(membroId) || (a.Status === "ESCOLHIDA" && a.ResultadoId))) return NAO_EXISTE;
  if (!a.ArquivoUrl) return RECUSA("A imagem desta arte já foi apagada.");
  const url = armazenamento().urlDocumentoComSas(a.ArquivoUrl);
  if (!url) return RECUSA("Não foi possível abrir a imagem agora.");
  return { sucesso: true, url };
}

// ---------------------------------------------------------------
// O resultado final (o culto)
// ---------------------------------------------------------------

// A arte escolhida é uma das do concurso (`arteId`) OU — quando a arte escolhida no culto não veio pelo sistema — a imagem que a Diretoria envia no próprio registro
// (`imagemBase64` + `tipo`, sem os metadados, guardada como "enviada pela Diretoria").
async function registrarResultado(pool, { ver, cicloId, dados, agora = relogio() }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const c0 = await carregarCiclo(pool, cicloId);
  if (!c0) return NAO_EXISTE;
  const ano = Number(c0.AnoAlvo);
  const hoje = hojeBrasilia(agora);
  if (hoje < iv.calendario(ano).arte.inicio) return RECUSA("A escolha final é em dezembro, depois da votação do tema.");
  const v = iv.validarResultado(d, { anoAlvo: ano, hoje });
  if (v.problema) return RECUSA(v.problema);
  const comImagem = d.imagemBase64 !== undefined && d.imagemBase64 !== null && d.imagemBase64 !== "";
  if (comImagem === !!d.arteId) return RECUSA("Escolha uma das artes do concurso OU envie a imagem da arte escolhida no culto (uma das duas).");
  let imagem = null, url = null;
  if (comImagem) {
    if (!iv.TIPOS_IMAGEM.includes(d.tipo)) return RECUSA("A arte tem de ser uma imagem PNG ou JPEG.");
    if (!iv.base64CabeNoLimite(d.imagemBase64)) return RECUSA("A imagem está vazia, corrompida ou passa de 5 MB.");
    const p = iv.prepararImagem(Buffer.from(d.imagemBase64, "base64"), d.tipo);
    if (p.problema) return RECUSA(p.problema);
    imagem = p.buffer;
    try { url = await armazenamento().salvarDocumento(imagem, d.tipo); } catch (e) { console.error("[IDENTIDADE] falha ao guardar a imagem:", e && e.message); return RECUSA("Não foi possível guardar a imagem agora. Tente de novo em alguns minutos."); }
  }
  const t = new sql.Transaction(pool);
  const r = () => new sql.Request(t);
  let ok = false, resultado;
  try {
    await t.begin();
    if (!(await obterTrava(r, `identidade-ciclo-${cicloId}`, 10000))) return OCUPADO(OCUPADO_MSG);
    const c = (await r().input("c", sql.Int, cicloId).query(`SELECT c.*, (SELECT COUNT(*) FROM IdentidadeResultados x WHERE x.CicloId = c.CicloId) AS TemResultado FROM IdentidadeCiclos c WITH (UPDLOCK) WHERE c.CicloId = @c`)).recordset[0];
    if (Number(c.TemResultado) > 0) return RECUSA("A escolha final deste ano já foi registrada.");
    if (!c.TemaSugestaoId) return RECUSA("O tema do ano ainda não está definido (a votação não foi apurada ou o empate não foi decidido).");
    let arteId = d.arteId;
    if (comImagem) {
      arteId = (await r().input("c", sql.Int, cicloId).input("m", sql.Int, ver.membroId).input("u", sql.NVarChar(500), url).input("tp", sql.NVarChar(20), d.tipo)
        .input("tam", sql.Int, imagem.length).input("h", sql.Char(64), crypto.createHash("sha256").update(imagem).digest("hex"))
        .query(`INSERT INTO IdentidadeArtes (CicloId, MembroId, Titulo, ArquivoUrl, TipoConteudo, TamanhoBytes, Sha256, EnviadaPelaDiretoria)
                VALUES (@c, @m, N'Arte escolhida no culto (enviada pela Diretoria)', @u, @tp, @tam, @h, 1); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    }
    const arte = (await r().input("a", sql.Int, arteId).input("c", sql.Int, cicloId).query(`SELECT ArteId, Status, ArquivoUrl FROM IdentidadeArtes WITH (UPDLOCK) WHERE ArteId = @a AND CicloId = @c`)).recordset[0];
    if (!arte || arte.Status !== "ENVIADA" || !arte.ArquivoUrl) return RECUSA("Escolha uma das artes do concurso deste ano.");
    const cor = (await r().input("k", sql.Int, d.corId).input("c", sql.Int, cicloId).query(`SELECT CorId, Nome, Hex FROM IdentidadeCores WHERE CorId = @k AND CicloId = @c`)).recordset[0];
    if (!cor) return RECUSA("Escolha uma das cores registradas para este ano.");
    const ocupado = (await r().input("ano", sql.SmallInt, ano).query(`SELECT Origem FROM IdentidadeTemasUsados WITH (UPDLOCK, HOLDLOCK) WHERE Ano = @ano`)).recordset[0];
    if (ocupado) return RECUSA(`Já há um tema cadastrado à mão para ${ano} em "Temas já usados": apague-o lá antes de registrar o resultado do processo.`);
    const resultadoId = (await r().input("c", sql.Int, cicloId).input("a", sql.Int, arte.ArteId).input("k", sql.Int, cor.CorId).input("tema", sql.NVarChar(80), c.TemaTexto)
      .input("cn", sql.NVarChar(40), cor.Nome).input("ch", sql.Char(7), cor.Hex).input("dc", sql.NVarChar(10), v.dados.dataCulto).input("oc", sql.NVarChar(20), v.dados.ocasiao)
      .input("vv", sql.Int, v.dados.votosVencedor).input("pr", sql.Int, v.dados.presentes).input("ata", sql.NVarChar(1000), v.dados.ata).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO IdentidadeResultados (CicloId, ArteId, CorId, TemaTexto, CorNome, CorHex, DataCulto, Ocasiao, VotosVencedor, Presentes, Ata, RegistradoPorMembroId)
              VALUES (@c, @a, @k, @tema, @cn, @ch, CONVERT(date, @dc, 23), @oc, @vv, @pr, @ata, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    const esc = await r().input("a", sql.Int, arte.ArteId).query(`UPDATE IdentidadeArtes SET Status = 'ESCOLHIDA' WHERE ArteId = @a AND Status = 'ENVIADA'`);
    if (!afetadas(esc)) return MUDOU("A arte mudou enquanto você registrava. Atualize a tela.");
    await r().input("ano", sql.SmallInt, ano).input("tema", sql.NVarChar(150), c.TemaTexto).input("n", sql.NVarChar(150), iv.normalizar(c.TemaTexto)).input("c", sql.Int, cicloId).input("por", sql.Int, ver.membroId)
      .query(`INSERT INTO IdentidadeTemasUsados (Ano, Tema, TemaNormalizado, Origem, CicloId, RegistradoPorMembroId) VALUES (@ano, @tema, @n, 'PROCESSO', @c, @por)`);
    await t.commit();
    ok = true;
    resultado = { resultadoId, tema: c.TemaTexto, cor: cor.Nome, arteId: arte.ArteId };
  } finally {
    if (!ok) { await fecharTransacao(t, false); if (url) { try { await armazenamento().excluirDocumento(url); } catch (e) { /* best-effort */ } } }
  }
  await auditar("IdentidadeResultados", resultado.resultadoId, "IDENTIDADE_RESULTADO_REGISTRADO", ver.membroId, { cicloId, arteId: resultado.arteId, corId: Number(d.corId), imagemDaDiretoria: comImagem });
  return { sucesso: true, resultadoId: resultado.resultadoId, mensagem: `Resultado registrado: "${resultado.tema}" na cor ${resultado.cor} é a Identidade Visual oficial de ${ano}. O tema entrou na lista de temas já usados.` };
}
async function resultadoDoCiclo(pool, cicloId) {
  const x = (await pool.request().input("c", sql.Int, cicloId).query(`SELECT r.*, p.Nome AS RegistradoPorNome FROM IdentidadeResultados r LEFT JOIN MembroReferencia p ON p.MembroId = r.RegistradoPorMembroId WHERE r.CicloId = @c`)).recordset[0];
  if (!x) return null;
  return { resultadoId: x.ResultadoId, arteId: x.ArteId, corId: x.CorId, tema: x.TemaTexto, cor: { nome: x.CorNome, hex: x.CorHex }, dataCulto: dia(x.DataCulto), ocasiao: x.Ocasiao,
    ocasiaoRotulo: iv.OCASIOES[x.Ocasiao] || x.Ocasiao, votosVencedor: Number(x.VotosVencedor), presentes: x.Presentes == null ? null : Number(x.Presentes), ata: x.Ata || null,
    registradoPor: x.RegistradoPorNome || null, registradoEm: iso(x.RegistradoEm) };
}

// ---------------------------------------------------------------
// As telas
// ---------------------------------------------------------------

async function votacaoDoCiclo(pool, c, { membroId = null, comVotos = false } = {}) {
  if (!c.EnqueteId) return null;
  const e = (await pool.request().input("e", sql.Int, c.EnqueteId).query(`SELECT e.Status, CONVERT(varchar(33), e.DataFechamentoPrevista, 126) AS Prevista, p.PerguntaId,
      (SELECT COUNT(DISTINCT r.MembroId) FROM RespostasEnquete r WHERE r.PerguntaId = p.PerguntaId AND (e.DataFechamentoPrevista IS NULL OR r.DataResposta < e.DataFechamentoPrevista)) AS Participantes
      FROM Enquetes e JOIN PerguntasEnquete p ON p.EnqueteId = e.EnqueteId WHERE e.EnqueteId = @e`)).recordset[0];
  if (!e) return null;
  const opcoes = (await pool.request().input("p", sql.Int, e.PerguntaId).input("e", sql.Int, c.EnqueteId).query(`
      SELECT o.OpcaoId, o.Texto, s.SugestaoId, s.VotosApurados, (SELECT COUNT(*) FROM RespostasEnquete r JOIN Enquetes x ON x.EnqueteId = @e
        WHERE r.OpcaoId = o.OpcaoId AND (x.DataFechamentoPrevista IS NULL OR r.DataResposta < x.DataFechamentoPrevista)) AS Votos
      FROM OpcoesEnquete o LEFT JOIN IdentidadeSugestoes s ON s.OpcaoId = o.OpcaoId WHERE o.PerguntaId = @p ORDER BY o.OpcaoId`)).recordset;
  const fechada = !!c.Apuracao || e.Status !== "ABERTA" || iv.votacaoFechou(Number(c.AnoAlvo), relogio());
  let minha = null;
  if (membroId) {
    const r = (await pool.request().input("p", sql.Int, e.PerguntaId).input("m", sql.Int, membroId).query(`SELECT CONVERT(varchar(33), DataResposta, 126) AS em FROM RespostasEnquete WHERE PerguntaId = @p AND MembroId = @m`)).recordset[0];
    minha = r ? r.em : null;
  }
  // a contagem por opção só aparece depois que a votação fecha (antes, só o número de participantes)
  const mostrar = comVotos || fechada;
  return { enqueteId: c.EnqueteId, perguntaId: e.PerguntaId, aberta: !fechada, fechaEm: iv.calendario(Number(c.AnoAlvo)).votacaoFechaEm, participantes: Number(e.Participantes) || 0,
    // apurada, vale a contagem gravada na apuração (a mesma que o desempate usa)
    opcoes: opcoes.map((o) => ({ opcaoId: o.OpcaoId, sugestaoId: o.SugestaoId || null, texto: o.Texto,
      ...(mostrar ? { votos: c.Apuracao && o.VotosApurados != null ? Number(o.VotosApurados) : Number(o.Votos) } : {}) })),
    ...(membroId ? { jaVotou: !!minha, votouEm: minha } : {}) };
}

// Meu Painel → Identidade Visual (qualquer login, inclusive PIN).
async function painelMembro(pool, { membroId, agora = relogio() }) {
  const hoje = hojeBrasilia(agora);
  const anoAtual = Number(hoje.slice(0, 4));
  const proximo = anoAtual + 1;
  let c = await cicloAtualizado(pool, await cicloDoAno(pool, proximo), agora);
  // em janeiro (ou até o processo seguinte abrir), o ciclo do ano corrente ainda vale: mostra o resultado
  if (!c) c = await cicloAtualizado(pool, await cicloDoAno(pool, anoAtual), agora);
  const vigente = (await pool.request().input("a", sql.SmallInt, anoAtual).query(`SELECT Ano, Tema FROM IdentidadeTemasUsados WHERE Ano = @a`)).recordset[0];
  const apto = await aptoEmComunhao(pool, membroId);
  const base = { sucesso: true, hoje, apto, maxSugestoes: iv.MAX_SUGESTOES, maxArtes: iv.MAX_ARTES, maxTexto: iv.MAX_TEXTO, maxImagemBytes: iv.MAX_IMAGEM_BYTES,
    identidadeVigente: vigente ? { ano: Number(vigente.Ano), tema: vigente.Tema } : null, proximoAno: proximo, calendarioProximo: iv.calendario(proximo) };
  if (!c) return { ...base, ciclo: null };
  const ciclo = formatarCiclo(c, hoje);
  const minhas = (await pool.request().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId).query(`
      SELECT SugestaoId, Texto, TextoFinal, Status, ParecidoComAno, CriadaEm, RetiradaEm FROM IdentidadeSugestoes WHERE CicloId = @c AND MembroId = @m ORDER BY SugestaoId`)).recordset
    .map((s) => ({ sugestaoId: s.SugestaoId, texto: s.Texto,
      // a decisão da triagem só aparece para quem mandou depois que a votação abriu (antes, para todos, "em análise")
      situacao: s.Status === "RETIRADA" ? "RETIRADA" : c.EnqueteId || c.Apuracao ? s.Status : "ENVIADA",
      textoNaVotacao: c.EnqueteId && s.Status === "FINALISTA" ? (s.TextoFinal || s.Texto) : null, enviadaEm: iso(s.CriadaEm), retiradaEm: iso(s.RetiradaEm) }));
  const cores = ["ARTE", "ENCERRADO"].includes(ciclo.fase) ? await coresDoCiclo(pool, c.CicloId) : [];
  const minhasArtes = (await pool.request().input("c", sql.Int, c.CicloId).input("m", sql.Int, membroId).query(`
      SELECT ArteId, Titulo, Status, MotivoRecusa, CriadaEm, CASE WHEN ArquivoUrl IS NULL THEN 0 ELSE 1 END AS TemImagem FROM IdentidadeArtes
      WHERE CicloId = @c AND MembroId = @m AND EnviadaPelaDiretoria = 0 ORDER BY ArteId`)).recordset
    .map((a) => ({ arteId: a.ArteId, titulo: a.Titulo || null, situacao: a.Status, motivoRecusa: a.MotivoRecusa || null, enviadaEm: iso(a.CriadaEm), temImagem: !!a.TemImagem,
      podeRetirar: a.Status === "ENVIADA" && !ciclo.encerrado && hoje <= iv.retiradaDeArteAte(ciclo.anoAlvo) }));
  const resultado = ciclo.encerrado ? await resultadoDoCiclo(pool, c.CicloId) : null;
  return { ...base, ciclo, retiradaDeArteAte: iv.retiradaDeArteAte(ciclo.anoAlvo), minhasSugestoes: minhas, votacao: await votacaoDoCiclo(pool, c, { membroId }), cores, minhasArtes, resultado };
}

// A aba da Diretoria: a lista dos ciclos e se dá para abrir o do ano que vem.
async function painelGestao(pool, { agora = relogio() } = {}) {
  const hoje = hojeBrasilia(agora);
  const proximo = iv.anoAlvoDoDia(hoje);
  const linhas = (await pool.request().query(`${SELECT_CICLO} ORDER BY c.AnoAlvo DESC`)).recordset;
  const ciclos = [];
  for (const l of linhas) {
    const c = await cicloAtualizado(pool, l, agora);
    const n = (await pool.request().input("c", sql.Int, c.CicloId).query(`SELECT
        (SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND Status <> 'RETIRADA') AS sugestoes,
        (SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'FINALISTA') AS finalistas,
        (SELECT COUNT(*) FROM IdentidadeArtes WHERE CicloId = @c AND Status IN ('ENVIADA', 'ESCOLHIDA')) AS artes`)).recordset[0];
    ciclos.push({ ...formatarCiclo(c, hoje), sugestoes: Number(n.sugestoes), finalistas: Number(n.finalistas), artes: Number(n.artes) });
  }
  const jaTem = ciclos.some((c) => c.anoAlvo === proximo);
  const pode = iv.podeAbrirCiclo(proximo, hoje);
  return { sucesso: true, hoje, proximoAno: proximo, calendarioProximo: iv.calendario(proximo), podeAbrir: !jaTem && !pode.problema, motivoNaoAbre: jaTem ? null : pode.problema || null, ciclos };
}

// O ciclo inteiro, para a Diretoria: sugestões (SEM o nome de quem mandou: a triagem julga o texto), votação, cores, artes (com o autor) e o resultado.
async function detalheCiclo(pool, { cicloId, agora = relogio() }) {
  let c = await carregarCiclo(pool, cicloId);
  if (!c) return NAO_EXISTE;
  c = await cicloAtualizado(pool, c, agora);
  const hoje = hojeBrasilia(agora);
  const temas = await lerTemasUsados(pool.request());
  const sugestoes = (await pool.request().input("c", sql.Int, cicloId).query(`
      SELECT s.SugestaoId, s.Texto, s.TextoFinal, s.TextoNormalizado, s.Status, s.ParecidoComAno, s.ParecidoComTema, s.Criterio, s.ObservacaoTriagem, s.CriadaEm, s.TriadoEm, s.AnonimizadoEm, p.Nome AS TriadoPorNome
      FROM IdentidadeSugestoes s LEFT JOIN MembroReferencia p ON p.MembroId = s.TriadoPorMembroId WHERE s.CicloId = @c AND s.Status <> 'RETIRADA' ORDER BY s.SugestaoId`)).recordset
    .map((s) => {
      const conf = s.AnonimizadoEm && s.Status !== "FINALISTA" ? { igual: null, parecido: null } : iv.conferirTemasUsados(s.TextoFinal ? iv.normalizar(s.TextoFinal) : s.TextoNormalizado, temas);
      const achado = conf.igual || conf.parecido;
      return { sugestaoId: s.SugestaoId, texto: s.Texto, textoFinal: s.TextoFinal || null, situacao: s.Status,
      parecido: achado ? { ano: achado.ano, tema: achado.tema, igual: !!conf.igual } : null,
      parecidoNoEnvio: s.ParecidoComAno ? { ano: Number(s.ParecidoComAno), tema: s.ParecidoComTema } : null,
      criterio: s.Criterio ? { codigo: Number(s.Criterio), rotulo: iv.CRITERIOS[s.Criterio].rotulo } : null, observacao: s.ObservacaoTriagem || null, enviadaEm: iso(s.CriadaEm),
      triadaEm: iso(s.TriadoEm), triadaPor: s.TriadoPorNome || null, anonimizada: !!s.AnonimizadoEm };
    });
  const retiradas = contagem(await pool.request().input("c", sql.Int, cicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'RETIRADA'`));
  const participantes = contagem(await pool.request().input("c", sql.Int, cicloId).query(`SELECT COUNT(DISTINCT MembroId) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND Status <> 'RETIRADA'`));
  const artes = (await pool.request().input("c", sql.Int, cicloId).query(`
      SELECT a.ArteId, a.Titulo, a.Descricao, a.Status, a.MotivoRecusa, a.CriadaEm, a.TamanhoBytes, a.TipoConteudo, a.EnviadaPelaDiretoria, CASE WHEN a.ArquivoUrl IS NULL THEN 0 ELSE 1 END AS TemImagem,
             m.Nome AS AutorNome, cg.Nome AS Congregacao
      FROM IdentidadeArtes a LEFT JOIN MembroReferencia m ON m.MembroId = a.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      WHERE a.CicloId = @c AND a.Status <> 'RETIRADA' ORDER BY a.ArteId`)).recordset
    .map((a) => ({ arteId: a.ArteId, titulo: a.Titulo || null, descricao: a.Descricao || null, situacao: a.Status, motivoRecusa: a.MotivoRecusa || null, enviadaEm: iso(a.CriadaEm),
      tamanho: Number(a.TamanhoBytes), tipo: a.TipoConteudo, temImagem: !!a.TemImagem, autor: a.EnviadaPelaDiretoria ? "Diretoria (arte escolhida no culto)" : a.AutorNome || "(anonimizado)",
      congregacao: a.EnviadaPelaDiretoria ? null : a.Congregacao || null, daDiretoria: !!a.EnviadaPelaDiretoria }));
  return { sucesso: true, ciclo: formatarCiclo(c, hoje), sugestoes, retiradas, participantes, semDecisao: sugestoes.filter((x) => x.situacao === "ENVIADA").length, criterios: Object.values(iv.CRITERIOS),
    votacao: await votacaoDoCiclo(pool, c, { comVotos: false }), cores: await coresDoCiclo(pool, cicloId), artes, resultado: await resultadoDoCiclo(pool, cicloId),
    ocasioes: Object.entries(iv.OCASIOES).map(([codigo, rotulo]) => ({ codigo, rotulo })) };
}

// ---------------------------------------------------------------
// Rotina diária, avisos à Diretoria, retenção e LGPD
// ---------------------------------------------------------------

// Os ciclos que ainda podem ter algo a materializar: o do ano que vem e o do ano corrente (janeiro).
async function ciclosVivos(pool, agora) {
  const ano = Number(hojeBrasilia(agora).slice(0, 4));
  return (await pool.request().input("a", sql.SmallInt, ano).input("b", sql.SmallInt, ano + 1).query(`${SELECT_CICLO} WHERE c.AnoAlvo IN (@a, @b)`)).recordset;
}
// A rotina diária em duas partes (NotificacoesAgendador): ANTES dos avisos, o que a data decidiu (abrir a votação no dia 22, fechar e apurar depois do dia 30) — os avisos do
// dia já enxergam o resultado; DEPOIS dos avisos, a retenção (que apaga imagens no armazenamento), com orçamento de tempo: o que não couber fica para amanhã.
async function rotinaAntesDosAvisos(pool, { agora = relogio() } = {}) {
  const r = { falhas: [], votacoesAbertas: 0, apuradas: 0 };
  try {
    for (const c of await ciclosVivos(pool, agora)) {
      const feito = await materializar(pool, c, { agora });
      if (feito.votacao && feito.votacao.sucesso && !feito.votacao.jaExistia) r.votacoesAbertas++;
      if (feito.apuracao && feito.apuracao.sucesso && !feito.apuracao.jaApurado) r.apuradas++;
    }
  } catch (e) { r.falhas.push("ciclo"); console.error("[IDENTIDADE] ciclo:", e && e.message); }
  return r;
}
async function rotinaDepoisDosAvisos(pool, { agora = relogio(), orcamentoMs = 15000 } = {}) {
  const r = { falhas: [] };
  try { r.retencao = await aplicarRetencao(pool, { agora, orcamentoMs }); } catch (e) { r.falhas.push("retencao"); console.error("[IDENTIDADE] retenção:", e && e.message); }
  return r;
}
// As duas juntas (os roteiros de teste usam esta).
async function rotinaDiaria(pool, { agora = relogio() } = {}) {
  const a = await rotinaAntesDosAvisos(pool, { agora });
  const d = await rotinaDepoisDosAvisos(pool, { agora });
  return { ...a, ...d, falhas: [...a.falhas, ...d.falhas] };
}

const refDoDia = (hoje) => Number(String(hoje).replace(/-/g, ""));
async function detectarTriagem(pool, { agora = relogio() } = {}) {
  const hoje = hojeBrasilia(agora);
  const fatos = [];
  for (const c of await ciclosVivos(pool, agora)) {
    if (faseDe(c, hoje) !== "TRIAGEM") continue;
    const n = contagem(await pool.request().input("c", sql.Int, c.CicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND Status <> 'RETIRADA'`));
    fatos.push({ referenciaId: c.CicloId, fatoGerador: iv.textoTriagem({ anoAlvo: Number(c.AnoAlvo), quantas: n }) });
  }
  return fatos;
}
async function detectarVotacao(pool, { agora = relogio() } = {}) {
  const hoje = hojeBrasilia(agora);
  const fatos = [];
  for (const c of await ciclosVivos(pool, agora)) {
    if (faseDe(c, hoje) !== "VOTACAO" || iv.votacaoFechou(Number(c.AnoAlvo), agora)) continue;
    if (c.Apuracao) continue;                                     // o tema já foi definido sem votação
    const n = contagem(await pool.request().input("c", sql.Int, c.CicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeSugestoes WHERE CicloId = @c AND Status = 'FINALISTA'`));
    const p = await semDecisao(pool.request(), c.CicloId);
    // aberta: um aviso; não abriu (faltam finalistas, ou há sugestão sem decisão e ela espera o botão): um aviso por dia, até abrir
    fatos.push(c.EnqueteId ? { referenciaId: c.CicloId, fatoGerador: iv.textoVotacaoAberta({ anoAlvo: Number(c.AnoAlvo), finalistas: n }) }
      : { referenciaId: -refDoDia(hoje), fatoGerador: n < iv.MIN_FINALISTAS ? iv.textoVotacaoSemFinalistas({ anoAlvo: Number(c.AnoAlvo), finalistas: n })
        : iv.textoVotacaoEsperando({ anoAlvo: Number(c.AnoAlvo), pendentes: p, finalistas: n }) });
  }
  return fatos;
}
async function detectarApuracao(pool, { agora = relogio() } = {}) {
  const fatos = [];
  for (const c of await ciclosVivos(pool, agora)) {
    if (!c.Apuracao || c.ResultadoId) continue;
    if (c.Apuracao === "NAO_VOTADA") continue;                    // definido pela própria Diretoria: não há o que avisar
    fatos.push({ referenciaId: c.CicloId, fatoGerador: iv.textoApuracao({ anoAlvo: Number(c.AnoAlvo), situacao: c.Apuracao, tema: c.TemaDefinidoPor === "VOTACAO" ? c.TemaTexto : null,
      votos: c.TemaVotos, total: c.VotosTotal }) });
  }
  return fatos;
}
async function detectarArte(pool, { agora = relogio() } = {}) {
  const hoje = hojeBrasilia(agora);
  const fatos = [];
  for (const c of await ciclosVivos(pool, agora)) {
    if (faseDe(c, hoje) !== "ARTE") continue;
    const cores = contagem(await pool.request().input("c", sql.Int, c.CicloId).query(`SELECT COUNT(*) AS n FROM IdentidadeCores WHERE CicloId = @c`));
    fatos.push({ referenciaId: c.CicloId, fatoGerador: iv.textoArte({ anoAlvo: Number(c.AnoAlvo), cores }) });
  }
  return fatos;
}

async function diasDeRetencao(pool) {
  const l = (await pool.request().input("c", sql.NVarChar(200), RETENCAO_CATEGORIA).query(`SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = @c`)).recordset[0];
  const n = l ? Number(l.DiasRetencao) : RETENCAO_PADRAO;
  return Number.isInteger(n) && n >= 30 ? n : RETENCAO_PADRAO;
}
// Retenção: passado o prazo depois de 31/12 do ano do processo, a sugestão e a arte perdem o nome de quem mandou; a imagem que não foi escolhida sai do armazenamento.
// E a imagem da arte de quem pediu a exclusão LGPD (que ficou, sem nome, para não sumir do concurso) sai quando o ciclo encerra: com o resultado registrado, ou um mês
// depois de 31/12 sem ele — se não foi a escolhida. Orçamento de tempo: o que não couber nesta rodada fica para a de amanhã (cada passo é refeito do ponto onde parou).
async function aplicarRetencao(pool, { agora = relogio(), orcamentoMs = Infinity } = {}) {
  const inicio = Date.now();
  const dentro = () => Date.now() - inicio < orcamentoMs;
  let imagensLgpd = 0;
  const hojeL = hojeBrasilia(agora);
  const pendentesLgpd = (await pool.request().input("hoje", sql.NVarChar(10), hojeL).query(`
    SELECT a.ArteId, a.ArquivoUrl FROM IdentidadeArtes a JOIN IdentidadeCiclos c ON c.CicloId = a.CicloId
    WHERE a.AnonimizadoEm IS NOT NULL AND a.ArquivoUrl IS NOT NULL AND a.Status <> 'ESCOLHIDA'
      AND (EXISTS (SELECT 1 FROM IdentidadeResultados x WHERE x.CicloId = a.CicloId) OR DATEADD(MONTH, 1, DATEFROMPARTS(c.AnoAlvo - 1, 12, 31)) < CONVERT(date, @hoje, 23))`)).recordset;
  for (const a of pendentesLgpd) {
    if (!dentro()) return { sugestoes: 0, artes: 0, imagens: 0, imagensLgpd, incompleta: true };
    const u = await pool.request().input("a", sql.Int, a.ArteId).query(`UPDATE IdentidadeArtes SET ArquivoUrl = NULL, ImagemApagadaEm = SYSUTCDATETIME() WHERE ArteId = @a AND ArquivoUrl IS NOT NULL AND Status <> 'ESCOLHIDA'`);
    if (afetadas(u)) { imagensLgpd++; try { await armazenamento().excluirDocumento(a.ArquivoUrl); } catch (e) { /* best-effort */ } }
  }
  const dias = await diasDeRetencao(pool);
  const hoje = hojeBrasilia(agora);
  // ciclo de ano-alvo A termina em 31/12 de A−1: vencido quando hoje > 31/12/(A−1) + dias
  const limiteAno = (await pool.request().input("hoje", sql.NVarChar(10), hoje).input("d", sql.Int, dias)
    .query(`SELECT YEAR(DATEADD(DAY, -@d, CONVERT(date, @hoje, 23))) AS ano, CONVERT(varchar(10), DATEADD(DAY, -@d, CONVERT(date, @hoje, 23)), 23) AS limite`)).recordset[0];
  // o ciclo de ano-alvo A está vencido se DATEFROMPARTS(A−1, 12, 31) < limite
  const vencidos = (await pool.request().input("lim", sql.NVarChar(10), limiteAno.limite)
    .query(`SELECT CicloId FROM IdentidadeCiclos WHERE DATEFROMPARTS(AnoAlvo - 1, 12, 31) < CONVERT(date, @lim, 23)`)).recordset.map((x) => x.CicloId);
  let sugestoes = 0, artes = 0, imagens = 0;
  for (const cicloId of vencidos) {
    if (!dentro()) return { sugestoes, artes, imagens, imagensLgpd, incompleta: true };
    sugestoes += contagem(await pool.request().input("c", sql.Int, cicloId)
      .query(`UPDATE IdentidadeSugestoes SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE CicloId = @c AND MembroId IS NOT NULL; SELECT @@ROWCOUNT AS n`));
    const comImagem = (await pool.request().input("c", sql.Int, cicloId)
      .query(`SELECT ArteId, ArquivoUrl FROM IdentidadeArtes WHERE CicloId = @c AND Status <> 'ESCOLHIDA' AND ArquivoUrl IS NOT NULL`)).recordset;
    for (const a of comImagem) {
      if (!dentro()) return { sugestoes, artes, imagens, imagensLgpd, incompleta: true };
      const u = await pool.request().input("a", sql.Int, a.ArteId).query(`UPDATE IdentidadeArtes SET ArquivoUrl = NULL, ImagemApagadaEm = SYSUTCDATETIME() WHERE ArteId = @a AND ArquivoUrl IS NOT NULL AND Status <> 'ESCOLHIDA'`);
      if (afetadas(u)) { imagens++; try { await armazenamento().excluirDocumento(a.ArquivoUrl); } catch (e) { /* best-effort */ } }
    }
    artes += contagem(await pool.request().input("c", sql.Int, cicloId)
      .query(`UPDATE IdentidadeArtes SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE CicloId = @c AND MembroId IS NOT NULL; SELECT @@ROWCOUNT AS n`));
  }
  return { sugestoes, artes, imagens, imagensLgpd };
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD; `r()` cria um pedido nessa transação): as sugestões e as artes perdem o nome; a sugestão que não foi finalista
// perde também o texto (a finalista foi à votação pública e fica, sem nome). A imagem da arte: num ciclo JÁ encerrado (com resultado), a que não foi a escolhida sai — o
// arquivo é apagado do armazenamento DEPOIS da transação (quem chama apaga os `arquivos` devolvidos); num ciclo em andamento, a arte só perde o nome e a imagem fica no
// concurso (pode ser a escolhida no culto) até o ciclo encerrar — então a retenção diária a apaga, se não foi a escolhida. As contagens, os finalistas e o escolhido ficam.
async function exclusaoLgpd(r, membroId) {
  const id = Number(membroId);
  const textos = contagem(await r().input("m", sql.Int, id).input("t", sql.NVarChar(80), TEXTO_ANONIMO).query(`
    UPDATE IdentidadeSugestoes SET Texto = @t, TextoNormalizado = CONCAT(N'#anonimizada-', SugestaoId), MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE MembroId = @m AND Status <> 'FINALISTA'; SELECT @@ROWCOUNT AS n`));
  const finalistas = contagem(await r().input("m", sql.Int, id).query(`
    UPDATE IdentidadeSugestoes SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`));
  const ENCERRADO_SQL = "EXISTS (SELECT 1 FROM IdentidadeResultados x WHERE x.CicloId = IdentidadeArtes.CicloId)";
  const arquivos = (((await r().input("m", sql.Int, id).query(`SELECT ArquivoUrl FROM IdentidadeArtes WHERE MembroId = @m AND Status <> 'ESCOLHIDA' AND ArquivoUrl IS NOT NULL AND ${ENCERRADO_SQL}`)) || {}).recordset || [])
    .map((x) => x.ArquivoUrl);
  await r().input("m", sql.Int, id).query(`UPDATE IdentidadeArtes SET ArquivoUrl = NULL, ImagemApagadaEm = SYSUTCDATETIME() WHERE MembroId = @m AND Status <> 'ESCOLHIDA' AND ArquivoUrl IS NOT NULL AND ${ENCERRADO_SQL}`);
  const artes = contagem(await r().input("m", sql.Int, id).query(`
    UPDATE IdentidadeArtes SET Titulo = NULL, Descricao = NULL, MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`));
  return { sugestoes: textos + finalistas, artes, arquivos };
}
async function apagarArquivos(arquivos) {
  for (const u of arquivos || []) { try { await armazenamento().excluirDocumento(u); } catch (e) { /* best-effort: a linha já não aponta para ele */ } }
}

// Meus Dados: as sugestões e as artes da pessoa, de todos os anos.
async function dadosDoTitular(pool, membroId) {
  const sugestoes = (await pool.request().input("m", sql.Int, membroId).query(`
      SELECT c.AnoAlvo, s.Texto, s.Status, s.CriadaEm, s.RetiradaEm, c.EnqueteId FROM IdentidadeSugestoes s JOIN IdentidadeCiclos c ON c.CicloId = s.CicloId
      WHERE s.MembroId = @m ORDER BY s.SugestaoId DESC`)).recordset
    .map((s) => ({ identidadeDe: Number(s.AnoAlvo), texto: s.Texto, situacao: s.Status === "RETIRADA" ? "RETIRADA" : s.EnqueteId ? s.Status : "ENVIADA", enviadaEm: iso(s.CriadaEm), retiradaEm: iso(s.RetiradaEm) }));
  const artes = (await pool.request().input("m", sql.Int, membroId).query(`
      SELECT c.AnoAlvo, a.Titulo, a.Status, a.TipoConteudo, a.TamanhoBytes, a.CriadaEm, a.MotivoRecusa, CASE WHEN a.ArquivoUrl IS NULL THEN 0 ELSE 1 END AS TemImagem
      FROM IdentidadeArtes a JOIN IdentidadeCiclos c ON c.CicloId = a.CicloId WHERE a.MembroId = @m AND a.EnviadaPelaDiretoria = 0 ORDER BY a.ArteId DESC`)).recordset
    .map((a) => ({ identidadeDe: Number(a.AnoAlvo), titulo: a.Titulo || null, situacao: a.Status, tipo: a.TipoConteudo, tamanhoBytes: Number(a.TamanhoBytes), enviadaEm: iso(a.CriadaEm),
      motivoRecusa: a.MotivoRecusa || null, imagemGuardada: !!a.TemImagem }));
  return { sugestoesDeTema: sugestoes, artesEnviadas: artes };
}

module.exports = {
  PERMISSAO, usarArmazenamento, usarRelogio,
  abrirCiclo, cancelarCiclo, criarVotacao, apurarVotacao, definirTemaSemVotacao, materializar,
  listarTemas, salvarTema, excluirTema,
  sugerir, retirarSugestao, triar, desempatar,
  salvarCor, excluirCor, enviarArte, retirarArte, recusarArte, imagemDaArte, registrarResultado,
  painelMembro, painelGestao, detalheCiclo,
  rotinaDiaria, rotinaAntesDosAvisos, rotinaDepoisDosAvisos, detectarTriagem, detectarVotacao, detectarApuracao, detectarArte, aplicarRetencao, exclusaoLgpd, apagarArquivos, dadosDoTitular
};
