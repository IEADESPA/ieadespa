// shared/canais.js (v7.3 — Canais Oficiais e Comunicação)
//
// Regra pura, sem banco: o que é (e o que não é) canal oficial, quem administra, o relógio
// das 24 horas, a troca de senha na sucessão de liderança e a conformidade de cada canal.
// O banco e as decisões estão em shared/canaisDb.js; HTTP e permissão, em GestaoCanais.
//
// Base normativa:
//  - Estatuto Art. 12: canal oficial é SÓ o instituído em nome da IEADESPA (CNPJ, marca ou
//    estrutura institucional); conta, número ou perfil pessoal de diretor, obreiro ou
//    dirigente NUNCA é canal oficial. A Secretaria Geral mantém a relação vigente.
//  - Regimento Art. 160: grupos oficiais (§1º), transmissão e "Área Cega" (§2º), ética de
//    filmagem (§3º), segurança das redes (§4º), proteção de menores (§5º), grupos focados (§6º);
//    Art. 160-A: grupos satélites; Art. 157 §5º: blindagem digital (Lei 9.504/97).
//
// O sistema NUNCA guarda senha de rede social: guarda quem tem a custódia, quando foi a última
// troca e o que está pendente. (Regra do projeto: segredo só no fluxo cifrado.)
const crypto = require("crypto");
// v7.7 — identificador estrito (o mesmo da v5.x em diante): "0x10", "1e1", true e [5] NÃO são matrícula nem canal. Módulo puro, sem ciclo com este.
const { inteiroPositivo: inteiroPositivoEstrito } = require("./voluntariado");

const limpar = (v) => String(v == null ? "" : v).trim();

// ---------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------

// tipoIdent: como o identificador é escrito e validado. credencial: a conta tem senha/acesso
// que a Secretaria precisa custodiar (§4º, I). notifica: pode ser usado como "tentativa de
// contato" no Abandono Digital (Estatuto Art. 12 §2º) — contato individual, não grupo nem rede.
const PLATAFORMAS = {
  WHATSAPP: { rotulo: "WhatsApp (número institucional)", tipoIdent: "telefone", credencial: true, notifica: true, grupo: false, rede: false },
  WHATSAPP_GRUPO: { rotulo: "Grupo de WhatsApp", tipoIdent: "nome", credencial: false, notifica: false, grupo: true, rede: false },
  TELEGRAM: { rotulo: "Telegram (canal ou grupo)", tipoIdent: "handle", credencial: true, notifica: false, grupo: true, rede: true },
  INSTAGRAM: { rotulo: "Instagram", tipoIdent: "handle", credencial: true, notifica: false, grupo: false, rede: true },
  TIKTOK: { rotulo: "TikTok", tipoIdent: "handle", credencial: true, notifica: false, grupo: false, rede: true },
  FACEBOOK: { rotulo: "Facebook (página ou grupo)", tipoIdent: "url", dominios: ["facebook.com", "fb.com", "fb.watch"], credencial: true, notifica: false, grupo: true, rede: true },
  YOUTUBE: { rotulo: "YouTube", tipoIdent: "url", dominios: ["youtube.com", "youtu.be"], credencial: true, notifica: false, grupo: false, rede: true },
  EMAIL: { rotulo: "E-mail institucional", tipoIdent: "email", credencial: true, notifica: true, grupo: false, rede: false },
  TELEFONE: { rotulo: "Telefone institucional", tipoIdent: "telefone", credencial: false, notifica: true, grupo: false, rede: false },
  SITE: { rotulo: "Site", tipoIdent: "url", credencial: true, notifica: false, grupo: false, rede: false },
  SISTEMA: { rotulo: "Sistema / Meu Painel", tipoIdent: "livre", credencial: false, notifica: true, grupo: false, rede: false },
  OUTRO: { rotulo: "Outro canal", tipoIdent: "livre", credencial: true, notifica: false, grupo: true, rede: false }
};

const CATEGORIAS_CANAL = {
  INSTITUCIONAL: { rotulo: "Canal institucional", artigo: "Estatuto Art. 12" },
  GRUPO_OFICIAL: { rotulo: "Grupo oficial", artigo: "Regimento Art. 160, §1º" },
  GRUPO_FOCADO: { rotulo: "Grupo focado / satélite", artigo: "Regimento Art. 160, §6º e Art. 160-A" }
};

// Art. 160 §6º, I (a-d) e Art. 160-A (I = política e cidadania; II = classificados = bazar).
const TEMAS_FOCADOS = {
  CIDADANIA_POLITICA: { rotulo: "Cidadania e política", artigo: "§6º, I, a; Art. 160-A, I" },
  EMPREENDEDORISMO_BAZAR: { rotulo: "Empreendedorismo, bazar e classificados", artigo: "§6º, I, b; Art. 160-A, II" },
  TEOLOGICO_DEBATES: { rotulo: "Teológico e debates doutrinários", artigo: "§6º, I, c" },
  GERACIONAL: { rotulo: "Geracional (mocidade etc.)", artigo: "§6º, I, d" },
  OUTRO: { rotulo: "Outro tema", artigo: "§6º, I (rol exemplificativo)" }
};

const ESCOPOS = { CAMPO: "Todo o campo", AREA: "Uma Área", CONGREGACAO: "Uma congregação", DEPARTAMENTO: "Um departamento" };
const VINCULOS = { CNPJ: "Vinculado ao CNPJ da IEADESPA", MARCA: "Vinculado à marca da IEADESPA", ESTRUTURA: "Vinculado à estrutura institucional (sede, departamento, congregação)" };
const PAPEIS_ADMIN = { ADMINISTRADOR: "Administrador", OPERADOR: "Operador da conta" };

// Art. 160 §1º, II: "remover, no menor tempo possível" — o prazo duro do sistema é o das 24 horas.
const PRAZO_REMOCAO_HORAS = 24;
const HORA_MS = 3600000;

