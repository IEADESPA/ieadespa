// shared/importacaoMembrosDb.js (FASE 10, v10.1e, passo 9 de Membros; migração 185; 22/11/2026) — a leitura e a gravação da IMPORTAÇÃO dos membros do sistema
// pago. As regras puras (ler o arquivo, as colunas, cada linha, classificar) estão em shared/importacaoMembros.js.
//
// Decisões do responsável (18/11 e 22/11/2026): só a Secretaria Geral; UMA VEZ SÓ (depois de confirmada, nenhuma outra importação; o que mudar depois se
// corrige à mão); colunas extras aceitas; matrícula repetida ou zerada entra com a próxima do sistema e a pendência NUMERO; possível repetida, a pendência
// REPETIDA; "IEADESPA - GERAL" entra sem congregação; todo importado entra em "Arrolamento a completar" (sem voto) com a pendência ARROLAMENTO.
//
// O caminho: a PRÉVIA (o arquivo lido e conferido contra o banco; nada entra ainda; a nova prévia substitui a anterior) → a CONFIRMAÇÃO (a prévia vira a
// importação em andamento; daqui não volta) → os LOTES (cada chamada importa até TAMANHO_LOTE linhas numa transação; a tela chama até acabar) → o FIM
// (as pendências de repetição entre linhas, o resumo final e os dados pessoais das linhas apagados: fica a lista para conferir, sem CPF nem contato).
// Tudo que muda o estado anda debaixo de uma trava só (sp_getapplock "importacao-membros"): duas abas da Secretaria Geral não importam ao mesmo tempo.
const crypto = require("crypto");
const { sql } = require("./db");
const regras = require("./importacaoMembros");
const ficha = require("./fichaMembro");
const matriculaNova = require("./matriculaNova");
const { registrarAuditoriaNaTransacao, registrarAuditoriaEmLoteNaTransacao } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");

const TRAVA = "importacao-membros";
const TAMANHO_LOTE = 200;
const SEGUIDAS_MAX = 5;   // 5 recusadas seguidas (sem nenhuma entrar entre elas) é o banco, não a linha: a importação para, sem ninguém de fora
const BLOCO_GRAVACAO = 400;   // linhas por INSERT da prévia (OPENJSON)
const POR_PAGINA = 100;
// O que fica nas linhas quando a importação TERMINA (24/11/2026, decisão da sessão a partir da regra dele — "a lista dos de fora: nome e motivo" — e da LGPD).
// Todas perdem os dados pessoais: o da importada vive na ficha, onde a exclusão LGPD passa; ela fica com a linha, a matrícula, o nome e a situação (e as marcas
// que a lista e o resultado leem). A de fora fica SÓ com o nome e o motivo (Problemas) pelos 90 dias da guarda. A conclusão limpa as suas; a rotina diária
// (aplicarRetencao) limpa as que terminaram antes desta versão. Os AINDA_* deixam a rotina tocar só na linha que ainda tem alguma coisa.
const LIMPAR_PESSOAIS = "IgrejaArquivo = NULL, CongregacaoId = NULL, Sexo = NULL, DataNascimento = NULL, EstadoCivil = NULL, Email = NULL, Telefone = NULL, NomeMae = NULL, "
  + "NomePai = NULL, Cpf = NULL, DataAdmissao = NULL, FormaAdmissao = NULL, DataBatismo = NULL, Escolaridade = NULL";
const AINDA_PESSOAIS = "(l.IgrejaArquivo IS NOT NULL OR l.CongregacaoId IS NOT NULL OR l.Sexo IS NOT NULL OR l.DataNascimento IS NOT NULL OR l.EstadoCivil IS NOT NULL "
  + "OR l.Email IS NOT NULL OR l.Telefone IS NOT NULL OR l.NomeMae IS NOT NULL OR l.NomePai IS NOT NULL OR l.Cpf IS NOT NULL OR l.DataAdmissao IS NOT NULL "
  + "OR l.FormaAdmissao IS NOT NULL OR l.DataBatismo IS NOT NULL OR l.Escolaridade IS NOT NULL)";
// (o número novo e o motivo do número saem juntos: CK_ImportacoesMembrosLinhas_Numero)
const LIMPAR_FORA = "MatriculaArquivo = NULL, Matricula = NULL, NumeroNovo = 0, MotivoNumero = NULL, RepetidaLinha = NULL, RepetidaMembro = NULL, Avisos = NULL";
const AINDA_FORA = "(l.MatriculaArquivo IS NOT NULL OR l.Matricula IS NOT NULL OR l.NumeroNovo = 1 OR l.MotivoNumero IS NOT NULL OR l.RepetidaLinha IS NOT NULL "
  + "OR l.RepetidaMembro IS NOT NULL OR l.Avisos IS NOT NULL)";
const MSG = Object.freeze({
  JA_IMPORTADO: "A importação do sistema pago já foi feita (é uma vez só). O que mudou depois se corrige à mão, na ficha de cada pessoa.",
  EM_ANDAMENTO: "A importação já foi confirmada e está em andamento: continue a importação.",
  PREVIA_MUDOU: "Esta prévia não é mais a atual (outra foi feita depois, ou foi descartada). Confira a prévia de novo antes de confirmar.",
  NAO_EXISTE: "Importação não encontrada.",
  NINGUEM_ENTRA: "Nenhuma pessoa desta planilha entra no sistema: confira o arquivo antes de confirmar.",
  OCUPADO: "Outra pessoa está mexendo na importação agora. Tente de novo daqui a pouco.",
  RECUSADAS: (linha) => `O sistema não conseguiu gravar ${SEGUIDAS_MAX} linhas seguidas (a partir da linha ${linha} do arquivo): a importação parou sem deixar ninguém de fora. `
    + "Se o problema for dessas linhas, deixe-as de fora e continue; se voltar nas seguintes, avise o suporte.",
  NINGUEM_ENTROU: "O sistema não conseguiu gravar nenhuma pessoa desta importação: ela parou sem deixar ninguém de fora. Avise o suporte."
});
// A LINHA QUE O BANCO RECUSA (revisão de 23/11/2026, a saída do IMPORTANDO). Só um erro de DADO levantado pelos comandos da PRÓPRIA linha (a ficha, as
// pendências, a marcação) deixa a linha de fora: a regra (CHECK, chave estrangeira), a chave repetida, o texto longo demais, a conversão, o nulo, o estouro, o
// gatilho que recusa (50000+, ou que desfaz a transação: 3609). O resto — a trava do banco, o tempo esgotado, a rede, o defeito do código, a trilha, a conclusão,
// o "8 tentativas" — sobe como sempre (a tela mostra "continue de onde parou" e nada se perde).
const ERROS_DA_LINHA = new Set([547, 2601, 2627, 2628, 8152, 241, 242, 245, 8114, 8115, 220, 515, 3609]);
const recusaDaLinha = (e) => !!e && e.linhaImportacao != null && Number.isInteger(e.number) && (ERROS_DA_LINHA.has(e.number) || e.number >= 50000);
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null; };

async function emTransacao(pool, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const rq = () => new sql.Request(t);
    const r = await rq().input("r", sql.NVarChar(255), TRAVA)
      .query("DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = @r, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000; SELECT @rc AS rc");
    if (Number(r.recordset[0].rc) < 0) { await t.rollback(); return { sucesso: false, status: 409, mensagem: MSG.OCUPADO }; }
    const res = await fazer(t, rq);
    if (res && res.sucesso === false) { await t.rollback(); return res; }
    await t.commit();
    return res;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}

