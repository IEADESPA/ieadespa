// shared/carteirinhaDb.js (FASE 10, v10.1b passo 8, 19/11/2026) — AS CARTEIRINHAS no banco. A regra pura está em shared/carteirinha.js; a migração é a 180.
//  - os MODELOS da física (só a Secretaria Geral cria e muda; um ativo por público; gravar confere a versão para não pisar no que outro salvou);
//  - o QR FIXO de cada pessoa (nasce na primeira vez que a carteirinha é vista ou impressa; nunca muda);
//  - a LISTA PARA IMPRIMIR de uma congregação (quem entrou, mudou de tipo ou pediu segunda via; quem tem pendência REPETIDA ou NUMERO aparece bloqueado);
//  - o REGISTRO da impressão (a tela imprime direto na impressora; nenhum arquivo fica guardado) e os pedidos de segunda via;
//  - a carteirinha DIGITAL da própria pessoa e a CONFERÊNCIA pública do QR.
// A situação de membro e as marcas da disciplina vêm do mesmo lugar da credencial da v8.4 (shared/habilitacao.js, shared/credencial.js) — não há outra regra.
const { sql } = require("./db");
const regra = require("./carteirinha");
const certificados = require("./certificados");
const { MARCAS_DISCIPLINA, STATUS_MATRICULA } = require("./habilitacao");
const { CARGOS_OFICIAIS } = require("./afm");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");

const NO_ROL = `ISNULL(m.Status, N'ATIVO') IN (N'ATIVO', N'LICENÇA', N'LICENCA_CANDIDATURA')`;
const LISTA_CARGOS = CARGOS_OFICIAIS.map((c) => `N'${c}'`).join(", ");   // constantes do código, não entrada de ninguém
// o tipo da pessoa no banco (o mesmo de regra.tipoDaPessoa)
const TIPO_SQL = `CASE WHEN m.SituacaoMembro = N'CONGREGADO' THEN N'CONGREGADO'
  WHEN m.CargoMinisterial IN (${LISTA_CARGOS}) AND m.SituacaoMembro = N'EM_COMUNHAO' THEN N'OBREIRO' ELSE N'MEMBRO' END`;
// a pendência que trava a física (a ficha é a da pendência ou a outra ficha dela) — a mesma conta de juntarFichasDb.bloqueiaImpressaoFisica
// (o CONCAT com a coluna de fora fica numa subconsulta: o SQL Server não deixa agregar uma expressão que mistura a coluna de fora com as de dentro)
const PENDENCIAS_SQL = `(SELECT STRING_AGG(pp.T, N',') FROM (SELECT CONCAT(p.Tipo, N':', CASE WHEN p.MembroId = m.MembroId THEN p.OutroMembroId ELSE p.MembroId END) AS T
  FROM FichasPendencias p WHERE p.Situacao = N'ABERTA' AND p.Tipo IN (N'REPETIDA', N'NUMERO') AND (p.MembroId = m.MembroId OR p.OutroMembroId = m.MembroId)) pp)`;

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
// a versão (rowversion) vai e volta como texto hexadecimal, lido do próprio banco (o driver pode entregar o binário de jeitos diferentes)
const VERSAO_SQL = "LOWER(CONVERT(VARCHAR(16), CAST(Versao AS BINARY(8)), 2)) AS VersaoHex";
const dia = (v) => (v == null ? null : new Date(v).toISOString().slice(0, 10));

const urlConferencia = (codigo) => certificados.urlVerificacao(codigo).replace("/verificar.html?c=", "/conferir.html?c=");

// ---------------------------------------------------------------- os modelos
async function garantirPadroes(pool) {
  const ha = (await pool.request().query(`SELECT COUNT(*) AS n FROM CarteirinhaModelos`)).recordset[0].n;
  if (Number(ha) > 0) return;
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    if (!(await obterTrava(() => new sql.Request(t), "carteirinha_modelos"))) { await t.rollback(); return; }
    const de_novo = (await new sql.Request(t).query(`SELECT COUNT(*) AS n FROM CarteirinhaModelos`)).recordset[0].n;
    if (Number(de_novo) === 0) {
      for (const publico of ["MEMBRO", "CONGREGADO", "OBREIRO"]) {
        await new sql.Request(t).input("n", sql.NVarChar(60), regra.NOMES_PADRAO[publico]).input("p", sql.NVarChar(12), publico)
          .input("d", sql.NVarChar(sql.MAX), JSON.stringify(regra.desenhoPadrao(publico)))
          .query(`INSERT INTO CarteirinhaModelos (Nome, Publico, Desenho, Ativo) VALUES (@n, @p, @d, 1)`);
      }
    }
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }
}

