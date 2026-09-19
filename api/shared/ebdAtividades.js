// shared/ebdAtividades.js (v6.3 — EBD: Lições e atividades)
//
// Continua a FASE 6 em cima da v6.2 (shared/ebdChamada.js). Três peças:
//
// 1) Conteúdo da Lição — estende a MESMA `EbdLicoes` da v6.2 (Titulo/
//    Referencia/Conteudo, migração 103), sem tabela paralela.
// 2) Atividade + Questões — uma Atividade por Lição (`UNIQUE (LicaoId)`),
//    cada questão é um dos 5 tipos do checklist do v6.3. `OpcoesJson`/
//    `GabaritoJson` (colunas de texto) guardam a forma específica de cada
//    tipo — ver `FORMATOS_POR_TIPO` abaixo pra a forma exata esperada de
//    cada um.
// 3) Respostas + correção — `corrigirQuestao` decide MULTIPLA_ESCOLHA/VF/
//    ORDENAR/CORRESPONDENCIA por igualdade estrutural contra o gabarito
//    (sempre auto-corrigível, sem ambiguidade de texto livre). COMPLETAR é
//    a exceção: é resposta digitada em texto livre, então "gabarito" aqui
//    é uma LISTA de variantes aceitas, e a comparação usa
//    `normalizarTexto` (sem acento, minúsculo, espaços colapsados) —
//    reduz falso-negativo de "Jesus" vs "jesus " vs "Jésus", mas continua
//    sendo um match exato (normalizado) contra uma lista fechada, não um
//    julgamento livre de sentido. Por isso o resultado de COMPLETAR nunca
//    é definitivo por si só: a resposta gravada guarda o resultado
//    automático em `Correta`, mas ESSE CAMPO SEMPRE PODE SER SOBRESCRITO
//    manualmente por quem gerencia a atividade (`corrigirRespostaManual`,
//    qualquer tipo, não só COMPLETAR) — nenhuma correção automática de
//    texto livre é tratada como palavra final.
//
// Formatos esperados (opcoes/gabarito já como objeto JS, não strings —
// a serialização JSON fica nas funções de banco, no fim do arquivo):
//
//   MULTIPLA_ESCOLHA  opcoes:   ["Opção A", "Opção B", "Opção C"]
//                     gabarito: 1                      (índice da opção certa, 0-based)
//                     resposta: 1                      (índice escolhido)
//
//   VF                opcoes:   null (não usa)
//                     gabarito: true | false
//                     resposta: true | false
//
//   ORDENAR           opcoes:   ["passo A", "passo B", "passo C"]  (ordem exibida/embaralhada)
//                     gabarito: ["passo A", "passo B", "passo C"]  (ordem correta)
//                     resposta: ["passo B", "passo A", "passo C"]  (ordem que o aluno montou)
//
//   COMPLETAR         opcoes:   null (não usa)
//                     gabarito: ["graça", "graca"]      (lista de variantes aceitas)
//                     resposta: "Graça"                 (texto digitado)
//
//   CORRESPONDENCIA   opcoes:   [{ id: 1, esquerda: "Moisés", direita: "Êxodo" },
//                                { id: 2, esquerda: "Davi",   direita: "Salmos" }]
//                     gabarito: (o mesmo array de opcoes — o pareamento correto É
//                                a própria autoria: id 1 casa com id 1)
//                     resposta: [{ esquerdaId: 1, direitaId: 1 }, { esquerdaId: 2, direitaId: 2 }]
//
// Lógica pura (testável sem banco) primeiro, funções de banco (finas)
// depois — mesmo padrão de shared/ebdChamada.js / shared/ebdTurmas.js.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const TIPOS_QUESTAO = {
  MULTIPLA_ESCOLHA: "MULTIPLA_ESCOLHA",
  VF: "VF",
  ORDENAR: "ORDENAR",
  COMPLETAR: "COMPLETAR",
  CORRESPONDENCIA: "CORRESPONDENCIA"
};
const TIPOS_VALIDOS = Object.values(TIPOS_QUESTAO);

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

