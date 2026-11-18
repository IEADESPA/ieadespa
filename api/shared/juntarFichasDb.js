// shared/juntarFichasDb.js (FASE 10, v10.1b passo 6, 18/11/2026) — JUNTAR FICHAS REPETIDAS no banco: a lista das fichas possivelmente repetidas, a comparação
// (só o que é diferente) com a PRÉVIA do que vai mudar, a junção numa transação só, desfazer, "não são a mesma pessoa", marcar como repetida e as
// pendências de cadastro (a carteirinha física e a assembleia geral leem daqui). As regras puras estão em shared/juntarFichas.js.
//
// A junção mexe em TUDO o que aponta para a pessoa: as ~420 colunas (em ~250 tabelas) com chave estrangeira para MembroReferencia, lidas do catálogo do
// próprio banco (uma tabela nova entra sozinha), mais as chaves de acesso do aparelho (sem chave estrangeira). Como dinheiro de banco:
//  - UMA transação, com as DUAS fichas travadas (XLOCK, na ordem da matrícula: duas junções cruzadas — A→B e B→A — fazem fila e a segunda acha "não existe");
//  - a prévia é refeita DENTRO da transação e a tela manda a "versão" que leu: se as fichas mudaram no meio, 409 e nada muda;
//  - o que não cabe na ficha que fica (índice único) é resolvido sem perder a história: dado de acesso/aviso apagado, o mesmo fato registrado duas vezes
//    guardado inteiro em JuncoesFichasArquivo, e o resto BLOQUEIA (a tela diz o que encerrar antes);
//  - os gatilhos que protegem o histórico (os "imutáveis") são desligados SÓ durante o UPDATE da coluna da pessoa, DENTRO da transação (desligar gatilho é
//    transacional no SQL Server: se algo falhar, volta como estava, e enquanto isso a tabela fica travada para os outros);
//  - a ficha que sai é apagada no fim: a chave estrangeira confere que NADA ficou apontando para ela (senão a transação inteira volta); o número vai para
//    MatriculasLivres (o próximo cadastro novo recebe esse número);
//  - a trilha (AuditLog) nas duas fichas, com quem juntou; o registro JuncoesFichas guarda as linhas movidas e a ficha que saiu, para conferir e desfazer
//    (30 dias; depois a ficha que saiu e o arquivo são apagados do registro — fica só o resumo).
const crypto = require("crypto");
const { sql } = require("./db");
const auth = require("./auth");
const R = require("./juntarFichas");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { noEscopoDaPessoa, ehGeral, condicaoSqlEscopoPessoa } = require("./escopoRotas");
const { mascararCpf } = require("./fichaMembro");

const DIAS_DESFAZER = 30;
const NAO_ENCONTRADA = "Ficha não encontrada.";
const q = (nome) => `[${String(nome).replace(/]/g, "]]")}]`;
const erroNumero = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));

// ================================================================ o mapa do banco (o catálogo), uma vez por processo (10 minutos)
let mapaCache = null, mapaEm = 0;
async function lerMapa(rq) {
  if (mapaCache && Date.now() - mapaEm < 10 * 60 * 1000) return mapaCache;
  const r = await rq().query(`
    SELECT OBJECT_NAME(fk.parent_object_id) AS t, c.name AS c
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE fk.referenced_object_id = OBJECT_ID(N'dbo.MembroReferencia') AND OBJECT_SCHEMA_NAME(fk.parent_object_id) = N'dbo';
    SELECT OBJECT_NAME(i.object_id) AS t, c.name AS c, ic.key_ordinal AS o, CAST(c.is_identity AS INT) AS ident
    FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 1 AND OBJECT_SCHEMA_NAME(i.object_id) = N'dbo';
    SELECT OBJECT_NAME(i.object_id) AS t, i.name AS i, i.filter_definition AS f, c.name AS c, ic.key_ordinal AS o
    FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_unique = 1 AND ic.is_included_column = 0 AND OBJECT_SCHEMA_NAME(i.object_id) = N'dbo';
    SELECT OBJECT_NAME(tg.parent_id) AS t, tg.name AS g
    FROM sys.triggers tg WHERE tg.parent_class = 1 AND tg.is_disabled = 0 AND OBJECT_SCHEMA_NAME(tg.parent_id) = N'dbo';
    SELECT OBJECT_NAME(parent_object_id) AS t, definition AS d FROM sys.check_constraints WHERE OBJECT_SCHEMA_NAME(parent_object_id) = N'dbo';
    SELECT OBJECT_NAME(object_id) AS t, name AS c FROM sys.columns WHERE object_id IN (OBJECT_ID(N'dbo.ChavesAcesso'), OBJECT_ID(N'dbo.DesafiosWebAuthn')) AND name = N'MembroId';`);
  const [fks, pks, unicos, gatilhos, checks, semFk] = r.recordsets;
  const colunas = fks.map((l) => ({ t: l.t, c: l.c }));
  for (const s of R.COLUNAS_SEM_FK) if (semFk.some((l) => l.t === s.t && l.c === s.c)) colunas.push(s);
  const tabelas = new Map();
  const tab = (t) => { if (!tabelas.has(t)) tabelas.set(t, { membro: [], pk: [], ident: null, unicos: new Map(), gatilhos: [], pares: [] }); return tabelas.get(t); };
  for (const { t, c } of colunas) tab(t).membro.push(c);
  for (const l of pks.sort((a, b) => a.o - b.o)) if (tabelas.has(l.t)) { tab(l.t).pk.push(l.c); if (l.ident) tab(l.t).ident = l.c; }
  for (const l of unicos.sort((a, b) => a.o - b.o)) {
    if (!tabelas.has(l.t)) continue;
    const u = tab(l.t).unicos;
    if (!u.has(l.i)) u.set(l.i, { nome: l.i, cols: [], filtro: l.f || null });
    u.get(l.i).cols.push(l.c);
  }
  for (const l of gatilhos) if (tabelas.has(l.t)) tab(l.t).gatilhos.push(l.g);
  // os CHECK "[A]<>[B]" entre duas colunas da pessoa: a linha que liga uma ficha à outra viraria "a pessoa com ela mesma"
  for (const l of checks) {
    if (!tabelas.has(l.t)) continue;
    const m = tab(l.t).membro;
    const re = /\[(\w+)\]\s*<>\s*\[(\w+)\]/g;
    let x;
    while ((x = re.exec(l.d))) if (m.includes(x[1]) && m.includes(x[2])) tab(l.t).pares.push([x[1], x[2]]);
  }
  for (const [t, pares] of Object.entries(R.PARES_PROIBIDOS)) if (tabelas.has(t)) for (const p of pares) if (p.every((c) => tab(t).membro.includes(c))) tab(t).pares.push(p);
  for (const t of tabelas.values()) {
    t.unicos = [...t.unicos.values()].filter((u) => u.cols.some((c) => t.membro.includes(c)));
    if (!t.pk.length) t.pk = t.membro.slice(0, 1);   // (toda tabela daqui tem chave primária; a reserva nunca deve ser usada)
  }
  mapaCache = { colunas, tabelas };
  mapaEm = Date.now();
  return mapaCache;
}