function mapearModelo(l, urlArte) {
  let desenho = null;
  try { desenho = JSON.parse(l.Desenho); } catch (e) { desenho = null; }
  const assinar = (u) => { try { return u && urlArte ? urlArte(u) : null; } catch (e) { return null; } };
  return {
    modeloId: Number(l.ModeloId), nome: l.Nome, publico: l.Publico, ativo: !!l.Ativo, desenho,
    arteFrente: assinar(l.ArteFrente), arteVerso: assinar(l.ArteVerso), versao: l.VersaoHex || null, atualizadoEm: l.AtualizadoEm || l.CriadoEm
  };
}

// Os modelos e quantas pessoas do rol cada modelo ativo cobre (a Igreja toda: o modelo é um só para todos).
async function listarModelos(pool, urlArte) {
  await garantirPadroes(pool);
  const r = await pool.request().query(`
    SELECT ModeloId, Nome, Publico, Desenho, ArteFrente, ArteVerso, Ativo, CriadoEm, AtualizadoEm, ${VERSAO_SQL} FROM CarteirinhaModelos
    ORDER BY Ativo DESC, CASE Publico WHEN N'MEMBRO' THEN 1 WHEN N'CONGREGADO' THEN 2 WHEN N'OBREIRO' THEN 3 ELSE 4 END, Nome;
    SELECT t.Tipo, COUNT(*) AS n FROM (SELECT ${TIPO_SQL} AS Tipo FROM MembroReferencia m WHERE ${NO_ROL} AND ISNULL(m.SituacaoMembro, N'') <> N'SEM_COMUNHAO') t GROUP BY t.Tipo;`);
  const porTipo = new Map(r.recordsets[1].map((l) => [l.Tipo, Number(l.n)]));
  return r.recordsets[0].map((l) => {
    const m = mapearModelo(l, urlArte);
    m.usadoPor = m.ativo && m.publico !== "OUTRO" ? porTipo.get(m.publico) || 0 : 0;
    return m;
  });
}

async function lerModelo(conexao, modeloId) {
  const r = await new sql.Request(conexao).input("id", sql.Int, Number(modeloId))
    .query(`SELECT ModeloId, Nome, Publico, Desenho, ArteFrente, ArteVerso, Ativo, CriadoEm, AtualizadoEm, ${VERSAO_SQL} FROM CarteirinhaModelos WHERE ModeloId = @id`);
  return r.recordset[0] || null;
}

// O modelo novo: de público MEMBRO/CONGREGADO/OBREIRO nasce ativo só se o público ainda não tem um (senão fica guardado até "usar este modelo").
async function criarModelo(pool, { nome, publico, desenho, por }) {
  if (!regra.PUBLICOS.includes(publico)) return { sucesso: false, mensagem: "Escolha para quem é o modelo." };
  const n = regra.validarNome(nome);
  if (!n.ok) return { sucesso: false, mensagem: n.mensagem };
  const d = regra.validarDesenho(desenho == null ? regra.desenhoPadrao(publico) : desenho);
  if (!d.ok) return { sucesso: false, mensagem: d.mensagem };
  const r = await pool.request().input("n", sql.NVarChar(60), n.nome).input("p", sql.NVarChar(12), publico).input("d", sql.NVarChar(sql.MAX), JSON.stringify(d.desenho))
    .input("por", sql.Int, por)
    .query(`INSERT INTO CarteirinhaModelos (Nome, Publico, Desenho, Ativo, CriadoPor)
            OUTPUT INSERTED.ModeloId, INSERTED.Ativo
            SELECT @n, @p, @d, CASE WHEN @p = N'OUTRO' OR NOT EXISTS (SELECT 1 FROM CarteirinhaModelos WITH (UPDLOCK, HOLDLOCK) WHERE Publico = @p AND Ativo = 1) THEN 1 ELSE 0 END, @por`);
  const novo = r.recordset[0];
  await registrarAuditoria({ tabela: "CarteirinhaModelos", registroId: novo.ModeloId, acao: "CARTEIRINHA_MODELO_CRIADO", usuarioId: por, dadosDepois: { nome: n.nome, publico } });
  return { sucesso: true, modeloId: Number(novo.ModeloId), ativo: !!novo.Ativo,
    mensagem: novo.Ativo ? "Modelo criado." : `Modelo criado e guardado: o de ${regra.ROTULO_PUBLICO[publico].toLowerCase()} continua o atual até você escolher "Usar este modelo".` };
}