// Normalização usada só por COMPLETAR (texto livre): sem acento,
// minúsculo, espaços internos colapsados, sem espaço nas pontas.
function normalizarTexto(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function corrigirMultiplaEscolha(gabarito, resposta) {
  if (resposta === null || resposta === undefined || resposta === "") return false;
  return Number(gabarito) === Number(resposta);
}

function corrigirVF(gabarito, resposta) {
  if (resposta !== true && resposta !== false) return false;
  return Boolean(gabarito) === Boolean(resposta);
}

// Ordem importa: mesma quantidade de itens, na mesma posição (comparação
// por texto normalizado só de espaços nas pontas — "passo A" e "passo A "
// são o mesmo item, mas a ORDEM entre itens diferentes é sempre estrita).
function corrigirOrdenar(gabarito, resposta) {
  if (!Array.isArray(gabarito) || !Array.isArray(resposta)) return false;
  if (gabarito.length === 0 || gabarito.length !== resposta.length) return false;
  return gabarito.every((item, i) => String(item).trim() === String(resposta[i]).trim());
}

// Múltiplas variantes aceitas (o "gabarito" de COMPLETAR é uma lista, não
// um valor único) — ver preâmbulo do arquivo pra decisão de normalização.
function corrigirCompletar(gabaritoVariantes, resposta) {
  if (!Array.isArray(gabaritoVariantes) || gabaritoVariantes.length === 0) return false;
  if (resposta === null || resposta === undefined || String(resposta).trim() === "") return false;
  const respostaNormalizada = normalizarTexto(resposta);
  return gabaritoVariantes.some(variante => normalizarTexto(variante) === respostaNormalizada);
}

// Correspondência é tudo-ou-nada: cada par de `gabarito` (autoria) precisa
// aparecer em `resposta` com esquerdaId === direitaId (o pareamento correto
// é, por construção, id casando com o mesmo id — ver formato no preâmbulo).
// Cobre: resposta menor/maior que o gabarito, id repetido (duplicidade),
// id desconhecido, e pareamento cruzado (esquerdaId != direitaId).
function corrigirCorrespondencia(gabarito, resposta) {
  if (!Array.isArray(gabarito) || !Array.isArray(resposta)) return false;
  if (gabarito.length === 0 || resposta.length !== gabarito.length) return false;
  const idsEsperados = new Set(gabarito.map(par => par.id));
  if (idsEsperados.size !== gabarito.length) return false; // gabarito malformado (id duplicado na autoria)
  const idsJaUsados = new Set();
  for (const par of resposta) {
    if (!par || par.esquerdaId === undefined || par.esquerdaId === null || par.direitaId === undefined || par.direitaId === null) return false;
    if (!idsEsperados.has(par.esquerdaId)) return false;
    if (idsJaUsados.has(par.esquerdaId)) return false;
    idsJaUsados.add(par.esquerdaId);
    if (par.esquerdaId !== par.direitaId) return false;
  }
  return idsJaUsados.size === idsEsperados.size;
}

// Dispatcher único usado tanto no lançamento (auto-correção) quanto nos
// testes — devolve true/false, ou null se o tipo não é reconhecido (nunca
// deveria acontecer contra dado que passou por validarQuestao/CHECK, mas
// função pura não confia em quem chama).
function corrigirQuestao(tipo, gabarito, resposta) {
  switch (tipo) {
    case TIPOS_QUESTAO.MULTIPLA_ESCOLHA: return corrigirMultiplaEscolha(gabarito, resposta);
    case TIPOS_QUESTAO.VF: return corrigirVF(gabarito, resposta);
    case TIPOS_QUESTAO.ORDENAR: return corrigirOrdenar(gabarito, resposta);
    case TIPOS_QUESTAO.COMPLETAR: return corrigirCompletar(gabarito, resposta);
    case TIPOS_QUESTAO.CORRESPONDENCIA: return corrigirCorrespondencia(gabarito, resposta);
    default: return null;
  }
}

// Validação de autoria de uma questão nova — usada antes de gravar (defesa
// em profundidade além do CHECK de Tipo no schema).
function validarQuestao({ tipo, enunciado, opcoes, gabarito }) {
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return { valido: false, mensagem: "Tipo de questão inválido — use MULTIPLA_ESCOLHA, VF, ORDENAR, COMPLETAR ou CORRESPONDENCIA." };
  }
  if (!enunciado || !String(enunciado).trim()) {
    return { valido: false, mensagem: "Informe o enunciado da questão." };
  }

  if (tipo === TIPOS_QUESTAO.MULTIPLA_ESCOLHA) {
    if (!Array.isArray(opcoes) || opcoes.length < 2) return { valido: false, mensagem: "Múltipla escolha exige ao menos 2 opções." };
    const indice = Number(gabarito);
    if (!Number.isInteger(indice) || indice < 0 || indice >= opcoes.length) {
      return { valido: false, mensagem: "Informe o índice da opção correta (gabarito) dentro da lista de opções." };
    }
    return { valido: true };
  }

  if (tipo === TIPOS_QUESTAO.VF) {
    if (gabarito !== true && gabarito !== false) return { valido: false, mensagem: "V/F exige gabarito true ou false." };
    return { valido: true };
  }

  if (tipo === TIPOS_QUESTAO.ORDENAR) {
    if (!Array.isArray(opcoes) || opcoes.length < 2) return { valido: false, mensagem: "Ordenar exige ao menos 2 itens." };
    if (!Array.isArray(gabarito) || gabarito.length !== opcoes.length) {
      return { valido: false, mensagem: "O gabarito de ordenar precisa ter os mesmos itens de opções, na ordem correta." };
    }
    const opcoesOrdenadas = [...opcoes].map(String).sort();
    const gabaritoOrdenado = [...gabarito].map(String).sort();
    if (JSON.stringify(opcoesOrdenadas) !== JSON.stringify(gabaritoOrdenado)) {
      return { valido: false, mensagem: "O gabarito de ordenar precisa conter exatamente os mesmos itens de opções (só a ordem muda)." };
    }
    return { valido: true };
  }

  if (tipo === TIPOS_QUESTAO.COMPLETAR) {
    if (!Array.isArray(gabarito) || gabarito.length === 0 || gabarito.some(v => !String(v || "").trim())) {
      return { valido: false, mensagem: "Completar exige ao menos uma resposta aceita (lista de variantes) no gabarito." };
    }
    return { valido: true };
  }

  if (tipo === TIPOS_QUESTAO.CORRESPONDENCIA) {
    if (!Array.isArray(opcoes) || opcoes.length < 2) return { valido: false, mensagem: "Correspondência exige ao menos 2 pares." };
    const ids = new Set();
    for (const par of opcoes) {
      if (!par || par.id === undefined || par.id === null || !String(par.esquerda || "").trim() || !String(par.direita || "").trim()) {
        return { valido: false, mensagem: "Cada par de correspondência precisa de id, esquerda e direita preenchidos." };
      }
      if (ids.has(par.id)) return { valido: false, mensagem: "Ids de correspondência duplicados." };
      ids.add(par.id);
    }
    return { valido: true };
  }

  return { valido: false, mensagem: "Tipo de questão inválido." };
}