// ================================================================ as duas fichas
const COLS_FICHA_SQL = R.COLUNAS_FICHA.map((c) => `m.${q(c)}`).join(", ");
async function lerFicha(rq, id) {
  const r = await rq().input("id", sql.Int, id).query(`
    SELECT m.MembroId, m.Nome AS NomeAtual, m.CriadoEm, ${COLS_FICHA_SQL}, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome,
      CASE WHEN EXISTS (SELECT 1 FROM JuncoesFichas j WHERE j.MatriculaSai = m.MembroId AND j.Situacao = N'FEITA') THEN 1 ELSE 0 END AS Reaproveitada,
      CASE WHEN EXISTS (SELECT 1 FROM Consagracoes cs LEFT JOIN TiposConsagracao tc ON tc.Nome = cs.Assunto
                        WHERE cs.MembroId = m.MembroId AND ISNULL(cs.CargoAlvo, tc.CargoMinisterialResultante) IS NOT NULL
                        AND cs.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')) THEN 1 ELSE 0 END AS EmProcessoDeCargo,
      CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pdx WHERE pdx.MembroId = m.MembroId AND pdx.Resultado = N'EXCLUSAO' AND pdx.CEIRecusouEm IS NULL
                        AND pdx.Status IN (N'JULGADO', N'EM_RECURSO')) THEN 1 ELSE 0 END AS TemExclusao,
      CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares x WHERE x.MembroId = m.MembroId) OR EXISTS (SELECT 1 FROM ProcedimentosAbandono x WHERE x.MembroId = m.MembroId)
             OR EXISTS (SELECT 1 FROM MedidasCautelares x WHERE x.MembroId = m.MembroId) OR EXISTS (SELECT 1 FROM IncidenteEnvolvidos x WHERE x.MembroId = m.MembroId)
           THEN 1 ELSE 0 END AS TemReservado,
      CASE WHEN EXISTS (SELECT 1 FROM TransferenciasCongregacao x WHERE x.MembroId = m.MembroId AND x.Situacao = N'PENDENTE') THEN 1 ELSE 0 END AS TransferenciaPendente,
      CASE WHEN EXISTS (SELECT 1 FROM SolicitacoesEdicaoPessoa x WHERE x.MembroId = m.MembroId AND x.Status = N'PENDENTE') THEN 1 ELSE 0 END AS SugestaoPendente
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}
// Trava as duas fichas (XLOCK, a de número menor primeiro) e devolve as linhas. Só dentro de uma transação.
async function travarDupla(rq, a, b) {
  for (const id of [Math.min(a, b), Math.max(a, b)]) {
    await rq().input("id", sql.Int, id).query(`SELECT MembroId FROM MembroReferencia WITH (XLOCK, ROWLOCK, HOLDLOCK) WHERE MembroId = @id`);
  }
}
// A "versão" das duas fichas que a tela leu: se qualquer campo comparado mudar, muda a versão.
function versaoDaDupla(fica, sai) {
  const v = [fica.MembroId, sai.MembroId, ...[fica, sai].map((l) => R.COLUNAS_FICHA.map((c) => R.textoDaColuna(l[c])))];
  return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 20);
}

// ================================================================ a prévia: quantas linhas de cada tabela, os conflitos e as ligações entre as duas
async function contarLinhas(rq, mapa, sai) {
  // uma ida só: um COUNT por coluna da pessoa (as que deram zero não voltam)
  const partes = mapa.colunas.map(({ t, c }) => `SELECT N'${t.replace(/'/g, "''")}' AS t, N'${c.replace(/'/g, "''")}' AS c, COUNT_BIG(*) AS n FROM dbo.${q(t)} WHERE ${q(c)} = @sai`);
  const r = await rq().input("sai", sql.Int, sai).query(`SELECT t, c, n FROM (${partes.join("\nUNION ALL ")}) x WHERE n > 0`);
  return r.recordset.map((l) => ({ t: l.t, c: l.c, n: Number(l.n) }));
}
const condFiltro = (u) => (u.filtro ? ` AND (${u.filtro})` : "");
// As linhas da ficha que SAI que colidem num índice único com uma linha da que FICA (depois de trocar sai -> fica em todas as colunas da pessoa do índice).
// Devolve a lista das chaves primárias dessas linhas (JSON).
async function linhasEmConflito(rq, mapa, t, fica, sai) {
  const tb = mapa.tabelas.get(t);
  const achadas = new Map();
  for (const u of tb.unicos) {
    const mcols = u.cols.filter((c) => tb.membro.includes(c));
    const pk = tb.pk.map((c, i) => `${q(c)} AS p${i}`).join(", ");
    const chaves = u.cols.map((c, i) => (mcols.includes(c) ? `CASE WHEN ${q(c)} = @sai THEN @fica ELSE ${q(c)} END` : q(c)) + ` AS k${i}`).join(", ");
    const lado = mcols.map((c) => `${q(c)} = @sai`).join(" OR ");
    const alcance = mcols.map((c) => `${q(c)} IN (@sai, @fica)`).join(" OR ");
    const igualPk = tb.pk.map((_, i) => `b.p${i} = a.p${i}`).join(" AND ");
    const igualK = u.cols.map((_, i) => `(b.k${i} = a.k${i} OR (b.k${i} IS NULL AND a.k${i} IS NULL))`).join(" AND ");
    const saida = tb.pk.map((c, i) => `a.p${i} AS ${q(c)}`).join(", ");
    const r = await rq().input("sai", sql.Int, sai).input("fica", sql.Int, fica).query(`
      WITH x AS (SELECT ${pk}, CASE WHEN ${lado} THEN 1 ELSE 0 END AS s__, ${chaves} FROM dbo.${q(t)} WHERE (${alcance})${condFiltro(u)})
      SELECT DISTINCT ${saida} FROM x a WHERE a.s__ = 1 AND EXISTS (SELECT 1 FROM x b WHERE NOT (${igualPk}) AND ${igualK})`);
    for (const l of r.recordset) achadas.set(JSON.stringify(tb.pk.map((c) => l[c])), l);
  }
  return [...achadas.values()];
}
// As linhas que ligam as duas fichas uma à outra (as duas colunas de um par proibido batem nas duas fichas): viram "a pessoa com ela mesma".
async function linhasDeLigacao(rq, mapa, t, fica, sai) {
  const tb = mapa.tabelas.get(t);
  const achadas = new Map();
  for (const [a, b] of tb.pares) {
    const sel = tb.pk.map((c) => q(c)).join(", ");
    const r = await rq().input("sai", sql.Int, sai).input("fica", sql.Int, fica).query(`
      SELECT ${sel} FROM dbo.${q(t)} WHERE ${q(a)} IN (@sai, @fica) AND ${q(b)} IN (@sai, @fica) AND (${q(a)} = @sai OR ${q(b)} = @sai)`);
    for (const l of r.recordset) achadas.set(JSON.stringify(tb.pk.map((c) => l[c])), l);
  }
  return [...achadas.values()];
}

// Tudo o que a tela e a gravação precisam saber da dupla. `rq` = pool.request ou o da transação. Devolve { erro } ou a avaliação inteira.
async function avaliar(rq, usuario, idA, idB) {
  const a = auth.idDeRota(idA), b = auth.idDeRota(idB);
  if (!a || !b) return { erro: { status: 400, mensagem: "Informe as duas matrículas." } };
  if (a === b) return { erro: { status: 400, mensagem: "Escolha duas fichas diferentes." } };
  const la = await lerFicha(rq, a), lb = await lerFicha(rq, b);
  // fora do escopo e inexistente respondem igual (a regra do CPF repetido: as duas fichas no escopo de quem junta)
  if (!la || !lb || !noEscopoDaPessoa(usuario, la.CongregacaoNome, la.ExtensaoNome) || !noEscopoDaPessoa(usuario, lb.CongregacaoNome, lb.ExtensaoNome)) {
    return { erro: { status: 404, mensagem: NAO_ENCONTRADA } };
  }
  const { fica: f, sai: s } = R.quemFica({ membroId: la.MembroId, criadoEm: la.CriadoEm, reaproveitada: !!la.Reaproveitada, linha: la },
    { membroId: lb.MembroId, criadoEm: lb.CriadoEm, reaproveitada: !!lb.Reaproveitada, linha: lb });
  const fica = f.linha, sai = s.linha;
  const geral = ehGeral(usuario);
  const papel = geral ? "GERAL" : "SECRETARIA";
  const ehProprio = [fica.MembroId, sai.MembroId].includes(Number(usuario.membroId));
  const vDisc = auth.visaoDaPermissao(usuario, "disciplina");
  const podeDisciplina = !!vDisc && noEscopoDaPessoa(vDisc, fica.CongregacaoNome, fica.ExtensaoNome) && noEscopoDaPessoa(vDisc, sai.CongregacaoNome, sai.ExtensaoNome);
  const emProcessoDeCargo = !!(fica.EmProcessoDeCargo || sai.EmProcessoDeCargo);
  const temExclusao = !!(fica.TemExclusao || sai.TemExclusao);

  // o que impede de juntar AGORA (antes das tabelas)
  const bloqueios = [];
  if (ehProprio) bloqueios.push("Ninguém junta a própria ficha: peça a outra pessoa da Secretaria.");
  if (fica.TransferenciaPendente || sai.TransferenciaPendente) bloqueios.push("Há um pedido de transferência em andamento numa das fichas: conclua ou cancele antes de juntar.");
  if (fica.SugestaoPendente || sai.SugestaoPendente) bloqueios.push("Há sugestões de alteração esperando na caixa de sugestões: decida-as antes de juntar.");
  if (!geral && (fica.TemReservado || sai.TemReservado)) bloqueios.push("Uma das fichas tem registros que só a Secretaria Geral pode juntar: peça à Secretaria Geral.");
  if (!geral && emProcessoDeCargo) bloqueios.push("Uma das fichas tem um processo de cargo em andamento: só a Secretaria Geral junta.");

  // os campos: só os diferentes vão para a tela (os iguais só contados)
  const nomes = await nomesDosCampos(rq, [fica, sai]);
  const campos = [];
  const iguaisLista = [];
  let iguais = 0;
  for (const chave of Object.keys(R.CAMPOS)) {
    if (R.iguais(chave, fica, sai)) {
      iguais++;
      iguaisLista.push({ campo: chave, rotulo: R.CAMPOS[chave].rotulo, valor: R.valorParaTela(chave, fica, { podeDisciplina, nomes }) });
      continue;
    }
    const p = R.podeEscolher(chave, { papel, ehProprio, valorFica: R.valorDoCampo(chave, fica), emProcessoDeCargo, temExclusao });
    // o CPF: os dois preenchidos e diferentes = um deles está errado; quem escolhe é a Geral (o vazio, qualquer secretaria preenche — a regra do passo 5)
    campos.push({ campo: chave, rotulo: R.CAMPOS[chave].rotulo, grupo: R.CAMPOS[chave].grupo,
      fica: R.valorParaTela(chave, fica, { podeDisciplina, nomes }), sai: R.valorParaTela(chave, sai, { podeDisciplina, nomes }),
      sugerido: R.valorDoCampo(chave, fica) === null && R.valorDoCampo(chave, sai) !== null ? "SAI" : "FICA",
      pode: p.pode, motivo: p.motivo });
  }

  // as tabelas
  const mapa = await lerMapa(rq);
  const contagens = await contarLinhas(rq, mapa, sai.MembroId);
  const porTabela = new Map();
  for (const l of contagens) porTabela.set(l.t, (porTabela.get(l.t) || 0) + l.n);
  const conflitos = [];
  const bloqueiosTabelas = new Set();
  for (const t of porTabela.keys()) {
    if (R.ESPECIAIS.has(t)) continue;
    const tb = mapa.tabelas.get(t);
    if (!tb) continue;
    if (tb.unicos.length) {
      const linhas = await linhasEmConflito(rq, mapa, t, fica.MembroId, sai.MembroId);
      if (linhas.length) {
        const politica = R.politicaDoConflito(t);
        conflitos.push({ t, politica, linhas });
        if (politica === "BLOQUEAR") bloqueiosTabelas.add(R.motivoDoBloqueio(t));
      }
    }
    if (tb.pares.length) {
      const ligacoes = await linhasDeLigacao(rq, mapa, t, fica.MembroId, sai.MembroId);
      if (ligacoes.length) {
        if (R.LIGACAO_ARQUIVAR.has(t)) conflitos.push({ t, politica: "ARQUIVAR", linhas: ligacoes, ligacao: true });
        else bloqueiosTabelas.add(`As duas fichas estão ligadas uma à outra num registro de ${R.rotuloDaTabela(t) || "outra parte do sistema"}: a Secretaria Geral corrige antes.`);
      }
    }
  }
  // também as linhas da ficha que FICA que ligam à que sai (ex.: o vínculo de família gravado do lado dela)
  bloqueios.push(...[...bloqueiosTabelas].map((m) => (/^[A-Z]/.test(m) ? m : m.charAt(0).toUpperCase() + m.slice(1) + ".")));
  const arquivadas = conflitos.filter((c) => c.politica === "ARQUIVAR").reduce((s, c) => s + c.linhas.length, 0);
  const descartadas = conflitos.filter((c) => c.politica === "DESCARTAR").reduce((s, c) => s + c.linhas.length, 0);
  return {
    fica, sai, papel, geral, podeDisciplina, emProcessoDeCargo, temExclusao, campos, iguais, iguaisLista, bloqueios, mapa, contagens, conflitos,
    previa: R.previaParaTela([...porTabela.entries()].map(([t, n]) => ({ t, n }))), arquivadas, descartadas,
    versao: versaoDaDupla(fica, sai)
  };
}
async function nomesDosCampos(rq, linhas) {
  const ids = (col) => [...new Set(linhas.map((l) => l[col]).filter((v) => v != null).map(Number))];
  const cong = ids("CongregacaoId"), ext = ids("ExtensaoId"), dep = ids("DepartamentoId");
  const cargos = [...new Set(linhas.map((l) => l.CargoMinisterial).filter(Boolean))];
  const r = await rq().input("c", sql.NVarChar(sql.MAX), JSON.stringify(cong)).input("e", sql.NVarChar(sql.MAX), JSON.stringify(ext))
    .input("d", sql.NVarChar(sql.MAX), JSON.stringify(dep)).input("g", sql.NVarChar(sql.MAX), JSON.stringify(cargos)).query(`
    SELECT CongregacaoId AS id, Nome FROM Congregacoes WHERE CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@c));
    SELECT ExtensaoId AS id, Nome FROM ExtensoesTenda WHERE ExtensaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@e));
    SELECT DepartamentoId AS id, Nome FROM Departamentos WHERE DepartamentoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@d));
    SELECT Sigla AS id, Nome FROM CargosMinisteriais WHERE Sigla IN (SELECT value FROM OPENJSON(@g));`);
  const mapa = (rs, num = true) => new Map(rs.map((l) => [num ? Number(l.id) : String(l.id), l.Nome]));
  return { congregacoes: mapa(r.recordsets[0]), extensoes: mapa(r.recordsets[1]), departamentos: mapa(r.recordsets[2]), cargos: mapa(r.recordsets[3], false) };
}

// A comparação para a tela (GET): só o que é diferente, quem fica, o que impede, a prévia. Nunca o CPF inteiro nem o motivo disciplinar a quem não pode.
async function comparar(pool, usuario, a, b) {
  const av = await avaliar(() => pool.request(), usuario, a, b);
  if (av.erro) return { sucesso: false, status: av.erro.status, mensagem: av.erro.mensagem };
  return { sucesso: true, status: 200, ...paraTela(av) };
}
function paraTela(av) {
  const resumo = (l) => ({ matricula: l.MembroId, nome: l.NomeAtual, congregacao: l.CongregacaoNome || null, criadaEm: l.CriadoEm ? new Date(l.CriadoEm).toISOString().slice(0, 10) : null });
  return {
    fica: resumo(av.fica), sai: resumo(av.sai), campos: av.campos, iguais: av.iguais, iguaisLista: av.iguaisLista, bloqueios: av.bloqueios, podeJuntar: av.bloqueios.length === 0,
    previa: av.previa, arquivadas: av.arquivadas, descartadas: av.descartadas, versao: av.versao, papel: av.papel
  };
}

// ================================================================ juntar (a transação)
async function comGatilhosDesligados(rq, mapa, t, fazer) {
  const g = (mapa.tabelas.get(t) || { gatilhos: [] }).gatilhos;
  for (const nome of g) await rq().query(`DISABLE TRIGGER dbo.${q(nome)} ON dbo.${q(t)}`);
  const r = await fazer();
  for (const nome of g) await rq().query(`ENABLE TRIGGER dbo.${q(nome)} ON dbo.${q(t)}`);
  return r;
}
// A condição SQL que acha as linhas pelas chaves primárias guardadas em JSON (@k). `trocar` = { coluna: "@param" } — a coluna da pessoa já trocada.
function condicaoPorChaves(tb, alias = "t") {
  const tipos = tb.pk.map((c) => `${q(c)} NVARCHAR(400) '$.${c.replace(/'/g, "''")}'`).join(", ");
  const igual = tb.pk.map((c) => `CAST(${alias}.${q(c)} AS NVARCHAR(400)) = j.${q(c)}`).join(" AND ");
  return `EXISTS (SELECT 1 FROM OPENJSON(@k) WITH (${tipos}) j WHERE ${igual})`;
}
async function arquivarEApagar(rq, mapa, juncaoId, t, linhas, { arquivar }) {
  const tb = mapa.tabelas.get(t);
  const k = JSON.stringify(linhas);
  if (arquivar) {
    await rq().input("k", sql.NVarChar(sql.MAX), k).input("j", sql.Int, juncaoId).input("t", sql.NVarChar(128), t).query(`
      INSERT INTO JuncoesFichasArquivo (JuncaoId, Tabela, Linha)
      SELECT @j, @t, (SELECT x.* FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)
      FROM dbo.${q(t)} x WHERE ${condicaoPorChaves(tb, "x")}`);
  }
  await comGatilhosDesligados(rq, mapa, t, () => rq().input("k", sql.NVarChar(sql.MAX), k).query(`DELETE t FROM dbo.${q(t)} t WHERE ${condicaoPorChaves(tb)}`));
}

