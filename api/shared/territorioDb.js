// shared/territorioDb.js — v9.5: Mapa territorial e inteligência de expansão. O banco (migração 170); a regra pura está em territorio.js.
// Toda mudança de cadastro é condicional (a Versao lida volta no WHERE): duas pessoas mudando o mesmo bairro ou o mesmo critério ao mesmo tempo, uma só passa.
//
// `alcance` (montado pela rota, o mesmo da v9.2): { geral, cme, cobreMae(nome), dirigeMae(nome) } — o nível geral e a CME veem os membros de todos; os demais, só os
// das congregações que o escopo deles cobre por inteiro. As unidades (congregações e Extensões ativas) aparecem a todos: são públicas.
const { sql } = require("./db");
const tr = require("./territorio");
const { CARGOS_OFICIAIS } = require("./afm");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");
const { hojeBrasilia } = require("./dataBrasilia");
const { membrosSobDisciplina } = require("./disciplina");

const NAO_EXISTE = { sucesso: false, naoExiste: true, mensagem: "Não encontrado." };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = { sucesso: false, mensagem: "Isto mudou enquanto você olhava. Atualize a tela." };
const SO_GERAL = "Só o nível geral mexe no cadastro de bairros, no raio de cobertura e nos critérios.";
const HOMONIMO = "Já existe um bairro ativo com este nome nesta cidade.";
const OFICIAIS_SQL = CARGOS_OFICIAIS.map((c) => `N'${c}'`).join(", ");
const num = (v) => (v == null ? null : Number(v));
// Revisão de 06/11/2026 — o mapa e a simulação contam MEMBROS: o congregado "não integra o quadro de membros" (Estatuto Art. 7º, I) e o novo convertido ainda não é
// membro; o mesmo recorte do rol do PSC e da credencial. "Em comunhão" é a régua do estatuto.js: EM_COMUNHAO (ou situação vazia de membro ativo) e sem disciplina.
const SO_MEMBROS = `m.Status = N'ATIVO' AND ISNULL(m.SituacaoMembro, N'EM_COMUNHAO') NOT IN (N'CONGREGADO', N'NOVO_CONVERTIDO')`;
// abaixo de 3 dizimistas, o dízimo médio revelaria o de uma pessoa: a simulação diz só se atende (revisão de 06/11/2026)
const MINIMO_DIZIMISTAS_PARA_MOSTRAR = 3;
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
const instante = (v) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)));

async function emTransacao(pool, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const r = await fazer(t, () => new sql.Request(t));
    if (r && r.sucesso === false) { await t.rollback(); return r; }
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}

const veTudo = (alcance) => !!alcance && (alcance.geral || alcance.cme);
const cobre = (alcance, nome) => !!alcance && (alcance.geral || (!!nome && typeof alcance.cobreMae === "function" && alcance.cobreMae(nome)));
const dirige = (alcance, nome) => !!alcance && (alcance.geral || (!!nome && typeof alcance.dirigeMae === "function" && alcance.dirigeMae(nome)));
// Um número de versão vindo da tela (0 é válido).
function versaoDe(v) {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^[0-9]{1,9}$/.test(v.trim())) return Number(v.trim());
  return null;
}

// ================================================================ leitura básica ================================================================
async function lerBairro(rq, bairroId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, bairroId)
    .query(`SELECT BairroId, Nome, Cidade, UF, Lat, Lng, Ativo, Versao FROM Bairros ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""} WHERE BairroId = @id`);
  const l = r.recordset[0];
  return l ? { bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim(), lat: num(l.Lat), lng: num(l.Lng), ativo: !!l.Ativo, versao: l.Versao } : null;
}
async function lerParametros(rq) {
  const r = await rq().query(`SELECT RaioCoberturaKm, Versao FROM TerritorioParametros WHERE Id = 1`);
  const l = r.recordset[0];
  return { raioKm: l ? Number(l.RaioCoberturaKm) : tr.RAIO_PADRAO_KM, versao: l ? l.Versao : 0 };
}
async function lerCriterios(rq) {
  const r = await rq().query(`SELECT CriterioId, Indicador, Operador, Valor, Ativo, Ordem, Observacao, Versao, CONVERT(varchar(33), ISNULL(AlteradoEm, CriadoEm), 126) AS Em
                              FROM CriteriosEmancipacao ORDER BY Ordem, CriterioId`);
  return r.recordset.map((l) => ({
    criterioId: l.CriterioId, indicador: l.Indicador, operador: l.Operador, valor: num(l.Valor), ativo: !!l.Ativo, ordem: l.Ordem, observacao: l.Observacao,
    versao: l.Versao, em: l.Em
  }));
}