// Agrega os resultados (true/false/null) de todas as questões de uma
// atividade — não-respondida OU pendente de correção manual entra como
// "errada" no denominador (nota de prova real: quem não respondeu, não
// pontua), mas o resumo também expõe `pendentes` pra distinguir "errou" de
// "ainda não foi corrigido" na tela.
function calcularNotaAtividade(resultados) {
  const lista = resultados || [];
  const totalQuestoes = lista.length;
  if (totalQuestoes === 0) {
    return { totalQuestoes: 0, respondidas: 0, corretas: 0, pendentes: 0, percentual: 0 };
  }
  const respondidas = lista.filter(r => r && r.respondida).length;
  const corretas = lista.filter(r => r && r.correta === true).length;
  const pendentes = lista.filter(r => r && r.respondida && r.correta === null).length;
  const percentual = Math.round((corretas / totalQuestoes) * 1000) / 10;
  return { totalQuestoes, respondidas, corretas, pendentes, percentual };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function parseJsonSeguro(texto, padrao) {
  if (texto === null || texto === undefined) return padrao;
  try { return JSON.parse(texto); } catch { return padrao; }
}

function mapearQuestao(row) {
  return {
    questaoId: row.QuestaoId, atividadeId: row.AtividadeId, tipo: row.Tipo, enunciado: row.Enunciado,
    opcoes: parseJsonSeguro(row.OpcoesJson, null), gabarito: parseJsonSeguro(row.GabaritoJson, null),
    ordem: row.Ordem
  };
}

async function buscarConteudoLicao(pool, licaoId) {
  const result = await pool.request().input("id", sql.Int, licaoId).query(`
    SELECT LicaoId, CongregacaoId, Data, Status, Titulo, Referencia, Conteudo FROM EbdLicoes WHERE LicaoId = @id
  `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    licaoId: row.LicaoId, congregacaoId: row.CongregacaoId, data: row.Data, status: row.Status,
    titulo: row.Titulo, referencia: row.Referencia, conteudo: row.Conteudo
  };
}

async function atualizarConteudoLicao(pool, { licaoId, titulo, referencia, conteudo }) {
  const licao = await buscarConteudoLicao(pool, licaoId);
  if (!licao) return { sucesso: false, mensagem: "Lição não encontrada." };

  await pool.request()
    .input("id", sql.Int, licaoId)
    .input("titulo", sql.NVarChar(200), titulo || null)
    .input("referencia", sql.NVarChar(200), referencia || null)
    .input("conteudo", sql.NVarChar(sql.MAX), conteudo || null)
    .query(`
      UPDATE EbdLicoes SET Titulo = @titulo, Referencia = @referencia, Conteudo = @conteudo, AtualizadoEm = SYSUTCDATETIME()
      WHERE LicaoId = @id
    `);

  return { sucesso: true, mensagem: "✅ Conteúdo da lição salvo." };
}

// Idempotente: uma Atividade por Lição (UNIQUE (LicaoId)) — se já existe,
// só devolve ela (mesmo espírito de abrirLicao/v6.2).
async function criarOuBuscarAtividade(pool, { licaoId, titulo, criadoPorMembroId }) {
  const existente = await pool.request().input("licaoId", sql.Int, licaoId).query(`SELECT * FROM EbdAtividades WHERE LicaoId = @licaoId`);
  if (existente.recordset[0]) {
    const row = existente.recordset[0];
    return { sucesso: true, atividadeId: row.AtividadeId, mensagem: "Atividade já existia para esta lição." };
  }

  const result = await pool.request()
    .input("licaoId", sql.Int, licaoId).input("titulo", sql.NVarChar(200), titulo || null)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdAtividades (LicaoId, Titulo, CriadoPorMembroId)
      OUTPUT INSERTED.AtividadeId
      VALUES (@licaoId, @titulo, @criadoPor)
    `);
  const atividadeId = result.recordset[0].AtividadeId;

  await registrarAuditoria({
    tabela: "EbdAtividades", registroId: atividadeId, acao: "ATIVIDADE_CRIADA",
    usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { licaoId, titulo }
  });

  return { sucesso: true, atividadeId, mensagem: "✅ Atividade criada." };
}

async function buscarAtividadePorLicao(pool, licaoId) {
  const result = await pool.request().input("licaoId", sql.Int, licaoId).query(`SELECT * FROM EbdAtividades WHERE LicaoId = @licaoId`);
  const row = result.recordset[0];
  if (!row) return null;
  const atividade = { atividadeId: row.AtividadeId, licaoId: row.LicaoId, titulo: row.Titulo };
  atividade.questoes = await listarQuestoesPorAtividade(pool, atividade.atividadeId);
  return atividade;
}

async function listarQuestoesPorAtividade(pool, atividadeId) {
  const result = await pool.request().input("atividadeId", sql.Int, atividadeId).query(`
    SELECT * FROM EbdAtividadeQuestoes WHERE AtividadeId = @atividadeId ORDER BY Ordem, QuestaoId
  `);
  return result.recordset.map(mapearQuestao);
}

async function buscarQuestaoPorId(pool, questaoId) {
  const result = await pool.request().input("id", sql.Int, questaoId).query(`SELECT * FROM EbdAtividadeQuestoes WHERE QuestaoId = @id`);
  const row = result.recordset[0];
  return row ? mapearQuestao(row) : null;
}

async function adicionarQuestao(pool, { atividadeId, tipo, enunciado, opcoes, gabarito, ordem, criadoPorMembroId }) {
  const validacao = validarQuestao({ tipo, enunciado, opcoes, gabarito });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const result = await pool.request()
    .input("atividadeId", sql.Int, atividadeId).input("tipo", sql.NVarChar(20), tipo)
    .input("enunciado", sql.NVarChar(sql.MAX), enunciado.trim())
    .input("opcoes", sql.NVarChar(sql.MAX), opcoes === undefined || opcoes === null ? null : JSON.stringify(opcoes))
    .input("gabarito", sql.NVarChar(sql.MAX), JSON.stringify(gabarito))
    .input("ordem", sql.Int, Number.isInteger(ordem) ? ordem : 0)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdAtividadeQuestoes (AtividadeId, Tipo, Enunciado, OpcoesJson, GabaritoJson, Ordem, CriadoPorMembroId)
      OUTPUT INSERTED.QuestaoId
      VALUES (@atividadeId, @tipo, @enunciado, @opcoes, @gabarito, @ordem, @criadoPor)
    `);
  const questaoId = result.recordset[0].QuestaoId;

  await registrarAuditoria({
    tabela: "EbdAtividadeQuestoes", registroId: questaoId, acao: "QUESTAO_CRIADA",
    usuarioId: criadoPorMembroId, dadosAntes: null, dadosDepois: { atividadeId, tipo }
  });

  return { sucesso: true, questaoId, mensagem: "✅ Questão adicionada." };
}

