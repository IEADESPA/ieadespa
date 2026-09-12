// shared/conciliação.js (v4.13, trilha CAIXA_FISICO corrigida na Trava de
// Revisão 4-A)
// Conciliação bancária por importação de extrato (sem Open Finance pago):
// lê o extrato que o banco já entrega de graça (OFX/CSV) e cruza contra
// Entradas (LancamentosTesouraria) e Saídas (SaidasTesouraria), apontando
// só as divergências reais. Dinheiro vivo (espécie) não passa pelo banco —
// fica na trilha CAIXA_FISICO, conciliada de verdade contra o Fundo Fixo de
// Caixa (FundoFixoMovimentos, v4.5) — não mais contra um "extrato" de caixa
// digitado à mão, que era o bug apontado pela auditoria.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function detectarTipo(conteudo) {
  const inicio = String(conteudo || "").slice(0, 500).toUpperCase();
  if (inicio.includes("<OFX") || inicio.includes("OFXHEADER")) return "OFX";
  return "CSV";
}

// OFX: extrai blocos <STMTTRN>...</STMTTRN>.
function parsearOfx(conteudo) {
  const linhas = [];
  const blocos = String(conteudo).split(/<STMTTRN>/i).slice(1);
  for (const bloco of blocos) {
    const fim = bloco.indexOf("</STMTTRN>");
    if (fim === -1) continue;
    const corpo = bloco.slice(0, fim);
    // Aceita tanto OFX 2.x/XML (tag fechada: <TAG>valor</TAG>) quanto o OFX 1.x/SGML
    // tradicional que a maioria dos bancos brasileiros exporta, onde tags de campo
    // (folha) não são fechadas — o valor vai até a próxima tag ou quebra de linha.
    const pegar = (tag) => {
      const m = corpo.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
      return m ? m[1].trim() : "";
    };
    const dataRaw = pegar("DTPOSTED");
    const valorRaw = pegar("TRNAMT");
    if (!valorRaw) continue;
    const valor = Number(String(valorRaw).replace(",", "."));
    if (Number.isNaN(valor)) continue;
    linhas.push({
      data: dataRaw.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      valor: round2(valor),
      historico: pegar("MEMO") || pegar("NAME") || "",
      identificador: pegar("FITID") || ""
    });
  }
  return linhas;
}

// CSV tolerante: aceita "data;historico;valor" (padrão brasileiro, vírgula
// como decimal) ou "data,historico,valor" (padrão com ponto decimal). O
// último token numérico é o valor; o restante (menos a data) é o histórico.
function parsearCsv(conteudo) {
  const linhas = [];
  const registros = String(conteudo).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const linha of registros) {
    if (/data|descri|histórico|valor|lançamento|débito|crédito/i.test(linha)) continue;
    const sep = linha.includes(";") ? ";" : ",";
    const partes = linha.split(sep).map(p => p.trim()).filter(Boolean);
    if (partes.length < 2) continue;

    let data = "";
    let idxData = -1;
    let idxValor = -1;
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i];
      if (/^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(p) && idxData === -1) { data = p; idxData = i; continue; }
      const num = Number(String(p).replace(/[^\d,.\-]/g, "").replace(",", "."));
      if (!Number.isNaN(num)) idxValor = i;
    }
    if (idxValor === -1) continue;
    const valor = round2(Number(partes[idxValor].replace(/[^\d,.\-]/g, "").replace(",", ".")));
    const historico = partes.filter((p, i) => i !== idxData && i !== idxValor).join(" ");
    data = data.includes("/") ? data.split("/").reverse().join("-") : data;
    linhas.push({ data, valor, historico, identificador: "" });
  }
  return linhas;
}

function parsearExtrato(conteudo, tipo) {
  if (tipo === "OFX") return parsearOfx(conteudo);
  return parsearCsv(conteudo);
}

// ---- Motor de conciliação ----
function diffDias(a, b) {
  const da = a ? new Date(a) : new Date(0);
  const db = b ? new Date(b) : new Date(0);
  return Math.abs((da - db) / (1000 * 60 * 60 * 24));
}

function periodoMes(mesReferencia) {
  const mesInicio = `${mesReferencia}-01`;
  const ultimoDia = new Date(Number(mesReferencia.slice(0, 4)), Number(mesReferencia.slice(5, 7)), 0).getDate();
  const mesFim = `${mesReferencia}-${String(ultimoDia).padStart(2, "0")}`;
  return { mesInicio, mesFim };
}

