// shared/preCadastro.js (FASE 10, v10.1b passo 4, 17/11/2026) — o PRÉ-CADASTRO e a FILA DE CADASTROS: as regras puras (sem banco; quem lê e grava é
// shared/preCadastroDb.js). Decisões do responsável (rodadas 9 e 10 da gestão de membros e as correções de 17/11/2026):
//  - só o ESSENCIAL para não duplicar: nome, CPF, e-mail (para criar a senha), telefone (opcional), nascimento, sexo e estado civil; pelo site, a congregação.
//    O DEPARTAMENTO não é pedido (sai da idade, do sexo e do estado civil);
//  - quem chega com o mínimo obrigatório completo e SEM pendência ENTRA SOZINHO (aceite automático, com a matrícula gerada); na fila fica só quem tem pendência;
//  - a pessoa entra como CONGREGADO (ainda não é membro: a membresia vem pelo batismo/recepção, como sempre);
//  - menor de 18 anos não entra sozinho: a secretaria confirma o consentimento do responsável (LGPD, art. 14) antes de aceitar.
const ficha = require("./fichaMembro");

const ORIGENS = new Set(["SITE", "LIDER", "SECRETARIA"]);
const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO", "UNIAO_ESTAVEL"];
const SEXOS = ["M", "F"];
const NOME_MAX = 200;
const EMAIL_MAX = 150;
const MOTIVO_MAX = 300;
// O texto do consentimento mostrado no formulário do site (a versão guardada com o pré-cadastro; mudou o texto, muda a versão).
const CONSENTIMENTO = { versao: "2026-11", base: "CONSENTIMENTO" };   // LGPD art. 11, I (dado sensível: filiação religiosa) — consentimento específico e destacado

// As pendências: o código fica no banco; o rótulo e quem resolve vão para a tela.
const PENDENCIAS = {
  FALTA_NOME: { rotulo: "Falta o nome completo", quem: "a secretaria local" },
  FALTA_CPF: { rotulo: "Falta o CPF", quem: "a secretaria local" },
  FALTA_EMAIL: { rotulo: "Falta o e-mail (é por onde a pessoa cria a senha)", quem: "a secretaria local" },
  FALTA_NASCIMENTO: { rotulo: "Falta a data de nascimento", quem: "a secretaria local" },
  FALTA_SEXO: { rotulo: "Falta o sexo", quem: "a secretaria local" },
  FALTA_ESTADO_CIVIL: { rotulo: "Falta o estado civil", quem: "a secretaria local" },
  FALTA_CONGREGACAO: { rotulo: "Falta a congregação", quem: "a Secretaria Geral" },
  MENOR_DE_IDADE: { rotulo: "Menor de 18 anos: confirmar o consentimento do responsável", quem: "a secretaria local" },
  POSSIVEL_REPETICAO: { rotulo: "Nome e nascimento parecidos com uma ficha que já existe: conferir se é a mesma pessoa", quem: "a secretaria local" },
  CPF_REPETIDO: { rotulo: "Este CPF já está numa ficha: corrigir junto com o cadastro mais antigo", quem: "a secretaria local ou a Secretaria Geral" },
  CPF_EM_OUTRO_PRECADASTRO: { rotulo: "Este CPF já está noutro pré-cadastro aberto: corrigir junto com o mais antigo", quem: "a secretaria local ou a Secretaria Geral" }
};

