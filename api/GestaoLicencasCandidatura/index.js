// GestaoLicencasCandidatura (v1.9 — Reg. Art. 157 §2º)
// Licença Eclesiástica automática por candidatura política: obreiro candidato
// entra em licença 90 dias antes do pleito e perde o púlpito (o registro só vale dentro desses 90 dias e a licença começa nele; o pleito que já passou é
// recusado: shared/licencaCandidatura.js::inicioDaLicenca, revisão de fora de 26/11/2026) (mesmo racional de
// qualquer outro fluxo de saída — shared/vacancia.js); a Diretoria decide o
// retorno pós-eleição, não é automático. Status próprio no catálogo StatusMembro
// (LICENCA_CANDIDATURA), distinto do LICENÇA genérico (v1.6). Exige "pessoas".
// GET  /api/licencas-candidatura?membroId=123 -> lista (de uma pessoa, ou todas)
// POST /api/licencas-candidatura              -> cria: body { membroId, dataPleito }
// POST /api/licencas-candidatura/{id}         -> registra o retorno: body { retornou, observacao? } (quem não retorna fica INATIVO no rol)
//
// ESCOPO: a licença é da PESSOA — só enxerga e só lança quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo vale a resposta de "não existe". O RETORNO é
// decisão da Diretoria (Art. 157 §2º): só o nível GERAL registra. Licença põe a pessoa fora de Assentos e Liderança (vacância) e das funções (sem licença para
// oficiar enquanto durar), mas o título ministerial e os processos de consagração ficam (decisão de 29/10/2026) — não pode ser lançada contra quem é de outra área.
const auth = require("../shared/auth");
const { registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const vacancia = require("../shared/vacancia");
const nivelDoCargo = require("../shared/nivelDoCargo");
const { emTransacao } = require("../shared/transacaoCurta");
const { obterTrava } = require("../shared/financeiroSeguro");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { ehGeral, pessoaAlcancavel, filtrarPorEscopo, MSG_GERAL } = require("../shared/escopoRotas");
const { dataISOValida } = require("../shared/escopoFichas");

// Mesma lista de GestaoPessoas (STATUS_TERMINAIS) — entrar em licença não faz
// sentido pra quem já saiu de vez.
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];
const { inicioDaLicenca, mensagemDoInicio } = require("../shared/licencaCandidatura");

