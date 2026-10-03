// shared/entradaFinanceira.js — validação de ENTRADA das rotas de finanças e patrimônio (grupo "finanças e patrimônio, parte 2").
// Antes, um valor, uma data ou um id malformado chegava ao driver do SQL Server e virava erro 500 (às vezes com a operação pela metade); aqui cada um é conferido
// antes de tocar no banco e a rota responde 400 (ou a mesma resposta de "não existe", no estilo da rota).

const MAX_DECIMAL_10_2 = 99999999.99;       // DECIMAL(10,2)
const MAX_DECIMAL_12_2 = 9999999999.99;     // DECIMAL(12,2)
const MB = 1024 * 1024;

// Número entre min e max (inclusive). Aceita número ou texto numérico simples ("1234.56"); qualquer outra coisa (vazio, booleano, "1e5", "0x10", NaN, Infinity,
// lista, objeto) é recusada → null. Devolve o Number.
function numeroEntre(valor, min, max) {
  if (typeof valor === "string") {
    if (!/^-?\d+(\.\d+)?$/.test(valor.trim())) return null;
  } else if (typeof valor !== "number") {
    return null;
  }
  const n = Number(valor);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Inteiro entre min e max (inclusive) → Number ou null.
function inteiroEntre(valor, min, max) {
  const n = numeroEntre(valor, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
}

// Data "AAAA-MM-DD" (aceita também o começo de um ISO completo) que exista no calendário → "AAAA-MM-DD"; senão null.
function dataIso(valor) {
  if (typeof valor !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// Texto não vazio (depois do trim) com no máximo `max` caracteres → o texto aparado; senão null.
function textoAte(valor, max) {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

// Texto opcional: ausente/vazio → "" (vale "sem valor"); preenchido demais ou de tipo errado → null (inválido).
function textoOpcionalAte(valor, max) {
  if (valor === undefined || valor === null || valor === "") return "";
  return textoAte(valor, max);
}

// Violação de chave única do SQL Server (2627/2601) e de chave estrangeira (547).
function violouChaveUnica(erro) { return !!erro && (erro.number === 2627 || erro.number === 2601); }
function violouChaveEstrangeira(erro) { return !!erro && erro.number === 547; }

// Linhas afetadas da última instrução (mssql devolve rowsAffected como lista).
function afetadas(resultado) {
  const r = resultado && resultado.rowsAffected;
  return Array.isArray(r) ? Number(r[0] || 0) : Number(r || 0);
}

// Assinatura de arquivo conferida contra o tipo declarado (recibos): o `mimeType` é texto livre do cliente, o conteúdo é o que decide.
function conteudoCombinaComTipo(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mimeType === "application/pdf") return buffer.slice(0, 4).toString("latin1") === "%PDF";
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return false;
}

module.exports = {
  MAX_DECIMAL_10_2, MAX_DECIMAL_12_2, MB,
  numeroEntre, inteiroEntre, dataIso, textoAte, textoOpcionalAte,
  violouChaveUnica, violouChaveEstrangeira, afetadas, conteudoCombinaComTipo
};