const MSG = {
  RECEBIDO: "Recebemos o seu cadastro. A secretaria da congregação vai conferir e falar com você.",
  QUEM_LANCA: "Pré-cadastro é feito pela secretaria, pelo professor da EBD ou pela liderança da congregação.",
  QUEM_RESOLVE: "Quem completa, aceita ou descarta é a secretaria da congregação (ou a Secretaria Geral). A área acompanha.",
  SO_GERAL_CONGREGACAO: "Só a Secretaria Geral muda a congregação de um pré-cadastro.",
  NAO_EXISTE: "Pré-cadastro não encontrado.",
  JA_RESOLVIDO: "Este pré-cadastro já foi resolvido (aceito ou descartado). Atualize a tela.",
  MUDOU: "Isto mudou enquanto você olhava. Atualize a tela.",
  MOTIVO_DESCARTE: "Diga o motivo do descarte.",
  CPF_FORA_DO_ESCOPO: "Este CPF já tem cadastro. O caso foi enviado à Secretaria Geral, que confere e corrige.",
  SEM_PENDENCIA_PARA_ACEITAR: "Ainda há pendências: complete antes de aceitar."
};

const textoOuNulo = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// O nome: espaços em excesso saem; 2 a 200 letras; sem < >.
function lerNome(v) {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return { ok: true, valor: null };
  if (typeof v !== "string") return { ok: false, mensagem: "Nome inválido." };
  const nome = v.replace(/\s+/g, " ").trim();
  if (nome.length < 2) return { ok: false, mensagem: "Informe o nome completo." };
  if (nome.length > NOME_MAX) return { ok: false, mensagem: `O nome passa de ${NOME_MAX} letras.` };
  if (/[<>]/.test(nome)) return { ok: false, mensagem: "O nome tem caracteres que não podem ser usados." };
  return { ok: true, valor: nome };
}
function lerEmail(v) {
  const t = textoOuNulo(v);
  if (v !== null && v !== undefined && typeof v !== "string") return { ok: false, mensagem: "E-mail inválido." };
  if (!t) return { ok: true, valor: null };
  const e = t.toLowerCase();
  if (e.length > EMAIL_MAX || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e)) return { ok: false, mensagem: "E-mail inválido: confira." };
  return { ok: true, valor: e };
}
function lerTelefone(v) {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return { ok: true, valor: null };
  if (typeof v !== "string" && typeof v !== "number") return { ok: false, mensagem: "Telefone inválido." };
  const d = String(v).replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return { ok: false, mensagem: "Telefone com DDD: 10 ou 11 números." };
  return { ok: true, valor: d };
}
// A data AAAA-MM-DD existe no calendário? (o 30/02 e o mês 13 não; o banco recusaria com erro)
const dataNoCalendario = (t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;
// A data (AAAA-MM-DD), que existe no calendário, entre 1900 e hoje.
function lerNascimento(v, hojeISO) {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return { ok: true, valor: null };
  const t = typeof v === "string" ? v.trim().slice(0, 10) : "";
  if (!dataNoCalendario(t)) return { ok: false, mensagem: "Data de nascimento inválida." };
  if (t < "1900-01-01" || t > hojeISO) return { ok: false, mensagem: "Data de nascimento fora do possível." };
  return { ok: true, valor: t };
}
function lerEscolha(v, lista, rotulo) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  if (typeof v !== "string" || !lista.includes(v.trim().toUpperCase())) return { ok: false, mensagem: `${rotulo} inválido.` };
  return { ok: true, valor: v.trim().toUpperCase() };
}
function lerInteiro(v) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n <= 0) return { ok: false, mensagem: "Congregação inválida." };
  return { ok: true, valor: n };
}

