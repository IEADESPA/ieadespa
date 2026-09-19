// shared/assistenciaSocial.js (v5.9 — Assistência Social / Ação da Fé)
//
// O Regimento condiciona todo programa assistencial a cadastro
// socioeconômico (Art. 46) e a triagem/parecer de Assistente Social
// credenciado (Art. 52, VII). É o módulo com o dado mais sensível do
// sistema (situação socioeconômica de família assistida) — por isso:
//
//  - "Família" é um conceito NOVO e mínimo (AssistenciaSocialFamilias,
//    migração 100): o beneficiário típico não é membro, então não dá pra
//    reaproveitar VinculosFamiliares (grafo entre membros, v2.6).
//  - O parecer é SEMPRE atribuído a um profissional credenciado (tabela
//    própria AssistenciaSocialProfissionais) — nunca uma decisão
//    informal; podeAssinarParecer() é o portão único que valida isso.
//  - Recorrência de benefício (ex: cesta todo mês, N meses seguidos) é
//    SEMPRE calculada na leitura (detectarRecorrencia), nunca marcada à
//    mão — mesmo espírito de "status calculado, nunca digitado" já usado
//    em Cartas de Trânsito (v017) e na esteira de habilitação (v5.7).
//  - A isenção de taxa de cessão de templo por ação social (Art. 156 §3º,
//    III, conectando com v4.18/v4.21) exige justificativa registrada —
//    validarIsencaoSocial() é a regra pura que a Function usa.
//
// Toda a lógica de decisão é pura (sem tocar banco), testável isolada; as
// funções que tocam o banco ficam ao final, bem mais finas — mesmo padrão
// de shared/escalas.js (v5.6) e shared/habilitacaoVoluntarios.js (v5.7).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");

const TIPOS_BENEFICIO = ["CESTA_BASICA", "AUXILIO_FINANCEIRO", "MEDICAMENTO", "OUTRO"];
const SITUACOES_MORADIA = ["PROPRIA", "ALUGADA", "CEDIDA", "SITUACAO_RISCO", "OUTRO"];
const RESULTADOS_PARECER = ["APROVADO", "NEGADO", "PENDENTE_DOCUMENTACAO"];
const BASES_LEGAIS = ["CONSENTIMENTO", "OBRIGACAO_LEGAL", "LEGITIMO_INTERESSE", "EXECUCAO_ESTATUTO"];

// Meses seguidos recebendo o MESMO tipo de benefício que disparam o alerta
// de dependência pra quem lidera olhar o caso (não bloqueia nada — só
// sinaliza; é decisão pastoral/técnica, não automática).
const MESES_CONSECUTIVOS_ALERTA = 3;