async function buscarRespostaExistente(pool, questaoId, alunoId) {
  const result = await pool.request().input("questaoId", sql.Int, questaoId).input("alunoId", sql.Int, alunoId).query(`
    SELECT * FROM EbdRespostasAlunos WHERE QuestaoId = @questaoId AND AlunoId = @alunoId
  `);
  return result.recordset[0] || null;
}

// Lança/corrige a resposta de UM aluno pra UMA questão (upsert, mesmo
// espírito de decidirAcaoRegistroPresenca/v6.2 — corrigir um lançamento
// errado é rotina). Auto-corrige contra o gabarito da própria questão.
async function registrarRespostaAluno(pool, { questaoId, alunoId, resposta, registradoPorMembroId }) {
  const questao = await buscarQuestaoPorId(pool, questaoId);
  if (!questao) return { sucesso: false, mensagem: "Questão não encontrada." };

  const correta = corrigirQuestao(questao.tipo, questao.gabarito, resposta);
  const respostaJson = JSON.stringify(resposta === undefined ? null : resposta);
  const existente = await buscarRespostaExistente(pool, questaoId, alunoId);

  if (existente) {
    await pool.request()
      .input("id", sql.Int, existente.RespostaId).input("resposta", sql.NVarChar(sql.MAX), respostaJson)
      .input("correta", sql.Bit, correta)
      .query(`
        UPDATE EbdRespostasAlunos
        SET RespostaJson = @resposta, Correta = @correta, AtualizadoEm = SYSUTCDATETIME(),
            CorrigidoPorMembroId = NULL, CorrigidoEm = NULL
        WHERE RespostaId = @id
      `);
  } else {
    await pool.request()
      .input("questaoId", sql.Int, questaoId).input("alunoId", sql.Int, alunoId)
      .input("resposta", sql.NVarChar(sql.MAX), respostaJson).input("correta", sql.Bit, correta)
      .input("registradoPor", sql.Int, registradoPorMembroId || null)
      .query(`
        INSERT INTO EbdRespostasAlunos (QuestaoId, AlunoId, RespostaJson, Correta, RegistradoPorMembroId)
        VALUES (@questaoId, @alunoId, @resposta, @correta, @registradoPor)
      `);
  }

  await registrarAuditoria({
    tabela: "EbdRespostasAlunos", registroId: existente ? existente.RespostaId : null, acao: "RESPOSTA_LANCADA",
    usuarioId: registradoPorMembroId, dadosAntes: existente ? { correta: existente.Correta } : null,
    dadosDepois: { questaoId, alunoId, correta }
  });

  return { sucesso: true, correta, mensagem: "✅ Resposta registrada." };
}