// Lê a entrada (do site, do líder ou da secretaria). `exigirTudo` (o site): os campos obrigatórios precisam vir. Só a FORMA é conferida aqui — nada do banco
// (por isso a resposta de erro nunca revela se alguém já tem cadastro). Devolve { ok, dados } ou { ok:false, mensagem }.
function lerEntrada(corpo, { exigirTudo = false, hojeISO } = {}) {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? corpo : {};
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  const nome = lerNome(c.nome); if (!nome.ok) return nome;
  const cpf = ficha.lerCpf(c.cpf); if (!cpf.ok) return { ok: false, mensagem: cpf.mensagem };
  const email = lerEmail(c.email); if (!email.ok) return email;
  const telefone = lerTelefone(c.telefone); if (!telefone.ok) return telefone;
  const nascimento = lerNascimento(c.dataNascimento, hoje); if (!nascimento.ok) return nascimento;
  const sexo = lerEscolha(c.sexo, SEXOS, "Sexo"); if (!sexo.ok) return sexo;
  const estadoCivil = lerEscolha(c.estadoCivil, ESTADOS_CIVIS, "Estado civil"); if (!estadoCivil.ok) return estadoCivil;
  const congregacaoId = lerInteiro(c.congregacaoId); if (!congregacaoId.ok) return congregacaoId;
  const dados = { nome: nome.valor, cpf: cpf.cpf, email: email.valor, telefone: telefone.valor, dataNascimento: nascimento.valor, sexo: sexo.valor,
    estadoCivil: estadoCivil.valor, congregacaoId: congregacaoId.valor };
  if (!dados.nome) return { ok: false, mensagem: "Informe o nome completo." };
  if (exigirTudo) {
    const falta = pendenciasDeCampo(dados);
    if (falta.length) return { ok: false, mensagem: `Preencha: ${falta.map((p) => PENDENCIAS[p].rotulo.replace(/^Falta (o |a )?/, "")).join(", ")}.` };
  }
  return { ok: true, dados };
}

// Os campos que faltam (as pendências de campo), na ordem do formulário.
function pendenciasDeCampo(d) {
  const p = [];
  if (!d.nome) p.push("FALTA_NOME");
  if (!d.cpf) p.push("FALTA_CPF");
  if (!d.email) p.push("FALTA_EMAIL");
  if (!d.dataNascimento) p.push("FALTA_NASCIMENTO");
  if (!d.sexo) p.push("FALTA_SEXO");
  if (!d.estadoCivil) p.push("FALTA_ESTADO_CIVIL");
  if (!d.congregacaoId) p.push("FALTA_CONGREGACAO");
  return p;
}
// A idade em anos completos numa data (AAAA-MM-DD).
function idadeEm(nascimentoISO, hojeISO) {
  if (!nascimentoISO) return null;
  const [a, m, d] = String(nascimentoISO).slice(0, 10).split("-").map(Number);
  const [ha, hm, hd] = String(hojeISO).slice(0, 10).split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
// As pendências que não dependem do banco: os campos e o menor de idade (sem o consentimento do responsável confirmado).
function pendenciasSemBanco(d, { hojeISO, responsavelConfirmado = false } = {}) {
  const p = pendenciasDeCampo(d);
  const idade = idadeEm(d.dataNascimento, hojeISO || new Date().toISOString().slice(0, 10));
  if (idade !== null && idade < 18 && !responsavelConfirmado) p.push("MENOR_DE_IDADE");
  return p;
}

// Para comparar nomes: sem acento, minúsculo, um espaço entre as palavras, sem "de/da/do/dos/das/e".
function normalizarNome(n) {
  return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((p) => p && !["de", "da", "do", "dos", "das", "e"].includes(p));
}
// Dois nomes "parecidos" (com o mesmo nascimento, é possível repetição): iguais, ou o mesmo primeiro e o mesmo último nome.
function nomesParecidos(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

const lerPendencias = (texto) => String(texto || "").split(",").map((s) => s.trim()).filter((s) => PENDENCIAS[s]);
const pendenciasComRotulo = (codigos) => codigos.map((c) => ({ codigo: c, ...PENDENCIAS[c] }));
function motivoLimpo(v) {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MOTIVO_MAX) : null;
}

module.exports = { ORIGENS, ESTADOS_CIVIS, SEXOS, CONSENTIMENTO, PENDENCIAS, MSG, lerEntrada, dataNoCalendario, pendenciasDeCampo, pendenciasSemBanco, idadeEm, normalizarNome,
  nomesParecidos, lerPendencias, pendenciasComRotulo, motivoLimpo };