// As importações que contam: a concluída (uma vez só), a em andamento e a prévia aberta.
async function lerSituacao(rq) {
  const r = await rq().query(`SELECT ImportacaoId, Situacao, NomeArquivo, HashArquivo, CriadaEm, CriadaPor, ConfirmadaEm, ConfirmadaPor, ConcluidaEm, Resumo
    FROM ImportacoesMembros WHERE Situacao IN (N'PREVIA', N'IMPORTANDO', N'CONCLUIDA') ORDER BY ImportacaoId`);
  const de = (s) => r.recordset.filter((l) => l.Situacao === s).pop() || null;
  return { concluida: de("CONCLUIDA"), andamento: de("IMPORTANDO"), previa: de("PREVIA") };
}
const lerJson = (t) => { try { return t ? JSON.parse(t) : null; } catch (_) { return null; } };
const publico = (l) => (l ? { importacaoId: Number(l.ImportacaoId), situacao: l.Situacao, nomeArquivo: l.NomeArquivo, criadaEm: l.CriadaEm, confirmadaEm: l.ConfirmadaEm,
  concluidaEm: l.ConcluidaEm, resumo: lerJson(l.Resumo) } : null);

// O estado para a tela: já foi feita? há uma em andamento (quantas faltam)? há uma prévia aberta? `campos`: o catálogo do mapa das colunas (o select da tela).
// Feita, vem também o RETRATO do resultado (a tela r27, passo 4): quem importou, as matrículas novas e onde as fichas estão hoje, por área.
async function estado(pool) {
  const sit = await lerSituacao(() => pool.request());
  const atual = sit.concluida || sit.andamento || sit.previa;
  let restantes = null;
  if (sit.andamento) restantes = await contarRestantes(() => pool.request(), Number(sit.andamento.ImportacaoId));
  const retrato = sit.concluida ? await retratoDoResultado(() => pool.request(), sit.concluida) : null;
  // os prazos da guarda dos dados (a nota do "Descartar" e a do resultado dizem o prazo de verdade, também o ajustado nas Políticas de retenção)
  const { diasPrevia, diasFora } = await prazosDaGuarda(pool);
  return { sucesso: true, feita: !!sit.concluida, emAndamento: !!sit.andamento, importacao: publico(atual), restantes, retrato, campos: regras.CAMPOS,
    guarda: { diasPrevia, diasFora } };
}
// Onde as fichas importadas estão HOJE (por área; o arrolamento completo = a situação já não é "Arrolamento a completar"), as matrículas novas e quem confirmou.
// Sem dado pessoal além do nome de quem importou (a Secretaria Geral, que é quem vê a tela).
async function retratoDoResultado(rq, imp) {
  const id = Number(imp.ImportacaoId);
  const areas = (await rq().input("id", sql.Int, id).query(`
    SELECT a.AreaId, a.Nome AS Area, CASE WHEN m.CongregacaoId IS NULL THEN 1 ELSE 0 END AS SemCongregacao, COUNT(DISTINCT m.CongregacaoId) AS Congregacoes,
      COUNT(*) AS Fichas, SUM(CASE WHEN m.SituacaoMembro <> N'ARROLAMENTO' THEN 1 ELSE 0 END) AS Completas
    FROM ImportacoesMembrosLinhas l JOIN MembroReferencia m ON m.MembroId = l.MatriculaFinal
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN Areas a ON a.AreaId = c.AreaId
    WHERE l.ImportacaoId = @id AND l.Estado = N'IMPORTADA'
    GROUP BY a.AreaId, a.Nome, CASE WHEN m.CongregacaoId IS NULL THEN 1 ELSE 0 END
    ORDER BY CASE WHEN m.CongregacaoId IS NULL THEN 1 ELSE 0 END, CASE WHEN a.AreaId IS NULL THEN 1 ELSE 0 END, a.Nome`)).recordset;
  // os quadros do resultado, cada ficha numa caixa só (como os da prévia): a matrícula nova, depois a possível repetida, depois a que ficou como estava
  const novas = (await rq().input("id", sql.Int, id).query(`SELECT MIN(CASE WHEN NumeroNovo = 1 THEN MatriculaFinal END) AS de,
      MAX(CASE WHEN NumeroNovo = 1 THEN MatriculaFinal END) AS ate, SUM(CASE WHEN NumeroNovo = 1 THEN 1 ELSE 0 END) AS n,
      SUM(CASE WHEN NumeroNovo = 0 AND (RepetidaLinha IS NOT NULL OR RepetidaMembro IS NOT NULL) THEN 1 ELSE 0 END) AS repetidas,
      SUM(CASE WHEN NumeroNovo = 0 AND RepetidaLinha IS NULL AND RepetidaMembro IS NULL THEN 1 ELSE 0 END) AS comMatricula
    FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Estado = N'IMPORTADA'`)).recordset[0] || {};
  const quem = imp.ConfirmadaPor == null ? null
    : (await rq().input("m", sql.Int, Number(imp.ConfirmadaPor)).query("SELECT Nome FROM MembroReferencia WHERE MembroId = @m")).recordset[0];
  return {
    confirmadaPor: quem ? quem.Nome : null,
    matriculasNovas: { total: Number(novas.n || 0), de: novas.de == null ? null : Number(novas.de), ate: novas.ate == null ? null : Number(novas.ate) },
    quadros: { comMatricula: Number(novas.comMatricula || 0), acertar: Number(novas.n || 0), repetidas: Number(novas.repetidas || 0) },
    porArea: areas.map((a) => ({ area: a.SemCongregacao ? null : a.Area || null, semCongregacao: !!a.SemCongregacao, congregacoes: Number(a.Congregacoes || 0),
      fichas: Number(a.Fichas || 0), completas: Number(a.Completas || 0) }))
  };
}
async function contarRestantes(rq, id) {
  const r = await rq().input("id", sql.Int, id).query("SELECT COUNT(*) AS n FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE'");
  return Number(r.recordset[0].n);
}