// Correção manual — sempre disponível, qualquer tipo (ver preâmbulo:
// nenhuma auto-correção de texto livre é palavra final; e mesmo os tipos
// 100% estruturais podem ter uma questão mal cadastrada que precise de
// ajuste humano pontual).
async function corrigirRespostaManual(pool, { respostaId, correta, corrigidoPorMembroId }) {
  const existente = await pool.request().input("id", sql.Int, respostaId).query(`SELECT * FROM EbdRespostasAlunos WHERE RespostaId = @id`);
  const row = existente.recordset[0];
  if (!row) return { sucesso: false, mensagem: "Resposta não encontrada." };

  await pool.request()
    .input("id", sql.Int, respostaId).input("correta", sql.Bit, Boolean(correta))
    .input("corrigidoPor", sql.Int, corrigidoPorMembroId || null)
    .query(`
      UPDATE EbdRespostasAlunos
      SET Correta = @correta, CorrigidoPorMembroId = @corrigidoPor, CorrigidoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME()
      WHERE RespostaId = @id
    `);

  await registrarAuditoria({
    tabela: "EbdRespostasAlunos", registroId: respostaId, acao: "RESPOSTA_CORRIGIDA_MANUAL",
    usuarioId: corrigidoPorMembroId, dadosAntes: { correta: row.Correta }, dadosDepois: { correta: Boolean(correta) }
  });

  return { sucesso: true, mensagem: "✅ Correção registrada." };
}

