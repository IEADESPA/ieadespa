// GestaoApresentacaoCriancas (vB.12 — Apresentação de Crianças, Reg. Art. 82)
// Mesmo lugar de Casamentos na FASE 1 original — retrofit, não reabertura
// (a FASE 1 já está fechada). Exige a permissão "pessoas", mesmo esqueleto
// de GestaoCasamentos. Aptidão (Art. 82 §2º/§3º) SEMPRE recalculada na
// leitura (shared/apresentacaoCriancas.js) — nunca um booleano digitado.
// GET    /api/apresentacoes-crianca?pai=&mae=  -> lista, com aptidão calculada
// POST   /api/apresentacoes-crianca            -> body: { nomeCrianca, dataNascimento,
//                                                          membroIdPai?, membroIdMae?,
//                                                          oficiante?, modalidade,
//                                                          dataApresentacao, congregacaoId? }
// DELETE /api/apresentacoes-crianca/{id}
//
// ESCOPO: a criança não é matrícula; o registro é da congregação registrada nele — na falta dela, a do pai, senão a da mãe (shared/escopoFichas.js). Só enxerga, cria e apaga
// quem alcança essa congregação; fora do escopo vale a resposta de "não existe". Ao cadastrar, TODOS os pais informados precisam estar no escopo (a aptidão olha a disciplina dos
// pais, e isso não pode servir de sonda). Sem a permissão "disciplina", o detalhe do impedimento dos pais vira texto genérico (sigilo do processo disciplinar).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { modalidadeValida, geraCertificado, calcularAptidaoApresentacao, MODALIDADES } = require("../shared/apresentacaoCriancas");
const { filtrarPorEscopo, pessoaAlcancavel, congregacaoNoEscopo, noEscopoDaPessoa } = require("../shared/escopoRotas");
const {
  dataISOValida, SQL_COLUNAS_ESCOPO_APRESENTACAO, SQL_JUNCOES_ESCOPO_APRESENTACAO,
  congregacaoDaApresentacao, extensaoDaApresentacao, ocultarSigiloAptidao
} = require("../shared/escopoFichas");

const SELECT_APRESENTACAO = `
  SELECT a.ApresentacaoId AS apresentacaoId, a.NomeCrianca AS nomeCrianca,
         CONVERT(varchar(10), a.DataNascimento, 120) AS dataNascimento,
         a.MembroIdPai AS membroIdPai, pai.Nome AS nomePai, pai.EstadoCivil AS estadoCivilPai,
         a.MembroIdMae AS membroIdMae, mae.Nome AS nomeMae, mae.EstadoCivil AS estadoCivilMae,
         a.Oficiante AS oficiante, a.Modalidade AS modalidade,
         CONVERT(varchar(10), a.DataApresentacao, 120) AS dataApresentacao,
         a.CongregacaoId AS congregacaoId, a.Protocolo AS protocolo,
         ${SQL_COLUNAS_ESCOPO_APRESENTACAO}
  FROM ApresentacoesCrianca a
  LEFT JOIN MembroReferencia pai ON pai.MembroId = a.MembroIdPai
  LEFT JOIN MembroReferencia mae ON mae.MembroId = a.MembroIdMae
  ${SQL_JUNCOES_ESCOPO_APRESENTACAO}`;