// ------------------------------------------------------------------ a prévia
// Lê e confere o arquivo (o trabalho pesado fica fora da transação: nada é gravado até o fim) e grava a prévia com as linhas. A prévia anterior é descartada.
// `colunas`: o mapa das colunas escolhido na tela (um campo ou null para cada coluna do cabeçalho); sem ele, cada coluna é reconhecida pelo nome.
async function criarPrevia(pool, usuario, { nomeArquivo, texto, colunas }) {
  const sit = await lerSituacao(() => pool.request());
  if (sit.concluida) return { sucesso: false, status: 409, mensagem: MSG.JA_IMPORTADO };
  if (sit.andamento) return { sucesso: false, status: 409, mensagem: MSG.EM_ANDAMENTO };
  const congs = (await pool.request().query("SELECT CongregacaoId, Nome, Ativa FROM Congregacoes")).recordset
    .map((c) => ({ congregacaoId: Number(c.CongregacaoId), nome: c.Nome, ativa: c.Ativa }));
  const prep = regras.prepararArquivo(texto, { congregacoes: regras.mapaDeCongregacoes(congs), hojeISO: hojeBrasilia(), escolha: colunas });
  // a coluna que falta: o mapa volta junto (só os nomes do cabeçalho, nenhum dado pessoal) para a tela ligar a coluna certa
  if (prep.erro) return { sucesso: false, status: 400, mensagem: prep.erro, ...(prep.colunas ? { colunas: prep.colunas, totalColunas: prep.totalColunas } : {}) };

  // as fichas que já existem com as matrículas e com os CPFs do arquivo (uma ida ao banco para cada)
  const mats = [...new Set(prep.linhas.map((l) => l.matricula.numero).filter(Boolean))];
  const cpfs = [...new Set(prep.linhas.map((l) => l.dados.cpf).filter(Boolean))];
  const fichasPorMatricula = new Map(), fichasPorCpf = new Map();
  if (mats.length) {
    const r = await pool.request().input("j", sql.NVarChar(sql.MAX), JSON.stringify(mats))
      .query("SELECT m.MembroId, m.Nome, m.Cpf FROM OPENJSON(@j) WITH (v INT '$') j JOIN MembroReferencia m ON m.MembroId = j.v");
    for (const l of r.recordset) fichasPorMatricula.set(Number(l.MembroId), { nome: l.Nome, cpf: l.Cpf ? String(l.Cpf).trim() : null });
  }
  if (cpfs.length) {
    const r = await pool.request().input("j", sql.NVarChar(sql.MAX), JSON.stringify(cpfs))
      .query("SELECT m.MembroId, m.Cpf FROM OPENJSON(@j) WITH (v CHAR(11) '$') j JOIN MembroReferencia m ON m.Cpf = j.v");
    for (const l of r.recordset) fichasPorCpf.set(String(l.Cpf).trim(), Number(l.MembroId));
  }
  // as fichas com o mesmo nome e nascimento de alguma linha (a mesma chave da tela Fichas repetidas: sem acento nem maiúscula, os espaços juntos); a chave é a
  // do nome do ARQUIVO (j.n), para o Map bater com a linha
  const fichasPorNomeNascimento = new Map();
  const pares = [...new Map(prep.linhas.filter((l) => !l.problemas.length && l.dados.nome && l.dados.dataNascimento)
    .map((l) => [regras.chaveNomeNascimento(l.dados.nome, l.dados.dataNascimento), { n: l.dados.nome, d: l.dados.dataNascimento }])).values()];
  if (pares.length) {
    const r = await pool.request().input("j", sql.NVarChar(sql.MAX), JSON.stringify(pares)).query(`
      SELECT j.n AS N, CONVERT(varchar(10), j.d, 120) AS D, MIN(m.MembroId) AS MembroId
      FROM OPENJSON(@j) WITH (n NVARCHAR(200), d DATE) j
      JOIN MembroReferencia m ON m.DataNascimento = j.d
        AND LTRIM(RTRIM(REPLACE(REPLACE(m.Nome, N'  ', N' '), N'  ', N' '))) COLLATE Latin1_General_CI_AI = j.n COLLATE Latin1_General_CI_AI
      GROUP BY j.n, j.d`);
    for (const l of r.recordset) fichasPorNomeNascimento.set(regras.chaveNomeNascimento(l.N, l.D), Number(l.MembroId));
  }
  regras.classificar(prep.linhas, { fichasPorMatricula, fichasPorCpf, fichasPorNomeNascimento });
  const maior = Number((await pool.request().query("SELECT ISNULL(MAX(MembroId), 0) AS m FROM MembroReferencia")).recordset[0].m);
  const resumo = regras.resumir(prep, { maiorMatriculaSistema: maior });
  const nome = typeof nomeArquivo === "string" ? nomeArquivo.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 200) || null : null;

  return emTransacao(pool, async (t, rq) => {
    const agora = await lerSituacao(rq);   // de novo, debaixo da trava
    if (agora.concluida) return { sucesso: false, status: 409, mensagem: MSG.JA_IMPORTADO };
    if (agora.andamento) return { sucesso: false, status: 409, mensagem: MSG.EM_ANDAMENTO };
    if (agora.previa) await descartarNaTransacao(rq, Number(agora.previa.ImportacaoId));
    const id = Number((await rq().input("n", sql.NVarChar(200), nome).input("h", sql.Char(64), sha256(texto)).input("por", sql.Int, Number(usuario.membroId))
      .input("res", sql.NVarChar(sql.MAX), JSON.stringify(resumo))
      .query(`INSERT INTO ImportacoesMembros (NomeArquivo, HashArquivo, CriadaPor, Resumo) OUTPUT INSERTED.ImportacaoId VALUES (@n, @h, @por, @res)`)).recordset[0].ImportacaoId);
    for (let i = 0; i < prep.linhas.length; i += BLOCO_GRAVACAO) {
      const bloco = prep.linhas.slice(i, i + BLOCO_GRAVACAO).map((l) => ({
        l: l.linha, a: l.acao, ma: l.matricula.texto || null, m: l.matriculaNumero, nn: l.numeroNovo ? 1 : 0, mn: l.motivoNumero, rl: l.repetidaLinha, rm: l.repetidaMembro,
        p: l.problemas.join(",").slice(0, 300) || null, av: l.avisos.join(",").slice(0, 400) || null, n: l.dados.nome, ig: l.dados.igrejaArquivo, c: l.dados.congregacaoId,
        s: l.dados.sexo, dn: l.dados.dataNascimento, ec: l.dados.estadoCivil, e: l.dados.email, t: l.dados.telefone, mae: l.dados.nomeMae, pai: l.dados.nomePai,
        cpf: l.dados.cpf, da: l.dados.dataAdmissao, fa: l.dados.formaAdmissao, db: l.dados.dataBatismo, esc: l.dados.escolaridade }));
      await rq().input("id", sql.Int, id).input("j", sql.NVarChar(sql.MAX), JSON.stringify(bloco)).query(`
        INSERT INTO ImportacoesMembrosLinhas (ImportacaoId, Linha, Acao, MatriculaArquivo, Matricula, NumeroNovo, MotivoNumero, RepetidaLinha, RepetidaMembro, Problemas,
          Avisos, Nome, IgrejaArquivo, CongregacaoId, Sexo, DataNascimento, EstadoCivil, Email, Telefone, NomeMae, NomePai, Cpf, DataAdmissao, FormaAdmissao, DataBatismo,
          Escolaridade)
        SELECT @id, j.l, j.a, j.ma, j.m, j.nn, j.mn, j.rl, j.rm, j.p, j.av, j.n, j.ig, j.c, j.s, j.dn, j.ec, j.e, j.t, j.mae, j.pai, j.cpf, j.da, j.fa, j.db, j.esc
        FROM OPENJSON(@j) WITH (l INT, a NVARCHAR(10), ma NVARCHAR(20), m INT, nn BIT, mn NVARCHAR(30), rl INT, rm INT, p NVARCHAR(300), av NVARCHAR(400), n NVARCHAR(200),
          ig NVARCHAR(150), c INT, s NCHAR(1), dn DATE, ec NVARCHAR(20), e NVARCHAR(150), t NVARCHAR(20), mae NVARCHAR(150), pai NVARCHAR(150), cpf CHAR(11), da DATE,
          fa NVARCHAR(30), db DATE, esc NVARCHAR(30)) j`);
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Fez a prévia da importação do sistema pago", usuarioId: Number(usuario.membroId),
      dadosDepois: { nomeArquivo: nome, total: resumo.total, novas: resumo.novas, problemas: resumo.problemas, jaExistem: resumo.jaExistem, numeroNovo: resumo.numeroNovo,
        possivelRepetida: resumo.possivelRepetida, colunasEscolhidas: !!(resumo.colunas && resumo.colunas.escolhidas) } });
    return { sucesso: true, importacaoId: id, resumo };
  });
}

