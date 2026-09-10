// shared/cnab240.js (v4.7)
// Geração/leitura de arquivo de remessa bancária no layout estrutural do
// padrão FEBRABAN CNAB 240 (registros de 240 posições, largura fixa).
// IMPORTANTE: todo banco exige homologação prévia de um arquivo CNAB 240
// antes de aceitar remessas de verdade (cada banco tem particularidades
// de campo/versão) — isso aqui é o ponto de partida técnico correto
// (estrutura de registros, preenchimento dos campos essenciais: banco,
// valor, favorecido, número de documento pra casar o retorno), não um
// arquivo já homologado com um banco específico. Dados da instituição
// nunca hardcoded — vêm de DadosBancariosInstituicao (GestaoDadosBancariosInstituicao).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function num(valor, tamanho) {
  return String(valor || 0).replace(/\D/g, "").slice(-tamanho).padStart(tamanho, "0");
}
function alfa(valor, tamanho) {
  return String(valor || "").toUpperCase().slice(0, tamanho).padEnd(tamanho, " ");
}
function brancos(tamanho) {
  return "".padEnd(tamanho, " ");
}
function zeros(tamanho) {
  return "".padEnd(tamanho, "0");
}
function valorCentavos(valor, tamanho) {
  return num(Math.round(Number(valor) * 100), tamanho);
}

function linha240(partes) {
  const texto = partes.join("");
  if (texto.length !== 240) {
    throw new Error(`Registro CNAB 240 com tamanho inválido: ${texto.length} (esperado 240).`);
  }
  return texto;
}

function gerarHeaderArquivo(inst, numeroSequencial) {
  return linha240([
    num(inst.codigoBanco, 3), zeros(4), "0", brancos(9),
    inst.cnpj && inst.cnpj.replace(/\D/g, "").length > 11 ? "2" : "1", num(inst.cnpj, 14),
    alfa(inst.codigoConvenio, 20), num(inst.agencia, 5), alfa(inst.digitoAgencia, 1),
    num(inst.conta, 12), alfa(inst.digitoConta, 1), brancos(1), alfa(inst.razaoSocial, 30),
    alfa(inst.nomeBanco, 30), brancos(10), "1",
    `${String(new Date().getDate()).padStart(2, "0")}${String(new Date().getMonth() + 1).padStart(2, "0")}${new Date().getFullYear()}`,
    `${String(new Date().getHours()).padStart(2, "0")}${String(new Date().getMinutes()).padStart(2, "0")}${String(new Date().getSeconds()).padStart(2, "0")}`,
    num(numeroSequencial, 6), "081", num(0, 5), brancos(20), brancos(49)
  ]);
}

function gerarHeaderLote(inst) {
  return linha240([
    num(inst.codigoBanco, 3), zeros(4), "1", "C", "20", "01",
    inst.cnpj && inst.cnpj.replace(/\D/g, "").length > 11 ? "2" : "1", num(inst.cnpj, 14),
    alfa(inst.codigoConvenio, 20), num(inst.agencia, 5), alfa(inst.digitoAgencia, 1),
    num(inst.conta, 12), alfa(inst.digitoConta, 1), brancos(1), alfa(inst.razaoSocial, 30),
    alfa("PAGAMENTOS FORNECEDORES", 40), brancos(30), brancos(10),
    num(0, 8), brancos(15), brancos(39)
  ]);
}

function gerarSegmentoA(pagamento, numeroLote, numeroSequencialRegistro) {
  const dataVazia = "00000000";
  return linha240([
    num(pagamento.codigoBanco, 3), num(numeroLote, 4), "3", num(numeroSequencialRegistro, 5),
    "A", "000", "01", num(pagamento.bancoFavorecido, 3), num(pagamento.agenciaFavorecido, 5),
    alfa(pagamento.digitoAgenciaFavorecido, 1), num(pagamento.contaFavorecido, 12),
    alfa(pagamento.digitoContaFavorecido, 1), brancos(1), alfa(pagamento.nomeFavorecido, 30),
    num(pagamento.saidaId, 20), dataVazia, "BRL", zeros(15), valorCentavos(pagamento.valor, 15),
    brancos(20), num(pagamento.saidaId, 15), dataVazia, zeros(15), brancos(2), brancos(3), brancos(44)
  ]);
}

