// shared/prestacoesContas.js (v4.16)
// Prazo fatal da prestação de contas mensal (Reg. Art. 120): dia 1º útil do
// mês seguinte ao de referência é a data nominal, com tolerância até o dia 5
// — mesmo espírito de cálculo "na leitura" usado em shared/repassesInstitucionais.js
// (função estaAtrasado): o dia de tolerância é o ÚLTIMO dia ainda dentro do
// prazo, então o atraso só conta a partir do dia seguinte (por isso o limite
// usa diasTolerancia + 1, comparado com <=).
const DIAS_TOLERANCIA_PRESTACAO_CONTAS = 5;

function estaEmAtraso(mesReferencia, hoje, diasTolerancia = DIAS_TOLERANCIA_PRESTACAO_CONTAS) {
  const [ano, mes] = String(mesReferencia).split("-").map(Number);
  const dataLimite = new Date(ano, mes, diasTolerancia + 1); // 00:00 do dia seguinte ao fim da tolerância, no mês SEGUINTE ao de referência
  return dataLimite <= hoje;
}

// Texto da Ata de Pendência (Reg. Art. 120, §3º, II) — gerada automaticamente
// quando o prazo (com tolerância) estoura sem prestação de contas completa.
// Não existe, hoje, um módulo/tabela genérico de "Atas" no sistema (as atas de
// reunião de outros módulos são apenas referências a arquivo já assinado fora
// do sistema, catalogadas em shared/storage.js::salvarDocumento — mesmo padrão
// reaproveitado aqui); o campo AtaPendenciaUrl já existe em PrestacoesContas
// desde a migração 062 especificamente para guardar essa URL.
function gerarTextoAtaPendencia({ congregacaoNome, mesReferencia, temAgua, temLuz }) {
  const faltantes = [];
  if (!temAgua) faltantes.push("comprovante de água");
  if (!temLuz) faltantes.push("comprovante de luz");
  const linhas = [
    "ATA DE PENDÊNCIA — PRESTAÇÃO DE CONTAS",
    "Gerada automaticamente pelo sistema (Reg. Art. 120, §3º, II).",
    "",
    `Congregação: ${congregacaoNome}`,
    `Mês de referência: ${mesReferencia}`,
    `Data de geração: ${new Date().toISOString()}`,
    `Documento(s) pendente(s): ${faltantes.length > 0 ? faltantes.join(", ") : "prestação de contas não registrada"}`,
    "",
    "Efeito: bloqueio automático de repasse até regularização (Reg. Art. 120, §3º, II)."
  ];
  return linhas.join("\n");
}

module.exports = { DIAS_TOLERANCIA_PRESTACAO_CONTAS, estaEmAtraso, gerarTextoAtaPendencia };