// A prévia descartada: as linhas saem inteiras (com os dados pessoais); fica o cabeçalho com o resumo (sem dado pessoal).
async function descartarNaTransacao(rq, id) {
  await rq().input("id", sql.Int, id).query(`DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id;
    UPDATE ImportacoesMembros SET Situacao = N'DESCARTADA', DescartadaEm = SYSUTCDATETIME() WHERE ImportacaoId = @id AND Situacao = N'PREVIA';`);
}
async function descartar(pool, usuario, importacaoId) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  return emTransacao(pool, async (t, rq) => {
    const sit = await lerSituacao(rq);
    if (!sit.previa || Number(sit.previa.ImportacaoId) !== id) return { sucesso: false, status: 409, mensagem: MSG.PREVIA_MUDOU };
    await descartarNaTransacao(rq, id);
    await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Descartou a prévia da importação do sistema pago", usuarioId: Number(usuario.membroId) });
    return { sucesso: true };
  });
}

// ------------------------------------------------------------------ a lista para conferir (a tela e o arquivo para baixar)
// filtro: "problemas" (não entram: com problema ou a matrícula que já existe), "avisos" (entram com aviso: número novo, possível repetida, o que entrou sem...),
// "acertar" (a matrícula a acertar: recebem a próxima do sistema), "repetidas" (as possíveis repetidas que ficam com a matrícula de antes: as do quadro da tela)
// ou "todas". Nunca o CPF nem o contato.
const FILTROS = Object.freeze({
  problemas: "AND a.Acao = N'PROBLEMA'",
  avisos: "AND a.Acao = N'NOVA' AND a.Avisos IS NOT NULL",
  acertar: "AND a.Acao = N'NOVA' AND a.NumeroNovo = 1",
  repetidas: "AND a.Acao = N'NOVA' AND a.NumeroNovo = 0 AND (a.RepetidaLinha IS NOT NULL OR a.RepetidaMembro IS NOT NULL)",
  todas: ""
});
const paraLista = (l) => regras.linhaParaLista({ linha: Number(l.Linha), matriculaArquivo: l.MatriculaArquivo || "", nome: l.Nome || "", acao: l.Acao,
  matriculaFinal: l.MatriculaFinal == null ? null : Number(l.MatriculaFinal), problemas: l.Problemas ? l.Problemas.split(",") : [], avisos: l.Avisos ? l.Avisos.split(",") : [] });
// O detalhe de cada linha para a tela (r27, "Matrícula a acertar" e "Possíveis repetidas"): por que a matrícula muda (e quem ficou com ela: a linha que veio
// antes), de quem pode ser repetida e o número que ela RECEBE — o de verdade depois de importada; antes, o PREVISTO pela regra do lote (as matrículas do arquivo
// entram primeiro e as novas seguem a ordem das linhas a partir da maior + 1; um cadastro feito no meio do caminho, ou uma matrícula liberada ao juntar fichas,
// pode mudar o número: por isso "prevista").
const detalheDe = (l, base) => {
  const importada = l.Estado === "IMPORTADA";
  const nova = l.NumeroNovo === true || l.NumeroNovo === 1;
  const ordem = l.OrdemNova == null ? null : Number(l.OrdemNova);
  return {
    motivoNumero: nova ? l.MotivoNumero || null : null,
    semCongregacao: importada ? null : l.CongregacaoId == null && l.Acao === "NOVA",
    dono: l.DonoLinha == null ? null : { linha: Number(l.DonoLinha), nome: l.DonoNome || "", sexo: l.DonoSexo ? String(l.DonoSexo).trim() || null : null },
    repetidaDe: l.RepetidaLinha != null ? { linha: Number(l.RepetidaLinha), matricula: null, nome: l.RepLinhaNome || "" }
      : l.RepetidaMembro != null ? { linha: null, matricula: Number(l.RepetidaMembro), nome: l.RepMembroNome || "" } : null,
    recebe: importada ? Number(l.MatriculaFinal) : nova && base && ordem ? base + ordem - 1 : null,
    prevista: !importada && nova && !!base && !!ordem
  };
};
async function listar(pool, importacaoId, { filtro = "todas", pagina = 1 } = {}) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  const p = Math.max(1, Math.min(100000, Math.floor(Number(pagina) || 1)));
  const f = Object.prototype.hasOwnProperty.call(FILTROS, filtro) ? filtro : "todas";
  const cab = (await pool.request().input("id", sql.Int, id).query("SELECT Resumo FROM ImportacoesMembros WHERE ImportacaoId = @id")).recordset[0];
  const resumo = cab ? lerJson(cab.Resumo) || {} : {};
  // o primeiro número novo previsto (a prévia de antes de 23/11 não o tinha: a próxima matrícula menos as que recebem número novo)
  const base = Number(resumo.primeiraMatriculaNova) || (Number(resumo.proximaMatricula) && Number(resumo.proximaMatricula) - Number(resumo.numeroNovo || 0)) || null;
  // a ordem do número novo conta sobre TODAS as linhas de número novo da importação (não só as da página nem só as do filtro)
  const r = await pool.request().input("id", sql.Int, id).input("pula", sql.Int, (p - 1) * POR_PAGINA).input("n", sql.Int, POR_PAGINA).query(`
    WITH ordem AS (SELECT Linha, ROW_NUMBER() OVER (ORDER BY Linha) AS OrdemNova FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Acao = N'NOVA' AND NumeroNovo = 1)
    SELECT COUNT(*) OVER () AS Total, a.Linha, a.MatriculaArquivo, a.Nome, a.Acao, a.Estado, a.MatriculaFinal, a.Problemas, a.Avisos, a.NumeroNovo, a.MotivoNumero,
      a.CongregacaoId, a.RepetidaLinha, rl.Nome AS RepLinhaNome, a.RepetidaMembro, rm.Nome AS RepMembroNome, dono.Linha AS DonoLinha, dono.Nome AS DonoNome, dono.Sexo AS DonoSexo, o.OrdemNova
    FROM ImportacoesMembrosLinhas a
    LEFT JOIN ordem o ON o.Linha = a.Linha
    LEFT JOIN ImportacoesMembrosLinhas rl ON rl.ImportacaoId = a.ImportacaoId AND rl.Linha = a.RepetidaLinha
    LEFT JOIN MembroReferencia rm ON rm.MembroId = a.RepetidaMembro
    OUTER APPLY (SELECT TOP 1 b.Linha, b.Nome, b.Sexo FROM ImportacoesMembrosLinhas b
      WHERE a.MotivoNumero = N'REPETIDA_NO_ARQUIVO' AND b.ImportacaoId = a.ImportacaoId AND b.Acao = N'NOVA' AND b.NumeroNovo = 0
        AND b.Matricula = TRY_CONVERT(INT, a.MatriculaArquivo) ORDER BY b.Linha) dono
    WHERE a.ImportacaoId = @id ${FILTROS[f]}
    ORDER BY a.Linha OFFSET @pula ROWS FETCH NEXT @n ROWS ONLY`);
  const total = r.recordset.length ? Number(r.recordset[0].Total) : 0;
  return { sucesso: true, filtro: f, pagina: p, porPagina: POR_PAGINA, total, itens: r.recordset.map((l) => ({ ...paraLista(l), detalhe: detalheDe(l, base) })) };
}
async function csv(pool, importacaoId) {
  const id = idValido(importacaoId);
  if (!id) return null;
  const r = await pool.request().input("id", sql.Int, id).query(`SELECT Linha, MatriculaArquivo, Nome, Acao, MatriculaFinal, Problemas, Avisos
    FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND (Acao = N'PROBLEMA' OR Avisos IS NOT NULL) ORDER BY Linha`);
  return regras.csvDaLista(r.recordset.map(paraLista));
}

