// GestaoPessoas
// Cadastro de obreiros (MembroReferencia). Exige a permissão "pessoas".
// GET    /api/pessoas            -> lista (filtrada pelo escopo de quem está logado)
// POST   /api/pessoas            -> body: { membroId, nome, cargoMinisterial, congregacaoId, status, ... } -> cria ou atualiza
// DELETE /api/pessoas/{membroId} -> não remove de verdade: marca status = DESLIGADO
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const disciplina = require("../shared/disciplina");
const vacancia = require("../shared/vacancia");
const storage = require("../shared/storage");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");

// fecho da v7.5 — o POST e o DELETE não conferiam o escopo: quem tinha "pessoas" numa congregação alterava, trocava o e-mail ou desligava QUALQUER membro de QUALQUER
// congregação (só o GET filtrava). E o e-mail virou a raiz da entrada por código ("primeiro acesso / esqueci o PIN"). Agora o alvo E o destino precisam estar no escopo.
// (a regra mora em shared/escopoRotas.js, usada por todas as rotas de ficha)
const { noEscopoDaPessoa, FORA_DO_ESCOPO, ehGeral } = require("../shared/escopoRotas");
// v8.2 — Escada ministerial: o cargo ministerial muda pela esteira de consagração (shared/escada.js). No cadastro, só o nível GERAL (a Secretaria: importação e correção)
// troca o cargo ou informa "no cargo desde" — antes, quem tinha "pessoas" numa congregação punha alguém como Pastor e ele entrava na CLI por Ordenação. Toda troca entra no
// histórico de cargos (shared/escadaDb.sincronizarCadastro). Sexo (M/F): Missionária é o teto das obreiras (Regimento Art. 71, III).
const escadaDb = require("../shared/escadaDb");
const afm = require("../shared/afm");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const SEXOS = ["M", "F"];
// "ana.souza@exemplo.org" -> "a***@exemplo.org": o suficiente para a trilha mostrar QUE o e-mail mudou, sem guardar o endereço na auditoria imutável.
function mascararEmail(e) {
  const s = String(e || "").trim();
  const i = s.indexOf("@");
  return i > 0 ? `${s[0]}***${s.slice(i)}` : (s ? "***" : null);
}

// Causas de saída fixas (Reg. Art. 11 — Perda de Membresia, v1.5) — regra jurídica,
// não catálogo editável por tela (mesmo espírito de FORMAS_ADMISSAO/ESTADOS_CIVIS).
const CAUSAS_SAIDA = ["FALECIMENTO", "DESLIGAMENTO", "CARTA_MUDANCA", "EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"];

// Status que encerram a membresia de vez — entrar num desses (vindo de outro status)
// dispara a vacância automática de Assentos/Liderança/Cargo (shared/vacancia.js).
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];