function gerarTrailerLote(quantidadeRegistros, valorTotal) {
  // 2 (header) + N segmentos A + 1 (trailer) — soma dos registros do lote.
  return linha240([
    "000", zeros(4), "5", brancos(9),
    num(quantidadeRegistros + 2, 6), valorCentavos(valorTotal, 18), zeros(18),
    brancos(181)
  ]);
}

function gerarTrailerArquivo(quantidadeRegistrosTotal) {
  return linha240([
    "000", "9999", "9", brancos(9), num(1, 6),
    num(quantidadeRegistrosTotal, 6), zeros(6), brancos(205)
  ]);
}

// Gera o arquivo completo — um único lote com todos os pagamentos
// (Saídas já aprovadas). `pagamentos` é [{ saidaId, valor, nomeFavorecido,
// bancoFavorecido, agenciaFavorecido, digitoAgenciaFavorecido,
// contaFavorecido, digitoContaFavorecido }].
function gerarArquivoCnab240(inst, pagamentos, numeroSequencial) {
  const linhas = [];
  linhas.push(gerarHeaderArquivo(inst, numeroSequencial));
  linhas.push(gerarHeaderLote(inst));
  pagamentos.forEach((p, i) => {
    linhas.push(gerarSegmentoA(Object.assign({ codigoBanco: inst.codigoBanco }, p), 1, i + 1));
  });
  const valorTotal = round2(pagamentos.reduce((soma, p) => soma + Number(p.valor), 0));
  linhas.push(gerarTrailerLote(pagamentos.length, valorTotal));
  linhas.push(gerarTrailerArquivo(linhas.length + 1));
  return linhas.join("\r\n") + "\r\n";
}

// Leitura do retorno — percorre os Segmentos A (tipo de registro = '3' e
// segmento = 'A') do arquivo devolvido pelo banco e extrai o número do
// documento (onde `gerarSegmentoA` grava o SaidaId, posições 73-92 —
// "Número do documento atribuído pela empresa") e o código de ocorrência
// (posições 231-232 no padrão FEBRABAN oficial: '00' = sem ocorrência/
// processado com sucesso; qualquer outro código é rejeição do banco).
// IMPORTANTE: o offset do número do documento é o usado por ESTE gerador
// — ao integrar de verdade com um banco, confirme na especificação/
// homologação dele se o retorno usa o mesmo offset (o padrão FEBRABAN
// oficial usa posições 38-57; ajuste a constante abaixo se o banco
// contratado devolver noutra posição).
const OFFSET_NUMERO_DOCUMENTO = 72; // 0-indexed — bate com gerarSegmentoA
function parsearRetornoCnab240(conteudo) {
  const linhas = conteudo.split(/\r?\n/).filter(l => l.length >= 240);
  const resultados = [];
  for (const linha of linhas) {
    const tipoRegistro = linha.charAt(7);
    const segmento = linha.charAt(13);
    if (tipoRegistro !== "3" || segmento !== "A") continue;
    const saidaId = parseInt(linha.substring(OFFSET_NUMERO_DOCUMENTO, OFFSET_NUMERO_DOCUMENTO + 20).trim(), 10);
    const codigoOcorrencia = linha.substring(230, 232).trim();
    if (!saidaId) continue;
    resultados.push({ saidaId, sucesso: codigoOcorrencia === "00" || codigoOcorrencia === "", codigoOcorrencia });
  }
  return resultados;
}

module.exports = { gerarArquivoCnab240, parsearRetornoCnab240 };