// ------------------------------------------------------------------ a confirmação (daqui não volta)
async function confirmar(pool, usuario, importacaoId) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  return emTransacao(pool, async (t, rq) => {
    const sit = await lerSituacao(rq);
    if (sit.concluida) return { sucesso: false, status: 409, mensagem: MSG.JA_IMPORTADO };
    if (sit.andamento) return Number(sit.andamento.ImportacaoId) === id
      ? { sucesso: true, importacaoId: id, jaConfirmada: true, restantes: await contarRestantes(rq, id) }
      : { sucesso: false, status: 409, mensagem: MSG.EM_ANDAMENTO };
    if (!sit.previa || Number(sit.previa.ImportacaoId) !== id) return { sucesso: false, status: 409, mensagem: MSG.PREVIA_MUDOU };
    // a importação em que ninguém entra não se confirma (23/11/2026): terminaria CONCLUIDA com zero pessoas, soltaria a trava das matrículas e gastaria a
    // importação única com uma planilha errada
    if ((await contarRestantes(rq, id)) === 0) return { sucesso: false, status: 409, mensagem: MSG.NINGUEM_ENTRA };
    await rq().input("id", sql.Int, id).input("por", sql.Int, Number(usuario.membroId)).query(`
      UPDATE ImportacoesMembros SET Situacao = N'IMPORTANDO', ConfirmadaEm = SYSUTCDATETIME(), ConfirmadaPor = @por WHERE ImportacaoId = @id AND Situacao = N'PREVIA';
      UPDATE ImportacoesMembrosLinhas SET Estado = N'FORA' WHERE ImportacaoId = @id AND Acao = N'PROBLEMA';`);
    const restantes = await contarRestantes(rq, id);
    await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Confirmou a importação do sistema pago", usuarioId: Number(usuario.membroId),
      dadosDepois: { aImportar: restantes } });
    return { sucesso: true, importacaoId: id, restantes };
  });
}

// ------------------------------------------------------------------ um lote
const DETALHE_NUMERO = {
  ZERO: () => "Veio com a matrícula 0 do sistema pago: confira o número.",
  VAZIA: () => "Veio sem matrícula do sistema pago: confira o número.",
  INVALIDA: (t) => `A matrícula do sistema pago não é um número (${String(t || "").slice(0, 20)}): confira o número.`,
  REPETIDA_NO_ARQUIVO: (t) => `A matrícula ${String(t || "").slice(0, 20)} veio repetida no arquivo do sistema pago: confira o número.`,
  DE_OUTRA_FICHA: (t) => `A matrícula ${String(t || "").slice(0, 20)} do sistema pago já era de outra ficha: confira o número.`
};
const DETALHE_ARROLAMENTO = "Importada do sistema pago: complete a situação, o cargo, a data e a forma de entrada (até lá, sem voto).";
const DETALHE_REPETIDA = "Importação do sistema pago: pode ser a mesma pessoa (o mesmo CPF, o mesmo nome e nascimento, ou a mesma matrícula e o mesmo nome).";

async function abrirPendencia(rq, { membroId, tipo, outro = null, detalhe, por }) {
  await rq().input("m", sql.Int, membroId).input("t", sql.NVarChar(12), tipo).input("o", sql.Int, outro).input("d", sql.NVarChar(300), String(detalhe).slice(0, 300))
    .input("por", sql.Int, por).query(`
      IF (@o IS NULL OR EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @o))
         AND NOT EXISTS (SELECT 1 FROM FichasPendencias WHERE MembroId = @m AND Tipo = @t AND (OutroMembroId = @o OR (OutroMembroId IS NULL AND @o IS NULL)) AND Situacao = N'ABERTA')
        INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Detalhe, Origem, AbertaPor) VALUES (@m, @t, @o, @d, N'IMPORTACAO', @por)`);
}

// Importa até `tamanho` linhas pendentes, numa transação. Primeiro as que têm a matrícula do arquivo (na ordem do arquivo), depois as de número novo (que
// recebem a próxima do sistema DEPOIS de todas as do arquivo estarem no lugar). Cada linha é conferida de novo contra o banco de agora: a matrícula que
// alguém usou depois da prévia vira número novo (NUMERO) e vai para o fim da fila; o CPF que alguém gravou depois entra sem o CPF, como possível repetida.
// Cada lote é uma transação própria: o que entrou fica, e a chamada seguinte continua da primeira linha pendente. A linha que o banco RECUSA SEMPRE (um erro de
// dado dela: veja recusaDaLinha) desfazia o lote inteiro a cada chamada e a importação ficava presa, com as matrículas novas travadas no sistema todo. Agora o
// lote é refeito na mesma chamada, com a recusada marcada de fora (como PROBLEMA: na lista e no CSV, ninguém some calado) e só até UMA linha depois dela: se
// essa entra, é a linha, e não o banco, e tudo é gravado junto. A ordem das outras não muda (NumeroNovo, Linha). 5 recusadas seguidas: para, sem marcar ninguém,
// e a tela ganha a saída (A6 da revisão de 24/11/2026: antes, só mexendo no banco à mão): com `deixarDeFora` (a Secretaria Geral confirma na tela), a chamada
// tenta de novo do mesmo ponto e, se as mesmas 5 recusarem outra vez, deixa SÓ essas de fora (as que o servidor acabou de ver recusar; nenhum número vem do
// cliente), numa transação que não grava mais ninguém; a próxima chamada segue como sempre. Se elas entrarem (era passageiro), ninguém fica de fora.
async function importarLote(pool, usuario, importacaoId, { tamanho = TAMANHO_LOTE, deixarDeFora = false } = {}) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  let n = Math.max(1, Math.min(TAMANHO_LOTE, Math.floor(Number(tamanho) || TAMANHO_LOTE)));
  const por = Number(usuario.membroId);
  const fora = [];   // as recusadas desta chamada, ainda sem uma linha depois delas que tenha entrado: { linha, erro } (o número do erro, nunca a mensagem)
  for (;;) {
    try {
      return await emTransacao(pool, (t, rq) => gravarLote(t, rq, { id, n, por, fora }));
    } catch (e) {
      if (!recusaDaLinha(e)) throw e;
      fora.push({ linha: e.linhaImportacao, erro: e.number });
      if (fora.length >= SEGUIDAS_MAX) {
        if (deixarDeFora === true) return emTransacao(pool, (t, rq) => gravarLote(t, rq, { id, n: 0, por, fora, confirmadoNaTela: true }));
        return { sucesso: false, status: 409, mensagem: MSG.RECUSADAS(fora[0].linha), podeDeixarDeFora: true, recusadas: fora.map((f) => f.linha) };
      }
      n = e.antesNoLote + 1;   // as que entraram antes dela neste lote e mais UMA depois (a prova)
    }
  }
}