const COLUNAS_DE_ESCOPO = ["congregacaoNome", "congregacaoPaiNome", "congregacaoMaeNome", "extensaoPaiNome", "extensaoMaeNome"];
function semColunasDeEscopo(item) {
  const limpo = { ...item };
  COLUNAS_DE_ESCOPO.forEach(c => delete limpo[c]);
  return limpo;
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRotaBruto = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: listar (com aptidão calculada), só do escopo ----
  if (method === "GET") {
    const { pai, mae, membroId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    // Filtro com id malformado não casa com ninguém: lista vazia (e não 500).
    for (const [nome, valor, condicao] of [
      ["pai", pai, "a.MembroIdPai = @pai"],
      ["mae", mae, "a.MembroIdMae = @mae"],
      ["membroId", membroId, "(a.MembroIdPai = @membroId OR a.MembroIdMae = @membroId)"]
    ]) {
      if (valor === undefined || valor === null || valor === "") continue;
      const id = auth.idDeRota(valor);
      if (!id) {
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
        return;
      }
      request.input(nome, sql.Int, id);
      where += ` AND ${condicao}`;
    }
    const todas = (await request.query(`${SELECT_APRESENTACAO} WHERE ${where} ORDER BY a.DataApresentacao DESC`)).recordset;
    const apresentacoes = filtrarPorEscopo(usuario, todas, congregacaoDaApresentacao, extensaoDaApresentacao);

    for (const item of apresentacoes) {
      const candidato = {
        dataNascimento: item.dataNascimento,
        pai: item.membroIdPai ? { membroId: item.membroIdPai, estadoCivil: item.estadoCivilPai } : null,
        mae: item.membroIdMae ? { membroId: item.membroIdMae, estadoCivil: item.estadoCivilMae } : null
      };
      item.aptidao = ocultarSigiloAptidao(await calcularAptidaoApresentacao(pool, candidato), usuario);
      item.geraCertificado = geraCertificado(item.modalidade);
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: apresentacoes.map(semColunasDeEscopo) };
    return;
  }

  // ---- POST: registrar ----
  if (method === "POST") {
    const {
      nomeCrianca, dataNascimento, membroIdPai, membroIdMae, oficiante, modalidade, dataApresentacao, congregacaoId
    } = req.body || {};

    if (!nomeCrianca || !String(nomeCrianca).trim() || !dataNascimento || !modalidade || !dataApresentacao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nomeCrianca, dataNascimento, modalidade, dataApresentacao." } };
      return;
    }
    if (!modalidadeValida(modalidade)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Modalidade inválida. Use uma de: ${MODALIDADES.join(", ")}.` } };
      return;
    }
    if (!dataISOValida(dataNascimento) || !dataISOValida(dataApresentacao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Data inválida — use AAAA-MM-DD." } };
      return;
    }
    if (!membroIdPai && !membroIdMae) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe ao menos um dos pais (matrícula do pai ou da mãe)." } };
      return;
    }

    // Cada pai informado: precisa existir E estar no escopo (mesma resposta de "não encontrada" para os dois casos).
    const pais = {};
    for (const [rotulo, chave, bruto] of [["pai", "pai", membroIdPai], ["mãe", "mae", membroIdMae]]) {
      if (!bruto) continue;
      const pessoa = await pessoaAlcancavel(pool, usuario, bruto);
      if (!pessoa) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Matrícula do(a) ${rotulo} não encontrada.` } };
        return;
      }
      const dados = (await pool.request().input("id", sql.Int, pessoa.membroId).query(`SELECT EstadoCivil, CongregacaoId FROM MembroReferencia WHERE MembroId = @id`)).recordset[0] || {};
      pais[chave] = { membroId: pessoa.membroId, estadoCivil: dados.EstadoCivil || null, congregacaoId: dados.CongregacaoId || null };
    }

    // Congregação do registro: a informada (precisa estar no escopo) ou, na falta dela, a do pai/da mãe.
    let congregacaoDoRegistro = null;
    if (congregacaoId) {
      if (!(await congregacaoNoEscopo(pool, usuario, congregacaoId))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação inválida." } };
        return;
      }
      congregacaoDoRegistro = auth.idDeRota(congregacaoId);
    } else {
      congregacaoDoRegistro = (pais.pai && pais.pai.congregacaoId) || (pais.mae && pais.mae.congregacaoId) || null;
    }

    // Aptidão calculada ANTES de registrar — o sistema não deixa registrar
    // uma apresentação já vedada por idade ou por impedimento dos pais
    // (Art. 82 §2º I / §3º II), mesmo que só a Secretaria a esteja lançando.
    const aptidao = ocultarSigiloAptidao(await calcularAptidaoApresentacao(pool, {
      dataNascimento,
      pai: pais.pai ? { membroId: pais.pai.membroId, estadoCivil: pais.pai.estadoCivil } : null,
      mae: pais.mae ? { membroId: pais.mae.membroId, estadoCivil: pais.mae.estadoCivil } : null
    }), usuario);
    if (!aptidao.apto) {
      const pendencias = Object.entries(aptidao.itens).filter(([, v]) => !v.ok).map(([, v]) => v.detalhe);
      context.res = { status: 200, body: { sucesso: false, mensagem: `Apresentação não permitida: ${pendencias.join("; ")}.` } };
      return;
    }

    const result = await pool.request()
      .input("nomeCrianca", sql.NVarChar(200), String(nomeCrianca).trim().slice(0, 200))
      .input("dataNascimento", sql.Date, dataNascimento)
      .input("membroIdPai", sql.Int, pais.pai ? pais.pai.membroId : null)
      .input("membroIdMae", sql.Int, pais.mae ? pais.mae.membroId : null)
      .input("oficiante", sql.NVarChar(200), String(oficiante || "").trim().slice(0, 200) || null)
      .input("modalidade", sql.NVarChar(20), String(modalidade).toUpperCase())
      .input("dataApresentacao", sql.Date, dataApresentacao)
      .input("congregacaoId", sql.Int, congregacaoDoRegistro)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO ApresentacoesCrianca (NomeCrianca, DataNascimento, MembroIdPai, MembroIdMae, Oficiante, Modalidade, DataApresentacao, CongregacaoId, CriadoPor)
        OUTPUT INSERTED.ApresentacaoId
        VALUES (@nomeCrianca, @dataNascimento, @membroIdPai, @membroIdMae, @oficiante, @modalidade, @dataApresentacao, @congregacaoId, @criadoPor)`);
    const apresentacaoId = result.recordset[0].ApresentacaoId;

    await registrarAuditoria({
      tabela: "ApresentacoesCrianca",
      registroId: apresentacaoId,
      acao: `Registrou apresentação de criança (${modalidade})`,
      usuarioId: usuario.membroId,
      dadosDepois: { nomeCrianca, dataNascimento, membroIdPai, membroIdMae, modalidade, dataApresentacao }
    });

    const semCertificado = !geraCertificado(modalidade);
    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: "✅ Apresentação registrada." + (aptidao.avisoForaJanelaPreferencial ? ` ${aptidao.avisoForaJanelaPreferencial}` : "") +
          (semCertificado ? " Ato reservado: não gera certificado (Art. 82 §2º, II 'b')." : ""),
        apresentacaoId,
        aviso: aptidao.avisoForaJanelaPreferencial
      }
    };
    return;
  }

  // ---- DELETE: remover (correção de lançamento) ----
  if (method === "DELETE") {
    if (!idRotaBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/apresentacoes-crianca/{id}" } };
      return;
    }
    const idRota = auth.idDeRota(idRotaBruto);
    const antes = idRota ? (await pool.request().input("id", sql.Int, idRota).query(`${SELECT_APRESENTACAO} WHERE a.ApresentacaoId = @id`)).recordset[0] : null;
    // Registro inexistente e registro de fora do escopo: a mesma resposta.
    if (!antes || !noEscopoDaPessoa(usuario, congregacaoDaApresentacao(antes), extensaoDaApresentacao(antes))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
      return;
    }
    const del = await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM ApresentacoesCrianca WHERE ApresentacaoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
      return;
    }
    await registrarAuditoria({ tabela: "ApresentacoesCrianca", registroId: Number(idRota), acao: "Removeu registro de apresentação de criança", usuarioId: usuario.membroId, dadosAntes: { NomeCrianca: antes.nomeCrianca, DataApresentacao: antes.dataApresentacao } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro removido." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