// Categorias de conteúdo irregular. gravidade ALTA também avisa a gestão na hora.
// tema: para onde orientar o membro (§6º, IV). advertir: o Art. 157 §5º, I manda advertir.
const CATEGORIAS_OCORRENCIA = {
  OFENSIVO: { rotulo: "Conteúdo ofensivo ou calúnia", artigo: "Art. 160, §1º, II", gravidade: "MEDIA", tema: null, advertir: true },
  PORNOGRAFICO: { rotulo: "Conteúdo pornográfico", artigo: "Art. 160, §1º, II", gravidade: "ALTA", tema: null, advertir: true },
  FAKE_NEWS: { rotulo: "Fake news, corrente ou teoria da conspiração", artigo: "Art. 160, §1º, III, a", gravidade: "MEDIA", tema: null, advertir: true },
  PROPAGANDA_POLITICA: { rotulo: "Propaganda política ou eleitoral", artigo: "Art. 157, §5º, I; Art. 160, §1º, II", gravidade: "ALTA", tema: "CIDADANIA_POLITICA", advertir: true },
  DEBATE_POLITICO: { rotulo: "Debate político-partidário ou ataque a autoridade eclesiástica", artigo: "Art. 160, §1º, III, c", gravidade: "MEDIA", tema: "CIDADANIA_POLITICA", advertir: false },
  PROPAGANDA_COMERCIAL: { rotulo: "Propaganda comercial particular sem autorização", artigo: "Art. 160, §1º, III, b", gravidade: "MEDIA", tema: "EMPREENDEDORISMO_BAZAR", advertir: false },
  EXPOSICAO_MENOR: { rotulo: "Exposição ou destaque indevido de criança ou adolescente", artigo: "Art. 160, §5º", gravidade: "ALTA", tema: null, advertir: true },
  FILMAGEM_INDEVIDA: { rotulo: "Vídeo ou live de manifestação espiritual alheia", artigo: "Art. 160, §3º, I", gravidade: "MEDIA", tema: null, advertir: true },
  NEUTRALIDADE_REDE: { rotulo: "Rede institucional seguiu, curtiu, compartilhou ou marcou perfil político", artigo: "Art. 157, §5º, II; Art. 160, §4º, II", gravidade: "ALTA", tema: null, advertir: false },
  OUTRO: { rotulo: "Outro conteúdo ilícito", artigo: "Art. 160, §1º, II", gravidade: "MEDIA", tema: null, advertir: false }
};

const STATUS_OCORRENCIA = {
  ABERTA: "Aberta — aguardando a remoção",
  REMOVIDA: "Removida",
  IMPROCEDENTE: "Improcedente — o conteúdo não é irregular"
};

const MOTIVOS_TROCA = {
  SUCESSAO_LIDERANCA: "Troca de liderança (Art. 160, §4º, I)",
  SAIDA_ADMINISTRADOR: "Saída de administrador ou operador",
  SUSPEITA_INVASAO: "Suspeita de invasão ou uso indevido",
  ROTINA: "Troca de rotina"
};

const AVISO_ATENCAO = "Grupo de Debate Livre/Focado. O conteúdo aqui postado reflete a opinião pessoal dos participantes e pode conter debates acalorados.";
const FRASE_REDIRECIONAMENTO = "Irmão, por favor, leve este assunto para o Grupo Focado específico. Aqui não é o local.";

// "Termo de Uso na Descrição" (Art. 160 §1º, III): resumo das regras que o grupo oficial deve exibir.
function modeloTermoDeUso() {
  return "Grupo oficial da IEADESPA — ferramenta de trabalho e comunhão, não é fórum de debate livre. "
    + "Proibido: correntes, fake news e teorias da conspiração; propaganda comercial particular sem autorização; "
    + "debates político-partidários ou ataques a autoridades eclesiásticas. "
    + "Os administradores removem conteúdo irregular e respondem pelo grupo. "
    + "Outros assuntos: use o grupo focado específico.";
}

// ---------------------------------------------------------------
// Termo de Dever de Moderação (versionado; o aceite guarda versão + hash do texto aceito)
// ---------------------------------------------------------------

const TERMO_VERSAO = 1;
const TERMO_ITENS = [
  "Reconheço que o canal que administro é ferramenta institucional de trabalho e comunhão — não é rede social privada nem fórum de debate livre (Regimento Art. 160, §1º).",
  "Tenho Poder de Polícia Administrativa sobre o canal e respondo solidariamente pelo conteúdo nele postado (Art. 160, §1º, I).",
  "Comprometo-me a remover, no menor tempo possível e em no máximo 24 horas após o aviso, conteúdo ofensivo, pornográfico, fake news, propaganda política ou calúnia, ciente de que a minha omissão torna a Igreja corresponsável pelo dano (Art. 160, §1º, II).",
  "Não permitirei correntes, propaganda comercial particular sem autorização, debates político-partidários nem ataques a autoridades eclesiásticas no grupo oficial; orientarei o membro a usar o grupo focado específico e advertirei quem postar propaganda política (Art. 160, §1º, III e §6º, IV; Art. 157, §5º, I).",
  "Manterei na descrição do grupo o resumo destas regras e, nos grupos focados, o Aviso de Atenção (Art. 160, §1º, III e §6º, II).",
  "Reconheço que as senhas e o acesso das contas oficiais pertencem à Secretaria Geral, não a mim, e as entregarei ou trocarei quando solicitado ou ao deixar a função (Art. 160, §4º, I).",
  "Na conta oficial não darei opinião pessoal: não curtirei, seguirei nem comentarei páginas de políticos ou partidos, não entrarei em discussões nos comentários e não postarei fotos pessoais (Art. 160, §4º, II; Art. 157, §5º, II).",
  "Protegerei a imagem de crianças e adolescentes: priorizarei fotos de conjunto e não promoverei entrevistas nem o destaque individual de uma criança (Art. 160, §5º).",
  "Respeitarei a privacidade dos fiéis, o direito de imagem e a LGPD no tratamento de imagens e dados (Art. 160, caput)."
];
const TERMO_TITULO = "Termo de Dever de Moderação — Canais Oficiais da IEADESPA";
const TERMO_HASH = crypto.createHash("sha256").update(JSON.stringify({ v: TERMO_VERSAO, t: TERMO_TITULO, i: TERMO_ITENS })).digest("hex");