// Salvar o que o editor mudou. `versao`: a que a tela leu — se outra pessoa salvou no meio, 409 (nada é gravado por cima).
async function salvarModelo(pool, { modeloId, nome, desenho, versao, por }) {
  const n = regra.validarNome(nome);
  if (!n.ok) return { sucesso: false, mensagem: n.mensagem };
  const d = regra.validarDesenho(desenho);
  if (!d.ok) return { sucesso: false, mensagem: d.mensagem };
  if (typeof versao !== "string" || !/^[0-9a-f]{16}$/.test(versao)) return MUDOU("Abra o modelo de novo: a versão que a tela tem não confere.");
  const r = await pool.request().input("id", sql.Int, Number(modeloId)).input("n", sql.NVarChar(60), n.nome).input("d", sql.NVarChar(sql.MAX), JSON.stringify(d.desenho))
    .input("v", sql.VarChar(16), versao).input("por", sql.Int, por)
    .query(`UPDATE CarteirinhaModelos SET Nome = @n, Desenho = @d, AtualizadoEm = SYSUTCDATETIME(), AtualizadoPor = @por
            OUTPUT LOWER(CONVERT(VARCHAR(16), CAST(INSERTED.Versao AS BINARY(8)), 2)) AS VersaoHex WHERE ModeloId = @id AND LOWER(CONVERT(VARCHAR(16), CAST(Versao AS BINARY(8)), 2)) = @v`);
  if (!r.recordset[0]) {
    return (await lerModelo(pool, modeloId)) ? MUDOU("Outra pessoa salvou este modelo enquanto você editava. Abra de novo para ver o que mudou.") : NAO_EXISTE;
  }
  await registrarAuditoria({ tabela: "CarteirinhaModelos", registroId: Number(modeloId), acao: "CARTEIRINHA_MODELO_SALVO", usuarioId: por, dadosDepois: { nome: n.nome } });
  return { sucesso: true, versao: r.recordset[0].VersaoHex, mensagem: "Modelo salvo. As próximas carteirinhas já saem assim." };
}

// "Usar este modelo": vira o atual do público dele (o anterior fica guardado).
async function ativarModelo(pool, { modeloId, por }) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    if (!(await obterTrava(() => new sql.Request(t), "carteirinha_modelos"))) { await t.rollback(); return MUDOU("Outra mudança nos modelos está em andamento. Tente de novo."); }
    const m = await lerModelo(t, modeloId);
    if (!m) { await t.rollback(); return NAO_EXISTE; }
    if (m.Publico !== "OUTRO") {
      await new sql.Request(t).input("p", sql.NVarChar(12), m.Publico).input("id", sql.Int, Number(modeloId))
        .query(`UPDATE CarteirinhaModelos SET Ativo = 0 WHERE Publico = @p AND Ativo = 1 AND ModeloId <> @id`);
    }
    await new sql.Request(t).input("id", sql.Int, Number(modeloId)).input("por", sql.Int, por)
      .query(`UPDATE CarteirinhaModelos SET Ativo = 1, AtualizadoEm = SYSUTCDATETIME(), AtualizadoPor = @por WHERE ModeloId = @id`);
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({ tabela: "CarteirinhaModelos", registroId: Number(modeloId), acao: "CARTEIRINHA_MODELO_ATIVADO", usuarioId: por });
  return { sucesso: true, mensagem: "Pronto: as próximas carteirinhas saem com este modelo." };
}

// A arte de fundo de um lado (o arquivo já foi guardado no armazenamento por quem chama, como veio — nada é reaberto nem recomprimido).
async function guardarArte(pool, { modeloId, lado, url, por }) {
  const col = lado === "verso" ? "ArteVerso" : "ArteFrente";
  const r = await pool.request().input("id", sql.Int, Number(modeloId)).input("u", sql.NVarChar(400), url).input("por", sql.Int, por)
    .query(`UPDATE CarteirinhaModelos SET ${col} = @u, AtualizadoEm = SYSUTCDATETIME(), AtualizadoPor = @por OUTPUT DELETED.${col} AS Antes WHERE ModeloId = @id`);
  if (!r.recordset[0]) return NAO_EXISTE;
  await registrarAuditoria({ tabela: "CarteirinhaModelos", registroId: Number(modeloId), acao: "CARTEIRINHA_ARTE_TROCADA", usuarioId: por, dadosDepois: { lado } });
  return { sucesso: true, antes: r.recordset[0].Antes || null };
}

