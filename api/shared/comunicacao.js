// shared/comunicacao.js (v7.12 — Comunicação: consentimento por canal e categoria, modelos aprovados, envio por grupo) — a regra pura, sem banco.
//
// Decisões do responsável da Igreja (22/10/2026): sem WhatsApp e sem SMS nesta versão (pagos por mensagem) — os canais existem no banco e no catálogo, sem envio; e nenhum grupo
// escolhido pelo dízimo. O sininho do sistema não é canal externo: todo comunicado aparece lá. O consentimento é PEDIDO, não presumido: sem um "sim" registrado, o e-mail e o
// celular daquela categoria não recebem. A convocação oficial é obrigação estatutária: vai por todo canal que a pessoa tiver e nunca tem o link de saída.
const crypto = require("crypto");

const sha256 = (txt) => crypto.createHash("sha256").update(txt).digest("hex");

// ---------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------

const CATEGORIAS = {
  CONVOCACAO: { rotulo: "Convocação oficial", descricao: "Convocação de assembleias e reuniões do Estatuto. É obrigação da Igreja avisar: chega por todo canal que você tiver, mesmo sem marcar.", obrigatoria: true },
  EVENTOS: { rotulo: "Eventos", descricao: "Cultos especiais, congressos, inscrições e programações." },
  DEVOCIONAL: { rotulo: "Devocional", descricao: "Mensagens de edificação, leitura bíblica e oração." },
  FINANCEIRO: { rotulo: "Financeiro", descricao: "Prestação de contas e campanhas da Igreja (nunca o que você dá ou deixa de dar)." }
};
const CATEGORIAS_COM_CONSENTIMENTO = ["EVENTOS", "DEVOCIONAL", "FINANCEIRO"];
// "constructor" e "toString" existem em todo objeto: a conferência de código vindo de fora é sempre pela chave PRÓPRIA (revisão independente, 22/10/2026)
const proprio = (obj, chave) => typeof chave === "string" && Object.prototype.hasOwnProperty.call(obj, chave);
const ehCategoria = (c) => proprio(CATEGORIAS, c);
// Os canais externos com envio. WhatsApp e SMS ficam no banco para ligar depois (decisão de 22/10/2026), sem aparecer na tela.
const CANAIS = { EMAIL: "E-mail", PUSH: "Celular (aviso do aplicativo)" };
const CANAIS_PREVISTOS = ["WHATSAPP", "SMS"];
const ehCanal = (c) => proprio(CANAIS, c);

const SITUACOES = {
  PENDENTE: "na fila",
  ENVIANDO: "enviando",
  ACEITO: "entregue ao serviço",
  FALHOU: "falhou",
  SEM_CONSENTIMENTO: "sem consentimento",
  SEM_CONTATO: "sem e-mail no cadastro",
  SEM_APARELHO: "sem aparelho inscrito",
  CANCELADO: "cancelado"
};

// O texto exato que a pessoa lê ao marcar cada categoria. Mudar o texto = versão nova (o "sim" antigo continua valendo: a impressão digital guardada prova o texto da época).
const TEXTO_VERSAO = "2026-10-22";
function textoConsentimento(categoria) {
  if (!ehCategoria(categoria) || CATEGORIAS[categoria].obrigatoria) return null;
  const c = CATEGORIAS[categoria];
  return `Autorizo a Igreja Evangélica Assembleia de Deus (IEADESPA) a me enviar comunicados de "${c.rotulo}" (${c.descricao.replace(/\.$/, "")}) pelos canais que marquei, `
    + "a partir do e-mail e do aparelho do meu cadastro. Posso desmarcar quando quiser, aqui ou pelo link \"não quero mais receber\" de cada e-mail, sem custo e sem precisar explicar. "
    + "Os dados ficam só com a Igreja e não são vendidos nem cedidos (LGPD, arts. 7º, I, e 8º).";
}
const hashDoTexto = (categoria) => sha256(`${TEXTO_VERSAO}|${categoria}|${textoConsentimento(categoria)}`);
// A saída pelo link do e-mail também guarda o texto que a pessoa viu na página.
const TEXTO_SAIDA = "Não quero mais receber, por e-mail, comunicados desta categoria. A convocação oficial continua chegando, porque é obrigação do Estatuto.";
const HASH_SAIDA = sha256(`${TEXTO_VERSAO}|SAIDA|${TEXTO_SAIDA}`);