// Junta as duas fichas. corpo: { a, b, escolhas, versao }. Devolve { sucesso, status, mensagem, juncaoId?, fica?, sai? }.
async function juntar(pool, usuario, corpo) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await juntarUmaVez(pool, usuario, corpo);
    } catch (e) {
      // vítima de impasse (outro trabalho mexendo nas mesmas tabelas): uma tentativa a mais; depois, "tente de novo"
      if (erroNumero(e) === 1205 && tentativa < 2) continue;
      if ([547, 2601, 2627, 1205].includes(erroNumero(e))) {
        return { sucesso: false, status: 409, mensagem: "Não deu para juntar agora: um registro mudou no meio ou não cabe na ficha que fica. Nada foi alterado; confira de novo." };
      }
      if (erroNumero(e) === 1088 || /permission|permiss/i.test(String(e && e.message))) {
        return { sucesso: false, status: 500, mensagem: "O banco não deixou desligar a proteção do histórico para mover os registros. Nada foi alterado; avise o suporte." };
      }
      throw e;
    }
  }
}
async function juntarUmaVez(pool, usuario, corpo) {
  const c = corpo && typeof corpo === "object" ? corpo : {};
  const t = new sql.Transaction(pool);
  await t.begin();
  const rq = () => new sql.Request(t);
  let sids = [];
  try {
    const a = auth.idDeRota(c.a), b = auth.idDeRota(c.b);
    if (!a || !b || a === b) { await t.rollback(); return { sucesso: false, status: 400, mensagem: "Informe as duas matrículas (diferentes)." }; }
    // existem? (sem existir não trava nada; a avaliação abaixo diz "não encontrada")
    await travarDupla(rq, a, b);
    const av = await avaliar(rq, usuario, a, b);
    if (av.erro) { await t.rollback(); return { sucesso: false, status: av.erro.status, mensagem: av.erro.mensagem }; }
    if (typeof c.versao !== "string" || c.versao !== av.versao) {
      await t.rollback();
      return { sucesso: false, status: 409, mensagem: "As fichas mudaram enquanto você conferia. Abra a comparação de novo." };
    }
    if (av.bloqueios.length) { await t.rollback(); return { sucesso: false, status: 422, mensagem: av.bloqueios[0], bloqueios: av.bloqueios }; }
    const fica = av.fica.MembroId, sai = av.sai.MembroId;
    const lidas = R.lerEscolhas(c.escolhas, { fica, sai });
    if (!lidas.ok) { await t.rollback(); return { sucesso: false, status: 400, mensagem: lidas.mensagem }; }
    // só valem as escolhas dos campos DIFERENTES que quem junta PODE escolher; escolher o travado é recusado (não passa calado)
    const escolhas = {};
    for (const campo of av.campos) {
      const lado = lidas.escolhas[campo.campo] || "FICA";
      if (lado === "SAI" && !campo.pode) { await t.rollback(); return { sucesso: false, status: 403, mensagem: campo.motivo || "Você não pode escolher este campo." }; }
      escolhas[campo.campo] = lado;
    }
    const mapa = av.mapa;
    const fichaSai = (await rq().input("s", sql.Int, sai).query(`SELECT (SELECT * FROM MembroReferencia WHERE MembroId = @s FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS j`)).recordset[0].j;
    const antes = {};
    for (const col of R.COLUNAS_FICHA) antes[col] = av.fica[col] instanceof Date ? av.fica[col].toISOString().slice(0, 10) : av.fica[col] === undefined ? null : av.fica[col];
    const escopo = av.geral ? "GERAL" : String(usuario.nivel || "").toUpperCase() === "AREA" ? "AREA" : "LOCAL";
    const reg = await rq().input("f", sql.Int, fica).input("s", sql.Int, sai).input("por", sql.Int, usuario.membroId).input("esc", sql.NVarChar(10), escopo)
      .input("escolhas", sql.NVarChar(sql.MAX), JSON.stringify(escolhas)).input("antes", sql.NVarChar(sql.MAX), JSON.stringify(antes)).input("fs", sql.NVarChar(sql.MAX), fichaSai)
      .query(`INSERT INTO JuncoesFichas (MatriculaFica, MatriculaSai, JuntadaPor, Escopo, Escolhas, FichaFicaAntes, FichaSai) OUTPUT INSERTED.JuncaoId
              VALUES (@f, @s, @por, @esc, @escolhas, @antes, @fs)`);
    const juncaoId = reg.recordset[0].JuncaoId;
    const especiais = [];
    const p = () => rq().input("f", sql.Int, fica).input("s", sql.Int, sai).input("por", sql.Int, usuario.membroId);

    // ---- 1) as tabelas tratadas à parte
    // as pendências da dupla (as duas direções) e as repetidas (o mesmo tipo e a mesma outra ficha nas duas) — resolvidas pela junção
    const pend = await p().query(`
      UPDATE x SET Situacao = N'RESOLVIDA', Resolucao = N'JUNTADA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por, Nota = N'Fichas juntadas'
      OUTPUT INSERTED.PendenciaId
      FROM FichasPendencias x
      WHERE x.Situacao = N'ABERTA' AND (
        (x.MembroId = @s AND x.OutroMembroId = @f) OR (x.MembroId = @f AND x.OutroMembroId = @s)
        OR (x.MembroId = @s AND EXISTS (SELECT 1 FROM FichasPendencias y WHERE y.Situacao = N'ABERTA' AND y.MembroId = @f AND y.Tipo = x.Tipo
                                        AND ISNULL(y.OutroMembroId, -1) = ISNULL(x.OutroMembroId, -1)))
        OR (x.OutroMembroId = @s AND EXISTS (SELECT 1 FROM FichasPendencias y WHERE y.Situacao = N'ABERTA' AND y.OutroMembroId = @f AND y.MembroId = x.MembroId AND y.Tipo = x.Tipo)))`);
    for (const l of pend.recordset) especiais.push({ e: "PENDENCIA", id: l.PendenciaId });
    // os casos abertos da Geral que ficariam repetidos (a mesma congregação que pediu, o mesmo tipo)
    const casos = await p().query(`
      UPDATE x SET Situacao = N'RESOLVIDO', ResolvidoEm = SYSUTCDATETIME(), ResolvidoPor = @por, Nota = LEFT(ISNULL(Nota + N' · ', N'') + N'Fichas juntadas', 500)
      OUTPUT INSERTED.CasoId
      FROM CasosCadastroGeral x WHERE x.Situacao = N'ABERTO' AND x.MembroIdExistente = @s
        AND EXISTS (SELECT 1 FROM CasosCadastroGeral y WHERE y.Situacao = N'ABERTO' AND y.MembroIdExistente = @f AND y.Tipo = x.Tipo
                    AND ISNULL(y.CongregacaoQuePediuId, -1) = ISNULL(x.CongregacaoQuePediuId, -1))`);
    for (const l of casos.recordset) especiais.push({ e: "CASO", id: l.CasoId });
    // a credencial da ficha que sai leva o número que sai: a válida é cancelada (a pessoa pede uma nova via na ficha que fica) e as vias são renumeradas
    // depois das da ficha que fica (o índice único MembroId + Via)
    await p().query(`UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPor = @por,
                       MotivoEncerramento = N'Fichas juntadas: a credencial levava a matrícula da ficha que deixou de existir'
                     WHERE MembroId = @s AND Situacao = N'VALIDA'`);
    const vias = await p().query(`
      DECLARE @base INT = ISNULL((SELECT MAX(Via) FROM CredenciaisEclesiasticas WHERE MembroId = @f), 0);
      UPDATE c SET Via = @base + v.n OUTPUT INSERTED.CredencialId, DELETED.Via AS ViaAntes
      FROM CredenciaisEclesiasticas c JOIN (SELECT CredencialId, ROW_NUMBER() OVER (ORDER BY Via) AS n FROM CredenciaisEclesiasticas WHERE MembroId = @s) v ON v.CredencialId = c.CredencialId
      WHERE @base > 0`);
    for (const l of vias.recordset) especiais.push({ e: "VIA", id: l.CredencialId, via: l.ViaAntes });
    // as sessões abertas da ficha que sai caem (o token dela levava o número que sai; o número pode ser dado a outra pessoa)
    const sess = await p().query(`UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() OUTPUT INSERTED.SessaoId WHERE MembroId = @s AND Encerrada = 0`);
    sids = sess.recordset.map((l) => l.SessaoId);
    // os desafios da chave de acesso em andamento (passageiros) da ficha que sai
    if (mapa.colunas.some((x) => x.t === "DesafiosWebAuthn")) await p().query(`DELETE FROM DesafiosWebAuthn WHERE MembroId = @s`);

    // ---- 2) os conflitos: descartar ou arquivar (os que bloqueiam já pararam acima)
    for (const cf of av.conflitos) {
      if (cf.politica === "BLOQUEAR") continue;
      await arquivarEApagar(rq, mapa, juncaoId, cf.t, cf.linhas, { arquivar: cf.politica === "ARQUIVAR" });
    }

    // ---- 3) o movimento: cada coluna que aponta para a ficha que sai passa a apontar para a que fica (com as chaves guardadas para desfazer)
    const movimentos = [];
    const contagens = await contarLinhas(rq, mapa, sai);   // de novo, depois dos descartes
    for (const { t: tab, c: col } of contagens) {
      const tb = mapa.tabelas.get(tab);
      const sel = tb.pk.map((x) => q(x)).join(", ");
      const chaves = (await rq().input("s", sql.Int, sai).query(`SELECT ${sel} FROM dbo.${q(tab)} WHERE ${q(col)} = @s`)).recordset;
      await comGatilhosDesligados(rq, mapa, tab, () => p().query(`UPDATE dbo.${q(tab)} SET ${q(col)} = @f WHERE ${q(col)} = @s`));
      // a chave já com a coluna trocada (quando a coluna da pessoa faz parte da chave primária)
      movimentos.push({ t: tab, c: col, k: chaves.map((l) => { const o = {}; for (const x of tb.pk) o[x] = x === col ? fica : l[x]; return o; }) });
    }

    // ---- 4) a ficha que fica recebe o que foi escolhido da que sai
    const colsSai = Object.entries(escolhas).filter(([, lado]) => lado === "SAI").flatMap(([campo]) => R.CAMPOS[campo].colunas);
    if (colsSai.includes("Cpf")) {
      // o CPF é único: sai de uma antes de entrar na outra
      await p().query(`DECLARE @cpf CHAR(11) = (SELECT Cpf FROM MembroReferencia WHERE MembroId = @s);
                       UPDATE MembroReferencia SET Cpf = NULL WHERE MembroId = @s;
                       UPDATE MembroReferencia SET Cpf = @cpf WHERE MembroId = @f;`);
    }
    const resto = colsSai.filter((x) => x !== "Cpf");
    if (resto.length) {
      await p().query(`UPDATE f SET ${resto.map((x) => `f.${q(x)} = s.${q(x)}`).join(", ")} FROM MembroReferencia f CROSS JOIN MembroReferencia s WHERE f.MembroId = @f AND s.MembroId = @s`);
    }
    // a congregação mudou (escolheram a da ficha que sai): o dízimo ativo da ficha que fica vai junto, como na transferência
    if (escolhas.congregacao === "SAI" && Number(av.fica.CongregacaoId || 0) !== Number(av.sai.CongregacaoId || 0) && av.fica.CongregacaoId != null) {
      const dz = await p().input("o", sql.Int, av.fica.CongregacaoId).input("d", sql.Int, av.sai.CongregacaoId)
        .query(`UPDATE Dizimistas SET CongregacaoId = @d OUTPUT INSERTED.DizimistaId WHERE MembroId = @f AND CongregacaoId = @o AND Ativo = 1`);
      for (const l of dz.recordset) especiais.push({ e: "DIZIMO_CONG", id: l.DizimistaId, cong: av.fica.CongregacaoId });
    }
    // dois cadastros de dizimista ativos na mesma congregação (um de cada ficha): fica o mais antigo
    const dup = await p().query(`
      UPDATE d SET Ativo = 0 OUTPUT INSERTED.DizimistaId FROM Dizimistas d
      WHERE d.MembroId = @f AND d.Ativo = 1 AND EXISTS (SELECT 1 FROM Dizimistas o WHERE o.MembroId = @f AND o.Ativo = 1 AND o.CongregacaoId = d.CongregacaoId AND o.DizimistaId < d.DizimistaId)`);
    for (const l of dup.recordset) especiais.push({ e: "DIZIMO_ATIVO", id: l.DizimistaId });

    // ---- 5) a ficha que sai deixa de existir e o número vai para o próximo cadastro novo
    await p().query(`DELETE FROM MembroReferencia WHERE MembroId = @s;
                     IF NOT EXISTS (SELECT 1 FROM MatriculasLivres WHERE MembroId = @s) INSERT INTO MatriculasLivres (MembroId, JuntadaCom) VALUES (@s, @f);
                     ELSE UPDATE MatriculasLivres SET JuntadaCom = @f, LiberadaEm = SYSUTCDATETIME() WHERE MembroId = @s;`);

    // ---- 6) o registro e a trilha
    const depois = (await rq().input("f", sql.Int, fica).query(`SELECT ${COLS_FICHA_SQL} FROM MembroReferencia m WHERE m.MembroId = @f`)).recordset[0];
    const fichaDepois = {};
    for (const col of R.COLUNAS_FICHA) fichaDepois[col] = depois[col] instanceof Date ? depois[col].toISOString().slice(0, 10) : depois[col] === undefined ? null : depois[col];
    const resumo = {
      movidas: movimentos.map((m) => ({ t: m.t, c: m.c, n: m.k.length })),
      arquivadas: av.conflitos.filter((x) => x.politica === "ARQUIVAR").map((x) => ({ t: x.t, n: x.linhas.length })),
      descartadas: av.conflitos.filter((x) => x.politica === "DESCARTAR").map((x) => ({ t: x.t, n: x.linhas.length })),
      sessoesEncerradas: sids.length
    };
    await rq().input("j", sql.Int, juncaoId).input("mov", sql.NVarChar(sql.MAX), JSON.stringify({ mov: movimentos, esp: especiais }))
      .input("res", sql.NVarChar(sql.MAX), JSON.stringify(resumo)).input("dep", sql.NVarChar(sql.MAX), JSON.stringify(fichaDepois))
      .query(`UPDATE JuncoesFichas SET Movimentos = @mov, Resumo = @res, FichaFicaDepois = @dep WHERE JuncaoId = @j`);
    const mascaraTrilha = (campo, linha) => (campo === "cpf" ? mascararCpf(linha.Cpf) : campo === "email" || campo === "telefone" ? "(contato)" : R.valorParaTela(campo, linha, { podeDisciplina: false }));
    const mudou = Object.entries(escolhas).filter(([, lado]) => lado === "SAI").map(([campo]) => campo);
    await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: fica, acao: `Juntou a ficha ${sai} nesta (fichas repetidas)`.slice(0, 100), usuarioId: usuario.membroId,
      dadosAntes: Object.fromEntries(mudou.map((campo) => [campo, mascaraTrilha(campo, av.fica)])),
      dadosDepois: { juncaoId, matriculaQueSaiu: sai, ...Object.fromEntries(mudou.map((campo) => [campo, mascaraTrilha(campo, av.sai)])), registrosMovidos: movimentos.reduce((s, m) => s + m.k.length, 0) } });
    await registrarAuditoriaNaTransacao(t, { tabela: "JuncoesFichas", registroId: juncaoId, acao: "Juntou fichas repetidas", usuarioId: usuario.membroId,
      dadosDepois: { fica, sai, escopo, resumo } });
    await t.commit();
    auth.marcarRevogadas(sids);
    return { sucesso: true, status: 200, mensagem: `Fichas juntadas: a ${sai} deixou de existir e o histórico das duas está na ${fica}.`, juncaoId, fica, sai };
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}