// ---------------------------------------------------------------- o QR fixo
async function codigoQr(conexao, membroId) {
  const ler = async () => (await new sql.Request(conexao).input("m", sql.Int, Number(membroId)).query(`SELECT Codigo FROM CarteirinhasQr WHERE MembroId = @m`)).recordset[0];
  const ja = await ler();
  if (ja) return ja.Codigo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await new sql.Request(conexao).input("m", sql.Int, Number(membroId)).input("c", sql.NVarChar(20), certificados.gerarCodigoVerificacao())
        .query(`INSERT INTO CarteirinhasQr (MembroId, Codigo) SELECT @m, @c WHERE NOT EXISTS (SELECT 1 FROM CarteirinhasQr WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m)`);
    } catch (e) {
      if (!violouUnicidade(e) || tentativa === 3) throw e;   // o mesmo código sorteado para outra pessoa (astronômico) ou duas leituras ao mesmo tempo
    }
    const agora = await ler();
    if (agora) return agora.Codigo;
  }
  throw new Error("não foi possível gerar o QR da carteirinha");
}

// ---------------------------------------------------------------- a pessoa (para o cartão, a digital e a conferência)
const SELECT_PESSOA = `
  SELECT m.MembroId, m.Nome, m.Status, m.SituacaoMembro, m.CargoMinisterial, m.Funcao, m.FotoUrl, m.DataNascimento, m.DataAdmissao, m.NomeMae, m.NomePai,
         m.CongregacaoId, cg.Nome AS Congregacao, ar.Nome AS Area, ex.Nome AS Extensao, ${TIPO_SQL} AS Tipo, ${PENDENCIAS_SQL} AS Pendencias,
         ${STATUS_MATRICULA},
         ${MARCAS_DISCIPLINA}
  FROM MembroReferencia m
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN Areas ar ON ar.AreaId = cg.AreaId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId`;
function mapearPessoa(l) {
  return {
    membroId: Number(l.MembroId), nome: l.Nome, status: l.Status || "ATIVO", situacaoMembro: l.SituacaoMembro, cargo: l.CargoMinisterial || null, funcao: l.Funcao || null,
    fotoUrl: l.FotoUrl || null, dataNascimento: dia(l.DataNascimento), dataAdmissao: dia(l.DataAdmissao), mae: l.NomeMae || null, pai: l.NomePai || null,
    congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId), congregacao: l.Congregacao || null, area: l.Area || null, extensao: l.Extensao || null,
    tipo: l.Tipo, pendencias: lerPendencias(l.Pendencias), statusMatricula: l.StatusMatricula || null,
    sobDisciplina: !!l.Afastado, excluido: !!l.Excluido, foraDaComunhao: !!l.ForaDaComunhao
  };
}
function lerPendencias(texto) {
  if (!texto) return [];
  return String(texto).split(",").map((x) => { const [tipo, outro] = x.split(":"); return { tipo, outro: outro ? Number(outro) || null : null }; });
}
async function pessoa(conexao, membroId) {
  const r = await new sql.Request(conexao).input("m", sql.Int, Number(membroId)).query(`${SELECT_PESSOA} WHERE m.MembroId = @m`);
  if (!r.recordset[0]) return null;
  const p = mapearPessoa(r.recordset[0]);
  p.educacao = (await require("./educacaoContinuadaDb").situacoes(conexao, [p.membroId])).get(p.membroId) || null;   // a mesma leitura da credencial (v8.6)
  return p;
}

// O texto que explica por que a pessoa está na lista (ou bloqueada)
function detalheDaFila(p, motivo, ultima, pedido) {
  if (p.pendencias.length) {
    const rep = p.pendencias.find((x) => x.tipo === "REPETIDA");
    if (rep) return rep.outro ? `duas fichas a juntar (${p.membroId} e ${rep.outro})` : "ficha repetida a conferir";
    return "número de matrícula a acertar";
  }
  if (motivo === "SEGUNDA_VIA") return `segunda via (${pedido})`;
  if (motivo === "MUDOU") return p.tipo === "OBREIRO" && p.cargo ? `mudou · agora ${require("./escada").ROTULO_CARGO[p.cargo] || "obreiro"}` : `mudou · agora ${regra.ROTULO_PUBLICO[p.tipo].toLowerCase()}`;
  if (ultima) return "nova";
  return p.dataAdmissao ? `nova · entrou em ${p.dataAdmissao.split("-").reverse().join("/")}` : "nova";
}