// ---------------------------------------------------------------
// Texto: caractere de controle ou invisível nunca entra (o mesmo critério do cuidado pastoral)
// ---------------------------------------------------------------

const INVISIVEL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­​-‏‪-‮⁠-⁤﻿]/;
const CAMPOS = ["primeiro_nome", "congregacao"];
const MAX_TITULO = 150, MAX_CORPO = 2000, MAX_NOME_GRUPO = 100;
const CHAVE_MODELO = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function validarTexto(v, { campo, max, min = 1 }) {
  if (typeof v !== "string") return { problema: `Escreva ${campo}.` };
  const t = v.replace(/\r\n/g, "\n").trim();
  if (t.length < min) return { problema: `Escreva ${campo}.` };
  if (t.length > max) return { problema: `${campo[0].toUpperCase()}${campo.slice(1)} pode ter até ${max} caracteres (tem ${t.length}).` };
  if (INVISIVEL.test(t)) return { problema: `${campo[0].toUpperCase()}${campo.slice(1)} tem um caractere invisível ou de controle: apague e escreva de novo.` };
  return { texto: t };
}

// Um modelo: categoria, título e texto, com só os campos que o sistema sabe preencher.
function validarModelo(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  if (!ehCategoria(d.categoria)) return { problema: "Escolha a categoria do comunicado." };
  const titulo = validarTexto(d.titulo, { campo: "o título", max: MAX_TITULO, min: 3 });
  if (titulo.problema) return titulo;
  if (/\n/.test(titulo.texto)) return { problema: "O título é uma linha só." };
  const corpo = validarTexto(d.corpo, { campo: "o texto", max: MAX_CORPO, min: 10 });
  if (corpo.problema) return corpo;
  for (const t of [titulo.texto, corpo.texto]) {
    const desconhecido = [...t.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]).find((n) => !CAMPOS.includes(n));
    if (desconhecido !== undefined) return { problema: `O campo {{${desconhecido}}} não existe. Use só {{primeiro_nome}} e {{congregacao}}.` };
    if (/\{\{|\}\}/.test(t.replace(/\{\{\s*(primeiro_nome|congregacao)\s*\}\}/g, ""))) return { problema: "Há chaves {{ }} soltas no texto: use só {{primeiro_nome}} e {{congregacao}}." };
  }
  let chave = null;
  if (d.chave != null && d.chave !== "") {
    if (typeof d.chave !== "string" || !CHAVE_MODELO.test(d.chave)) return { problema: "Código do modelo inválido." };
    chave = d.chave;
  }
  // os campos ficam sempre na forma {{nome}} (sem espaços): é assim que se guardam e se preenchem
  const canonico = (t) => t.replace(/\{\{\s*(primeiro_nome|congregacao)\s*\}\}/g, "{{$1}}");
  return { dados: { categoria: d.categoria, titulo: canonico(titulo.texto), corpo: canonico(corpo.texto), chave } };
}
// Um código legível a partir do título ("Convocação da AGO 2027" -> "convocacao-da-ago-2027"), para agrupar as versões.
function chaveDoTitulo(titulo) {
  const base = String(titulo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "");
  return (base.length >= 3 ? base : "comunicado") + "-" + crypto.randomBytes(3).toString("hex");
}

const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0] || "irmão(ã)";
// O texto que a pessoa recebe: os campos preenchidos; nada de HTML (o e-mail escapa tudo).
function preencher(texto, { nome, congregacao }) {
  // a troca é por função: um "$&" ou "$'" no nome ou na congregação é texto, não padrão de troca
  const n = primeiroNome(nome), c = String(congregacao || "sua congregação").trim();
  return String(texto).replace(/\{\{\s*primeiro_nome\s*\}\}/g, () => n).replace(/\{\{\s*congregacao\s*\}\}/g, () => c);
}
// O sininho guarda até 1.000 caracteres: o texto inteiro fica em Meu Painel → Comunicações.
const MAX_SININHO = 1000;
function textoDoSininho(corpo) {
  const t = String(corpo);
  if (t.length <= MAX_SININHO) return t;
  const aviso = "… (o texto inteiro está em Meu Painel → Comunicações)";
  return t.slice(0, MAX_SININHO - aviso.length) + aviso;
}

// ---------------------------------------------------------------
// Grupos: critérios vivos (a lista de pessoas é calculada no banco na hora)
// ---------------------------------------------------------------

