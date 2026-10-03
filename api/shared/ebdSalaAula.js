// shared/ebdSalaAula.js (v6.10 — EBD: Sala de aula assistida e material)
//
// Fecha a FASE 6 em cima do que ela já tem. Três peças (a quarta, o pedido
// de revistas pela matrícula, mora em shared/ebdRevistas.js):
//
// 1) Chamada offline — o professor marca no celular sem sinal; o aparelho
//    guarda numa fila e manda um LOTE por (turma, domingo) quando a conexão
//    volta. Aqui ficam a validação do lote, a regra de conflito e a gravação,
//    que reaproveita registrarPresencaAluno/registrarVisitante da v6.2 (mesma
//    auditoria, mesmo motor de conquistas) em vez de um caminho paralelo.
//    Regras:
//      * a data não pode ser futura nem ter mais de 30 dias (marcação velha
//        demais vai pela tela normal, com a lição reaberta por quem administra);
//      * sem lição naquela data, a sincronização ABRE a lição — quem marcou é
//        professor ativo da turma (ou gestor), e abrir a lição só existe para
//        permitir a chamada; com a lição FECHADA, o lote inteiro volta e fica
//        guardado no aparelho até alguém reabrir;
//      * conflito: se a presença no servidor foi marcada DEPOIS da marcação
//        do aparelho e diz outra coisa, vale o servidor (a correção de quem
//        administra não é desfeita por um celular que ficou dias sem rede).
//        A "hora" do servidor é MarcadoOfflineEm quando a linha veio de outro
//        aparelho, senão AtualizadoEm;
//      * visitante leva uma chave gerada no aparelho (ChaveCliente, índice
//        único filtrado da migração 111): reenviar não duplica.
// 2) Plano de aula e material — por DATA (não por EbdLicoes, que só nasce
//    quando alguém abre a chamada), com alcance opcional: congregação
//    (NULL = campo inteiro) e faixa etária (NULL = todas as classes). O
//    professor vê só o PUBLICADO que se aplica à turma dele, o mais
//    específico primeiro. Material é link https (sem upload).
// 3) Alerta de ausência — quem não vem há N domingos seguidos (N do catálogo
//    de Prazos, sigla EBD_AUSENCIA_DOMINGOS, padrão 3). "Ausência" segue a
//    definição da caderneta (v6.8): num domingo em que a turma teve chamada,
//    quem não está PRESENTE está ausente — marcado AUSENTE ou nem marcado.
//    Domingos antes da entrada do aluno na turma não contam (a referência é
//    a data mais recente entre a matrícula e a última alteração da matrícula
//    — a transferência de turma não guarda histórico, então isso evita
//    acusar falta de quem acabou de chegar; o custo é, no máximo, atrasar o
//    alerta de quem teve a matrícula editada).
//
// Lógica pura (testável sem banco) primeiro, funções de banco depois —
// mesmo padrão de shared/ebdChamada.js / shared/ebdCaderneta.js.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const chamada = require("./ebdChamada");

const DIAS_MAX_ATRASO_OFFLINE = 30;
const LIMITE_REGISTROS_LOTE = 300;
const LIMITE_VISITANTES_LOTE = 100;
const DOMINGOS_AUSENCIA_PADRAO = 3;
const DIAS_JANELA_AUSENCIA = 200; // ~28 domingos: a sequência é contada até aqui
const STATUS_PLANO = { RASCUNHO: "RASCUNHO", PUBLICADO: "PUBLICADO" };
const REGEX_CHAVE_CLIENTE = /^[A-Za-z0-9_-]{8,64}$/;

// ---------------------------------------------------------------
// Lógica pura — datas
// ---------------------------------------------------------------

// "Hoje" em Brasília (UTC-3, sem horário de verão desde 2019). As Functions
// rodam em UTC: sem isto, entre 21h e meia-noite o servidor já estaria no
// dia seguinte.
function hojeBrasilia(agora = new Date()) {
  return require("./dataBrasilia").hojeBrasilia(agora);
}

function dataIsoValida(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso;
}

// Dia (AAAA-MM-DD) de um valor de coluna DATE/DATETIME2 (o mssql devolve
// Date à meia-noite UTC para DATE) ou de uma string ISO.
function paraIsoData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor) ? null : valor.toISOString().slice(0, 10);
  const s = String(valor).slice(0, 10);
  return dataIsoValida(s) ? s : null;
}

function diasEntre(isoInicio, isoFim) {
  return Math.round((new Date(`${isoFim}T00:00:00Z`) - new Date(`${isoInicio}T00:00:00Z`)) / 86400000);
}

