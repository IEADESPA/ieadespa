// shared/conciliação.js (v4.13)
// Conciliação bancária por importação de extrato (sem Open Finance pago):
// lê o extrato que o banco já entrega de graça (OFX/CSV) e cruza contra
// Entradas (LancamentosTesouraria) e Saídas (SaidasTesouraria), apontando
// só as divergências reais. Dinheiro vivo (espécie) não passa pelo banco —
// fica na trilha CAIXA_FISICO, conciliado contra o Fundo Fixo de Caixa.
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
    const pegar = (tag) => {
      const m = corpo.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };
    const dataRaw = pegar("DTPOSTED");
    const valorRaw = pegar("TRNAMT");
    if (!valorRaw) continue;
    const valor = Number(String(valorRaw).replace(",", "."));
    if (Number.isNaN(valor)) continue;
    linhas.push({
      data: dataRaw.slice(0, 10).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
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

// Casa por valor absoluto; entre candidatos do mesmo valor, escolhe o mais
// próximo em data. Retorna { batidas, soBanco, soSistema, totalExtrato, totalSistema }.
async function conciliarExtrato(pool, sql, extratoId, fonteId, mesReferencia) {
  const mesInicio = `${mesReferencia}-01`;
  const ultimoDia = new Date(Number(mesReferencia.slice(0, 4)), Number(mesReferencia.slice(5, 7)), 0).getDate();
  const mesFim = `${mesReferencia}-${String(ultimoDia).padStart(2, "0")}`;

  const linhasRes = await pool.request().input("extrato", sql.Int, extratoId)
    .query(`SELECT LinhaId AS linhaId, DataLancamento AS data, Valor AS valor, Historico AS historico FROM ExtratoLinhas WHERE ExtratoId = @extrato`);
  const extratoLinhas = linhasRes.recordset;

  const fonte = await pool.request().input("id", sql.Int, fonteId).query(`SELECT Tipo FROM FontesCaixa WHERE FonteId = @id`);
  const ehCaixaFisico = fonte.recordset[0] && fonte.recordset[0].Tipo === "CAIXA_FISICO";
  const formasBanco = ehCaixaFisico ? "'DINHEIRO'" : "'PIX','DEPOSITO'";

  const entradasRes = await pool.request().input("ini", sql.Date, mesInicio).input("fim", sql.Date, mesFim).query(`
    SELECT LancamentoId AS id, Valor AS valor, CONVERT(varchar(10), CriadoEm, 120) AS data, CONCAT('Entrada ', ISNULL(CAST(TermoNumero AS varchar), '')) AS referencia
    FROM LancamentosTesouraria WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'
      AND CAST(CriadoEm AS DATE) BETWEEN @ini AND @fim AND FormaPagamento IN (${formasBanco})
  `);
  const saidasRes = await pool.request().input("ini", sql.Date, mesInicio).input("fim", sql.Date, mesFim).query(`
    SELECT SaidaId AS id, Valor AS valor, CONVERT(varchar(10), PagoEm, 120) AS data, CONCAT('Saida ', ISNULL(Descricao, '')) AS referencia
    FROM SaidasTesouraria WHERE Status = 'PAGA' AND CAST(PagoEm AS DATE) BETWEEN @ini AND @fim
  `);

  const sistema = [
    ...entradasRes.recordset.map(e => ({ id: e.id, tipo: "ENTRADA", valor: round2(Number(e.valor)), data: e.data, referencia: e.referencia })),
    ...saidasRes.recordset.map(s => ({ id: s.id, tipo: "SAIDA", valor: round2(-Number(s.valor)), data: s.data, referencia: s.referencia }))
  ];

  const batidas = [];
  const soBanco = [];
  const usadosSistema = new Set();

  for (const linha of extratoLinhas) {
    const alvo = round2(Number(linha.valor));
    const candidatos = sistema
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !usadosSistema.has(i) && Math.abs(round2(s.valor) - Math.abs(alvo)) < 0.005);
    if (candidatos.length === 0) {
      soBanco.push({ linhaId: linha.linhaId, valor: alvo, data: linha.data, referencia: linha.historico || `Linha do extrato ${linha.linhaId}` });
      continue;
    }
    candidatos.sort((a, b) => diffDias(a.s.data, linha.data) - diffDias(b.s.data, linha.data));
    const escolhido = candidatos[0];
    usadosSistema.add(escolhido.i);
    batidas.push({ linhaId: linha.linhaId, sistemaId: escolhido.s.id, tipo: escolhido.s.tipo, valor: alvo });
  }

  const soSistema = sistema.map((s, i) => ({ s, i })).filter(({ i }) => !usadosSistema.has(i))
    .map(({ s }) => ({ tipo: s.tipo, id: s.id, valor: round2(s.valor), data: s.data, referencia: s.referencia }));

  return {
    batidas, soBanco, soSistema,
    totalExtrato: round2(extratoLinhas.reduce((a, l) => a + Number(l.valor), 0)),
    totalSistema: round2(sistema.reduce((a, s) => a + s.valor, 0))
  };
}

module.exports = { detectarTipo, parsearOfx, parsearCsv, parsearExtrato, conciliarExtrato, round2 };