// ================================================================ o endereço do membro em linhas ================================================================
// Usado pelo cadastro (GestaoPessoas) e pelo Meus Dados (AtualizarMeusDados). Recebe as linhas que a tela mandou e devolve os valores a gravar, com a linha única
// montada; o bairro da lista precisa existir e estar ativo (o bairro dá a cidade e a UF). Exceção: o bairro que a pessoa JÁ tem (desativado num instante em que
// alguém a gravava nele — a corrida que a desativação "só sem moradores" não fecha sozinha) continua aceito, para a ficha dela poder ser salva; o nível geral
// o junta a outro (juntar aceita o bairro desativado que ainda tem moradores).
async function prepararEnderecoMembro(rq, dados, { membroId = null } = {}) {
  const v = tr.validarEnderecoPartes(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  let partes = v.partes, nomeBairro = null;
  if (partes.bairroId) {
    const b = await lerBairro(rq, partes.bairroId);
    let aceito = !!b && b.ativo;
    if (b && !b.ativo && membroId) {
      const atual = await rq().input("id", sql.Int, membroId).query(`SELECT EnderecoBairroId FROM MembroReferencia WHERE MembroId = @id`);
      aceito = !!atual.recordset[0] && Number(atual.recordset[0].EnderecoBairroId) === b.bairroId;
    }
    if (!aceito) return { sucesso: false, mensagem: "O bairro escolhido não está mais na lista. Escolha de novo." };
    partes = tr.aplicarBairro(partes, b);
    nomeBairro = b.nome;
  } else if (partes.bairroTexto) {
    // o nome escrito que já está cadastrado (mesmo nome, cidade e UF, sem maiúscula nem acento) vira o bairro da lista: senão ficaria na fila para sempre (o
    // cadastro recusaria o homônimo) — revisão de 06/11/2026
    const ja = await rq().input("nome", sql.NVarChar(150), partes.bairroTexto).input("cid", sql.NVarChar(150), partes.cidade).input("uf", sql.NChar(2), partes.uf)
      .query(`SELECT TOP 1 BairroId, Nome, Cidade, UF FROM Bairros WHERE Ativo = 1 AND Nome = @nome COLLATE Latin1_General_CI_AI
              AND Cidade = LTRIM(RTRIM(@cid)) COLLATE Latin1_General_CI_AI AND UF = @uf`);
    const l = ja.recordset[0];
    if (l) {
      partes = { ...partes, bairroId: l.BairroId, bairroTexto: null, cidade: l.Cidade, uf: String(l.UF).trim() };
      nomeBairro = l.Nome;
    }
  }
  return { sucesso: true, partes, endereco: tr.montarLinhaEndereco(partes, nomeBairro) };
}
// Revisão de 06/11/2026 — a ficha que grava um bairro da lista o trava antes de gravar a pessoa (Bairros, depois MembroReferencia: a mesma ordem do editar e do
// juntar, então os dois não se travam um ao outro) e relê o nome, a cidade e a UF sob a trava (a linha única nunca sai com o nome de antes de uma renomeação).
// `fazer(rq)` grava a pessoa com as Requests da transação; devolve o que ele devolver (`{ desfazer: true }` desfaz).
async function gravarComBairroTravado(pool, prep, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  const rq = () => new sql.Request(t);
  try {
    if (prep && prep.partes && prep.partes.bairroId) {
      const b = await lerBairro(rq, prep.partes.bairroId, { travar: true });
      if (b) {
        prep.partes = tr.aplicarBairro(prep.partes, b);
        prep.endereco = tr.montarLinhaEndereco(prep.partes, b.nome);
      }
    }
    const r = await fazer(rq);
    if (r && r.desfazer) await t.rollback(); else await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}
// Os parâmetros SQL das colunas novas (na mesma Request que grava o resto).
function entradasEndereco(request, partes) {
  const p = partes || {};
  return request
    .input("endLogradouro", sql.NVarChar(200), p.logradouro || null)
    .input("endNumero", sql.NVarChar(20), p.numero || null)
    .input("endComplemento", sql.NVarChar(100), p.complemento || null)
    .input("endBairroId", sql.Int, p.bairroId || null)
    .input("endBairroTexto", sql.NVarChar(150), p.bairroTexto || null)
    .input("endCidade", sql.NVarChar(150), p.cidade || null)
    .input("endUF", sql.NChar(2), p.uf || null)
    .input("endCep", sql.NChar(9), p.cep || null);
}
const SET_ENDERECO = `EnderecoLogradouro = @endLogradouro, EnderecoNumero = @endNumero, EnderecoComplemento = @endComplemento, EnderecoBairroId = @endBairroId,
  EnderecoBairroTexto = @endBairroTexto, EnderecoCidade = @endCidade, EnderecoUF = @endUF, EnderecoCep = @endCep`;
const COLUNAS_ENDERECO = "EnderecoLogradouro, EnderecoNumero, EnderecoComplemento, EnderecoBairroId, EnderecoBairroTexto, EnderecoCidade, EnderecoUF, EnderecoCep";
const VALORES_ENDERECO = "@endLogradouro, @endNumero, @endComplemento, @endBairroId, @endBairroTexto, @endCidade, @endUF, @endCep";
// As linhas lidas de uma linha de MembroReferencia (com o nome do bairro, quando há).
function partesDaLinha(l) {
  return {
    logradouro: l.EnderecoLogradouro || null, numero: l.EnderecoNumero || null, complemento: l.EnderecoComplemento || null,
    bairroId: l.EnderecoBairroId || null, bairroNome: l.BairroNome || null, bairroTexto: l.EnderecoBairroTexto || null,
    cidade: l.EnderecoCidade || null, uf: l.EnderecoUF ? String(l.EnderecoUF).trim() : null, cep: l.EnderecoCep ? String(l.EnderecoCep).trim() : null
  };
}
const SELECT_PARTES = `m.EnderecoLogradouro, m.EnderecoNumero, m.EnderecoComplemento, m.EnderecoBairroId, m.EnderecoBairroTexto, m.EnderecoCidade, m.EnderecoUF,
  m.EnderecoCep, bm.Nome AS BairroNome`;
// A linha legada (só a linha única, de uma tela antiga): as linhas continuam se a linha única não mudou; se mudou, as linhas deixam de valer (são limpas).
async function linhasDiantedaLinhaLegada(rq, membroId, enderecoNovo) {
  const r = await rq().input("id", sql.Int, membroId)
    .query(`SELECT m.Endereco, ${SELECT_PARTES} FROM MembroReferencia m LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId WHERE m.MembroId = @id`);
  const l = r.recordset[0];
  if (!l) return null;
  const atual = partesDaLinha(l);
  return (l.Endereco || null) === (enderecoNovo || null) ? atual : null;
}

// Recompõe a linha única dos membros de um bairro (depois de renomear o bairro, ou de ligar a ele a fila de quem escreveu o nome). Dentro da transação.
async function recomporMembrosDoBairro(rq, bairro) {
  const r = await rq().input("b", sql.Int, bairro.bairroId).query(`
    SELECT m.MembroId, ${SELECT_PARTES} FROM MembroReferencia m WITH (UPDLOCK, ROWLOCK) LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId WHERE m.EnderecoBairroId = @b`);
  for (const l of r.recordset) {
    const partes = tr.aplicarBairro(partesDaLinha(l), bairro);
    const linha = tr.montarLinhaEndereco(partes, bairro.nome);
    await rq().input("id", sql.Int, l.MembroId).input("cid", sql.NVarChar(150), partes.cidade).input("uf", sql.NChar(2), partes.uf).input("end", sql.NVarChar(300), linha)
      .query(`UPDATE MembroReferencia SET EnderecoCidade = @cid, EnderecoUF = @uf, Endereco = @end WHERE MembroId = @id`);
  }
  return r.recordset.length;
}

// ================================================================ catálogos ================================================================
async function catalogos(pool, { alcance }) {
  const rq = () => pool.request();
  const bairros = await rq().query(`SELECT BairroId, Nome, Cidade, UF, CASE WHEN Lat IS NULL THEN 0 ELSE 1 END AS TemPonto FROM Bairros WHERE Ativo = 1 ORDER BY Cidade, Nome`);
  const par = await lerParametros(rq);
  const chave = typeof process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR === "string" ? process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR.trim() : "";
  return {
    indicadores: Object.entries(tr.INDICADORES).map(([codigo, i]) => ({ codigo, rotulo: i.rotulo, tipo: i.tipo, inteiro: !!i.inteiro, unidade: i.unidade || null, maximo: i.maximo ?? null })),
    operadores: Object.entries(tr.OPERADORES).map(([codigo, rotulo]) => ({ codigo, rotulo })),
    ufs: tr.UFS,
    raioKm: par.raioKm, versaoParametros: par.versao,
    bairros: bairros.recordset.map((l) => ({ bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim(), temPonto: !!l.TemPonto })),
    // a chave do Maps (restrita no Google ao endereço do sistema) só vai a quem entra na pílula; sem ela, a tela fica na lista e desenho
    mapa: { chave: chave && /^[A-Za-z0-9_-]{20,80}$/.test(chave) ? chave : null },
    papeis: { geral: !!(alcance && alcance.geral), cme: !!(alcance && alcance.cme) }
  };
}

// As unidades ativas (as congregações e as Extensões), com o ponto quando há. Públicas: aparecem a todos.
async function unidades(rq) {
  const c = await rq().query(`SELECT CongregacaoId, Nome, Lat, Lng, ISNULL(Categoria, N'CONGREGACAO') AS Categoria FROM Congregacoes WHERE Ativa = 1`);
  const e = await rq().query(`SELECT e.ExtensaoId, e.Nome, e.Lat, e.Lng, c.Nome AS MaeNome FROM ExtensoesTenda e
                              JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId WHERE e.Ativa = 1`);
  return [
    ...c.recordset.map((l) => ({ chave: `C${l.CongregacaoId}`, id: l.CongregacaoId, tipo: l.Categoria === "EXTENSAO_TENDA" ? "EXTENSAO" : "CONGREGACAO", nome: l.Nome, maeNome: l.Nome, lat: num(l.Lat), lng: num(l.Lng) })),
    ...e.recordset.map((l) => ({ chave: `E${l.ExtensaoId}`, id: l.ExtensaoId, tipo: "EXTENSAO", nome: l.Nome, maeNome: l.MaeNome, lat: num(l.Lat), lng: num(l.Lng) }))
  ];
}

// ================================================================ o mapa de cobertura ================================================================
async function mapa(pool, { alcance }) {
  const rq = () => pool.request();
  const par = await lerParametros(rq);
  const unis = await unidades(rq);
  const extAtivas = new Set(unis.filter((u) => u.chave.startsWith("E")).map((u) => u.id));
  // quantos membros ATIVOS de cada unidade moram em cada bairro (contagem, nunca nome)
  const r = await rq().query(`
    SELECT m.EnderecoBairroId AS BairroId, m.CongregacaoId, m.ExtensaoId, c.Nome AS CongNome,
           CASE WHEN m.EnderecoBairroTexto IS NOT NULL THEN 1 ELSE 0 END AS Escrito, COUNT(*) AS N
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE ${SO_MEMBROS}
    GROUP BY m.EnderecoBairroId, m.CongregacaoId, m.ExtensaoId, c.Nome, CASE WHEN m.EnderecoBairroTexto IS NOT NULL THEN 1 ELSE 0 END`);
  const todos = veTudo(alcance);
  const linhas = r.recordset.filter((l) => todos || cobre(alcance, l.CongNome));
  const b = await rq().query(`SELECT BairroId, Nome, Cidade, UF, Lat, Lng FROM Bairros WHERE Ativo = 1`);
  const porBairro = new Map();
  let membros = 0, semLocalizacao = 0, escritos = 0;
  const densidade = [];
  for (const l of linhas) {
    const n = Number(l.N);
    membros += n;
    if (!l.BairroId) { semLocalizacao += n; if (l.Escrito) escritos += n; continue; }
    porBairro.set(l.BairroId, (porBairro.get(l.BairroId) || 0) + n);
    const unidadeChave = l.ExtensaoId && extAtivas.has(l.ExtensaoId) ? `E${l.ExtensaoId}` : (l.CongregacaoId ? `C${l.CongregacaoId}` : null);
    if (unidadeChave) densidade.push({ bairroId: l.BairroId, unidadeChave, membros: n });
  }
  // um membro ligado a bairro desativado ainda conta como localizado (o ponto continua valendo); o bairro inativo só não aparece na lista para escolher
  const bairrosTodos = b.recordset.map((l) => ({ bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim(), lat: num(l.Lat), lng: num(l.Lng) }));
  const faltantes = [...porBairro.keys()].filter((id) => !bairrosTodos.some((x) => x.bairroId === id));
  if (faltantes.length) {
    const ri = await rq().query(`SELECT BairroId, Nome, Cidade, UF, Lat, Lng FROM Bairros WHERE BairroId IN (${faltantes.map((x) => Number(x)).join(",")})`);
    for (const l of ri.recordset) bairrosTodos.push({ bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim(), lat: num(l.Lat), lng: num(l.Lng), inativo: true });
  }
  // Revisão de 06/11/2026 — o bairro cujos moradores são de uma unidade SEM ponto no mapa não é "descoberto" (falta o dado, não a cobertura): fica "a conferir",
  // sem o atalho de pedir Extensão, até a unidade ganhar o ponto
  const semPontoChaves = new Set(unis.filter((u) => u.lat == null || u.lng == null).map((u) => u.chave));
  const bairrosAConferir = new Set(densidade.filter((d) => semPontoChaves.has(d.unidadeChave)).map((d) => Number(d.bairroId)));
  const bairros = tr.cobertura(bairrosTodos.map((x) => ({ ...x, membros: porBairro.get(x.bairroId) || 0 })), unis, par.raioKm)
    .map((x) => (x.descoberto && bairrosAConferir.has(Number(x.bairroId)) ? { ...x, descoberto: false, aConferir: true } : { ...x, aConferir: false }))
    .filter((x) => !x.inativo || x.membros > 0)
    .sort((a, b2) => (Number(b2.descoberto) - Number(a.descoberto)) || (b2.membros - a.membros) || a.nome.localeCompare(b2.nome, "pt-BR"));
  // a densidade por unidade: o nível geral e a CME veem todas; os demais, as das congregações deles
  const dens = tr.densidadePorUnidade(densidade, bairrosTodos, unis).filter((d) => {
    const u = unis.find((x) => x.chave === d.chave);
    return todos || (u && cobre(alcance, u.maeNome));
  });
  // a fila dos bairros escritos (para o nível geral cadastrar): nome, cidade, UF e quantos — sem nome de pessoa
  let fila = [];
  if (alcance && alcance.geral) {
    const f = await rq().query(`
      SELECT MIN(m.EnderecoBairroTexto) AS Nome, MIN(m.EnderecoCidade) AS Cidade, MIN(m.EnderecoUF) AS UF, COUNT(*) AS N
      FROM MembroReferencia m WHERE ${SO_MEMBROS} AND m.EnderecoBairroTexto IS NOT NULL
      GROUP BY m.EnderecoBairroTexto COLLATE Latin1_General_CI_AI, m.EnderecoCidade COLLATE Latin1_General_CI_AI, m.EnderecoUF
      ORDER BY COUNT(*) DESC`);
    fila = f.recordset.map((l) => ({ nome: l.Nome, cidade: l.Cidade, uf: l.UF ? String(l.UF).trim() : null, membros: Number(l.N) }));
  }
  return {
    raioKm: par.raioKm,
    bairros: bairros.map((x) => ({
      bairroId: x.bairroId, nome: x.nome, cidade: x.cidade, uf: x.uf, lat: x.lat, lng: x.lng, membros: x.membros, semPonto: x.semPonto,
      maisPerto: x.maisPerto, distanciaKm: x.distanciaKm, descoberto: x.descoberto, aConferir: !!x.aConferir, inativo: !!x.inativo
    })),
    unidades: unis.map((u) => ({ chave: u.chave, id: u.id, tipo: u.tipo, nome: u.nome, maeNome: u.maeNome, lat: u.lat, lng: u.lng })),
    densidade: dens,
    totais: {
      membros, localizados: membros - semLocalizacao, semLocalizacao, bairroEscritoNaFila: escritos,
      bairrosSemPonto: bairros.filter((x) => x.semPonto && x.membros > 0).length, descobertos: bairros.filter((x) => x.descoberto).length,
      aConferir: bairros.filter((x) => x.aConferir).length,
      unidadesSemPonto: unis.filter((u) => u.lat == null).length
    },
    fila,
    escopo: todos ? "TODOS" : "MEUS"
  };
}

// ================================================================ bairros (nível geral) ================================================================
async function listarBairros(pool) {
  const r = await pool.request().query(`
    SELECT b.BairroId, b.Nome, b.Cidade, b.UF, b.Lat, b.Lng, b.Ativo, b.Versao,
           (SELECT COUNT(*) FROM MembroReferencia m WHERE m.EnderecoBairroId = b.BairroId AND ${SO_MEMBROS}) AS Membros
    FROM Bairros b ORDER BY b.Ativo DESC, b.Cidade, b.Nome`);
  return r.recordset.map((l) => ({
    bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim(), lat: num(l.Lat), lng: num(l.Lng), ativo: !!l.Ativo, versao: l.Versao, membros: Number(l.Membros)
  }));
}

// Liga ao bairro, de uma vez, os membros que escreveram o mesmo nome na mesma cidade e UF (a fila).
async function ligarFila(rq, bairro) {
  const r = await rq().input("nome", sql.NVarChar(150), bairro.nome).input("cid", sql.NVarChar(150), bairro.cidade).input("uf", sql.NChar(2), bairro.uf).input("b", sql.Int, bairro.bairroId)
    .query(`UPDATE MembroReferencia SET EnderecoBairroId = @b, EnderecoBairroTexto = NULL OUTPUT inserted.MembroId
            WHERE EnderecoBairroTexto IS NOT NULL
              AND LTRIM(RTRIM(EnderecoBairroTexto)) COLLATE Latin1_General_CI_AI = @nome COLLATE Latin1_General_CI_AI
              AND LTRIM(RTRIM(EnderecoCidade)) COLLATE Latin1_General_CI_AI = @cid COLLATE Latin1_General_CI_AI
              AND EnderecoUF = @uf`);
  return r.recordset.length;
}

async function criarBairro(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const v = tr.validarBairro(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const ins = await rq().input("nome", sql.NVarChar(150), v.bairro.nome).input("cid", sql.NVarChar(150), v.bairro.cidade).input("uf", sql.NChar(2), v.bairro.uf)
        .input("lat", sql.Decimal(9, 6), v.bairro.lat).input("lng", sql.Decimal(9, 6), v.bairro.lng).input("por", sql.Int, por)
        .query(`INSERT INTO Bairros (Nome, Cidade, UF, Lat, Lng, CriadoPor) OUTPUT inserted.BairroId VALUES (@nome, @cid, @uf, @lat, @lng, @por)`);
      const bairro = { ...v.bairro, bairroId: ins.recordset[0].BairroId };
      const ligados = await ligarFila(rq, bairro);
      if (ligados) await recomporMembrosDoBairro(rq, bairro);
      await registrarAuditoriaNaTransacao(t, { tabela: "Bairros", registroId: bairro.bairroId, acao: "BAIRRO_CRIADO", usuarioId: por, dadosDepois: { ...v.bairro, membrosLigadosDaFila: ligados } });
      return { sucesso: true, bairroId: bairro.bairroId, membrosLigados: ligados };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: HOMONIMO };
    throw e;
  }
}

async function editarBairro(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const bairroId = Number(dados.bairroId);
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  const v = tr.validarBairro(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const atual = await lerBairro(rq, bairroId, { travar: true });
      if (!atual) return NAO_EXISTE;
      if (!atual.ativo) return { sucesso: false, mensagem: "Este bairro está desativado: reative-o antes de mudar." };
      if (atual.versao !== versao) return MUDOU;
      await rq().input("id", sql.Int, bairroId).input("nome", sql.NVarChar(150), v.bairro.nome).input("cid", sql.NVarChar(150), v.bairro.cidade).input("uf", sql.NChar(2), v.bairro.uf)
        .input("lat", sql.Decimal(9, 6), v.bairro.lat).input("lng", sql.Decimal(9, 6), v.bairro.lng).input("por", sql.Int, por).input("ver", sql.Int, versao)
        .query(`UPDATE Bairros SET Nome = @nome, Cidade = @cid, UF = @uf, Lat = @lat, Lng = @lng, AlteradoPor = @por, AlteradoEm = SYSUTCDATETIME(), Versao = Versao + 1
                WHERE BairroId = @id AND Versao = @ver`);
      const bairro = { ...v.bairro, bairroId };
      // o nome, a cidade ou a UF mudou: a linha única dos membros dele acompanha (e a fila do novo nome entra)
      const mudouNome = atual.nome !== bairro.nome || atual.cidade !== bairro.cidade || atual.uf !== bairro.uf;
      // a fila liga sempre (quem escreveu este nome enquanto o bairro já existia — revisão de 06/11/2026); a linha única é refeita se algo mudou
      const ligados = await ligarFila(rq, bairro);
      if (mudouNome || ligados) await recomporMembrosDoBairro(rq, bairro);
      await registrarAuditoriaNaTransacao(t, { tabela: "Bairros", registroId: bairroId, acao: "BAIRRO_ALTERADO", usuarioId: por,
        dadosAntes: { nome: atual.nome, cidade: atual.cidade, uf: atual.uf, lat: atual.lat, lng: atual.lng }, dadosDepois: { ...v.bairro, membrosLigadosDaFila: ligados } });
      return { sucesso: true, bairroId, membrosLigados: ligados };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: HOMONIMO };
    throw e;
  }
}