// ================================================================ desfazer (só a Secretaria Geral, em até 30 dias, se nada mudou depois)
// Os tipos das colunas de uma tabela, para o OPENJSON ... WITH (a linha guardada em JSON volta como era).
async function colunasParaVoltar(rq, t) {
  const r = await rq().input("t", sql.NVarChar(128), `dbo.${t}`).query(`
    SELECT c.name, TYPE_NAME(c.user_type_id) AS tipo, c.max_length, c.precision, c.scale, CAST(c.is_identity AS INT) AS ident, CAST(c.is_computed AS INT) AS calc
    FROM sys.columns c WHERE c.object_id = OBJECT_ID(@t) ORDER BY c.column_id`);
  return r.recordset.filter((c) => !c.calc && c.tipo !== "timestamp").map((c) => {
    const tam = (n) => (c.max_length === -1 ? "MAX" : String(n));
    let tipo = c.tipo;
    if (["nvarchar", "nchar"].includes(tipo)) tipo += `(${tam(c.max_length / 2)})`;
    else if (["varchar", "char", "varbinary", "binary"].includes(tipo)) tipo += `(${tam(c.max_length)})`;
    else if (["decimal", "numeric"].includes(tipo)) tipo += `(${c.precision}, ${c.scale})`;
    else if (["datetime2", "time", "datetimeoffset"].includes(tipo)) tipo += `(${c.scale})`;
    return { nome: c.name, tipo, ident: !!c.ident };
  });
}
async function reinserirLinha(rq, mapa, t, json) {
  const cols = await colunasParaVoltar(rq, t);
  const temIdent = cols.some((c) => c.ident);
  const lista = cols.map((c) => q(c.nome)).join(", ");
  const com = cols.map((c) => `${q(c.nome)} ${c.tipo} '$.${c.nome.replace(/'/g, "''")}'`).join(", ");
  const inserir = () => rq().input("j", sql.NVarChar(sql.MAX), json).query(`
    ${temIdent ? `SET IDENTITY_INSERT dbo.${q(t)} ON;` : ""}
    INSERT INTO dbo.${q(t)} (${lista}) SELECT ${lista} FROM OPENJSON(@j) WITH (${com});
    ${temIdent ? `SET IDENTITY_INSERT dbo.${q(t)} OFF;` : ""}`);
  if (mapa && mapa.tabelas.has(t)) return comGatilhosDesligados(rq, mapa, t, inserir);
  return inserir();
}
async function desfazer(pool, usuario, { juncaoId, motivo }) {
  const id = auth.idDeRota(juncaoId);
  if (!ehGeral(usuario)) return { sucesso: false, status: 403, mensagem: "Só a Secretaria Geral desfaz uma junção." };
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a junção." };
  const mot = typeof motivo === "string" ? motivo.replace(/\s+/g, " ").trim() : "";
  if (mot.length < 5 || mot.length > 300 || /[<>]/.test(mot)) return { sucesso: false, status: 400, mensagem: "Escreva o motivo (de 5 a 300 letras)." };
  const t = new sql.Transaction(pool);
  await t.begin();
  const rq = () => new sql.Request(t);
  const recusar = async (status, mensagem) => { await t.rollback(); return { sucesso: false, status, mensagem }; };
  try {
    const j = (await rq().input("j", sql.Int, id).query(`SELECT * FROM JuncoesFichas WITH (UPDLOCK, HOLDLOCK) WHERE JuncaoId = @j`)).recordset[0];
    if (!j) return await recusar(404, "Junção não encontrada.");
    if (j.Situacao !== "FEITA") return await recusar(409, "Esta junção já foi desfeita.");
    if (!j.FichaSai || !j.Movimentos || Date.now() - new Date(j.JuntadaEm).getTime() > DIAS_DESFAZER * 86400000) {
      return await recusar(409, `Passou do prazo de ${DIAS_DESFAZER} dias: a junção não se desfaz mais pelo sistema.`);
    }
    const fica = j.MatriculaFica, sai = j.MatriculaSai;
    await travarDupla(rq, fica, sai);
    const atual = (await rq().input("f", sql.Int, fica).query(`SELECT ${COLS_FICHA_SQL} FROM MembroReferencia m WHERE m.MembroId = @f`)).recordset[0];
    if (!atual) return await recusar(409, "A ficha que ficou não existe mais.");
    const ocupado = (await rq().input("s", sql.Int, sai).query(`SELECT COUNT(*) AS n FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @s`)).recordset[0].n;
    if (ocupado) return await recusar(409, `O número ${sai} já foi dado a outra pessoa: a junção não se desfaz mais pelo sistema.`);
    const depois = JSON.parse(j.FichaFicaDepois || "{}");
    const mudou = R.COLUNAS_FICHA.some((col) => R.textoDaColuna(atual[col]) !== R.textoDaColuna(depois[col] === undefined ? null : depois[col]));
    if (mudou) return await recusar(409, "A ficha que ficou foi alterada depois da junção: desfazer apagaria essas mudanças. Corrija à mão.");
    const mapa = await lerMapa(rq);
    const antes = JSON.parse(j.FichaFicaAntes || "{}");
    // a ficha que ficou volta a ser como era (o CPF primeiro: ele é único e pode voltar para a outra ficha)
    const colsVoltar = R.COLUNAS_FICHA.filter((col) => R.textoDaColuna(antes[col]) !== R.textoDaColuna(depois[col]));
    await rq().input("f", sql.Int, fica).query(`UPDATE MembroReferencia SET Cpf = NULL WHERE MembroId = @f AND ${colsVoltar.includes("Cpf") ? "1 = 1" : "1 = 0"}`);
    await reinserirLinha(rq, null, "MembroReferencia", j.FichaSai);
    if (colsVoltar.length) {
      const voltar = rq().input("f", sql.Int, fica).input("a", sql.NVarChar(sql.MAX), JSON.stringify(antes));
      const cols = await colunasParaVoltar(rq, "MembroReferencia");
      const tipos = new Map(cols.map((c) => [c.nome, c.tipo]));
      await voltar.query(`UPDATE m SET ${colsVoltar.map((col) => `m.${q(col)} = j.${q(col)}`).join(", ")} FROM MembroReferencia m CROSS JOIN OPENJSON(@a)
        WITH (${colsVoltar.map((col) => `${q(col)} ${tipos.get(col)} '$.${col}'`).join(", ")}) j WHERE m.MembroId = @f`);
    }
    await rq().input("s", sql.Int, sai).query(`DELETE FROM MatriculasLivres WHERE MembroId = @s`);
    // as linhas voltam para a ficha que saiu (na ordem contrária)
    const mov = JSON.parse(j.Movimentos);
    for (const m of [...(mov.mov || [])].reverse()) {
      const tb = mapa.tabelas.get(m.t);
      if (!tb || !m.k.length) continue;
      await comGatilhosDesligados(rq, mapa, m.t, () => rq().input("k", sql.NVarChar(sql.MAX), JSON.stringify(m.k)).input("f", sql.Int, fica).input("s", sql.Int, sai)
        .query(`UPDATE t SET ${q(m.c)} = @s FROM dbo.${q(m.t)} t WHERE t.${q(m.c)} = @f AND ${condicaoPorChaves(tb)}`));
    }
    for (const e of mov.esp || []) {
      const r = () => rq().input("id", sql.Int, e.id).input("s", sql.Int, sai);
      if (e.e === "PENDENCIA") await r().query(`UPDATE FichasPendencias SET Situacao = N'ABERTA', Resolucao = NULL, ResolvidaEm = NULL, ResolvidaPor = NULL WHERE PendenciaId = @id`);
      else if (e.e === "CASO") await r().query(`UPDATE CasosCadastroGeral SET Situacao = N'ABERTO', ResolvidoEm = NULL, ResolvidoPor = NULL WHERE CasoId = @id`);
      else if (e.e === "VIA") await r().input("v", sql.Int, e.via).query(`UPDATE CredenciaisEclesiasticas SET Via = @v WHERE CredencialId = @id`);
      else if (e.e === "DIZIMO_ATIVO") await r().query(`UPDATE Dizimistas SET Ativo = 1 WHERE DizimistaId = @id`);
      else if (e.e === "DIZIMO_CONG") await r().input("c", sql.Int, e.cong).query(`UPDATE Dizimistas SET CongregacaoId = @c WHERE DizimistaId = @id`);
    }
    // as linhas arquivadas voltam inteiras
    const arq = (await rq().input("j", sql.Int, id).query(`SELECT ArquivoId, Tabela, Linha FROM JuncoesFichasArquivo WHERE JuncaoId = @j ORDER BY ArquivoId`)).recordset;
    for (const l of arq) await reinserirLinha(rq, mapa, l.Tabela, l.Linha);
    await rq().input("j", sql.Int, id).query(`DELETE FROM JuncoesFichasArquivo WHERE JuncaoId = @j`);
    await rq().input("j", sql.Int, id).input("por", sql.Int, usuario.membroId).input("m", sql.NVarChar(300), mot).query(`
      UPDATE JuncoesFichas SET Situacao = N'DESFEITA', DesfeitaEm = SYSUTCDATETIME(), DesfeitaPor = @por, MotivoDesfazer = @m, FichaSai = NULL, FichaFicaAntes = NULL WHERE JuncaoId = @j`);
    await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: fica, acao: `Desfez a junção com a ficha ${sai}`.slice(0, 100), usuarioId: usuario.membroId, dadosDepois: { juncaoId: id, motivo: mot } });
    await registrarAuditoriaNaTransacao(t, { tabela: "JuncoesFichas", registroId: id, acao: "Desfez a junção de fichas", usuarioId: usuario.membroId, dadosDepois: { fica, sai, motivo: mot } });
    await t.commit();
    return { sucesso: true, status: 200, mensagem: `Junção desfeita: a ficha ${sai} voltou com o que era dela. A credencial cancelada na junção continua cancelada (peça uma nova via, se precisar).` };
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    if ([547, 2601, 2627, 1205].includes(erroNumero(e))) return { sucesso: false, status: 409, mensagem: "Não deu para desfazer: algum registro mudou depois da junção. Nada foi alterado." };
    throw e;
  }
}