const TERRITORIOS = ["TODAS", "CONGREGACAO", "AREA", "REGIAO"];
const MAX_IDS = 50, MAX_DIAS = 365;
const CRITERIOS = ["territorio", "cargos", "departamentos", "lideranca", "ebdProfessores", "formacaoVencendoDias", "habilitacaoVencendoDias", "assembleiaGeral"];
const inteiroPositivo = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647 ? v : null);

function listaDeIds(v, rotulo) {
  if (v == null) return { lista: [] };
  if (!Array.isArray(v) || v.length > MAX_IDS) return { problema: `${rotulo}: escolha até ${MAX_IDS}.` };
  const ids = v.map(inteiroPositivo);
  if (ids.some((x) => x === null)) return { problema: `${rotulo}: identificador inválido.` };
  return { lista: [...new Set(ids)].sort((a, b) => a - b) };
}
function dias(v, rotulo) {
  if (v == null || v === "") return { dias: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_DIAS) return { problema: `${rotulo}: de 0 a ${MAX_DIAS} dias.` };
  return { dias: v };
}
// Devolve { criterios } normalizado (sempre os mesmos campos, na mesma ordem: o JSON guardado é comparável) ou { problema }.
function validarCriterios(entrada) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { problema: "Monte o grupo." };
  const estranho = Object.keys(entrada).find((k) => !CRITERIOS.includes(k));
  if (estranho) return { problema: `Critério desconhecido: ${String(estranho).slice(0, 40)}.` };
  if (entrada.territorio != null && (typeof entrada.territorio !== "object" || Array.isArray(entrada.territorio))) return { problema: "Escolha o território." };
  const t = entrada.territorio || { tipo: "TODAS" };
  if (!TERRITORIOS.includes(t.tipo)) return { problema: "Escolha o território." };
  const ids = listaDeIds(t.ids, "Território");
  if (ids.problema) return ids;
  if (t.tipo === "TODAS" && ids.lista.length) return { problema: "\"Todas as congregações\" não leva lista." };
  if (t.tipo !== "TODAS" && !ids.lista.length) return { problema: "Escolha ao menos uma congregação, área ou região." };
  let cargos = [];
  if (entrada.cargos != null) {
    if (!Array.isArray(entrada.cargos) || entrada.cargos.length > 20 || entrada.cargos.some((c) => typeof c !== "string" || !/^[A-Z][A-Z_]{1,29}$/.test(c))) return { problema: "Cargo inválido." };
    cargos = [...new Set(entrada.cargos)].sort();
  }
  const deps = listaDeIds(entrada.departamentos, "Departamentos");
  if (deps.problema) return deps;
  for (const b of ["lideranca", "ebdProfessores", "assembleiaGeral"]) {
    if (entrada[b] != null && typeof entrada[b] !== "boolean") return { problema: "Marque sim ou não." };
  }
  const f = dias(entrada.formacaoVencendoDias, "Formação vencendo");
  if (f.problema) return f;
  const h = dias(entrada.habilitacaoVencendoDias, "Habilitação de voluntário vencendo");
  if (h.problema) return h;
  return { criterios: {
    territorio: { tipo: t.tipo, ids: ids.lista }, cargos, departamentos: deps.lista, lideranca: entrada.lideranca === true, ebdProfessores: entrada.ebdProfessores === true,
    formacaoVencendoDias: f.dias, habilitacaoVencendoDias: h.dias, assembleiaGeral: entrada.assembleiaGeral === true
  } };
}
// "Congregação Central · Diáconos · Professores de EBD": o grupo em português, para o relatório e a confirmação. `nomes` traz os rótulos que o banco conhece.
function descreverCriterios(c, nomes = {}) {
  const partes = [];
  const rot = (mapa, id) => (mapa && mapa[id]) || `#${id}`;
  const terr = { CONGREGACAO: ["Congregação", "Congregações"], AREA: ["Área", "Áreas"], REGIAO: ["Região", "Regiões"] }[c.territorio.tipo];
  partes.push(terr ? `${terr[c.territorio.ids.length > 1 ? 1 : 0]} ${c.territorio.ids.map((id) => rot(nomes.territorio, id)).join(", ")}` : "Todas as congregações");
  if (c.cargos.length) partes.push(c.cargos.map((s) => rot(nomes.cargos, s)).join(", "));
  if (c.departamentos.length) partes.push(`Departamento ${c.departamentos.map((id) => rot(nomes.departamentos, id)).join(", ")}`);
  if (c.lideranca) partes.push("Liderança ativa");
  if (c.ebdProfessores) partes.push("Professores de EBD");
  if (c.formacaoVencendoDias != null) partes.push(c.formacaoVencendoDias === 0 ? "Formação vencida" : `Formação vencida ou vencendo em ${c.formacaoVencendoDias} dias`);
  if (c.habilitacaoVencendoDias != null) partes.push(c.habilitacaoVencendoDias === 0 ? "Habilitação de voluntário vencida" : `Habilitação de voluntário vencida ou vencendo em ${c.habilitacaoVencendoDias} dias`);
  if (c.assembleiaGeral) partes.push("Com direito a voto na Assembleia Geral");
  return partes.join(" · ").slice(0, 500);
}

