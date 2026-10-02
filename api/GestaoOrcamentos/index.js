// GestaoOrcamentos (v4.8, primeira parte)
// Orçamento Anual (1º Tesoureiro — Art. 36 §1º), estruturado a partir do
// Plano de Contas/Categorias já existentes (v4.2/v4.5) — uma linha por
// categoria de entrada ou saída, com o valor orçado pro ano. "Orçado vs
// Realizado" e "Empenhado" são sempre CALCULADOS NA LEITURA a cada
// consulta do detalhe: nunca uma marcação manual, e nunca duplicam
// lançamento nenhum. Empenhado (encumbrance) é o total de Saídas já
// APROVADAS mas ainda não pagas naquela categoria/ano — reserva "de
// fato" o valor no orçamento a partir do momento em que o compromisso é
// assumido (v4.5), antes do pagamento sair.
// INSTITUCIONAL: o orçamento é um só, da igreja inteira, e o "realizado"/"empenhado" somam o caixa de TODAS as congregações — por isso ler e escrever são só do nível
// geral (papel Global com escopo de todas as congregações). Tesoureiro Local/de Área/Região/Quadrante/Distrito não acessa.
// GET  /api/orcamentos -> lista (ano, status, totais orçados)
// GET  /api/orcamentos/{id} -> detalhe com Orçado/Empenhado/Realizado por linha
// POST /api/orcamentos -> { ano, linhas: [{tipoMovimento, categoriaCodigo, valorOrcado}] }
// PUT  /api/orcamentos/{id} -> { status?, linhas? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre, inteiroEntre, textoAte, MAX_DECIMAL_12_2 } = require("../shared/entradaFinanceira");

const TIPOS = ["ENTRADA", "SAIDA"];
const STATUS = ["ABERTO", "ENCERRADO"];