// ================================================================ a lista: as fichas possivelmente repetidas (no escopo de quem vê)
// Mesmo nome (sem acento e sem diferença de maiúscula) e mesma data de nascimento, ou marcadas por alguém como repetidas — as DUAS no escopo; menos as duplas
// que alguém já disse "não são a mesma pessoa".
async function listarCandidatos(pool, usuario, { limite = 200 } = {}) {
  const pedido = pool.request();
  const condA = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "e.Nome", "esa");
  if (condA === "") return [];
  const filtro = condA ? `WHERE ${condA}` : "";
  pedido.input("lim", sql.Int, Math.max(1, Math.min(500, limite)));
  const r = await pedido.query(`
    WITH base AS (
      SELECT m.MembroId, m.Nome, m.DataNascimento, m.CongregacaoId, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome, m.CriadoEm,
             LTRIM(RTRIM(REPLACE(REPLACE(m.Nome, N'  ', N' '), N'  ', N' '))) COLLATE Latin1_General_CI_AI AS Chave
      FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
      ${filtro}
    ), pares AS (
      SELECT a.MembroId AS A, b.MembroId AS B, N'NOME_NASCIMENTO' AS Motivo FROM base a JOIN base b ON a.MembroId < b.MembroId AND a.DataNascimento = b.DataNascimento AND a.Chave = b.Chave
        -- (a dupla que alguém já disse que NÃO é a mesma pessoa sai da conta automática; se alguém MARCAR de novo, ela volta pela marcação abaixo)
        AND NOT EXISTS (SELECT 1 FROM FichasPendencias n WHERE n.Tipo = N'REPETIDA' AND n.Situacao = N'RESOLVIDA' AND n.Resolucao = N'NAO_E_A_MESMA'
                        AND ((n.MembroId = a.MembroId AND n.OutroMembroId = b.MembroId) OR (n.MembroId = b.MembroId AND n.OutroMembroId = a.MembroId)))
      UNION
      SELECT CASE WHEN p.MembroId < p.OutroMembroId THEN p.MembroId ELSE p.OutroMembroId END, CASE WHEN p.MembroId < p.OutroMembroId THEN p.OutroMembroId ELSE p.MembroId END, N'MARCADA'
      FROM FichasPendencias p WHERE p.Situacao = N'ABERTA' AND p.Tipo = N'REPETIDA'
        AND p.MembroId IN (SELECT MembroId FROM base) AND p.OutroMembroId IN (SELECT MembroId FROM base)
    )
    SELECT TOP (@lim) x.A, x.B, MAX(x.Motivo) AS Motivo, a.Nome AS NomeA, b.Nome AS NomeB, a.CongregacaoNome AS CongA, b.CongregacaoNome AS CongB,
           a.ExtensaoNome AS ExtA, b.ExtensaoNome AS ExtB, CONVERT(varchar(10), a.DataNascimento, 120) AS NascA, CONVERT(varchar(10), b.DataNascimento, 120) AS NascB
    FROM pares x JOIN base a ON a.MembroId = x.A JOIN base b ON b.MembroId = x.B
    GROUP BY x.A, x.B, a.Nome, b.Nome, a.CongregacaoNome, b.CongregacaoNome, a.ExtensaoNome, b.ExtensaoNome, a.DataNascimento, b.DataNascimento
    ORDER BY a.Nome, x.A`);
  return r.recordset
    .filter((l) => noEscopoDaPessoa(usuario, l.CongA, l.ExtA) && noEscopoDaPessoa(usuario, l.CongB, l.ExtB))
    .map((l) => ({ a: l.A, b: l.B, motivo: l.Motivo === "MARCADA" ? "marcada como repetida" : "mesmo nome e mesma data de nascimento",
      pessoas: [{ matricula: l.A, nome: l.NomeA, congregacao: l.CongA || null, nascimento: l.NascA }, { matricula: l.B, nome: l.NomeB, congregacao: l.CongB || null, nascimento: l.NascB }] }));
}