// Respostas de UM aluno na atividade inteira, questão a questão (join com
// EbdAtividadeQuestoes pra trazer enunciado/tipo junto).
async function listarRespostasAluno(pool, { atividadeId, alunoId }) {
  const result = await pool.request().input("atividadeId", sql.Int, atividadeId).input("alunoId", sql.Int, alunoId).query(`
    SELECT q.QuestaoId, q.Tipo, q.Enunciado, q.Ordem, r.RespostaId, r.RespostaJson, r.Correta, r.RegistradoEm, r.CorrigidoPorMembroId, r.CorrigidoEm
    FROM EbdAtividadeQuestoes q
    LEFT JOIN EbdRespostasAlunos r ON r.QuestaoId = q.QuestaoId AND r.AlunoId = @alunoId
    WHERE q.AtividadeId = @atividadeId
    ORDER BY q.Ordem, q.QuestaoId
  `);
  return result.recordset.map(row => ({
    questaoId: row.QuestaoId, tipo: row.Tipo, enunciado: row.Enunciado,
    respostaId: row.RespostaId || null, resposta: parseJsonSeguro(row.RespostaJson, null),
    respondida: row.RespostaId !== null && row.RespostaId !== undefined,
    correta: row.RespostaId ? row.Correta : null,
    corrigidoManualmente: !!row.CorrigidoPorMembroId
  }));
}

async function calcularResumoAluno(pool, { atividadeId, alunoId }) {
  const respostas = await listarRespostasAluno(pool, { atividadeId, alunoId });
  return calcularNotaAtividade(respostas);
}

// Nota de cada aluno ATIVO da turma nesta atividade — pra tela de
// acompanhamento do professor (mesmo espírito do roster de chamada/v6.2).
async function listarResumoTurma(pool, { atividadeId, turmaId }) {
  const alunos = await pool.request().input("turmaId", sql.Int, turmaId).query(`
    SELECT a.AlunoId, a.Matricula, m.Nome AS MembroNome
    FROM EbdAlunos a JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.TurmaId = @turmaId AND a.Ativo = 1
    ORDER BY m.Nome
  `);
  const resultado = [];
  for (const aluno of alunos.recordset) {
    const resumo = await calcularResumoAluno(pool, { atividadeId, alunoId: aluno.AlunoId });
    resultado.push({ alunoId: aluno.AlunoId, matricula: aluno.Matricula, membroNome: aluno.MembroNome, ...resumo });
  }
  return resultado;
}

module.exports = {
  TIPOS_QUESTAO,
  normalizarTexto, corrigirMultiplaEscolha, corrigirVF, corrigirOrdenar, corrigirCompletar, corrigirCorrespondencia,
  corrigirQuestao, validarQuestao, calcularNotaAtividade,
  buscarConteudoLicao, atualizarConteudoLicao,
  criarOuBuscarAtividade, buscarAtividadePorLicao, listarQuestoesPorAtividade, buscarQuestaoPorId, adicionarQuestao,
  registrarRespostaAluno, corrigirRespostaManual, listarRespostasAluno, calcularResumoAluno, listarResumoTurma
};