async function gravarLote(t, rq, { id, n, por, fora, confirmadoNaTela = false }) {
  const imp = (await rq().input("id", sql.Int, id).query("SELECT ImportacaoId, Situacao, Resumo FROM ImportacoesMembros WITH (UPDLOCK) WHERE ImportacaoId = @id")).recordset[0];
  if (!imp) return { sucesso: false, status: 404, mensagem: MSG.NAO_EXISTE };
  if (imp.Situacao === "CONCLUIDA") return { sucesso: true, importacaoId: id, importadas: 0, fora: 0, restantes: 0, concluida: true };
  if (imp.Situacao !== "IMPORTANDO") return { sucesso: false, status: 409, mensagem: "Esta importação não foi confirmada." };
  if (fora.length) {
    // as recusadas ficam de fora como PROBLEMA (o mesmo par de quem tem problema na prévia: Acao PROBLEMA, Estado FORA), na MESMA transação do lote que prova
    await rq().input("id", sql.Int, id).input("p", sql.NVarChar(sql.MAX), JSON.stringify(fora.map((f) => f.linha))).query(`
      UPDATE ImportacoesMembrosLinhas SET Acao = N'PROBLEMA', Estado = N'FORA', Problemas = N'ERRO_AO_GRAVAR'
      WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE' AND Linha IN (SELECT CAST([value] AS INT) FROM OPENJSON(@p))`);
    await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Deixou de fora linhas que o sistema não conseguiu gravar", usuarioId: por,
      dadosDepois: { linhas: fora.map((f) => ({ linha: f.linha, erro: f.erro })), ...(confirmadoNaTela ? { confirmadoNaTela: true } : {}) } });
  }
  const linhas = (await rq().input("id", sql.Int, id).input("n", sql.Int, n).query(`
    SELECT TOP (@n) Linha, MatriculaArquivo, Matricula, NumeroNovo, MotivoNumero, RepetidaMembro, Nome, CongregacaoId, Sexo, CONVERT(varchar(10), DataNascimento, 120) AS DataNascimento,
      EstadoCivil, Email, Telefone, NomeMae, NomePai, Cpf, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao, FormaAdmissao,
      CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo, Escolaridade
    FROM ImportacoesMembrosLinhas WITH (UPDLOCK) WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE' ORDER BY NumeroNovo, Linha`)).recordset;
  const trilha = [];
  for (const [i, l] of linhas.entries()) {
    let feita;
    try {
      feita = await gravarLinha(rq, id, l, por);
    } catch (e) {
      // a marca da linha (e quantas entraram antes dela neste lote): recusaDaLinha só aceita o erro de dado que veio dos comandos desta linha
      if (e && typeof e === "object" && e.linhaImportacao == null) Object.assign(e, { linhaImportacao: Number(l.Linha), antesNoLote: i });
      throw e;
    }
    if (feita) trilha.push(feita);
  }
  await registrarAuditoriaEmLoteNaTransacao(t, "MembroReferencia", trilha);
  const restantes = await contarRestantes(rq, id);
  // importadas: as que entraram neste lote (a adiada para o fim da fila fica nas restantes); fora: as recusadas que ficaram de fora neste lote
  if (restantes > 0) return { sucesso: true, importacaoId: id, importadas: trilha.length, fora: fora.length, restantes, concluida: false };
  // nunca conclui com zero pessoas (como a confirmação): soltaria a trava das matrículas e gastaria a importação única; a transação desfaz as marcas de fora
  const entrou = (await rq().input("id", sql.Int, id).query("SELECT COUNT(*) AS importadasNoTotal FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Estado = N'IMPORTADA'")).recordset[0];
  if (!entrou || !Number(entrou.importadasNoTotal)) return { sucesso: false, status: 409, mensagem: MSG.NINGUEM_ENTROU };
  const final = await concluirNaTransacao(t, rq, id, por, lerJson(imp.Resumo));
  return { sucesso: true, importacaoId: id, importadas: trilha.length, fora: fora.length, restantes: 0, concluida: true, resultado: final };
}

// Uma linha: grava a ficha (em ARROLAMENTO), as pendências e a marcação da linha; devolve a entrada da trilha, ou null quando a linha foi para o fim da fila.
async function gravarLinha(rq, id, l, por) {
  const numeroNovo = l.NumeroNovo === true || l.NumeroNovo === 1;
  const motivo = l.MotivoNumero || null;
  let numero = numeroNovo ? null : Number(l.Matricula);
  let cpf = l.Cpf ? String(l.Cpf).trim() : null;
  let repetidaMembro = l.RepetidaMembro == null ? null : Number(l.RepetidaMembro);
  // A matrícula e o CPF são conferidos e a ficha gravada no MESMO comando, com a faixa da chave travada (UPDLOCK, HOLDLOCK) da conferência até a gravação:
  // outro cadastro no mesmo instante espera, e a gravação não falha no meio da transação (o lote inteiro não se perde por uma linha).
  let feito = false, adiada = false;
  for (let tentativa = 0; tentativa < 8 && !feito; tentativa++) {
    if (numero == null) numero = await matriculaNova.proximaMatricula(rq);
    const r = (await rq().input("id", sql.Int, numero).input("nome", sql.NVarChar(200), l.Nome).input("c", sql.Int, l.CongregacaoId)
      .input("nasc", sql.Date, l.DataNascimento || null).input("sexo", sql.NChar(1), l.Sexo ? String(l.Sexo).trim() : null).input("ec", sql.NVarChar(20), l.EstadoCivil)
      .input("email", sql.NVarChar(150), l.Email).input("tel", sql.NVarChar(20), l.Telefone).input("cpf", sql.Char(11), cpf)
      .input("mae", sql.NVarChar(150), l.NomeMae).input("pai", sql.NVarChar(150), l.NomePai).input("esc", sql.NVarChar(30), l.Escolaridade)
      .input("adm", sql.Date, l.DataAdmissao || null).input("fa", sql.NVarChar(30), l.FormaAdmissao).input("bat", sql.Date, l.DataBatismo || null)
      .query(`DECLARE @ocupada BIT = CASE WHEN EXISTS (SELECT 1 FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @id) THEN 1 ELSE 0 END;
              DECLARE @donoCpf INT = NULL;
              IF @cpf IS NOT NULL SELECT TOP 1 @donoCpf = MembroId FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE Cpf = @cpf;
              IF @ocupada = 0 AND @donoCpf IS NULL
              BEGIN
                INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Sexo, EstadoCivil, Email, Telefone, Cpf, NomeMae, NomePai,
                  Escolaridade, DataAdmissao, FormaAdmissao, DataBatismo)
                VALUES (@id, @nome, @c, N'ATIVO', N'ARROLAMENTO', @nasc, @sexo, @ec, @email, @tel, @cpf, @mae, @pai, @esc, @adm, @fa, @bat);
                DELETE FROM MatriculasLivres WHERE MembroId = @id;
              END
              SELECT @ocupada AS ocupada, @donoCpf AS donoCpf`)).recordset[0];
    if (r.donoCpf != null) {
      // alguém gravou o mesmo CPF depois da prévia: entra sem ele, como possível repetida da ficha que tem o CPF
      if (repetidaMembro == null) repetidaMembro = Number(r.donoCpf);
      cpf = null;
    }
    if ((r.ocupada === true || r.ocupada === 1) && !numeroNovo) {
      // a matrícula do arquivo foi usada depois da prévia: a linha vira de número novo e vai para o FIM DA FILA (a ordem é NumeroNovo, Linha). Tomar a
      // próxima do sistema agora (a maior + 1) poderia ocupar a matrícula de uma linha do arquivo que ainda vai entrar e empurrar essa também (23/11,
      // achado do e2e-96); depois que todas as matrículas do arquivo estão no lugar, a maior + 1 é livre.
      await rq().input("id", sql.Int, id).input("l", sql.Int, Number(l.Linha)).input("cpf", sql.Char(11), cpf).input("rm", sql.Int, repetidaMembro).query(`
        UPDATE ImportacoesMembrosLinhas SET NumeroNovo = 1, MotivoNumero = N'DE_OUTRA_FICHA', Cpf = @cpf, RepetidaMembro = @rm
        WHERE ImportacaoId = @id AND Linha = @l AND Estado = N'PENDENTE'`);
      adiada = true;
      break;
    }
    // no número novo, outro cadastro pegou o mesmo número no mesmo instante: a próxima do sistema
    if (r.ocupada === true || r.ocupada === 1) numero = null;
    feito = !(r.donoCpf != null) && !(r.ocupada === true || r.ocupada === 1);
  }
  if (adiada) return null;
  if (!feito) throw new Error(`importação: não foi possível gravar a linha ${l.Linha}`);
  await abrirPendencia(rq, { membroId: numero, tipo: "ARROLAMENTO", detalhe: DETALHE_ARROLAMENTO, por });
  if (numeroNovo) await abrirPendencia(rq, { membroId: numero, tipo: "NUMERO", detalhe: (DETALHE_NUMERO[motivo] || DETALHE_NUMERO.VAZIA)(l.MatriculaArquivo), por });
  if (repetidaMembro != null && repetidaMembro !== numero) await abrirPendencia(rq, { membroId: numero, tipo: "REPETIDA", outro: repetidaMembro, detalhe: DETALHE_REPETIDA, por });
  await rq().input("id", sql.Int, id).input("l", sql.Int, Number(l.Linha)).input("m", sql.Int, numero).input("nn", sql.Bit, numeroNovo).input("mn", sql.NVarChar(30), numeroNovo ? motivo : null)
    .input("rm", sql.Int, repetidaMembro).query(`UPDATE ImportacoesMembrosLinhas SET Estado = N'IMPORTADA', MatriculaFinal = @m, NumeroNovo = @nn, MotivoNumero = @mn,
      RepetidaMembro = @rm WHERE ImportacaoId = @id AND Linha = @l`);
  return { registroId: numero, acao: "Importou pessoa do sistema pago", usuarioId: por,
    dadosDepois: { importacaoId: id, linha: Number(l.Linha), congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId), cpf: ficha.mascararCpf(cpf),
      numeroNovo, possivelRepetida: repetidaMembro != null } };
}