function formatarDataBr(iso) {
  const d = paraIsoData(iso);
  if (!d) return "";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

function normalizarTexto(valor) {
  return String(valor == null ? "" : valor).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ---------------------------------------------------------------
// Lógica pura — chamada offline
// ---------------------------------------------------------------

// Valida e normaliza um lote vindo do aparelho. Problema no lote inteiro
// (turma, data, tamanho) recusa tudo; problema num item só recusa aquele item
// (vai em `rejeitados`, com o motivo, e o aparelho tira da fila e mostra).
// Marcações repetidas do mesmo aluno: vale a mais recente.
function validarLoteOffline(lote = {}, { hoje = hojeBrasilia(), agora = new Date() } = {}) {
  const turmaId = Number(lote.turmaId);
  if (!Number.isInteger(turmaId) || turmaId <= 0) return { valido: false, mensagem: "Informe a turma." };
  if (!dataIsoValida(lote.data)) return { valido: false, mensagem: "Data inválida — use AAAA-MM-DD." };
  if (lote.data > hoje) return { valido: false, mensagem: "A data da chamada está no futuro — confira a data do aparelho." };
  if (diasEntre(lote.data, hoje) > DIAS_MAX_ATRASO_OFFLINE) {
    return { valido: false, mensagem: `Chamada de mais de ${DIAS_MAX_ATRASO_OFFLINE} dias atrás não entra pela sincronização — peça a quem administra a EBD para lançar pela tela normal.` };
  }
  const registrosBrutos = lote.registros == null ? [] : lote.registros;
  const visitantesBrutos = lote.visitantes == null ? [] : lote.visitantes;
  if (!Array.isArray(registrosBrutos) || !Array.isArray(visitantesBrutos)) return { valido: false, mensagem: "Formato do lote inválido." };
  if (registrosBrutos.length > LIMITE_REGISTROS_LOTE || visitantesBrutos.length > LIMITE_VISITANTES_LOTE) {
    return { valido: false, mensagem: "Lote grande demais para uma turma — envie em partes." };
  }
  if (registrosBrutos.length === 0 && visitantesBrutos.length === 0) return { valido: false, mensagem: "Nada para sincronizar." };

  const rejeitados = [];
  const lerMarcadoEm = (valor) => {
    const d = new Date(valor);
    if (!valor || isNaN(d)) return null;
    return d > agora ? new Date(agora.getTime()) : d; // relógio do aparelho adiantado: limita a agora
  };

  const porAluno = new Map();
  for (const r of registrosBrutos) {
    const alunoId = Number(r && r.alunoId);
    if (!Number.isInteger(alunoId) || alunoId <= 0) { rejeitados.push({ tipo: "PRESENCA", alunoId: r && r.alunoId, motivo: "Aluno inválido." }); continue; }
    const status = r.status;
    if (status !== chamada.STATUS_PRESENCA.PRESENTE && status !== chamada.STATUS_PRESENCA.AUSENTE) {
      rejeitados.push({ tipo: "PRESENCA", alunoId, motivo: "Status inválido — use PRESENTE ou AUSENTE." }); continue;
    }
    const marcadoEm = lerMarcadoEm(r.marcadoEm);
    if (!marcadoEm) { rejeitados.push({ tipo: "PRESENCA", alunoId, motivo: "Hora da marcação inválida." }); continue; }
    const anterior = porAluno.get(alunoId);
    if (!anterior || anterior.marcadoEm <= marcadoEm) porAluno.set(alunoId, { alunoId, status, marcadoEm });
  }

  const porChave = new Map();
  for (const v of visitantesBrutos) {
    const chaveCliente = v && typeof v.chaveCliente === "string" ? v.chaveCliente : "";
    if (!REGEX_CHAVE_CLIENTE.test(chaveCliente)) { rejeitados.push({ tipo: "VISITANTE", chaveCliente: chaveCliente || null, motivo: "Chave do visitante inválida." }); continue; }
    const nome = String(v.nome || "").trim();
    if (!nome) { rejeitados.push({ tipo: "VISITANTE", chaveCliente, motivo: "Informe o nome do visitante." }); continue; }
    if (nome.length > 150) { rejeitados.push({ tipo: "VISITANTE", chaveCliente, motivo: "Nome do visitante longo demais (máx. 150)." }); continue; }
    const contato = v.contato ? String(v.contato).trim().slice(0, 150) : null;
    const marcadoEm = lerMarcadoEm(v.marcadoEm);
    if (!marcadoEm) { rejeitados.push({ tipo: "VISITANTE", chaveCliente, motivo: "Hora da marcação inválida." }); continue; }
    porChave.set(chaveCliente, { chaveCliente, nome, contato: contato || null, marcadoEm });
  }

  return {
    valido: true, turmaId, data: lote.data,
    registros: Array.from(porAluno.values()), visitantes: Array.from(porChave.values()), rejeitados
  };
}

// Decide o que fazer com UMA marcação do aparelho diante do que já está no
// servidor (ver preâmbulo). `existente` vem de mapearChamada (ebdChamada.js).
function decidirAplicacaoOffline(existente, { status, marcadoEm }) {
  if (!existente) return "CRIAR";
  if (existente.status === status) return "IGUAL";
  const horaServidor = new Date(existente.marcadoOfflineEm || existente.atualizadoEm || existente.registradoEm);
  if (!isNaN(horaServidor) && horaServidor > marcadoEm) return "CONFLITO";
  return "ATUALIZAR";
}

// Violação de UNIQUE / índice único no SQL Server (2627 / 2601) — o mssql
// expõe o número em `number` (às vezes só em `originalError.info.number`).
function ehViolacaoDeUnicidade(e) {
  const numero = e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
  return numero === 2627 || numero === 2601;
}

// ---------------------------------------------------------------
// Lógica pura — plano de aula
// ---------------------------------------------------------------

function validarPlanoAula({ data, titulo, referencia, objetivo, roteiro, faixaEtaria } = {}) {
  if (!dataIsoValida(data)) return { valido: false, mensagem: "Informe a data (domingo) do plano — AAAA-MM-DD." };
  const t = String(titulo || "").trim();
  if (t.length < 3) return { valido: false, mensagem: "Informe o título do plano (pelo menos 3 caracteres)." };
  if (t.length > 200) return { valido: false, mensagem: "Título longo demais (máx. 200)." };
  if (referencia && String(referencia).length > 200) return { valido: false, mensagem: "Referência longa demais (máx. 200)." };
  if (objetivo && String(objetivo).length > 1000) return { valido: false, mensagem: "Objetivo longo demais (máx. 1000)." };
  if (roteiro && String(roteiro).length > 20000) return { valido: false, mensagem: "Roteiro longo demais (máx. 20000)." };
  if (faixaEtaria && String(faixaEtaria).length > 60) return { valido: false, mensagem: "Faixa etária longa demais (máx. 60)." };
  return { valido: true };
}

// Só https: o link é aberto pelo professor com um toque — `javascript:`,
// `data:` ou http em claro nunca entram (o CHECK da migração 111 repete a
// regra no banco).
function validarMaterial({ titulo, url } = {}) {
  const t = String(titulo || "").trim();
  if (!t) return { valido: false, mensagem: "Informe o título do material." };
  if (t.length > 200) return { valido: false, mensagem: "Título longo demais (máx. 200)." };
  const u = String(url || "").trim();
  if (u.length > 500) return { valido: false, mensagem: "Link longo demais (máx. 500)." };
  let analisado;
  try { analisado = new URL(u); } catch { return { valido: false, mensagem: "Link inválido." }; }
  if (analisado.protocol !== "https:" || !u.toLowerCase().startsWith("https://")) return { valido: false, mensagem: "O link precisa começar com https://." };
  return { valido: true };
}

function planoSeAplicaATurma(plano, turma) {
  if (!plano || !turma) return false;
  if (plano.congregacaoId != null && plano.congregacaoId !== turma.congregacaoId) return false;
  if (plano.faixaEtaria && normalizarTexto(plano.faixaEtaria) !== normalizarTexto(turma.faixaEtaria)) return false;
  return true;
}

// O mais específico primeiro: congregação + faixa > só congregação > só
// faixa > campo inteiro. Empate: o mais novo.
function ordenarPlanosPorEspecificidade(planos) {
  const peso = p => (p.congregacaoId != null ? 2 : 0) + (p.faixaEtaria ? 1 : 0);
  return [...planos].sort((a, b) => peso(b) - peso(a) || b.planoId - a.planoId);
}

// ---------------------------------------------------------------
// Lógica pura — ausência
// ---------------------------------------------------------------

// alunos:   [{ alunoId, nome, desde }]   desde = AAAA-MM-DD a partir do qual conta
// licoes:   [{ licaoId, data }]          domingos em que a TURMA teve chamada
// presentes: Set de `${licaoId}:${alunoId}` com status PRESENTE
// Devolve quem acumula `minimo` domingos ou mais sem presença, contando do
// mais recente para trás até a última presença.
function calcularSequenciasAusencia({ alunos = [], licoes = [], presentes = new Set(), minimo = DOMINGOS_AUSENCIA_PADRAO } = {}) {
  const ordenadas = licoes
    .map(l => ({ licaoId: l.licaoId, data: paraIsoData(l.data) }))
    .filter(l => l.data)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  const resultado = [];
  for (const aluno of alunos) {
    const desde = paraIsoData(aluno.desde);
    let domingos = 0;
    let inicio = null;
    let ultimaFalta = null;
    let ultimaPresenca = null;
    for (const l of ordenadas) {
      if (desde && l.data < desde) break;
      if (presentes.has(`${l.licaoId}:${aluno.alunoId}`)) { ultimaPresenca = l.data; break; }
      domingos++;
      inicio = l;
      if (!ultimaFalta) ultimaFalta = l;
    }
    if (domingos >= minimo) {
      resultado.push({
        alunoId: aluno.alunoId, nome: aluno.nome, domingos,
        licaoInicioId: inicio.licaoId, faltaDesde: inicio.data,
        ultimaLicaoId: ultimaFalta.licaoId, ultimaPresenca
      });
    }
  }
  return resultado.sort((a, b) => b.domingos - a.domingos || String(a.nome).localeCompare(String(b.nome)));
}

function textoAlertaAusencia({ nome, domingos, ultimaPresenca, turmaNome, congregacaoNome }) {
  const onde = [turmaNome ? `turma ${turmaNome}` : null, congregacaoNome].filter(Boolean).join(", ");
  return `${nome}${onde ? ` (${onde})` : ""} não vem à EBD há ${domingos} domingo(s) seguido(s)`
    + (ultimaPresenca ? ` — última presença em ${formatarDataBr(ultimaPresenca)}.` : " — sem presença registrada no último semestre.");
}

// ---------------------------------------------------------------
// Funções de banco — chamada offline
// ---------------------------------------------------------------

async function buscarTurmaComCongregacao(pool, turmaId) {
  const r = await pool.request().input("id", sql.Int, turmaId).query(`
    SELECT t.TurmaId, t.Nome, t.FaixaEtaria, t.CongregacaoId, t.Ativa, c.Nome AS CongregacaoNome
    FROM EbdTurmas t JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId
    WHERE t.TurmaId = @id
  `);
  const row = r.recordset[0];
  return row ? {
    turmaId: row.TurmaId, nome: row.Nome, faixaEtaria: row.FaixaEtaria, congregacaoId: row.CongregacaoId,
    congregacaoNome: row.CongregacaoNome, ativa: row.Ativa !== false
  } : null;
}

// Pacote que o aparelho guarda para a chamada sem sinal: o mínimo para
// identificar o aluno na sala (id e nome — nunca matrícula, contato ou
// nascimento), a lição do dia se já existir (com o que já foi marcado) e os
// planos publicados para a turma naquela data.
async function montarPacoteOffline(pool, { turma, data }) {
  const alunos = await pool.request().input("turmaId", sql.Int, turma.turmaId).query(`
    SELECT a.AlunoId, COALESCE(m.Nome, a.NomeNaoMembro) AS Nome
    FROM EbdAlunos a LEFT JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.TurmaId = @turmaId AND a.Ativo = 1
    ORDER BY COALESCE(m.Nome, a.NomeNaoMembro)
  `);
  const licao = await chamada.buscarLicaoPorCongregacaoData(pool, turma.congregacaoId, data);
  const presencas = {};
  if (licao) {
    const r = await pool.request().input("licaoId", sql.Int, licao.licaoId).input("turmaId", sql.Int, turma.turmaId).query(`
      SELECT AlunoId, Status FROM EbdChamadas WHERE LicaoId = @licaoId AND TurmaId = @turmaId AND AlunoId IS NOT NULL
    `);
    for (const row of r.recordset) presencas[row.AlunoId] = row.Status;
  }
  return {
    turma: { turmaId: turma.turmaId, nome: turma.nome, faixaEtaria: turma.faixaEtaria || null, congregacaoId: turma.congregacaoId, congregacaoNome: turma.congregacaoNome },
    data,
    alunos: alunos.recordset.map(a => ({ alunoId: a.AlunoId, nome: a.Nome })),
    licao: licao ? { licaoId: licao.licaoId, status: licao.status } : null,
    presencas,
    planos: await listarPlanosParaTurma(pool, { turma, data }),
    geradoEm: new Date().toISOString()
  };
}

async function garantirLicaoParaSincronizar(pool, { turma, data, membroId }) {
  let licao = await chamada.buscarLicaoPorCongregacaoData(pool, turma.congregacaoId, data);
  if (licao) return { licao, abertaAgora: false };
  try {
    const aberta = await chamada.abrirLicao(pool, { congregacaoId: turma.congregacaoId, data, abertoPorMembroId: membroId, origem: "SINCRONIZACAO_OFFLINE" });
    if (aberta.sucesso) return { licao: await chamada.buscarLicaoPorId(pool, aberta.licaoId), abertaAgora: true };
  } catch (e) {
    if (!ehViolacaoDeUnicidade(e)) throw e; // outro aparelho abriu no mesmo instante
  }
  licao = await chamada.buscarLicaoPorCongregacaoData(pool, turma.congregacaoId, data);
  return { licao, abertaAgora: false };
}

// `lote` já passou por validarLoteOffline; a permissão (gestor no escopo ou
// professor ativo da turma) é conferida pelo handler antes de chegar aqui.
async function sincronizarChamadaOffline(pool, { lote, turma, membroId }) {
  const { licao, abertaAgora } = await garantirLicaoParaSincronizar(pool, { turma, data: lote.data, membroId });
  if (!licao || licao.status !== chamada.STATUS_LICAO.ABERTA) {
    return {
      sucesso: false, codigo: "LICAO_FECHADA",
      mensagem: `A lição de ${formatarDataBr(lote.data)} já foi fechada — peça a quem administra a EBD para reabrir. As marcações continuam guardadas no aparelho.`
    };
  }

  const resultado = { aplicados: [], iguais: [], conflitos: [], rejeitados: [...lote.rejeitados], visitantesCriados: [], visitantesJaEnviados: [] };

  const ativos = await pool.request().input("turmaId", sql.Int, turma.turmaId).query(`
    SELECT AlunoId FROM EbdAlunos WHERE TurmaId = @turmaId AND Ativo = 1
  `);
  const alunosAtivos = new Set(ativos.recordset.map(r => r.AlunoId));
  const existentesRs = await pool.request().input("licaoId", sql.Int, licao.licaoId).query(`
    SELECT * FROM EbdChamadas WHERE LicaoId = @licaoId AND AlunoId IS NOT NULL
  `);
  const existentes = new Map(existentesRs.recordset.map(row => [row.AlunoId, {
    status: row.Status, atualizadoEm: row.AtualizadoEm, registradoEm: row.RegistradoEm, marcadoOfflineEm: row.MarcadoOfflineEm || null
  }]));

  for (const r of lote.registros) {
    if (!alunosAtivos.has(r.alunoId)) { resultado.rejeitados.push({ tipo: "PRESENCA", alunoId: r.alunoId, motivo: "O aluno não está mais ativo nesta turma." }); continue; }
    const existente = existentes.get(r.alunoId);
    const decisao = decidirAplicacaoOffline(existente, r);
    if (decisao === "IGUAL") { resultado.iguais.push({ alunoId: r.alunoId }); continue; }
    if (decisao === "CONFLITO") { resultado.conflitos.push({ alunoId: r.alunoId, statusServidor: existente.status, statusAparelho: r.status }); continue; }
    try {
      const gravado = await chamada.registrarPresencaAluno(pool, {
        licaoId: licao.licaoId, turmaId: turma.turmaId, alunoId: r.alunoId, status: r.status,
        registradoPorMembroId: membroId, marcadoOfflineEm: r.marcadoEm
      });
      if (gravado.sucesso) resultado.aplicados.push({ alunoId: r.alunoId, status: r.status });
      else resultado.rejeitados.push({ tipo: "PRESENCA", alunoId: r.alunoId, motivo: gravado.mensagem });
    } catch (e) {
      // Dois envios do mesmo lote ao mesmo tempo: o outro já gravou.
      if (!ehViolacaoDeUnicidade(e)) throw e;
      resultado.iguais.push({ alunoId: r.alunoId });
    }
  }

  for (const v of lote.visitantes) {
    const ja = await pool.request().input("chave", sql.NVarChar(64), v.chaveCliente).query(`SELECT ChamadaId FROM EbdChamadas WHERE ChaveCliente = @chave`);
    if (ja.recordset.length > 0) { resultado.visitantesJaEnviados.push({ chaveCliente: v.chaveCliente }); continue; }
    try {
      const gravado = await chamada.registrarVisitante(pool, {
        licaoId: licao.licaoId, turmaId: turma.turmaId, visitanteNome: v.nome, visitanteContato: v.contato,
        registradoPorMembroId: membroId, chaveCliente: v.chaveCliente, marcadoOfflineEm: v.marcadoEm
      });
      if (gravado.sucesso) resultado.visitantesCriados.push({ chaveCliente: v.chaveCliente });
      else resultado.rejeitados.push({ tipo: "VISITANTE", chaveCliente: v.chaveCliente, motivo: gravado.mensagem });
    } catch (e) {
      if (!ehViolacaoDeUnicidade(e)) throw e;
      resultado.visitantesJaEnviados.push({ chaveCliente: v.chaveCliente });
    }
  }

  // Resumo do lote na auditoria — só contagens e ids (cada presença e cada
  // visitante já têm a própria linha de auditoria, sem nome).
  await registrarAuditoria({
    tabela: "EbdLicoes", registroId: licao.licaoId, acao: "CHAMADA_OFFLINE_SINCRONIZADA", usuarioId: membroId, dadosAntes: null,
    dadosDepois: {
      turmaId: turma.turmaId, data: lote.data, licaoAbertaAgora: abertaAgora,
      aplicados: resultado.aplicados.length, iguais: resultado.iguais.length, conflitos: resultado.conflitos.length,
      rejeitados: resultado.rejeitados.length, visitantes: resultado.visitantesCriados.length
    }
  });

  const partes = [`${resultado.aplicados.length} presença(s) gravada(s)`];
  if (resultado.visitantesCriados.length) partes.push(`${resultado.visitantesCriados.length} visitante(s)`);
  if (resultado.conflitos.length) partes.push(`${resultado.conflitos.length} já corrigida(s) no sistema (valeu o sistema)`);
  if (resultado.rejeitados.length) partes.push(`${resultado.rejeitados.length} recusada(s)`);
  return { sucesso: true, licaoId: licao.licaoId, licaoAbertaAgora: abertaAgora, ...resultado, mensagem: `✅ Chamada sincronizada: ${partes.join(", ")}.` };
}

// ---------------------------------------------------------------
// Funções de banco — plano de aula
// ---------------------------------------------------------------

function mapearPlano(row) {
  if (!row) return null;
  return {
    planoId: row.PlanoId, data: paraIsoData(row.Data), congregacaoId: row.CongregacaoId == null ? null : row.CongregacaoId,
    congregacaoNome: row.CongregacaoNome || null, faixaEtaria: row.FaixaEtaria || null,
    titulo: row.Titulo, referencia: row.Referencia || null, objetivo: row.Objetivo || null, roteiro: row.Roteiro || null,
    status: row.Status, publicadoEm: row.PublicadoEm || null, ativo: row.Ativo !== false, atualizadoEm: row.AtualizadoEm
  };
}

async function anexarMateriais(pool, planos) {
  if (planos.length === 0) return planos;
  const request = pool.request();
  const ids = planos.map((p, i) => { request.input(`p${i}`, sql.Int, p.planoId); return `@p${i}`; });
  const r = await request.query(`
    SELECT MaterialId, PlanoId, Titulo, Url, Ordem FROM EbdPlanoMateriais
    WHERE Ativo = 1 AND PlanoId IN (${ids.join(",")}) ORDER BY Ordem, MaterialId
  `);
  const porPlano = new Map();
  for (const m of r.recordset) {
    if (!porPlano.has(m.PlanoId)) porPlano.set(m.PlanoId, []);
    porPlano.get(m.PlanoId).push({ materialId: m.MaterialId, titulo: m.Titulo, url: m.Url });
  }
  for (const p of planos) p.materiais = porPlano.get(p.planoId) || [];
  return planos;
}

const SELECT_PLANO = `
  SELECT p.*, c.Nome AS CongregacaoNome
  FROM EbdPlanosAula p LEFT JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId`;

async function buscarPlanoPorId(pool, planoId) {
  const r = await pool.request().input("id", sql.Int, planoId).query(`${SELECT_PLANO} WHERE p.PlanoId = @id AND p.Ativo = 1`);
  const plano = mapearPlano(r.recordset[0]);
  if (!plano) return null;
  return (await anexarMateriais(pool, [plano]))[0];
}

async function criarPlanoAula(pool, { data, congregacaoId, faixaEtaria, titulo, referencia, objetivo, roteiro, criadoPorMembroId }) {
  const validacao = validarPlanoAula({ data, titulo, referencia, objetivo, roteiro, faixaEtaria });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const r = await pool.request()
    .input("data", sql.Date, data).input("congregacaoId", sql.Int, congregacaoId || null)
    .input("faixa", sql.NVarChar(60), faixaEtaria ? String(faixaEtaria).trim() : null)
    .input("titulo", sql.NVarChar(200), String(titulo).trim())
    .input("referencia", sql.NVarChar(200), referencia ? String(referencia).trim() : null)
    .input("objetivo", sql.NVarChar(1000), objetivo ? String(objetivo).trim() : null)
    .input("roteiro", sql.NVarChar(sql.MAX), roteiro ? String(roteiro) : null)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EbdPlanosAula (Data, CongregacaoId, FaixaEtaria, Titulo, Referencia, Objetivo, Roteiro, CriadoPorMembroId)
      OUTPUT INSERTED.PlanoId
      VALUES (@data, @congregacaoId, @faixa, @titulo, @referencia, @objetivo, @roteiro, @criadoPor)
    `);
  const planoId = r.recordset[0].PlanoId;
  await registrarAuditoria({
    tabela: "EbdPlanosAula", registroId: planoId, acao: "PLANO_AULA_CRIADO", usuarioId: criadoPorMembroId,
    dadosAntes: null, dadosDepois: { data, congregacaoId: congregacaoId || null, faixaEtaria: faixaEtaria || null, titulo: String(titulo).trim() }
  });
  return { sucesso: true, planoId, mensagem: "✅ Plano de aula criado (rascunho — publique para o professor ver)." };
}

// Data, congregação e faixa etária não mudam depois de criado: mudar o
// alcance de um plano é criar outro (e a permissão de escopo global para o
// campo inteiro nunca é contornada por uma edição).
async function atualizarPlanoAula(pool, { plano, titulo, referencia, objetivo, roteiro, membroId }) {
  const validacao = validarPlanoAula({ data: plano.data, titulo, referencia, objetivo, roteiro, faixaEtaria: plano.faixaEtaria });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  await pool.request().input("id", sql.Int, plano.planoId)
    .input("titulo", sql.NVarChar(200), String(titulo).trim())
    .input("referencia", sql.NVarChar(200), referencia ? String(referencia).trim() : null)
    .input("objetivo", sql.NVarChar(1000), objetivo ? String(objetivo).trim() : null)
    .input("roteiro", sql.NVarChar(sql.MAX), roteiro ? String(roteiro) : null)
    .query(`
      UPDATE EbdPlanosAula SET Titulo = @titulo, Referencia = @referencia, Objetivo = @objetivo, Roteiro = @roteiro, AtualizadoEm = SYSUTCDATETIME()
      WHERE PlanoId = @id
    `);
  await registrarAuditoria({
    tabela: "EbdPlanosAula", registroId: plano.planoId, acao: "PLANO_AULA_ATUALIZADO", usuarioId: membroId,
    dadosAntes: { titulo: plano.titulo }, dadosDepois: { titulo: String(titulo).trim() }
  });
  return { sucesso: true, mensagem: "✅ Plano de aula atualizado." };
}

async function alterarPublicacaoPlano(pool, { plano, publicar, membroId }) {
  const novo = publicar ? STATUS_PLANO.PUBLICADO : STATUS_PLANO.RASCUNHO;
  if (plano.status === novo) return { sucesso: false, mensagem: publicar ? "Este plano já está publicado." : "Este plano não está publicado." };
  await pool.request().input("id", sql.Int, plano.planoId).input("status", sql.NVarChar(10), novo).input("membroId", sql.Int, membroId || null).query(`
    UPDATE EbdPlanosAula
    SET Status = @status,
        PublicadoEm = CASE WHEN @status = 'PUBLICADO' THEN SYSUTCDATETIME() ELSE NULL END,
        PublicadoPorMembroId = CASE WHEN @status = 'PUBLICADO' THEN @membroId ELSE NULL END,
        AtualizadoEm = SYSUTCDATETIME()
    WHERE PlanoId = @id
  `);
  await registrarAuditoria({
    tabela: "EbdPlanosAula", registroId: plano.planoId, acao: publicar ? "PLANO_AULA_PUBLICADO" : "PLANO_AULA_DESPUBLICADO",
    usuarioId: membroId, dadosAntes: { status: plano.status }, dadosDepois: { status: novo }
  });
  return { sucesso: true, mensagem: publicar ? "✅ Plano publicado — os professores já veem na tela da chamada." : "✅ Plano voltou para rascunho." };
}

async function excluirPlanoAula(pool, { plano, membroId }) {
  await pool.request().input("id", sql.Int, plano.planoId).query(`UPDATE EbdPlanosAula SET Ativo = 0, AtualizadoEm = SYSUTCDATETIME() WHERE PlanoId = @id`);
  await registrarAuditoria({
    tabela: "EbdPlanosAula", registroId: plano.planoId, acao: "PLANO_AULA_EXCLUIDO", usuarioId: membroId,
    dadosAntes: { status: plano.status, ativo: true }, dadosDepois: { ativo: false }
  });
  return { sucesso: true, mensagem: "✅ Plano excluído." };
}

async function adicionarMaterial(pool, { plano, titulo, url, membroId }) {
  const validacao = validarMaterial({ titulo, url });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };
  const ordem = (plano.materiais || []).length;
  const r = await pool.request().input("planoId", sql.Int, plano.planoId)
    .input("titulo", sql.NVarChar(200), String(titulo).trim()).input("url", sql.NVarChar(500), String(url).trim())
    .input("ordem", sql.Int, ordem).input("membroId", sql.Int, membroId || null)
    .query(`
      INSERT INTO EbdPlanoMateriais (PlanoId, Titulo, Url, Ordem, CriadoPorMembroId)
      OUTPUT INSERTED.MaterialId
      VALUES (@planoId, @titulo, @url, @ordem, @membroId)
    `);
  const materialId = r.recordset[0].MaterialId;
  await registrarAuditoria({
    tabela: "EbdPlanoMateriais", registroId: materialId, acao: "MATERIAL_ADICIONADO", usuarioId: membroId,
    dadosAntes: null, dadosDepois: { planoId: plano.planoId, titulo: String(titulo).trim(), url: String(url).trim() }
  });
  return { sucesso: true, materialId, mensagem: "✅ Material adicionado." };
}

async function buscarMaterialPorId(pool, materialId) {
  const r = await pool.request().input("id", sql.Int, materialId).query(`SELECT MaterialId, PlanoId, Titulo FROM EbdPlanoMateriais WHERE MaterialId = @id AND Ativo = 1`);
  const row = r.recordset[0];
  return row ? { materialId: row.MaterialId, planoId: row.PlanoId, titulo: row.Titulo } : null;
}

async function removerMaterial(pool, { material, membroId }) {
  await pool.request().input("id", sql.Int, material.materialId).query(`UPDATE EbdPlanoMateriais SET Ativo = 0 WHERE MaterialId = @id`);
  await registrarAuditoria({
    tabela: "EbdPlanoMateriais", registroId: material.materialId, acao: "MATERIAL_REMOVIDO", usuarioId: membroId,
    dadosAntes: { planoId: material.planoId, ativo: true }, dadosDepois: { ativo: false }
  });
  return { sucesso: true, mensagem: "✅ Material removido." };
}

// Lista de gestão: planos de um intervalo de datas — os do campo inteiro e
// os das congregações permitidas (`nomesCongregacoesPermitidas` = null quer
// dizer todas; array vazio = só os do campo inteiro). Rascunhos incluídos.
async function listarPlanosGestao(pool, { dataInicio, dataFim, congregacaoId, nomesCongregacoesPermitidas }) {
  const request = pool.request().input("inicio", sql.Date, dataInicio).input("fim", sql.Date, dataFim);
  const filtros = ["p.Ativo = 1", "p.Data BETWEEN @inicio AND @fim"];
  if (congregacaoId) {
    request.input("congregacaoId", sql.Int, congregacaoId);
    filtros.push("(p.CongregacaoId IS NULL OR p.CongregacaoId = @congregacaoId)");
  } else if (Array.isArray(nomesCongregacoesPermitidas)) {
    if (nomesCongregacoesPermitidas.length === 0) filtros.push("p.CongregacaoId IS NULL");
    else {
      const params = nomesCongregacoesPermitidas.map((nome, i) => { request.input(`cong${i}`, sql.NVarChar(150), nome); return `@cong${i}`; });
      filtros.push(`(p.CongregacaoId IS NULL OR c.Nome IN (${params.join(",")}))`);
    }
  }
  const r = await request.query(`${SELECT_PLANO} WHERE ${filtros.join(" AND ")} ORDER BY p.Data, p.CongregacaoId, p.FaixaEtaria, p.PlanoId`);
  return anexarMateriais(pool, r.recordset.map(mapearPlano));
}

// O que o professor vê: só PUBLICADO, da data, que se aplica à turma.
async function listarPlanosParaTurma(pool, { turma, data }) {
  const r = await pool.request().input("data", sql.Date, data).input("congregacaoId", sql.Int, turma.congregacaoId).query(`
    ${SELECT_PLANO}
    WHERE p.Ativo = 1 AND p.Status = 'PUBLICADO' AND p.Data = @data
      AND (p.CongregacaoId IS NULL OR p.CongregacaoId = @congregacaoId)
  `);
  const planos = ordenarPlanosPorEspecificidade(r.recordset.map(mapearPlano).filter(p => planoSeAplicaATurma(p, turma)));
  return anexarMateriais(pool, planos);
}

// ---------------------------------------------------------------
// Funções de banco — ausência
// ---------------------------------------------------------------

async function lerMinimoDomingosAusencia(pool) {
  const r = await pool.request().query(`SELECT TOP 1 Dias FROM Prazos WHERE Sigla = 'EBD_AUSENCIA_DOMINGOS' AND Ativo = 1`);
  const n = r.recordset[0] ? Number(r.recordset[0].Dias) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 26 ? n : DOMINGOS_AUSENCIA_PADRAO;
}

// Lê, numa rodada, tudo o que o cálculo precisa (uma turma ou todas as
// turmas ativas) e devolve as sequências agrupadas por turma.
async function calcularAusenciasPorTurma(pool, { turmaId = null, minimo }) {
  const filtroTurma = turmaId ? "AND c.TurmaId = @turmaId" : "";
  const comTurma = (req) => (turmaId ? req.input("turmaId", sql.Int, turmaId) : req);

  const licoesRs = await comTurma(pool.request().input("dias", sql.Int, DIAS_JANELA_AUSENCIA)).query(`
    SELECT DISTINCT c.TurmaId, l.LicaoId, l.Data
    FROM EbdChamadas c JOIN EbdLicoes l ON l.LicaoId = c.LicaoId
    WHERE l.Data >= DATEADD(DAY, -@dias, CAST(SYSUTCDATETIME() AS DATE)) ${filtroTurma}
  `);
  const alunosRs = await comTurma(pool.request()).query(`
    SELECT a.AlunoId, a.TurmaId, COALESCE(m.Nome, a.NomeNaoMembro) AS Nome, a.MatriculadoEm, a.AtualizadoEm,
           t.Nome AS TurmaNome, cg.Nome AS CongregacaoNome
    FROM EbdAlunos a
    JOIN EbdTurmas t ON t.TurmaId = a.TurmaId AND t.Ativa = 1
    JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId
    LEFT JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.Ativo = 1 ${turmaId ? "AND a.TurmaId = @turmaId" : ""}
  `);
  const presentesRs = await comTurma(pool.request().input("dias", sql.Int, DIAS_JANELA_AUSENCIA)).query(`
    SELECT c.LicaoId, c.AlunoId
    FROM EbdChamadas c JOIN EbdLicoes l ON l.LicaoId = c.LicaoId
    WHERE c.Status = 'PRESENTE' AND l.Data >= DATEADD(DAY, -@dias, CAST(SYSUTCDATETIME() AS DATE))
      ${turmaId ? "AND c.AlunoId IN (SELECT AlunoId FROM EbdAlunos WHERE TurmaId = @turmaId)" : ""}
  `);

  const presentes = new Set(presentesRs.recordset.map(r => `${r.LicaoId}:${r.AlunoId}`));
  const licoesPorTurma = new Map();
  for (const l of licoesRs.recordset) {
    if (!licoesPorTurma.has(l.TurmaId)) licoesPorTurma.set(l.TurmaId, []);
    licoesPorTurma.get(l.TurmaId).push({ licaoId: l.LicaoId, data: l.Data });
  }
  const alunosPorTurma = new Map();
  for (const a of alunosRs.recordset) {
    if (!alunosPorTurma.has(a.TurmaId)) alunosPorTurma.set(a.TurmaId, { turmaNome: a.TurmaNome, congregacaoNome: a.CongregacaoNome, alunos: [] });
    const matricula = paraIsoData(a.MatriculadoEm);
    const alteracao = paraIsoData(a.AtualizadoEm);
    const desde = [matricula, alteracao].filter(Boolean).sort().pop() || null;
    alunosPorTurma.get(a.TurmaId).alunos.push({ alunoId: a.AlunoId, nome: a.Nome, desde });
  }

  const porTurma = [];
  for (const [id, grupo] of alunosPorTurma) {
    const sequencias = calcularSequenciasAusencia({ alunos: grupo.alunos, licoes: licoesPorTurma.get(id) || [], presentes, minimo });
    if (sequencias.length) porTurma.push({ turmaId: id, turmaNome: grupo.turmaNome, congregacaoNome: grupo.congregacaoNome, sequencias });
  }
  return porTurma;
}

async function listarAusentesDaTurma(pool, turmaId) {
  const minimo = await lerMinimoDomingosAusencia(pool);
  const porTurma = await calcularAusenciasPorTurma(pool, { turmaId, minimo });
  return { minimo, ausentes: porTurma.length ? porTurma[0].sequencias : [] };
}

// Usado pelo detector da vB.2: grava/atualiza a sequência (chave estável da
// notificação) e devolve o AlertaId.
async function registrarSequenciaAusencia(pool, { turmaId, sequencia }) {
  const r = await pool.request()
    .input("alunoId", sql.Int, sequencia.alunoId).input("turmaId", sql.Int, turmaId)
    .input("inicio", sql.Int, sequencia.licaoInicioId).input("domingos", sql.Int, sequencia.domingos)
    .query(`
      MERGE EbdAlertasAusencia WITH (HOLDLOCK) AS alvo
      USING (SELECT @alunoId AS AlunoId, @inicio AS LicaoInicioId) AS origem
        ON alvo.AlunoId = origem.AlunoId AND alvo.LicaoInicioId = origem.LicaoInicioId
      WHEN MATCHED THEN UPDATE SET DomingosAusente = @domingos, AtualizadoEm = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (AlunoId, TurmaId, LicaoInicioId, DomingosAusente) VALUES (@alunoId, @turmaId, @inicio, @domingos)
      OUTPUT INSERTED.AlertaId;
    `);
  return r.recordset[0].AlertaId;
}

async function listarProfessoresAtivosPorTurma(pool) {
  const r = await pool.request().query(`
    SELECT tp.TurmaId, m.MembroId, m.Nome, m.Email
    FROM EbdTurmaProfessores tp JOIN MembroReferencia m ON m.MembroId = tp.MembroId
    WHERE tp.Ativo = 1
  `);
  const porTurma = new Map();
  for (const row of r.recordset) {
    if (!porTurma.has(row.TurmaId)) porTurma.set(row.TurmaId, []);
    porTurma.get(row.TurmaId).push({ membroId: row.MembroId, nome: row.Nome, email: row.Email });
  }
  return porTurma;
}

module.exports = {
  STATUS_PLANO, DIAS_MAX_ATRASO_OFFLINE, DOMINGOS_AUSENCIA_PADRAO,
  // Lógica pura
  hojeBrasilia, dataIsoValida, paraIsoData, diasEntre, formatarDataBr,
  validarLoteOffline, decidirAplicacaoOffline, ehViolacaoDeUnicidade,
  validarPlanoAula, validarMaterial, planoSeAplicaATurma, ordenarPlanosPorEspecificidade,
  calcularSequenciasAusencia, textoAlertaAusencia,
  // Banco
  buscarTurmaComCongregacao, montarPacoteOffline, sincronizarChamadaOffline,
  buscarPlanoPorId, criarPlanoAula, atualizarPlanoAula, alterarPublicacaoPlano, excluirPlanoAula,
  adicionarMaterial, buscarMaterialPorId, removerMaterial, listarPlanosGestao, listarPlanosParaTurma,
  lerMinimoDomingosAusencia, calcularAusenciasPorTurma, listarAusentesDaTurma,
  registrarSequenciaAusencia, listarProfessoresAtivosPorTurma
};