// "Não são a mesma pessoa" e "marcar como repetida": uma pendência REPETIDA (aberta ou resolvida) na ficha mais nova, apontando para a outra.
async function decidirDupla(pool, usuario, { a, b, nota }, acao) {
  const ia = auth.idDeRota(a), ib = auth.idDeRota(b);
  if (!ia || !ib || ia === ib) return { sucesso: false, status: 400, mensagem: "Informe as duas matrículas (diferentes)." };
  const txt = typeof nota === "string" ? nota.replace(/\s+/g, " ").trim() : "";
  if (txt.length > 300 || /[<>]/.test(txt)) return { sucesso: false, status: 400, mensagem: "A observação tem até 300 letras, sem < nem >." };
  const la = await lerFicha(() => pool.request(), ia), lb = await lerFicha(() => pool.request(), ib);
  if (!la || !lb || !noEscopoDaPessoa(usuario, la.CongregacaoNome, la.ExtensaoNome) || !noEscopoDaPessoa(usuario, lb.CongregacaoNome, lb.ExtensaoNome)) {
    return { sucesso: false, status: 404, mensagem: NAO_ENCONTRADA };
  }
  const { fica, sai } = R.quemFica({ membroId: ia, criadoEm: la.CriadoEm, reaproveitada: !!la.Reaproveitada }, { membroId: ib, criadoEm: lb.CriadoEm, reaproveitada: !!lb.Reaproveitada });
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const rq = () => new sql.Request(t);
    const base = () => rq().input("s", sql.Int, sai.membroId).input("f", sql.Int, fica.membroId).input("por", sql.Int, usuario.membroId).input("nota", sql.NVarChar(300), txt || null);
    let mensagem;
    if (acao === "NAO_E_A_MESMA") {
      // resolve a aberta da dupla (se houver) e grava a decisão (uma linha resolvida basta para tirar a dupla da lista)
      await base().query(`
        UPDATE FichasPendencias WITH (UPDLOCK, HOLDLOCK) SET Situacao = N'RESOLVIDA', Resolucao = N'NAO_E_A_MESMA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por, Nota = @nota
        WHERE Situacao = N'ABERTA' AND Tipo = N'REPETIDA' AND ((MembroId = @s AND OutroMembroId = @f) OR (MembroId = @f AND OutroMembroId = @s));
        IF NOT EXISTS (SELECT 1 FROM FichasPendencias WITH (UPDLOCK, HOLDLOCK) WHERE Tipo = N'REPETIDA' AND Resolucao = N'NAO_E_A_MESMA'
                       AND ((MembroId = @s AND OutroMembroId = @f) OR (MembroId = @f AND OutroMembroId = @s)))
          INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem, Situacao, AbertaPor, ResolvidaEm, ResolvidaPor, Resolucao, Nota)
          VALUES (@s, N'REPETIDA', @f, N'MARCADA', N'RESOLVIDA', @por, SYSUTCDATETIME(), @por, N'NAO_E_A_MESMA', @nota);`);
      mensagem = "Anotado: não são a mesma pessoa. A dupla sai da lista de fichas repetidas.";
    } else {
      // marcar: abre a pendência (a carteirinha física das duas fica bloqueada até alguém juntar ou dizer que não são a mesma pessoa)
      await base().query(`
        IF NOT EXISTS (SELECT 1 FROM FichasPendencias WITH (UPDLOCK, HOLDLOCK) WHERE Situacao = N'ABERTA' AND Tipo = N'REPETIDA'
                       AND ((MembroId = @s AND OutroMembroId = @f) OR (MembroId = @f AND OutroMembroId = @s)))
          INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem, AbertaPor, Nota) VALUES (@s, N'REPETIDA', @f, N'MARCADA', @por, @nota);`);
      mensagem = "Marcada como possível repetida: as duas fichas ficam com a pendência (a carteirinha física não é impressa) até alguém juntar ou dizer que não são a mesma pessoa.";
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "FichasPendencias", registroId: sai.membroId, acao: acao === "NAO_E_A_MESMA" ? "Disse que não são a mesma pessoa" : "Marcou fichas como repetidas",
      usuarioId: usuario.membroId, dadosDepois: { fica: fica.membroId, sai: sai.membroId } });
    await t.commit();
    return { sucesso: true, status: 200, mensagem };
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    if ([2601, 2627].includes(erroNumero(e))) return { sucesso: true, status: 200, mensagem: "Já estava anotado." };
    throw e;
  }
}

