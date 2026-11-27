// GestaoPessoas
// Cadastro de obreiros (MembroReferencia). Exige a permissão "pessoas".
// GET    /api/pessoas            -> lista (filtrada pelo escopo de quem está logado)
// POST   /api/pessoas            -> body: { membroId, nome, cargoMinisterial, congregacaoId, status, ... } -> cria ou atualiza
// DELETE /api/pessoas/{membroId} -> não remove de verdade: marca status = DESLIGADO
const auth = require("../shared/auth");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const disciplina = require("../shared/disciplina");
const vacancia = require("../shared/vacancia");
const storage = require("../shared/storage");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");
// v9.5 — o endereço em linhas (o bairro da lista alimenta o mapa territorial); a linha única Endereco passa a ser montada com elas
const territorioDb = require("../shared/territorioDb");

// fecho da v7.5 — o POST e o DELETE não conferiam o escopo: quem tinha "pessoas" numa congregação alterava, trocava o e-mail ou desligava QUALQUER membro de QUALQUER
// congregação (só o GET filtrava). E o e-mail virou a raiz da entrada por código ("primeiro acesso / esqueci o PIN"). Agora o alvo E o destino precisam estar no escopo.
// (a regra mora em shared/escopoRotas.js, usada por todas as rotas de ficha)
const { noEscopoDaPessoa, FORA_DO_ESCOPO, ehGeral, condicaoSqlEscopoPessoa } = require("../shared/escopoRotas");
const { escaparLike } = require("../shared/ebdLgpd");
// v10.1c — a lista em páginas (?pagina=N): 20 por página, no máximo 100
const POR_PAGINA_PADRAO = 20;
const POR_PAGINA_MAX = 100;
// v8.2 — Escada ministerial: o cargo ministerial muda pela esteira de consagração (shared/escada.js). No cadastro, só o nível GERAL (a Secretaria: importação e correção)
// troca o cargo ou informa "no cargo desde" — antes, quem tinha "pessoas" numa congregação punha alguém como Pastor e ele entrava na CLI por Ordenação. Toda troca entra no
// histórico de cargos (shared/escadaDb.sincronizarCadastro). Sexo (M/F): Missionária é o teto das obreiras (Regimento Art. 71, III).
const escadaDb = require("../shared/escadaDb");
const afm = require("../shared/afm");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const travaPermissoes = require("../shared/travaPermissoes");
const { dataIsoValida, obterTrava } = require("../shared/financeiroSeguro");
const { emTransacao } = require("../shared/transacaoCurta");
const nivelDoCargo = require("../shared/nivelDoCargo");
const licencaCandidatura = require("../shared/licencaCandidatura");
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
// As causas DISCIPLINARES (a mesma lista do histórico, HistoricoMembro): o motivo delas é sigiloso — só quem tem "disciplina" com a pessoa no escopo vê.
const SAIDAS_DISCIPLINARES = new Set(["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"]);
// A pessoa da resposta com o motivo da saída que quem vê pode ver: o disciplinar vira null sem "disciplina" no escopo dela (a data da saída continua).
function motivoSaidaVisivel(m, vDisciplina) {
  if (!m || !SAIDAS_DISCIPLINARES.has(m.motivoSaida)) return m;
  const pode = !!vDisciplina && noEscopoDaPessoa(vDisciplina, m.congregacao, m.extensao);
  return pode ? m : Object.assign({}, m, { motivoSaida: null });
}

// Status que encerram a membresia de vez — entrar num desses (vindo de outro status)
// dispara a vacância automática de Assentos/Liderança/Cargo (shared/vacancia.js).
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];
const DATA_SAIDA_MINIMA = "2006-01-01";   // a fundação da igreja
// A licença por candidatura entra e sai só pela aba "Licença Candidatura" (GestaoLicencasCandidatura): lá ficam o registro da licença, o afastamento dos cargos e
// a volta, que é decisão da Diretoria.
const LICENCA_CANDIDATURA = "LICENCA_CANDIDATURA";
const MSG_LICENCA_ABERTA = "Esta pessoa está em licença por candidatura: a volta e o não retorno se registram na aba \"Licença Candidatura\" (decisão da Diretoria, pelo nível geral); o falecimento, aqui na ficha, escolhendo \"Falecido\"; o desligamento, pelo botão \"Desligar\".";
// A recusa de nascimento, admissão e estado civil fora do nível geral, para quem NÃO vê a disciplina daquela pessoa: a mesma para a exclusão julgada e para o
// processo de cargo, sem dizer qual (revisão de fora, 26/11/2026: a mensagem da exclusão entregava o que a lista e a ficha escondem de quem não tem "disciplina").
const MSG_ESCADA_SO_GERAL = "A data de nascimento, a data de admissão e o estado civil desta pessoa só a Secretaria (nível geral) altera: peça a ela.";
const MSG_READMISSAO = "Esta pessoa tem exclusão julgada: a data de admissão nova é a readmissão, e só a Secretaria (nível geral) a registra.";
const MSG_PROCESSO_DE_CARGO = "Esta pessoa tem um processo de cargo em andamento: nascimento, admissão e estado civil só a Secretaria (nível geral) altera.";
// a licença por candidatura ainda aberta da pessoa (o índice IX_LicencasCandidatura_MembroId_Status, migração 300, atende a busca)
const SQL_LICENCA_ABERTA = (dica) => `SELECT TOP 1 LicencaId FROM LicencasCandidatura${dica} WHERE MembroId = @id AND Status = 'EM_LICENCA'`;
const TAMANHO_STATUS = 20;   // MembroReferencia.Status é NVARCHAR(20); a sigla do catálogo vai até 30