function termoVigente() {
  return { versao: TERMO_VERSAO, titulo: TERMO_TITULO, itens: TERMO_ITENS.slice(), hash: TERMO_HASH };
}

// ---------------------------------------------------------------
// Identificador do canal (e a vedação do Art. 12)
// ---------------------------------------------------------------

function soDigitos(v) { return String(v == null ? "" : v).replace(/\D+/g, ""); }

// Telefone brasileiro: 10 ou 11 dígitos (com DDD) ou 12/13 com o 55. Normaliza SEMPRE com 55.
function normalizarTelefone(valor) {
  let d = soDigitos(valor);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!(d.length === 12 || d.length === 13) || !d.startsWith("55")) return null;
  const nacional = d.slice(2);
  if (nacional[0] === "0" || nacional[1] === "0") return null; // DDD inválido
  if (nacional.length === 11 && nacional[2] !== "9") return null; // celular começa com 9
  return d;
}

// Os 10 últimos dígitos (DDD + número, ignorando o 9 extra de celular antigo) identificam a linha.
function chaveDeTelefone(valor) {
  const n = normalizarTelefone(valor);
  if (!n) return null;
  const nacional = n.slice(2);
  return nacional.length === 11 ? nacional.slice(0, 2) + nacional.slice(3) : nacional;
}

function formatarTelefone(norm) {
  const n = String(norm || "").slice(2);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(norm || "");
}

const REGEX_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const REGEX_HANDLE = /^[a-z0-9._]{2,60}$/;
const CONVITE_GRUPO = /(chat\.whatsapp\.com|t\.me\/\+|t\.me\/joinchat)/i;

