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
const BLOCO_GRAVACAO = 400;   // linhas por INSERT da prévia (OPENJSON)
const POR_PAGINA = 100;
const MSG = Object.freeze({
  JA_IMPORTADO: "A importação do sistema pago já foi feita (é uma vez só). O que mudou depois se corrige à mão, na ficha de cada pessoa.",
  EM_ANDAMENTO: "A importação já foi confirmada e está em andamento: continue a importação.",
  PREVIA_MUDOU: "Esta prévia não é mais a atual (outra foi feita depois, ou foi descartada). Confira a prévia de novo antes de confirmar.",
  NAO_EXISTE: "Importação não encontrada.",
  OCUPADO: "Outra pessoa está mexendo na importação agora. Tente de novo daqui a pouco."
});
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

// O estado para a tela: já foi feita? há uma em andamento (quantas faltam)? há uma prévia aberta?
async function estado(pool) {
  const sit = await lerSituacao(() => pool.request());
  const atual = sit.concluida || sit.andamento || sit.previa;
  let restantes = null;
  if (sit.andamento) restantes = await contarRestantes(() => pool.request(), Number(sit.andamento.ImportacaoId));
  return { sucesso: true, feita: !!sit.concluida, emAndamento: !!sit.andamento, importacao: publico(atual), restantes };
}
async function contarRestantes(rq, id) {
  const r = await rq().input("id", sql.Int, id).query("SELECT COUNT(*) AS n FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE'");
  return Number(r.recordset[0].n);
}

// ------------------------------------------------------------------ a prévia
// Lê e confere o arquivo (o trabalho pesado fica fora da transação: nada é gravado até o fim) e grava a prévia com as linhas. A prévia anterior é descartada.
async function criarPrevia(pool, usuario, { nomeArquivo, texto }) {
  const sit = await lerSituacao(() => pool.request());
  if (sit.concluida) return { sucesso: false, status: 409, mensagem: MSG.JA_IMPORTADO };
  if (sit.andamento) return { sucesso: false, status: 409, mensagem: MSG.EM_ANDAMENTO };
  const congs = (await pool.request().query("SELECT CongregacaoId, Nome, Ativa FROM Congregacoes")).recordset
    .map((c) => ({ congregacaoId: Number(c.CongregacaoId), nome: c.Nome, ativa: c.Ativa }));
  const prep = regras.prepararArquivo(texto, { congregacoes: regras.mapaDeCongregacoes(congs), hojeISO: hojeBrasilia() });
  if (prep.erro) return { sucesso: false, status: 400, mensagem: prep.erro };

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
  regras.classificar(prep.linhas, { fichasPorMatricula, fichasPorCpf });
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
      dadosDepois: { nomeArquivo: nome, total: resumo.total, novas: resumo.novas, problemas: resumo.problemas, numeroNovo: resumo.numeroNovo, possivelRepetida: resumo.possivelRepetida } });
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
// filtro: "problemas" (não entram), "avisos" (entram com aviso: número novo, possível repetida, o que entrou sem...) ou "todas". Nunca o CPF nem o contato.
function condicaoDoFiltro(filtro) {
  if (filtro === "problemas") return "AND Acao = N'PROBLEMA'";
  if (filtro === "avisos") return "AND Acao = N'NOVA' AND Avisos IS NOT NULL";
  return "";
}
const paraLista = (l) => regras.linhaParaLista({ linha: Number(l.Linha), matriculaArquivo: l.MatriculaArquivo || "", nome: l.Nome || "", acao: l.Acao,
  matriculaFinal: l.MatriculaFinal == null ? null : Number(l.MatriculaFinal), problemas: l.Problemas ? l.Problemas.split(",") : [], avisos: l.Avisos ? l.Avisos.split(",") : [] });