// ================================================================ as pendências de cadastro
// As pendências ABERTAS de uma ficha (para a ficha 360 e a carteirinha). A outra ficha da dupla só aparece se estiver no escopo de quem vê.
async function pendenciasDaFicha(pool, usuario, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT p.PendenciaId, p.Tipo, p.Detalhe, p.Origem, CONVERT(varchar(10), p.AbertaEm, 120) AS AbertaEm,
           CASE WHEN p.MembroId = @id THEN p.OutroMembroId ELSE p.MembroId END AS Outro, o.Nome AS OutroNome, oc.Nome AS OutroCong, oe.Nome AS OutroExt
    FROM FichasPendencias p
    LEFT JOIN MembroReferencia o ON o.MembroId = CASE WHEN p.MembroId = @id THEN p.OutroMembroId ELSE p.MembroId END
    LEFT JOIN Congregacoes oc ON oc.CongregacaoId = o.CongregacaoId LEFT JOIN ExtensoesTenda oe ON oe.ExtensaoId = o.ExtensaoId
    WHERE p.Situacao = N'ABERTA' AND (p.MembroId = @id OR p.OutroMembroId = @id)
    ORDER BY p.AbertaEm`);
  return r.recordset.map((l) => ({ id: l.PendenciaId, tipo: l.Tipo, detalhe: l.Detalhe || null, origem: l.Origem, abertaEm: l.AbertaEm,
    outra: l.Outro && noEscopoDaPessoa(usuario, l.OutroCong, l.OutroExt) ? { matricula: l.Outro, nome: l.OutroNome } : l.Outro ? { foraDoEscopo: true } : null }));
}
// A ficha tem pendência que BLOQUEIA a carteirinha física (REPETIDA ou NUMERO, aberta)? Decisão dele: nunca sai carteirinha física com o número de duas pessoas.
async function bloqueiaImpressaoFisica(rq, membroId) {
  const r = await rq().input("id", sql.Int, membroId).query(`
    SELECT COUNT(*) AS n FROM FichasPendencias WHERE Situacao = N'ABERTA' AND Tipo IN (N'REPETIDA', N'NUMERO') AND (MembroId = @id OR OutroMembroId = @id)`);
  return Number(r.recordset[0].n) > 0;
}
// "Número conferido" (NUMERO) — quem tem a ficha no escopo dá por resolvida, com uma nota. A REPETIDA se resolve juntando ou com "não são a mesma pessoa"; a
// ARROLAMENTO, completando o arrolamento.
async function resolverNumero(pool, usuario, { pendenciaId, nota }) {
  const id = auth.idDeRota(pendenciaId);
  if (!id) return { sucesso: false, status: 400, mensagem: "Informe a pendência." };
  const txt = typeof nota === "string" ? nota.replace(/\s+/g, " ").trim() : "";
  if (txt.length < 3 || txt.length > 300 || /[<>]/.test(txt)) return { sucesso: false, status: 400, mensagem: "Escreva o que foi conferido (de 3 a 300 letras)." };
  const r = await pool.request().input("id", sql.Int, id).query(`
    SELECT p.MembroId, p.Tipo, p.Situacao, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome FROM FichasPendencias p JOIN MembroReferencia m ON m.MembroId = p.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE p.PendenciaId = @id`);
  const l = r.recordset[0];
  if (!l || !noEscopoDaPessoa(usuario, l.CongregacaoNome, l.ExtensaoNome)) return { sucesso: false, status: 404, mensagem: "Pendência não encontrada." };
  if (l.Tipo !== "NUMERO") return { sucesso: false, status: 422, mensagem: l.Tipo === "REPETIDA" ? "A ficha repetida se resolve juntando as fichas ou dizendo que não são a mesma pessoa." : "O arrolamento se resolve completando o arrolamento na ficha." };
  if (l.MembroId === Number(usuario.membroId)) return { sucesso: false, status: 403, mensagem: "Ninguém confere a própria ficha: peça a outra pessoa da Secretaria." };
  const u = await pool.request().input("id", sql.Int, id).input("por", sql.Int, usuario.membroId).input("nota", sql.NVarChar(300), txt).query(`
    UPDATE FichasPendencias SET Situacao = N'RESOLVIDA', Resolucao = N'CORRIGIDA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por, Nota = @nota
    WHERE PendenciaId = @id AND Situacao = N'ABERTA'`);
  if (!u.rowsAffected[0]) return { sucesso: false, status: 409, mensagem: "Esta pendência já foi resolvida." };
  await require("./auditoria").registrarAuditoria({ tabela: "FichasPendencias", registroId: id, acao: "Conferiu o número da ficha", usuarioId: usuario.membroId, dadosDepois: { membroId: l.MembroId } });
  return { sucesso: true, status: 200, mensagem: "Pendência resolvida: o número foi conferido." };
}

// O alerta da assembleia geral (e da votação geral): quantos cadastros repetidos ou com número a acertar estão abertos no campo inteiro, quantas fichas
// parecem repetidas (mesmo nome e nascimento, sem decisão) e quantas ainda esperam o arrolamento (não votam). Sem nome de ninguém.
async function contarPendenciasGerais(rq) {
  const r = await rq().query(`
    SELECT
      (SELECT COUNT(*) FROM FichasPendencias WHERE Situacao = N'ABERTA' AND Tipo = N'REPETIDA') AS repetidas,
      (SELECT COUNT(*) FROM FichasPendencias WHERE Situacao = N'ABERTA' AND Tipo = N'NUMERO') AS numero,
      (SELECT COUNT(*) FROM FichasPendencias WHERE Situacao = N'ABERTA' AND Tipo = N'ARROLAMENTO') AS arrolamento,
      (SELECT COUNT(*) FROM (
         SELECT a.MembroId FROM MembroReferencia a JOIN MembroReferencia b ON a.MembroId < b.MembroId AND a.DataNascimento = b.DataNascimento
           AND LTRIM(RTRIM(a.Nome)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(b.Nome)) COLLATE Latin1_General_CI_AI
         WHERE ISNULL(a.Status, N'ATIVO') NOT IN (N'DESLIGADO', N'FALECIDO') AND ISNULL(b.Status, N'ATIVO') NOT IN (N'DESLIGADO', N'FALECIDO')
           AND NOT EXISTS (SELECT 1 FROM FichasPendencias n WHERE n.Tipo = N'REPETIDA' AND (n.Situacao = N'ABERTA' OR n.Resolucao = N'NAO_E_A_MESMA')
                           AND ((n.MembroId = a.MembroId AND n.OutroMembroId = b.MembroId) OR (n.MembroId = b.MembroId AND n.OutroMembroId = a.MembroId)))) x) AS possiveis`);
  const l = r.recordset[0];
  return { repetidas: Number(l.repetidas), numero: Number(l.numero), arrolamento: Number(l.arrolamento), possiveis: Number(l.possiveis) };
}
// A mensagem do alerta e se ele precisa da confirmação da Geral (há repetida, número a acertar ou possível repetida).
function textoDoAlerta(c) {
  const partes = [];
  if (c.repetidas) partes.push(`${c.repetidas} ${c.repetidas === 1 ? "ficha marcada como repetida" : "fichas marcadas como repetidas"}`);
  if (c.possiveis) partes.push(`${c.possiveis} ${c.possiveis === 1 ? "dupla de fichas com o mesmo nome e nascimento" : "duplas de fichas com o mesmo nome e nascimento"} sem conferir`);
  if (c.numero) partes.push(`${c.numero} ${c.numero === 1 ? "ficha com o número a acertar" : "fichas com o número a acertar"}`);
  const precisa = partes.length > 0;
  const arrol = c.arrolamento ? ` Além disso, ${c.arrolamento} ${c.arrolamento === 1 ? "pessoa ainda espera" : "pessoas ainda esperam"} o arrolamento (a situação e a entrada a completar).` : "";
  return { precisaConfirmar: precisa, mensagem: precisa ? `Há cadastros a acertar antes da assembleia: ${partes.join(", ")}. A mesma pessoa pode estar com duas fichas (e votar duas vezes).${arrol} Confirme para continuar mesmo assim.` : arrol.trim() || null };
}

// ================================================================ as junções feitas (para conferir) e a purga dos arquivos vencidos
async function listarJuncoes(pool, usuario, { limite = 50 } = {}) {
  await purgarVencidas(pool);
  const r = await pool.request().input("lim", sql.Int, Math.max(1, Math.min(200, limite))).query(`
    SELECT TOP (@lim) j.JuncaoId, j.MatriculaFica, j.MatriculaSai, CONVERT(varchar(33), j.JuntadaEm, 126) AS JuntadaEm, j.JuntadaPor, u.Nome AS JuntadaPorNome, j.Escopo,
           j.Situacao, CONVERT(varchar(33), j.DesfeitaEm, 126) AS DesfeitaEm, j.Resumo, CASE WHEN j.FichaSai IS NULL THEN 0 ELSE 1 END AS TemArquivo,
           m.Nome AS NomeFica, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
    FROM JuncoesFichas j LEFT JOIN MembroReferencia m ON m.MembroId = j.MatriculaFica
    LEFT JOIN MembroReferencia u ON u.MembroId = j.JuntadaPor AND u.CriadoEm <= j.JuntadaEm
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    ORDER BY j.JuncaoId DESC`);
  const geral = ehGeral(usuario);
  return r.recordset.filter((l) => l.NomeFica && noEscopoDaPessoa(usuario, l.CongregacaoNome, l.ExtensaoNome)).map((l) => {
    let resumo = {};
    try { resumo = JSON.parse(l.Resumo || "{}") || {}; } catch (_) { resumo = {}; }
    const movidas = (resumo.movidas || []).reduce((s, x) => s + Number(x.n || 0), 0);
    return { juncaoId: l.JuncaoId, fica: l.MatriculaFica, sai: l.MatriculaSai, nome: l.NomeFica, congregacao: l.CongregacaoNome || null, juntadaEm: l.JuntadaEm,
      juntadaPor: l.JuntadaPorNome || null, escopo: l.Escopo, situacao: l.Situacao, desfeitaEm: l.DesfeitaEm || null, registrosMovidos: movidas,
      previa: R.previaParaTela((resumo.movidas || []).map((x) => ({ t: x.t, n: Number(x.n || 0) }))),
      podeDesfazer: geral && l.Situacao === "FEITA" && !!l.TemArquivo && Date.now() - new Date(l.JuntadaEm).getTime() <= DIAS_DESFAZER * 86400000 };
  });
}
// Passados 30 dias, a ficha que saiu e as linhas arquivadas saem do registro (fica só o resumo, sem dado pessoal). Roda ao listar e ao juntar.
async function purgarVencidas(pool) {
  try {
    await pool.request().input("dias", sql.Int, DIAS_DESFAZER).query(`
      DELETE a FROM JuncoesFichasArquivo a JOIN JuncoesFichas j ON j.JuncaoId = a.JuncaoId WHERE j.JuntadaEm < DATEADD(day, -@dias, SYSUTCDATETIME());
      UPDATE JuncoesFichas SET FichaSai = NULL, FichaFicaAntes = NULL, Movimentos = NULL, ArquivoApagadoEm = SYSUTCDATETIME()
      WHERE ArquivoApagadoEm IS NULL AND JuntadaEm < DATEADD(day, -@dias, SYSUTCDATETIME()) AND (FichaSai IS NOT NULL OR Movimentos IS NOT NULL);`);
  } catch (e) { console.error("[juntarFichas] purga dos arquivos vencidos falhou:", e.message); }
}
// A exclusão LGPD de uma pessoa apaga também o que a junção guardou da ficha que entrou nela (a ficha que saiu e as linhas arquivadas). Dentro da transação.
async function apagarArquivosDaPessoa(rq, membroId) {
  await rq().input("m", sql.Int, membroId).query(`
    DELETE a FROM JuncoesFichasArquivo a JOIN JuncoesFichas j ON j.JuncaoId = a.JuncaoId WHERE j.MatriculaFica = @m;
    UPDATE JuncoesFichas SET FichaSai = NULL, FichaFicaAntes = NULL, FichaFicaDepois = NULL, Movimentos = NULL, ArquivoApagadoEm = SYSUTCDATETIME() WHERE MatriculaFica = @m;`);
}

module.exports = { lerMapa, avaliar, comparar, juntar, desfazer, listarCandidatos, decidirDupla, pendenciasDaFicha, bloqueiaImpressaoFisica, resolverNumero,
  contarPendenciasGerais, textoDoAlerta, listarJuncoes, purgarVencidas, apagarArquivosDaPessoa, DIAS_DESFAZER };
