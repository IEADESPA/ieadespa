// GestaoAssentos
// Cadeiras institucionais: quem ocupa assento em qual órgão (Assembleia, CLI,
// Diretoria, CEI, Conselho Fiscal). É a base que faltava pra composição mista da
// CLI (shared/universo.js já lê Assentos por Função, mas nada os criava) e pro
// card "Meus Órgãos" do Meu Painel (ver MinhaFrequencia). Exige a permissão
// "pessoas" (mesma da aba Órgãos, onde essa gestão fica embutida na tela).
//
// Cargo eletivo/nomeado tem mandato com prazo — se a Secretaria informar
// duracaoMeses ao criar, DataTerminoPrevisao é calculada (mesmo raciocínio do
// Processo Disciplinar, v0.2): vencimento lido na hora, sem job/timer, nunca
// fecha a cadeira sozinho (só deixa de contar pro universo do órgão — ver
// shared/universo.js — até alguém confirmar/renovar/encerrar formalmente).
//
// GET  /api/assentos?orgaoId=&membroId=&incluirEncerrados=1
// POST /api/assentos                  body: { membroId, orgaoId, tipoAssento, cargoOuFuncao?, dataInicio?, duracaoMeses? }
// POST /api/assentos/{id}/encerrar    body: { motivoEncerramento? }
// ESCOPO: cadeira de órgão central (Diretoria, Conselho Fiscal, CEI, Conselho Consultivo, CLI...) é INSTITUCIONAL e é a âncora de autoridade do sistema (quem é o Presidente,
// quem está na Diretoria, a composição da CLI e das comissões, o quórum). Criar e encerrar cadeira é só do nível GERAL (papel Global com escopo "TODAS"): a permissão
// "pessoas" também é do Dirigente, do Pastor de Área e do Líder Geral de Departamento, e com ela dava para se nomear Presidente. Ver a lista continua para quem tem "pessoas".
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { CATALOGOS_CARGOS_POR_ORGAO, ORGAOS_INCOMPATIVEIS, ARTIGOS_VEDACAO_PARENTESCO_DIRETORIA, validarIncompatibilidadeExecutiva, cargoJaOcupado } = require("../shared/diretoria");
const { existeParentescoAte2Grau } = require("../shared/parentesco");
const { comConflito } = require("../shared/violacaoUnica");

const TIPOS_VALIDOS = ["ORDENACAO", "FUNCAO"];

const SELECT_ASSENTO = `
  SELECT a.AssentoId AS assentoId, a.MembroId AS membroId, m.Nome AS nome,
         a.OrgaoId AS orgaoId, o.Nome AS orgaoNome, a.TipoAssento AS tipoAssento,
         a.CargoOuFuncao AS cargoOuFuncao, CONVERT(varchar(10), a.DataInicio, 120) AS dataInicio,
         CONVERT(varchar(10), a.DataTerminoPrevisao, 120) AS dataTerminoPrevisao,
         CONVERT(varchar(10), a.DataFim, 120) AS dataFim, a.MotivoEncerramento AS motivoEncerramento
  FROM Assentos a
  JOIN MembroReferencia m ON m.MembroId = a.MembroId
  JOIN Orgaos o ON o.OrgaoId = a.OrgaoId`;

function comSituacaoEfetiva(assento, hoje) {
  let situacaoEfetiva = "ATIVA";
  if (assento.dataFim) situacaoEfetiva = "ENCERRADA";
  else if (assento.dataTerminoPrevisao && assento.dataTerminoPrevisao < hoje) situacaoEfetiva = "MANDATO_VENCIDO";
  return Object.assign({}, assento, { situacaoEfetiva });
}

