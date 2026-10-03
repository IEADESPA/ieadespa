// shared/financeiroSeguro.js — pequenas defesas comuns às rotas de dinheiro do grupo "finanças e patrimônio, parte 3"
// (prebenda, remessa bancária, rateio, prestação de contas, repasses, seguros). Nada aqui decide ESCOPO (isso é shared/escopoRotas.js):
// são conferências de formato e a trava que impede duas gerações simultâneas de pagar a mesma coisa duas vezes.
const auth = require("./auth");
const { sql } = require("./db");

const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

// Mês de referência na forma canônica AAAA-MM (mês 01 a 12). Qualquer outra grafia é recusada antes de chegar ao SQL.
const REGEX_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
function mesReferenciaValido(valor) {
  return typeof valor === "string" && REGEX_MES.test(valor);
}

// Data AAAA-MM-DD que existe no calendário (2026-02-30 não existe).
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
function dataIsoValida(valor) {
  if (typeof valor !== "string" || !REGEX_DATA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

// Só os dígitos (CPF/CNPJ com ou sem máscara viram a mesma coisa).
function soDigitos(valor) {
  return String(valor === undefined || valor === null ? "" : valor).replace(/\D/g, "");
}

// CPF para a trilha de auditoria: guarda só os 2 últimos dígitos.
function mascararCpf(cpf) {
  const d = soDigitos(cpf);
  return d ? `***.***.***-${d.slice(-2)}` : null;
}

// Id que veio no corpo/consulta/rota: ausente (undefined, null, "") → { presente: false }; presente → { presente: true, id } com id = número canônico ou null se malformado.
function idOpcional(bruto) {
  const presente = bruto !== undefined && bruto !== null && bruto !== "";
  return { presente, id: presente ? auth.idDeRota(bruto) : null };
}

// Arquivo em base64 → Buffer, ou { erro } se não for texto, vier vazio ou passar do limite (15 MB).
function lerBase64(base64) {
  if (typeof base64 !== "string" || base64.length === 0) return { erro: "Arquivo inválido." };
  // Antes de decodificar: 4 caracteres base64 = 3 bytes (evita alocar o que já passa do limite).
  if (Math.floor(base64.length / 4) * 3 > TAMANHO_MAXIMO_BYTES + 3) return { erro: "Arquivo maior que 15 MB." };
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) return { erro: "Arquivo vazio." };
  if (buffer.length > TAMANHO_MAXIMO_BYTES) return { erro: "Arquivo maior que 15 MB." };
  return { buffer };
}

// Trava de aplicação (sp_getapplock) DENTRO de uma transação: só uma geração por vez de cada rotina de dinheiro. `novaRequisicao` é () => new sql.Request(transaction).
// O resultado do sp_getapplock é conferido (negativo = não conseguiu a trava dentro da espera): sem isso, a espera esgotada seguiria como se tivesse travado.
async function obterTrava(novaRequisicao, recurso, esperaMs = 15000) {
  const r = await novaRequisicao()
    .input("recurso", sql.NVarChar(50), recurso)
    .input("espera", sql.Int, esperaMs)
    .query(`DECLARE @resultado INT;
            EXEC @resultado = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @espera;
            SELECT @resultado AS resultado`);
  const linha = r && r.recordset && r.recordset[0];
  return !!linha && Number(linha.resultado) >= 0;
}

module.exports = { TAMANHO_MAXIMO_BYTES, mesReferenciaValido, dataIsoValida, soDigitos, mascararCpf, idOpcional, lerBase64, obterTrava };