// Uma licença aberta por pessoa (decisão de 25/11/2026): a rota confere antes do nível do cargo e de novo dentro da transação, sob a trava da escada; o índice
// único filtrado UX_LicencasCandidatura_Aberta (migração 301, o mesmo filtro desta consulta) recusa a que escapar, e o erro de chave repetida vira a mesma mensagem.
const SQL_LICENCA_ABERTA = (dica) => `SELECT TOP 1 LicencaId FROM LicencasCandidatura${dica} WHERE MembroId = @id AND Status = 'EM_LICENCA'`;
const MSG_JA_EM_LICENCA = "Esta pessoa já tem uma licença por candidatura aberta: registre a decisão do retorno dela antes de abrir outra.";
const ehChaveRepetida = (e) => !!e && (e.number === 2601 || e.number === 2627);

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRotaBruto = context.bindingData.id;
  const temIdNaRota = idRotaBruto !== undefined && idRotaBruto !== null && idRotaBruto !== "";
  const idRota = auth.idDeRota(idRotaBruto);
  const pool = await getPool();

  // ---- GET: listar ----
  if (method === "GET") {
    const membroIdBruto = (req.query || {}).membroId;
    const filtrando = membroIdBruto !== undefined && membroIdBruto !== null && membroIdBruto !== "";
    if (filtrando) {
      // Pessoa inexistente, malformada ou fora do escopo: lista vazia, igual a quem não tem licença.
      const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
      if (!pessoa) {
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
        return;
      }
    }
    const request = pool.request();
    if (filtrando) request.input("membroId", sql.Int, auth.idDeRota(membroIdBruto));
    const result = await request.query(`
      SELECT l.LicencaId AS licencaId, l.MembroId AS membroId, m.Nome AS nome,
             CONVERT(varchar(10), l.DataPleito, 120) AS dataPleito,
             CONVERT(varchar(10), l.DataInicioLicenca, 120) AS dataInicioLicenca,
             l.Status AS status,
             CONVERT(varchar(10), l.DataRetornoDecidida, 120) AS dataRetornoDecidida,
             l.ObservacaoRetorno AS observacaoRetorno,
             cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
      FROM LicencasCandidatura l
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
      ${filtrando ? "WHERE l.MembroId = @membroId" : ""}
      ORDER BY l.DataPleito DESC`);
    const visiveis = filtrarPorEscopo(usuario, result.recordset, l => l.congregacaoNome, l => l.extensaoNome)
      .map(({ congregacaoNome, extensaoNome, ...resto }) => resto);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: visiveis };
    return;
  }

  // ---- POST sem id: criar (entra em licença) ----
  if (method === "POST" && !temIdNaRota) {
    const { membroId: membroIdBruto, dataPleito } = req.body || {};
    if (!membroIdBruto || !dataPleito) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, dataPleito." } };
      return;
    }
    if (!dataISOValida(dataPleito)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "dataPleito inválida — use AAAA-MM-DD." } };
      return;
    }
    // 90 dias antes do pleito (shared/licencaCandidatura.js::inicioDaLicenca): o pleito que já passou e o registro antes da hora são recusados; dentro dos 90
    // dias, a licença começa hoje. Só depende da data informada (vem antes da pessoa: não diz nada sobre ela).
    const inicio = inicioDaLicenca(dataPleito, hojeBrasilia());
    if (!inicio.ok) {
      context.res = { status: 200, body: { sucesso: false, mensagem: mensagemDoInicio(inicio, dataPleito) } };
      return;
    }
    const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
    if (!pessoa) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const membroId = pessoa.membroId;
    if (STATUS_TERMINAIS.includes(pessoa.status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa já saiu do rol de membros — não é possível registrar licença por candidatura." } };
      return;
    }

    // Já em licença: a mensagem clara, antes de pedir a confirmação recente para um pedido que seria recusado (quem chega aqui alcança a pessoa e já vê a lista
    // das licenças dela).
    if ((await pool.request().input("id", sql.Int, membroId).query(SQL_LICENCA_ABERTA(""))).recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: MSG_JA_EM_LICENCA } };
      return;
    }

    const dataInicioLicenca = inicio.inicio;   // o dia em que a licença começa de verdade (hoje), não um dia que já passou

    // A licença tira a pessoa do rol ativo e encerra os mandatos: de quem tem cargo, só a secretaria do nível do cargo ou de cima, com a confirmação recente.
    if (!(await nivelDoCargo.conferirSaidaDeLideranca(pool, sql, req, context, usuario, membroId))) return;

    // A licença, o status, a vacância (assentos, liderança, cargo, delegações, sessões) e a trilha numa transação só: ou tudo vale, ou nada muda e o pedido pode
    // ser repetido. A trava da escada põe em fila com a cerimônia de consagração da mesma pessoa (como no desligamento).
    let desfecho;
    try {
      desfecho = await emTransacao(pool, async ({ rq, executor, transacao, desistir }) => {
        if (!(await obterTrava(rq, `escada_${membroId}`))) { await desistir(); return { situacao: "OCUPADA" }; }
        if ((await rq().input("id", sql.Int, membroId).query(SQL_LICENCA_ABERTA(" WITH (UPDLOCK, HOLDLOCK)"))).recordset.length > 0) { await desistir(); return { situacao: "JA_ABERTA" }; }
        const status = await rq().input("id", sql.Int, membroId)
          .query(`UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA' WHERE MembroId = @id AND Status NOT IN ('DESLIGADO', 'FALECIDO')`);
        if (!((status.rowsAffected && status.rowsAffected[0]) || 0)) { await desistir(); return { situacao: "SAIU" }; }
        const result = await rq()
          .input("membroId", sql.Int, membroId)
          .input("dataPleito", sql.Date, dataPleito)
          .input("dataInicioLicenca", sql.Date, dataInicioLicenca)
          .input("criadoPor", sql.Int, usuario.membroId)
          .query(`
            INSERT INTO LicencasCandidatura (MembroId, DataPleito, DataInicioLicenca, CriadoPor)
            OUTPUT INSERTED.LicencaId
            VALUES (@membroId, @dataPleito, @dataInicioLicenca, @criadoPor)`);
        const licencaId = result.recordset[0].LicencaId;
        await vacancia.encerrarVinculos(executor, sql, membroId, "LICENCA_CANDIDATURA");
        await registrarAuditoriaNaTransacao(transacao, {
          tabela: "LicencasCandidatura",
          registroId: licencaId,
          acao: "Registrou licença por candidatura política",
          usuarioId: usuario.membroId,
          dadosDepois: { membroId, dataPleito, dataInicioLicenca }
        });
        return { situacao: "GRAVOU", licencaId };
      });
    } catch (e) {
      if (!ehChaveRepetida(e)) throw e;
      desfecho = { situacao: "JA_ABERTA" };   // o índice único recusou: outra licença aberta entrou ao mesmo tempo (a transação já foi desfeita)
    }
    if (desfecho.situacao === "JA_ABERTA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: MSG_JA_EM_LICENCA } };
      return;
    }
    if (desfecho.situacao === "OCUPADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Outra alteração desta pessoa está em andamento. Tente de novo em instantes." } };
      return;
    }
    if (desfecho.situacao === "SAIU") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa já saiu do rol de membros — não é possível registrar licença por candidatura." } };
      return;
    }
    const licencaId = desfecho.licencaId;

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: `✅ Licença por candidatura registrada, a partir de hoje (${dataInicioLicenca.split("-").reverse().join("/")}) — a pessoa perdeu Assentos/Liderança/Cargo até a Diretoria decidir o retorno.`,
        licencaId, dataInicioLicenca }
    };
    return;
  }

  // ---- POST com id: registrar o retorno (decidido pela Diretoria: só o GERAL) ----
  if (method === "POST" && temIdNaRota) {
    if (!ehGeral(usuario)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: MSG_GERAL } };
      return;
    }
    const { retornou, observacao } = req.body || {};
    // "false" (texto) não pode valer como verdadeiro: só booleano de verdade.
    if (typeof retornou !== "boolean") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe retornou (true/false)." } };
      return;
    }
    const licenca = idRota ? await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, Status FROM LicencasCandidatura WHERE LicencaId = @id`) : { recordset: [] };
    if (licenca.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Licença não encontrada." } };
      return;
    }
    if (licenca.recordset[0].Status !== "EM_LICENCA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta licença já teve o retorno registrado." } };
      return;
    }
    const membroId = licenca.recordset[0].MembroId;
    const statusFinal = retornou ? "RETORNOU" : "NAO_RETORNOU";
    const hojeISO = hojeBrasilia();

    // A decisão, a situação no rol e a trilha numa transação só (resposta do responsável, 25/11/2026: quem não volta fica INATIVO no rol). A trava da escada põe
    // em fila com a ficha e o desligamento da mesma pessoa. Só vence quem ainda encontra a licença EM_LICENCA: duas decisões ao mesmo tempo não se atropelam.
    // Cargo e Assentos não voltam sozinhos: a reatribuição é manual na tela de Pessoas, igual a qualquer pessoa reativada. Só muda a situação de quem ainda está
    // em licença: quem foi desligado ou faleceu nesse meio-tempo não volta por aqui.
    // A situação no rol só muda de quem ainda está em licença por candidatura; se não estava mais (a ficha mudou nesse meio-tempo), a decisão fica registrada e a
    // resposta e a trilha dizem a situação REAL, lida na mesma transação.
    const desfecho = await emTransacao(pool, async ({ rq, transacao, desistir }) => {
      if (!(await obterTrava(rq, `escada_${membroId}`))) { await desistir(); return { situacao: "OCUPADA" }; }
      const upd = await rq()
        .input("id", sql.Int, idRota)
        .input("status", sql.NVarChar(20), statusFinal)
        .input("dataRetornoDecidida", sql.Date, hojeISO)
        .input("observacao", sql.NVarChar(300), observacao ? String(observacao).slice(0, 300) : null)
        .query(`UPDATE LicencasCandidatura SET Status = @status, DataRetornoDecidida = @dataRetornoDecidida, ObservacaoRetorno = @observacao WHERE LicencaId = @id AND Status = 'EM_LICENCA'`);
      if (!((upd.rowsAffected && upd.rowsAffected[0]) || 0)) { await desistir(); return { situacao: "JA_DECIDIDA" }; }
      const situacaoNova = retornou ? "ATIVO" : "INATIVO";
      const mudou = await rq().input("id", sql.Int, membroId)
        .query(retornou
          ? `UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @id AND Status = 'LICENCA_CANDIDATURA'`
          : `UPDATE MembroReferencia SET Status = 'INATIVO' WHERE MembroId = @id AND Status = 'LICENCA_CANDIDATURA'`);
      const situacaoMudou = ((mudou.rowsAffected && mudou.rowsAffected[0]) || 0) > 0;
      let situacaoNoRol = situacaoNova;
      let nomeDaSituacao = situacaoNova;
      if (!situacaoMudou) {
        const atual = (await rq().input("id", sql.Int, membroId)
          .query(`SELECT m.Status, s.Nome FROM MembroReferencia m LEFT JOIN StatusMembro s ON s.Sigla = m.Status WHERE m.MembroId = @id`)).recordset[0] || {};
        situacaoNoRol = atual.Status || null;
        nomeDaSituacao = atual.Nome || atual.Status || "sem situação";
      }
      await registrarAuditoriaNaTransacao(transacao, {
        tabela: "LicencasCandidatura",
        registroId: Number(idRota),
        acao: retornou ? "Registrou retorno de licença por candidatura" : "Registrou não retorno de licença por candidatura",
        usuarioId: usuario.membroId,
        dadosDepois: { retornou, observacao, membroId, situacaoNoRol, situacaoMudou }
      });
      return { situacao: "GRAVOU", situacaoMudou, nomeDaSituacao };
    });
    if (desfecho.situacao === "OCUPADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Outra alteração desta pessoa está em andamento. Tente de novo em instantes." } };
      return;
    }
    if (desfecho.situacao === "JA_DECIDIDA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta licença já teve o retorno registrado." } };
      return;
    }

    const decisao = retornou ? "✅ Retorno registrado" : "✅ Registrado: a pessoa não retornou";
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: desfecho.situacaoMudou
        ? (retornou ? "✅ Retorno registrado — status voltou para ATIVO." : "✅ Registrado: a pessoa não retornou e fica INATIVO no rol.")
        : `${decisao}. A situação dela no rol não mudou: ela já não estava em licença por candidatura e continua como ${desfecho.nomeDaSituacao}.` }
    };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