// O cargo fixo tem UM ocupante ativo também no banco (índice UX_Assentos_CargoAtivo, migração 127): dois pedidos ao mesmo tempo furam a conferência de cargoJaOcupado, e o
// perdedor recebe o 409 em vez de um 500.
module.exports = comConflito(async function (context, req) {
  const usuario = req.method === "GET" ? auth.exigirPermissao(req, context, "pessoas") : exigirGeral(req, context, "pessoas");
  if (!usuario) return;

  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (req.method === "GET") {
    const { orgaoId, membroId, incluirEncerrados } = req.query || {};
    // Filtros só valem na forma canônica de número (antes um valor qualquer virava erro 500).
    if ((orgaoId && !auth.idDeRota(orgaoId)) || (membroId && !auth.idDeRota(membroId))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Filtro inválido." } };
      return;
    }
    const request = pool.request();
    const condicoes = [];
    if (!incluirEncerrados) condicoes.push("a.DataFim IS NULL");
    if (orgaoId) { request.input("orgaoId", sql.Int, auth.idDeRota(orgaoId)); condicoes.push("a.OrgaoId = @orgaoId"); }
    if (membroId) { request.input("membroId", sql.Int, auth.idDeRota(membroId)); condicoes.push("a.MembroId = @membroId"); }
    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const result = await request.query(`${SELECT_ASSENTO} ${where} ORDER BY o.Nome, m.Nome`);
    const hoje = new Date().toISOString().slice(0, 10);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map(a => comSituacaoEfetiva(a, hoje)) };
    return;
  }

  if (req.method === "POST" && id && acao === "encerrar") {
    const { motivoEncerramento } = req.body || {};
    if (motivoEncerramento != null && (typeof motivoEncerramento !== "string" || motivoEncerramento.length > 200)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Motivo inválido (texto de até 200 caracteres)." } };
      return;
    }
    const assentoId = auth.idDeRota(id);
    const antes = assentoId
      ? await pool.request().input("id", sql.Int, assentoId).query(`SELECT * FROM Assentos WHERE AssentoId = @id`)
      : { recordset: [] };
    if (!antes.recordset[0]) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cadeira não encontrada." } };
      return;
    }
    if (antes.recordset[0].DataFim) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Essa cadeira já foi encerrada." } };
      return;
    }
    await pool.request().input("id", sql.Int, assentoId).input("motivo", sql.NVarChar(200), motivoEncerramento || null)
      .query(`UPDATE Assentos SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo WHERE AssentoId = @id AND DataFim IS NULL`);
    await registrarAuditoria({
      tabela: "Assentos", registroId: assentoId, acao: "Encerrou cadeira", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { motivoEncerramento: motivoEncerramento || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cadeira encerrada." } };
    return;
  }

  if (req.method === "POST" && !id) {
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { tipoAssento, cargoOuFuncao, dataInicio, duracaoMeses } = corpo;
    // As matrículas/ids só valem na forma canônica de número (auth.idDeRota); o malformado cai na mesma resposta de "não encontrada".
    const membroId = auth.idDeRota(corpo.membroId);
    const orgaoId = auth.idDeRota(corpo.orgaoId);
    if (!corpo.membroId || !corpo.orgaoId || !tipoAssento || !TIPOS_VALIDOS.includes(tipoAssento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: membroId, orgaoId, tipoAssento (${TIPOS_VALIDOS.join(" ou ")}).` } };
      return;
    }
    if (!membroId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    if (!orgaoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
      return;
    }
    // Mandato: meses inteiros de 1 a 600 e data de início no formato AAAA-MM-DD — duração negativa criava uma cadeira que já nascia vencida.
    if (duracaoMeses != null && duracaoMeses !== "" && (!Number.isInteger(Number(duracaoMeses)) || Number(duracaoMeses) < 1 || Number(duracaoMeses) > 600 || typeof duracaoMeses === "boolean")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A duração do mandato é um número inteiro de meses, de 1 a 600." } };
      return;
    }
    if (dataInicio != null && dataInicio !== "" && (typeof dataInicio !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || Number.isNaN(Date.parse(dataInicio)))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A data de início deve estar no formato AAAA-MM-DD." } };
      return;
    }
    if (cargoOuFuncao != null && (typeof cargoOuFuncao !== "string" || cargoOuFuncao.length > 100)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Cargo ou função inválido (texto de até 100 caracteres)." } };
      return;
    }
    const membro =await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const orgao = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT OrgaoId, Sigla FROM Orgaos WHERE OrgaoId = @id`);
    if (orgao.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
      return;
    }
    const orgaoSigla = orgao.recordset[0].Sigla;

    // Art. 38 §3º, II — incompatibilidade Diretoria/Conselho Fiscal/CEI.
    if (ORGAOS_INCOMPATIVEIS.includes(orgaoSigla)) {
      const incompat = await validarIncompatibilidadeExecutiva(pool, sql, membroId, orgaoSigla);
      if (incompat.bloqueado) {
        context.res = { status: 200, body: { sucesso: false, mensagem: incompat.mensagem } };
        return;
      }
    }

    // Art. 29 (Diretoria) / Art. 43 §1º (Conselho Fiscal) — cargos fixos,
    // 1 ocupante ativo por vez cada.
    const catalogoCargos = CATALOGOS_CARGOS_POR_ORGAO[orgaoSigla];
    if (catalogoCargos) {
      if (!cargoOuFuncao || !catalogoCargos[cargoOuFuncao]) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Cargo inválido. Use um de: ${Object.keys(catalogoCargos).join(", ")}.` } };
        return;
      }
      if (await cargoJaOcupado(pool, sql, orgaoId, cargoOuFuncao)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Já existe alguém ocupando ${catalogoCargos[cargoOuFuncao].rotulo} (1 titular por cargo).` } };
        return;
      }
    }

    // Art. 43 §3º, I (Conselho Fiscal) / Estatuto Art. 38 §2º (CEI) / Art. 31
    // (Conselho Consultivo Técnico, vB.14) — vedação de nepotismo: parentesco
    // até 2º grau com membros ativos da Diretoria Executiva não pode ocupar
    // nenhum desses três órgãos. (Só a metade "Diretoria" é verificável —
    // "Tesoureiros de Departamentos" não é um cargo rastreado em lugar
    // nenhum do sistema hoje.)
    if (orgaoSigla in ARTIGOS_VEDACAO_PARENTESCO_DIRETORIA) {
      const diretoriaAtual = await pool.request().query(`
        SELECT a.MembroId AS membroId FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
        WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.DataFim IS NULL
      `);
      const idsDiretoria = new Set(diretoriaAtual.recordset.map(r => r.membroId));
      const parentesco = await existeParentescoAte2Grau(pool, sql, membroId, idsDiretoria);
      if (parentesco.encontrado) {
        const artigo = ARTIGOS_VEDACAO_PARENTESCO_DIRETORIA[orgaoSigla];
        context.res = {
          status: 200,
          body: { sucesso: false, mensagem: `Não é possível: essa pessoa tem parentesco até 2º grau com um membro ativo da Diretoria Executiva (matrícula ${parentesco.comMembroId}) — vedado pelo ${artigo}.` }
        };
        return;
      }
    }

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("orgaoId", sql.Int, orgaoId)
      .input("tipoAssento", sql.NVarChar(30), tipoAssento)
      .input("cargoOuFuncao", sql.NVarChar(100), cargoOuFuncao || null)
      .input("dataInicio", sql.Date, dataInicio || null)
      .input("duracaoMeses", sql.Int, duracaoMeses != null && duracaoMeses !== "" ? Number(duracaoMeses) : null)
      .query(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio, DataTerminoPrevisao)
              OUTPUT INSERTED.AssentoId
              VALUES (@orgaoId, @membroId, @tipoAssento, @cargoOuFuncao,
                      COALESCE(@dataInicio, CAST(SYSUTCDATETIME() AS DATE)),
                      CASE WHEN @duracaoMeses IS NULL THEN NULL ELSE DATEADD(month, @duracaoMeses, COALESCE(@dataInicio, CAST(SYSUTCDATETIME() AS DATE))) END)`);
    const assentoId = result.recordset[0].AssentoId;

    await registrarAuditoria({
      tabela: "Assentos", registroId: assentoId, acao: "Criou cadeira", usuarioId: usuario.membroId,
      dadosDepois: { membroId, orgaoId, tipoAssento, cargoOuFuncao: cargoOuFuncao || null, duracaoMeses: duracaoMeses || null }
    });

    const criado = await pool.request().input("id", sql.Int, assentoId).query(`${SELECT_ASSENTO} WHERE a.AssentoId = @id`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cadeira criada.", assento: criado.recordset[0] } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
}, "Esse cargo acabou de ser ocupado por outra pessoa (1 titular por cargo). Atualize a lista de cadeiras e confira antes de tentar de novo.");