// Linha válida: tipo, código (até 30) e valor maior que zero e dentro do DECIMAL(12,2). Devolve { tipoMovimento, categoriaCodigo, valorOrcado } ou null.
function linhaValida(l) {
  if (!l || typeof l !== "object") return null;
  const categoriaCodigo = textoAte(l.categoriaCodigo, 30);
  const valorOrcado = numeroEntre(l.valorOrcado, 0.01, MAX_DECIMAL_12_2);
  if (!TIPOS.includes(l.tipoMovimento) || !categoriaCodigo || valorOrcado === null) return null;
  return { tipoMovimento: l.tipoMovimento, categoriaCodigo, valorOrcado };
}

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !idBruto) {
    const result = await pool.request().query(`
      SELECT o.OrcamentoId AS orcamentoId, o.Ano AS ano, o.Status AS status,
             ISNULL((SELECT SUM(ValorOrcado) FROM OrcamentoLinhas WHERE OrcamentoId = o.OrcamentoId AND TipoMovimento = 'ENTRADA'), 0) AS totalOrcadoEntrada,
             ISNULL((SELECT SUM(ValorOrcado) FROM OrcamentoLinhas WHERE OrcamentoId = o.OrcamentoId AND TipoMovimento = 'SAIDA'), 0) AS totalOrcadoSaida
      FROM OrcamentosAnuais o ORDER BY o.Ano DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && idBruto) {
    const id = auth.idDeRota(idBruto);
    const orcamento = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM OrcamentosAnuais WHERE OrcamentoId = @id`) : { recordset: [] };
    if (orcamento.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Orçamento não encontrado." } };
      return;
    }
    const ano = orcamento.recordset[0].Ano;
    const linhas = await pool.request().input("id", sql.Int, id).query(`
      SELECT ol.TipoMovimento AS tipoMovimento, ol.CategoriaCodigo AS categoriaCodigo, ol.ValorOrcado AS valorOrcado,
             ISNULL(ce.Nome, cs.Nome) AS categoriaNome
      FROM OrcamentoLinhas ol
      LEFT JOIN CategoriasEntrada ce ON ol.TipoMovimento = 'ENTRADA' AND ce.Codigo = ol.CategoriaCodigo
      LEFT JOIN CategoriasSaida cs ON ol.TipoMovimento = 'SAIDA' AND cs.Codigo = ol.CategoriaCodigo
      WHERE ol.OrcamentoId = @id ORDER BY ol.TipoMovimento, ol.CategoriaCodigo
    `);

    const linhasComRealizado = [];
    for (const linha of linhas.recordset) {
      if (linha.tipoMovimento === "ENTRADA") {
        const realizado = await pool.request().input("ano", sql.Char(4), String(ano)).input("codigo", sql.NVarChar(30), linha.categoriaCodigo)
          .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM LancamentosTesouraria
                  WHERE LEFT(MesReferencia, 4) = @ano AND Tipo = @codigo AND Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'`);
        linhasComRealizado.push(Object.assign({}, linha, { realizado: realizado.recordset[0].total, empenhado: null }));
      } else {
        const empenhado = await pool.request().input("ano", sql.Int, ano).input("codigo", sql.NVarChar(30), linha.categoriaCodigo)
          .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria WHERE YEAR(SolicitadoEm) = @ano AND Tipo = @codigo AND Status = 'APROVADA'`);
        const realizado = await pool.request().input("ano", sql.Int, ano).input("codigo", sql.NVarChar(30), linha.categoriaCodigo)
          .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria WHERE YEAR(SolicitadoEm) = @ano AND Tipo = @codigo AND Status = 'PAGA'`);
        linhasComRealizado.push(Object.assign({}, linha, { empenhado: empenhado.recordset[0].total, realizado: realizado.recordset[0].total }));
      }
    }

    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { orcamentoId: id, ano, status: orcamento.recordset[0].Status, linhas: linhasComRealizado }
    };
    return;
  }

  if (req.method === "POST") {
    const { ano: anoBruto, linhas } = req.body || {};
    const ano = inteiroEntre(anoBruto, 1900, 2200);
    if (!ano) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o ano (inteiro, AAAA)." } };
      return;
    }
    if (!Array.isArray(linhas) || linhas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma linha orçamentária (linhas: [{tipoMovimento, categoriaCodigo, valorOrcado}])." } };
      return;
    }
    // Tudo é conferido ANTES de gravar qualquer coisa: uma linha ruim ou repetida não deixa um orçamento pela metade (e o ano ocupado).
    const validas = [];
    const vistas = new Set();
    for (const l of linhas) {
      const v = linhaValida(l);
      if (!v) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Cada linha precisa de tipoMovimento (ENTRADA|SAIDA), categoriaCodigo (até 30 caracteres) e valorOrcado maior que zero." } };
        return;
      }
      const chave = `${v.tipoMovimento}|${v.categoriaCodigo}`;
      if (vistas.has(chave)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Há categoria repetida nas linhas." } };
        return;
      }
      vistas.add(chave);
      validas.push(v);
    }
    const existente = await pool.request().input("ano", sql.Int, ano).query(`SELECT OrcamentoId FROM OrcamentosAnuais WHERE Ano = @ano`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Já existe um orçamento cadastrado pra ${ano}.` } };
      return;
    }

    const criado = await pool.request().input("ano", sql.Int, ano).input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO OrcamentosAnuais (Ano, CriadoPor) OUTPUT INSERTED.OrcamentoId VALUES (@ano, @criadoPor)`);
    const orcamentoId = criado.recordset[0].OrcamentoId;

    for (const l of validas) {
      await pool.request().input("orcamentoId", sql.Int, orcamentoId).input("tipoMovimento", sql.NVarChar(10), l.tipoMovimento)
        .input("categoriaCodigo", sql.NVarChar(30), l.categoriaCodigo).input("valorOrcado", sql.Decimal(12, 2), l.valorOrcado)
        .query(`INSERT INTO OrcamentoLinhas (OrcamentoId, TipoMovimento, CategoriaCodigo, ValorOrcado) VALUES (@orcamentoId, @tipoMovimento, @categoriaCodigo, @valorOrcado)`);
    }

    await registrarAuditoria({
      tabela: "OrcamentosAnuais", registroId: orcamentoId, acao: "Criou orçamento anual", usuarioId: usuario.membroId,
      dadosDepois: { ano, totalLinhas: validas.length }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Orçamento de ${ano} criado.`, orcamentoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!idBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/orcamentos/{id}" } };
      return;
    }
    const id = auth.idDeRota(idBruto);
    const atual = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM OrcamentosAnuais WHERE OrcamentoId = @id`) : { recordset: [] };
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Orçamento não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { status, linhas } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    if (registro.Status !== "ABERTO" && Array.isArray(linhas) && linhas.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Orçamento encerrado — não é mais possível editar linhas." } };
      return;
    }
    // Linhas inválidas continuam sendo ignoradas (comportamento anterior); só as válidas e sem repetição entram.
    const validas = [];
    if (Array.isArray(linhas)) {
      const vistas = new Set();
      for (const l of linhas) {
        const v = linhaValida(l);
        if (!v) continue;
        const chave = `${v.tipoMovimento}|${v.categoriaCodigo}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        validas.push(v);
      }
    }
    if (status) {
      await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), status).query(`UPDATE OrcamentosAnuais SET Status = @status WHERE OrcamentoId = @id`);
    }
    for (const l of validas) {
      await pool.request().input("orcamentoId", sql.Int, id).input("tipoMovimento", sql.NVarChar(10), l.tipoMovimento)
        .input("categoriaCodigo", sql.NVarChar(30), l.categoriaCodigo).input("valorOrcado", sql.Decimal(12, 2), l.valorOrcado)
        .query(`MERGE OrcamentoLinhas AS destino
                USING (SELECT @orcamentoId AS OrcamentoId, @tipoMovimento AS TipoMovimento, @categoriaCodigo AS CategoriaCodigo) AS origem
                ON destino.OrcamentoId = origem.OrcamentoId AND destino.TipoMovimento = origem.TipoMovimento AND destino.CategoriaCodigo = origem.CategoriaCodigo
                WHEN MATCHED THEN UPDATE SET ValorOrcado = @valorOrcado
                WHEN NOT MATCHED THEN INSERT (OrcamentoId, TipoMovimento, CategoriaCodigo, ValorOrcado) VALUES (@orcamentoId, @tipoMovimento, @categoriaCodigo, @valorOrcado);`);
    }
    await registrarAuditoria({
      tabela: "OrcamentosAnuais", registroId: id, acao: "Atualizou orçamento anual", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { status, totalLinhas: validas.length }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Orçamento atualizado." } };
    return;
  }
};