// "Lado sistema" — Entradas confirmadas + (só na trilha CONTA_BANCARIA) Saídas
// pagas, no período. Reaproveitado pelas duas trilhas (Trava de Revisão
// anterior já corrigiu a exclusão de Saídas para CAIXA_FISICO — mantido aqui).
async function buscarLadoSistema(pool, sql, mesInicio, mesFim, ehCaixaFisico) {
  // FormaPagamento só existe como DINHEIRO | PIX | MISTO (nunca "DEPOSITO"). Em pagamento
  // MISTO, só a parte em ValorPix passa pelo banco — o restante (Valor - ValorPix) é
  // dinheiro vivo e vai pra trilha do caixa físico. Sem isso, todo lançamento MISTO
  // nunca conciliava em nenhuma das duas trilhas.
  const formasBanco = ehCaixaFisico ? "'DINHEIRO','MISTO'" : "'PIX','MISTO'";
  const valorBanco = ehCaixaFisico
    ? "CASE WHEN FormaPagamento = 'MISTO' THEN Valor - ISNULL(ValorPix, 0) ELSE Valor END"
    : "CASE WHEN FormaPagamento = 'MISTO' THEN ISNULL(ValorPix, 0) ELSE Valor END";

  const entradasRes = await pool.request().input("ini", sql.Date, mesInicio).input("fim", sql.Date, mesFim).query(`
    SELECT LancamentoId AS id, ${valorBanco} AS valor, CONVERT(varchar(10), CriadoEm, 120) AS data, CONCAT('Entrada ', ISNULL(CAST(TermoNumero AS varchar), '')) AS referencia
    FROM LancamentosTesouraria WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'
      AND CAST(CriadoEm AS DATE) BETWEEN @ini AND @fim AND FormaPagamento IN (${formasBanco})
  `);
  // Saída só é paga por transferência bancária ao fornecedor (dados bancários
  // confirmados são obrigatórios — ver GestaoSaidas) — não existe pagamento de
  // Saída em espécie. Por isso a trilha CAIXA_FISICO nunca deve trazer saídas
  // como candidato de "sistema": senão gera divergência falsa no cofre.
  const saidasRes = ehCaixaFisico
    ? { recordset: [] }
    : await pool.request().input("ini", sql.Date, mesInicio).input("fim", sql.Date, mesFim).query(`
        SELECT SaidaId AS id, Valor AS valor, CONVERT(varchar(10), PagoEm, 120) AS data, CONCAT('Saida ', ISNULL(Descricao, '')) AS referencia
        FROM SaidasTesouraria WHERE Status = 'PAGA' AND CAST(PagoEm AS DATE) BETWEEN @ini AND @fim
      `);

  return [
    ...entradasRes.recordset.map(e => ({ id: e.id, tipo: "ENTRADA", valor: round2(Number(e.valor)), data: e.data, referencia: e.referencia })),
    ...saidasRes.recordset.map(s => ({ id: s.id, tipo: "SAIDA", valor: round2(-Number(s.valor)), data: s.data, referencia: s.referencia }))
  ];
}

// Casa por valor absoluto; entre candidatos do mesmo valor, escolhe o mais
// próximo em data. `linhasExternas` é o lado "de fora do sistema" (linhas do
// extrato bancário OU movimentos do Fundo Fixo, a depender da trilha) — cada
// item precisa de { chave, data, valor, historico }. Retorna
// { batidas, soExterno, soSistema }.
function casarLancamentos(linhasExternas, sistema) {
  const batidas = [];
  const soExterno = [];
  const usadosSistema = new Set();

  for (const linha of linhasExternas) {
    const alvo = round2(Number(linha.valor));
    const candidatos = sistema
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !usadosSistema.has(i) && Math.abs(round2(s.valor) - Math.abs(alvo)) < 0.005);
    if (candidatos.length === 0) {
      soExterno.push({ chave: linha.chave, valor: alvo, data: linha.data, referencia: linha.historico || `Registro ${linha.chave}` });
      continue;
    }
    candidatos.sort((a, b) => diffDias(a.s.data, linha.data) - diffDias(b.s.data, linha.data));
    const escolhido = candidatos[0];
    usadosSistema.add(escolhido.i);
    batidas.push({ chave: linha.chave, sistemaId: escolhido.s.id, tipo: escolhido.s.tipo, valor: alvo });
  }

  const soSistema = sistema.map((s, i) => ({ s, i })).filter(({ i }) => !usadosSistema.has(i))
    .map(({ s }) => ({ tipo: s.tipo, id: s.id, valor: round2(s.valor), data: s.data, referencia: s.referencia }));

  return { batidas, soExterno, soSistema };
}