// O fim: as possíveis repetidas entre linhas do arquivo (as duas já têm a matrícula final), o resumo final e os dados pessoais das linhas apagados.
async function concluirNaTransacao(t, rq, id, por, resumoPrevia) {
  await rq().input("id", sql.Int, id).input("d", sql.NVarChar(300), DETALHE_REPETIDA).input("por", sql.Int, por).query(`
    INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Detalhe, Origem, AbertaPor)
    SELECT DISTINCT a.MatriculaFinal, N'REPETIDA', b.MatriculaFinal, @d, N'IMPORTACAO', @por
    FROM ImportacoesMembrosLinhas a JOIN ImportacoesMembrosLinhas b ON b.ImportacaoId = a.ImportacaoId AND b.Linha = a.RepetidaLinha
    WHERE a.ImportacaoId = @id AND a.Estado = N'IMPORTADA' AND b.Estado = N'IMPORTADA' AND a.MatriculaFinal <> b.MatriculaFinal
      AND NOT EXISTS (SELECT 1 FROM FichasPendencias f WHERE f.MembroId = a.MatriculaFinal AND f.Tipo = N'REPETIDA' AND f.OutroMembroId = b.MatriculaFinal AND f.Situacao = N'ABERTA')`);
  const c = (await rq().input("id", sql.Int, id).query(`SELECT
      SUM(CASE WHEN Estado = N'IMPORTADA' THEN 1 ELSE 0 END) AS importadas, SUM(CASE WHEN Estado = N'FORA' THEN 1 ELSE 0 END) AS fora,
      SUM(CASE WHEN Estado = N'IMPORTADA' AND NumeroNovo = 1 THEN 1 ELSE 0 END) AS numeroNovo,
      SUM(CASE WHEN Estado = N'IMPORTADA' AND (RepetidaLinha IS NOT NULL OR RepetidaMembro IS NOT NULL) THEN 1 ELSE 0 END) AS possivelRepetida,
      SUM(CASE WHEN Estado = N'IMPORTADA' AND CongregacaoId IS NULL THEN 1 ELSE 0 END) AS semCongregacao
    FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id`)).recordset[0];
  const resultado = { importadas: Number(c.importadas || 0), fora: Number(c.fora || 0), numeroNovo: Number(c.numeroNovo || 0), possivelRepetida: Number(c.possivelRepetida || 0),
    semCongregacao: Number(c.semCongregacao || 0) };
  // a última coisa: as linhas ficam só com o necessário (LIMPAR_PESSOAIS e LIMPAR_FORA), depois das pendências e das contas, que leem a congregação da linha
  await rq().input("id", sql.Int, id).input("res", sql.NVarChar(sql.MAX), JSON.stringify({ ...(resumoPrevia || {}), resultado })).query(`
    UPDATE ImportacoesMembros SET Situacao = N'CONCLUIDA', ConcluidaEm = SYSUTCDATETIME(), Resumo = @res WHERE ImportacaoId = @id AND Situacao = N'IMPORTANDO';
    UPDATE l SET ${LIMPAR_PESSOAIS} FROM ImportacoesMembrosLinhas l WHERE l.ImportacaoId = @id;
    UPDATE l SET ${LIMPAR_FORA} FROM ImportacoesMembrosLinhas l WHERE l.ImportacaoId = @id AND l.Estado = N'FORA';`);
  await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Concluiu a importação do sistema pago", usuarioId: por, dadosDepois: resultado });
  return resultado;
}