function hostDe(urlTexto) {
  try { return new URL(urlTexto).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

// Valida e normaliza o identificador conforme a plataforma. Devolve { ok, normalizado, exibicao, erro }.
function normalizarIdentificador(plataforma, valor) {
  const cfg = PLATAFORMAS[plataforma];
  if (!cfg) return { ok: false, erro: "Plataforma inválida." };
  const bruto = limpar(valor);
  if (!bruto) return { ok: false, erro: "Informe o identificador do canal (número, @perfil, endereço ou nome)." };
  switch (cfg.tipoIdent) {
    case "telefone": {
      const n = normalizarTelefone(bruto);
      if (!n) return { ok: false, erro: "Número inválido. Use o DDD e o número, por exemplo (94) 99999-0000." };
      return { ok: true, normalizado: n, exibicao: formatarTelefone(n) };
    }
    case "email": {
      const e = bruto.toLowerCase();
      if (e.length > 150 || !REGEX_EMAIL.test(e)) return { ok: false, erro: "E-mail inválido." };
      return { ok: true, normalizado: e, exibicao: e };
    }
    case "handle": {
      const h = bruto.replace(/^@/, "").toLowerCase();
      if (CONVITE_GRUPO.test(bruto)) return { ok: false, erro: "Não registre o link de convite: informe o @ do canal ou o nome do grupo." };
      if (!REGEX_HANDLE.test(h)) return { ok: false, erro: "Perfil inválido. Use só letras, números, ponto e sublinhado (ex.: @adseta.parauapebas)." };
      return { ok: true, normalizado: h, exibicao: "@" + h };
    }
    case "url": {
      if (!/^https:\/\//i.test(bruto)) return { ok: false, erro: "O endereço precisa começar com https://." };
      const host = hostDe(bruto);
      if (!host || bruto.length > 300) return { ok: false, erro: "Endereço inválido." };
      if (CONVITE_GRUPO.test(bruto)) return { ok: false, erro: "Não registre o link de convite do grupo." };
      if (cfg.dominios && !cfg.dominios.some(d => host === d || host.endsWith("." + d))) {
        return { ok: false, erro: `O endereço precisa ser de ${cfg.dominios.join(" ou ")}.` };
      }
      const u = new URL(bruto);
      const norm = `https://${host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
      return { ok: true, normalizado: norm.toLowerCase(), exibicao: norm };
    }
    case "nome": {
      if (CONVITE_GRUPO.test(bruto)) return { ok: false, erro: "Não registre o link de convite: informe o NOME do grupo. O link permite que qualquer pessoa entre." };
      if (bruto.length < 3 || bruto.length > 120) return { ok: false, erro: "O nome do grupo deve ter de 3 a 120 caracteres." };
      return { ok: true, normalizado: bruto.toLowerCase().replace(/\s+/g, " "), exibicao: bruto.replace(/\s+/g, " ") };
    }
    default: {
      if (bruto.length < 2 || bruto.length > 200) return { ok: false, erro: "O identificador deve ter de 2 a 200 caracteres." };
      return { ok: true, normalizado: bruto.toLowerCase().replace(/\s+/g, " "), exibicao: bruto.replace(/\s+/g, " ") };
    }
  }
}

// Endereço clicável do canal (site público e telas). Só devolve link para o que é seguro linkar.
function linkDoCanal(plataforma, normalizado) {
  const n = String(normalizado || "");
  if (!n) return null;
  switch (plataforma) {
    case "WHATSAPP": return `https://wa.me/${soDigitos(n)}`;
    case "TELEFONE": return `tel:+${soDigitos(n)}`;
    case "EMAIL": return `mailto:${n}`;
    case "INSTAGRAM": return `https://www.instagram.com/${n}/`;
    case "TIKTOK": return `https://www.tiktok.com/@${n}`;
    case "TELEGRAM": return `https://t.me/${n}`;
    case "FACEBOOK": case "YOUTUBE": case "SITE": return /^https:\/\//.test(n) ? n : null;
    default: return null;
  }
}

// Vedação do Art. 12: o identificador coincide com contato PESSOAL de algum membro?
// `contatos` = [{ membroId, telefone, email }] (já filtrados pelo banco quando possível).
function acharContatoPessoal(plataforma, normalizado, contatos) {
  const cfg = PLATAFORMAS[plataforma];
  if (!cfg || !Array.isArray(contatos)) return null;
  if (cfg.tipoIdent === "telefone") {
    const chave = chaveDeTelefone(normalizado);
    return contatos.find(c => c.telefone && chaveDeTelefone(c.telefone) === chave) || null;
  }
  if (cfg.tipoIdent === "email") {
    return contatos.find(c => c.email && String(c.email).trim().toLowerCase() === String(normalizado).toLowerCase()) || null;
  }
  return null;
}

// ---------------------------------------------------------------
// Validação do canal
// ---------------------------------------------------------------

function categoriaExigeGrupo(categoria) { return categoria === "GRUPO_OFICIAL" || categoria === "GRUPO_FOCADO"; }

// `dados` vem do corpo da requisição. Devolve { valido, mensagem, dados } com os campos já
// normalizados. A checagem contra contatos pessoais (precisa de banco) é feita fora.
function validarCanal(d, { criando = true } = {}) {
  const nome = limpar(d.nome);
  if (nome.length < 3 || nome.length > 150) return { valido: false, mensagem: "O nome do canal deve ter de 3 a 150 caracteres." };
  const plataforma = limpar(d.plataforma).toUpperCase();
  if (!PLATAFORMAS[plataforma]) return { valido: false, mensagem: "Escolha a plataforma do canal." };
  const categoria = limpar(d.categoria || "INSTITUCIONAL").toUpperCase();
  if (!CATEGORIAS_CANAL[categoria]) return { valido: false, mensagem: "Categoria inválida." };
  const cfg = PLATAFORMAS[plataforma];

  if (plataforma === "WHATSAPP_GRUPO" && !categoriaExigeGrupo(categoria)) {
    return { valido: false, mensagem: "Grupo de WhatsApp é registrado como Grupo oficial ou Grupo focado." };
  }
  if (categoriaExigeGrupo(categoria) && !cfg.grupo) {
    return { valido: false, mensagem: `${cfg.rotulo} não é um grupo: registre-o como canal institucional.` };
  }
  if (categoria === "INSTITUCIONAL" && plataforma === "WHATSAPP_GRUPO") {
    return { valido: false, mensagem: "Grupo de WhatsApp não é canal institucional." };
  }

  let temaFocado = null;
  if (categoria === "GRUPO_FOCADO") {
    temaFocado = limpar(d.temaFocado).toUpperCase();
    if (!TEMAS_FOCADOS[temaFocado]) return { valido: false, mensagem: "Informe o tema do grupo focado (Art. 160, §6º)." };
  }

  const ident = normalizarIdentificador(plataforma, d.identificador);
  if (!ident.ok) return { valido: false, mensagem: ident.erro };

  // Art. 12, caput: precisa estar em nome da instituição, com o vínculo declarado.
  const vinculo = limpar(d.vinculoInstitucional).toUpperCase();
  if (!VINCULOS[vinculo]) {
    return { valido: false, mensagem: "Informe o vínculo institucional da conta (CNPJ, marca ou estrutura da IEADESPA). Conta, número ou perfil pessoal de diretor, obreiro ou dirigente não pode ser canal oficial (Estatuto Art. 12)." };
  }
  if (d.declaracaoInstitucional !== true) {
    return { valido: false, mensagem: "Confirme que a conta ou o número está em nome da IEADESPA e NÃO é de titularidade pessoal (Estatuto Art. 12)." };
  }

  const escopo = limpar(d.escopo || "CAMPO").toUpperCase();
  if (!ESCOPOS[escopo]) return { valido: false, mensagem: "Escopo inválido." };
  const congregacaoId = d.congregacaoId ? Number(d.congregacaoId) : null;
  const areaId = d.areaId ? Number(d.areaId) : null;
  const departamentoId = d.departamentoId ? Number(d.departamentoId) : null;
  if (escopo === "CONGREGACAO" && !(Number.isInteger(congregacaoId) && congregacaoId > 0)) return { valido: false, mensagem: "Escolha a congregação do canal." };
  if (escopo === "AREA" && !(Number.isInteger(areaId) && areaId > 0)) return { valido: false, mensagem: "Escolha a Área do canal." };
  if (escopo === "DEPARTAMENTO" && !(Number.isInteger(departamentoId) && departamentoId > 0)) return { valido: false, mensagem: "Escolha o departamento do canal." };

  const descricao = limpar(d.descricao);
  if (descricao.length > 500) return { valido: false, mensagem: "A descrição aceita até 500 caracteres." };

  // v7.7 — responsável com acesso (pai, mãe ou tutor de um dos menores): matrícula estrita ou nula. Malformada é erro mesmo que o canal não inclua menores (o dado
  // veio errado); mas SÓ vale em canal que inclui menores: nos demais é guardada vazia. Que a matrícula é de membro ativo e adulto, quem confere é o banco.
  const incluiMenores = d.incluiMenores === true;
  // v7.7: o convite de um grupo com crianças e adolescentes não se divulga no site (o identificador e o link seriam públicos).
  if (incluiMenores && d.publicoNoSite === true) return { valido: false, mensagem: "Um canal que inclui crianças e adolescentes não pode ser divulgado no site: o convite de um grupo com menores não se publica. Desmarque \"público no site\"." };
  let responsavelAcessoMembroId = null;
  if (d.responsavelAcessoMembroId != null) {
    responsavelAcessoMembroId = inteiroPositivoEstrito(d.responsavelAcessoMembroId);
    if (!responsavelAcessoMembroId) return { valido: false, mensagem: "A matrícula do responsável com acesso precisa ser um número inteiro positivo (ou ficar em branco)." };
  }

  return {
    valido: true,
    dados: {
      nome, plataforma, categoria, temaFocado,
      identificador: ident.exibicao, identificadorNormalizado: ident.normalizado,
      vinculoInstitucional: vinculo,
      escopo,
      congregacaoId: escopo === "CONGREGACAO" ? congregacaoId : null,
      areaId: escopo === "AREA" ? areaId : null,
      departamentoId: escopo === "DEPARTAMENTO" ? departamentoId : null,
      incluiMenores,
      responsavelAcessoMembroId: incluiMenores ? responsavelAcessoMembroId : null,
      publicoNoSite: d.publicoNoSite === true,
      custodiaSecretaria: d.custodiaSecretaria === true,
      descricao: descricao || null
    }
  };
}

// O canal serve para registrar tentativa de contato do Abandono Digital?
// Canal legado (sem plataforma) segue valendo, para não quebrar o que já existe.
function contaParaAbandono(canal) {
  if (!canal || canal.ativo === false) return false;
  if (!canal.plataforma) return true;
  const cfg = PLATAFORMAS[canal.plataforma];
  return !!cfg && cfg.notifica && (canal.categoria || "INSTITUCIONAL") === "INSTITUCIONAL";
}

function exigeCustodia(canal) {
  const cfg = canal && PLATAFORMAS[canal.plataforma];
  return !!cfg && cfg.credencial;
}

// ---------------------------------------------------------------
// Escopo de quem gere
// ---------------------------------------------------------------

// escopoUsuario: "TODAS" | null | [nomes de congregação]. ctx = { congregacoes: Map(id → {nome, areaId}),
// congregacoesDaArea(areaId) → [ids] }. Canal do campo, de departamento ou de Área inteira exige o
// escopo global ou cobrir TODAS as congregações da Área.
function escopoCobreCanal(escopoUsuario, canal, ctx) {
  if (!escopoUsuario || escopoUsuario === "TODAS") return true;
  const nomes = new Set(escopoUsuario);
  const nomeDe = (id) => { const c = ctx && ctx.congregacoes && ctx.congregacoes.get(Number(id)); return c ? c.nome : null; };
  if (canal.escopo === "CONGREGACAO") { const n = nomeDe(canal.congregacaoId); return !!n && nomes.has(n); }
  if (canal.escopo === "AREA") {
    const ids = ctx && ctx.congregacoesDaArea ? ctx.congregacoesDaArea(Number(canal.areaId)) : [];
    return ids.length > 0 && ids.every(id => { const n = nomeDe(id); return !!n && nomes.has(n); });
  }
  return false;
}

// ---------------------------------------------------------------
// Regra das 24 Horas (Art. 160, §1º, II)
// ---------------------------------------------------------------

function prazoDaOcorrencia(relatadaEmMs) { return relatadaEmMs + PRAZO_REMOCAO_HORAS * HORA_MS; }

// Situação VIVA da ocorrência (o status gravado não envelhece sozinho).
function situacaoDaOcorrencia(oc, agoraMs) {
  const relatada = Number(oc.relatadaEmMs);
  const prazo = oc.prazoRemocaoEmMs != null ? Number(oc.prazoRemocaoEmMs) : prazoDaOcorrencia(relatada);
  if (oc.status === "REMOVIDA") {
    const removida = Number(oc.removidaEmMs);
    const dentro = removida <= prazo;
    return { fase: dentro ? "REMOVIDA_NO_PRAZO" : "REMOVIDA_FORA_DO_PRAZO", dentroDoPrazo: dentro, horasAteRemover: Math.max(0, (removida - relatada) / HORA_MS) };
  }
  if (oc.status === "IMPROCEDENTE") return { fase: "IMPROCEDENTE", dentroDoPrazo: null, horasAteRemover: null };
  const restanteMs = prazo - agoraMs;
  if (restanteMs < 0) return { fase: "VENCIDA", dentroDoPrazo: false, restanteMs, horasVencida: Math.abs(restanteMs) / HORA_MS, igrejaCorresponsavel: true };
  return { fase: restanteMs <= 6 * HORA_MS ? "URGENTE" : "NO_PRAZO", dentroDoPrazo: true, restanteMs, horasRestantes: restanteMs / HORA_MS };
}

function validarOcorrencia(d) {
  const categoria = limpar(d.categoria).toUpperCase();
  if (!CATEGORIAS_OCORRENCIA[categoria]) return { valido: false, mensagem: "Escolha o tipo de conteúdo irregular." };
  const descricao = limpar(d.descricao);
  if (descricao.length < 10 || descricao.length > 500) {
    return { valido: false, mensagem: "Descreva o conteúdo em 10 a 500 caracteres (o que foi postado e por quem). Não copie dados pessoais além do necessário." };
  }
  const linkEvidencia = limpar(d.linkEvidencia);
  if (linkEvidencia && (!/^https:\/\//i.test(linkEvidencia) || linkEvidencia.length > 500)) {
    return { valido: false, mensagem: "O link da evidência precisa começar com https:// (até 500 caracteres)." };
  }
  const canalId = Number(d.canalId);
  if (!Number.isInteger(canalId) || canalId <= 0) return { valido: false, mensagem: "Informe o canal onde o conteúdo foi postado." };
  return { valido: true, dados: { canalId, categoria, descricao, linkEvidencia: linkEvidencia || null } };
}

// Prova de remoção (o que a Igreja mostra se for cobrada): texto e/ou link. `removidaEm` opcional
// (ISO) quando o administrador removeu antes de registrar; nunca antes do aviso nem no futuro.
function validarRemocao(d, { relatadaEmMs, agoraMs }) {
  const prova = limpar(d.provaRemocao);
  const link = limpar(d.linkProva);
  if (prova.length < 10 || prova.length > 500) {
    return { valido: false, mensagem: "Descreva a remoção em 10 a 500 caracteres (o que foi removido, quando e como o membro foi orientado)." };
  }
  if (link && (!/^https:\/\//i.test(link) || link.length > 500)) return { valido: false, mensagem: "O link da prova precisa começar com https://." };
  let removidaEmMs = agoraMs;
  if (d.removidaEm) {
    const t = Date.parse(d.removidaEm);
    if (Number.isNaN(t)) return { valido: false, mensagem: "Data e hora da remoção inválidas." };
    if (t > agoraMs + 60000) return { valido: false, mensagem: "A remoção não pode estar no futuro." };
    if (t < relatadaEmMs) return { valido: false, mensagem: "A remoção não pode ser anterior ao aviso do conteúdo." };
    removidaEmMs = t;
  }
  return { valido: true, dados: { provaRemocao: prova, linkProva: link || null, removidaEmMs } };
}

// O que o administrador deve fazer, passo a passo (inclui a frase do Art. 160 §6º, IV).
function orientacaoDaOcorrencia(categoria) {
  const cat = CATEGORIAS_OCORRENCIA[categoria];
  if (!cat) return [];
  const passos = [`Remova o conteúdo do canal o quanto antes — o prazo é de ${PRAZO_REMOCAO_HORAS} horas (Art. 160, §1º, II).`];
  if (cat.tema) passos.push(`Oriente o membro com a frase: "${FRASE_REDIRECIONAMENTO}" (Art. 160, §6º, IV) e indique o grupo focado de ${TEMAS_FOCADOS[cat.tema].rotulo}.`);
  if (cat.advertir) passos.push("Advirta o membro e registre a advertência aqui (Art. 157, §5º, I).");
  if (cat.gravidade === "ALTA") passos.push("A Secretaria Geral foi avisada na hora; não apague a evidência antes de registrar a prova.");
  if (categoria === "EXPOSICAO_MENOR") passos.push("Se houver criança ou adolescente em risco, comunique de imediato a liderança pastoral e o responsável legal.");
  if (categoria === "NEUTRALIDADE_REDE") passos.push("Desfaça o gesto na conta (deixar de seguir, descurtir, remover a marcação) e registre a prova.");
  passos.push("Registre aqui a prova da remoção: o que foi removido, quando e como o membro foi orientado.");
  return passos;
}

// ---------------------------------------------------------------
// Conferência de conformidade do canal
// ---------------------------------------------------------------

// Itens que se aplicam a ESTE canal (cada um é uma obrigação do Regimento).
function itensDeConferencia(canal) {
  const itens = [];
  if (canal.categoria === "GRUPO_OFICIAL") itens.push({ codigo: "TERMO_DE_USO", texto: "A descrição do grupo traz o resumo das regras (Termo de Uso).", artigo: "Art. 160, §1º, III" });
  if (canal.categoria === "GRUPO_FOCADO") itens.push({ codigo: "AVISO_ATENCAO", texto: "A descrição do grupo traz o Aviso de Atenção (debate livre).", artigo: "Art. 160, §6º, II" });
  const cfg = PLATAFORMAS[canal.plataforma];
  if (cfg && cfg.rede && canal.categoria === "INSTITUCIONAL") {
    itens.push({ codigo: "NEUTRALIDADE", texto: "A conta não segue, curte, compartilha nem marca perfis de candidatos ou partidos.", artigo: "Art. 157, §5º, II; Art. 160, §4º, II" });
    itens.push({ codigo: "POSTURA", texto: "O operador não entra em discussões nos comentários nem posta fotos pessoais na conta.", artigo: "Art. 160, §4º, II" });
  }
  if (exigeCustodia(canal)) itens.push({ codigo: "CUSTODIA", texto: "A senha e o acesso continuam sob a custódia da Secretaria Geral.", artigo: "Art. 160, §4º, I" });
  if (canal.incluiMenores) {
    itens.push({ codigo: "PROTECAO_MENORES", texto: "Fotos e vídeos de crianças são de conjunto, sem destacar uma criança nem entrevistas.", artigo: "Art. 160, §5º" });
    // v7.7 — as duas travas do grupo com menores (o sistema também as cobra sozinho; aqui é a conferência de quem olha o grupo de verdade, com o celular na mão).
    itens.push({ codigo: "MENORES_DOIS_ADMINISTRADORES", texto: "O grupo tem pelo menos dois administradores adultos, ambos habilitados para servir com menores.", artigo: "Art. 160, §5º; Lei 14.811/2024" });
    itens.push({ codigo: "MENORES_RESPONSAVEL_NO_GRUPO", texto: "Um responsável (pai, mãe ou tutor) tem acesso ao grupo e pode ver o que é conversado.", artigo: "Art. 160, §5º; Lei 14.811/2024" });
  }
  return itens;
}

// itens: { CODIGO: true|false }. Só os aplicáveis contam; todos precisam estar respondidos.
function avaliarConferencia(canal, itens) {
  const aplicaveis = itensDeConferencia(canal);
  const respostas = itens && typeof itens === "object" ? itens : {};
  const faltando = aplicaveis.filter(i => typeof respostas[i.codigo] !== "boolean").map(i => i.codigo);
  if (faltando.length) return { valido: false, mensagem: "Responda todos os itens da conferência.", faltando };
  const irregulares = aplicaveis.filter(i => respostas[i.codigo] === false).map(i => i.codigo);
  return { valido: true, resultado: irregulares.length ? "IRREGULAR" : "CONFORME", irregulares, itens: Object.fromEntries(aplicaveis.map(i => [i.codigo, respostas[i.codigo]])) };
}

// ---------------------------------------------------------------
// Conformidade do canal (o que está pendente para ele estar regular)
// ---------------------------------------------------------------

// ---- v7.7: grupo com crianças e adolescentes (Lei 14.811/2024; Regimento Art. 160, §5º; política de comunicação com menores) ----
// Todo canal que inclui menores precisa de: (1) ao menos DOIS administradores/operadores adultos, ativos e com o Termo de Dever de Moderação aceito — um adulto só,
// sozinho com as crianças no grupo, é o risco que a regra existe para evitar; (2) todo administrador ativo habilitado para servir com menores (a habilitação é
// calculada pelo banco, na leitura: `aptoMenores`); (3) um responsável (pai, mãe ou tutor) com acesso, que seja membro ativo e adulto. Qualquer falha deixa o canal
// IRREGULAR (gravidade ALTA). Cada pendência traz `resumo`: a mesma coisa em uma frase curta, para entrar no meio do texto do aviso. A de habilitação NUNCA diz o
// motivo (pode ser pendência com a Diretoria): só que "não está habilitado para servir com menores".
const MENORES_ADMINISTRADORES_MINIMOS = 2;
const CODIGOS_PENDENCIA_MENORES = ["MENORES_SEM_SEGUNDO_ADULTO", "MENORES_ADMIN_SEM_HABILITACAO", "MENORES_SEM_RESPONSAVEL"];

function pendenciasDeMenores(canal, estado) {
  if (!canal || !canal.incluiMenores) return [];
  const e = estado || {};
  const adm = (e.administradores || []).filter(a => a.ativo !== false);
  const termoVersao = e.termoVersao || TERMO_VERSAO;
  // Só conta como "segundo adulto" quem o banco confirmou adulto (idade conhecida, 18 anos ou mais) E já aceitou o termo vigente: designado que ainda não aceitou não responde pelo grupo.
  const adultosComTermo = adm.filter(a => a.adulto === true && Number(a.termoVersaoAceita) === termoVersao);
  const pend = [];
  if (adultosComTermo.length < MENORES_ADMINISTRADORES_MINIMOS) {
    pend.push({
      codigo: "MENORES_SEM_SEGUNDO_ADULTO", gravidade: "ALTA",
      mensagem: `Grupo com crianças ou adolescentes precisa de pelo menos dois administradores adultos que já aceitaram o Termo de Dever de Moderação: ${adultosComTermo.length === 0 ? "hoje não há nenhum" : "hoje há só um"} (Art. 160, §5º).`,
      resumo: "há menos de dois administradores adultos com o Termo de Dever de Moderação aceito"
    });
  }
  // Falha FECHADO: quem o banco não confirmou apto (ou cujo estado nem veio) conta como não habilitado.
  const semHabilitacao = adm.filter(a => a.aptoMenores !== true).length;
  if (semHabilitacao > 0) {
    pend.push({
      codigo: "MENORES_ADMIN_SEM_HABILITACAO", gravidade: "ALTA",
      mensagem: `${semHabilitacao === 1 ? "Um administrador deste grupo não está habilitado" : `${semHabilitacao} administradores deste grupo não estão habilitados`} para servir com menores. Peça a regularização da habilitação ou troque o administrador.`,
      resumo: semHabilitacao === 1 ? "um administrador não está habilitado para servir com menores" : "há administradores que não estão habilitados para servir com menores"
    });
  }
  const indicado = canal.responsavelAcessoMembroId ? Number(canal.responsavelAcessoMembroId) : null;
  const r = e.responsavelAcesso;
  if (!indicado) {
    pend.push({
      codigo: "MENORES_SEM_RESPONSAVEL", gravidade: "ALTA",
      mensagem: "Falta indicar o responsável (pai, mãe ou tutor de um dos menores) que tem acesso a este grupo.",
      resumo: "falta indicar o responsável com acesso ao grupo"
    });
  } else if (!(r && Number(r.membroId) === indicado && r.ativo === true && r.adulto === true)) {
    pend.push({
      codigo: "MENORES_SEM_RESPONSAVEL", gravidade: "ALTA",
      mensagem: "O responsável com acesso indicado para este grupo não é mais membro ativo e adulto: indique outro.",
      resumo: "o responsável indicado não é mais membro ativo e adulto"
    });
  }
  return pend;
}

// estado = { administradores:[{papel, ativo, termoVersaoAceita, aptoMenores?, adulto?}], ultimaConferencia:{em:'ISO', resultado, itens} | null,
//            trocasAbertas:[{prazoEm:'YYYY-MM-DD'}], ocorrenciasVencidas:n, termoVersao,
//            responsavelAcesso?: { membroId, ativo, adulto } | null }
//   (aptoMenores, adulto e responsavelAcesso só vêm do banco para canal que inclui menores — v7.7; canal = { ..., incluiMenores, responsavelAcessoMembroId })
// opcoes = { hoje:'YYYY-MM-DD', conferenciaDias }
function conformidadeDoCanal(canal, estado, opcoes) {
  const hoje = opcoes.hoje;
  const pend = [];
  const adm = (estado.administradores || []).filter(a => a.ativo !== false);
  const termoVersao = estado.termoVersao || TERMO_VERSAO;
  const comTermo = adm.filter(a => Number(a.termoVersaoAceita) === termoVersao);

  if (!canal.identificador) pend.push({ codigo: "IDENTIFICADOR_PENDENTE", gravidade: "MEDIA", mensagem: "Falta registrar o identificador (número, @perfil, endereço) deste canal." });
  if (canal.ativo !== false) {
    const precisaAdministrador = canal.categoria !== "INSTITUCIONAL" || exigeCustodia(canal);
    if (precisaAdministrador && adm.length === 0) pend.push({ codigo: "SEM_ADMINISTRADOR", gravidade: "ALTA", mensagem: "Nenhum administrador designado: ninguém responde por este canal (Art. 160, §1º, I)." });
    else if (precisaAdministrador && comTermo.length === 0) pend.push({ codigo: "TERMO_PENDENTE", gravidade: "ALTA", mensagem: "Nenhum administrador aceitou o Termo de Dever de Moderação vigente." });
    else if (adm.length > comTermo.length) pend.push({ codigo: "TERMO_PENDENTE_PARCIAL", gravidade: "MEDIA", mensagem: `${adm.length - comTermo.length} administrador(es) ainda não aceitaram o termo vigente.` });
    if (exigeCustodia(canal) && !canal.custodiaSecretaria) pend.push({ codigo: "SEM_CUSTODIA", gravidade: "ALTA", mensagem: "A custódia da senha pela Secretaria Geral ainda não foi confirmada (Art. 160, §4º, I)." });
    pend.push(...pendenciasDeMenores(canal, estado));   // v7.7: grupo com menores (dois adultos habilitados e responsável com acesso)
    for (const t of estado.trocasAbertas || []) {
      const vencida = t.prazoEm && t.prazoEm < hoje;
      pend.push({ codigo: vencida ? "TROCA_VENCIDA" : "TROCA_PENDENTE", gravidade: vencida ? "ALTA" : "MEDIA", mensagem: vencida ? "Troca de senha/acesso com o prazo vencido." : "Há uma troca de senha/acesso pendente." });
    }
    if ((estado.ocorrenciasVencidas || 0) > 0) pend.push({ codigo: "OCORRENCIA_VENCIDA", gravidade: "ALTA", mensagem: `${estado.ocorrenciasVencidas} ocorrência(s) com o prazo de 24 horas vencido: a Igreja fica corresponsável.` });
    const conf = estado.ultimaConferencia;
    if (!conf) pend.push({ codigo: "SEM_CONFERENCIA", gravidade: "MEDIA", mensagem: "O canal nunca foi conferido." });
    else {
      if (conf.resultado === "IRREGULAR") pend.push({ codigo: "CONFERENCIA_IRREGULAR", gravidade: "ALTA", mensagem: "A última conferência apontou irregularidade: corrija e confira de novo." });
      const dias = diasEntreIso(String(conf.em).slice(0, 10), hoje);
      if (dias > (opcoes.conferenciaDias || 180)) pend.push({ codigo: "CONFERENCIA_VENCIDA", gravidade: "MEDIA", mensagem: `A última conferência foi há ${dias} dias.` });
    }
  }
  const situacao = pend.some(p => p.gravidade === "ALTA") ? "IRREGULAR" : pend.length ? "ATENCAO" : "REGULAR";
  return { situacao, pendencias: pend };
}

function diasEntreIso(a, b) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function somarDiasIso(iso, dias) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// Transmissão dos cultos e Área Cega (Art. 160, §2º) — por congregação
// ---------------------------------------------------------------

const AREA_CEGA_SITUACOES = {
  DEFINIDA: "Definida (últimas fileiras ou galeria lateral, sem filmagem)",
  ESTRUTURA_NAO_PERMITE: "A estrutura física não permite",
  PENDENTE: "Ainda não definida"
};

function validarTransmissao(d) {
  const congregacaoId = Number(d.congregacaoId);
  if (!Number.isInteger(congregacaoId) || congregacaoId <= 0) return { valido: false, mensagem: "Informe a congregação." };
  const transmite = d.transmite === true;
  if (!transmite) return { valido: true, dados: { congregacaoId, transmite: false, placaAvisoInstaladaEm: null, areaCegaSituacao: "PENDENTE", areaCegaDescricao: null } };
  const situacao = limpar(d.areaCegaSituacao || "PENDENTE").toUpperCase();
  if (!AREA_CEGA_SITUACOES[situacao]) return { valido: false, mensagem: "Situação da Área Cega inválida." };
  const placa = limpar(d.placaAvisoInstaladaEm);
  if (placa && !/^\d{4}-\d{2}-\d{2}$/.test(placa)) return { valido: false, mensagem: "Data da placa de aviso inválida." };
  const descricao = limpar(d.areaCegaDescricao);
  if (descricao.length > 300) return { valido: false, mensagem: "A descrição da Área Cega aceita até 300 caracteres." };
  if ((situacao === "DEFINIDA" || situacao === "ESTRUTURA_NAO_PERMITE") && descricao.length < 5) {
    return { valido: false, mensagem: situacao === "DEFINIDA" ? "Descreva onde fica a Área Cega (por exemplo, as duas últimas fileiras)." : "Explique por que a estrutura física não permite a Área Cega." };
  }
  return { valido: true, dados: { congregacaoId, transmite: true, placaAvisoInstaladaEm: placa || null, areaCegaSituacao: situacao, areaCegaDescricao: descricao || null } };
}

// Situação da congregação diante do Art. 160, §2º. `linha` = null quando nunca foi informado.
function avaliarTransmissao(linha) {
  if (!linha) return { situacao: "NAO_INFORMADA", pendencias: ["Ainda não foi informado se a congregação transmite os cultos."] };
  if (!linha.transmite) return { situacao: "NAO_SE_APLICA", pendencias: [] };
  const pendencias = [];
  if (!linha.placaAvisoInstaladaEm) pendencias.push("Falta a placa de aviso nos acessos: “Este local está sendo filmado e transmitido ao vivo” (consentimento tácito, §2º, I).");
  if (linha.areaCegaSituacao === "PENDENTE") pendencias.push("Falta definir a Área Cega (zona sem filmagem) ou justificar que a estrutura não permite (§2º, II).");
  return { situacao: pendencias.length ? "PENDENTE" : "CONFORME", pendencias };
}

// ---------------------------------------------------------------
// Sucessão de liderança → troca de senha (Art. 160, §4º, I)
// ---------------------------------------------------------------

// As assinaturas são listas de matrículas "12,40,77" (ordenadas). Só a SAÍDA de alguém obriga a troca;
// quem entra não tira o acesso de ninguém.
function compararSucessao(assinaturaAnterior, assinaturaAtual) {
  const lista = (s) => String(s || "").split(",").map(x => Number(x)).filter(n => Number.isInteger(n) && n > 0);
  const antes = new Set(lista(assinaturaAnterior));
  const agora = new Set(lista(assinaturaAtual));
  return {
    sairam: [...antes].filter(id => !agora.has(id)).sort((a, b) => a - b),
    entraram: [...agora].filter(id => !antes.has(id)).sort((a, b) => a - b)
  };
}

function assinaturaDeMatriculas(ids) {
  return [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).join(",");
}

// O que a pendência pede, conforme a plataforma (grupo não tem senha: tem administradores).
function acaoDaTroca(canal) {
  return exigeCustodia(canal) ? "Trocar a senha e os dispositivos conectados da conta" : "Rever os administradores do grupo e retirar o acesso de quem saiu";
}

module.exports = {
  PLATAFORMAS, CATEGORIAS_CANAL, TEMAS_FOCADOS, ESCOPOS, VINCULOS, PAPEIS_ADMIN, CATEGORIAS_OCORRENCIA,
  STATUS_OCORRENCIA, MOTIVOS_TROCA, AREA_CEGA_SITUACOES, PRAZO_REMOCAO_HORAS, HORA_MS,
  AVISO_ATENCAO, FRASE_REDIRECIONAMENTO, modeloTermoDeUso,
  TERMO_VERSAO, TERMO_HASH, termoVigente,
  normalizarTelefone, chaveDeTelefone, formatarTelefone, normalizarIdentificador, linkDoCanal, acharContatoPessoal,
  validarCanal, contaParaAbandono, exigeCustodia, categoriaExigeGrupo, escopoCobreCanal,
  prazoDaOcorrencia, situacaoDaOcorrencia, validarOcorrencia, validarRemocao, orientacaoDaOcorrencia,
  itensDeConferencia, avaliarConferencia, conformidadeDoCanal,
  MENORES_ADMINISTRADORES_MINIMOS, CODIGOS_PENDENCIA_MENORES, pendenciasDeMenores, inteiroPositivoEstrito,
  validarTransmissao, avaliarTransmissao,
  compararSucessao, assinaturaDeMatriculas, acaoDaTroca,
  diasEntreIso, somarDiasIso
};