// Trilha CONTA_BANCARIA: extrato importado (OFX/CSV) x Entradas/Saídas do banco.
// Retorna { batidas, soBanco, soSistema, totalExtrato, totalSistema }.
async function conciliarExtrato(pool, sql, extratoId, fonteId, mesReferencia) {
  const { mesInicio, mesFim } = periodoMes(mesReferencia);

  const linhasRes = await pool.request().input("extrato", sql.Int, extratoId)
    .query(`SELECT LinhaId AS chave, DataLancamento AS data, Valor AS valor, Historico AS historico FROM ExtratoLinhas WHERE ExtratoId = @extrato`);
  const extratoLinhas = linhasRes.recordset;

  const sistema = await buscarLadoSistema(pool, sql, mesInicio, mesFim, false);
  const { batidas, soExterno, soSistema } = casarLancamentos(extratoLinhas, sistema);

  return {
    batidas,
    soBanco: soExterno.map(x => ({ linhaId: x.chave, valor: x.valor, data: x.data, referencia: x.referencia })),
    soSistema,
    totalExtrato: round2(extratoLinhas.reduce((a, l) => a + Number(l.valor), 0)),
    totalSistema: round2(sistema.reduce((a, s) => a + s.valor, 0))
  };
}

// Trilha CAIXA_FISICO: dinheiro vivo não passa por extrato bancário nenhum —
// o "lado banco" agora é o registro real e eletrônico do cofre
// (FundoFixoMovimentos, v4.5), não mais um extrato digitado à mão
// (Trava de Revisão 4-A). REPOSICAO entra no cofre (crédito, valor positivo);
// DESPESA sai do cofre (débito, valor negativo) — mesma convenção de sinal do
// ExtratoLinhas.Valor. Não há filtro por congregação: assim como o lado
// sistema (LancamentosTesouraria/SaidasTesouraria) já é tratado nesta função
// em nível nacional, os Fundos Fixos de todas as congregações entram juntos.
// Retorna { batidas, soFundo, soSistema, totalExtrato, totalSistema, totalRegistros }.
async function conciliarFundoFixo(pool, sql, fonteId, mesReferencia) {
  const { mesInicio, mesFim } = periodoMes(mesReferencia);

  const movRes = await pool.request().input("ini", sql.Date, mesInicio).input("fim", sql.Date, mesFim).query(`
    SELECT m.MovimentoId AS chave, CONVERT(varchar(10), m.CriadoEm, 120) AS data,
           CASE WHEN m.Tipo = 'REPOSICAO' THEN m.Valor ELSE -m.Valor END AS valor,
           CONCAT(m.Tipo, ' - ', m.Descricao) AS historico
    FROM FundoFixoMovimentos m
    JOIN FundosFixosCaixa f ON f.FundoId = m.FundoId
    WHERE CAST(m.CriadoEm AS DATE) BETWEEN @ini AND @fim
  `);
  const movimentos = movRes.recordset;

  const sistema = await buscarLadoSistema(pool, sql, mesInicio, mesFim, true);
  const { batidas, soExterno, soSistema } = casarLancamentos(movimentos, sistema);

  return {
    batidas,
    soFundo: soExterno.map(x => ({ movimentoFundoId: x.chave, valor: x.valor, data: x.data, referencia: x.referencia })),
    soSistema,
    totalExtrato: round2(movimentos.reduce((a, l) => a + Number(l.valor), 0)),
    totalSistema: round2(sistema.reduce((a, s) => a + s.valor, 0)),
    totalRegistros: movimentos.length
  };
}

module.exports = { detectarTipo, parsearOfx, parsearCsv, parsearExtrato, conciliarExtrato, conciliarFundoFixo, round2 };