// ---------------------------------------------------------------
// O link "não quero mais receber" (sem login): assinado, por pessoa, categoria e envio
// ---------------------------------------------------------------

const VALIDADE_SAIDA_DIAS = 400;
function assinarSaida(segredo, { membroId, categoria, envioId, agora = Date.now() }) {
  const corpo = Buffer.from(JSON.stringify({ m: membroId, c: categoria, e: envioId, x: agora + VALIDADE_SAIDA_DIAS * 86400000 })).toString("base64url");
  const chave = crypto.createHmac("sha256", segredo).update("comunicacao-sair").digest();
  return `${corpo}.${crypto.createHmac("sha256", chave).update(corpo).digest("base64url")}`;
}
function lerSaida(segredo, token, agora = Date.now()) {
  if (typeof token !== "string" || token.length > 400) return null;
  const [corpo, assinatura, sobra] = token.split(".");
  if (!corpo || !assinatura || sobra !== undefined) return null;
  const chave = crypto.createHmac("sha256", segredo).update("comunicacao-sair").digest();
  const esperada = Buffer.from(crypto.createHmac("sha256", chave).update(corpo).digest("base64url"));
  const recebida = Buffer.from(assinatura);
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (!inteiroPositivo(p.m) || !inteiroPositivo(p.e) || !CATEGORIAS_COM_CONSENTIMENTO.includes(p.c) || typeof p.x !== "number" || agora > p.x) return null;
    return { membroId: p.m, categoria: p.c, envioId: p.e };
  } catch { return null; }
}

// ---------------------------------------------------------------
// O e-mail
// ---------------------------------------------------------------

const escaparHtml = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// { assunto, texto, html }: a convocação oficial diz por que chega a todos; as outras levam o link de saída.
function montarEmail({ titulo, corpo, categoria, linkSair }) {
  const c = CATEGORIAS[categoria];
  const rodape = c.obrigatoria
    ? "Você recebe esta convocação porque é membro da Igreja: avisar é obrigação do Estatuto, e ela chega a todos, mesmo a quem não quer outros comunicados."
    : `Você recebe "${c.rotulo}" porque marcou essa opção em Meu Painel. Não quer mais receber por e-mail? ${linkSair}`;
  const texto = `${corpo}\n\n—\n${rodape}`;
  const rodapeHtml = c.obrigatoria ? escaparHtml(rodape)
    : `Você recebe "${escaparHtml(c.rotulo)}" porque marcou essa opção em Meu Painel. <a href="${escaparHtml(linkSair)}">Não quero mais receber por e-mail</a>.`;
  const html = `<p>${escaparHtml(corpo).replace(/\n/g, "<br>")}</p><hr><p style="font-size:12px;color:#666">${rodapeHtml}</p>`;
  return { assunto: titulo, texto, html };
}

// A impressão digital do modelo que a pessoa leu: aprovar confere que o texto não mudou entre a leitura e a aprovação.
const hashDoModelo = (m) => sha256(`${m.categoria}|${m.titulo}|${m.corpo}`);

module.exports = {
  CATEGORIAS, CATEGORIAS_COM_CONSENTIMENTO, CANAIS, CANAIS_PREVISTOS, SITUACOES, TEXTO_VERSAO, TEXTO_SAIDA, HASH_SAIDA, MAX_TITULO, MAX_CORPO, MAX_NOME_GRUPO, MAX_SININHO,
  ehCategoria, ehCanal, hashDoModelo, textoConsentimento, hashDoTexto, validarTexto, validarModelo, chaveDoTitulo, primeiroNome, preencher, textoDoSininho,
  validarCriterios, descreverCriterios, assinarSaida, lerSaida, montarEmail, escaparHtml, sha256
};