// As outras datas da ficha: um dia que existe (AAAA-MM-DD), dentro do que a coluna DATE guarda; nascimento, admissão e batismo nunca no futuro (dia de Brasília).
const DATAS_DA_FICHA = [
  ["dataNascimento", "a data de nascimento", true],
  ["dataAdmissao", "a data de admissão", true],
  ["dataBatismo", "a data do batismo", true],
  ["dataRitoRecebimento", "a data do rito de recebimento", false],
  ["dataAfastamento", "a data do afastamento", false]
];
function conferirDatasDaFicha(corpo, hoje) {
  for (const [campo, nome, naoNoFuturo] of DATAS_DA_FICHA) {
    const valor = corpo[campo];
    if (valor === undefined || valor === null || valor === "") continue;   // sem a data, como sempre
    if (!dataIsoValida(valor) || valor < "0001-01-01") return `Informe ${nome} (dia/mês/ano).`;
    if (naoNoFuturo && valor > hoje) return `${nome[0].toUpperCase()}${nome.slice(1)} não pode ser no futuro.`;
  }
  return null;
}

// Tirar do rol ativo quem tem cargo de liderança: a secretaria do nível do cargo ou de cima, o 428 e a trava do último administrador (regra do responsável,
// 25/11/2026: shared/nivelDoCargo.js, a mesma da licença por candidatura).
const conferirSaidaDeLideranca = (pool, req, context, usuario, membroId) => nivelDoCargo.conferirSaidaDeLideranca(pool, sql, req, context, usuario, membroId);

