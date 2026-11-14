// shared/fichaMembro.js (FASE 10, v10.1b, migração 174) — regras puras da ficha do membro: o CPF (conferido pelos dígitos, mascarado), a filiação e a escolaridade.
// Nenhuma consulta ao banco aqui. Decisões do responsável (13/11/2026): o CPF nunca sai inteiro em lista, busca, exportação ou PDF — só mascarado; inteiro, só
// para a Secretaria Geral (com a leitura registrada) e para a própria pessoa. Naturalidade e RG não entram.

// As escolaridades (uma lista só, usada pela API e pela tela). O código é o que fica no banco (CHECK da migração 174).
const ESCOLARIDADES = [
  { codigo: "FUNDAMENTAL_INCOMPLETO", rotulo: "Fundamental incompleto" },
  { codigo: "FUNDAMENTAL_COMPLETO", rotulo: "Fundamental completo" },
  { codigo: "MEDIO_INCOMPLETO", rotulo: "Médio incompleto" },
  { codigo: "MEDIO_COMPLETO", rotulo: "Médio completo" },
  { codigo: "SUPERIOR_INCOMPLETO", rotulo: "Superior incompleto" },
  { codigo: "SUPERIOR_COMPLETO", rotulo: "Superior completo" },
  { codigo: "POS_GRADUACAO", rotulo: "Pós-graduação" }
];
const CODIGOS_ESCOLARIDADE = new Set(ESCOLARIDADES.map((e) => e.codigo));
const escolaridadeValida = (codigo) => CODIGOS_ESCOLARIDADE.has(codigo);

// Só os dígitos de um texto ("123.456.789-09" -> "12345678909"); qualquer outro tipo vira "".
const soDigitos = (v) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "");

// O CPF de verdade: 11 dígitos, não todos iguais, e os dois dígitos verificadores batem.
function cpfValido(digitos) {
  if (typeof digitos !== "string" || !/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(digitos[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(digitos[9]) && dv(10) === Number(digitos[10]);
}

// Lê o CPF vindo da tela: vazio -> null (sem CPF); com algo -> confere. Nunca devolve o número na mensagem de erro.
function lerCpf(valor) {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) return { ok: true, cpf: null };
  if (typeof valor !== "string" && typeof valor !== "number") return { ok: false, mensagem: "CPF inválido: confira os números." };
  const d = soDigitos(valor);
  if (d.length !== 11) return { ok: false, mensagem: "O CPF tem 11 números: confira." };
  if (!cpfValido(d)) return { ok: false, mensagem: "Esse CPF não existe: confira os números." };
  return { ok: true, cpf: d };
}

// "12345678909" -> "***.456.789-**" (o mesmo desenho das telas aprovadas). Sem CPF -> null.
function mascararCpf(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

// A mesma máscara feita no próprio SQL, para o número inteiro nunca sair do banco numa lista (a coluna precisa ser CHAR(11) de dígitos — CHECK da migração 174).
const sqlCpfMascarado = (coluna) => `CASE WHEN ${coluna} IS NULL THEN NULL ELSE N'***.' + SUBSTRING(${coluna}, 4, 3) + N'.' + SUBSTRING(${coluna}, 7, 3) + N'-**' END`;

// O nome da mãe ou do pai: espaços em excesso saem; até 150 letras; vazio -> null.
function lerNomeFiliacao(valor, quem) {
  if (valor === null || valor === undefined) return { ok: true, nome: null };
  if (typeof valor !== "string") return { ok: false, mensagem: `Nome ${quem} inválido.` };
  const nome = valor.replace(/\s+/g, " ").trim();
  if (!nome) return { ok: true, nome: null };
  if (nome.length > 150) return { ok: false, mensagem: `O nome ${quem} passa de 150 letras.` };
  if (/[<>]/.test(nome)) return { ok: false, mensagem: `O nome ${quem} tem caracteres que não podem ser usados.` };
  return { ok: true, nome };
}

module.exports = { ESCOLARIDADES, escolaridadeValida, soDigitos, cpfValido, lerCpf, mascararCpf, sqlCpfMascarado, lerNomeFiliacao };