// "funcao" no retorno é só de exibição: prioriza o nome do Cargo Ministerial
// (catálogo fechado, com escada — Art. 71) e cai pro texto livre antigo só se
// a pessoa ainda não tiver Cargo Ministerial definido (dado histórico). Quem
// alimenta isso é a esteira de Consagrações (EvoluirConsagracao) e/ou o campo
// Cargo Ministerial do próprio cadastro — não existe mais edição manual de
// "função" nesta tela (ver migração 013).
const SELECT_MEMBRO = `
  SELECT m.MembroId AS membroId, m.Nome AS nome, COALESCE(cm.Nome, m.Funcao) AS funcao, m.CongregacaoId AS congregacaoId,
         c.Nome AS congregacao, m.Status AS status,
         CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         CONVERT(varchar(10), m.DataBatismo, 120) AS dataBatismo,
         m.FormaAdmissao AS formaAdmissao, m.Origem AS origem, m.IgrejaAnterior AS igrejaAnterior,
         CONVERT(varchar(10), m.DataRitoRecebimento, 120) AS dataRitoRecebimento,
         m.NomeLidoRito AS nomeLidoRito, m.MinistranteRito AS ministranteRito,
         m.DizimistaFiel AS dizimistaFiel, m.SituacaoMembro AS situacaoMembro, m.DepartamentoId AS departamentoId,
         m.CargoMinisterial AS cargoMinisterial, m.Telefone AS telefone, m.Email AS email, m.Endereco AS endereco,
         m.ExtensaoId AS extensaoId, e.Nome AS extensao, m.EstadoCivil AS estadoCivil,
         CONVERT(varchar(10), m.DataAfastamento, 120) AS dataAfastamento,
         CONVERT(varchar(10), m.DataSaida, 120) AS dataSaida, m.MotivoSaida AS motivoSaida,
         m.FotoUrl AS fotoUrl, m.Sexo AS sexo, CONVERT(varchar(10), hc.Desde, 120) AS cargoDesde
  FROM MembroReferencia m
  LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
  LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
  LEFT JOIN CargosMinisteriaisHistorico hc ON hc.MembroId = m.MembroId AND hc.Ate IS NULL AND hc.Cargo = m.CargoMinisterial`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const pool = await getPool();

  // ---- GET: listar (só quem está no escopo de quem está logado) ----
  if (method === "GET") {
    // Mascaramento intencional (sigilo do processo disciplinar): só quem tem a
    // permissão "disciplina" recebe o dado real de processo ativo — sem ele, o membro
    // aparece com a categoria normal na lista, mesmo estando sob disciplina de verdade.
    // v7.6 — o dado de disciplina só para a pessoa que está no escopo da permissão "disciplina" (a visão dela), não no de "pessoas".
    const vDisciplina = auth.visaoDaPermissao(usuario, "disciplina");
    const idsSobDisciplina = vDisciplina
      ? await disciplina.membrosSobDisciplina(pool)
      : new Set();
    const result = await pool.request().query(`${SELECT_MEMBRO} ORDER BY m.Nome`);
    const membros = result.recordset
      // Escopo EXTENSAO é mais estreito que a Congregação-Mãe: só quem tem exatamente essa Extensão vinculada entra na lista (noEscopoDaPessoa confere os
      // dois, concessão por concessão).
      .filter(m => noEscopoDaPessoa(usuario, m.congregacao, m.extensao))
      .map(m => Object.assign({}, m, { processoDisciplinarAtivo: !!vDisciplina && noEscopoDaPessoa(vDisciplina, m.congregacao, m.extensao) && idsSobDisciplina.has(m.membroId) }))
      .map(m => Object.assign({}, m, { capacidade: estatuto.calcularCapacidadeEleitoral(m) }))
      .map(m => {
        const idade = estatuto.idadeEm(m.dataNascimento);
        return Object.assign({}, m, { menorDeIdade: idade !== null && idade < 18 });
      })
      // O container do Blob Storage é privado (LGPD — ver shared/storage.js): a
      // URL crua salva no banco não abre sozinha, precisa de um link assinado
      // (SAS) gerado na hora, com validade curta.
      .map(m => Object.assign({}, m, { fotoUrl: storage.urlComSas(m.fotoUrl) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: membros };
    return;
  }

  // ---- POST: criar ou atualizar ----
  if (method === "POST") {
    const {
      membroId, nome, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel,
      situacaoMembro, departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId,
      dataBatismo, formaAdmissao, origem, igrejaAnterior,
      dataRitoRecebimento, nomeLidoRito, ministranteRito, estadoCivil,
      dataAfastamento, motivoSaida, dataSaida, sexo, cargoDesde
    } = req.body || {};
    if (!membroId || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, nome." } };
      return;
    }
    let destinoCongregacaoNome = null, destinoExtensaoNome = null;
    if (congregacaoId) {
      const c = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT TOP 1 Nome FROM Congregacoes WHERE CongregacaoId = @id`);
      if (c.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação inválida." } };
        return;
      }
      destinoCongregacaoNome = c.recordset[0].Nome;
    }
    if (departamentoId) {
      const d = await pool.request().input("id", sql.Int, departamentoId).query(`SELECT TOP 1 1 AS x FROM Departamentos WHERE DepartamentoId = @id`);
      if (d.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Departamento inválido." } };
        return;
      }
    }
    if (cargoMinisterial) {
      const cm = await pool.request().input("sigla", sql.NVarChar(30), cargoMinisterial).query(`SELECT TOP 1 1 AS x FROM CargosMinisteriais WHERE Sigla = @sigla`);
      if (cm.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Cargo ministerial "${cargoMinisterial}" não está cadastrado.` } };
        return;
      }
    }
    if (extensaoId) {
      const ex = await pool.request().input("id", sql.Int, extensaoId).query(`SELECT TOP 1 Nome FROM ExtensoesTenda WHERE ExtensaoId = @id`);
      if (ex.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Extensão da Tenda inválida." } };
        return;
      }
      destinoExtensaoNome = ex.recordset[0].Nome;
    }

    // Formas de admissão fixas do Estatuto Art. 6º §1º — regra jurídica, não catálogo
    // editável por tela (mesmo espírito de shared/estatuto.js).
    const FORMAS_ADMISSAO = ["BATISMO", "CARTA_MUDANCA", "RECONCILIACAO", "ACLAMACAO"];
    if (formaAdmissao && !FORMAS_ADMISSAO.includes(formaAdmissao)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Forma de admissão inválida. Use uma de: ${FORMAS_ADMISSAO.join(", ")}.` } };
      return;
    }

    // Estado Civil: só entra no modelo impresso da Carta de Trânsito (Reg. Art. 131),
    // não é regra jurídica — catálogo fixo simples.
    const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO", "UNIAO_ESTAVEL"];
    if (estadoCivil && !ESTADOS_CIVIS.includes(estadoCivil)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Estado civil inválido. Use um de: ${ESTADOS_CIVIS.join(", ")}.` } };
      return;
    }

    if (sexo != null && sexo !== "" && !SEXOS.includes(sexo)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Sexo inválido: M ou F." } };
      return;
    }
    let cargoDesdeFinal = null;
    if (cargoDesde != null && cargoDesde !== "") {
      // de 1950 em diante (há Diácono no cargo desde antes de 2000, onde começa a regra comum dos atos), nunca no futuro, dia que existe no calendário
      const txt = typeof cargoDesde === "string" ? cargoDesde.trim() : "";
      const existe = /^\d{4}-\d{2}-\d{2}$/.test(txt) && !Number.isNaN(Date.parse(`${txt}T00:00:00Z`)) && new Date(`${txt}T00:00:00Z`).toISOString().slice(0, 10) === txt;
      const d = !existe ? { valido: false, mensagem: "Informe a data de entrada no cargo (dia/mês/ano)." }
        : txt > hojeBrasilia() ? { valido: false, mensagem: "A data de entrada no cargo não pode ser no futuro." }
          : txt < "1950-01-01" ? { valido: false, mensagem: "A data de entrada no cargo está antiga demais." } : { valido: true, data: txt };
      if (!d.valido) {
        context.res = { status: 200, body: { sucesso: false, mensagem: d.mensagem } };
        return;
      }
      if (!cargoMinisterial || cargoMinisterial === "MEMBRO") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "\"No cargo desde\" só vale para quem tem cargo de oficial." } };
        return;
      }
      cargoDesdeFinal = d.data;
    }

    // Causa de saída (Reg. Art. 11 — v1.5): mesmo padrão de validação de FORMAS_ADMISSAO.
    if (motivoSaida && !CAUSAS_SAIDA.includes(motivoSaida)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Causa de saída inválida. Use uma de: ${CAUSAS_SAIDA.join(", ")}.` } };
      return;
    }

    // Situação do membro (v1.6): validada por consulta ao catálogo (SituacoesMembro é
    // editável por tela via GestaoCatalogos, diferente de FORMAS_ADMISSAO/CAUSAS_SAIDA,
    // que são regra jurídica fixa) — hoje era texto livre, sem checagem nenhuma.
    if (situacaoMembro) {
      const sit = await pool.request().input("sigla", sql.NVarChar(30), situacaoMembro).query(`SELECT TOP 1 1 AS x FROM SituacoesMembro WHERE Sigla = @sigla`);
      if (sit.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Situação "${situacaoMembro}" não está cadastrada no catálogo.` } };
        return;
      }
    }

    const existente = await pool.request().input("id", sql.Int, membroId).query(`
      SELECT m.MembroId, m.Status, m.Email AS EmailAnterior, m.CargoMinisterial AS CargoAnterior, m.DizimistaFiel AS DizimistaAnterior, m.Sexo AS SexoAnterior,
             CONVERT(varchar(10), m.DataNascimento, 120) AS NascimentoAnterior, CONVERT(varchar(10), m.DataAdmissao, 120) AS AdmissaoAnterior, m.EstadoCivil AS EstadoCivilAnterior,
             CASE WHEN EXISTS (SELECT 1 FROM Consagracoes cs LEFT JOIN TiposConsagracao tc ON tc.Nome = cs.Assunto
                               WHERE cs.MembroId = m.MembroId AND ISNULL(cs.CargoAlvo, tc.CargoMinisterialResultante) IS NOT NULL
                               AND cs.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')) THEN 1 ELSE 0 END AS EmProcessoDeCargo,
             CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pdx WHERE pdx.MembroId = m.MembroId AND pdx.Resultado = N'EXCLUSAO' AND pdx.CEIRecusouEm IS NULL
                               AND pdx.Status IN (N'JULGADO', N'EM_RECURSO')) THEN 1 ELSE 0 END AS TemExclusao,
             c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
      FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE m.MembroId = @id`);
    const existia = existente.recordset.length > 0;
    // O alvo (se já existe) e o destino (a congregação/extensão para onde vai) precisam estar no escopo de quem altera.
    if ((existia && !noEscopoDaPessoa(usuario, existente.recordset[0].CongregacaoNome, existente.recordset[0].ExtensaoNome)) || !noEscopoDaPessoa(usuario, destinoCongregacaoNome, destinoExtensaoNome)) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }
    // v8.2 — trocar o cargo (ou criar alguém já com cargo de oficial) e informar "no cargo desde": só o nível geral.
    const cargoAnterior = existia ? (existente.recordset[0].CargoAnterior || null) : null;
    const cargoNovo = cargoMinisterial || null;
    const geral = ehGeral(usuario);
    const semCargo = (c) => c === null || c === "MEMBRO";
    if (!geral && ((cargoAnterior !== cargoNovo && !(semCargo(cargoAnterior) && semCargo(cargoNovo))) || cargoDesdeFinal)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "O cargo ministerial muda pela esteira de consagração. Só a Secretaria (nível geral) corrige o cargo no cadastro." } };
      return;
    }
    // "Dizimista fiel" é requisito da escada (Art. 72) e da Diretoria (Estatuto Art. 23 §2º, I): o rótulo da tela sempre disse "só o Geral pode afirmar", mas o servidor
    // não conferia. Fora do nível geral o valor não muda (e pessoa nova entra "não informado").
    const bitOuNulo = (v) => (v === null || v === undefined ? null : v === "false" ? false : v === "true" ? true : !!v);
    const dizimistaAnterior = existia ? bitOuNulo(existente.recordset[0].DizimistaAnterior) : null;
    const dizimistaNovo = dizimistaFiel === undefined || dizimistaFiel === "" ? null : bitOuNulo(dizimistaFiel);
    if (!geral && dizimistaAnterior !== dizimistaNovo) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "\"Dizimista fiel\" só a Secretaria (nível geral) afirma." } };
      return;
    }
    // Sexo: sem o campo no pedido, fica o que estava (antes, um POST sem "sexo" apagava o dado que alimenta o teto das obreiras).
    const sexoAnterior = existia && existente.recordset[0].SexoAnterior ? String(existente.recordset[0].SexoAnterior).trim() : null;
    const sexoFinal = sexo === undefined ? sexoAnterior : (sexo || null);
    const cargoMuda = cargoAnterior !== cargoNovo && !(semCargo(cargoAnterior) && semCargo(cargoNovo));
    // Revisão independente (28/10/2026): ninguém mexe no que conta para a PRÓPRIA escada — protocolar, avançar, CHM e veto já barravam o próprio; o cadastro era o atalho.
    if (existia && Number(membroId) === Number(usuario.membroId) && (cargoMuda || cargoDesdeFinal || dizimistaAnterior !== dizimistaNovo || sexoAnterior !== sexoFinal)) {
      context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém altera o próprio cargo, a data no cargo, o dízimo nem o sexo no cadastro: peça a outra pessoa da Secretaria." } };
      return;
    }
    // Trava 8-A: nascimento e admissão (idade e tempo de membro do Auxiliar) e estado civil (escrutínio do CEI, "Pastor casado") também contam para a escada: ninguém
    // os muda em si mesmo, e com um processo de cargo em andamento só o nível geral muda.
    if (existia) {
      const ant = existente.recordset[0];
      const igual = (a, b) => (a ? String(a).slice(0, 10) : null) === (b ? String(b).slice(0, 10) : null);
      const mudouEscada = !igual(ant.NascimentoAnterior, dataNascimento) || !igual(ant.AdmissaoAnterior, dataAdmissao) || (ant.EstadoCivilAnterior || null) !== (estadoCivil || null);
      if (mudouEscada && Number(membroId) === Number(usuario.membroId)) {
        context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém altera a própria data de nascimento, de admissão nem o estado civil no cadastro: peça a outra pessoa da Secretaria." } };
        return;
      }
      // a data de admissão nova de quem tem exclusão julgada é a READMISSÃO (desfaz o "excluído" na credencial, na escada e na CLI): ato só do nível geral
      if (!igual(ant.AdmissaoAnterior, dataAdmissao) && !geral && ant.TemExclusao) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Esta pessoa tem exclusão julgada: a data de admissão nova é a readmissão, e só a Secretaria (nível geral) a registra." } };
        return;
      }
      if (mudouEscada && !geral && ant.EmProcessoDeCargo) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Esta pessoa tem um processo de cargo em andamento: nascimento, admissão e estado civil só a Secretaria (nível geral) altera." } };
        return;
      }
    }
    // A ficha aberta antes de uma consagração concluída não desfaz a promoção: a tela manda o cargo que leu (cargoOriginal); se o banco já tem outro, 409.
    const lido = req.body && Object.prototype.hasOwnProperty.call(req.body, "cargoOriginal") ? (req.body.cargoOriginal || null) : undefined;
    if (existia && lido !== undefined && lido !== cargoAnterior && !(semCargo(lido) && semCargo(cargoAnterior))) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "O cargo desta pessoa mudou enquanto a ficha estava aberta (uma consagração foi concluída?). Abra a ficha de novo antes de salvar." } };
      return;
    }
    const statusAnterior = existia ? existente.recordset[0].Status : null;
    const emailAnterior = existia ? existente.recordset[0].EmailAnterior : null;
    const statusFinal = status || "ATIVO";
    // Entrar num status terminal (vindo de outro) dispara a perda de membresia de
    // verdade: força Sem Comunhão, registra a data de saída (se não vier informada) e
    // encerra Assentos/Liderança/Cargo — mesmo racional já usado em GestaoCartas/processar
    // e na exclusão disciplinar, agora coberto também no fluxo manual de edição da Pessoa.
    const entrandoEmStatusTerminal = STATUS_TERMINAIS.includes(statusFinal) && statusAnterior !== statusFinal;
    const hojeISO = new Date().toISOString().slice(0, 10);
    const situacaoFinal = entrandoEmStatusTerminal
      ? "SEM_COMUNHAO"
      : (situacaoMembro || (status === "ATIVO" ? "EM_COMUNHAO" : "SEM_COMUNHAO"));
    const dataSaidaFinal = entrandoEmStatusTerminal ? (dataSaida || hojeISO) : (dataSaida || null);

    const request = pool.request()
      .input("id", sql.Int, membroId)
      .input("nome", sql.NVarChar(200), nome)
      .input("congregacaoId", sql.Int, congregacaoId || null)
      .input("status", sql.NVarChar(20), statusFinal)
      .input("dataNascimento", sql.Date, dataNascimento || null)
      .input("dataAdmissao", sql.Date, dataAdmissao || null)
      .input("dizimistaFiel", sql.Bit, dizimistaNovo)
      .input("situacaoMembro", sql.NVarChar(30), situacaoFinal)
      .input("departamentoId", sql.Int, departamentoId || null)
      .input("cargoMinisterial", sql.NVarChar(30), cargoMinisterial || null)
      .input("telefone", sql.NVarChar(20), telefone || null)
      .input("email", sql.NVarChar(150), email || null)
      .input("endereco", sql.NVarChar(300), endereco || null)
      .input("extensaoId", sql.Int, extensaoId || null)
      .input("dataBatismo", sql.Date, dataBatismo || null)
      .input("formaAdmissao", sql.NVarChar(30), formaAdmissao || null)
      .input("origem", sql.NVarChar(150), origem || null)
      .input("igrejaAnterior", sql.NVarChar(150), igrejaAnterior || null)
      .input("dataRitoRecebimento", sql.Date, dataRitoRecebimento || null)
      .input("nomeLidoRito", sql.NVarChar(200), nomeLidoRito || null)
      .input("ministranteRito", sql.NVarChar(150), ministranteRito || null)
      .input("estadoCivil", sql.NVarChar(20), estadoCivil || null)
      .input("dataAfastamento", sql.Date, dataAfastamento || null)
      .input("dataSaida", sql.Date, dataSaidaFinal)
      .input("motivoSaida", sql.NVarChar(200), motivoSaida || null)
      .input("sexo", sql.NChar(1), sexoFinal)
      .input("cargoLido", sql.NVarChar(30), cargoAnterior);

    if (existia) {
      // Funcao não entra aqui de propósito: é campo histórico gerido só pela
      // esteira de Consagrações (ver EvoluirConsagracao) — salvar a pessoa
      // nunca deve apagar o que já estava lá.
      const gravou = await request.query(`
        UPDATE MembroReferencia SET Nome = @nome, CongregacaoId = @congregacaoId, Status = @status,
               DataNascimento = @dataNascimento, DataAdmissao = @dataAdmissao, DizimistaFiel = @dizimistaFiel,
               SituacaoMembro = @situacaoMembro, DepartamentoId = @departamentoId, CargoMinisterial = @cargoMinisterial,
               Telefone = @telefone, Email = @email, Endereco = @endereco, ExtensaoId = @extensaoId,
               DataBatismo = @dataBatismo, FormaAdmissao = @formaAdmissao, Origem = @origem,
               IgrejaAnterior = @igrejaAnterior, DataRitoRecebimento = @dataRitoRecebimento,
               NomeLidoRito = @nomeLidoRito, MinistranteRito = @ministranteRito, EstadoCivil = @estadoCivil,
               DataAfastamento = @dataAfastamento, DataSaida = @dataSaida, MotivoSaida = @motivoSaida, Sexo = @sexo
        WHERE MembroId = @id AND ISNULL(CargoMinisterial, N'') = ISNULL(@cargoLido, N'')`);   // o cargo não mudou desde a leitura acima (uma conclusão no meio → 409)
      if (!(gravou && gravou.rowsAffected && gravou.rowsAffected[0])) {
        context.res = { status: 409, body: { sucesso: false, mensagem: "O cargo desta pessoa mudou enquanto você salvava. Abra a ficha de novo." } };
        return;
      }
    } else {
      await request.query(`
        INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, DataNascimento, DataAdmissao, DizimistaFiel, SituacaoMembro, DepartamentoId, CargoMinisterial, Telefone, Email, Endereco, ExtensaoId, DataBatismo, FormaAdmissao, Origem, IgrejaAnterior, DataRitoRecebimento, NomeLidoRito, MinistranteRito, EstadoCivil, DataAfastamento, DataSaida, MotivoSaida, Sexo)
        VALUES (@id, @nome, @congregacaoId, @status, @dataNascimento, @dataAdmissao, @dizimistaFiel, @situacaoMembro, @departamentoId, @cargoMinisterial, @telefone, @email, @endereco, @extensaoId, @dataBatismo, @formaAdmissao, @origem, @igrejaAnterior, @dataRitoRecebimento, @nomeLidoRito, @ministranteRito, @estadoCivil, @dataAfastamento, @dataSaida, @motivoSaida, @sexo)`);
    }

    // v8.2 — o histórico de cargos acompanha a troca (ou recebe a data informada). Falhou a trava? O cadastro já foi salvo; o histórico fica para a próxima gravação e a
    // escada mostra "data de entrada no cargo não informada" até lá (nunca presume a data).
    if (cargoAnterior !== cargoNovo || cargoDesdeFinal) {
      try {
        const h = await escadaDb.sincronizarCadastro(pool, { membroId, cargoAnterior, cargoNovo, desde: cargoDesdeFinal, por: usuario.membroId });
        if (!h.sucesso) context.log.warn(`[GestaoPessoas] histórico de cargos de ${membroId} não atualizado: ${h.mensagem}`);
      } catch (e) { context.log.error(`[GestaoPessoas] histórico de cargos de ${membroId} não atualizado: ${e.message}`); }
    }

    if (entrandoEmStatusTerminal) {
      await vacancia.encerrarVinculos(pool, sql, membroId, motivoSaida || statusFinal);   // também derruba as sessões abertas da pessoa
      await require("../shared/credencialDb").recolherSemFalhar(pool, membroId, motivoSaida || statusFinal, usuario.membroId);   // v8.4: o recolhimento da credencial
    } else if (existia && statusAnterior !== statusFinal && statusFinal !== "ATIVO") {
      // v7.6 — saiu do rol ativo (inativo, transferido, afastado...): as sessões abertas dela caem na hora (a entrada por PIN já exige status ATIVO).
      await auth.revogarSessoesDoMembro(pool, sql, membroId);
    }

    const result = await pool.request().input("id", sql.Int, membroId).query(`${SELECT_MEMBRO} WHERE m.MembroId = @id`);
    const membro = result.recordset[0];
    const emailMudou = existia && String(emailAnterior || "").trim().toLowerCase() !== String(email || "").trim().toLowerCase();
    const vDisciplinaMembro = auth.visaoDaPermissao(usuario, "disciplina");
    if (vDisciplinaMembro && noEscopoDaPessoa(vDisciplinaMembro, membro.congregacao, membro.extensao)) {
      const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
      membro.processoDisciplinarAtivo = idsSobDisciplina.has(membro.membroId);
    }
    membro.capacidade = estatuto.calcularCapacidadeEleitoral(membro);
    const idadeMembro = estatuto.idadeEm(membro.dataNascimento);
    membro.menorDeIdade = idadeMembro !== null && idadeMembro < 18;
    membro.fotoUrl = storage.urlComSas(membro.fotoUrl);

    await registrarAuditoria({
      tabela: "MembroReferencia",
      registroId: Number(membroId),
      acao: existia ? "Atualizou pessoa" : "Cadastrou pessoa",
      usuarioId: usuario.membroId,
      dadosDepois: { nome, cargoMinisterial, congregacaoId, status, formaAdmissao, dataAdmissao, ...(cargoAnterior !== cargoNovo ? { cargoAnterior } : {}), ...(cargoDesdeFinal ? { cargoDesde: cargoDesdeFinal } : {}),
        ...(dizimistaAnterior !== dizimistaNovo ? { dizimistaAnterior, dizimistaFiel: dizimistaNovo } : {}), ...(sexoAnterior !== sexoFinal ? { sexoAnterior, sexo: sexoFinal } : {}), ...(emailMudou ? { emailAlterado: true, emailAnterior: mascararEmail(emailAnterior), emailNovo: mascararEmail(email) } : {}) }
    });
    // O e-mail é por onde chega o código de acesso do membro: quem perdeu o endereço antigo precisa saber que ele mudou (e quem não pediu, estranhar).
    if (emailMudou && emailAnterior) {
      try {
        await enviarEmailNotificacao({
          email: emailAnterior,
          titulo: "O e-mail do seu cadastro na IEADESPA foi alterado",
          mensagem: `O e-mail do cadastro da matrícula ${membroId} foi alterado pela Secretaria. Se foi você quem pediu, não há nada a fazer; se não foi, avise a Secretaria da sua congregação.`
        });
      } catch (e) { context.log.error("Falha ao avisar o e-mail antigo:", e.message); }
    }

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: existia ? "✅ Pessoa atualizada." : "✅ Pessoa cadastrada.", membro } };
    return;
  }

  // ---- DELETE: desligar (não remove de verdade) ----
  if (method === "DELETE") {
    if (!membroIdRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/pessoas/{membroId}" } };
      return;
    }
    const alvoDesligar = (await pool.request().input("id", sql.Int, membroIdRota).query(`
      SELECT c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE m.MembroId = @id`)).recordset[0];
    // Matrícula que não existe e matrícula de fora do escopo recebem a mesma recusa: a resposta não diz quem tem cadastro.
    if (!alvoDesligar || !noEscopoDaPessoa(usuario, alvoDesligar.CongregacaoNome, alvoDesligar.ExtensaoNome)) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }
    const upd = await pool.request().input("id", sql.Int, membroIdRota)
      .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
              DataSaida = ISNULL(DataSaida, CAST(SYSUTCDATETIME() AS DATE))
              WHERE MembroId = @id AND Status <> 'DESLIGADO'`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada (ou já estava desligada)." } };
      return;
    }
    // Vacância automática (v1.5): fecha Assentos/Liderança/Cargo — mesmo helper
    // usado no procedimento de abandono e na exclusão disciplinar.
    await vacancia.encerrarVinculos(pool, sql, membroIdRota, "DESLIGAMENTO");
    await require("../shared/credencialDb").recolherSemFalhar(pool, membroIdRota, "Desligamento", usuario.membroId);   // v8.4: o recolhimento da credencial
    await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(membroIdRota), acao: "Desligou pessoa", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pessoa desligada." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