// ------------------------------------------------------------------ a guarda dos dados (a rotina diária)
// Respostas dele de 23/11/2026 (LGPD): a prévia que não foi confirmada (com CPF, celular, mãe e pai) se apaga sozinha em 7 dias (antes disso, o "Descartar" da
// tela apaga na hora); a lista dos que ficaram de fora (nome e motivo) fica 90 dias depois de a importação terminar e se apaga sozinha. As importadas não saem
// (a ficha é o registro dela; o retrato do resultado continua). Decisões da sessão de 24/11/2026 (da regra dele e da LGPD): ao terminar, a linha importada
// fica só com a linha, a matrícula, o nome e a situação (mais os códigos que o retrato e o CSV leem: número novo e motivo, linha/ficha repetida, problemas
// e avisos; nenhum é dado pessoal), e a de fora só com o nome e o motivo; a importação que terminou antes disso a rotina limpa. O prazo
// segue a política de retenção com estes nomes em Proteção de Dados → Políticas de retenção (a migração 186 as semeia com a base legal; o Encarregado ajusta
// os dias ali); sem ela, valem os de 7 e 90 dias. Roda na rotina diária (NotificacoesAgendador), debaixo da trava da importação: a importação ocupada
// naquela hora faz a rotina falhar sem mexer em nada, e a do dia seguinte repete.
const POLITICA_PREVIA = Object.freeze({ categoria: "Membros — prévia da importação que não foi confirmada", padrao: 7 });
const POLITICA_FORA = Object.freeze({ categoria: "Membros — lista dos que ficaram de fora da importação", padrao: 90 });
async function prazosDaGuarda(pool) {
  const { diasDaPolitica } = require("./politicasRetencao");
  return { diasPrevia: await diasDaPolitica(pool, POLITICA_PREVIA.categoria, POLITICA_PREVIA.padrao),
    diasFora: await diasDaPolitica(pool, POLITICA_FORA.categoria, POLITICA_FORA.padrao) };
}
async function aplicarRetencao(pool) {
  const { diasPrevia, diasFora } = await prazosDaGuarda(pool);
  // a base de antes da migração 185 (as bases antigas dos roteiros e2e): não há importação para guardar (o mesmo cuidado do afmDb e da minimizacaoLgpd)
  const tabela = (await pool.request().query("SELECT OBJECT_ID(N'dbo.ImportacoesMembros', N'U') AS id")).recordset[0];
  if (!tabela || tabela.id == null) return { previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia, diasFora };
  const r = await emTransacao(pool, async (t, rq) => {
    const velhas = (await rq().input("d", sql.Int, diasPrevia)
      .query("SELECT ImportacaoId FROM ImportacoesMembros WHERE Situacao = N'PREVIA' AND CriadaEm < DATEADD(DAY, -@d, SYSUTCDATETIME())")).recordset;
    for (const v of velhas) {
      const id = Number(v.ImportacaoId);
      await descartarNaTransacao(rq, id);
      await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: `A rotina descartou a prévia da importação que não foi confirmada em ${diasPrevia} dias`,
        usuarioId: null });
    }
    // G2 (revisão de 24/11/2026): a importação que começou a gravar e parou (IMPORTANDO) não tinha prazo, e as linhas que faltavam ficavam com CPF, celular,
    // mãe e pai. O prazo é o da prévia (a mesma planilha com dado pessoal esperando), contado da confirmação: passado ele, as linhas que faltavam ficam de
    // fora como problema (NAO_TERMINOU), só com o nome e o motivo, e a importação conclui (como no último lote: as matrículas novas destravam e a lista dos
    // de fora entra nos 90 dias). Só a que já tem alguém importado: a que parou sem ninguém fica como está, com os dados, e continua de onde parou quando a
    // Secretaria Geral voltar (o 7902eca também a pegava, e era defeito: sem as linhas, o "Continuar a importação" recusava para sempre, com o NINGUEM_ENTROU
    // e o "Avise o suporte", e nenhuma outra importação podia começar: a importação única ficava sem saída). O que fazer com ela depois de um prazo, o
    // responsável decide.
    const paradas = (await rq().input("d", sql.Int, diasPrevia).query(`
      SELECT i.ImportacaoId, i.Resumo
      FROM ImportacoesMembros i
      WHERE i.Situacao = N'IMPORTANDO' AND i.ConfirmadaEm < DATEADD(DAY, -@d, SYSUTCDATETIME())
        AND EXISTS (SELECT 1 FROM ImportacoesMembrosLinhas l WHERE l.ImportacaoId = i.ImportacaoId AND l.Estado = N'PENDENTE')
        AND EXISTS (SELECT 1 FROM ImportacoesMembrosLinhas l WHERE l.ImportacaoId = i.ImportacaoId AND l.Estado = N'IMPORTADA')`)).recordset;
    for (const pa of paradas) {
      const id = Number(pa.ImportacaoId);
      const marcadas = (await rq().input("id", sql.Int, id).query(`
        UPDATE ImportacoesMembrosLinhas SET Acao = N'PROBLEMA', Estado = N'FORA', Problemas = N'NAO_TERMINOU', ${LIMPAR_PESSOAIS}, ${LIMPAR_FORA}
        WHERE ImportacaoId = @id AND Estado = N'PENDENTE';
        SELECT @@ROWCOUNT AS n`)).recordset[0];
      const linhasDeFora = Number(marcadas && marcadas.n) || 0;
      await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, usuarioId: null, dadosDepois: { linhasDeFora, retencaoDias: diasPrevia },
        acao: `A rotina encerrou a importação parada há ${diasPrevia} dias (as linhas que faltavam ficaram de fora)` });
      await concluirNaTransacao(t, rq, id, null, lerJson(pa.Resumo));
    }
    const apagadas = (await rq().input("d", sql.Int, diasFora).query(`
      DECLARE @apagadas TABLE (ImportacaoId INT NOT NULL);
      DELETE l OUTPUT deleted.ImportacaoId INTO @apagadas
      FROM ImportacoesMembrosLinhas l JOIN ImportacoesMembros i ON i.ImportacaoId = l.ImportacaoId
      WHERE i.Situacao = N'CONCLUIDA' AND i.ConcluidaEm < DATEADD(DAY, -@d, SYSUTCDATETIME()) AND l.Estado = N'FORA';
      SELECT ImportacaoId, COUNT(*) AS n FROM @apagadas GROUP BY ImportacaoId`)).recordset;
    let linhasForaApagadas = 0;
    for (const a of apagadas) {
      const id = Number(a.ImportacaoId), n = Number(a.n) || 0;
      linhasForaApagadas += n;
      // o dia em que a lista saiu e o prazo que valeu nesse dia ficam no resumo: a tela do resultado diz que ela foi apagada (em vez de mostrar uma lista menor
      // sem explicar), com os dias de então, não os da política de hoje (G4, revisão de 24/11/2026)
      await rq().input("id", sql.Int, id).input("d", sql.Int, diasFora).query(`UPDATE ImportacoesMembros
        SET Resumo = JSON_MODIFY(JSON_MODIFY(Resumo, '$.foraApagadaEm', CONVERT(varchar(19), SYSUTCDATETIME(), 126) + 'Z'), '$.foraDias', @d)
        WHERE ImportacaoId = @id AND ISJSON(Resumo) = 1`);
      await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: `A rotina apagou a lista dos que ficaram de fora da importação (${diasFora} dias depois do fim)`,
        usuarioId: null, dadosDepois: { linhasApagadas: n, retencaoDias: diasFora } });
    }
    // a importação que terminou antes desta versão (24/11/2026): o que sobrou nas linhas sai como na conclusão de agora (só a linha que ainda tem alguma
    // coisa, por isso a segunda rodada não mexe em nada nem escreve na trilha); a mesma linha nas duas conta uma vez
    const limpas = (await rq().query(`
      DECLARE @limpas TABLE (ImportacaoId INT NOT NULL, Linha INT NOT NULL);
      UPDATE l SET ${LIMPAR_PESSOAIS} OUTPUT inserted.ImportacaoId, inserted.Linha INTO @limpas
      FROM ImportacoesMembrosLinhas l JOIN ImportacoesMembros i ON i.ImportacaoId = l.ImportacaoId WHERE i.Situacao = N'CONCLUIDA' AND ${AINDA_PESSOAIS};
      UPDATE l SET ${LIMPAR_FORA} OUTPUT inserted.ImportacaoId, inserted.Linha INTO @limpas
      FROM ImportacoesMembrosLinhas l JOIN ImportacoesMembros i ON i.ImportacaoId = l.ImportacaoId WHERE i.Situacao = N'CONCLUIDA' AND l.Estado = N'FORA' AND ${AINDA_FORA};
      SELECT ImportacaoId, COUNT(DISTINCT Linha) AS n FROM @limpas GROUP BY ImportacaoId`)).recordset;
    let linhasLimpas = 0;
    for (const a of limpas) {
      const id = Number(a.ImportacaoId), n = Number(a.n) || 0;
      linhasLimpas += n;
      // (a Acao da trilha cabe em 100: AuditLog.Acao é NVARCHAR(100) e o texto cortado quebraria a cadeia de hashes)
      await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, usuarioId: null, dadosDepois: { linhasLimpas: n },
        acao: "A rotina limpou as linhas da importação (de quem ficou de fora, só o nome e o motivo)" });
    }
    return { sucesso: true, previasDescartadas: velhas.length, linhasForaApagadas, linhasLimpas };
  });
  if (!r || r.sucesso !== true) throw new Error("importação: a guarda dos dados não rodou (a importação estava ocupada); a rotina de amanhã repete");
  return { previasDescartadas: r.previasDescartadas, linhasForaApagadas: r.linhasForaApagadas, linhasLimpas: r.linhasLimpas, diasPrevia, diasFora };
}

module.exports = { TRAVA, TAMANHO_LOTE, POR_PAGINA, MSG, POLITICA_PREVIA, POLITICA_FORA, estado, criarPrevia, descartar, listar, csv, confirmar, importarLote, aplicarRetencao };