// A lista para imprimir de UMA congregação. `condEscopo`: a condição de escopo da pessoa (escopoRotas.condicaoSqlEscopoPessoa; null = tudo). `podeObreiro`: só a
// Secretaria Geral imprime a carteirinha de obreiro (Regimento, Art. 76 §2º) — para os outros, a linha vem marcada "soGeral".
async function filaParaImprimir(pool, { congregacaoId, condEscopo, pedido, podeObreiro }) {
  const req = pedido || pool.request();
  req.input("cong", sql.Int, Number(congregacaoId));
  const r = await req.query(`
    SELECT x.*, ui.Publico AS UltimoPublico, ui.ImpressaEm AS UltimaEm, pd.Motivo AS PedidoMotivo FROM (
      ${SELECT_PESSOA} WHERE m.CongregacaoId = @cong AND ${NO_ROL}${condEscopo ? ` AND ${condEscopo}` : ""}
    ) x
    OUTER APPLY (SELECT TOP 1 i.Publico, i.ImpressaEm FROM CarteirinhasImpressas i WHERE i.MembroId = x.MembroId ORDER BY i.ImpressaEm DESC, i.ImpressaoId DESC) ui
    LEFT JOIN CarteirinhasPedidos pd ON pd.MembroId = x.MembroId AND pd.AtendidoEm IS NULL
    ORDER BY x.Nome, x.MembroId`);
  const itens = [];
  for (const l of r.recordset) {
    const p = mapearPessoa(l);
    const pode = regra.podeImprimir(p);
    if (!pode.pode) continue;
    const ultima = l.UltimoPublico ? { publico: l.UltimoPublico, em: l.UltimaEm } : null;
    const motivo = regra.motivoParaImprimir(p.tipo, ultima, l.PedidoMotivo);
    if (!motivo) continue;
    itens.push({
      membroId: p.membroId, nome: p.nome, tipo: p.tipo, motivo, detalhe: detalheDaFila(p, motivo, ultima, l.PedidoMotivo),
      bloqueada: p.pendencias.length > 0, soGeral: p.tipo === "OBREIRO" && !podeObreiro
    });
  }
  // as bloqueadas no fim, como no desenho
  itens.sort((a, b) => Number(a.bloqueada) - Number(b.bloqueada));
  return itens;
}

// O resumo por congregação (a tabela da Geral e da área): quantas prontas e quantas bloqueadas. `condEscopo` como acima.
async function resumoPorCongregacao(pool, { condEscopo, pedido }) {
  const req = pedido || pool.request();
  const r = await req.query(`
    WITH base AS (
      SELECT m.MembroId, m.CongregacaoId, ${TIPO_SQL} AS Tipo, ${PENDENCIAS_SQL} AS Pendencias,
             ui.Publico AS UltimoPublico, pd.PedidoId
      FROM MembroReferencia m
      LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
      OUTER APPLY (SELECT TOP 1 i.Publico FROM CarteirinhasImpressas i WHERE i.MembroId = m.MembroId ORDER BY i.ImpressaEm DESC, i.ImpressaoId DESC) ui
      LEFT JOIN CarteirinhasPedidos pd ON pd.MembroId = m.MembroId AND pd.AtendidoEm IS NULL
      WHERE ${NO_ROL} AND m.CongregacaoId IS NOT NULL AND ISNULL(m.SituacaoMembro, N'') <> N'SEM_COMUNHAO'${condEscopo ? ` AND ${condEscopo}` : ""}
    )
    SELECT c.CongregacaoId, c.Nome AS Congregacao, ar.Nome AS Area,
           SUM(CASE WHEN b.Pendencias IS NULL AND (b.PedidoId IS NOT NULL OR b.UltimoPublico IS NULL OR b.UltimoPublico <> b.Tipo) THEN 1 ELSE 0 END) AS Prontas,
           SUM(CASE WHEN b.Pendencias IS NOT NULL THEN 1 ELSE 0 END) AS Bloqueadas,
           SUM(CASE WHEN b.Pendencias LIKE N'%REPETIDA%' THEN 1 ELSE 0 END) AS Repetidas,
           SUM(CASE WHEN b.Pendencias LIKE N'%NUMERO%' AND b.Pendencias NOT LIKE N'%REPETIDA%' THEN 1 ELSE 0 END) AS Numeros
    FROM base b JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId LEFT JOIN Areas ar ON ar.AreaId = c.AreaId
    GROUP BY c.CongregacaoId, c.Nome, ar.Nome
    ORDER BY SUM(CASE WHEN b.Pendencias IS NOT NULL THEN 1 ELSE 0 END) DESC, c.Nome`);
  const linhas = r.recordset.map((l) => ({ congregacaoId: Number(l.CongregacaoId), congregacao: l.Congregacao, area: l.Area || null,
    prontas: Number(l.Prontas) || 0, bloqueadas: Number(l.Bloqueadas) || 0, repetidas: Number(l.Repetidas) || 0, numeros: Number(l.Numeros) || 0 }));
  const soma = (k) => linhas.reduce((s, x) => s + x[k], 0);
  return { congregacoes: linhas, prontas: soma("prontas"), bloqueadas: soma("bloqueadas"), repetidas: soma("repetidas"), numeros: soma("numeros") };
}