// ---------------------------------------------------------------
// Cadastro socioeconômico (Art. 46) — validação de forma + LGPD (decisão
// 2 da migração 100: base legal Art. 7º, I por padrão, exige consentimento
// registrado; titular tipicamente não tem vínculo de membresia, então o
// Art. 11, II, "a" que cobre MembroReferencia não se aplica aqui).
// ---------------------------------------------------------------
function validarCadastroSocioeconomico({ qtdPessoasNucleo, consentimentoObtidoEm, baseLegal, situacaoMoradia }) {
  if (!Number.isInteger(Number(qtdPessoasNucleo)) || Number(qtdPessoasNucleo) < 1) {
    return { valido: false, mensagem: "Informe a quantidade de pessoas do núcleo familiar (mínimo 1)." };
  }
  if (!consentimentoObtidoEm) {
    return { valido: false, mensagem: "Sem consentimento do titular/responsável registrado, o cadastro socioeconômico não pode ser aberto (LGPD Art. 7º, I)." };
  }
  if (baseLegal && !BASES_LEGAIS.includes(baseLegal)) {
    return { valido: false, mensagem: `Base legal inválida. Use uma de: ${BASES_LEGAIS.join(", ")}.` };
  }
  if (situacaoMoradia && !SITUACOES_MORADIA.includes(situacaoMoradia)) {
    return { valido: false, mensagem: `Situação de moradia inválida. Use uma de: ${SITUACOES_MORADIA.join(", ")}.` };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Triagem/parecer técnico (Art. 52, VII) — o portão único: só quem está
// ATIVO em AssistenciaSocialProfissionais pode assinar. `profissional` é o
// registro já buscado no banco (ou null se o MembroId não é credenciado).
// ---------------------------------------------------------------
function podeAssinarParecer(profissional) {
  if (!profissional) {
    return { permitido: false, mensagem: "Este membro não é um Assistente Social credenciado no sistema (Art. 52, VII) — parecer não pode ser um registro informal." };
  }
  if (!profissional.ativo) {
    return { permitido: false, mensagem: "Credenciamento deste Assistente Social está inativo/revogado — não pode assinar parecer." };
  }
  return { permitido: true };
}

function validarParecer({ resultado, parecer }) {
  if (!RESULTADOS_PARECER.includes(resultado)) {
    return { valido: false, mensagem: `Resultado inválido. Use um de: ${RESULTADOS_PARECER.join(", ")}.` };
  }
  if (!parecer || !parecer.trim()) {
    return { valido: false, mensagem: "O parecer técnico não pode ser vazio." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Recorrência de benefício — SEMPRE calculada na leitura, nunca digitada.
// "Meses seguidos" conta a partir do mês de referência (agora) pra trás,
// exigindo pelo menos 1 entrega daquele tipo em CADA mês do intervalo —
// para no primeiro mês sem entrega (streak quebrado).
// ---------------------------------------------------------------
function chaveAnoMes(data) {
  const d = data instanceof Date ? data : new Date(data);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mesesConsecutivosComEntrega(entregas, tipoBeneficio, agora) {
  const ref = agora || new Date();
  const mesesComEntrega = new Set(
    (entregas || [])
      .filter(e => e.tipoBeneficio === tipoBeneficio)
      .map(e => chaveAnoMes(e.dataEntrega))
  );
  let streak = 0;
  let cursor = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  while (mesesComEntrega.has(chaveAnoMes(cursor))) {
    streak += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1));
  }
  return streak;
}

// Agrupa por tipo de benefício e devolve o streak + alerta de cada um —
// isso é o que a tela de "histórico por família" mostra pra sinalizar
// dependência (ex: "cesta básica há 4 meses seguidos"), sem bloquear nada.
function avaliarRecorrenciaFamilia(entregas, agora, limiteConsecutivo) {
  const limite = limiteConsecutivo || MESES_CONSECUTIVOS_ALERTA;
  const tipos = Array.from(new Set((entregas || []).map(e => e.tipoBeneficio)));
  return tipos.map(tipoBeneficio => {
    const mesesConsecutivos = mesesConsecutivosComEntrega(entregas, tipoBeneficio, agora);
    return { tipoBeneficio, mesesConsecutivos, alertaRecorrencia: mesesConsecutivos >= limite };
  });
}

function validarEntrega({ tipoBeneficio, dataEntrega }) {
  if (!TIPOS_BENEFICIO.includes(tipoBeneficio)) {
    return { valido: false, mensagem: `Tipo de benefício inválido. Use um de: ${TIPOS_BENEFICIO.join(", ")}.` };
  }
  if (!dataEntrega) {
    return { valido: false, mensagem: "Informe a data da entrega." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Isenção de taxa de cessão de templo por ação social (Art. 156 §3º, III
// — conecta com v4.18/v4.21). Reaproveita a MESMA flag IsencaoTaxa da
// v4.18 (migração 068); esta função só passa a exigir motivo registrado
// quando a finalidade declarada é ação social — não isenta "de graça".
// ---------------------------------------------------------------
function validarIsencaoSocial({ finalidadeAcaoSocial, isencaoTaxa, motivoIsencaoSocial }) {
  if (!finalidadeAcaoSocial) return { valido: true };
  if (!isencaoTaxa) {
    return { valido: false, mensagem: "Cessão marcada como ação social precisa também marcar a isenção de taxa (Art. 156 §3º, III)." };
  }
  if (!motivoIsencaoSocial || !motivoIsencaoSocial.trim()) {
    return { valido: false, mensagem: "Informe o motivo/justificativa da isenção por ação social." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Funções de banco (finas).
// ---------------------------------------------------------------

function mapearFamilia(row) {
  if (!row) return null;
  return {
    familiaId: row.FamiliaId, congregacaoId: row.CongregacaoId, responsavelNome: row.ResponsavelNome,
    responsavelCpf: row.ResponsavelCpf, responsavelContato: row.ResponsavelContato, endereco: row.Endereco,
    membroId: row.MembroId, ativo: !!row.Ativo, criadoEm: row.CriadoEm
  };
}

async function criarFamilia(pool, { congregacaoId, responsavelNome, responsavelCpf, responsavelContato, endereco, membroId, criadoPorMembroId }) {
  if (!congregacaoId || !responsavelNome || !responsavelNome.trim()) {
    return { sucesso: false, mensagem: "Informe congregacaoId e responsavelNome." };
  }
  const inserida = await pool.request()
    .input("cong", sql.Int, congregacaoId).input("nome", sql.NVarChar(150), responsavelNome.trim())
    .input("cpf", sql.NVarChar(14), responsavelCpf || null).input("contato", sql.NVarChar(100), responsavelContato || null)
    .input("endereco", sql.NVarChar(300), endereco || null).input("membroId", sql.Int, membroId || null)
    .input("criadoPor", sql.Int, criadoPorMembroId)
    .query(`INSERT INTO AssistenciaSocialFamilias (CongregacaoId, ResponsavelNome, ResponsavelCpf, ResponsavelContato, Endereco, MembroId, CriadoPorMembroId)
            OUTPUT INSERTED.FamiliaId VALUES (@cong, @nome, @cpf, @contato, @endereco, @membroId, @criadoPor)`);
  const familiaId = inserida.recordset[0].FamiliaId;
  await registrarAuditoria({ tabela: "AssistenciaSocialFamilias", registroId: familiaId, acao: "Cadastrou família assistida", usuarioId: criadoPorMembroId, dadosDepois: { congregacaoId, responsavelNome } });
  return { sucesso: true, familiaId, mensagem: "✅ Família cadastrada." };
}

async function buscarFamilia(pool, familiaId) {
  const r = await pool.request().input("id", sql.Int, familiaId).query(`SELECT * FROM AssistenciaSocialFamilias WHERE FamiliaId = @id`);
  return mapearFamilia(r.recordset[0]);
}

async function listarFamilias(pool, congregacaoId) {
  const r = await pool.request().input("cong", sql.Int, congregacaoId).query(`
    SELECT * FROM AssistenciaSocialFamilias WHERE CongregacaoId = @cong AND Ativo = 1 ORDER BY ResponsavelNome
  `);
  return r.recordset.map(mapearFamilia);
}

function mapearCadastro(row) {
  if (!row) return null;
  return {
    cadastroId: row.CadastroId, familiaId: row.FamiliaId, qtdPessoasNucleo: row.QtdPessoasNucleo,
    rendaFamiliarMensal: row.RendaFamiliarMensal, situacaoMoradia: row.SituacaoMoradia, observacoes: row.Observacoes,
    baseLegal: row.BaseLegal, consentimentoObtidoEm: row.ConsentimentoObtidoEm, status: row.Status,
    encerradoMotivo: row.EncerradoMotivo, encerradoEm: row.EncerradoEm, registradoPorMembroId: row.RegistradoPorMembroId,
    criadoEm: row.CriadoEm, atualizadoEm: row.AtualizadoEm
  };
}

async function criarCadastroSocioeconomico(pool, dados) {
  const validacao = validarCadastroSocioeconomico(dados);
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const { familiaId, qtdPessoasNucleo, rendaFamiliarMensal, situacaoMoradia, observacoes, baseLegal, consentimentoObtidoEm, registradoPorMembroId } = dados;
  const inserido = await pool.request()
    .input("familiaId", sql.Int, familiaId).input("qtd", sql.Int, qtdPessoasNucleo)
    .input("renda", sql.Decimal(12, 2), rendaFamiliarMensal || null).input("situacao", sql.NVarChar(30), situacaoMoradia || "OUTRO")
    .input("obs", sql.NVarChar(1000), observacoes || null).input("baseLegal", sql.NVarChar(40), baseLegal || "CONSENTIMENTO")
    .input("consentimento", sql.DateTime2, consentimentoObtidoEm).input("registradoPor", sql.Int, registradoPorMembroId)
    .query(`INSERT INTO AssistenciaSocialCadastros (FamiliaId, QtdPessoasNucleo, RendaFamiliarMensal, SituacaoMoradia, Observacoes, BaseLegal, ConsentimentoObtidoEm, RegistradoPorMembroId)
            OUTPUT INSERTED.CadastroId VALUES (@familiaId, @qtd, @renda, @situacao, @obs, @baseLegal, @consentimento, @registradoPor)`);
  const cadastroId = inserido.recordset[0].CadastroId;
  await registrarAuditoria({ tabela: "AssistenciaSocialCadastros", registroId: cadastroId, acao: "Abriu cadastro socioeconômico", usuarioId: registradoPorMembroId, dadosDepois: { familiaId, baseLegal: baseLegal || "CONSENTIMENTO" } });
  return { sucesso: true, cadastroId, mensagem: "✅ Cadastro socioeconômico registrado." };
}

async function buscarCadastro(pool, cadastroId) {
  const r = await pool.request().input("id", sql.Int, cadastroId).query(`SELECT * FROM AssistenciaSocialCadastros WHERE CadastroId = @id`);
  return mapearCadastro(r.recordset[0]);
}

async function listarCadastrosPorFamilia(pool, familiaId) {
  const r = await pool.request().input("familiaId", sql.Int, familiaId).query(`
    SELECT * FROM AssistenciaSocialCadastros WHERE FamiliaId = @familiaId ORDER BY CriadoEm DESC
  `);
  return r.recordset.map(mapearCadastro);
}

async function encerrarCadastro(pool, { cadastroId, motivo, registradoPorMembroId }) {
  if (!motivo || !motivo.trim()) return { sucesso: false, mensagem: "Informe o motivo do encerramento." };
  await pool.request().input("id", sql.Int, cadastroId).input("motivo", sql.NVarChar(300), motivo.trim())
    .query(`UPDATE AssistenciaSocialCadastros SET Status = 'ENCERRADO', EncerradoMotivo = @motivo, EncerradoEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE CadastroId = @id`);
  await registrarAuditoria({ tabela: "AssistenciaSocialCadastros", registroId: cadastroId, acao: "Encerrou cadastro socioeconômico", usuarioId: registradoPorMembroId, dadosDepois: { motivo } });
  return { sucesso: true, mensagem: "✅ Cadastro encerrado." };
}

// ---- Credenciamento do Assistente Social ----

function mapearProfissional(row) {
  if (!row) return null;
  return {
    profissionalId: row.ProfissionalId, membroId: row.MembroId, numeroCredencial: row.NumeroCredencial,
    ativo: !!row.Ativo, credenciadoPorMembroId: row.CredenciadoPorMembroId, credenciadoEm: row.CredenciadoEm,
    descredenciadoEm: row.DescredenciadoEm, descredenciadoMotivo: row.DescredenciadoMotivo
  };
}

async function buscarProfissionalPorMembro(pool, membroId) {
  const r = await pool.request().input("membroId", sql.Int, membroId).query(`SELECT * FROM AssistenciaSocialProfissionais WHERE MembroId = @membroId`);
  return mapearProfissional(r.recordset[0]);
}

async function credenciarProfissional(pool, { membroId, numeroCredencial, credenciadoPorMembroId }) {
  if (!membroId || !numeroCredencial || !numeroCredencial.trim()) {
    return { sucesso: false, mensagem: "Informe membroId e numeroCredencial (registro CRESS)." };
  }
  const existente = await buscarProfissionalPorMembro(pool, membroId);
  if (existente) {
    await pool.request().input("id", sql.Int, existente.profissionalId).input("num", sql.NVarChar(30), numeroCredencial.trim())
      .query(`UPDATE AssistenciaSocialProfissionais SET NumeroCredencial = @num, Ativo = 1, DescredenciadoEm = NULL, DescredenciadoMotivo = NULL WHERE ProfissionalId = @id`);
    await registrarAuditoria({ tabela: "AssistenciaSocialProfissionais", registroId: existente.profissionalId, acao: "Recredenciou Assistente Social", usuarioId: credenciadoPorMembroId, dadosDepois: { numeroCredencial } });
    return { sucesso: true, profissionalId: existente.profissionalId, mensagem: "✅ Recredenciado." };
  }
  const inserido = await pool.request().input("membroId", sql.Int, membroId).input("num", sql.NVarChar(30), numeroCredencial.trim())
    .input("por", sql.Int, credenciadoPorMembroId)
    .query(`INSERT INTO AssistenciaSocialProfissionais (MembroId, NumeroCredencial, CredenciadoPorMembroId)
            OUTPUT INSERTED.ProfissionalId VALUES (@membroId, @num, @por)`);
  const profissionalId = inserido.recordset[0].ProfissionalId;
  await registrarAuditoria({ tabela: "AssistenciaSocialProfissionais", registroId: profissionalId, acao: "Credenciou Assistente Social", usuarioId: credenciadoPorMembroId, dadosDepois: { membroId, numeroCredencial } });
  return { sucesso: true, profissionalId, mensagem: "✅ Assistente Social credenciado." };
}

async function descredenciarProfissional(pool, { profissionalId, motivo, registradoPorMembroId }) {
  if (!motivo || !motivo.trim()) return { sucesso: false, mensagem: "Informe o motivo do descredenciamento." };
  await pool.request().input("id", sql.Int, profissionalId).input("motivo", sql.NVarChar(300), motivo.trim())
    .query(`UPDATE AssistenciaSocialProfissionais SET Ativo = 0, DescredenciadoEm = SYSUTCDATETIME(), DescredenciadoMotivo = @motivo WHERE ProfissionalId = @id`);
  await registrarAuditoria({ tabela: "AssistenciaSocialProfissionais", registroId: profissionalId, acao: "Descredenciou Assistente Social", usuarioId: registradoPorMembroId, dadosDepois: { motivo } });
  return { sucesso: true, mensagem: "✅ Descredenciado." };
}

async function listarProfissionais(pool) {
  const r = await pool.request().query(`
    SELECT p.*, m.Nome AS MembroNome FROM AssistenciaSocialProfissionais p JOIN MembroReferencia m ON m.MembroId = p.MembroId ORDER BY m.Nome
  `);
  return r.recordset.map(row => ({ ...mapearProfissional(row), membroNome: row.MembroNome }));
}

// ---- Parecer técnico ----

async function registrarParecer(pool, { cadastroId, profissionalMembroId, resultado, parecer, registradoPorMembroId }) {
  const cadastro = await buscarCadastro(pool, cadastroId);
  if (!cadastro) return { sucesso: false, mensagem: "Cadastro socioeconômico não encontrado." };

  const profissional = await buscarProfissionalPorMembro(pool, profissionalMembroId);
  const podeAssinar = podeAssinarParecer(profissional);
  if (!podeAssinar.permitido) return { sucesso: false, mensagem: podeAssinar.mensagem };

  const validacao = validarParecer({ resultado, parecer });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const inserido = await pool.request()
    .input("cadastroId", sql.Int, cadastroId).input("profissionalId", sql.Int, profissional.profissionalId)
    .input("resultado", sql.NVarChar(30), resultado).input("parecer", sql.NVarChar(2000), parecer.trim())
    .query(`INSERT INTO AssistenciaSocialPareceres (CadastroId, ProfissionalId, Resultado, Parecer)
            OUTPUT INSERTED.ParecerId VALUES (@cadastroId, @profissionalId, @resultado, @parecer)`);
  const parecerId = inserido.recordset[0].ParecerId;
  await registrarAuditoria({
    tabela: "AssistenciaSocialPareceres", registroId: parecerId, acao: "Registrou parecer técnico de Assistente Social",
    usuarioId: registradoPorMembroId, dadosDepois: { cadastroId, profissionalId: profissional.profissionalId, resultado }
  });
  return { sucesso: true, parecerId, mensagem: "✅ Parecer registrado e assinado pelo profissional credenciado." };
}

async function listarPareceresPorCadastro(pool, cadastroId) {
  const r = await pool.request().input("cadastroId", sql.Int, cadastroId).query(`
    SELECT pa.*, m.Nome AS ProfissionalNome, pr.NumeroCredencial
    FROM AssistenciaSocialPareceres pa
    JOIN AssistenciaSocialProfissionais pr ON pr.ProfissionalId = pa.ProfissionalId
    JOIN MembroReferencia m ON m.MembroId = pr.MembroId
    WHERE pa.CadastroId = @cadastroId ORDER BY pa.AssinadoEm DESC
  `);
  return r.recordset.map(row => ({
    parecerId: row.ParecerId, cadastroId: row.CadastroId, profissionalId: row.ProfissionalId,
    profissionalNome: row.ProfissionalNome, numeroCredencial: row.NumeroCredencial,
    resultado: row.Resultado, parecer: row.Parecer, assinadoEm: row.AssinadoEm
  }));
}

// ---- Entregas/benefícios + recorrência ----

async function registrarEntrega(pool, { familiaId, tipoBeneficio, descricao, valor, dataEntrega, despesaTesourariaDepartamentoId, registradoPorMembroId }) {
  const validacao = validarEntrega({ tipoBeneficio, dataEntrega });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const inserido = await pool.request()
    .input("familiaId", sql.Int, familiaId).input("tipo", sql.NVarChar(30), tipoBeneficio)
    .input("descricao", sql.NVarChar(300), descricao || null).input("valor", sql.Decimal(12, 2), valor || null)
    .input("data", sql.Date, dataEntrega).input("despesaId", sql.Int, despesaTesourariaDepartamentoId || null)
    .input("registradoPor", sql.Int, registradoPorMembroId)
    .query(`INSERT INTO AssistenciaSocialEntregas (FamiliaId, TipoBeneficio, Descricao, Valor, DataEntrega, DespesaTesourariaDepartamentoId, RegistradoPorMembroId)
            OUTPUT INSERTED.EntregaId VALUES (@familiaId, @tipo, @descricao, @valor, @data, @despesaId, @registradoPor)`);
  const entregaId = inserido.recordset[0].EntregaId;
  await registrarAuditoria({ tabela: "AssistenciaSocialEntregas", registroId: entregaId, acao: "Registrou entrega de benefício", usuarioId: registradoPorMembroId, dadosDepois: { familiaId, tipoBeneficio, dataEntrega } });
  return { sucesso: true, entregaId, mensagem: "✅ Entrega registrada." };
}

async function listarEntregasPorFamilia(pool, familiaId) {
  const r = await pool.request().input("familiaId", sql.Int, familiaId).query(`
    SELECT EntregaId AS entregaId, FamiliaId AS familiaId, TipoBeneficio AS tipoBeneficio, Descricao AS descricao,
           Valor AS valor, DataEntrega AS dataEntrega, DespesaTesourariaDepartamentoId AS despesaTesourariaDepartamentoId
    FROM AssistenciaSocialEntregas WHERE FamiliaId = @familiaId ORDER BY DataEntrega DESC
  `);
  return r.recordset;
}

// Histórico + recorrência calculada — o que a tela "por família" consome.
async function historicoComRecorrencia(pool, familiaId, agora) {
  const entregas = await listarEntregasPorFamilia(pool, familiaId);
  return { entregas, recorrencia: avaliarRecorrenciaFamilia(entregas, agora) };
}

// ---------------------------------------------------------------
// Prestação de contas — separada do caixa comum (decisão 5 da migração
// 100): agrega TesourariasDepartamento/DespesasTesourariaDepartamento do
// departamento Ação da Fé (v5.4) com as entregas registradas aqui. Insumo
// direto pra v9.6 (CEBAS/parceria pública) consumir depois.
// ---------------------------------------------------------------
async function relatorioPrestacaoContas(pool, { mesReferencia, anoReferencia }) {
  const dep = await pool.request().query(`SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'ACAO_DA_FE'`);
  const departamentoId = dep.recordset[0] ? dep.recordset[0].DepartamentoId : null;
  if (!departamentoId) {
    return { departamentoEncontrado: false, mensagem: "Departamento Ação da Fé não encontrado no cadastro (Departamentos.Sigla = 'ACAO_DA_FE')." };
  }

  const fechamento = await pool.request().input("dep", sql.Int, departamentoId).input("mes", sql.Int, mesReferencia).input("ano", sql.Int, anoReferencia)
    .query(`SELECT * FROM TesourariasDepartamento WHERE DepartamentoId = @dep AND MesReferencia = @mes AND AnoReferencia = @ano`);

  const despesas = await pool.request().input("dep", sql.Int, departamentoId).input("mes", sql.Int, mesReferencia).input("ano", sql.Int, anoReferencia)
    .query(`SELECT * FROM DespesasTesourariaDepartamento WHERE DepartamentoId = @dep AND MesReferencia = @mes AND AnoReferencia = @ano ORDER BY CriadoEm`);

  const entregas = await pool.request().input("mes", sql.Int, mesReferencia).input("ano", sql.Int, anoReferencia).query(`
    SELECT e.*, f.ResponsavelNome FROM AssistenciaSocialEntregas e
    JOIN AssistenciaSocialFamilias f ON f.FamiliaId = e.FamiliaId
    WHERE MONTH(e.DataEntrega) = @mes AND YEAR(e.DataEntrega) = @ano
    ORDER BY e.DataEntrega
  `);

  const totalEntregasPorTipo = {};
  let totalValorEntregas = 0;
  const familiasAtendidas = new Set();
  for (const row of entregas.recordset) {
    totalEntregasPorTipo[row.TipoBeneficio] = (totalEntregasPorTipo[row.TipoBeneficio] || 0) + 1;
    totalValorEntregas += Number(row.Valor) || 0;
    familiasAtendidas.add(row.FamiliaId);
  }

  return {
    departamentoEncontrado: true,
    departamentoId,
    mesReferencia, anoReferencia,
    fechamentoMensal: fechamento.recordset[0] || null, // TesourariasDepartamento (v5.4) — separado do caixa geral (SaidasTesouraria)
    despesas: despesas.recordset,
    entregas: entregas.recordset,
    totalEntregasPorTipo,
    totalValorEntregas,
    totalFamiliasAtendidas: familiasAtendidas.size
  };
}

module.exports = {
  TIPOS_BENEFICIO, SITUACOES_MORADIA, RESULTADOS_PARECER, BASES_LEGAIS, MESES_CONSECUTIVOS_ALERTA,
  validarCadastroSocioeconomico, podeAssinarParecer, validarParecer,
  chaveAnoMes, mesesConsecutivosComEntrega, avaliarRecorrenciaFamilia, validarEntrega, validarIsencaoSocial,
  criarFamilia, buscarFamilia, listarFamilias,
  criarCadastroSocioeconomico, buscarCadastro, listarCadastrosPorFamilia, encerrarCadastro,
  buscarProfissionalPorMembro, credenciarProfissional, descredenciarProfissional, listarProfissionais,
  registrarParecer, listarPareceresPorCadastro,
  registrarEntrega, listarEntregasPorFamilia, historicoComRecorrencia,
  relatorioPrestacaoContas
};