// Desativa (sem membros ativos ligados) ou reativa. Para juntar dois bairros iguais, use "juntar".
async function ativarBairro(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const bairroId = Number(dados.bairroId);
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  const ativo = dados.ativo === true || dados.ativo === "true";
  try {
    return await emTransacao(pool, async (t, rq) => {
      const atual = await lerBairro(rq, bairroId, { travar: true });
      if (!atual) return NAO_EXISTE;
      if (atual.versao !== versao) return MUDOU;
      if (atual.ativo === ativo) return { sucesso: false, mensagem: ativo ? "O bairro já está ativo." : "O bairro já está desativado." };
      if (!ativo) {
        const m = await rq().input("b", sql.Int, bairroId).query(`SELECT COUNT(*) AS N FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE EnderecoBairroId = @b AND Status = N'ATIVO'`);
        const n = Number(m.recordset[0].N);
        if (n) return { sucesso: false, mensagem: `${n} membro(s) ativo(s) moram neste bairro. Se ele é repetido, use "Juntar com outro bairro"; senão, mantenha-o ativo.` };
      }
      await rq().input("id", sql.Int, bairroId).input("a", sql.Bit, ativo).input("por", sql.Int, por).input("ver", sql.Int, versao)
        .query(`UPDATE Bairros SET Ativo = @a, AlteradoPor = @por, AlteradoEm = SYSUTCDATETIME(), Versao = Versao + 1 WHERE BairroId = @id AND Versao = @ver`);
      await registrarAuditoriaNaTransacao(t, { tabela: "Bairros", registroId: bairroId, acao: ativo ? "BAIRRO_REATIVADO" : "BAIRRO_DESATIVADO", usuarioId: por });
      return { sucesso: true, bairroId, ativo };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já existe outro bairro ativo com este nome nesta cidade: junte os dois em vez de reativar." };
    throw e;
  }
}

// Junta um bairro repetido (origem) em outro (destino): os membros passam para o destino e a origem é desativada.
async function juntarBairros(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const origemId = Number(dados.bairroId), destinoId = Number(dados.destinoId);
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  if (!Number.isInteger(destinoId) || destinoId <= 0) return { sucesso: false, mensagem: "Escolha o bairro que fica." };
  if (origemId === destinoId) return { sucesso: false, mensagem: "Escolha um bairro diferente para ficar." };
  return emTransacao(pool, async (t, rq) => {
    // a ordem das travas é sempre a do menor número primeiro: duas junções cruzadas não se travam uma à outra
    const [a, b] = origemId < destinoId ? [origemId, destinoId] : [destinoId, origemId];
    const primeiro = await lerBairro(rq, a, { travar: true });
    const segundo = await lerBairro(rq, b, { travar: true });
    const origem = a === origemId ? primeiro : segundo, destino = a === origemId ? segundo : primeiro;
    if (!origem || !destino) return NAO_EXISTE;
    if (origem.versao !== versao) return MUDOU;
    if (!destino.ativo) return { sucesso: false, mensagem: "O bairro que fica precisa estar ativo." };
    // o desativado só entra se ainda tem moradores (sobra de uma corrida com a desativação): juntar é o jeito de levá-los ao bairro certo
    if (!origem.ativo) {
      const n = await rq().input("o", sql.Int, origem.bairroId).query(`SELECT COUNT(*) AS N FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE EnderecoBairroId = @o`);
      if (!Number(n.recordset[0].N)) return { sucesso: false, mensagem: "O bairro repetido já está desativado e não tem moradores: não há o que juntar." };
    }
    const mov = await rq().input("o", sql.Int, origem.bairroId).input("d", sql.Int, destino.bairroId)
      .query(`UPDATE MembroReferencia SET EnderecoBairroId = @d OUTPUT inserted.MembroId WHERE EnderecoBairroId = @o`);
    await recomporMembrosDoBairro(rq, destino);
    await rq().input("id", sql.Int, origem.bairroId).input("por", sql.Int, por).input("ver", sql.Int, versao)
      .query(`UPDATE Bairros SET Ativo = 0, AlteradoPor = @por, AlteradoEm = SYSUTCDATETIME(), Versao = Versao + 1 WHERE BairroId = @id AND Versao = @ver`);
    await registrarAuditoriaNaTransacao(t, { tabela: "Bairros", registroId: origem.bairroId, acao: "BAIRRO_JUNTADO", usuarioId: por,
      dadosAntes: { nome: origem.nome, cidade: origem.cidade }, dadosDepois: { destinoId: destino.bairroId, destino: destino.nome, membrosMovidos: mov.recordset.length } });
    return { sucesso: true, membrosMovidos: mov.recordset.length };
  });
}

// ================================================================ o ponto das Extensões ================================================================
async function marcarPontoExtensao(pool, { dados, por, alcance }) {
  const extensaoId = Number(dados.extensaoId);
  const ponto = tr.validarPonto(dados.lat, dados.lng);
  if (!ponto.valido) return { sucesso: false, mensagem: ponto.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const r = await rq().input("id", sql.Int, extensaoId).query(`
      SELECT e.ExtensaoId, e.Nome, e.Ativa, e.Lat, e.Lng, c.Nome AS MaeNome FROM ExtensoesTenda e WITH (UPDLOCK, ROWLOCK)
      JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId WHERE e.ExtensaoId = @id`);
    const e = r.recordset[0];
    if (!e) return NAO_EXISTE;
    if (!dirige(alcance, e.MaeNome)) return PROIBIDO("Só o Dirigente da Congregação-Mãe ou o nível geral marcam o ponto da Extensão.");
    if (!e.Ativa) return { sucesso: false, mensagem: "A Extensão não está mais ativa." };
    await rq().input("id", sql.Int, extensaoId).input("lat", sql.Decimal(9, 6), ponto.lat).input("lng", sql.Decimal(9, 6), ponto.lng).input("por", sql.Int, por)
      .query(`UPDATE ExtensoesTenda SET Lat = @lat, Lng = @lng, PontoMarcadoPor = @por, PontoMarcadoEm = SYSUTCDATETIME() WHERE ExtensaoId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "ExtensoesTenda", registroId: extensaoId, acao: "EXTENSAO_PONTO_MARCADO", usuarioId: por,
      dadosAntes: { lat: num(e.Lat), lng: num(e.Lng) }, dadosDepois: { lat: ponto.lat, lng: ponto.lng } });
    return { sucesso: true, extensaoId, lat: ponto.lat, lng: ponto.lng };
  });
}
// As Extensões ativas no alcance, com o ponto e se esta pessoa pode marcá-lo.
async function extensoesDoMapa(pool, { alcance }) {
  const r = await pool.request().query(`
    SELECT e.ExtensaoId, e.Nome, e.Lat, e.Lng, e.Endereco, e.Bairro, e.Cidade, e.UF, c.Nome AS MaeNome FROM ExtensoesTenda e
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId WHERE e.Ativa = 1 ORDER BY c.Nome, e.Nome`);
  return r.recordset.filter((l) => veTudo(alcance) || cobre(alcance, l.MaeNome)).map((l) => ({
    extensaoId: l.ExtensaoId, nome: l.Nome, maeNome: l.MaeNome, lat: num(l.Lat), lng: num(l.Lng),
    endereco: [l.Endereco, l.Bairro, l.Cidade && l.UF ? `${l.Cidade}/${l.UF}` : l.Cidade].filter(Boolean).join(" — ") || null,
    podeMarcar: dirige(alcance, l.MaeNome)
  }));
}

// ================================================================ o raio de cobertura (nível geral) ================================================================
async function mudarRaio(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const v = tr.validarRaio(dados.raioKm);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  return emTransacao(pool, async (t, rq) => {
    const antes = await rq().query(`SELECT RaioCoberturaKm, Versao FROM TerritorioParametros WITH (UPDLOCK, ROWLOCK) WHERE Id = 1`);
    const l = antes.recordset[0];
    if (!l) return NAO_EXISTE;
    if (l.Versao !== versao) return MUDOU;
    await rq().input("r", sql.Decimal(5, 2), v.raio).input("por", sql.Int, por).input("ver", sql.Int, versao)
      .query(`UPDATE TerritorioParametros SET RaioCoberturaKm = @r, AlteradoPor = @por, AlteradoEm = SYSUTCDATETIME(), Versao = Versao + 1 WHERE Id = 1 AND Versao = @ver`);
    await registrarAuditoriaNaTransacao(t, { tabela: "TerritorioParametros", registroId: 1, acao: "RAIO_ALTERADO", usuarioId: por,
      dadosAntes: { raioKm: Number(l.RaioCoberturaKm) }, dadosDepois: { raioKm: v.raio } });
    return { sucesso: true, raioKm: v.raio };
  });
}

// ================================================================ critérios (nível geral) ================================================================
async function criarCriterio(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const v = tr.validarCriterio(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const c = v.criterio;
  return emTransacao(pool, async (t, rq) => {
    const ins = await rq().input("i", sql.NVarChar(30), c.indicador).input("o", sql.NVarChar(10), c.operador).input("v", sql.Decimal(12, 2), c.valor)
      .input("a", sql.Bit, c.ativo).input("ord", sql.Int, c.ordem).input("obs", sql.NVarChar(300), c.observacao).input("por", sql.Int, por)
      .query(`INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor, Ativo, Ordem, Observacao, CriadoPor) OUTPUT inserted.CriterioId VALUES (@i, @o, @v, @a, @ord, @obs, @por)`);
    const criterioId = ins.recordset[0].CriterioId;
    await registrarAuditoriaNaTransacao(t, { tabela: "CriteriosEmancipacao", registroId: criterioId, acao: "CRITERIO_CRIADO", usuarioId: por, dadosDepois: c });
    return { sucesso: true, criterioId };
  });
}
async function lerCriterioTravado(rq, criterioId) {
  const r = await rq().input("id", sql.Int, criterioId)
    .query(`SELECT CriterioId, Indicador, Operador, Valor, Ativo, Ordem, Observacao, Versao FROM CriteriosEmancipacao WITH (UPDLOCK, ROWLOCK) WHERE CriterioId = @id`);
  const l = r.recordset[0];
  return l ? { criterioId: l.CriterioId, indicador: l.Indicador, operador: l.Operador, valor: num(l.Valor), ativo: !!l.Ativo, ordem: l.Ordem, observacao: l.Observacao, versao: l.Versao } : null;
}
async function editarCriterio(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const criterioId = Number(dados.criterioId);
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  const v = tr.validarCriterio(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const c = v.criterio;
  return emTransacao(pool, async (t, rq) => {
    const atual = await lerCriterioTravado(rq, criterioId);
    if (!atual) return NAO_EXISTE;
    if (atual.versao !== versao) return MUDOU;
    await rq().input("id", sql.Int, criterioId).input("i", sql.NVarChar(30), c.indicador).input("o", sql.NVarChar(10), c.operador).input("v", sql.Decimal(12, 2), c.valor)
      .input("a", sql.Bit, c.ativo).input("ord", sql.Int, c.ordem).input("obs", sql.NVarChar(300), c.observacao).input("por", sql.Int, por).input("ver", sql.Int, versao)
      .query(`UPDATE CriteriosEmancipacao SET Indicador = @i, Operador = @o, Valor = @v, Ativo = @a, Ordem = @ord, Observacao = @obs, AlteradoPor = @por,
                AlteradoEm = SYSUTCDATETIME(), Versao = Versao + 1 WHERE CriterioId = @id AND Versao = @ver`);
    const { versao: _v, criterioId: _c, ...antes } = atual;
    await registrarAuditoriaNaTransacao(t, { tabela: "CriteriosEmancipacao", registroId: criterioId, acao: "CRITERIO_ALTERADO", usuarioId: por, dadosAntes: antes, dadosDepois: c });
    return { sucesso: true, criterioId };
  });
}
async function apagarCriterio(pool, { dados, por, alcance }) {
  if (!alcance || !alcance.geral) return PROIBIDO(SO_GERAL);
  const criterioId = Number(dados.criterioId);
  const versao = versaoDe(dados.versao);
  if (versao == null) return { sucesso: false, mensagem: "Atualize a tela e tente de novo." };
  return emTransacao(pool, async (t, rq) => {
    const atual = await lerCriterioTravado(rq, criterioId);
    if (!atual) return NAO_EXISTE;
    if (atual.versao !== versao) return MUDOU;
    await rq().input("id", sql.Int, criterioId).input("ver", sql.Int, versao).query(`DELETE FROM CriteriosEmancipacao WHERE CriterioId = @id AND Versao = @ver`);
    const { versao: _v, criterioId: _c, ...antes } = atual;
    await registrarAuditoriaNaTransacao(t, { tabela: "CriteriosEmancipacao", registroId: criterioId, acao: "CRITERIO_APAGADO", usuarioId: por, dadosAntes: antes });
    return { sucesso: true, criterioId };
  });
}

// ================================================================ a simulação de emancipação ================================================================
// As medidas de cada Extensão ativa (calculadas na leitura, nunca digitadas).
async function medidasDasExtensoes(pool, extensoes, hoje) {
  const rq = () => pool.request();
  if (!extensoes.length) return new Map();
  const ids = extensoes.map((e) => Number(e.extensaoId)).filter((x) => Number.isInteger(x) && x > 0);
  const lista = ids.join(",");
  const sobDisciplina = await membrosSobDisciplina(pool);
  const membros = await rq().query(`
    SELECT m.MembroId, m.ExtensaoId, m.Status, m.SituacaoMembro, m.CargoMinisterial FROM MembroReferencia m WHERE m.ExtensaoId IN (${lista}) AND m.Status = N'ATIVO'`);
  const enc = await rq().query(`
    SELECT x.ExtensaoId, x.MembroId, me.Status, me.SituacaoMembro, me.CongregacaoId, e.CongregacaoMaeId
    FROM ExtensaoEncarregados x JOIN MembroReferencia me ON me.MembroId = x.MembroId JOIN ExtensoesTenda e ON e.ExtensaoId = x.ExtensaoId
    WHERE x.Ate IS NULL AND x.ExtensaoId IN (${lista})`);
  const j = tr.janela12Meses(hoje);
  const diz = await rq().input("de", sql.Char(7), j.de).input("ate", sql.Char(7), j.ate).query(`
    SELECT m.ExtensaoId, SUM(l.Valor) AS Total, COUNT(DISTINCT m.MembroId) AS Dizimistas
    FROM LancamentosTesouraria l JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId JOIN MembroReferencia m ON m.MembroId = d.MembroId
    WHERE m.ExtensaoId IN (${lista}) AND ${SO_MEMBROS} AND l.Tipo = N'DIZIMO' AND l.Status = N'ATIVO' AND l.StatusConfirmacao = N'CONFIRMADO'
      AND l.MesReferencia >= @de AND l.MesReferencia <= @ate
    GROUP BY m.ExtensaoId`);
  const psc = await rq().query(`
    SELECT a.CongregacaoId, a.NivelFinal FROM PscAvaliacoes a
    WHERE a.Status = N'HOMOLOGADA' AND a.NivelFinal IS NOT NULL
      AND a.Ano = (SELECT MAX(b.Ano) FROM PscAvaliacoes b WHERE b.CongregacaoId = a.CongregacaoId AND b.Status = N'HOMOLOGADA' AND b.NivelFinal IS NOT NULL)`);
  const nivelPsc = new Map(psc.recordset.map((l) => [l.CongregacaoId, Number(l.NivelFinal)]));
  const emComunhao = (m) => m.Status === "ATIVO" && (m.SituacaoMembro === "EM_COMUNHAO" || m.SituacaoMembro == null) && !sobDisciplina.has(m.MembroId);
  const saida = new Map();
  for (const e of extensoes) {
    const meus = membros.recordset.filter((m) => m.ExtensaoId === e.extensaoId);
    const comunhao = meus.filter(emComunhao);
    const en = enc.recordset.find((x) => x.ExtensaoId === e.extensaoId);
    const d = diz.recordset.find((x) => x.ExtensaoId === e.extensaoId);
    const mae = { lat: e.maeLat, lng: e.maeLng };
    saida.set(e.extensaoId, {
      MESES_ABERTA: tr.mesesEntre(e.abertaEm, hoje),
      MEMBROS_EM_COMUNHAO: comunhao.length,
      ENCARREGADO_EM_COMUNHAO: en ? (emComunhao(en) && Number(en.CongregacaoId) === Number(en.CongregacaoMaeId)) : false,
      OBREIROS: comunhao.filter((m) => CARGOS_OFICIAIS.includes(m.CargoMinisterial)).length,
      DIZIMO_MEDIO_12M: Math.round(((d ? Number(d.Total) : 0) / 12) * 100) / 100,
      DIZIMISTAS_12M: d ? Number(d.Dizimistas) : 0,
      DISTANCIA_MAE_KM: (() => { const k = tr.distanciaKm({ lat: e.lat, lng: e.lng }, mae); return k == null ? null : Math.round(k * 10) / 10; })(),
      NIVEL_PSC_MAE: nivelPsc.has(e.congregacaoMaeId) ? nivelPsc.get(e.congregacaoMaeId) : null
    });
  }
  return saida;
}

async function simulacao(pool, { alcance, hoje = hojeBrasilia() }) {
  const rq = () => pool.request();
  const criterios = await lerCriterios(rq);
  const r = await rq().query(`
    SELECT e.ExtensaoId, e.Nome, e.CongregacaoMaeId, c.Nome AS MaeNome, CONVERT(varchar(10), e.AbertaEm, 120) AS AbertaEm, e.Lat, e.Lng, c.Lat AS MaeLat, c.Lng AS MaeLng,
           (SELECT TOP 1 p.PedidoId FROM PedidosExpansao p WHERE p.ExtensaoId = e.ExtensaoId AND p.Status IN (N'EM_PARECER', N'AGUARDANDO_CLI')) AS PedidoEmAndamento
    FROM ExtensoesTenda e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId WHERE e.Ativa = 1 ORDER BY c.Nome, e.Nome`);
  const extensoes = r.recordset.filter((l) => veTudo(alcance) || cobre(alcance, l.MaeNome)).map((l) => ({
    extensaoId: l.ExtensaoId, nome: l.Nome, congregacaoMaeId: l.CongregacaoMaeId, maeNome: l.MaeNome, abertaEm: l.AbertaEm, lat: num(l.Lat), lng: num(l.Lng),
    maeLat: num(l.MaeLat), maeLng: num(l.MaeLng), pedidoEmAndamento: l.PedidoEmAndamento || null
  }));
  const medidas = await medidasDasExtensoes(pool, extensoes, hoje);
  return {
    hoje,
    janelaDizimo: tr.janela12Meses(hoje),
    criterios: criterios.filter((c) => c.ativo),
    extensoes: extensoes.map((e) => {
      const m = medidas.get(e.extensaoId) || {};
      const avaliacao = tr.avaliarExtensao(criterios, m);
      // só o que os critérios ativos usam sai da resposta (o resto nem é preciso para a tela); o dízimo médio de menos de 3 dizimistas sai sem o valor
      const ativos = new Set(avaliacao.itens.map((i) => i.indicador));
      const ocultarDizimo = (Number(m.DIZIMISTAS_12M) || 0) < MINIMO_DIZIMISTAS_PARA_MOSTRAR;
      const visiveis = {};
      for (const k of ativos) visiveis[k] = k === "DIZIMO_MEDIO_12M" && ocultarDizimo ? null : m[k];
      avaliacao.itens = avaliacao.itens.map((i) => (i.indicador === "DIZIMO_MEDIO_12M" && ocultarDizimo ? { ...i, medido: null, oculto: true } : i));
      return {
        extensaoId: e.extensaoId, nome: e.nome, maeNome: e.maeNome, abertaEm: e.abertaEm, medidas: visiveis, avaliacao, pedidoEmAndamento: e.pedidoEmAndamento,
        // o atalho para o pedido de emancipação da v9.2: quem cuida da Mãe (o Dirigente, o Pastor da Área) ou o nível geral, e sem pedido já correndo
        podePedir: avaliacao.situacao === "ATENDE_TUDO" && !e.pedidoEmAndamento && cobre(alcance, e.maeNome)
      };
    }).sort((a, b) => (Number(b.avaliacao.situacao === "ATENDE_TUDO") - Number(a.avaliacao.situacao === "ATENDE_TUDO")) || (b.avaliacao.atendidos - a.avaliacao.atendidos)
      || a.maeNome.localeCompare(b.maeNome, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"))
  };
}

async function listarCriterios(pool) {
  const par = await lerParametros(() => pool.request());
  return { criterios: await lerCriterios(() => pool.request()), raioKm: par.raioKm, versaoParametros: par.versao };
}

// ================================================================ LGPD ================================================================
// O endereço em linhas da pessoa (o Meus Dados mostra o que está guardado).
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT ${SELECT_PARTES} FROM MembroReferencia m LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId WHERE m.MembroId = @id`);
  const l = r.recordset[0];
  return l ? partesDaLinha(l) : null;
}
// Os atos da pessoa no território: os bairros que cadastrou ou mudou, os critérios que criou ou mudou e os pontos de Extensão que marcou.
async function atosDoTitular(pool, membroId) {
  const rq = () => pool.request().input("id", sql.Int, membroId);
  const b = await rq().query(`SELECT Nome, Cidade, UF, CASE WHEN CriadoPor = @id THEN 1 ELSE 0 END AS Criou, CONVERT(varchar(33), CriadoEm, 126) AS CriadoEm,
                                     CASE WHEN AlteradoPor = @id THEN 1 ELSE 0 END AS Alterou, CONVERT(varchar(33), AlteradoEm, 126) AS AlteradoEm
                              FROM Bairros WHERE CriadoPor = @id OR AlteradoPor = @id ORDER BY BairroId`);
  const c = await rq().query(`SELECT Indicador, CASE WHEN CriadoPor = @id THEN 1 ELSE 0 END AS Criou, CONVERT(varchar(33), CriadoEm, 126) AS CriadoEm,
                                     CASE WHEN AlteradoPor = @id THEN 1 ELSE 0 END AS Alterou, CONVERT(varchar(33), AlteradoEm, 126) AS AlteradoEm
                              FROM CriteriosEmancipacao WHERE CriadoPor = @id OR AlteradoPor = @id ORDER BY CriterioId`);
  const e = await rq().query(`SELECT Nome, CONVERT(varchar(33), PontoMarcadoEm, 126) AS Em FROM ExtensoesTenda WHERE PontoMarcadoPor = @id ORDER BY ExtensaoId`);
  const p = await rq().query(`SELECT CONVERT(varchar(33), AlteradoEm, 126) AS Em FROM TerritorioParametros WHERE AlteradoPor = @id`);
  return {
    bairros: b.recordset.map((l) => ({ bairro: `${l.Nome} (${l.Cidade}/${String(l.UF).trim()})`, cadastrou: !!l.Criou, cadastradoEm: l.Criou ? instante(l.CriadoEm) : null, ultimaMudancaEm: l.Alterou ? instante(l.AlteradoEm) : null })),
    criterios: c.recordset.map((l) => ({ indicador: (tr.INDICADORES[l.Indicador] || {}).rotulo || l.Indicador, criou: !!l.Criou, criadoEm: l.Criou ? instante(l.CriadoEm) : null, ultimaMudancaEm: l.Alterou ? instante(l.AlteradoEm) : null })),
    pontosDeExtensao: e.recordset.map((l) => ({ extensao: l.Nome, marcadoEm: instante(l.Em) })),
    raioDeCobertura: p.recordset.map((l) => ({ mudadoEm: instante(l.Em) }))
  };
}

// A lista dos bairros para a pessoa escolher (o Meus Dados e o cadastro): só o catálogo ativo, sem dado de ninguém.
async function bairrosParaEscolher(pool) {
  const r = await pool.request().query(`SELECT BairroId, Nome, Cidade, UF FROM Bairros WHERE Ativo = 1 ORDER BY Cidade, Nome`);
  return r.recordset.map((l) => ({ bairroId: l.BairroId, nome: l.Nome, cidade: l.Cidade, uf: String(l.UF).trim() }));
}

module.exports = {
  SELECT_PARTES_MEUS: SELECT_PARTES, bairrosParaEscolher, gravarComBairroTravado, SO_MEMBROS, MINIMO_DIZIMISTAS_PARA_MOSTRAR,
  SO_GERAL, catalogos, mapa, listarBairros, criarBairro, editarBairro, ativarBairro, juntarBairros, marcarPontoExtensao, extensoesDoMapa, mudarRaio,
  listarCriterios, criarCriterio, editarCriterio, apagarCriterio, simulacao, medidasDasExtensoes, dadosDoTitular, atosDoTitular,
  prepararEnderecoMembro, entradasEndereco, linhasDiantedaLinhaLegada, SET_ENDERECO, COLUNAS_ENDERECO, VALORES_ENDERECO, partesDaLinha, iso
};