// "funcao" no retorno é só de exibição: prioriza o nome do Cargo Ministerial
// (catálogo fechado, com escada — Art. 71) e cai pro texto livre antigo só se
// a pessoa ainda não tiver Cargo Ministerial definido (dado histórico). Quem
// alimenta isso é a esteira de Consagrações (EvoluirConsagracao) e/ou o campo
// licencaAberta: quem está em LICENCA_CANDIDATURA com a licença ainda aberta (a ficha, na tela, oferece só o falecimento; com a licença já encerrada, a lista
// inteira — decisão de 25/11/2026). Só consulta as licenças quando alguém da lista está nessa situação.
async function marcarLicencaAberta(pool, membros) {
  const algumNaLicenca = membros.some(m => m.status === LICENCA_CANDIDATURA);
  const abertas = algumNaLicenca
    ? new Set(((await pool.request().query("SELECT MembroId FROM LicencasCandidatura WHERE Status = 'EM_LICENCA'")).recordset || []).map(r => r.MembroId))
    : new Set();
  return membros.map(m => Object.assign({}, m, { licencaAberta: m.status === LICENCA_CANDIDATURA && abertas.has(m.membroId) }));
}

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
         m.EnderecoLogradouro AS enderecoLogradouro, m.EnderecoNumero AS enderecoNumero, m.EnderecoComplemento AS enderecoComplemento,
         m.EnderecoBairroId AS enderecoBairroId, bm.Nome AS enderecoBairroNome, m.EnderecoBairroTexto AS enderecoBairroTexto,
         m.EnderecoCidade AS enderecoCidade, m.EnderecoUF AS enderecoUF, m.EnderecoCep AS enderecoCep,
         m.ExtensaoId AS extensaoId, e.Nome AS extensao, m.EstadoCivil AS estadoCivil,
         CONVERT(varchar(10), m.DataAfastamento, 120) AS dataAfastamento,
         CONVERT(varchar(10), m.DataSaida, 120) AS dataSaida, m.MotivoSaida AS motivoSaida,
         m.FotoUrl AS fotoUrl, m.Sexo AS sexo, CONVERT(varchar(10), hc.Desde, 120) AS cargoDesde
  FROM MembroReferencia m
  LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
  LEFT JOIN Bairros bm ON bm.BairroId = m.EnderecoBairroId
  LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
  LEFT JOIN CargosMinisteriaisHistorico hc ON hc.MembroId = m.MembroId AND hc.Ate IS NULL AND hc.Cargo = m.CargoMinisterial`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const pool = await getPool();

  // ---- GET ?lista=bairros: o catálogo dos bairros para o endereço em linhas (v9.5) — nome, cidade e UF, sem dado de ninguém ----
  if (method === "GET" && req.query && req.query.lista === "bairros") {
    context.res = { status: 200, body: { sucesso: true, bairros: await territorioDb.bairrosParaEscolher(pool) } };
    return;
  }

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
    // v10.1c — o escopo filtra NO BANCO (antes lia o campo inteiro e escondia na memória): o dirigente recebe só a sua congregação, o pastor de área só a área.
    const pedido = pool.request();
    const condEscopo = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "e.Nome");
    const condicoes = condEscopo ? [condEscopo] : [];
    // ?pagina=N — a lista em páginas, com a busca e os filtros no banco (para a tela nova da lista; sem ?pagina a resposta continua sendo a lista inteira do escopo).
    const paginada = req.query && req.query.pagina !== undefined && req.query.pagina !== "";
    let pagina = 1, porPagina = POR_PAGINA_PADRAO, total = 0;
    if (paginada) {
      pagina = Math.max(1, Math.min(100000, parseInt(req.query.pagina, 10) || 1));
      porPagina = Math.max(1, Math.min(POR_PAGINA_MAX, parseInt(req.query.porPagina, 10) || POR_PAGINA_PADRAO));
      const busca = String(req.query.busca || "").trim().slice(0, 100);
      if (busca) {
        pedido.input("busca", sql.NVarChar(210), `%${escaparLike(busca)}%`);
        condicoes.push(/^\d+$/.test(busca)
          ? "(m.Nome LIKE @busca ESCAPE '\\' OR CAST(m.MembroId AS NVARCHAR(12)) LIKE @busca ESCAPE '\\')"
          : "m.Nome LIKE @busca ESCAPE '\\'");
      }
      const congId = auth.idDeRota(req.query.congregacaoId);
      if (req.query.congregacaoId !== undefined && req.query.congregacaoId !== "") {
        if (!congId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Congregação inválida." } }; return; }
        pedido.input("filtroCong", sql.Int, congId);
        condicoes.push("m.CongregacaoId = @filtroCong");
      }
      const situacao = String(req.query.situacao || "").trim();
      if (situacao) {
        pedido.input("filtroSituacao", sql.NVarChar(30), situacao.slice(0, 30));
        condicoes.push("m.SituacaoMembro = @filtroSituacao");
      }
    }
    if (condEscopo === "") {
      // a visão não alcança congregação nenhuma: lista vazia, sem ler o cadastro
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: paginada ? { sucesso: true, itens: [], total: 0, pagina, porPagina } : [] };
      return;
    }
    const onde = condicoes.length ? ` WHERE ${condicoes.join(" AND ")}` : "";
    let linhas;
    if (paginada) {
      pedido.input("pular", sql.Int, (pagina - 1) * porPagina).input("trazer", sql.Int, porPagina);
      const r = await pedido.query(`
        SELECT COUNT(*) AS total FROM MembroReferencia m LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId${onde};
        ${SELECT_MEMBRO}${onde} ORDER BY m.Nome, m.MembroId OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY`);
      total = r.recordsets && r.recordsets[0] && r.recordsets[0][0] ? Number(r.recordsets[0][0].total) || 0 : 0;
      linhas = (r.recordsets && r.recordsets[1]) || [];
    } else {
      linhas = (await pedido.query(`${SELECT_MEMBRO}${onde} ORDER BY m.Nome`)).recordset;
    }
    const membros = (await marcarLicencaAberta(pool, linhas))
      // Escopo EXTENSAO é mais estreito que a Congregação-Mãe: só quem tem exatamente essa Extensão vinculada entra na lista (noEscopoDaPessoa confere os
      // dois, concessão por concessão). O banco já filtrou; esta é a segunda conferência (nunca deixa passar quem está fora).
      .filter(m => noEscopoDaPessoa(usuario, m.congregacao, m.extensao))
      .map(m => Object.assign({}, m, { processoDisciplinarAtivo: !!vDisciplina && noEscopoDaPessoa(vDisciplina, m.congregacao, m.extensao) && idsSobDisciplina.has(m.membroId) }))
      // FASE 10 (18/11/2026, autorizado pelo responsável): o motivo de uma saída DISCIPLINAR (exclusão, abandono) só vai a quem tem "disciplina" com a pessoa no
      // escopo dessa permissão — antes ia no JSON da lista a todo mundo que tinha "pessoas" (a tela nova não mostrava, mas a resposta levava)
      .map(m => motivoSaidaVisivel(m, vDisciplina))
      .map(m => Object.assign({}, m, { capacidade: estatuto.calcularCapacidadeEleitoral(m) }))
      .map(m => {
        const idade = estatuto.idadeEm(m.dataNascimento);
        return Object.assign({}, m, { menorDeIdade: idade !== null && idade < 18 });
      })
      // O container do Blob Storage é privado (LGPD — ver shared/storage.js): a
      // URL crua salva no banco não abre sozinha, precisa de um link assinado
      // (SAS) gerado na hora, com validade curta.
      .map(m => Object.assign({}, m, { fotoUrl: storage.urlComSas(m.fotoUrl) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: paginada ? { sucesso: true, itens: membros, total, pagina, porPagina } : membros };
    return;
  }

  // ---- POST: criar ou atualizar ----
  if (method === "POST") {
    const {
      membroId: membroIdCorpo, nome, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel,
      situacaoMembro, departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId,
      dataBatismo, formaAdmissao, origem, igrejaAnterior,
      dataRitoRecebimento, nomeLidoRito, ministranteRito, estadoCivil,
      dataAfastamento, motivoSaida, dataSaida, sexo, cargoDesde, enderecoPartes
    } = req.body || {};
    if (!membroIdCorpo || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, nome." } };
      return;
    }
    // A matrícula é o número inteiro, escrito como número (a mesma régua das rotas): daqui em diante, a leitura, as travas e a gravação usam este valor.
    const membroId = auth.idDeRota(typeof membroIdCorpo === "string" ? membroIdCorpo.trim() : membroIdCorpo);
    if (!membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula inválida: informe só o número da matrícula." } };
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

    // A data de saída, quando vem no pedido, é um dia que existe (AAAA-MM-DD): ela fica gravada e os prazos de retenção contam dela.
    // Regra do responsável (25/11/2026): de 2006 (a fundação da igreja) até hoje, pelo dia de Brasília.
    const dataSaidaInformada = dataSaida !== undefined && dataSaida !== null && dataSaida !== "";
    if (dataSaidaInformada && !dataIsoValida(dataSaida)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a data de saída (dia/mês/ano)." } };
      return;
    }
    if (dataSaidaInformada && (dataSaida < DATA_SAIDA_MINIMA || dataSaida > hojeBrasilia())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A data de saída vai de 01/01/2006 (a fundação da igreja) até hoje." } };
      return;
    }
    const erroNasDatas = conferirDatasDaFicha(req.body, hojeBrasilia());
    if (erroNasDatas) {
      context.res = { status: 400, body: { sucesso: false, mensagem: erroNasDatas } };
      return;
    }
    // A situação no rol, quando vem, é a sigla de uma situação do catálogo (StatusMembro); a conferência no catálogo vem depois da leitura da pessoa.
    const statusInformado = status !== undefined && status !== null && status !== "";
    if (statusInformado && (typeof status !== "string" || status.length > 30)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Situação no rol inválida: escolha uma das situações da lista." } };
      return;
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
      SELECT m.MembroId, m.Status, m.Email AS EmailAnterior, m.MotivoSaida AS MotivoAnterior, m.CargoMinisterial AS CargoAnterior, m.DizimistaFiel AS DizimistaAnterior, m.Sexo AS SexoAnterior,
             CONVERT(varchar(10), m.DataNascimento, 120) AS NascimentoAnterior, CONVERT(varchar(10), m.DataAdmissao, 120) AS AdmissaoAnterior, m.EstadoCivil AS EstadoCivilAnterior,
             CONVERT(varchar(10), m.DataSaida, 120) AS DataSaidaAnterior,
             CASE WHEN EXISTS (SELECT 1 FROM Consagracoes cs LEFT JOIN TiposConsagracao tc ON tc.Nome = cs.Assunto
                               WHERE cs.MembroId = m.MembroId AND ISNULL(cs.CargoAlvo, tc.CargoMinisterialResultante) IS NOT NULL
                               AND cs.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')) THEN 1 ELSE 0 END AS EmProcessoDeCargo,
             CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pdx WHERE pdx.MembroId = m.MembroId AND pdx.Resultado = N'EXCLUSAO' AND pdx.CEIRecusouEm IS NULL
                               AND pdx.Status IN (N'JULGADO', N'EM_RECURSO')) THEN 1 ELSE 0 END AS TemExclusao,
             c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
      FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE m.MembroId = @id`);
    const existia = existente.recordset.length > 0;
    // O alvo (se já existe) e o destino (a congregação/extensão para onde vai) precisam estar no escopo de quem altera. O alvo vem PRIMEIRO, antes de qualquer
    // consulta que dependa dos dados dele (a Extensão abaixo olha a Extensão atual da pessoa): fora do escopo, a resposta é a mesma, qualquer que seja o pedido.
    if (existia && !noEscopoDaPessoa(usuario, existente.recordset[0].CongregacaoNome, existente.recordset[0].ExtensaoNome)) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }
    if (extensaoId) {
      // v9.2 — a Extensão precisa estar ativa (a emancipada ou desativada só vale para quem já está nela: o registro histórico) e ser da congregação da pessoa
      const ex = await pool.request().input("id", sql.Int, extensaoId).input("m", sql.Int, membroId).input("c", sql.Int, congregacaoId || null)
        .query(`SELECT TOP 1 Nome FROM ExtensoesTenda WHERE ExtensaoId = @id
                  AND (Ativa = 1 OR ExtensaoId = (SELECT ExtensaoId FROM MembroReferencia WHERE MembroId = @m))
                  AND (@c IS NULL OR CongregacaoMaeId = @c)`);
      if (ex.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Extensão da Tenda inválida (inativa, emancipada ou de outra congregação)." } };
        return;
      }
      destinoExtensaoNome = ex.recordset[0].Nome;
    }
    if (!noEscopoDaPessoa(usuario, destinoCongregacaoNome, destinoExtensaoNome)) {
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
    // (A recusa da exclusão julgada e do processo de cargo fica para o fim, logo antes da gravação: ver "a última recusa" abaixo.)
    let mudouAdmissao = false, mudouEscada = false;
    if (existia) {
      const ant = existente.recordset[0];
      const igual = (a, b) => (a ? String(a).slice(0, 10) : null) === (b ? String(b).slice(0, 10) : null);
      mudouAdmissao = !igual(ant.AdmissaoAnterior, dataAdmissao);
      mudouEscada = !igual(ant.NascimentoAnterior, dataNascimento) || mudouAdmissao || (ant.EstadoCivilAnterior || null) !== (estadoCivil || null);
      if (mudouEscada && Number(membroId) === Number(usuario.membroId)) {
        context.res = { status: 422, body: { sucesso: false, mensagem: "Ninguém altera a própria data de nascimento, de admissão nem o estado civil no cadastro: peça a outra pessoa da Secretaria." } };
        return;
      }
    }
    // A ficha aberta antes de uma consagração concluída não desfaz a promoção: a tela manda o cargo que leu (cargoOriginal); se o banco já tem outro, 409.
    const lido = req.body && Object.prototype.hasOwnProperty.call(req.body, "cargoOriginal") ? (req.body.cargoOriginal || null) : undefined;
    if (existia && lido !== undefined && lido !== cargoAnterior && !(semCargo(lido) && semCargo(cargoAnterior))) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "O cargo desta pessoa mudou enquanto a ficha estava aberta (uma consagração foi concluída?). Abra a ficha de novo antes de salvar." } };
      return;
    }
    // o motivo de uma saída disciplinar que quem salva NÃO vê (a lista e a ficha o mandam como vazio): fica o que estava — a ficha aberta sem "disciplina" nunca apaga
    // nem troca a causa disciplinar ao salvar
    const motivoAnterior = existia ? (existente.recordset[0].MotivoAnterior || null) : null;
    const vDiscSalvar = auth.visaoDaPermissao(usuario, "disciplina");
    const veDisciplinaDaPessoa = existia && !!(vDiscSalvar && noEscopoDaPessoa(vDiscSalvar, existente.recordset[0].CongregacaoNome, existente.recordset[0].ExtensaoNome));
    const motivoOculto = existia && SAIDAS_DISCIPLINARES.has(motivoAnterior) && !veDisciplinaDaPessoa;
    const motivoSaidaFinal = motivoOculto ? motivoAnterior : (motivoSaida || null);
    const statusAnterior = existia ? existente.recordset[0].Status : null;
    const emailAnterior = existia ? existente.recordset[0].EmailAnterior : null;
    // Sem a situação no pedido, ATIVO (como sempre). A situação já gravada fica, mesmo que a Secretaria a tenha desativado no catálogo. Outra situação: só a ativa
    // do catálogo, e a gravação usa a sigla que o catálogo devolve (o banco compara sem caixa e sem o espaço do fim; as conferências abaixo comparam a sigla).
    let statusFinal = "ATIVO";
    if (statusInformado && existia && status === statusAnterior) {
      statusFinal = statusAnterior;
    } else if (statusInformado) {
      const cat = await pool.request().input("sigla", sql.NVarChar(30), status).query(`SELECT TOP 1 Sigla, Ativa FROM StatusMembro WHERE Sigla = @sigla`);
      const linha = cat.recordset[0];
      const sigla = linha ? String(linha.Sigla) : null;
      if (!linha || (!linha.Ativa && sigla !== statusAnterior)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Situação no rol fora do catálogo: escolha uma das situações da lista." } };
        return;
      }
      if (sigla.length > TAMANHO_STATUS) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `A sigla desta situação passa de ${TAMANHO_STATUS} letras e não cabe no cadastro: ajuste o catálogo de situações.` } };
        return;
      }
      statusFinal = sigla;
    }
    if (statusFinal === LICENCA_CANDIDATURA && statusAnterior !== LICENCA_CANDIDATURA) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A licença por candidatura se registra na aba \"Licença Candidatura\" da pessoa: lá ficam a licença e o afastamento dos cargos." } };
      return;
    }
    // Da licença ABERTA, a ficha só grava o falecimento (a licença fecha junto, na transação abaixo); a volta e o não retorno são da aba da licença, o
    // desligamento é o botão "Desligar" (que também fecha a licença). Sem licença aberta (encerrada por uma exclusão, ou o "não retornou" de antes), a ficha
    // aceita a situação normalmente (decisão de 25/11/2026); a transação confere de novo, sob a trava da escada, que nenhuma licença abriu no meio.
    const saindoDaLicenca = statusAnterior === LICENCA_CANDIDATURA && statusFinal !== LICENCA_CANDIDATURA;
    const conferirLicencaFechada = saindoDaLicenca && statusFinal !== "FALECIDO";
    if (conferirLicencaFechada) {
      const aberta = await pool.request().input("id", sql.Int, membroId).query(SQL_LICENCA_ABERTA(""));
      if ((aberta.recordset || []).length) {
        context.res = { status: 409, body: { sucesso: false, mensagem: MSG_LICENCA_ABERTA } };
        return;
      }
    }
    // Entrar num status terminal (vindo de outro) dispara a perda de membresia de
    // verdade: força Sem Comunhão, registra a data de saída (se não vier informada) e
    // encerra Assentos/Liderança/Cargo — mesmo racional já usado em GestaoCartas/processar
    // e na exclusão disciplinar, agora coberto também no fluxo manual de edição da Pessoa.
    const entrandoEmStatusTerminal = STATUS_TERMINAIS.includes(statusFinal) && statusAnterior !== statusFinal;
    // sair do rol ativo (para qualquer outra situação, inclusive as terminais) corta o acesso: quem tem cargo de liderança passa pela conferência
    const saindoDoRolAtivo = existia && statusAnterior !== statusFinal && statusFinal !== "ATIVO";
    if (saindoDoRolAtivo && !(await conferirSaidaDeLideranca(pool, req, context, usuario, membroId))) return;
    // a volta ao rol ativo devolve o acesso do cargo (INATIVO, AFASTADO e LICENÇA não encerram o mandato; o login só exige ATIVO): a mesma regra do nível do cargo e
    // a confirmação recente, sem a trava do último administrador. A ficha sem o campo da situação vale ATIVO: também é volta.
    const voltandoAoRolAtivo = existia && statusAnterior !== statusFinal && statusFinal === "ATIVO";
    if (voltandoAoRolAtivo && !(await nivelDoCargo.conferirVoltaDeLideranca(pool, sql, req, context, usuario, membroId))) return;
    // O e-mail é o destino do código de acesso (a segunda etapa do login e o "esqueci o PIN"): trocar ou apagar o de quem tem cargo segue o nível do cargo + 428.
    // Sem o campo no pedido, o e-mail é apagado (como sempre): também conta como troca.
    const emailMudou = existia && String(emailAnterior || "").trim().toLowerCase() !== String(email || "").trim().toLowerCase();
    if (emailMudou && !(await nivelDoCargo.conferirTrocaDeEmailDeLideranca(pool, sql, req, context, usuario, membroId))) return;
    const hojeISO = hojeBrasilia();   // a data da saída é o dia de Brasília (depois das 21h o de Greenwich já é amanhã)
    const situacaoFinal = entrandoEmStatusTerminal
      ? "SEM_COMUNHAO"
      : (situacaoMembro || (statusInformado && statusFinal === "ATIVO" ? "EM_COMUNHAO" : "SEM_COMUNHAO"));
    // A ficha não manda a data de saída (só a mostra): sem a data no pedido (ou com ela vazia), quem continua fora do rol ativo mantém a data gravada (o
    // histórico e os prazos de retenção contam dela). A data informada vale; a volta a ATIVO a limpa, como antes.
    // De uma situação terminal para a outra (desligado para falecido, ou o contrário), a saída já aconteceu: fica a data gravada (sem ela, hoje, como no Desligar).
    const dataSaidaGuardada = existia ? (existente.recordset[0].DataSaidaAnterior || null) : null;
    const deTerminalParaTerminal = entrandoEmStatusTerminal && STATUS_TERMINAIS.includes(statusAnterior);
    const dataSaidaFinal = entrandoEmStatusTerminal ? (dataSaidaInformada ? dataSaida : (deTerminalParaTerminal && dataSaidaGuardada) || hojeISO)
      : dataSaidaInformada ? dataSaida
        : statusFinal !== "ATIVO" ? dataSaidaGuardada : null;

    // v9.5 — o endereço em linhas: vindo da tela nova (enderecoPartes), a linha única é montada com ele; vindo só a linha única (tela antiga), as linhas ficam se a
    // linha não mudou e são limpas se mudou (deixariam de corresponder).
    let enderecoFinal = endereco || null, partesFinais = null;
    if (enderecoPartes !== undefined && enderecoPartes !== null) {
      const prep = await territorioDb.prepararEnderecoMembro(() => pool.request(), enderecoPartes, { membroId: existia ? membroId : null });
      if (!prep.sucesso) { context.res = { status: 200, body: { sucesso: false, mensagem: prep.mensagem } }; return; }
      enderecoFinal = prep.endereco; partesFinais = prep.partes;
    } else if (existia) {
      partesFinais = await territorioDb.linhasDiantedaLinhaLegada(() => pool.request(), membroId, enderecoFinal);
    }

    // A ÚLTIMA recusa antes da gravação (Trava 8-A e a readmissão). Fora do nível geral: a data de admissão nova de quem tem exclusão julgada é a READMISSÃO
    // (desfaz o "excluído" na credencial, na escada e na CLI), e com um processo de cargo em andamento nascimento, admissão e estado civil não mudam.
    // Vem depois de todas as recusas que quem salva provoca à vontade (o cargo lido, a situação, o endereço...): antes, a recusa da exclusão vinha primeiro e
    // a diferença entre ela e o 409 do cargo lido servia de sonda sem gravar nada. Quem não vê a disciplina desta pessoa recebe a mesma resposta nos dois
    // casos (MSG_ESCADA_SO_GERAL); quem vê recebe a explicação (revisão de fora, 26/11/2026).
    if (existia && !geral) {
      const ant = existente.recordset[0];
      const barraExclusao = mudouAdmissao && !!ant.TemExclusao;
      const barraProcesso = mudouEscada && !!ant.EmProcessoDeCargo;
      if (barraExclusao || barraProcesso) {
        const mensagem = !veDisciplinaDaPessoa ? MSG_ESCADA_SO_GERAL : barraExclusao ? MSG_READMISSAO : MSG_PROCESSO_DE_CARGO;
        context.res = { status: 403, body: { sucesso: false, mensagem } };
        return;
      }
    }

    // os parâmetros da gravação (o endereço entra à parte: com um bairro da lista, a linha única é refeita com o bairro travado — revisão de 06/11/2026)
    const preencher = (request) => request
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
      .input("motivoSaida", sql.NVarChar(200), motivoSaidaFinal)
      .input("sexo", sql.NChar(1), sexoFinal)
      .input("cargoLido", sql.NVarChar(30), cargoAnterior)
      .input("statusLido", sql.NVarChar(TAMANHO_STATUS), statusAnterior);
    const gravarPessoa = async (request, prepEnd) => {
      request.input("endereco", sql.NVarChar(300), prepEnd.endereco);
      territorioDb.entradasEndereco(request, prepEnd.partes);
      if (existia) {
      // Funcao não entra aqui de propósito: é campo histórico gerido só pela
      // esteira de Consagrações (ver EvoluirConsagracao) — salvar a pessoa
      // nunca deve apagar o que já estava lá.
        const gravou = await request.query(`
        UPDATE MembroReferencia SET Nome = @nome, CongregacaoId = @congregacaoId, Status = @status,
               DataNascimento = @dataNascimento, DataAdmissao = @dataAdmissao, DizimistaFiel = @dizimistaFiel,
               SituacaoMembro = @situacaoMembro, DepartamentoId = @departamentoId, CargoMinisterial = @cargoMinisterial,
               Telefone = @telefone, Email = @email, Endereco = @endereco, ExtensaoId = @extensaoId, ${territorioDb.SET_ENDERECO},
               DataBatismo = @dataBatismo, FormaAdmissao = @formaAdmissao, Origem = @origem,
               IgrejaAnterior = @igrejaAnterior, DataRitoRecebimento = @dataRitoRecebimento,
               NomeLidoRito = @nomeLidoRito, MinistranteRito = @ministranteRito, EstadoCivil = @estadoCivil,
               DataAfastamento = @dataAfastamento, DataSaida = @dataSaida, MotivoSaida = @motivoSaida, Sexo = @sexo
        WHERE MembroId = @id AND ISNULL(CargoMinisterial, N'') = ISNULL(@cargoLido, N'') AND Status = @statusLido`);   // o cargo e a situação não mudaram desde a leitura acima (→ 409)
        const passou = !!(gravou && gravou.rowsAffected && gravou.rowsAffected[0]);
        return { gravou: passou, desfazer: !passou };
      }
      await request.query(`
        INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, DataNascimento, DataAdmissao, DizimistaFiel, SituacaoMembro, DepartamentoId, CargoMinisterial, Telefone, Email, Endereco, ExtensaoId, DataBatismo, FormaAdmissao, Origem, IgrejaAnterior, DataRitoRecebimento, NomeLidoRito, MinistranteRito, EstadoCivil, DataAfastamento, DataSaida, MotivoSaida, Sexo, ${territorioDb.COLUNAS_ENDERECO})
        VALUES (@id, @nome, @congregacaoId, @status, @dataNascimento, @dataAdmissao, @dizimistaFiel, @situacaoMembro, @departamentoId, @cargoMinisterial, @telefone, @email, @endereco, @extensaoId, @dataBatismo, @formaAdmissao, @origem, @igrejaAnterior, @dataRitoRecebimento, @nomeLidoRito, @ministranteRito, @estadoCivil, @dataAfastamento, @dataSaida, @motivoSaida, @sexo, ${territorioDb.VALORES_ENDERECO})`);
      return { gravou: true };
    };
    const prepEnd = { partes: partesFinais, endereco: enderecoFinal };
    // v8.2 — o histórico de cargos acompanha a troca (ou recebe a data informada).
    const mexeNoHistorico = cargoAnterior !== cargoNovo || !!cargoDesdeFinal;
    // O motivo que a vacância grava nos vínculos encerrados: a causa da saída informada ou, sem ela, a do próprio status (o falecido sai por falecimento).
    const motivoDaVacancia = motivoSaidaFinal || (statusFinal === "FALECIDO" ? "FALECIMENTO" : "DESLIGAMENTO");
    // A ficha, o histórico de cargos, a vacância (ou o corte do acesso de quem sai do rol ativo) e a trilha numa transação só: uma falha no meio desfaz tudo e
    // o pedido pode ser repetido. Quando o cargo ou o rol mudam, a trava da escada vem primeiro (a mesma da cerimônia de consagração e do abandono).
    let licencaEncerrada = 0;
    const desfecho = await emTransacao(pool, async ({ rq, executor, transacao, desistir }) => {
      if ((mexeNoHistorico || entrandoEmStatusTerminal || saindoDaLicenca) && !(await obterTrava(rq, `escada_${membroId}`))) { await desistir(); return "OCUPADA"; }
      if (conferirLicencaFechada && ((await rq().input("id", sql.Int, membroId).query(SQL_LICENCA_ABERTA(" WITH (UPDLOCK, HOLDLOCK)"))).recordset || []).length) {
        await desistir();
        return "LICENCA_ABERTA";
      }
      // quem sai do rol ativo perde o acesso: a trava do último administrador conferida de novo aqui dentro, antes de gravar (shared/travaPermissoes.js)
      if (saindoDoRolAtivo) {
        const recusa = await travaPermissoes.conferirUltimoNaTransacao(rq, sql, membroId, hojeISO);
        if (recusa) { await desistir(); return recusa; }
      }
      await territorioDb.travarBairroDaFicha(rq, prepEnd);   // com um bairro da lista, a linha única é refeita com o bairro travado (revisão de 06/11/2026)
      const gravacao = await gravarPessoa(preencher(rq()), prepEnd);
      if (!gravacao.gravou) { await desistir(); return "FICHA_MUDOU"; }
      if (mexeNoHistorico) await escadaDb.sincronizarCadastroNaTransacao(transacao, { membroId, cargoAnterior, cargoNovo, desde: cargoDesdeFinal, por: usuario.membroId });
      if (entrandoEmStatusTerminal) {
        await vacancia.encerrarVinculos(executor, sql, membroId, motivoDaVacancia);   // também derruba as sessões abertas da pessoa
        if (saindoDaLicenca && statusFinal === "FALECIDO") licencaEncerrada = await licencaCandidatura.encerrarLicencaAberta(executor, sql, membroId, "Encerrada pelo falecimento.", hojeISO);
      } else if (saindoDoRolAtivo) {
        // v7.6 — saiu do rol ativo (inativo, transferido, afastado...): as sessões abertas dela caem na hora (a entrada por PIN já exige status ATIVO).
        // As delegações dela (dadas e recebidas) ficam canceladas e as sessões de quem recebeu caem junto (shared/delegacoes.js).
        await require("../shared/delegacoes").encerrarDelegacoesDaPessoa(executor, sql, membroId);
        await auth.revogarSessoesDoMembro(executor, sql, membroId);
      }
      await registrarAuditoriaNaTransacao(transacao, {
        tabela: "MembroReferencia",
        registroId: Number(membroId),
        acao: existia ? "Atualizou pessoa" : "Cadastrou pessoa",
        usuarioId: usuario.membroId,
        dadosDepois: { nome, cargoMinisterial, congregacaoId, status: statusFinal, formaAdmissao, dataAdmissao, ...(cargoAnterior !== cargoNovo ? { cargoAnterior } : {}), ...(cargoDesdeFinal ? { cargoDesde: cargoDesdeFinal } : {}),
          ...(dizimistaAnterior !== dizimistaNovo ? { dizimistaAnterior, dizimistaFiel: dizimistaNovo } : {}), ...(sexoAnterior !== sexoFinal ? { sexoAnterior, sexo: sexoFinal } : {}), ...(emailMudou ? { emailAlterado: true, emailAnterior: mascararEmail(emailAnterior), emailNovo: mascararEmail(email) } : {}), ...(licencaEncerrada ? { licencaEncerrada: true } : {}) }
      });
      return "GRAVOU";
    });
    if (desfecho === "OCUPADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Outra alteração desta pessoa está em andamento. Tente de novo em instantes." } };
      return;
    }
    if (desfecho === "ULTIMO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: travaPermissoes.MENSAGEM_ULTIMO } };
      return;
    }
    if (desfecho === "LICENCA_ABERTA") {
      context.res = { status: 409, body: { sucesso: false, mensagem: MSG_LICENCA_ABERTA } };
      return;
    }
    if (desfecho === "FICHA_MUDOU") {
      context.res = { status: 409, body: { sucesso: false, mensagem: "O cargo ou a situação desta pessoa mudou enquanto você salvava. Abra a ficha de novo." } };
      return;
    }
    // O e-mail é por onde chega o código de acesso do membro: quem perdeu o endereço antigo precisa saber que ele mudou (e quem não pediu, estranhar). Vai logo
    // depois do commit (antes da credencial e da releitura, que podem falhar), e o resultado é lido: o aviso que não sai fica dito na resposta e na trilha.
    let avisoEmailNaoSaiu = false;
    if (emailMudou && emailAnterior) {
      let enviado = false;
      try {
        enviado = await enviarEmailNotificacao({
          email: emailAnterior,
          titulo: "O e-mail do seu cadastro na IEADESPA foi alterado",
          mensagem: `O e-mail do cadastro da matrícula ${membroId} foi alterado pela Secretaria. Se foi você quem pediu, não há nada a fazer; se não foi, avise a Secretaria da sua congregação.`
        });
      } catch (e) { context.log.error("Falha ao avisar o e-mail antigo:", e.message); }
      if (enviado !== true) {
        avisoEmailNaoSaiu = true;
        await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(membroId), acao: "Aviso da troca de e-mail não enviado", usuarioId: usuario.membroId,
          dadosDepois: { emailAnterior: mascararEmail(emailAnterior) } });
      }
    }
    if (entrandoEmStatusTerminal) await require("../shared/credencialDb").recolherSemFalhar(pool, membroId, motivoDaVacancia, usuario.membroId);   // v8.4: a credencial, depois do commit

    const result = await pool.request().input("id", sql.Int, membroId).query(`${SELECT_MEMBRO} WHERE m.MembroId = @id`);
    const membro = result.recordset[0];
    Object.assign(membro, (await marcarLicencaAberta(pool, [membro]))[0]);
    const vDisciplinaMembro = auth.visaoDaPermissao(usuario, "disciplina");
    if (vDisciplinaMembro && noEscopoDaPessoa(vDisciplinaMembro, membro.congregacao, membro.extensao)) {
      const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
      membro.processoDisciplinarAtivo = idsSobDisciplina.has(membro.membroId);
    }
    Object.assign(membro, motivoSaidaVisivel(membro, vDisciplinaMembro));
    membro.capacidade = estatuto.calcularCapacidadeEleitoral(membro);
    const idadeMembro = estatuto.idadeEm(membro.dataNascimento);
    membro.menorDeIdade = idadeMembro !== null && idadeMembro < 18;
    membro.fotoUrl = storage.urlComSas(membro.fotoUrl);

    const mensagemGravou = existia ? "✅ Pessoa atualizada." : "✅ Pessoa cadastrada.";
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, membro,
      mensagem: avisoEmailNaoSaiu ? `${mensagemGravou} Atenção: o aviso da troca de e-mail não saiu para o endereço antigo; avise a pessoa por outro meio.` : mensagemGravou } };
    return;
  }

  // ---- DELETE: desligar (não remove de verdade) ----
  if (method === "DELETE") {
    const membroDesligar = auth.idDeRota(membroIdRota);
    if (!membroDesligar) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/pessoas/{membroId}" } };
      return;
    }
    const alvoDesligar = (await pool.request().input("id", sql.Int, membroDesligar).query(`
      SELECT c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId WHERE m.MembroId = @id`)).recordset[0];
    // Matrícula que não existe e matrícula de fora do escopo recebem a mesma recusa: a resposta não diz quem tem cadastro.
    if (!alvoDesligar || !noEscopoDaPessoa(usuario, alvoDesligar.CongregacaoNome, alvoDesligar.ExtensaoNome)) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }
    if (!(await conferirSaidaDeLideranca(pool, req, context, usuario, membroDesligar))) return;
    // O status, a vacância automática (v1.5: Assentos, Liderança, cargo, EBD, delegações e sessões) e a trilha numa transação só: ou tudo vale, ou nada muda e o
    // pedido pode ser repetido. A trava da escada põe em fila com a cerimônia de consagração da mesma pessoa (como no abandono). O falecido não vira desligado.
    const desfecho = await emTransacao(pool, async ({ rq, executor, transacao, desistir }) => {
      if (!(await obterTrava(rq, `escada_${membroDesligar}`))) { await desistir(); return "OCUPADA"; }
      const hojeDeslig = hojeBrasilia();
      const recusa = await travaPermissoes.conferirUltimoNaTransacao(rq, sql, membroDesligar, hojeDeslig);   // de novo aqui dentro, antes de gravar
      if (recusa) { await desistir(); return recusa; }
      const upd = await rq().input("id", sql.Int, membroDesligar).input("hoje", sql.Date, hojeDeslig)
        .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO', DataSaida = ISNULL(DataSaida, @hoje)
                OUTPUT INSERTED.MembroId, DELETED.Status AS StatusAnterior
                WHERE MembroId = @id AND Status NOT IN ('DESLIGADO', 'FALECIDO')`);
      if (!(upd.recordset || []).length) { await desistir(); return "JA_SAIU"; }
      await vacancia.encerrarVinculos(executor, sql, membroDesligar, "DESLIGAMENTO");
      // desligar quem estava em licença por candidatura fecha a licença aberta (resposta do responsável, 25/11/2026)
      const licencaEncerrada = upd.recordset[0].StatusAnterior === LICENCA_CANDIDATURA
        ? await licencaCandidatura.encerrarLicencaAberta(executor, sql, membroDesligar, "Encerrada pelo desligamento.", hojeDeslig) : 0;
      await registrarAuditoriaNaTransacao(transacao, { tabela: "MembroReferencia", registroId: membroDesligar, acao: "Desligou pessoa", usuarioId: usuario.membroId,
        ...(licencaEncerrada ? { dadosDepois: { licencaEncerrada: true } } : {}) });
      return "DESLIGOU";
    });
    if (desfecho === "OCUPADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Outra alteração desta pessoa está em andamento. Tente de novo em instantes." } };
      return;
    }
    if (desfecho === "ULTIMO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: travaPermissoes.MENSAGEM_ULTIMO } };
      return;
    }
    if (desfecho === "JA_SAIU") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa já está fora do rol (desligada ou falecida)." } };
      return;
    }
    await require("../shared/credencialDb").recolherSemFalhar(pool, membroDesligar, "Desligamento", usuario.membroId);   // v8.4: o recolhimento da credencial, depois do commit
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pessoa desligada." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
