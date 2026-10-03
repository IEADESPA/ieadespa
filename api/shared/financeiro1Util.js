// shared/financeiro1Util.js — pequenos utilitários das rotas de finanças e patrimônio (grupo "parte 1"): validação de id de rota, número positivo, arquivo em base64 e
// máscara de dado bancário/CPF para a trilha de auditoria. Nada aqui toca banco.
//
// Máscara: a trilha de auditoria (AuditLog) é lida por quem tem "auditoria"/"protecaodedados" e guarda o JSON inteiro do registro. Dado bancário e CPF de fornecedor (inclusive
// o pastor prebendado, que é um fornecedor PF) não precisam ficar em texto aberto lá: guarda-se só o fim do valor ("***01"), o bastante para saber que mudou.
const auth = require("./auth");

const TAMANHO_MAXIMO_ARQUIVO_BYTES = 15 * 1024 * 1024;

function mascararValor(valor) {
  if (valor === null || valor === undefined || valor === "") return valor;
  const texto = String(valor);
  return texto.length <= 2 ? "***" : `***${texto.slice(-2)}`;
}

// Cópia rasa do objeto com os campos listados mascarados (compara o nome sem diferenciar maiúscula/minúscula: "CpfCnpj" e "cpfCnpj" são o mesmo campo).
function mascararCampos(objeto, campos) {
  if (!objeto || typeof objeto !== "object") return objeto;
  const alvo = new Set(campos.map(c => c.toLowerCase()));
  const copia = {};
  for (const [chave, valor] of Object.entries(objeto)) copia[chave] = alvo.has(chave.toLowerCase()) ? mascararValor(valor) : valor;
  return copia;
}

const CAMPOS_SENSIVEIS_FORNECEDOR = ["cpfCnpj", "agencia", "conta", "chavePix"];
function fornecedorParaAuditoria(registroOuCorpo) {
  return mascararCampos(registroOuCorpo, CAMPOS_SENSIVEIS_FORNECEDOR);
}

// O id da rota ({id?}): `tem` diz se veio algum; `id` é o número canônico (auth.idDeRota) ou null se veio malformado. Malformado deve receber a MESMA resposta de "não existe".
function idOpcional(bruto) {
  const tem = bruto !== undefined && bruto !== null && bruto !== "";
  return { tem, id: tem ? auth.idDeRota(bruto) : null };
}

// Número finito, maior que zero e até `maximo` (o limite do DECIMAL da coluna); senão null. Só aceita número ou texto em decimal simples ("1500.50") — nada de true, [5],
// objeto, nem "0x10" / "1e3" (que o Number() converteria em silêncio).
function numeroPositivo(valor, maximo) {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (typeof valor === "string" && !/^\d+(\.\d+)?$/.test(valor.trim())) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 && n <= maximo ? n : null;
}

// Arquivo em base64 → Buffer, ou null se não for texto, vier vazio ou passar do limite (decide pelo tamanho do texto ANTES de decodificar, para não alocar o que será recusado).
function decodificarArquivo(base64, maximoBytes = TAMANHO_MAXIMO_ARQUIVO_BYTES) {
  if (typeof base64 !== "string" || base64.length === 0) return null;
  if (base64.length > Math.ceil(maximoBytes / 3) * 4 + 4) return null;
  const buffer = Buffer.from(base64, "base64");
  return buffer.length === 0 || buffer.length > maximoBytes ? null : buffer;
}

module.exports = { TAMANHO_MAXIMO_ARQUIVO_BYTES, mascararValor, mascararCampos, fornecedorParaAuditoria, CAMPOS_SENSIVEIS_FORNECEDOR, idOpcional, numeroPositivo, decodificarArquivo };