async function listar(pool, importacaoId, { filtro = "todas", pagina = 1 } = {}) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  const p = Math.max(1, Math.min(100000, Math.floor(Number(pagina) || 1)));
  const f = ["problemas", "avisos", "todas"].includes(filtro) ? filtro : "todas";
  const r = await pool.request().input("id", sql.Int, id).input("pula", sql.Int, (p - 1) * POR_PAGINA).input("n", sql.Int, POR_PAGINA).query(`
    SELECT COUNT(*) OVER () AS Total, Linha, MatriculaArquivo, Nome, Acao, MatriculaFinal, Problemas, Avisos
    FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id ${condicaoDoFiltro(f)}
    ORDER BY Linha OFFSET @pula ROWS FETCH NEXT @n ROWS ONLY`);
  const total = r.recordset.length ? Number(r.recordset[0].Total) : 0;
  return { sucesso: true, filtro: f, pagina: p, porPagina: POR_PAGINA, total, itens: r.recordset.map(paraLista) };
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
const DETALHE_REPETIDA = "Importação do sistema pago: pode ser a mesma pessoa (o mesmo CPF, ou a mesma matrícula e o mesmo nome).";

async function abrirPendencia(rq, { membroId, tipo, outro = null, detalhe, por }) {
  await rq().input("m", sql.Int, membroId).input("t", sql.NVarChar(12), tipo).input("o", sql.Int, outro).input("d", sql.NVarChar(300), String(detalhe).slice(0, 300))
    .input("por", sql.Int, por).query(`
      IF (@o IS NULL OR EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @o))
         AND NOT EXISTS (SELECT 1 FROM FichasPendencias WHERE MembroId = @m AND Tipo = @t AND ISNULL(OutroMembroId, -1) = ISNULL(@o, -1) AND Situacao = N'ABERTA')
        INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Detalhe, Origem, AbertaPor) VALUES (@m, @t, @o, @d, N'IMPORTACAO', @por)`);
}