// ---------------------------------------------------------------- imprimir
// Confere cada pessoa de novo (escopo, rol, pendência, obreiro), registra a impressão e atende o pedido de segunda via, numa transação; devolve o que a tela
// precisa para desenhar os cartões (o modelo de cada um, o QR e o endereço assinado da foto). `alcanca(p)`: a pessoa está no escopo de quem imprime?
async function imprimir(pool, { membroIds, material, frenteVerso, por, podeObreiro, alcanca, urlFoto, urlArte, svgDoQr }) {
  if (!regra.MATERIAIS.includes(material)) return { sucesso: false, mensagem: "Escolha papel ou PVC." };
  const ids = [...new Set((Array.isArray(membroIds) ? membroIds : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { sucesso: false, mensagem: "Marque quem vai imprimir." };
  if (ids.length > 60) return { sucesso: false, mensagem: "No máximo 60 carteirinhas por vez." };
  const modelos = new Map((await listarModelos(pool, urlArte)).filter((m) => m.ativo && m.publico !== "OUTRO").map((m) => [m.publico, m]));
  const recusadas = [];
  const cartoes = [];
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    for (const id of ids) {
      if (!(await obterTrava(() => new sql.Request(t), `carteirinha_${id}`))) { recusadas.push({ membroId: id, mensagem: "Outra impressão desta pessoa está em andamento." }); continue; }
      const p = await pessoa(t, id);
      if (!p || !alcanca(p)) { recusadas.push({ membroId: id, mensagem: "Matrícula não encontrada." }); continue; }
      const pode = regra.podeImprimir(p);
      if (!pode.pode) { recusadas.push({ membroId: id, nome: p.nome, mensagem: pode.mensagem }); continue; }
      if (p.pendencias.length) { recusadas.push({ membroId: id, nome: p.nome, mensagem: "Pendência de cadastro (ficha repetida ou número a acertar): resolva antes de imprimir." }); continue; }
      if (p.tipo === "OBREIRO" && !podeObreiro) { recusadas.push({ membroId: id, nome: p.nome, mensagem: "A carteirinha de obreiro é impressa pela Secretaria Geral (Regimento, Art. 76 §2º)." }); continue; }
      const modelo = modelos.get(p.tipo);
      if (!modelo) { recusadas.push({ membroId: id, nome: p.nome, mensagem: "Não há modelo para este tipo de pessoa." }); continue; }
      const ult = (await new sql.Request(t).input("m", sql.Int, id)
        .query(`SELECT TOP 1 Publico FROM CarteirinhasImpressas WHERE MembroId = @m ORDER BY ImpressaEm DESC, ImpressaoId DESC;
                SELECT PedidoId, Motivo FROM CarteirinhasPedidos WHERE MembroId = @m AND AtendidoEm IS NULL;`));
      const ultima = ult.recordsets[0][0] ? { publico: ult.recordsets[0][0].Publico } : null;
      const ped = ult.recordsets[1][0] || null;
      const motivo = regra.motivoParaImprimir(p.tipo, ultima, ped && ped.Motivo) || "REIMPRESSAO";
      const codigo = await codigoQr(t, id);
      const ins = await new sql.Request(t).input("m", sql.Int, id).input("mod", sql.Int, modelo.modeloId).input("pub", sql.NVarChar(12), p.tipo)
        .input("mat", sql.NVarChar(5), material).input("fv", sql.Bit, frenteVerso ? 1 : 0).input("mot", sql.NVarChar(12), motivo)
        .input("cong", sql.Int, p.congregacaoId).input("por", sql.Int, por)
        .query(`INSERT INTO CarteirinhasImpressas (MembroId, ModeloId, Publico, Material, FrenteVerso, Motivo, CongregacaoId, ImpressaPor)
                OUTPUT INSERTED.ImpressaoId VALUES (@m, @mod, @pub, @mat, @fv, @mot, @cong, @por)`);
      const impressaoId = ins.recordset[0].ImpressaoId;
      if (ped) {
        await new sql.Request(t).input("p", sql.Int, ped.PedidoId).input("i", sql.Int, impressaoId)
          .query(`UPDATE CarteirinhasPedidos SET AtendidoEm = SYSUTCDATETIME(), ImpressaoId = @i WHERE PedidoId = @p AND AtendidoEm IS NULL`);
      }
      let foto = null;
      try { foto = p.fotoUrl && urlFoto ? urlFoto(p.fotoUrl) : null; } catch (e) { foto = null; }
      cartoes.push({
        membroId: id, nome: p.nome, nascimento: p.dataNascimento, matricula: id, mae: p.mae, pai: p.pai, tipo: p.tipo, tipoRotulo: regra.ROTULO_PUBLICO[p.tipo],
        modeloId: modelo.modeloId, foto, qrSvg: svgDoQr(urlConferencia(codigo))
      });
    }
    await t.commit();
  } catch (e) {
    try { await t.rollback(); } catch (x) { /* já encerrada */ }
    throw e;
  }
  if (cartoes.length) {
    await registrarAuditoria({ tabela: "CarteirinhasImpressas", registroId: 0, acao: "CARTEIRINHAS_IMPRESSAS", usuarioId: por,
      dadosDepois: { quantas: cartoes.length, material, frenteVerso: !!frenteVerso, matriculas: cartoes.map((c) => c.membroId) } });
  }
  const usados = [...new Set(cartoes.map((c) => c.modeloId))];
  return {
    sucesso: cartoes.length > 0, cartoes, recusadas, material, frenteVerso: !!frenteVerso,
    modelos: [...modelos.values()].filter((m) => usados.includes(m.modeloId)),
    mensagem: cartoes.length ? `${cartoes.length} carteirinha(s) prontas para a impressora.` : (recusadas[0] && recusadas[0].mensagem) || "Nada para imprimir."
  };
}

// Pedido de segunda via (perdeu, estragou): entra na lista da congregação. Pedir de novo não duplica.
async function pedirSegundaVia(pool, { membroId, motivo, por }) {
  const m = String(motivo == null ? "" : motivo).replace(/[\u0000-\u001F\u007F<>]+/g, " ").replace(/\s+/g, " ").trim();
  if (m.length < 3 || m.length > 120) return { sucesso: false, mensagem: "Diga o motivo (de 3 a 120 letras): perdeu, estragou..." };
  try {
    const r = await pool.request().input("m", sql.Int, Number(membroId)).input("mot", sql.NVarChar(120), m).input("por", sql.Int, por)
      .query(`INSERT INTO CarteirinhasPedidos (MembroId, Motivo, PedidoPor) OUTPUT INSERTED.PedidoId
              SELECT @m, @mot, @por WHERE NOT EXISTS (SELECT 1 FROM CarteirinhasPedidos WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND AtendidoEm IS NULL)`);
    if (!r.recordset[0]) return { sucesso: true, mensagem: "A segunda via já estava pedida: está na lista para imprimir." };
    await registrarAuditoria({ tabela: "CarteirinhasPedidos", registroId: r.recordset[0].PedidoId, acao: "CARTEIRINHA_SEGUNDA_VIA_PEDIDA", usuarioId: por, dadosDepois: { membroId: Number(membroId) } });
  } catch (e) {
    if (!violouUnicidade(e)) throw e;
    return { sucesso: true, mensagem: "A segunda via já estava pedida: está na lista para imprimir." };
  }
  return { sucesso: true, mensagem: "Segunda via pedida: entrou na lista para imprimir da congregação." };
}

// A carteirinha de UMA pessoa (o botão "Carteirinha" da ficha): o tipo, o modelo, a última impressão, o pedido e o bloqueio.
async function situacaoDaFicha(pool, membroId, { podeObreiro }) {
  const p = await pessoa(pool, membroId);
  if (!p) return null;
  const r = await pool.request().input("m", sql.Int, Number(membroId)).query(`
    SELECT TOP 5 i.ImpressaEm, i.Material, i.Motivo, i.Publico, mo.Nome AS Modelo FROM CarteirinhasImpressas i JOIN CarteirinhaModelos mo ON mo.ModeloId = i.ModeloId
    WHERE i.MembroId = @m ORDER BY i.ImpressaEm DESC, i.ImpressaoId DESC;
    SELECT Motivo, PedidoEm FROM CarteirinhasPedidos WHERE MembroId = @m AND AtendidoEm IS NULL;`);
  const impressoes = r.recordsets[0].map((l) => ({ em: l.ImpressaEm, material: l.Material, motivo: l.Motivo, tipo: l.Publico, modelo: l.Modelo }));
  const pedido = r.recordsets[1][0] ? { motivo: r.recordsets[1][0].Motivo, em: r.recordsets[1][0].PedidoEm } : null;
  const pode = regra.podeImprimir(p);
  const motivo = regra.motivoParaImprimir(p.tipo, impressoes[0] ? { publico: impressoes[0].tipo } : null, pedido && pedido.motivo);
  return {
    membroId: p.membroId, nome: p.nome, tipo: p.tipo, tipoRotulo: regra.ROTULO_PUBLICO[p.tipo], impressoes, pedido,
    podeImprimir: pode.pode && !p.pendencias.length && !(p.tipo === "OBREIRO" && !podeObreiro),
    porQueNao: !pode.pode ? pode.mensagem : p.pendencias.length ? "Pendência de cadastro (ficha repetida ou número a acertar): resolva antes de imprimir."
      : p.tipo === "OBREIRO" && !podeObreiro ? "A carteirinha de obreiro é impressa pela Secretaria Geral (Regimento, Art. 76 §2º)." : null,
    precisaDeNova: !!motivo, congregacaoId: p.congregacaoId
  };
}

// ---------------------------------------------------------------- a digital (a própria pessoa) e a conferência pública
async function minha(pool, membroId, { urlFoto, svgDoQr }) {
  const p = await pessoa(pool, membroId);
  if (!p) return null;
  const sit = regra.situacaoConferencia(p);
  const codigo = await codigoQr(pool, membroId);
  let foto = null;
  try { foto = p.fotoUrl && urlFoto ? urlFoto(p.fotoUrl) : null; } catch (e) { foto = null; }
  return {
    nome: p.nome, matricula: p.membroId, tipo: p.tipo, tipoRotulo: regra.ROTULO_PUBLICO[p.tipo], cargo: require("./escada").ROTULO_CARGO[p.cargo || "MEMBRO"] || null,
    funcao: p.funcao, congregacao: p.congregacao, area: p.area, membroDesde: regra.mesAno(p.dataAdmissao), situacao: sit.situacao, exerceCargo: sit.exerceCargo ?? null,
    foto, qrSvg: svgDoQr(urlConferencia(codigo)), url: urlConferencia(codigo)
  };
}

// A leitura pública do QR (sem login). Só o mínimo (regra.situacaoConferencia); a foto (endereço assinado, curto) só de quem está no rol.
async function conferir(pool, codigo, { urlFoto }) {
  if (!certificados.codigoValido(codigo)) return { situacao: "NAO_ENCONTRADA" };
  const r = await pool.request().input("c", sql.NVarChar(20), certificados.normalizarCodigo(codigo)).query(`SELECT MembroId FROM CarteirinhasQr WHERE Codigo = @c`);
  if (!r.recordset[0]) return { situacao: "NAO_ENCONTRADA" };
  const p = await pessoa(pool, r.recordset[0].MembroId);
  const sit = regra.situacaoConferencia(p);
  const { foto: comFoto, ...resto } = sit;
  let foto = null;
  if (comFoto && p && p.fotoUrl && urlFoto) { try { foto = urlFoto(p.fotoUrl); } catch (e) { foto = null; } }
  return { ...resto, foto, iniciais: iniciais(p && p.nome) };
}
function iniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  return ((partes[0][0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

module.exports = {
  garantirPadroes, listarModelos, lerModelo, criarModelo, salvarModelo, ativarModelo, guardarArte, codigoQr, pessoa, filaParaImprimir, resumoPorCongregacao,
  imprimir, pedirSegundaVia, situacaoDaFicha, minha, conferir, urlConferencia, TIPO_SQL
};