// Importa até `tamanho` linhas pendentes, numa transação. Primeiro as que têm a matrícula do arquivo (na ordem do arquivo), depois as de número novo (que
// recebem a próxima do sistema DEPOIS de todas as do arquivo estarem no lugar). Cada linha é conferida de novo contra o banco de agora: a matrícula que
// alguém usou depois da prévia vira número novo (NUMERO); o CPF que alguém gravou depois entra sem o CPF, como possível repetida (REPETIDA).
async function importarLote(pool, usuario, importacaoId, { tamanho = TAMANHO_LOTE } = {}) {
  const id = idValido(importacaoId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a importação." };
  const n = Math.max(1, Math.min(TAMANHO_LOTE, Math.floor(Number(tamanho) || TAMANHO_LOTE)));
  const por = Number(usuario.membroId);
  return emTransacao(pool, async (t, rq) => {
    const imp = (await rq().input("id", sql.Int, id).query("SELECT ImportacaoId, Situacao, Resumo FROM ImportacoesMembros WITH (UPDLOCK) WHERE ImportacaoId = @id")).recordset[0];
    if (!imp) return { sucesso: false, status: 404, mensagem: MSG.NAO_EXISTE };
    if (imp.Situacao === "CONCLUIDA") return { sucesso: true, importacaoId: id, importadas: 0, restantes: 0, concluida: true };
    if (imp.Situacao !== "IMPORTANDO") return { sucesso: false, status: 409, mensagem: "Esta importação não foi confirmada." };
    const linhas = (await rq().input("id", sql.Int, id).input("n", sql.Int, n).query(`
      SELECT TOP (@n) Linha, MatriculaArquivo, Matricula, NumeroNovo, MotivoNumero, RepetidaMembro, Nome, CongregacaoId, Sexo, CONVERT(varchar(10), DataNascimento, 120) AS DataNascimento,
        EstadoCivil, Email, Telefone, NomeMae, NomePai, Cpf, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao, FormaAdmissao,
        CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo, Escolaridade
      FROM ImportacoesMembrosLinhas WITH (UPDLOCK) WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE' ORDER BY NumeroNovo, Linha`)).recordset;
    const trilha = [];
    for (const l of linhas) {
      let numeroNovo = l.NumeroNovo === true || l.NumeroNovo === 1;
      let motivo = l.MotivoNumero || null;
      let numero = numeroNovo ? null : Number(l.Matricula);
      let cpf = l.Cpf ? String(l.Cpf).trim() : null;
      let repetidaMembro = l.RepetidaMembro == null ? null : Number(l.RepetidaMembro);
      // A matrícula e o CPF são conferidos e a ficha gravada no MESMO comando, com a faixa da chave travada (UPDLOCK, HOLDLOCK) da conferência até a gravação:
      // outro cadastro no mesmo instante espera, e a gravação não falha no meio da transação (o lote inteiro não se perde por uma linha).
      let feito = false;
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
        if (r.ocupada === true || r.ocupada === 1) {
          // a matrícula foi usada depois da prévia (ou, no número novo, por outro cadastro no mesmo instante): a próxima do sistema
          if (!numeroNovo) { numeroNovo = true; motivo = "DE_OUTRA_FICHA"; }
          numero = null;
        }
        feito = !(r.donoCpf != null) && !(r.ocupada === true || r.ocupada === 1);
      }
      if (!feito) throw new Error(`importação: não foi possível gravar a linha ${l.Linha}`);
      await abrirPendencia(rq, { membroId: numero, tipo: "ARROLAMENTO", detalhe: DETALHE_ARROLAMENTO, por });
      if (numeroNovo) await abrirPendencia(rq, { membroId: numero, tipo: "NUMERO", detalhe: (DETALHE_NUMERO[motivo] || DETALHE_NUMERO.VAZIA)(l.MatriculaArquivo), por });
      if (repetidaMembro != null && repetidaMembro !== numero) await abrirPendencia(rq, { membroId: numero, tipo: "REPETIDA", outro: repetidaMembro, detalhe: DETALHE_REPETIDA, por });
      await rq().input("id", sql.Int, id).input("l", sql.Int, Number(l.Linha)).input("m", sql.Int, numero).input("nn", sql.Bit, numeroNovo).input("mn", sql.NVarChar(30), numeroNovo ? motivo : null)
        .input("rm", sql.Int, repetidaMembro).query(`UPDATE ImportacoesMembrosLinhas SET Estado = N'IMPORTADA', MatriculaFinal = @m, NumeroNovo = @nn, MotivoNumero = @mn,
          RepetidaMembro = @rm WHERE ImportacaoId = @id AND Linha = @l`);
      trilha.push({ registroId: numero, acao: "Importou pessoa do sistema pago", usuarioId: por,
        dadosDepois: { importacaoId: id, linha: Number(l.Linha), congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId), cpf: ficha.mascararCpf(cpf),
          numeroNovo, possivelRepetida: repetidaMembro != null } });
    }
    await registrarAuditoriaEmLoteNaTransacao(t, "MembroReferencia", trilha);
    const restantes = await contarRestantes(rq, id);
    if (restantes > 0) return { sucesso: true, importacaoId: id, importadas: linhas.length, restantes, concluida: false };
    const final = await concluirNaTransacao(t, rq, id, por, lerJson(imp.Resumo));
    return { sucesso: true, importacaoId: id, importadas: linhas.length, restantes: 0, concluida: true, resultado: final };
  });
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
  await rq().input("id", sql.Int, id).input("res", sql.NVarChar(sql.MAX), JSON.stringify({ ...(resumoPrevia || {}), resultado })).query(`
    UPDATE ImportacoesMembros SET Situacao = N'CONCLUIDA', ConcluidaEm = SYSUTCDATETIME(), Resumo = @res WHERE ImportacaoId = @id AND Situacao = N'IMPORTANDO';
    UPDATE ImportacoesMembrosLinhas SET IgrejaArquivo = NULL, CongregacaoId = NULL, Sexo = NULL, DataNascimento = NULL, EstadoCivil = NULL, Email = NULL, Telefone = NULL,
      NomeMae = NULL, NomePai = NULL, Cpf = NULL, DataAdmissao = NULL, FormaAdmissao = NULL, DataBatismo = NULL, Escolaridade = NULL WHERE ImportacaoId = @id;`);
  await registrarAuditoriaNaTransacao(t, { tabela: "ImportacoesMembros", registroId: id, acao: "Concluiu a importação do sistema pago", usuarioId: por, dadosDepois: resultado });
  return resultado;
}

module.exports = { TRAVA, TAMANHO_LOTE, POR_PAGINA, MSG, estado, criarPrevia, descartar, listar, csv, confirmar, importarLote };
